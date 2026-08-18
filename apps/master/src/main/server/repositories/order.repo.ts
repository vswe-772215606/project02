import { OrderStatus, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

function statusFilter(expectedFrom: OrderStatus | OrderStatus[]) {
  return Array.isArray(expectedFrom) ? { in: expectedFrom } : expectedFrom;
}

const LIST_INCLUDE = {
  lines: {
    // `kind` only, deliberately NOT a full `include: { menuItem: true }`.
    // Waiters read order payloads, and menuItem carries costPrice; widening
    // this would put the cost of every dish on the wire for them. Without it
    // `mapToDto` defaults every line on the LIST payload to FOOD, which is
    // what made the confirm ticket clamp the discount against food plus
    // service and dead-end a comped bill in PAYMENT_MISMATCH.
    include: {
      menuItem: { select: { kind: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  waiter: {
    select: {
      id: true,
      fullName: true,
    },
  },
  table: true,
};

export const orderRepo = {
  async create(data: Prisma.OrderCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).order.create({ data });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).order.findUnique({ where: { id } });
  },

  async findByIdWithDetails(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).order.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            menuItem: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
        },
        debt: {
          include: {
            repayments: {
              orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
        table: true,
        waiter: {
          select: {
            id: true,
            fullName: true,
          },
        },
        appliedDiscount: true,
        approvedBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });
  },

  async listActive(tx?: Tx) {
    return (tx ?? getPrisma()).order.findMany({
      where: {
        status: {
          notIn: [OrderStatus.CLOSED, OrderStatus.CANCELED],
        },
      },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * How many orders are open right now — the number the update prompt shows so
   * the operator knows what a restart costs. Stated positively rather than as
   * `notIn: [CLOSED, CANCELED]` (which is what `listActive` does) so a status
   * added to the enum later cannot silently join the "open" bucket.
   * `@@index([status])` exists (schema.prisma:342), so this is an indexed count.
   */
  async countOpen(tx?: Tx) {
    return (tx ?? getPrisma()).order.count({
      where: { status: { in: [OrderStatus.DRAFT, OrderStatus.SENT] } },
    });
  },

  async listByWaiter(waiterId: string, tx?: Tx) {
    return (tx ?? getPrisma()).order.findMany({
      where: { waiterId },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  },

  async listByStatus(status: OrderStatus, tx?: Tx) {
    return (tx ?? getPrisma()).order.findMany({
      where: { status },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  },

  async listByDateRange(from: Date, to: Date, tx?: Tx) {
    // Half-open [from, to). Caller is expected to pass Tashkent-anchored
    // bounds (see services/order.service.list).
    return (tx ?? getPrisma()).order.findMany({
      where: {
        createdAt: {
          gte: from,
          lt: to,
        },
      },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * One status, bucketed to one Tashkent day.
   *
   * Buckets by the lifecycle timestamp that *produced* the status, not by
   * `createdAt` — an order opened before midnight and closed after it belongs
   * to the day it was closed, which is the day its money landed and the day
   * every finance report already counts it in. `schema.prisma` sets each of
   * these exactly once for that reason.
   */
  async listByStatusAndDateRange(status: OrderStatus, from: Date, to: Date, tx?: Tx) {
    const stampedAt = { gte: from, lt: to };
    const bucket =
      status === OrderStatus.CLOSED
        ? { closedAt: stampedAt }
        : status === OrderStatus.CANCELED
          ? { canceledAt: stampedAt }
          : status === OrderStatus.SENT
            ? { sentAt: stampedAt }
            : { createdAt: stampedAt };

    return (tx ?? getPrisma()).order.findMany({
      where: { status, ...bucket },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  },

  async setStatus(
    id: string,
    status: OrderStatus,
    expectedFrom?: OrderStatus | OrderStatus[],
    tx?: Tx,
  ) {
    const client = tx ?? getPrisma();

    if (expectedFrom) {
      const result = await client.order.updateMany({
        where: {
          id,
          status: statusFilter(expectedFrom),
        },
        data: { status },
      });

      if (result.count === 0) {
        return null;
      }
    } else {
      await client.order.update({
        where: { id },
        data: { status },
      });
    }

    return client.order.findUnique({ 
      where: { id },
      include: LIST_INCLUDE 
    });
  },

  async applyTotals(
    id: string,
    totals: {
      subtotalSnapshot: Prisma.Decimal | string | number | null;
      discountAmountSnapshot: Prisma.Decimal | string | number | null;
      serviceChargeSnapshot: Prisma.Decimal | string | number | null;
      totalSnapshot: Prisma.Decimal | string | number | null;
    },
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).order.update({
      where: { id },
      data: totals,
    });
  },

  async setApproval(
    id: string,
    approverId: string,
    discountId: string | null,
    serviceChargeWaived: boolean,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).order.update({
      where: { id },
      data: {
        approvedAt: new Date(),
        approvedBy: {
          connect: {
            id: approverId,
          },
        },
        appliedDiscount: discountId
          ? {
              connect: { id: discountId },
            }
          : {
              disconnect: true,
            },
        serviceChargeWaived,
      },
    });
  },

  /**
   * Atomic DRAFT → SENT transition that also stamps `sentAt`. Returns the
   * updated order or null if the row wasn't in DRAFT (lost race).
   */
  async setSent(id: string, sentAt = new Date(), tx?: Tx) {
    const client = tx ?? getPrisma();
    const result = await client.order.updateMany({
      where: { id, status: OrderStatus.DRAFT },
      data: { status: OrderStatus.SENT, sentAt },
    });
    if (result.count === 0) return null;
    return client.order.findUnique({ where: { id }, include: LIST_INCLUDE });
  },

  async setClosed(id: string, closedAt = new Date(), tx?: Tx) {
    return (tx ?? getPrisma()).order.update({
      where: { id },
      data: {
        status: OrderStatus.CLOSED,
        closedAt,
      },
    });
  },

  async setCanceled(id: string, reason: string, tx?: Tx) {
    return (tx ?? getPrisma()).order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELED,
        canceledAt: new Date(),
        cancelReason: reason,
      },
    });
  },

  async setTransfer(id: string, newTableId: string | null, tx?: Tx) {
    return (tx ?? getPrisma()).order.update({
      where: { id },
      data: {
        table: newTableId
          ? {
              connect: { id: newTableId },
            }
          : {
              disconnect: true,
            },
      },
    });
  },
};
