import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const discountRepo = {
  async create(data: Prisma.DiscountCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).discount.create({ data });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).discount.findUnique({ where: { id } });
  },

  async listActive(tx?: Tx) {
    return (tx ?? getPrisma()).discount.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  async listAll(tx?: Tx) {
    return (tx ?? getPrisma()).discount.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async update(id: string, data: Prisma.DiscountUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).discount.update({
      where: { id },
      data,
    });
  },

  async softDelete(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).discount.update({
      where: { id },
      data: { isActive: false },
    });
  },
};
