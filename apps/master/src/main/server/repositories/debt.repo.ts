import { DebtStatus, PaymentMethod, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { localDayRange } from '../lib/time';

type Tx = Prisma.TransactionClient;

export const debtRepo = {
  async create(data: Prisma.DebtCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).debt.create({
      data,
      include: {
        order: true,
        createdBy: {
          select: { id: true, fullName: true },
        },
      },
    });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).debt.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            waiter: {
              select: { id: true, fullName: true },
            },
            table: true,
          },
        },
        createdBy: {
          select: { id: true, fullName: true },
        },
        repayments: {
          include: {
            receivedBy: {
              select: { id: true, fullName: true },
            },
          },
          orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  },

  async findByOrderId(orderId: string, tx?: Tx) {
    return (tx ?? getPrisma()).debt.findUnique({
      where: { orderId },
    });
  },

  async list(filters: { status?: DebtStatus; date?: Date }, tx?: Tx) {
    const range = filters.date ? localDayRange(filters.date) : null;
    return (tx ?? getPrisma()).debt.findMany({
      where: {
        status: filters.status,
        openedAt: range
          ? {
              gte: range.start,
              lt: range.end,
            }
          : undefined,
      },
      include: {
        order: {
          select: {
            id: true,
            closedAt: true,
            totalSnapshot: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { openedAt: 'desc' }],
    });
  },

  async createRepayment(data: Prisma.DebtRepaymentCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).debtRepayment.create({
      data,
      include: {
        receivedBy: {
          select: { id: true, fullName: true },
        },
      },
    });
  },

  async listRepaymentsForDate(date: Date, tx?: Tx) {
    const { start, end } = localDayRange(date);
    return (tx ?? getPrisma()).debtRepayment.findMany({
      where: {
        paidAt: {
          gte: start,
          lt: end,
        },
      },
      include: {
        debt: {
          include: {
            order: true,
          },
        },
      },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async sumOutstanding(tx?: Tx) {
    const result = await (tx ?? getPrisma()).debt.aggregate({
      where: {
        status: {
          in: [DebtStatus.OPEN, DebtStatus.PARTIAL],
        },
      },
      _sum: {
        remainingAmount: true,
      },
    });

    return result._sum.remainingAmount ?? new Prisma.Decimal(0);
  },

  async sumOutstandingAsOf(date: Date, tx?: Tx) {
    const client = tx ?? getPrisma();
    // Half-open: "as of end-of-day D" === "events with timestamp < start of D+1".
    const { end } = localDayRange(date);

    // A debt written off before `end` is no longer outstanding — its principal
    // was recognized as a loss, not as a still-collectible receivable. Filter
    // those out on BOTH sides so the original AND its repayments stop
    // contributing once the write-off date passes.
    const stillOutstandingFilter = {
      OR: [
        { writtenOffAt: null },
        { writtenOffAt: { gte: end } },
      ],
    };

    const [opened, repaid] = await Promise.all([
      client.debt.aggregate({
        where: {
          openedAt: { lt: end },
          ...stillOutstandingFilter,
        },
        _sum: {
          originalAmount: true,
        },
      }),
      client.debtRepayment.aggregate({
        where: {
          paidAt: { lt: end },
          debt: stillOutstandingFilter,
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    return (opened._sum.originalAmount ?? new Prisma.Decimal(0))
      .minus(repaid._sum.amount ?? new Prisma.Decimal(0));
  },

  async openedTodaySummary(date: Date, tx?: Tx) {
    const { start, end } = localDayRange(date);
    const [count, sum] = await Promise.all([
      (tx ?? getPrisma()).debt.count({
        where: {
          openedAt: {
            gte: start,
            lt: end,
          },
        },
      }),
      (tx ?? getPrisma()).debt.aggregate({
        where: {
          openedAt: {
            gte: start,
            lt: end,
          },
        },
        _sum: {
          originalAmount: true,
        },
      }),
    ]);

    return {
      count,
      amount: sum._sum.originalAmount ?? new Prisma.Decimal(0),
    };
  },

  async repaymentTotalsForDate(date: Date, tx?: Tx) {
    const { start, end } = localDayRange(date);
    const rows = await (tx ?? getPrisma()).debtRepayment.groupBy({
      by: ['method'],
      where: {
        paidAt: {
          gte: start,
          lt: end,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return rows.reduce<Record<'CASH' | 'CARD', Prisma.Decimal>>(
      (acc, row) => {
        if (row.method === PaymentMethod.CASH || row.method === PaymentMethod.CARD) {
          acc[row.method] = row._sum.amount ?? new Prisma.Decimal(0);
        }
        return acc;
      },
      {
        CASH: new Prisma.Decimal(0),
        CARD: new Prisma.Decimal(0),
      },
    );
  },

  async update(id: string, data: Prisma.DebtUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).debt.update({
      where: { id },
      data,
    });
  },

  /**
   * Takes `amount` off a balance in one statement. False when the debt is PAID
   * or its balance is smaller than `amount` — a concurrent repayment may have
   * landed since it was read (PRD 14 G2). A written-off debt stays repayable:
   * a payment made on it later is money in that day (money rules D14).
   */
  async applyRepayment(id: string, amount: Prisma.Decimal, tx: Tx): Promise<boolean> {
    const result = await tx.debt.updateMany({
      where: {
        id,
        status: { in: [DebtStatus.OPEN, DebtStatus.PARTIAL, DebtStatus.WRITTEN_OFF] },
        remainingAmount: { gte: amount },
      },
      data: { remainingAmount: { decrement: amount } },
    });
    return result.count === 1;
  },

  /**
   * → WRITTEN_OFF, only from a debt that still has a balance open (OPEN or
   * PARTIAL), as one conditional statement — so a debt a repayment has just
   * closed is never written off on top of it, and two write-offs at the same
   * moment write it off once (PRD 14 G2). False when the debt is no longer
   * OPEN or PARTIAL.
   */
  async writeOffIfOpen(
    id: string,
    input: { writtenOffById: string; writtenOffReason: string; writtenOffAt: Date },
    tx: Tx,
  ): Promise<boolean> {
    const result = await tx.debt.updateMany({
      where: { id, status: { in: [DebtStatus.OPEN, DebtStatus.PARTIAL] } },
      data: {
        status: DebtStatus.WRITTEN_OFF,
        writtenOffAt: input.writtenOffAt,
        writtenOffReason: input.writtenOffReason,
        writtenOffById: input.writtenOffById,
        closedAt: input.writtenOffAt,
      },
    });
    return result.count === 1;
  },
};
