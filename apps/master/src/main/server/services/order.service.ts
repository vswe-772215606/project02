import crypto from 'crypto';
import { KitchenTicketStatus, OrderStatus, PaymentMethod, Prisma, UserRole } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferAfterCommit, deferEmit, flushAfterCommit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { kitchenRepo } from '../repositories/kitchen.repo';
import { menuRepo } from '../repositories/menu.repo';
import { orderLineRepo } from '../repositories/orderLine.repo';
import { orderRepo } from '../repositories/order.repo';
import { paymentRepo } from '../repositories/payment.repo';
import { tableRepo } from '../repositories/table.repo';
import { auditService } from './audit.service';
import { billingService } from './billing.service';
import { printService } from './print.service';
import { stockService } from './stock.service';

type Tx = Prisma.TransactionClient;
type RequestingUser = {
  id: string;
  role: UserRole;
};

type OrderWithDetails = NonNullable<Awaited<ReturnType<typeof orderRepo.findByIdWithDetails>>>;

const ACTIVE_ORDER_STATUSES = [
  OrderStatus.DRAFT,
  OrderStatus.SENT,
  OrderStatus.BILL_REQUESTED,
  OrderStatus.PENDING_PAYMENT,
] as const;

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

function canWaiterCancel(order: OrderWithDetails): boolean {
  return order.kitchenTickets.every((ticket) => ticket.status === KitchenTicketStatus.PENDING);
}

async function getOrderOrThrow(orderId: string, tx?: Tx): Promise<OrderWithDetails> {
  const order = await orderRepo.findByIdWithDetails(orderId, tx);
  if (!order) {
    throw Errors.NotFound('Order');
  }
  return order;
}

async function createAddonTicket(
  order: OrderWithDetails,
  waiterId: string,
  lineIds: string[],
  tx: Tx,
) {
  const ticket = await kitchenRepo.create({
    order: {
      connect: { id: order.id },
    },
  }, tx);

  await orderLineRepo.attachToTicket(lineIds, ticket.id, tx);

  deferEmit('kitchen', 'ticket:new', { ticketId: ticket.id });
  deferEmit(`waiter:${waiterId}`, 'ticket:new', { ticketId: ticket.id });

  if (order.status === OrderStatus.BILL_REQUESTED) {
    deferEmit('admin', 'order:updated', { orderId: order.id });
  }

  deferAfterCommit(() => printService.tryPrintKitchenTicket(ticket.id));

  return ticket;
}

async function maybeRestoreLineStock(
  line: OrderWithDetails['lines'][number],
  ticketStatus: KitchenTicketStatus | null,
  tx: Tx,
) {
  if (!line.isCanceled && (ticketStatus === null || ticketStatus === KitchenTicketStatus.PENDING)) {
    await stockService.restore(line.menuItemId, line.quantity, tx);
  }
}

