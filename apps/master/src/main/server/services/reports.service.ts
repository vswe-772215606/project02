import { PaymentMethod, Prisma } from '@prisma/client';
import { dayRange, dayKey } from '../lib/date';
import { computeRealCashIn } from '../lib/finance-formulas';
import { expenseService } from './expense.service';
import { getPrisma } from '../lib/prisma';
import { dailyCloseRepo } from '../repositories/dailyClose.repo';

const reportOrderInclude = {
  payments: true,
  debt: true,
  table: true,
  waiter: {
    select: {
      id: true,
      fullName: true,
    },
  },
  lines: {
    include: {
      menuItem: {
        include: {
          category: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} satisfies Prisma.OrderInclude;

const reportDebtInclude = {
  order: {
    include: {
      table: true,
      waiter: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  },
  repayments: {
    include: {
      receivedBy: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: [{ paidAt: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.DebtInclude;

type ReportOrder = Prisma.OrderGetPayload<{ include: typeof reportOrderInclude }>;
type ReportDebt = Prisma.DebtGetPayload<{ include: typeof reportDebtInclude }>;

function dayBounds(date: Date) {
  const { from: start, to: end } = dayRange(date);
  return { start, end };
}

function dec(value: Prisma.Decimal | null | undefined) {
  return value ?? new Prisma.Decimal(0);
}

function decStr(value: Prisma.Decimal | null | undefined) {
  return dec(value).toFixed(0);
}

function shortOrderNumber(id: string) {
  return id.slice(-6).toUpperCase();
}

function isWithinDay(value: Date | null | undefined, dayStart: Date, dayEnd: Date) {
  if (!value) return false;
  return value >= dayStart && value < dayEnd;
}

function paymentBreakdown(payments: Array<{ method: PaymentMethod; amount: Prisma.Decimal }>) {
  let cash = new Prisma.Decimal(0);
  let card = new Prisma.Decimal(0);
  let debt = new Prisma.Decimal(0);

  for (const payment of payments) {
    if (payment.method === PaymentMethod.CASH) {
      cash = cash.plus(payment.amount);
    } else if (payment.method === PaymentMethod.CARD) {
      card = card.plus(payment.amount);
    } else if (payment.method === PaymentMethod.DEBT) {
      debt = debt.plus(payment.amount);
    }
  }

  return { cash, card, debt };
}

function terminalMoment(order: ReportOrder) {
  return order.closedAt ?? order.canceledAt ?? order.updatedAt;
}

function buildOrdersTable(orders: ReportOrder[], status: 'CLOSED' | 'CANCELED' | 'WALKOUT') {
  return orders.map((order) => {
    const payments = paymentBreakdown(order.payments);
    const gross = dec(order.subtotalSnapshot);
    const discount = dec(order.discountAmountSnapshot);

    return {
      orderId: order.id,
      orderNumber: shortOrderNumber(order.id),
      at: terminalMoment(order).toISOString(),
      tableName: order.table?.name ?? null,
      waiterName: order.waiter.fullName,
      status,
      gross: decStr(gross),
      discount: decStr(discount),
      net: decStr(gross.minus(discount)),
      service: decStr(order.serviceChargeSnapshot),
      cash: decStr(payments.cash),
      card: decStr(payments.card),
      debt: decStr(payments.debt),
    };
  });
}

function buildMealSales(closedOrders: ReportOrder[]) {
  const mealMap = new Map<string, {
    mealName: string;
    categoryName: string | null;
    orderIds: Set<string>;
    qtyOrdered: number;
    grossSales: Prisma.Decimal;
  }>();

  for (const order of closedOrders) {
    for (const line of order.lines) {
      if (line.isCanceled) continue;

      const key = `${line.nameSnapshot}::${line.menuItem.category.name}`;
      const existing = mealMap.get(key) ?? {
        mealName: line.nameSnapshot,
        categoryName: line.menuItem.category.name,
        orderIds: new Set<string>(),
        qtyOrdered: 0,
        grossSales: new Prisma.Decimal(0),
      };

      existing.orderIds.add(order.id);
      existing.qtyOrdered += line.quantity;
      existing.grossSales = existing.grossSales.plus(line.unitPriceSnapshot.mul(line.quantity));
      mealMap.set(key, existing);
    }
  }

  return Array.from(mealMap.values())
    .map((item) => ({
      mealName: item.mealName,
      categoryName: item.categoryName,
      ordersCount: item.orderIds.size,
      qtyOrdered: item.qtyOrdered,
      grossSales: decStr(item.grossSales),
      avgPerOrder: (item.qtyOrdered / item.orderIds.size).toFixed(2),
    }))
    .sort((a, b) => {
      if (b.qtyOrdered !== a.qtyOrdered) return b.qtyOrdered - a.qtyOrdered;
      return Number(b.grossSales) - Number(a.grossSales);
    });
}

function buildKitchenProduction(_orders: ReportOrder[]) {
  // Kitchen subsystem removed. The Z-report no longer tracks per-line kitchen
  // production stats. The renderer still references `kitchenProduction` — Phase D
  // strips it. Returning an empty array keeps the API stable in the interim.
  return [] as Array<{
    mealName: string;
    qtyOrdered: number;
    qtySent: number;
    qtyStarted: number;
    qtyReady: number;
    qtyCanceledBeforeCooking: number;
    qtyCanceledAfterStart: number;
  }>;
}

function buildDebtLedger(debts: ReportDebt[], dayStart: Date, dayEnd: Date) {
  const rows = debts
    .map((debt) => {
      const repaidToday = debt.repayments
        .filter((repayment) => isWithinDay(repayment.paidAt, dayStart, dayEnd))
        .reduce((sum, repayment) => sum.plus(repayment.amount), new Prisma.Decimal(0));

      const repaidUpToDayEnd = debt.repayments
        .filter((repayment) => repayment.paidAt < dayEnd)
        .reduce((sum, repayment) => sum.plus(repayment.amount), new Prisma.Decimal(0));

      const writtenOffAsOfDay = debt.writtenOffAt !== null && debt.writtenOffAt < dayEnd;
      // For a written-off debt the principal is recognized as a loss and is no
      // longer considered outstanding. The original is kept for the audit trail.
      const remainingAtDayEnd = writtenOffAsOfDay
        ? new Prisma.Decimal(0)
        : dec(debt.originalAmount).minus(repaidUpToDayEnd);
      const totalRepaidAtDayEnd = dec(debt.originalAmount).minus(remainingAtDayEnd);
      const lastRepaymentAt = debt.repayments
        .filter((repayment) => repayment.paidAt < dayEnd)
        .at(-1)?.paidAt ?? null;

      let statusAsOfDay: 'OPEN' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF' = 'OPEN';
      if (writtenOffAsOfDay) {
        statusAsOfDay = 'WRITTEN_OFF';
      } else if (remainingAtDayEnd.lte(0)) {
        statusAsOfDay = 'PAID';
      } else if (totalRepaidAtDayEnd.gt(0)) {
        statusAsOfDay = 'PARTIAL';
      }

      return {
        debtId: debt.id,
        openedAt: debt.openedAt.toISOString(),
        orderNumber: shortOrderNumber(debt.orderId),
        debtorName: debt.debtorName,
        debtorPhone: debt.debtorPhone,
        orderTotal: decStr(debt.order.totalSnapshot),
        originalAmount: decStr(debt.originalAmount),
        repaidToday: decStr(repaidToday),
        totalRepaid: decStr(totalRepaidAtDayEnd),
        remainingAmount: decStr(remainingAtDayEnd),
        status: statusAsOfDay,
        lastRepaymentAt: lastRepaymentAt?.toISOString() ?? null,
        openedToday: isWithinDay(debt.openedAt, dayStart, dayEnd),
        writtenOffAt: debt.writtenOffAt?.toISOString() ?? null,
        writtenOffReason: debt.writtenOffReason,
      };
    })
    .filter((debt) => debt.openedToday || debt.repaidToday !== '0' || debt.remainingAmount !== '0' || debt.status === 'WRITTEN_OFF');

  return rows.sort((a, b) => {
    if (a.remainingAmount !== b.remainingAmount) {
      return Number(b.remainingAmount) - Number(a.remainingAmount);
    }
    return a.openedAt.localeCompare(b.openedAt);
  });
}

export const reportsService = {
  async daily(date: Date) {
    const prisma = getPrisma();
    const { start: dayStart, end: dayEnd } = dayBounds(date);

    const [closedOrders, canceledOrders, walkoutOrders, expenseSummary, debts, purchases, expenseReturnsAgg, closeRow] = await Promise.all([
      prisma.order.findMany({
        where: {
          status: 'CLOSED',
          closedAt: { gte: dayStart, lt: dayEnd },
        },
        include: reportOrderInclude,
        orderBy: { closedAt: 'asc' },
      }),
      prisma.order.findMany({
        where: {
          status: 'CANCELED',
          canceledAt: { gte: dayStart, lt: dayEnd },
        },
        include: reportOrderInclude,
        orderBy: { canceledAt: 'asc' },
      }),
      prisma.order.findMany({
        where: {
          status: 'WALKOUT',
          updatedAt: { gte: dayStart, lt: dayEnd },
        },
        include: reportOrderInclude,
        orderBy: { updatedAt: 'asc' },
      }),
      expenseService.listByDate(new Date(dayStart)),
      prisma.debt.findMany({
        where: {
          openedAt: {
            lt: dayEnd,
          },
        },
        include: reportDebtInclude,
        orderBy: [{ openedAt: 'asc' }],
      }),
      prisma.purchase.findMany({
        where: { occurredAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true, totalCostUzs: true, isAdjustment: true },
      }),
      prisma.expenseReturn.aggregate({
        where: { receivedAt: { gte: dayStart, lt: dayEnd } },
        _sum: { amount: true },
      }),
      dailyCloseRepo.findByDate(dayKey(dayStart)),
    ]);

    let grossSales = new Prisma.Decimal(0);
    let discounts = new Prisma.Decimal(0);
    let serviceCharge = new Prisma.Decimal(0);

    const perWaiterMap = new Map<string, {
      waiterId: string;
      waiterName: string;
      orders: number;
      revenue: Prisma.Decimal;
      serviceEarned: Prisma.Decimal;
    }>();

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
    }

    const terminalOrders = [...closedOrders, ...canceledOrders, ...walkoutOrders];
    const ordersTable = [
      ...buildOrdersTable(closedOrders, 'CLOSED'),
      ...buildOrdersTable(canceledOrders, 'CANCELED'),
      ...buildOrdersTable(walkoutOrders, 'WALKOUT'),
    ].sort((a, b) => a.at.localeCompare(b.at));

    const mealSales = buildMealSales(closedOrders);
    const kitchenProduction = buildKitchenProduction(terminalOrders);
    const debtLedger = buildDebtLedger(debts, dayStart, dayEnd);

    const debtRepaymentRows = debts
      .flatMap((debt) =>
        debt.repayments
          .filter((repayment) => isWithinDay(repayment.paidAt, dayStart, dayEnd))
          .map((repayment) => ({
            id: repayment.id,
            amount: decStr(repayment.amount),
            method: repayment.method,
            debtorName: debt.debtorName,
            orderNumber: shortOrderNumber(debt.orderId),
            paidAt: repayment.paidAt.toISOString(),
            receivedByName: repayment.receivedBy.fullName,
          })),
      )
      .sort((a, b) => a.paidAt.localeCompare(b.paidAt));

    const debtRepayments = debts.flatMap((debt) =>
      debt.repayments.filter((r) => isWithinDay(r.paidAt, dayStart, dayEnd)),
    );
    const expenseReturnsTotal = expenseReturnsAgg._sum.amount ?? new Prisma.Decimal(0);
    const cash = computeRealCashIn({
      closedOrders,
      debtRepayments,
      expenseReturnsTotal,
    });
    const orderCash = cash.orderCash;
    const orderCard = cash.orderCard;
    const debtSales = cash.debtOpened;
    const debtRepaymentsCash = cash.debtRepaymentsCash;
    const debtRepaymentsCard = cash.debtRepaymentsCard;

    const openedTodayDebts = debts.filter((debt) => isWithinDay(debt.openedAt, dayStart, dayEnd));
    const openedTodayAmount = openedTodayDebts.reduce(
      (sum, debt) => sum.plus(dec(debt.originalAmount)),
      new Prisma.Decimal(0),
    );
    const outstandingTotal = debtLedger.reduce(
      (sum, debt) => sum.plus(new Prisma.Decimal(debt.remainingAmount)),
      new Prisma.Decimal(0),
    );

    const netSales = grossSales.minus(discounts);
    // Spec §6.2.5: realCashIn = orderCash + orderCard + debtRepaymentsCash +
    // debtRepaymentsCard + expenseReturnsTotal. Yagona util ham ADMIN, ham
    // OWNER javobida bir xil natija beradi.
    const realCashIn = cash.realCashIn;
    const expenseNet = new Prisma.Decimal(expenseSummary.totals.net);
    // Operating expense for profit math: excludes pending-repayable rows; for
    // written-off repayables, counts only the unrecovered (loss) portion.
    const operatingExpense = new Prisma.Decimal(expenseSummary.totals.operating);
    const pendingRepayable = new Prisma.Decimal(expenseSummary.totals.pendingRepayable);
    const salesBasedProfit = netSales.minus(operatingExpense);
    const cashflowBasedNet = realCashIn.minus(expenseNet);
    const billedTotal = netSales.plus(serviceCharge);
    const paymentTotal = orderCash.plus(orderCard).plus(debtSales);
    const paymentDifference = billedTotal.minus(paymentTotal);

    // Xarid jami (purchase.occurredAt = D) va expense-non-purchase ajratish —
    // renderer endi ikki marta sanay olmaydi.
    const purchasesTotal = purchases.reduce(
      (sum, p) => sum.plus(p.totalCostUzs),
      new Prisma.Decimal(0),
    );
    const expensesNonPurchase = expenseNet.minus(purchasesTotal);
    const expensesTotal = expensesNonPurchase.plus(purchasesTotal);

    // Tuzatishlar (isAdjustment=true) — yopilgan kun snapshotidan keyin
    // kelgan yozuvlar.
    const [adjExpenses, adjPurchases] = await Promise.all([
      prisma.expense.findMany({
        where: { occurredAt: { gte: dayStart, lt: dayEnd }, isAdjustment: true },
        include: { category: { select: { id: true, name: true } } },
      }),
      prisma.purchase.findMany({
        where: { occurredAt: { gte: dayStart, lt: dayEnd }, isAdjustment: true },
        include: { ingredient: { select: { id: true, name: true } } },
      }),
    ]);
    const adjustments = {
      expenseCount: adjExpenses.length,
      expenseTotal: adjExpenses
        .reduce((sum, e) => (e.status === 'REVERSAL' ? sum.minus(e.amount) : sum.plus(e.amount)), new Prisma.Decimal(0))
        .toFixed(0),
      purchaseCount: adjPurchases.length,
      purchaseTotal: adjPurchases
        .reduce((sum, p) => sum.plus(p.totalCostUzs), new Prisma.Decimal(0))
        .toFixed(0),
    };

    const closedEnvelope = closeRow
      ? {
          closedAt: closeRow.closedAt.toISOString(),
          closedByName: closeRow.closedBy.fullName,
          note: closeRow.note,
          snapshot: closeRow.snapshot,
        }
      : null;

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
        operating: expenseSummary.totals.operating,
        pendingRepayable: expenseSummary.totals.pendingRepayable,
        byCategory: expenseSummary.byCategory,
        items: expenseSummary.items,
      },
      // Renderer ikki marta sanamasligi uchun outflow shu shaklda berildi.
      // expensesTotal = expensesNonPurchase + purchasesTotal (foydalanuvchi
      // qo'lda qo'shsa ham hech qachon xato bo'lmaydi).
      outflow: {
        expensesNonPurchase: decStr(expensesNonPurchase),
        purchasesTotal: decStr(purchasesTotal),
        expensesTotal: decStr(expensesTotal),
        purchasesCount: purchases.length,
      },
      closed: closedEnvelope,
      adjustments,
      results: {
        salesBasedProfit: decStr(salesBasedProfit),
        cashflowBasedNet: decStr(cashflowBasedNet),
      },
      checks: {
        salesVsPayments: {
          subtotal: decStr(grossSales),
          discounts: decStr(discounts),
          netSales: decStr(netSales),
          serviceCharge: decStr(serviceCharge),
          billedTotal: decStr(billedTotal),
          paymentTotal: decStr(paymentTotal),
          difference: decStr(paymentDifference),
        },
        expenses: {
          recordedExpense: expenseSummary.totals.gross,
          reversalAmount: expenseSummary.totals.reversal,
          netExpense: expenseSummary.totals.net,
        },
        debts: {
          openedTodayAmount: decStr(openedTodayAmount),
          repaidTodayAmount: decStr(debtRepaymentsCash.plus(debtRepaymentsCard)),
          outstandingTotal: decStr(outstandingTotal),
        },
      },
      debtSnapshot: {
        openedTodayCount: openedTodayDebts.length,
        openedTodayAmount: decStr(openedTodayAmount),
        repaidTodayAmount: decStr(debtRepaymentsCash.plus(debtRepaymentsCard)),
        repayments: debtRepaymentRows,
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
      ordersTable,
      mealSales,
      kitchenProduction,
      debtLedger,
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
      closedOrders: acc.closedOrders + day.sales.closedOrders,
      canceledOrders: acc.canceledOrders + day.sales.canceledOrders,
      walkoutOrders: acc.walkoutOrders + day.sales.walkoutOrders,
      grossSales: acc.grossSales.plus(new Prisma.Decimal(day.sales.grossSales)),
      discounts: acc.discounts.plus(new Prisma.Decimal(day.sales.discounts)),
      netSales: acc.netSales.plus(new Prisma.Decimal(day.sales.netSales)),
      debtSales: acc.debtSales.plus(new Prisma.Decimal(day.sales.debtSales)),
      serviceCharge: acc.serviceCharge.plus(new Prisma.Decimal(day.sales.serviceCharge)),
      realCashIn: acc.realCashIn.plus(new Prisma.Decimal(day.cashflow.realCashIn)),
      expensesNet: acc.expensesNet.plus(new Prisma.Decimal(day.expenses.net)),
      salesBasedProfit: acc.salesBasedProfit.plus(new Prisma.Decimal(day.results.salesBasedProfit)),
      cashflowBasedNet: acc.cashflowBasedNet.plus(new Prisma.Decimal(day.results.cashflowBasedNet)),
    }), {
      closedOrders: 0,
      canceledOrders: 0,
      walkoutOrders: 0,
      grossSales: new Prisma.Decimal(0),
      discounts: new Prisma.Decimal(0),
      netSales: new Prisma.Decimal(0),
      debtSales: new Prisma.Decimal(0),
      serviceCharge: new Prisma.Decimal(0),
      realCashIn: new Prisma.Decimal(0),
      expensesNet: new Prisma.Decimal(0),
      salesBasedProfit: new Prisma.Decimal(0),
      cashflowBasedNet: new Prisma.Decimal(0),
    });

    const monthDebtRows = daily.at(-1)?.debtLedger ?? [];
    const monthOutstanding = monthDebtRows.reduce(
      (sum, row) => sum.plus(new Prisma.Decimal(row.remainingAmount)),
      new Prisma.Decimal(0),
    );

    return {
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      totals: {
        closedOrders: totals.closedOrders,
        canceledOrders: totals.canceledOrders,
        walkoutOrders: totals.walkoutOrders,
        grossSales: decStr(totals.grossSales),
        discounts: decStr(totals.discounts),
        netSales: decStr(totals.netSales),
        debtSales: decStr(totals.debtSales),
        serviceCharge: decStr(totals.serviceCharge),
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
