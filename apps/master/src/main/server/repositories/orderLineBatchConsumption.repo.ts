import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const orderLineBatchConsumptionRepo = {
  async create(data: Prisma.OrderLineBatchConsumptionCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).orderLineBatchConsumption.create({ data });
  },

  /**
   * Peels recorded for a line, filtered to a single ingredient (via the joined
   * Purchase). Newest-first — restore unwinds in reverse-consume order so the
   * most-recently-peeled batch is the first to receive qty back.
   */
  async listForLineAndIngredient(orderLineId: string, ingredientId: string, tx?: Tx) {
    return (tx ?? getPrisma()).orderLineBatchConsumption.findMany({
      where: {
        orderLineId,
        purchase: { ingredientId },
        quantity: { gt: 0 },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  },

  async decrementQty(id: string, qty: Prisma.Decimal, tx?: Tx) {
    return (tx ?? getPrisma()).orderLineBatchConsumption.update({
      where: { id },
      data: { quantity: { decrement: qty } },
    });
  },
};
