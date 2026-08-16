import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const orderLineRepo = {
  async create(data: Prisma.OrderLineCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).orderLine.create({ data });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).orderLine.findUnique({ where: { id } });
  },

  async findByOrderId(orderId: string, tx?: Tx) {
    return (tx ?? getPrisma()).orderLine.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async updateNote(id: string, notes: string | null, tx?: Tx) {
    return (tx ?? getPrisma()).orderLine.update({
      where: { id },
      data: { notes },
    });
  },

  async updateQuantity(id: string, quantity: number, tx?: Tx) {
    return (tx ?? getPrisma()).orderLine.update({
      where: { id },
      data: { quantity },
    });
  },

  async cancel(id: string, reason: string, tx?: Tx) {
    return (tx ?? getPrisma()).orderLine.update({
      where: { id },
      data: {
        isCanceled: true,
        canceledAt: new Date(),
        canceledReason: reason,
      },
    });
  },
};
