import { IngredientMovementType, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const ingredientMovementRepo = {
  async create(data: Prisma.IngredientMovementCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).ingredientMovement.create({
      data,
    });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).ingredientMovement.findUnique({
      where: { id },
    });
  },

  async listForIngredient(
    ingredientId: string,
    filters: { from?: Date; to?: Date; type?: IngredientMovementType } = {},
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).ingredientMovement.findMany({
      where: {
        ingredientId,
        type: filters.type,
        occurredAt: filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  },

  async lastMovement(ingredientId: string, before?: Date, tx?: Tx) {
    return (tx ?? getPrisma()).ingredientMovement.findFirst({
      where: {
        ingredientId,
        occurredAt: before ? { lt: before } : undefined,
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  },

  async sumForIngredient(
    ingredientId: string,
    filters: { from?: Date; to?: Date; type?: IngredientMovementType } = {},
    tx?: Tx,
  ) {
    const result = await (tx ?? getPrisma()).ingredientMovement.aggregate({
      where: {
        ingredientId,
        type: filters.type,
        occurredAt: filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? new Prisma.Decimal(0);
  },
};
