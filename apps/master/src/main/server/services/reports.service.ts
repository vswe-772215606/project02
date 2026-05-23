import { ExpenseStatus, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { expenseService } from './expense.service';
import { getPrisma } from '../lib/prisma';

// Same constant as finance.service — ingredient-purchase expenses live here
// and are split out from "operating expenses" in the P&L view.
const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

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

    const [closedOrders, canceledOrders, walkoutOrders, expenseSummary, debts] = await Promise.all([
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
    ]);

    let grossSales = new Prisma.Decimal(0);
    let discounts = new Prisma.Decimal(0);
    let debtSales = new Prisma.Decimal(0);
    let serviceCharge = new Prisma.Decimal(0);
    let orderCash = new Prisma.Decimal(0);
    let orderCard = new Prisma.Decimal(0);

    const perWaiterMap = new Map<string, {
      waiterId: string;
      waiterName: string;
      orders: number;
      revenue: Prisma.Decimal;
      serviceEarned: Prisma.Decimal;
    }>();

    for (const order of closedOrders) {
      const payments = paymentBreakdown(order.payments);

      grossSales = grossSales.plus(dec(order.subtotalSnapshot));
      discounts = discounts.plus(dec(order.discountAmountSnapshot));
      serviceCharge = serviceCharge.plus(dec(order.serviceChargeSnapshot));
      orderCash = orderCash.plus(payments.cash);
      orderCard = orderCard.plus(payments.card);
      debtSales = debtSales.plus(payments.debt);

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

    const debtRepaymentsCash = debtRepaymentRows
      .filter((row) => row.method === PaymentMethod.CASH)
      .reduce((sum, row) => sum.plus(new Prisma.Decimal(row.amount)), new Prisma.Decimal(0));
    const debtRepaymentsCard = debtRepaymentRows
      .filter((row) => row.method === PaymentMethod.CARD)
      .reduce((sum, row) => sum.plus(new Prisma.Decimal(row.amount)), new Prisma.Decimal(0));

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
    const realCashIn = orderCash.plus(orderCard).plus(debtRepaymentsCash).plus(debtRepaymentsCard);
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

  /**
   * Cross-category P&L + Cash-basis summary for an arbitrary date range.
   * Drives the "Umumiy" tab in ReportsPage. Two parallel views:
   *
   *   P&L (accrual)
   *     Kirim       = sotuv revenue (per menu-category)
   *     Chiqim      = COGS (sotilgan ovqatlar masalliqlari)
   *                 + operatsion expenses (xaridlar EXCLUDED — they're zaxira)
   *     Sof foyda   = revenue − cogs − opex
   *
   *   Cash basis (haqiqiy pul harakati)
   *     Kirim       = cash + card from sales + debt collections + expense returns
   *     Chiqim      = ALL expenses (operating + ingredient purchases)
   *     Farq        = kirim − chiqim   (drawer movement over the range)
   *
   * Range is local-day inclusive: [from 00:00, to 23:59].
   */
  async summary(input: { from: Date; to: Date }) {
    const from = new Date(input.from); from.setHours(0, 0, 0, 0);
    const to = new Date(input.to); to.setHours(23, 59, 59, 999);
    const prisma = getPrisma();

    // ─── Sales side: CLOSED orders' lines in range ───────────────────────
    const lines = await prisma.orderLine.findMany({
      where: {
        isCanceled: false,
        order: {
          status: OrderStatus.CLOSED,
          closedAt: { gte: from, lte: to },
        },
      },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            kind: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    type MenuCatRow = {
      categoryId: string;
      categoryName: string;
      qty: number;
      revenue: Prisma.Decimal;
      cogs: Prisma.Decimal;
    };
    const menuCatMap = new Map<string, MenuCatRow>();
    let totalRevenue = new Prisma.Decimal(0);
    let totalCogs = new Prisma.Decimal(0);
    for (const line of lines) {
      const cid = line.menuItem.category.id;
      const row = menuCatMap.get(cid) ?? {
        categoryId: cid,
        categoryName: line.menuItem.category.name,
        qty: 0,
        revenue: new Prisma.Decimal(0),
        cogs: new Prisma.Decimal(0),
      };
      const rev = line.unitPriceSnapshot.mul(line.quantity);
      row.qty += line.quantity;
      row.revenue = row.revenue.plus(rev);
      row.cogs = row.cogs.plus(line.cogsSnapshot ?? new Prisma.Decimal(0));
      menuCatMap.set(cid, row);
      totalRevenue = totalRevenue.plus(rev);
      totalCogs = totalCogs.plus(line.cogsSnapshot ?? new Prisma.Decimal(0));
    }
    const incomesByMenuCategory = Array.from(menuCatMap.values())
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    // Per-payment-method sales breakdown (for the Cash basis view)
    const closedOrders = await prisma.order.findMany({
      where: {
        status: OrderStatus.CLOSED,
        closedAt: { gte: from, lte: to },
      },
      include: { payments: true },
    });
    let salesCash = new Prisma.Decimal(0);
    let salesCard = new Prisma.Decimal(0);
    let salesDebt = new Prisma.Decimal(0);
    for (const o of closedOrders) {
      for (const p of o.payments) {
        if (p.method === PaymentMethod.CASH) salesCash = salesCash.plus(p.amount);
        else if (p.method === PaymentMethod.CARD) salesCard = salesCard.plus(p.amount);
        else if (p.method === PaymentMethod.DEBT) salesDebt = salesDebt.plus(p.amount);
      }
    }

    // ─── Other inflows in range (non-sales cash in) ──────────────────────
    const repayments = await prisma.debtRepayment.findMany({
      where: { paidAt: { gte: from, lte: to } },
      select: { amount: true, method: true },
    });
    let debtRepaidCash = new Prisma.Decimal(0);
    let debtRepaidCard = new Prisma.Decimal(0);
    for (const r of repayments) {
      if (r.method === PaymentMethod.CASH) debtRepaidCash = debtRepaidCash.plus(r.amount);
      else if (r.method === PaymentMethod.CARD) debtRepaidCard = debtRepaidCard.plus(r.amount);
    }
    const debtRepaidTotal = debtRepaidCash.plus(debtRepaidCard);

    const expReturnsAgg = await prisma.expenseReturn.aggregate({
      where: { receivedAt: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    const expenseReturns = expReturnsAgg._sum.amount ?? new Prisma.Decimal(0);

    // ─── Expense side: aggregate by category for the whole range ─────────
    // Reversed/reversal pairs cancel out (gross − reversal = net). Repayable
    // expenses contribute only their net loss (written-off amount minus
    // returns); pending repayables don't hit the P&L. We replicate the same
    // rules expenseService.listByDate uses, but for a date range.
    const expenses = await prisma.expense.findMany({
      where: { occurredAt: { gte: from, lte: to } },
      include: {
        category: { select: { id: true, name: true } },
        returns: { select: { amount: true } },
      },
    });

    type ExpCatRow = {
      categoryId: string;
      categoryName: string;
      cashGross: Prisma.Decimal;     // ACTIVE+REVERSED − REVERSAL (cash that left, ignoring repayable nuances)
      operating: Prisma.Decimal;     // P&L operating contribution (excludes pending repayables)
    };
    const expCatMap = new Map<string, ExpCatRow>();
    let cashOutTotal = new Prisma.Decimal(0);
    let operatingTotalAll = new Prisma.Decimal(0);

    for (const e of expenses) {
      const row = expCatMap.get(e.categoryId) ?? {
        categoryId: e.categoryId,
        categoryName: e.category.name,
        cashGross: new Prisma.Decimal(0),
        operating: new Prisma.Decimal(0),
      };

      // Cash drawer side (net amount that left or returned via this expense row)
      let cashDelta = new Prisma.Decimal(0);
      if (e.status === ExpenseStatus.ACTIVE || e.status === ExpenseStatus.REVERSED) {
        cashDelta = e.amount;
      } else if (e.status === ExpenseStatus.REVERSAL) {
        cashDelta = e.amount.neg();
      }
      row.cashGross = row.cashGross.plus(cashDelta);
      cashOutTotal = cashOutTotal.plus(cashDelta);

      // P&L (operating) side: matches expense.service.listByDate's math
      if (e.status === ExpenseStatus.ACTIVE || e.status === ExpenseStatus.REVERSED) {
        if (!e.repayable) {
          row.operating = row.operating.plus(e.amount);
          operatingTotalAll = operatingTotalAll.plus(e.amount);
        } else if (e.writtenOffAt) {
          const returned = e.returns.reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0));
          const loss = e.amount.minus(returned);
          row.operating = row.operating.plus(loss);
          operatingTotalAll = operatingTotalAll.plus(loss);
        }
        // pending-repayable: NOT counted as P&L expense yet
      } else if (e.status === ExpenseStatus.REVERSAL) {
        row.operating = row.operating.minus(e.amount);
        operatingTotalAll = operatingTotalAll.minus(e.amount);
      }

      expCatMap.set(e.categoryId, row);
    }

    const expensesByCategoryCash = Array.from(expCatMap.values())
      .filter((r) => !r.cashGross.isZero())
      .map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        amount: r.cashGross.toFixed(0),
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    // P&L view: exclude ingredient-purchase category from "operating", since
    // those land as COGS when the dish is sold (avoids double-count).
    const expensesByCategoryPnl = Array.from(expCatMap.values())
      .filter((r) => r.categoryId !== INGREDIENT_EXPENSE_CATEGORY_ID && !r.operating.isZero())
      .map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        amount: r.operating.toFixed(0),
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    const operatingExclIngredients = (expCatMap.get(INGREDIENT_EXPENSE_CATEGORY_ID)?.operating ?? new Prisma.Decimal(0));
    const operatingForPnl = operatingTotalAll.minus(operatingExclIngredients);

    // ─── Identity sums ───────────────────────────────────────────────────
    // P&L profit = revenue − COGS − operating (ingredient excluded)
    const pnlProfit = totalRevenue.minus(totalCogs).minus(operatingForPnl);

    // Cash basis:
    //   totalIn  = cash sales + card sales + debt collections + expense returns
    //   totalOut = sum of all expense cash deltas (includes ingredient purchases)
    //   farq     = totalIn − totalOut
    const cashTotalIn = salesCash.plus(salesCard).plus(debtRepaidTotal).plus(expenseReturns);
    const cashFarq = cashTotalIn.minus(cashOutTotal);

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),

      // Incomes — both views share these (revenue recognition is the same)
      incomes: {
        byMenuCategory: incomesByMenuCategory.map((r) => ({
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          qty: r.qty,
          revenue: r.revenue.toFixed(0),
          cogs: r.cogs.toFixed(0),
          profit: r.revenue.minus(r.cogs).toFixed(0),
        })),
        totals: {
          qty: lines.reduce((n, l) => n + l.quantity, 0),
          revenue: totalRevenue.toFixed(0),
          cogs: totalCogs.toFixed(0),
        },
        // Non-sales inflows (only relevant to cash basis but useful for both)
        other: {
          debtRepaid: debtRepaidTotal.toFixed(0),
          expenseReturns: expenseReturns.toFixed(0),
        },
        // For the cash-basis view: breakdown of sales by payment method
        salesByPaymentMethod: {
          cash: salesCash.toFixed(0),
          card: salesCard.toFixed(0),
          debt: salesDebt.toFixed(0),
        },
      },

      // P&L (accrual) — sof foyda
      pnl: {
        expensesByCategory: expensesByCategoryPnl,
        revenue: totalRevenue.toFixed(0),
        cogs: totalCogs.toFixed(0),
        operatingExpense: operatingForPnl.toFixed(0),
        profit: pnlProfit.toFixed(0),
      },

      // Cash basis — haqiqiy pul harakati
      cash: {
        expensesByCategory: expensesByCategoryCash,
        salesInflow: salesCash.plus(salesCard).toFixed(0),
        debtRepaid: debtRepaidTotal.toFixed(0),
        expenseReturns: expenseReturns.toFixed(0),
        totalIn: cashTotalIn.toFixed(0),
        totalOut: cashOutTotal.toFixed(0),
        farq: cashFarq.toFixed(0),
      },
    };
  },
};