export const orderService = {
  async list(input: {
    requestingUser: RequestingUser;
    status?: OrderStatus;
    mine?: boolean;
    date?: Date;
  }) {
    if (input.requestingUser.role === UserRole.WAITER || input.mine) {
      return orderRepo.listByWaiter(input.requestingUser.id);
    }

    if (input.status) {
      return orderRepo.listByStatus(input.status);
    }

    if (input.date) {
      const from = new Date(input.date);
      from.setHours(0, 0, 0, 0);
      const to = new Date(input.date);
      to.setHours(23, 59, 59, 999);
      return orderRepo.listByDateRange(from, to);
    }

    return orderRepo.listActive();
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
      return await orderRepo.create({
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
    return order;
  },

  async addLine(input: {
    orderId: string;
    waiterId: string;
    menuItemId: string;
    quantity: number;
    notes?: string;
  }) {
    if (input.quantity <= 0) {
      throw Errors.Validation('Quantity must be greater than zero');
    }

    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureWaiterOwns(order, input.waiterId);

        if (![OrderStatus.DRAFT, OrderStatus.SENT, OrderStatus.BILL_REQUESTED].includes(order.status)) {
          throw Errors.IllegalStateTransition(order.status, 'ADD_LINE');
        }

        const item = await menuRepo.findItemById(input.menuItemId, tx);
        if (!item || !item.isActive) {
          throw Errors.NotFound('Menu item');
        }
        if (!item.isAvailable) {
          throw Errors.ItemUnavailable(item.name);
        }

        await stockService.decrement(item.id, input.quantity, tx);

        const line = await orderLineRepo.create({
          order: {
            connect: { id: order.id },
          },
          menuItem: {
            connect: { id: item.id },
          },
          nameSnapshot: item.name,
          unitPriceSnapshot: item.price,
          quantity: input.quantity,
          notes: input.notes ?? null,
        }, tx);

        if (order.status !== OrderStatus.DRAFT) {
          await createAddonTicket(order, input.waiterId, [line.id], tx);
        }

        return line;
      });
    });
  },

  async addCombo(input: { orderId: string; waiterId: string; comboId: string }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureWaiterOwns(order, input.waiterId);

        if (![OrderStatus.DRAFT, OrderStatus.SENT, OrderStatus.BILL_REQUESTED].includes(order.status)) {
          throw Errors.IllegalStateTransition(order.status, 'ADD_COMBO');
        }

        const combo = await menuRepo.findComboById(input.comboId, tx);
        if (!combo || !combo.isActive) {
          throw Errors.NotFound('Combo');
        }

        const comboGroupId = `combo_${crypto.randomBytes(10).toString('hex')}`;
        const lineIds: string[] = [];

        for (const component of combo.components) {
          if (!component.menuItem.isActive) {
            throw Errors.NotFound('Menu item');
          }
          if (!component.menuItem.isAvailable) {
            throw Errors.ItemUnavailable(component.menuItem.name);
          }

          await stockService.decrement(component.menuItem.id, component.quantity, tx);
          const line = await orderLineRepo.create({
            order: {
              connect: { id: order.id },
            },
            menuItem: {
              connect: { id: component.menuItem.id },
            },
            nameSnapshot: component.menuItem.name,
            unitPriceSnapshot: component.menuItem.price,
            quantity: component.quantity,
            comboGroupId,
            comboNameSnapshot: combo.name,
          }, tx);
          lineIds.push(line.id);
        }

        if (order.status !== OrderStatus.DRAFT && lineIds.length > 0) {
          await createAddonTicket(order, input.waiterId, lineIds, tx);
        }

        return orderLineRepo.findByOrderId(order.id, tx);
      });
    });
  },

  async editLineNote(input: { orderId: string; waiterId: string; lineId: string; notes: string }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureWaiterOwns(order, input.waiterId);

        const line = order.lines.find((entry) => entry.id === input.lineId);
        if (!line) {
          throw Errors.NotFound('Order line');
        }

        const ticket = line.kitchenTicketId
          ? order.kitchenTickets.find((entry) => entry.id === line.kitchenTicketId) ?? null
          : null;

        if (ticket && ticket.status !== KitchenTicketStatus.PENDING) {
          throw Errors.IllegalStateTransition(ticket.status, 'NOTE_EDIT');
        }

        const updated = await orderLineRepo.updateNote(line.id, input.notes, tx);

        if (ticket) {
          deferEmit('kitchen', 'ticket:noteEdited', {
            ticketId: ticket.id,
            lineId: line.id,
          });
        }

        return updated;
      });
    });
  },

  async cancelLine(input: {
    orderId: string;
    requestingUser: RequestingUser;
    lineId: string;
    reason?: string;
  }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureReadable(order, input.requestingUser);

        const line = order.lines.find((entry) => entry.id === input.lineId);
        if (!line) {
          throw Errors.NotFound('Order line');
        }

        const waiterAllowed = input.requestingUser.role === UserRole.WAITER
          && order.waiterId === input.requestingUser.id
          && canWaiterCancel(order);
        const adminAllowed = [UserRole.ADMIN, UserRole.OWNER].includes(input.requestingUser.role);

        if (!waiterAllowed && !adminAllowed) {
          throw Errors.Forbidden('Forbidden');
        }

        const ticket = line.kitchenTicketId
          ? order.kitchenTickets.find((entry) => entry.id === line.kitchenTicketId) ?? null
          : null;

        await maybeRestoreLineStock(line, ticket?.status ?? null, tx);
        const updated = await orderLineRepo.cancel(line.id, input.reason ?? 'Canceled', tx);

        if (ticket?.status === KitchenTicketStatus.PENDING) {
          const refreshedTicket = await kitchenRepo.findByIdWithLines(ticket.id, tx);
          const allCanceled = refreshedTicket?.lines.every((entry) => entry.isCanceled) ?? false;
          if (allCanceled) {
            await kitchenRepo.setCanceled(ticket.id, tx);
            deferEmit('kitchen', 'ticket:canceled', {
              ticketId: ticket.id,
              reason: input.reason ?? 'Canceled',
            });
            deferEmit(`waiter:${order.waiterId}`, 'ticket:canceled', {
              ticketId: ticket.id,
              reason: input.reason ?? 'Canceled',
            });
          }
        }

        await auditService.log({
          userId: input.requestingUser.id,
          action: 'ORDER_CANCELED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            scope: 'line',
            lineId: line.id,
            reason: input.reason ?? null,
          },
        }, tx);

        return updated;
      });
    });
  },

  async send(input: { orderId: string; waiterId: string }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureWaiterOwns(order, input.waiterId);
        if (order.status !== OrderStatus.DRAFT) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.SENT);
        }

        const unsentLines = await orderLineRepo.findUnsentByOrderId(order.id, tx);
        if (unsentLines.length === 0) {
          throw Errors.Validation('Order has no draft lines');
        }

        const ticket = await kitchenRepo.create({
          order: {
            connect: { id: order.id },
          },
        }, tx);

        await orderLineRepo.attachToTicket(unsentLines.map((line) => line.id), ticket.id, tx);
        const updated = await orderRepo.setStatus(order.id, OrderStatus.SENT, OrderStatus.DRAFT, tx);

        if (!updated) {
          throw Errors.IllegalStateTransition(OrderStatus.DRAFT, OrderStatus.SENT);
        }

        deferEmit('kitchen', 'ticket:new', { ticketId: ticket.id });
        deferEmit(`waiter:${input.waiterId}`, 'ticket:new', { ticketId: ticket.id });
        deferAfterCommit(() => printService.tryPrintKitchenTicket(ticket.id));

        return updated;
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
      const adminAllowed = [UserRole.ADMIN, UserRole.OWNER].includes(input.requestingUser.role);
      if (!waiterAllowed && !adminAllowed) {
        throw Errors.Forbidden('Forbidden');
      }

      if (![...ACTIVE_ORDER_STATUSES].includes(order.status)) {
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

          deferEmit('kitchen', 'order:transferred', {
            orderId: order.id,
            fromTableId: order.tableId,
            toTableId: input.newTableId,
          });
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

          return updated;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw Errors.Conflict('Table already has an active order');
        }
        throw error;
      }
    });
  },

  async requestBill(input: { orderId: string; waiterId: string }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureWaiterOwns(order, input.waiterId);
        if (order.status !== OrderStatus.SENT) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.BILL_REQUESTED);
        }

        const updated = await orderRepo.setStatus(
          order.id,
          OrderStatus.BILL_REQUESTED,
          OrderStatus.SENT,
          tx,
        );

        if (!updated) {
          throw Errors.IllegalStateTransition(OrderStatus.SENT, OrderStatus.BILL_REQUESTED);
        }

        deferEmit('admin', 'order:billRequested', { orderId: order.id });
        return updated;
      });
    });
  },

  async cancelOrder(input: {
    orderId: string;
    requestingUser: RequestingUser;
    reason: string;
  }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureReadable(order, input.requestingUser);

        const waiterAllowed = input.requestingUser.role === UserRole.WAITER
          && order.waiterId === input.requestingUser.id
          && canWaiterCancel(order);
        const adminAllowed = [UserRole.ADMIN, UserRole.OWNER].includes(input.requestingUser.role);
        if (!waiterAllowed && !adminAllowed) {
          throw Errors.Forbidden('Forbidden');
        }

        if (![OrderStatus.DRAFT, OrderStatus.SENT, OrderStatus.BILL_REQUESTED].includes(order.status)) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.CANCELED);
        }

        for (const line of order.lines.filter((entry) => !entry.isCanceled)) {
          const ticket = line.kitchenTicketId
            ? order.kitchenTickets.find((entry) => entry.id === line.kitchenTicketId) ?? null
            : null;
          await maybeRestoreLineStock(line, ticket?.status ?? null, tx);
          await orderLineRepo.cancel(line.id, input.reason, tx);
        }

        for (const ticket of order.kitchenTickets.filter((entry) => entry.status === KitchenTicketStatus.PENDING)) {
          await kitchenRepo.setCanceled(ticket.id, tx);
          deferEmit('kitchen', 'ticket:canceled', {
            ticketId: ticket.id,
            reason: input.reason,
          });
          deferEmit(`waiter:${order.waiterId}`, 'ticket:canceled', {
            ticketId: ticket.id,
            reason: input.reason,
          });
        }

        const updated = await orderRepo.setCanceled(order.id, input.reason, tx);
        await auditService.log({
          userId: input.requestingUser.id,
          action: 'ORDER_CANCELED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            orderId: order.id,
            reason: input.reason,
          },
        }, tx);

        return updated;
      });
    });
  },

  async approve(input: {
    orderId: string;
    adminUserId: string;
    discountId?: string | null;
    serviceChargeWaived: boolean;
  }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        if (order.status !== OrderStatus.BILL_REQUESTED) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.PENDING_PAYMENT);
        }

        const totals = await billingService.computeTotals(order, {
          discountId: input.discountId ?? null,
          serviceChargeWaived: input.serviceChargeWaived,
        });

        const transitioned = await orderRepo.setStatus(
          order.id,
          OrderStatus.PENDING_PAYMENT,
          OrderStatus.BILL_REQUESTED,
          tx,
        );

        if (!transitioned) {
          throw Errors.IllegalStateTransition(OrderStatus.BILL_REQUESTED, OrderStatus.PENDING_PAYMENT);
        }

        await orderRepo.applyTotals(order.id, {
          subtotalSnapshot: totals.subtotal,
          discountAmountSnapshot: totals.discountAmount,
          serviceChargeSnapshot: totals.serviceCharge,
          totalSnapshot: totals.total,
        }, tx);
        await orderRepo.setApproval(
          order.id,
          input.adminUserId,
          input.discountId ?? null,
          input.serviceChargeWaived,
          tx,
        );

        const updated = await getOrderOrThrow(order.id, tx);
        await printService.printBill(updated);

        if (input.discountId) {
          await auditService.log({
            userId: input.adminUserId,
            action: 'DISCOUNT_APPLIED',
            entityType: 'Order',
            entityId: order.id,
            metadata: {
              discountId: input.discountId,
              amountOff: totals.discountAmount.toString(),
            },
          }, tx);
        }

        if (input.serviceChargeWaived) {
          await auditService.log({
            userId: input.adminUserId,
            action: 'SERVICE_CHARGE_WAIVED',
            entityType: 'Order',
            entityId: order.id,
            metadata: {
              orderId: order.id,
            },
          }, tx);
        }

        deferEmit('admin', 'order:approved', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:approved', { orderId: order.id });

        return updated;
      });
    });
  },

  async markPaid(input: {
    orderId: string;
    adminUserId: string;
    payments: Array<{ method: PaymentMethod; amount: number | string; reference?: string }>;
  }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        if (order.status !== OrderStatus.PENDING_PAYMENT) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.CLOSED);
        }

        const totalSnapshot = decimalToInt(order.totalSnapshot);
        const paymentTotal = input.payments.reduce((sum, payment) => sum + decimalToInt(payment.amount), 0);
        if (paymentTotal !== totalSnapshot) {
          throw Errors.PaymentMismatch('Payment rows do not sum to the order total');
        }

        await paymentRepo.createMany(order.id, input.payments, tx);
        const updated = await orderRepo.setClosed(order.id, tx);

        deferEmit('admin', 'order:closed', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:closed', { orderId: order.id });

        return updated;
      });
    });
  },

  async markWalkout(input: { orderId: string; adminUserId: string; reason: string }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        if (order.status !== OrderStatus.PENDING_PAYMENT) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.WALKOUT);
        }

        const updated = await orderRepo.setStatus(
          order.id,
          OrderStatus.WALKOUT,
          OrderStatus.PENDING_PAYMENT,
          tx,
        );

        if (!updated) {
          throw Errors.IllegalStateTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.WALKOUT);
        }

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

        return updated;
      });
    });
  },

  async reprintBill(input: { orderId: string; requestingUserId: string; reason?: string }) {
    const order = await getOrderOrThrow(input.orderId);
    if (![OrderStatus.PENDING_PAYMENT, OrderStatus.CLOSED, OrderStatus.WALKOUT].includes(order.status)) {
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
