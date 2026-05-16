import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const purchaseRepo = {
  async create(data: Prisma.PurchaseCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).purchase.create({
      data,
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            buyUnit: true,
            recipeUnit: true,
            conversionFactor: true,
          },
        },
        recordedBy: {
          select: { id: true, fullName: true },
        },
        expense: true,
      },
    });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).purchase.findUnique({
      where: { id },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            buyUnit: true,
            recipeUnit: true,
            conversionFactor: true,
          },
        },
        recordedBy: {
          select: { id: true, fullName: true },
        },
        expense: true,
      },
    });
  },

  async list(
    filters: { from?: Date; to?: Date; ingredientId?: string } = {},
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).purchase.findMany({
      where: {
        ingredientId: filters.ingredientId,
        occurredAt: filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
      },
      include: {
        ingredient: {
          select: { id: true, name: true, buyUnit: true, recipeUnit: true },
        },
        recordedBy: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  },
};
