import { PaymentMethod, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { localDayRange } from '../lib/time';

type Tx = Prisma.TransactionClient;

export const paymentRepo = {
  async createMany(
    orderId: string,
    payments: Array<{
      method: PaymentMethod;
      amount: Prisma.Decimal | string | number;
      reference?: string | null;
    }>,
    tx?: Tx,
  ) {
    const client = tx ?? getPrisma();

    await client.payment.createMany({
      data: payments.map((payment) => ({
        orderId,
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference ?? null,
      })),
    });

    return client.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async findByOrderId(orderId: string, tx?: Tx) {
    return (tx ?? getPrisma()).payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async sumByOrderId(orderId: string, tx?: Tx) {
    const result = await (tx ?? getPrisma()).payment.aggregate({
      where: { orderId },
      _sum: { amount: true },
    });

    return result._sum.amount ?? new Prisma.Decimal(0);
  },

  async aggregateByMethodForDate(date: Date, tx?: Tx) {
    const { start, end } = localDayRange(date);
    const rows = await (tx ?? getPrisma()).payment.groupBy({
      by: ['method'],
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return rows.reduce<Record<PaymentMethod, Prisma.Decimal>>(
      (acc, row) => {
        acc[row.method] = row._sum.amount ?? new Prisma.Decimal(0);
        return acc;
      },
      {
        CASH: new Prisma.Decimal(0),
        CARD: new Prisma.Decimal(0),
        DEBT: new Prisma.Decimal(0),
      },
    );
  },
};
