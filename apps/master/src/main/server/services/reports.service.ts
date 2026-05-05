import { PaymentMethod, Prisma } from '@prisma/client';
import { expenseService } from './expense.service';
import { debtRepo } from '../repositories/debt.repo';
import { getPrisma } from '../lib/prisma';

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function dec(value: Prisma.Decimal | null | undefined) {
  return value ?? new Prisma.Decimal(0);
}

function decStr(value: Prisma.Decimal | null | undefined) {
  return dec(value).toFixed(0);
}

export const reportsService = {
  async daily(date: Date) {
    const prisma = getPrisma();
    const { start: dayStart, end: dayEnd } = dayBounds(date);

    const [closedOrders, canceledOrders, walkoutOrders, expenseSummary, repaymentTotals, openedToday, outstandingTotal] = await Promise.all([
      prisma.order.findMany({
        where: {
          status: 'CLOSED',
          closedAt: { gte: dayStart, lt: dayEnd },
        },
        include: {
          payments: true,
          waiter: { select: { id: true, fullName: true } },
          debt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          status: 'CANCELED',
          canceledAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      prisma.order.findMany({
        where: {
          status: 'WALKOUT',
          updatedAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      expenseService.listByDate(new Date(dayStart)),
      debtRepo.repaymentTotalsForDate(new Date(dayStart)),
      debtRepo.openedTodaySummary(new Date(dayStart)),
      debtRepo.sumOutstandingAsOf(new Date(dayStart)),
    ]);

    let grossSales = new Prisma.Decimal(0);
    let discounts = new Prisma.Decimal(0);
    let debtSales = new Prisma.Decimal(0);
    let serviceCharge = new Prisma.Decimal(0);
    let orderCash = new Prisma.Decimal(0);
    let orderCard = new Prisma.Decimal(0);

    const perWaiterMap = new Map<string, { waiterId: string; waiterName: string; orders: number; revenue: Prisma.Decimal; serviceEarned: Prisma.Decimal }>();

    for (const order of closedOrders) {
      grossSales = grossSales.plus(dec(order.subtotalSnapshot));
      discounts = discounts.plus(dec(order.discountAmountSnapshot));
      serviceCharge = serviceCharge.plus(dec(order.serviceChargeSnapshot));

      const waiterAgg = perWaiterMap.get(order.waiterId) ?? {
        waiterId: order.waiterId,
        waiterName: order.waiter.fullName,
        orders: 0,
        revenue: new Prisma.Decimal(0),
        serviceEarned: new Prisma.Decimal(0),
      };
      waiterAgg.orders += 1;
      waiterAgg.revenue = waiterAgg.revenue.plus(dec(order.subtotalSnapshot).minus(dec(order.discountAmountSnapshot)));
      waiterAgg.serviceEarned = waiterAgg.serviceEarned.plus(dec(order.serviceChargeSnapshot));
      perWaiterMap.set(order.waiterId, waiterAgg);

      for (const payment of order.payments) {
        if (payment.method === PaymentMethod.CASH) {
          orderCash = orderCash.plus(payment.amount);
        } else if (payment.method === PaymentMethod.CARD) {
          orderCard = orderCard.plus(payment.amount);
        } else if (payment.method === PaymentMethod.DEBT) {
          debtSales = debtSales.plus(payment.amount);
        }
      }
    }

    const debtRepaymentsCash = repaymentTotals.CASH;
    const debtRepaymentsCard = repaymentTotals.CARD;
    const netSales = grossSales.minus(discounts);
    const realCashIn = orderCash.plus(orderCard).plus(debtRepaymentsCash).plus(debtRepaymentsCard);
    const expenseNet = new Prisma.Decimal(expenseSummary.totals.net);
    const salesBasedProfit = netSales.minus(expenseNet);
    const cashflowBasedNet = realCashIn.minus(expenseNet);

    return {
      date: dayStart.toISOString().slice(0, 10),
      sales: {
        closedOrders: closedOrders.length,
        canceledOrders: canceledOrders.length,
        walkoutOrders: walkoutOrders.length,
        grossSales: decStr(grossSales),
        discounts: decStr(discounts),
        netSales: decStr(netSales),
        debtSales: decStr(debtSales),
        serviceCharge: decStr(serviceCharge),
      },
      cashflow: {
        orderCash: decStr(orderCash),
        orderCard: decStr(orderCard),
        debtRepaymentsCash: decStr(debtRepaymentsCash),
        debtRepaymentsCard: decStr(debtRepaymentsCard),
        realCashIn: decStr(realCashIn),
      },
      expenses: {
        gross: expenseSummary.totals.gross,
        reversal: expenseSummary.totals.reversal,
        net: expenseSummary.totals.net,
        byCategory: expenseSummary.byCategory,
      },
      results: {
        salesBasedProfit: decStr(salesBasedProfit),
        cashflowBasedNet: decStr(cashflowBasedNet),
      },
      debtSnapshot: {
        openedTodayCount: openedToday.count,
        openedTodayAmount: decStr(openedToday.amount),
        repaidTodayAmount: decStr(debtRepaymentsCash.plus(debtRepaymentsCard)),
        outstandingTotal: decStr(outstandingTotal),
      },
      perWaiter: Array.from(perWaiterMap.values()).map((item) => ({
        waiterId: item.waiterId,
        waiterName: item.waiterName,
        orders: item.orders,
        revenue: decStr(item.revenue),
        serviceEarned: decStr(item.serviceEarned),
      })),
      cancellations: canceledOrders.map((order) => ({
        orderId: order.id,
        canceledAt: order.canceledAt?.toISOString() ?? order.updatedAt.toISOString(),
        canceledBy: 'system',
        reason: order.cancelReason ?? '',
      })),
      walkouts: walkoutOrders.map((order) => ({
        orderId: order.id,
        markedAt: order.updatedAt.toISOString(),
        markedBy: order.approvedById ?? 'unknown',
        amount: decStr(order.totalSnapshot),
        reason: order.cancelReason ?? '',
      })),
    };
  },

  async monthly(monthStart: Date) {
    const start = new Date(monthStart);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const monthEnd = new Date(start);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const daily = [];
    const cursor = new Date(start);
    while (cursor < monthEnd) {
      daily.push(await this.daily(new Date(cursor)));
      cursor.setDate(cursor.getDate() + 1);
    }

    const totals = daily.reduce((acc, day) => ({
      grossSales: acc.grossSales.plus(new Prisma.Decimal(day.sales.grossSales)),
      discounts: acc.discounts.plus(new Prisma.Decimal(day.sales.discounts)),
      netSales: acc.netSales.plus(new Prisma.Decimal(day.sales.netSales)),
      debtSales: acc.debtSales.plus(new Prisma.Decimal(day.sales.debtSales)),
      realCashIn: acc.realCashIn.plus(new Prisma.Decimal(day.cashflow.realCashIn)),
      expensesNet: acc.expensesNet.plus(new Prisma.Decimal(day.expenses.net)),
      salesBasedProfit: acc.salesBasedProfit.plus(new Prisma.Decimal(day.results.salesBasedProfit)),
      cashflowBasedNet: acc.cashflowBasedNet.plus(new Prisma.Decimal(day.results.cashflowBasedNet)),
    }), {
      grossSales: new Prisma.Decimal(0),
      discounts: new Prisma.Decimal(0),
      netSales: new Prisma.Decimal(0),
      debtSales: new Prisma.Decimal(0),
      realCashIn: new Prisma.Decimal(0),
      expensesNet: new Prisma.Decimal(0),
      salesBasedProfit: new Prisma.Decimal(0),
      cashflowBasedNet: new Prisma.Decimal(0),
    });

    const monthOutstanding = await debtRepo.sumOutstandingAsOf(new Date(monthEnd.getTime() - 1));

    return {
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      totals: {
        grossSales: decStr(totals.grossSales),
        discounts: decStr(totals.discounts),
        netSales: decStr(totals.netSales),
        debtSales: decStr(totals.debtSales),
        realCashIn: decStr(totals.realCashIn),
        expensesNet: decStr(totals.expensesNet),
        salesBasedProfit: decStr(totals.salesBasedProfit),
        cashflowBasedNet: decStr(totals.cashflowBasedNet),
        outstandingDebtEndOfMonth: decStr(monthOutstanding),
      },
      daily,
    };
  },
};
