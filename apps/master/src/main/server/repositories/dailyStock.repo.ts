import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const dailyStockRepo = {
  async findByItemAndDate(menuItemId: string, date: Date, tx?: Tx) {
    return (tx ?? getPrisma()).dailyStock.findUnique({
      where: {
        menuItemId_date: {
          menuItemId,
          date,
        },
      },
    });
  },

  async listForDate(date: Date, tx?: Tx) {
    return (tx ?? getPrisma()).dailyStock.findMany({
      where: { date },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            trackStock: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async upsertForDate(
    menuItemId: string,
    date: Date,
    initialCount: number,
    currentCount: number,
    setById: string,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).dailyStock.upsert({
      where: {
        menuItemId_date: {
          menuItemId,
          date,
        },
      },
      create: {
        menuItem: {
          connect: { id: menuItemId },
        },
        date,
        initialCount,
        currentCount,
        setBy: {
          connect: { id: setById },
        },
      },
      update: {
        initialCount,
        currentCount,
        setBy: {
          connect: { id: setById },
        },
      },
    });
  },

  async decrementAtomic(
    menuItemId: string,
    date: Date,
    quantity: number,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).dailyStock.updateMany({
      where: {
        menuItemId,
        date,
        currentCount: {
          gte: quantity,
        },
      },
      data: {
        currentCount: {
          decrement: quantity,
        },
      },
    });
  },

  async incrementAtomic(
    menuItemId: string,
    date: Date,
    quantity: number,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).dailyStock.updateMany({
      where: {
        menuItemId,
        date,
      },
      data: {
        currentCount: {
          increment: quantity,
        },
      },
    });
  },

  async setCurrentCount(
    menuItemId: string,
    date: Date,
    count: number,
    tx?: Tx,
  ) {
    const client = tx ?? getPrisma();
    const result = await client.dailyStock.updateMany({
      where: {
        menuItemId,
        date,
      },
      data: {
        currentCount: count,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return client.dailyStock.findUnique({
      where: {
        menuItemId_date: {
          menuItemId,
          date,
        },
      },
    });
  },

  async historyForItem(menuItemId: string, from: Date, to: Date, tx?: Tx) {
    return (tx ?? getPrisma()).dailyStock.findMany({
      where: {
        menuItemId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'desc' },
    });
  },
};
