import { OrderStatus, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

function statusFilter(expectedFrom: OrderStatus | OrderStatus[]) {
  return Array.isArray(expectedFrom) ? { in: expectedFrom } : expectedFrom;
}

const LIST_INCLUDE = {
  lines: {
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
          notIn: [OrderStatus.CLOSED, OrderStatus.WALKOUT, OrderStatus.CANCELED],
        },
      },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
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
