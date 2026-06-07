import { ExpenseStatus, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { localDayRange } from '../lib/time';

type Tx = Prisma.TransactionClient;

export const expenseRepo = {
  async listCategories(tx?: Tx) {
    return (tx ?? getPrisma()).expenseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  },

  async findCategoryById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).expenseCategory.findUnique({
      where: { id },
    });
  },

  async create(data: Prisma.ExpenseCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).expense.create({
      data,
      include: {
        category: true,
        createdBy: {
          select: { id: true, fullName: true },
        },
      },
    });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).expense.findUnique({
      where: { id },
      include: {
        category: true,
        createdBy: {
          select: { id: true, fullName: true },
        },
        writtenOffBy: {
          select: { id: true, fullName: true },
        },
        returns: {
          include: {
            receivedBy: { select: { id: true, fullName: true } },
          },
          orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
        },
        reversals: true,
      },
    });
  },

  async updateStatus(id: string, status: ExpenseStatus, tx?: Tx) {
    return (tx ?? getPrisma()).expense.update({
      where: { id },
      data: { status },
    });
  },

  async listForDate(date: Date, tx?: Tx) {
    const { start, end } = localDayRange(date);
    return (tx ?? getPrisma()).expense.findMany({
      where: {
        occurredAt: {
          gte: start,
          lt: end,
        },
      },
      include: {
        category: true,
        createdBy: {
          select: { id: true, fullName: true },
        },
        writtenOffBy: {
          select: { id: true, fullName: true },
        },
        returns: {
          include: {
            receivedBy: { select: { id: true, fullName: true } },
          },
          orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async createReturn(data: Prisma.ExpenseReturnCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).expenseReturn.create({
      data,
      include: {
        receivedBy: { select: { id: true, fullName: true } },
      },
    });
  },

  async markWrittenOff(
    id: string,
    input: { writtenOffById: string; writtenOffReason: string },
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).expense.update({
      where: { id },
      data: {
        writtenOffAt: new Date(),
        writtenOffById: input.writtenOffById,
        writtenOffReason: input.writtenOffReason,
      },
    });
  },

  async sumReturnsByExpense(expenseId: string, tx?: Tx) {
    const r = await (tx ?? getPrisma()).expenseReturn.aggregate({
      where: { expenseId },
      _sum: { amount: true },
    });
    return r._sum.amount ?? new Prisma.Decimal(0);
  },

  /**
   * Cross-date search. Used primarily for finding repayable expenses when
   * recording a return — admin doesn't always remember which day the avans
   * was given.
   */
  async search(
    filters: {
      q?: string;
      repayable?: boolean;
      openRepayable?: boolean;
      from?: Date;
      to?: Date;
      limit?: number;
    },
    tx?: Tx,
  ) {
    const where: Prisma.ExpenseWhereInput = {};

    if (filters.q && filters.q.trim().length > 0) {
      const q = filters.q.trim();
      where.OR = [
        { reason: { contains: q } },
        { note: { contains: q } },
      ];
    }

    if (filters.repayable !== undefined) {
      where.repayable = filters.repayable;
    }

    if (filters.openRepayable) {
      where.repayable = true;
      where.writtenOffAt = null;
    }

    if (filters.from || filters.to) {
      // `from` is day-start (inclusive), `to` is the exclusive end-of-range
      // instant set by the controller (start of the day AFTER the requested
      // last day). Half-open [from, to) keeps boundary semantics consistent
      // with listForDate.
      where.occurredAt = {
        gte: filters.from,
        lt: filters.to,
      };
    }

    return (tx ?? getPrisma()).expense.findMany({
      where,
      take: filters.limit ?? 100,
      include: {
        category: true,
        createdBy: { select: { id: true, fullName: true } },
        writtenOffBy: { select: { id: true, fullName: true } },
        returns: {
          include: { receivedBy: { select: { id: true, fullName: true } } },
          orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  },
};
