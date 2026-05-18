import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const purchaseInclude = {
  ingredient: {
    select: {
      id: true,
      name: true,
      buyUnit: true,
      recipeUnit: true,
      conversionFactor: true,
    },
  },
  recordedBy: { select: { id: true, fullName: true } },
  reversedBy: { select: { id: true, fullName: true } },
  expense: true,
} satisfies Prisma.PurchaseInclude;

export const purchaseRepo = {
  async create(data: Prisma.PurchaseCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).purchase.create({
      data,
      include: purchaseInclude,
    });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).purchase.findUnique({
      where: { id },
      include: purchaseInclude,
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
      include: purchaseInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  },

  async update(id: string, data: Prisma.PurchaseUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).purchase.update({
      where: { id },
      data,
      include: purchaseInclude,
    });
  },

  /**
   * Sums quantityRecipeUnit and totalCostUzs across all ACTIVE purchases for
   * an ingredient. Used by reversal to recompute the weighted-average cost
   * after the reversed purchase is removed from the active set.
   */
  async activeTotalsForIngredient(ingredientId: string, excludingId: string, tx?: Tx) {
    const rows = await (tx ?? getPrisma()).purchase.findMany({
      where: {
        ingredientId,
        status: 'ACTIVE',
        NOT: { id: excludingId },
      },
      select: { quantityRecipeUnit: true, totalCostUzs: true },
    });
    let qty = new Prisma.Decimal(0);
    let cost = new Prisma.Decimal(0);
    for (const row of rows) {
      qty = qty.plus(row.quantityRecipeUnit);
      cost = cost.plus(row.totalCostUzs);
    }
    return { qty, cost };
  },
};
