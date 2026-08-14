import crypto from 'crypto';
import { MenuItemKind, OrderStatus, PaymentMethod, Prisma, UserRole } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferAfterCommit, deferEmit, flushAfterCommit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { alertService } from './alert.service';
import { getPrisma } from '../lib/prisma';
import { menuRepo } from '../repositories/menu.repo';
import { orderLineRepo } from '../repositories/orderLine.repo';
import { orderRepo } from '../repositories/order.repo';
import { paymentRepo } from '../repositories/payment.repo';
import { tableRepo } from '../repositories/table.repo';
import { localDayRange } from '../lib/time';
import { auditService } from './audit.service';
import { billingService } from './billing.service';
import { debtService } from './debt.service';
import { printService } from './print.service';
import { stockService } from './stock.service';

type Tx = Prisma.TransactionClient;
type RequestingUser = {
  id: string;
  role: UserRole;
};

type OrderWithDetails = NonNullable<Awaited<ReturnType<typeof orderRepo.findByIdWithDetails>>>;

const ACTIVE_ORDER_STATUSES = [OrderStatus.DRAFT, OrderStatus.SENT] as const;

function decimalToInt(value: Prisma.Decimal | string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }
  if (typeof value === 'number') {
    return value;
  }
  return new Prisma.Decimal(value).toNumber();
}

/**
 * Maps a Prisma Order (with possible relations) to a DTO for the frontend.
 * Adds virtual fields: orderNumber, totalAmount.
 */
function mapToDto(order: any) {
  if (!order) return null;

  const totalSnapshot = order.totalSnapshot ? decimalToInt(order.totalSnapshot) : 0;

  // Calculate totalAmount for active orders that don't have a snapshot yet.
  // SERVICE lines are already part of order.lines, so summing all non-cancelled
  // lines correctly produces (food + xizmat haqi) — no setting lookup needed.
  let totalAmount = totalSnapshot;
  if (!order.totalSnapshot && order.lines) {
    totalAmount = order.lines
      .filter((l: any) => !l.isCanceled)
      .reduce((sum: number, l: any) => sum + decimalToInt(l.unitPriceSnapshot) * l.quantity, 0);
  }

  return {
    ...order,
    orderNumber: order.id.slice(-6).toUpperCase(),
    tableName: order.table?.name ?? null,
    totalAmount,
    subtotalSnapshot: order.subtotalSnapshot ? decimalToInt(order.subtotalSnapshot) : null,
    discountAmountSnapshot: order.discountAmountSnapshot ? decimalToInt(order.discountAmountSnapshot) : null,
    serviceChargeSnapshot: order.serviceChargeSnapshot ? decimalToInt(order.serviceChargeSnapshot) : null,
    totalSnapshot: order.totalSnapshot ? decimalToInt(order.totalSnapshot) : null,
    lines: order.lines?.map((l: any) => ({
      ...l,
      price: decimalToInt(l.unitPriceSnapshot),
      menuItemKind: l.menuItem?.kind ?? 'FOOD',
    })),
    debt: order.debt
      ? {
          id: order.debt.id,
          debtorName: order.debt.debtorName,
          originalAmount: decimalToInt(order.debt.originalAmount),
          remainingAmount: decimalToInt(order.debt.remainingAmount),
          status: order.debt.status,
        }
      : null,
  };
}

async function completeEmitContext<T>(fn: () => Promise<T>): Promise<T> {
  return withEmitContext(async () => {
    const result = await fn();
    await flushDeferredEmits();
    await flushAfterCommit();
    return result;
  });
}

function ensureWaiterOwns(order: { waiterId: string }, waiterId: string): void {
  if (order.waiterId !== waiterId) {
    throw Errors.Forbidden('Forbidden');
  }
}

function ensureReadable(order: { waiterId: string }, requestingUser: RequestingUser): void {
  if (requestingUser.role === UserRole.WAITER && order.waiterId !== requestingUser.id) {
    throw Errors.Forbidden('Forbidden');
  }
}

async function getOrderOrThrow(orderId: string, tx?: Tx): Promise<OrderWithDetails> {
  const order = await orderRepo.findByIdWithDetails(orderId, tx);
  if (!order) {
    throw Errors.NotFound('Order');
  }
  return order;
}

