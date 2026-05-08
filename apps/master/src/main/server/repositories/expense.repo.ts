import { ExpenseStatus, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

function dayRange(date: Date) {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);

  const to = new Date(date);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

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

  async findOrCreateCategoryByName(name: string, tx?: Tx) {
    const trimmed = name.trim();
    return (tx ?? getPrisma()).expenseCategory.upsert({
      where: { name: trimmed },
      update: {},
      create: { name: trimmed, isActive: true, displayOrder: 9999 },
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
    const { from, to } = dayRange(date);
    return (tx ?? getPrisma()).expense.findMany({
      where: {
        occurredAt: {
          gte: from,
          lte: to,
        },
      },
      include: {
        category: true,
        createdBy: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
  },
};
