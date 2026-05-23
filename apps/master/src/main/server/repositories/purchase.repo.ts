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

  /**
   * FIFO peel candidates — oldest-first, only ACTIVE batches with leftover qty.
   * Tie-break by createdAt then id so the order is stable across calls.
   */
  async findActiveBatchesForIngredient(ingredientId: string, tx?: Tx) {
    return (tx ?? getPrisma()).purchase.findMany({
      where: {
        ingredientId,
        status: 'ACTIVE',
        remainingQty: { gt: 0 },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        remainingQty: true,
        unitCostPerRecipeUnit: true,
        occurredAt: true,
      },
    });
  },

  /**
   * Atomic FIFO peel: decrement remainingQty only if the batch still has at
   * least `qty` left. Concurrent peels can't double-spend a batch — if two
   * orders both try to take from the same row, the second will get count=0
   * and the caller falls through to the next batch.
   */
  async peelAtomic(purchaseId: string, qty: Prisma.Decimal, tx?: Tx) {
    return (tx ?? getPrisma()).purchase.updateMany({
      where: {
        id: purchaseId,
        status: 'ACTIVE',
        remainingQty: { gte: qty },
      },
      data: {
        remainingQty: { decrement: qty },
      },
    });
  },

  /**
   * Restore qty to a batch on cancel/decrement. No status check — even a
   * REVERSED batch can receive a restore if it was peeled before reversal
   * (callers usually only restore from ACTIVE batches anyway).
   */
  async restoreToBatch(purchaseId: string, qty: Prisma.Decimal, tx?: Tx) {
    return (tx ?? getPrisma()).purchase.update({
      where: { id: purchaseId },
      data: { remainingQty: { increment: qty } },
    });
  },
};