/**
 * Restore ingredient stock for a single line on cancel.
 *
 * Qoida: DRAFT yoki SENT buyurtmadagi qator bekor qilinsa, ingredientlar
 * omborga qaytariladi — DRAFT va SENT ikkalasida ham.
 */
async function maybeRestoreLineStock(
  line: OrderWithDetails['lines'][number],
  _order: { status: OrderStatus },
  actorUserId: string,
  tx: Tx,
) {
  if (line.isCanceled) return;
  if (!line.menuItemId) return;
  await stockService.restore(
    { id: line.id, menuItemId: line.menuItemId, actorUserId },
    line.quantity,
    tx,
  );
}

export const orderService = {
  async list(input: {
    requestingUser: RequestingUser;
    status?: OrderStatus;
    mine?: boolean;
    date?: Date;
  }) {
    let orders;
    if (input.requestingUser.role === UserRole.WAITER || input.mine) {
      orders = await orderRepo.listByWaiter(input.requestingUser.id);
    } else if (input.status) {
      orders = await orderRepo.listByStatus(input.status);
    } else if (input.date) {
      // Bucket by Tashkent calendar day, regardless of server TZ.
      const { start, end } = localDayRange(input.date);
      orders = await orderRepo.listByDateRange(start, end);
    } else {
      orders = await orderRepo.listActive();
    }

    return orders.map(mapToDto);
  },

  async createDraft(input: {
    waiterId: string;
    orderType: 'DINE_IN' | 'TAKEAWAY';
    tableId?: string | null;
  }) {
    if (input.orderType === 'DINE_IN' && !input.tableId) {
      throw Errors.Validation('DINE_IN orders require a table');
    }

    if (input.orderType === 'TAKEAWAY' && input.tableId) {
      throw Errors.Validation('TAKEAWAY orders cannot have a table');
    }

    if (input.tableId) {
      const table = await tableRepo.findById(input.tableId);
      if (!table || !table.isActive) {
        throw Errors.NotFound('Table');
      }
    }

    try {
      const order = await orderRepo.create({
        orderType: input.orderType,
        status: OrderStatus.DRAFT,
        waiter: {
          connect: { id: input.waiterId },
        },
        table: input.tableId
          ? {
              connect: { id: input.tableId },
            }
          : undefined,
      });
      return mapToDto(order);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.Conflict('Table already has an active order');
      }
      throw error;
    }
  },

  async getById(orderId: string, requestingUser: RequestingUser) {
    const order = await getOrderOrThrow(orderId);
    ensureReadable(order, requestingUser);
    return mapToDto(order);
  },

  async addLine(input: {
    orderId: string;
    requestingUser: RequestingUser;
    menuItemId: string;
    quantity: number;
    notes?: string;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureReadable(order, input.requestingUser);

      // Auth mirrors updateLineQuantity / cancelLine: waiter owns OR
      // admin/owner can edit any active order.
      const isWaiter = input.requestingUser.role === UserRole.WAITER;
      const isAdminish = input.requestingUser.role === UserRole.ADMIN
        || input.requestingUser.role === UserRole.OWNER;
      const waiterAllowed = isWaiter && order.waiterId === input.requestingUser.id;
      if (!waiterAllowed && !isAdminish) {
        throw Errors.Forbidden('Forbidden');
      }

      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, 'ADD_LINE');
      }

      const item = await menuRepo.findItemById(input.menuItemId);
      if (!item || !item.isActive) {
        throw Errors.NotFound('Menu item');
      }

      const isService = item.kind === MenuItemKind.SERVICE;
      const actorUserId = input.requestingUser.id;

      // 30s timeout: FIFO peel across many batches × many ingredients can
      // exceed the 5s default under SQLite (e.g. selling 10 portions of a
      // dish whose ingredient has 3 stacked batches). 30s is well under any
      // realistic user-facing latency cap; the txn either completes fast or
      // the consume code has a bug worth surfacing.
      return getPrisma().$transaction(async (tx) => {
        const existingMergeable = await tx.orderLine.findFirst({
          where: {
            orderId: input.orderId,
            menuItemId: input.menuItemId,
            isCanceled: false,
          },
        });

        const line = existingMergeable
          ? await orderLineRepo.updateQuantity(
              existingMergeable.id,
              existingMergeable.quantity + input.quantity,
              tx,
            )
          : await orderLineRepo.create(
              {
                order: { connect: { id: input.orderId } },
                menuItem: { connect: { id: input.menuItemId } },
                nameSnapshot: item.name,
                unitPriceSnapshot: item.price,
                quantity: input.quantity,
                notes: input.notes,
              },
              tx,
            );

        if (!isService) {
          await stockService.consume(
            { id: line.id, menuItemId: input.menuItemId, actorUserId },
            input.quantity,
            tx,
          );
        }

        deferEmit('admin', 'order:updated', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:updated', { orderId: order.id });

        return line;
      }, { timeout: 30_000 });
    });
  },

  async addCombo(input: {
    orderId: string;
    requestingUser: RequestingUser;
    comboId: string;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureReadable(order, input.requestingUser);

      const isWaiter = input.requestingUser.role === UserRole.WAITER;
      const isAdminish = input.requestingUser.role === UserRole.ADMIN
        || input.requestingUser.role === UserRole.OWNER;
      const waiterAllowed = isWaiter && order.waiterId === input.requestingUser.id;
      if (!waiterAllowed && !isAdminish) {
        throw Errors.Forbidden('Forbidden');
      }

      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, 'ADD_COMBO');
      }

      const combo = await menuRepo.findComboById(input.comboId);
      if (!combo || !combo.isActive) {
        throw Errors.NotFound('Combo');
      }

      const actorUserId = input.requestingUser.id;

      return getPrisma().$transaction(async (tx) => {
        const comboGroupId = crypto.randomUUID();
        const lines = [];
        for (const component of combo.components) {
          const line = await orderLineRepo.create({
            order: { connect: { id: input.orderId } },
            menuItem: { connect: { id: component.menuItemId } },
            comboGroupId: comboGroupId,
            comboNameSnapshot: combo.name,
            nameSnapshot: component.menuItem.name,
            unitPriceSnapshot: component.menuItem.price,
            quantity: component.quantity,
          }, tx);
          await stockService.consume(
            { id: line.id, menuItemId: component.menuItemId, actorUserId },
            component.quantity,
            tx,
          );
          lines.push(line);
        }

        deferEmit('admin', 'order:updated', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:updated', { orderId: order.id });

        return lines;
      }, { timeout: 30_000 });
    });
  },

  async updateLineQuantity(input: {
    orderId: string;
    requestingUser: RequestingUser;
    lineId: string;
    quantity: number;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureReadable(order, input.requestingUser);

      // Auth: waiter must own; admin/owner can edit any active order.
      // Mirrors cancelLine — admin needs full control over sent orders too.
      const isWaiter = input.requestingUser.role === UserRole.WAITER;
      const isAdminish = input.requestingUser.role === UserRole.ADMIN
        || input.requestingUser.role === UserRole.OWNER;
      const waiterAllowed = isWaiter && order.waiterId === input.requestingUser.id;
      if (!waiterAllowed && !isAdminish) {
        throw Errors.Forbidden('Forbidden');
      }

      const line = await orderLineRepo.findById(input.lineId);
      if (!line || line.orderId !== order.id || line.isCanceled) {
        throw Errors.NotFound('OrderLine');
      }
      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, 'UPDATE_QUANTITY');
      }
      if (input.quantity < 1) {
        throw Errors.Business('INVALID_QUANTITY', 'Quantity must be at least 1');
      }

      const delta = input.quantity - line.quantity;
      const actorUserId = input.requestingUser.id;

      return getPrisma().$transaction(async (tx) => {
        if (delta > 0 && line.menuItemId) {
          await stockService.consume(
            { id: line.id, menuItemId: line.menuItemId, actorUserId },
            delta,
            tx,
          );
        } else if (delta < 0 && line.menuItemId) {
          // Miqdor kamaytirilsa, kamaytirilgan ulush omborga qaytadi.
          // DRAFT va SENT ikkalasiga ham amal qiladi — maybeRestoreLineStock
          // bilan bir xil mantiq.
          await stockService.restore(
            { id: line.id, menuItemId: line.menuItemId, actorUserId },
            Math.abs(delta),
            tx,
          );
        }

        const updated = await orderLineRepo.updateQuantity(line.id, input.quantity, tx);

        deferEmit('admin', 'order:updated', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:updated', { orderId: order.id });

        return updated;
      }, { timeout: 30_000 });
    });
  },

  async editLineNote(input: {
    orderId: string;
    waiterId: string;
    lineId: string;
    notes: string;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureWaiterOwns(order, input.waiterId);

      const line = await orderLineRepo.findById(input.lineId);
      if (!line || line.orderId !== order.id) {
        throw Errors.NotFound('OrderLine');
      }

      // Notes can be edited any time before the order is closed or canceled.
      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, 'EDIT_NOTE');
      }

      const updatedLine = await orderLineRepo.updateNote(input.lineId, input.notes);

      deferEmit('admin', 'order:updated', { orderId: order.id });
      deferEmit(`waiter:${input.waiterId}`, 'order:updated', { orderId: order.id });

      return updatedLine;
    });
  },

  async cancelLine(input: {
    orderId: string;
    requestingUser: RequestingUser;
    lineId: string;
    reason?: string;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureReadable(order, input.requestingUser);

      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, 'CANCEL_LINE');
      }

      const line = order.lines.find((l) => l.id === input.lineId);
      if (!line) {
        throw Errors.NotFound('Order line');
      }

      // Role rules:
      //   WAITER       → DRAFT yoki SENT (faqat o'z buyurtmasi).
      //   ADMIN/OWNER  → DRAFT yoki SENT.
      // Bekor qilinganda ingredient omborga qaytariladi
      // (maybeRestoreLineStock — DRAFT va SENT ikkalasi uchun).
      const isWaiter = input.requestingUser.role === UserRole.WAITER;
      const isAdminish = input.requestingUser.role === UserRole.ADMIN
        || input.requestingUser.role === UserRole.OWNER;

      const waiterAllowed = isWaiter
        && order.waiterId === input.requestingUser.id;

      const adminAllowed = isAdminish;

      if (!waiterAllowed && !adminAllowed) {
        throw Errors.Forbidden('Forbidden');
      }

      return getPrisma().$transaction(async (tx) => {
        const updated = await orderLineRepo.cancel(input.lineId, input.reason ?? '', tx);
        await maybeRestoreLineStock(line, order, input.requestingUser.id, tx);

        deferEmit('admin', 'order:updated', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:updated', { orderId: order.id });

        return updated;
      });
    });
  },

  async send(input: { orderId: string; waiterId: string }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureWaiterOwns(order, input.waiterId);

        if (order.status === OrderStatus.SENT) {
          // Idempotent: already sent, return as-is.
          return mapToDto(order);
        }

        if (order.status !== OrderStatus.DRAFT) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.SENT);
        }

        const activeLines = order.lines.filter((line) => !line.isCanceled);
        if (activeLines.length === 0) {
          throw Errors.Validation('Order has no lines');
        }

        const updated = await orderRepo.setSent(order.id, new Date(), tx);
        if (!updated) {
          throw Errors.IllegalStateTransition(OrderStatus.DRAFT, OrderStatus.SENT);
        }

        deferEmit('admin', 'order:updated', { orderId: order.id });
        deferEmit(`waiter:${input.waiterId}`, 'order:updated', { orderId: order.id });

        return mapToDto(updated);
      });
    });
  },

  async transfer(input: {
    orderId: string;
    requestingUser: RequestingUser;
    newTableId: string;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureReadable(order, input.requestingUser);

      const waiterAllowed = input.requestingUser.role === UserRole.WAITER && order.waiterId === input.requestingUser.id;
      const adminAllowed = input.requestingUser.role === UserRole.ADMIN
        || input.requestingUser.role === UserRole.OWNER;
      if (!waiterAllowed && !adminAllowed) {
        throw Errors.Forbidden('Forbidden');
      }

      if (![...ACTIVE_ORDER_STATUSES].includes(order.status as typeof ACTIVE_ORDER_STATUSES[number])) {
        throw Errors.IllegalStateTransition(order.status, 'TRANSFER');
      }

      const newTable = await tableRepo.findById(input.newTableId);
      if (!newTable || !newTable.isActive) {
        throw Errors.NotFound('Table');
      }

      const existingOrderId = await tableRepo.findActiveOrderId(input.newTableId);
      if (existingOrderId && existingOrderId !== order.id) {
        throw Errors.Conflict('Table already has an active order');
      }

      try {
        return await getPrisma().$transaction(async (tx) => {
          const updated = await orderRepo.setTransfer(order.id, input.newTableId, tx);
          await auditService.log({
            userId: input.requestingUser.id,
            action: 'TABLE_TRANSFERRED',
            entityType: 'Order',
            entityId: order.id,
            metadata: {
              fromTableId: order.tableId,
              toTableId: input.newTableId,
            },
          }, tx);

          deferEmit('admin', 'order:transferred', {
            orderId: order.id,
            fromTableId: order.tableId,
            toTableId: input.newTableId,
          });
          deferEmit(`waiter:${order.waiterId}`, 'order:transferred', {
            orderId: order.id,
            fromTableId: order.tableId,
            toTableId: input.newTableId,
          });

          return mapToDto(updated);
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw Errors.Conflict('Table already has an active order');
        }
        throw error;
      }
    });
  },

  async cancelOrder(input: {
    orderId: string;
    requestingUser: RequestingUser;
    reason: string;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureReadable(order, input.requestingUser);

      const isWaiter = input.requestingUser.role === UserRole.WAITER;
      const isAdminish = input.requestingUser.role === UserRole.ADMIN
        || input.requestingUser.role === UserRole.OWNER;

      // Ofitsiantlar o'z DRAFT yoki SENT buyurtmalarini bekor qila oladi.
      // Ingredient ombori DRAFT va SENT ikkalasida ham qaytariladi
      // (maybeRestoreLineStock).
      const waiterAllowed = isWaiter
        && order.waiterId === input.requestingUser.id
        && (order.status === OrderStatus.DRAFT || order.status === OrderStatus.SENT);

      const adminAllowed = isAdminish
        && (order.status === OrderStatus.DRAFT || order.status === OrderStatus.SENT);

      if (!waiterAllowed && !adminAllowed) {
        throw Errors.Forbidden('Forbidden');
      }

      return getPrisma().$transaction(async (tx) => {
        const updated = await orderRepo.setCanceled(order.id, input.reason, tx);

        // Bekor qilish: DRAFT yoki SENT — barcha faol qatorlardagi ingredient
        // omborga qaytariladi.
        for (const line of order.lines) {
          await maybeRestoreLineStock(line, order, input.requestingUser.id, tx);
        }

        await auditService.log({
          userId: input.requestingUser.id,
          action: 'ORDER_CANCELED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            orderId: order.id,
            reason: input.reason,
            fromStatus: order.status,
          },
        }, tx);

        deferEmit('admin', 'order:canceled', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:canceled', { orderId: order.id });

        return mapToDto(updated);
      });
    });
  },

  /**
   * Combined "Tasdiqlash + To'lov" — the only path from SENT to CLOSED.
   *
   * Atomically: compute bill → validate payment sum → snapshot totals →
   * insert payments (and debt if any) → print bill (blocking) → set CLOSED →
   * audit ORDER_CONFIRMED → emit order:closed.
   *
   * If the bill print fails, the whole transaction rolls back; status stays SENT
   * so the admin can retry.
   */
  async confirm(input: {
    orderId: string;
    discountId?: string | null;
    // Direct ad-hoc discount amount in so'm, entered at confirm time.
    // Takes precedence over `discountId` when both are present.
    discountAmount?: number | null;
    waiveServiceCharge?: boolean;
    payments: Array<{ method: PaymentMethod; amount: number | string; reference?: string }>;
    requestingUser: RequestingUser;
    debt?: {
      debtorName: string;
      debtorPhone?: string;
      note?: string;
    };
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      if (order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, OrderStatus.CLOSED);
      }

      const debtPayment = input.payments.find((payment) => payment.method === PaymentMethod.DEBT);
      if (debtPayment && !input.debt?.debtorName?.trim()) {
        throw Errors.DebtMetadataRequired();
      }

      const totals = await billingService.computeTotals(order, {
        discountId: input.discountId ?? null,
        discountAmount: input.discountAmount ?? null,
        serviceChargeWaived: input.waiveServiceCharge ?? false,
      });

      const totalPaid = input.payments.reduce((sum, p) => sum + decimalToInt(p.amount), 0);
      const totalDue = totals.total.toNumber();
      if (totalPaid !== totalDue) {
        throw Errors.PaymentMismatch(`Paid ${totalPaid}, but order total is ${totalDue}`);
      }

      return getPrisma().$transaction(async (tx) => {
        const closedAt = new Date();

        await orderRepo.setApproval(
          order.id,
          input.requestingUser.id,
          input.discountId ?? null,
          input.waiveServiceCharge ?? false,
          tx,
        );
        await orderRepo.applyTotals(order.id, {
          subtotalSnapshot: totals.subtotal,
          discountAmountSnapshot: totals.discountAmount,
          serviceChargeSnapshot: totals.serviceCharge,
          totalSnapshot: totals.total,
        }, tx);

        await paymentRepo.createMany(order.id, input.payments, tx);

        if (debtPayment && input.debt) {
          await debtService.createFromClosedOrder({
            orderId: order.id,
            amount: debtPayment.amount,
            debtorName: input.debt.debtorName,
            debtorPhone: input.debt.debtorPhone,
            note: input.debt.note,
            actorUserId: input.requestingUser.id,
            openedAt: closedAt,
          }, tx);
        }

        // Print bill — blocking. If it throws, the transaction rolls back and
        // status stays SENT so the admin can retry. Pass `tx` so the PrintJob row
        // shares the open SQLite write lock instead of waiting on the default
        // client (which would deadlock).
        const freshOrder = await getOrderOrThrow(order.id, tx);
        await printService.printBill(freshOrder, tx);

        const updated = await orderRepo.setClosed(order.id, closedAt, tx);
        if (!updated) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.CLOSED);
        }

        await auditService.log({
          userId: input.requestingUser.id,
          action: 'ORDER_CONFIRMED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            orderId: order.id,
            discountId: input.discountId ?? null,
            discountAmount: input.discountAmount ?? null,
            waiveServiceCharge: input.waiveServiceCharge ?? false,
            total: totalDue,
            paymentMethods: input.payments.map((p) => p.method),
          },
        }, tx);

        deferEmit('admin', 'order:closed', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:closed', { orderId: order.id });

        // Owner alerts — fire only after this transaction (incl. the blocking
        // bill print) commits. A large discount and/or a nasiya sale are the
        // two confirm-time events worth pushing immediately.
        const orderNumber = order.id.slice(-6).toUpperCase();
        deferAfterCommit(() =>
          alertService.largeDiscount({
            orderNumber,
            discount: totals.discountAmount.toNumber(),
            total: totalDue,
            waiterName: order.waiter?.fullName ?? null,
          }),
        );
        if (debtPayment && input.debt) {
          const debtorName = input.debt.debtorName;
          const debtAmount = debtPayment.amount;
          deferAfterCommit(() =>
            alertService.debtSale({ orderNumber, debtorName, amount: debtAmount }),
          );
        }

        return mapToDto(updated);
      }, { timeout: 30_000, maxWait: 10_000 });
    });
  },

  async reprintBill(input: { orderId: string; requestingUserId: string; reason?: string }) {
    const order = await getOrderOrThrow(input.orderId);
    if (order.status !== OrderStatus.CLOSED) {
      throw Errors.IllegalStateTransition(order.status, 'REPRINT_BILL');
    }

    const job = await printService.reprintBill(order, input.requestingUserId);
    await auditService.log({
      userId: input.requestingUserId,
      action: 'RECEIPT_REPRINTED',
      entityType: 'Order',
      entityId: order.id,
      metadata: {
        orderId: order.id,
        reason: input.reason ?? null,
      },
    });
    return job;
  },
};

