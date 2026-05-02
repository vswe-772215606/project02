import { PaymentMethod, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

function dayRange(date: Date) {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);

  const to = new Date(date);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

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
    const { from, to } = dayRange(date);
    const rows = await (tx ?? getPrisma()).payment.groupBy({
      by: ['method'],
      where: {
        createdAt: {
          gte: from,
          lte: to,
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
      },
    );
  },
};
