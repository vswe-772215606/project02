import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const dailyCloseRepo = {
  async findByDate(dateKey: string, tx?: Tx) {
    return (tx ?? getPrisma()).dailyClose.findUnique({
      where: { date: dateKey },
      include: {
        closedBy: { select: { id: true, fullName: true } },
      },
    });
  },

  async create(
    data: {
      date: string;
      closedByUserId: string;
      snapshot: Prisma.InputJsonValue;
      note?: string | null;
    },
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).dailyClose.create({
      data: {
        date: data.date,
        closedByUserId: data.closedByUserId,
        snapshot: data.snapshot,
        note: data.note ?? null,
      },
      include: {
        closedBy: { select: { id: true, fullName: true } },
      },
    });
  },

  async deleteByDate(dateKey: string, tx?: Tx) {
    return (tx ?? getPrisma()).dailyClose.delete({
      where: { date: dateKey },
    });
  },

  async listInRange(fromKey: string, toKey: string, tx?: Tx) {
    return (tx ?? getPrisma()).dailyClose.findMany({
      where: { date: { gte: fromKey, lte: toKey } },
      orderBy: { date: 'asc' },
    });
  },
};
