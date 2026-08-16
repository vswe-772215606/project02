import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const entryInclude = {
  menuItem: { select: { id: true, name: true } },
  actor: { select: { id: true, fullName: true } },
  expense: { select: { id: true, status: true } },
} satisfies Prisma.StockEntryInclude;

export const stockEntryRepo = {
  async create(data: Prisma.StockEntryCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).stockEntry.create({ data, include: entryInclude });
  },

  async listForItem(menuItemId: string, limit = 50, tx?: Tx) {
    return (tx ?? getPrisma()).stockEntry.findMany({
      where: { menuItemId },
      include: entryInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  },

  /**
   * Newest-first entries (id + timestamp only) across a set of items — the
   * caller reduces this to one "latest" row per item. Backs the Ombor list's
   * lastEntryAt column.
   */
  async latestOccurredAtByItemIds(menuItemIds: string[], tx?: Tx) {
    return (tx ?? getPrisma()).stockEntry.findMany({
      where: { menuItemId: { in: menuItemIds } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { menuItemId: true, occurredAt: true },
    });
  },

  /**
   * Money-restocks in a half-open window, excluding entries whose linked
   * expense was reversed (their cash was unwound). Drives the "Xaridlar"
   * finance block after the Purchase model stops being written.
   */
  async listMoneyForRange(start: Date, end: Date, tx?: Tx) {
    return (tx ?? getPrisma()).stockEntry.findMany({
      where: {
        occurredAt: { gte: start, lt: end },
        paidUzs: { not: null },
        expense: { status: { not: 'REVERSED' } },
      },
      include: entryInclude,
      orderBy: [{ occurredAt: 'asc' }],
    });
  },

  async aggregateMoneyForRange(start: Date, end: Date, tx?: Tx) {
    const client = tx ?? getPrisma();
    const where = {
      occurredAt: { gte: start, lt: end },
      paidUzs: { not: null },
      expense: { status: { not: 'REVERSED' as const } },
    };
    const [sum, count] = await Promise.all([
      client.stockEntry.aggregate({ where, _sum: { paidUzs: true } }),
      client.stockEntry.count({ where }),
    ]);
    return { total: sum._sum.paidUzs ?? new Prisma.Decimal(0), count };
  },
};
