import crypto from 'crypto';
import { MenuItemKind, OrderStatus, PaymentMethod, Prisma, UserRole } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushAfterCommit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { menuRepo } from '../repositories/menu.repo';
import { orderLineRepo } from '../repositories/orderLine.repo';
import { orderRepo } from '../repositories/order.repo';
import { paymentRepo } from '../repositories/payment.repo';
import { tableRepo } from '../repositories/table.repo';
import { auditService } from './audit.service';
import { billingService } from './billing.service';
import { debtService } from './debt.service';
import { printService } from './print.service';
import { consumptionService } from './consumption.service';

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
 * Restore ingredient stock for a single line.
 *
 * New lifecycle rule: stock is only restored when the order is still DRAFT.
 * Once the order is SENT, dishes are considered prepared and ingredients are
 * not restored on cancel (conservative rule).
 */
async function maybeRestoreLineStock(
  line: OrderWithDetails['lines'][number],
  order: { status: OrderStatus },
  actorUserId: string,
  tx: Tx,
) {
  if (line.isCanceled) return;
  if (order.status !== OrderStatus.DRAFT) return;
  if (!line.menuItemId) return;
  await consumptionService.restore(
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
      const from = new Date(input.date);
      from.setHours(0, 0, 0, 0);
      const to = new Date(input.date);
      to.setHours(23, 59, 59, 999);
      orders = await orderRepo.listByDateRange(from, to);
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
    waiterId: string;
    menuItemId: string;
    quantity: number;
    notes?: string;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureWaiterOwns(order, input.waiterId);

      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, 'ADD_LINE');
      }

      const item = await menuRepo.findItemById(input.menuItemId);
      if (!item || !item.isActive) {
        throw Errors.NotFound('Menu item');
      }

      const isService = item.kind === MenuItemKind.SERVICE;

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
          await consumptionService.consume(
            { id: line.id, menuItemId: input.menuItemId, actorUserId: input.waiterId },
            input.quantity,
            tx,
          );
        }

        deferEmit('admin', 'order:updated', { orderId: order.id });
        deferEmit(`waiter:${input.waiterId}`, 'order:updated', { orderId: order.id });

        return line;
      });
    });
  },

  async addCombo(input: {
    orderId: string;
    waiterId: string;
    comboId: string;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureWaiterOwns(order, input.waiterId);

      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, 'ADD_COMBO');
      }

      const combo = await menuRepo.findComboById(input.comboId);
      if (!combo || !combo.isActive) {
        throw Errors.NotFound('Combo');
      }

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
          await consumptionService.consume(
            { id: line.id, menuItemId: component.menuItemId, actorUserId: input.waiterId },
            component.quantity,
            tx,
          );
          lines.push(line);
        }

        deferEmit('admin', 'order:updated', { orderId: order.id });
        deferEmit(`waiter:${input.waiterId}`, 'order:updated', { orderId: order.id });

        return lines;
      });
    });
  },

  async updateLineQuantity(input: {
    orderId: string;
    waiterId: string;
    lineId: string;
    quantity: number;
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      ensureWaiterOwns(order, input.waiterId);

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

      return getPrisma().$transaction(async (tx) => {
        if (delta > 0 && line.menuItemId) {
          await consumptionService.consume(
            { id: line.id, menuItemId: line.menuItemId, actorUserId: input.waiterId },
            delta,
            tx,
          );
        } else if (delta < 0 && line.menuItemId && order.status === OrderStatus.DRAFT) {
          // Stock is only restored on decrement while still DRAFT. Once SENT,
          // dishes are considered prepared (matches maybeRestoreLineStock policy
          // on cancel) so we don't fabricate inventory.
          await consumptionService.restore(
            { id: line.id, menuItemId: line.menuItemId, actorUserId: input.waiterId },
            Math.abs(delta),
            tx,
          );
        }

        const updated = await orderLineRepo.updateQuantity(line.id, input.quantity, tx);

        deferEmit('admin', 'order:updated', { orderId: order.id });
        deferEmit(`waiter:${input.waiterId}`, 'order:updated', { orderId: order.id });

        return updated;
      });
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

      // Notes can be edited any time before the order is closed/walkout/canceled.
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
      //   WAITER  → DRAFT or SENT (must own the order). SENT line cancels
      //             don't restore stock (per existing maybeRestoreLineStock
      //             behavior) and are audited like any cancel.
      //   ADMIN/OWNER → DRAFT or SENT.
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

        const updated = await orderRepo.setStatus(order.id, OrderStatus.SENT, OrderStatus.DRAFT, tx);
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

      // Waiters can now cancel their own SENT orders too, not only DRAFT.
      // Stock is restored only on DRAFT cancels (existing maybeRestoreLineStock
      // behavior) so cancelling a SENT order doesn't fabricate inventory.
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

        // Stock restore: only DRAFT cancels return ingredients.
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
            waiveServiceCharge: input.waiveServiceCharge ?? false,
            total: totalDue,
            paymentMethods: input.payments.map((p) => p.method),
          },
        }, tx);

        deferEmit('admin', 'order:closed', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:closed', { orderId: order.id });

        return mapToDto(updated);
      }, { timeout: 30_000, maxWait: 10_000 });
    });
  },

  async markWalkout(input: { orderId: string; adminUserId: string; reason: string }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      if (order.status !== OrderStatus.SENT) {
        throw Errors.IllegalStateTransition(order.status, OrderStatus.WALKOUT);
      }

      return getPrisma().$transaction(async (tx) => {
        const updated = await orderRepo.setStatus(
          order.id,
          OrderStatus.WALKOUT,
          OrderStatus.SENT,
          tx,
        );

        if (!updated) {
          throw Errors.IllegalStateTransition(OrderStatus.SENT, OrderStatus.WALKOUT);
        }

        // Stock is NOT restored — the food was prepared/consumed.

        await auditService.log({
          userId: input.adminUserId,
          action: 'WALKOUT_MARKED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            orderId: order.id,
            amount: order.totalSnapshot?.toString() ?? '0',
            reason: input.reason,
          },
        }, tx);

        deferEmit('admin', 'order:walkout', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:walkout', { orderId: order.id });

        return mapToDto(updated);
      });
    });
  },

  async reprintBill(input: { orderId: string; requestingUserId: string; reason?: string }) {
    const order = await getOrderOrThrow(input.orderId);
    if (order.status !== OrderStatus.CLOSED && order.status !== OrderStatus.WALKOUT) {
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

