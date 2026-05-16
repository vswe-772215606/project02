import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const ingredientRepo = {
  async create(data: Prisma.IngredientCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).ingredient.create({
      data,
      include: {
        expenseCategory: true,
        parentMenuItem: { select: { id: true, name: true } },
        selfMenuItem: { select: { id: true, name: true } },
      },
    });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).ingredient.findUnique({
      where: { id },
      include: {
        expenseCategory: true,
        parentMenuItem: { select: { id: true, name: true } },
        selfMenuItem: { select: { id: true, name: true } },
      },
    });
  },

  async findByName(parentMenuItemId: string, name: string, tx?: Tx) {
    return (tx ?? getPrisma()).ingredient.findUnique({
      where: { parentMenuItemId_name: { parentMenuItemId, name } },
    });
  },

  async findBySelfMenuItem(menuItemId: string, tx?: Tx) {
    return (tx ?? getPrisma()).ingredient.findUnique({
      where: { selfMenuItemId: menuItemId },
    });
  },

  async list(
    filters: { isActive?: boolean; isSelfMenuItem?: boolean; parentMenuItemId?: string } = {},
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).ingredient.findMany({
      where: {
        isActive: filters.isActive,
        isSelfMenuItem: filters.isSelfMenuItem,
        parentMenuItemId: filters.parentMenuItemId,
      },
      include: {
        expenseCategory: true,
        parentMenuItem: { select: { id: true, name: true } },
        selfMenuItem: { select: { id: true, name: true } },
      },
      orderBy: [{ isActive: 'desc' }, { parentMenuItem: { name: 'asc' } }, { name: 'asc' }],
    });
  },

  async listByParent(parentMenuItemId: string, tx?: Tx) {
    return (tx ?? getPrisma()).ingredient.findMany({
      where: { parentMenuItemId, isActive: true },
      include: { parentMenuItem: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  },

  async update(id: string, data: Prisma.IngredientUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).ingredient.update({
      where: { id },
      data,
    });
  },

  /**
   * Atomic stock decrement: succeeds only if currentStock >= quantity, otherwise
   * returns a count of 0 and the caller treats it as out-of-stock.
   */
  async decrementAtomic(id: string, quantity: Prisma.Decimal | number, tx?: Tx) {
    const qty = new Prisma.Decimal(quantity);
    return (tx ?? getPrisma()).ingredient.updateMany({
      where: {
        id,
        currentStock: { gte: qty },
      },
      data: {
        currentStock: { decrement: qty },
      },
    });
  },

  async incrementAtomic(id: string, quantity: Prisma.Decimal | number, tx?: Tx) {
    const qty = new Prisma.Decimal(quantity);
    return (tx ?? getPrisma()).ingredient.updateMany({
      where: { id },
      data: {
        currentStock: { increment: qty },
      },
    });
  },

  async setCurrentStock(id: string, count: Prisma.Decimal | number, tx?: Tx) {
    return (tx ?? getPrisma()).ingredient.update({
      where: { id },
      data: { currentStock: new Prisma.Decimal(count) },
    });
  },

  async setWeightedAvgCost(id: string, cost: Prisma.Decimal | number, tx?: Tx) {
    return (tx ?? getPrisma()).ingredient.update({
      where: { id },
      data: { weightedAvgCost: new Prisma.Decimal(cost) },
    });
  },
};
