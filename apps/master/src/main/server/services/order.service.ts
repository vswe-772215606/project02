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
import { debtService } from './debt.service';
import { printService } from './print.service';
import { settingsService } from './settings.service';
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

/**
 * Maps a Prisma Order (with possible relations) to a DTO for the frontend.
 * Adds virtual fields: orderNumber, totalAmount.
 */
function mapToDto(order: any) {
  if (!order) return null;

  const totalSnapshot = order.totalSnapshot ? decimalToInt(order.totalSnapshot) : 0;
  
  // Calculate totalAmount for active orders that don't have a snapshot yet
  let totalAmount = totalSnapshot;
  if (!order.totalSnapshot && order.lines) {
    totalAmount = order.lines
      .filter((l: any) => !l.isCanceled)
      .reduce((sum: number, l: any) => sum + decimalToInt(l.unitPriceSnapshot) * l.quantity, 0);
    
    if (order.status !== 'DRAFT' && !order.serviceChargeWaived) {
      totalAmount += settingsService.getInt('service_charge_amount');
    }
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
  deferEmit('admin', 'ticket:new', { ticketId: ticket.id });
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

      if (![OrderStatus.DRAFT, OrderStatus.SENT, OrderStatus.BILL_REQUESTED].includes(order.status)) {
        throw Errors.IllegalStateTransition(order.status, 'ADD_LINE');
      }

      const item = await menuRepo.findItemById(input.menuItemId);
      if (!item || !item.isActive) {
        throw Errors.NotFound('Menu item');
      }

      return getPrisma().$transaction(async (tx) => {
        await stockService.decrement(input.menuItemId, input.quantity, tx);

        // Merge into existing unsent line for the same item (DRAFT only)
        const existingUnsentLine = order.status === OrderStatus.DRAFT
          ? await tx.orderLine.findFirst({
              where: {
                orderId: input.orderId,
                menuItemId: input.menuItemId,
                kitchenTicketId: null,
                isCanceled: false,
              },
            })
          : null;

        const line = existingUnsentLine
          ? await orderLineRepo.updateQuantity(
              existingUnsentLine.id,
              existingUnsentLine.quantity + input.quantity,
              tx,
            )
          : await orderLineRepo.create(
              {
                orderId: input.orderId,
                menuItemId: input.menuItemId,
                nameSnapshot: item.name,
                unitPriceSnapshot: item.price,
                quantity: input.quantity,
                notes: input.notes,
              },
              tx,
            );

        if (!existingUnsentLine && order.status !== OrderStatus.DRAFT) {
          await createAddonTicket(order, input.waiterId, [line.id], tx);
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

      if (![OrderStatus.DRAFT, OrderStatus.SENT, OrderStatus.BILL_REQUESTED].includes(order.status)) {
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
          await stockService.decrement(component.menuItemId, component.quantity, tx);

          const line = await orderLineRepo.create({
            orderId: input.orderId,
            menuItemId: component.menuItemId,
            comboGroupId: comboGroupId,
            comboNameSnapshot: combo.name,
            nameSnapshot: component.menuItem.name,
            unitPriceSnapshot: component.menuItem.price,
            quantity: component.quantity,
          }, tx);
          lines.push(line);
        }

        if (order.status !== OrderStatus.DRAFT) {
          await createAddonTicket(order, input.waiterId, lines.map((l) => l.id), tx);
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
      if (line.kitchenTicketId !== null) {
        throw Errors.Business('LINE_ALREADY_SENT', 'Cannot change quantity of a line already sent to kitchen');
      }
      if (input.quantity < 1) {
        throw Errors.Business('INVALID_QUANTITY', 'Quantity must be at least 1');
      }

      const delta = input.quantity - line.quantity;

      return getPrisma().$transaction(async (tx) => {
        if (delta > 0 && line.menuItemId) {
          await stockService.decrement(line.menuItemId, delta, tx);
        } else if (delta < 0 && line.menuItemId) {
          await stockService.restore(line.menuItemId, Math.abs(delta), tx);
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

      if (order.status !== OrderStatus.DRAFT) {
        // If not draft, check if ticket is still pending
        if (!line.kitchenTicketId) {
           // Should not happen if order is SENT, but allow for safety
        } else {
          const ticket = await kitchenRepo.findById(line.kitchenTicketId);
          if (!ticket || ticket.status !== KitchenTicketStatus.PENDING) {
            throw Errors.IllegalStateTransition(order.status, 'EDIT_NOTE (ticket not pending)');
          }
        }
      }

      const updatedLine = await orderLineRepo.updateNote(input.lineId, input.notes);
      
      if (line.kitchenTicketId) {
        deferEmit('kitchen', 'ticket:noteEdited', { ticketId: line.kitchenTicketId, lineId: line.id });
        deferEmit('admin', 'ticket:noteEdited', { ticketId: line.kitchenTicketId, lineId: line.id });
      }
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

      if (![OrderStatus.DRAFT, OrderStatus.SENT, OrderStatus.BILL_REQUESTED].includes(order.status)) {
        throw Errors.IllegalStateTransition(order.status, 'CANCEL_LINE');
      }

      const line = order.lines.find((l) => l.id === input.lineId);
      if (!line) {
        throw Errors.NotFound('Order line');
      }

      const waiterAllowed = input.requestingUser.role === UserRole.WAITER && 
        order.waiterId === input.requestingUser.id &&
        (order.status === OrderStatus.DRAFT || 
          (order.status === OrderStatus.SENT && (!line.kitchenTicketId || line.kitchenTicket?.status === KitchenTicketStatus.PENDING)));
      
      const adminAllowed = [UserRole.ADMIN, UserRole.OWNER].includes(input.requestingUser.role);

      if (!waiterAllowed && !adminAllowed) {
        throw Errors.Forbidden('Forbidden');
      }

      return getPrisma().$transaction(async (tx) => {
        const updated = await orderLineRepo.cancel(input.lineId, input.reason ?? '', tx);
        await maybeRestoreLineStock(line, line.kitchenTicket?.status ?? null, tx);

        deferEmit('kitchen', 'order:updated', { orderId: order.id });
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

        if (![OrderStatus.DRAFT, OrderStatus.SENT, OrderStatus.BILL_REQUESTED].includes(order.status)) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.SENT);
        }

        const unsentLines = order.lines.filter((line) => !line.kitchenTicketId && !line.isCanceled);
        
        // If already sent and no new lines, just return success
        if (order.status !== OrderStatus.DRAFT && unsentLines.length === 0) {
          return mapToDto(order);
        }

        if (unsentLines.length === 0) {
          throw Errors.Validation('Order has no draft lines');
        }

        const ticket = await kitchenRepo.create({
          order: {
            connect: { id: order.id },
          },
        }, tx);

        await orderLineRepo.attachToTicket(unsentLines.map((line) => line.id), ticket.id, tx);
        
        let updatedOrder = order;
        if (order.status === OrderStatus.DRAFT) {
          const updated = await orderRepo.setStatus(order.id, OrderStatus.SENT, OrderStatus.DRAFT, tx);
          if (!updated) {
            throw Errors.IllegalStateTransition(OrderStatus.DRAFT, OrderStatus.SENT);
          }
          updatedOrder = updated;
        }

        deferEmit('kitchen', 'ticket:new', { ticketId: ticket.id });
        deferEmit('admin', 'ticket:new', { ticketId: ticket.id });
        deferEmit(`waiter:${input.waiterId}`, 'ticket:new', { ticketId: ticket.id });
        deferAfterCommit(() => printService.tryPrintKitchenTicket(ticket.id));

        return mapToDto(updatedOrder);
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

  async requestBill(input: { orderId: string; waiterId: string }) {
    return completeEmitContext(async () => {
      return getPrisma().$transaction(async (tx) => {
        const order = await getOrderOrThrow(input.orderId, tx);
        ensureWaiterOwns(order, input.waiterId);
        if (order.status !== OrderStatus.SENT) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.BILL_REQUESTED);
        }

        const updated = await orderRepo.setStatus(order.id, OrderStatus.BILL_REQUESTED, OrderStatus.SENT, tx);
        if (!updated) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.BILL_REQUESTED);
        }

        deferEmit('admin', 'order:billRequested', { orderId: order.id });
        deferEmit(`waiter:${input.waiterId}`, 'order:billRequested', { orderId: order.id });

        return mapToDto(updated);
      });
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

      const waiterAllowed = input.requestingUser.role === UserRole.WAITER && 
        order.waiterId === input.requestingUser.id &&
        (order.status === OrderStatus.DRAFT || (order.status === OrderStatus.SENT && canWaiterCancel(order)));
      
      const adminAllowed = [UserRole.ADMIN, UserRole.OWNER].includes(input.requestingUser.role) &&
        [...ACTIVE_ORDER_STATUSES].includes(order.status);

      if (!waiterAllowed && !adminAllowed) {
        throw Errors.Forbidden('Forbidden');
      }

      return getPrisma().$transaction(async (tx) => {
        const updated = await orderRepo.setCanceled(order.id, input.reason, tx);

        // Mark pending kitchen tickets as canceled
        for (const ticket of order.kitchenTickets) {
          if (ticket.status === KitchenTicketStatus.PENDING) {
            await kitchenRepo.setStatus(ticket.id, KitchenTicketStatus.CANCELED, KitchenTicketStatus.PENDING, tx);
            deferEmit('kitchen', 'ticket:canceled', { ticketId: ticket.id, reason: input.reason });
            deferEmit('admin', 'ticket:canceled', { ticketId: ticket.id, reason: input.reason });
            deferEmit(`waiter:${order.waiterId}`, 'ticket:canceled', { ticketId: ticket.id, reason: input.reason });
          }
        }

        // Restore stock for all non-canceled items that haven't been cooked
        for (const line of order.lines) {
          await maybeRestoreLineStock(line, line.kitchenTicket?.status ?? null, tx);
        }

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

        deferEmit('kitchen', 'order:canceled', { orderId: order.id });
        deferEmit('admin', 'order:canceled', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:canceled', { orderId: order.id });

        return mapToDto(updated);
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
      const order = await getOrderOrThrow(input.orderId);
      if (![OrderStatus.BILL_REQUESTED, OrderStatus.SENT].includes(order.status)) {
        throw Errors.IllegalStateTransition(order.status, OrderStatus.PENDING_PAYMENT);
      }

      const totals = await billingService.computeTotals(order, {
        discountId: input.discountId,
        serviceChargeWaived: input.serviceChargeWaived,
      });

      return getPrisma().$transaction(async (tx) => {
        await orderRepo.setApproval(order.id, input.adminUserId, input.discountId ?? null, input.serviceChargeWaived, tx);
        await orderRepo.applyTotals(order.id, {
          subtotalSnapshot: totals.subtotal,
          discountAmountSnapshot: totals.discountAmount,
          serviceChargeSnapshot: totals.serviceCharge,
          totalSnapshot: totals.total,
        }, tx);

        const updated = await orderRepo.setStatus(order.id, OrderStatus.PENDING_PAYMENT, order.status, tx);
        if (!updated) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.PENDING_PAYMENT);
        }

        await auditService.log({
          userId: input.adminUserId,
          action: 'DISCOUNT_APPLIED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            orderId: order.id,
            discountId: input.discountId,
          },
        }, tx);

        if (input.serviceChargeWaived) {
          await auditService.log({
            userId: input.adminUserId,
            action: 'SERVICE_CHARGE_WAIVED',
            entityType: 'Order',
            entityId: order.id,
            metadata: { orderId: order.id },
          }, tx);
        }

        deferEmit('admin', 'order:approved', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:approved', { orderId: order.id });

        // Print final bill
        const freshOrder = await getOrderOrThrow(order.id, tx);
        deferAfterCommit(() => printService.printBill(freshOrder));

        return mapToDto(updated);
      });
    });
  },

  async markPaid(input: {
    orderId: string;
    adminUserId: string;
    payments: Array<{ method: PaymentMethod; amount: number | string; reference?: string }>;
    debt?: {
      debtorName: string;
      debtorPhone?: string;
      note?: string;
    };
  }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw Errors.IllegalStateTransition(order.status, OrderStatus.CLOSED);
      }

      const debtPayment = input.payments.find((payment) => payment.method === PaymentMethod.DEBT);
      if (debtPayment && !input.debt?.debtorName?.trim()) {
        throw Errors.DebtMetadataRequired();
      }

      // Verify total
      const totalPaid = input.payments.reduce((sum, p) => sum + decimalToInt(p.amount), 0);
      if (totalPaid !== decimalToInt(order.totalSnapshot)) {
        throw Errors.PaymentMismatch(`Paid ${totalPaid}, but order total is ${order.totalSnapshot}`);
      }

      return getPrisma().$transaction(async (tx) => {
        const closedAt = new Date();
        await paymentRepo.createMany(order.id, input.payments, tx);

        if (debtPayment) {
          await debtService.createFromClosedOrder({
            orderId: order.id,
            amount: debtPayment.amount,
            debtorName: input.debt!.debtorName,
            debtorPhone: input.debt?.debtorPhone,
            note: input.debt?.note,
            actorUserId: input.adminUserId,
            openedAt: closedAt,
          }, tx);
        }

        const updated = await orderRepo.setClosed(order.id, closedAt, tx);
        if (!updated) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.CLOSED);
        }

        deferEmit('admin', 'order:closed', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:closed', { orderId: order.id });

        return mapToDto(updated);
      });
    });
  },

  async markWalkout(input: { orderId: string; adminUserId: string; reason: string }) {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(input.orderId);
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw Errors.IllegalStateTransition(order.status, OrderStatus.WALKOUT);
      }

      return getPrisma().$transaction(async (tx) => {
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

        return mapToDto(updated);
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
