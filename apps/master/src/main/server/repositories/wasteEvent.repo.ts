import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const wasteEventRepo = {
  async create(data: Prisma.WasteEventCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).wasteEvent.create({
      data,
      include: {
        ingredient: {
          select: { id: true, name: true, recipeUnit: true },
        },
        recordedBy: {
          select: { id: true, fullName: true },
        },
      },
    });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).wasteEvent.findUnique({
      where: { id },
      include: {
        ingredient: {
          select: { id: true, name: true, recipeUnit: true },
        },
        recordedBy: {
          select: { id: true, fullName: true },
        },
      },
    });
  },

  async list(
    filters: { from?: Date; to?: Date; ingredientId?: string } = {},
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).wasteEvent.findMany({
      where: {
        ingredientId: filters.ingredientId,
        occurredAt: filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
      },
      include: {
        ingredient: {
          select: { id: true, name: true, recipeUnit: true },
        },
        recordedBy: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  },

  async sumForDateRange(from: Date, to: Date, tx?: Tx) {
    const result = await (tx ?? getPrisma()).wasteEvent.aggregate({
      where: {
        occurredAt: { gte: from, lte: to },
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? new Prisma.Decimal(0);
  },
};
