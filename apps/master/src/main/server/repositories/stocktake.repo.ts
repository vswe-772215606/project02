import { Prisma, StocktakeStatus } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const stocktakeInclude = {
  performer: {
    select: { id: true, fullName: true },
  },
  entries: {
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          recipeUnit: true,
          buyUnit: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.StocktakeInclude;

export const stocktakeRepo = {
  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).stocktake.findUnique({
      where: { id },
      include: stocktakeInclude,
    });
  },

  async findByDate(date: Date, tx?: Tx) {
    return (tx ?? getPrisma()).stocktake.findUnique({
      where: { date },
      include: stocktakeInclude,
    });
  },

  async create(data: { date: Date; performedById: string }, tx?: Tx) {
    return (tx ?? getPrisma()).stocktake.create({
      data: {
        date: data.date,
        performer: { connect: { id: data.performedById } },
      },
      include: stocktakeInclude,
    });
  },

  async listRecent(limit: number, tx?: Tx) {
    return (tx ?? getPrisma()).stocktake.findMany({
      take: limit,
      orderBy: { date: 'desc' },
      include: {
        performer: { select: { id: true, fullName: true } },
      },
    });
  },

  async setStatus(id: string, status: StocktakeStatus, tx?: Tx) {
    return (tx ?? getPrisma()).stocktake.update({
      where: { id },
      data: {
        status,
        completedAt: status === StocktakeStatus.COMPLETED ? new Date() : null,
      },
    });
  },

  async addEntry(
    data: {
      stocktakeId: string;
      ingredientId: string;
      expectedQty: Prisma.Decimal | string | number;
      countedQty: Prisma.Decimal | string | number;
      variance: Prisma.Decimal | string | number;
      valuedAtCost?: Prisma.Decimal | string | number;
    },
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).stocktakeEntry.create({
      data: {
        stocktake: { connect: { id: data.stocktakeId } },
        ingredient: { connect: { id: data.ingredientId } },
        expectedQty: new Prisma.Decimal(data.expectedQty),
        countedQty: new Prisma.Decimal(data.countedQty),
        variance: new Prisma.Decimal(data.variance),
        valuedAtCost: new Prisma.Decimal(data.valuedAtCost ?? 0),
      },
    });
  },

  async findEntry(stocktakeId: string, ingredientId: string, tx?: Tx) {
    return (tx ?? getPrisma()).stocktakeEntry.findUnique({
      where: {
        stocktakeId_ingredientId: {
          stocktakeId,
          ingredientId,
        },
      },
    });
  },

  async setEntryReason(
    id: string,
    reasonCode: string,
    reasonNote: string | null,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).stocktakeEntry.update({
      where: { id },
      data: { reasonCode, reasonNote },
    });
  },

  async updateEntry(
    id: string,
    data: Prisma.StocktakeEntryUpdateInput,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).stocktakeEntry.update({
      where: { id },
      data,
    });
  },
};
