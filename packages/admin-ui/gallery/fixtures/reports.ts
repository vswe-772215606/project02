import type { DailyReport, MonthlyDayRow, MonthlyReport, SummaryReport } from '@/api/reports';
import { debts } from './debts';
import { buildDailyLedger, dayFacts, isToday, syntheticDayNumbers } from './finance';
import { dayKey, json, splitPath, sum, type RouteHandler } from './util';

const f = dayFacts;

/** A day this preview has no order-level detail for: real top-line numbers, empty drill-down lists. */
function buildThinDailyReport(date: string): DailyReport {
  const d = syntheticDayNumbers(date);
  const ledger = buildDailyLedger(date);
  const profit = d.net - d.cogs - d.operating;
  const billedTotal = d.net + d.service;
  const realCashIn = d.cash + d.debtRepay + d.expenseReturn;
  return {
    date,
    sales: {
      closedOrders: d.closedOrders, canceledOrders: d.canceledOrders,
      grossSales: String(d.gross), discounts: String(d.discounts), netSales: String(d.net),
      debtSales: String(d.debtSales), serviceCharge: String(d.service),
    },
    cashflow: {
      orderCash: String(d.cash), orderCard: String(d.card), debtRepaymentsCash: String(d.debtRepay),
      debtRepaymentsCard: '0', expenseReturns: String(d.expenseReturn), realCashIn: String(realCashIn),
      cashOut: String(d.operating),
    },
    expenses: {
      gross: String(d.operating), reversal: '0', sameDayReversal: '0', net: String(d.operating), byCategory: [], items: [],
    },
    results: { salesBasedProfit: String(profit), cashflowBasedNet: String(realCashIn - d.operating) },
    checks: {
      salesVsPayments: {
        subtotal: String(d.gross), discounts: String(d.discounts), netSales: String(d.net), serviceCharge: String(d.service),
        billedTotal: String(billedTotal), paymentTotal: String(d.cash + d.card + d.debtSales), difference: '0',
      },
      expenses: { recordedExpense: String(d.operating), reversalAmount: '0', sameDayReversalAmount: '0', netExpense: String(d.operating) },
      debts: { openedTodayAmount: String(d.debtSales), repaidTodayAmount: String(d.debtRepay), outstandingTotal: String(d.outstanding) },
    },
    debtSnapshot: {
      openedTodayCount: 0, openedTodayAmount: String(d.debtSales), repaidTodayAmount: String(d.debtRepay),
      repayments: [], outstandingTotal: String(d.outstanding),
    },
    perWaiter: [],
    cancellations: [],
    ledger,
    ordersTable: [],
    mealSales: [],
    debtLedger: [],
  };
}

// ─── Kunlik — reuses the same ledger FinancePage builds, projected into the
// legacy DailyReport field names the existing report sections still read. ──
function buildDailyReport(date: string): DailyReport {
  if (!isToday(date)) return buildThinDailyReport(date);
  const ledger = buildDailyLedger(date);
  const billedTotal = f.netSales + f.serviceCharge;
  const paymentTotal = f.orderCash + f.orderCard + f.debtSalesToday;
  const profit = f.netSales - f.mealSalesTotal.cogs - f.operatingExpenseNet;

  const ordersCountByItem = new Map<string, number>();
  for (const o of f.closedToday) {
    const seen = new Set<string>();
    for (const line of o.lines ?? []) {
      if (line.isCanceled || !line.menuItemId || seen.has(line.menuItemId)) continue;
      seen.add(line.menuItemId);
      ordersCountByItem.set(line.menuItemId, (ordersCountByItem.get(line.menuItemId) ?? 0) + 1);
    }
  }

  const ordersTable: DailyReport['ordersTable'] = [
    ...f.closedToday.map((o) => {
      const split = f.paymentSplit(o);
      const gross = o.subtotalSnapshot ?? 0;
      const discount = o.discountAmountSnapshot ?? 0;
      return {
        orderId: o.id, orderNumber: o.orderNumber, at: o.closedAt ?? o.createdAt, tableName: o.tableName,
        waiterName: o.waiter?.fullName ?? '—', status: 'CLOSED' as const,
        gross: String(gross), discount: String(discount), net: String(gross - discount),
        service: String(o.serviceChargeSnapshot ?? 0), cash: String(split.cash), card: String(split.card), debt: String(split.debt),
      };
    }),
    ...f.canceledToday.map((o) => ({
      orderId: o.id, orderNumber: o.orderNumber, at: o.canceledAt ?? o.createdAt, tableName: o.tableName,
      waiterName: o.waiter?.fullName ?? '—', status: 'CANCELED' as const,
      gross: '0', discount: '0', net: '0', service: '0', cash: '0', card: '0', debt: '0',
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const mealSales: DailyReport['mealSales'] = f.mealFacts.map((mf) => {
    const ordersCount = ordersCountByItem.get(mf.menuItemId) ?? 1;
    return {
      mealName: mf.menuItemName,
      categoryName: mf.categoryName,
      ordersCount,
      qtyOrdered: mf.qty,
      grossSales: String(mf.revenue),
      avgPerOrder: String(Math.round(mf.revenue / ordersCount)),
    };
  });

  // Every debt this preview seeds is OPEN/PARTIAL/PAID — none WRITTEN_OFF —
  // so this narrowing is exhaustive for the actual data, not a blind cast.
  const REPAID_TODAY: Record<string, number> = { 'debt-zarina': 176000, 'debt-malika': 84000 };
  const debtLedger: DailyReport['debtLedger'] = debts
    .filter((d) => d.status !== 'WRITTEN_OFF')
    .map((d) => ({
      debtId: d.id,
      openedAt: d.openedAt,
      orderNumber: d.order.orderNumber,
      debtorName: d.debtorName,
      debtorPhone: d.debtorPhone,
      orderTotal: d.order.totalSnapshot,
      originalAmount: String(d.originalAmount),
      repaidToday: String(REPAID_TODAY[d.id] ?? 0),
      totalRepaid: String(d.repaidAmount),
      remainingAmount: String(d.originalAmount - d.repaidAmount),
      status: d.status as 'OPEN' | 'PARTIAL' | 'PAID',
      lastRepaymentAt: d.repayments.at(-1)?.paidAt ?? null,
      openedToday: d.id === 'debt-rustam' || d.id === 'debt-zarina',
    }));

  return {
    date,
    sales: {
      closedOrders: f.closedToday.length,
      canceledOrders: f.canceledToday.length,
      grossSales: String(f.grossSales),
      discounts: String(f.discounts),
      netSales: String(f.netSales),
      debtSales: String(f.debtSalesToday),
      serviceCharge: String(f.serviceCharge),
    },
    cashflow: {
      orderCash: String(f.orderCash),
      orderCard: String(f.orderCard),
      debtRepaymentsCash: String(f.debtRepaidCash),
      debtRepaymentsCard: String(f.debtRepaidCard),
      expenseReturns: String(f.expenseReturns),
      realCashIn: String(f.realCashIn),
      cashOut: String(f.cashOut),
    },
    expenses: {
      gross: String(f.expensesGross),
      reversal: String(f.expensesReversal),
      sameDayReversal: String(f.expensesSameDayReversal),
      net: String(f.operatingExpenseNet),
      byCategory: [{ categoryId: 'seed-cat-operational', categoryName: 'Operatsion', amount: String(f.operatingExpenseNet) }],
      items: f.operatingExpenses.map((e) => ({
        id: e.id, categoryId: 'seed-cat-operational', categoryName: e.categoryName, amount: e.amount,
        signedAmount: e.status === 'REVERSAL' ? String(-Number(e.amount)) : e.amount, reason: e.reason, note: null,
        occurredAt: e.occurredAt, status: e.status, reversedExpenseId: null, createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: e.occurredAt,
      })),
    },
    results: { salesBasedProfit: String(profit), cashflowBasedNet: String(f.drawerMovement) },
    checks: {
      salesVsPayments: {
        subtotal: String(f.grossSales), discounts: String(f.discounts), netSales: String(f.netSales),
        serviceCharge: String(f.serviceCharge), billedTotal: String(billedTotal), paymentTotal: String(paymentTotal),
        difference: String(billedTotal - paymentTotal),
      },
      expenses: {
        recordedExpense: String(f.expensesGross), reversalAmount: String(f.expensesReversal),
        sameDayReversalAmount: String(f.expensesSameDayReversal), netExpense: String(f.operatingExpenseNet),
      },
      debts: {
        openedTodayAmount: String(f.debtSalesToday), repaidTodayAmount: String(f.debtRepaidCash + f.debtRepaidCard),
        outstandingTotal: String(f.lifetimeOutstandingDebt),
      },
    },
    debtSnapshot: {
      openedTodayCount: f.closedToday.filter((o) => o.debt).length,
      openedTodayAmount: String(f.debtSalesToday),
      repaidTodayAmount: String(f.debtRepaidCash + f.debtRepaidCard),
      repayments: f.debtRepayments,
      outstandingTotal: String(f.lifetimeOutstandingDebt),
    },
    perWaiter: ledger.perWaiter,
    cancellations: f.canceledToday.map((o) => ({
      orderId: o.id, canceledAt: o.canceledAt ?? o.createdAt, canceledBy: o.waiter?.fullName ?? '—', reason: o.cancelReason ?? '',
    })),
    ledger,
    ordersTable,
    mealSales,
    debtLedger,
  };
}

// ─── Oylik / Umumiy — a whole range has no single source order list to
// derive from, so each day's contribution comes from the same
// syntheticDayNumbers generator finance.ts uses for a non-today Kunlik
// lookup — today's own slot still reuses the real dayFacts figures, so it
// lines up with Kunlik and Bugun exactly. ─────────────────────────────────
function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function monthlyDayRow(dateKey: string): MonthlyDayRow {
  const d = syntheticDayNumbers(dateKey);
  const profit = d.net - d.cogs - d.operating;
  const realCashIn = d.cash + d.debtRepay + d.expenseReturn;
  const drawer = realCashIn - d.operating;
  return {
    date: dateKey,
    sales: {
      closedOrders: d.closedOrders, canceledOrders: d.canceledOrders,
      grossSales: String(d.gross), discounts: String(d.discounts), netSales: String(d.net),
      debtSales: String(d.debtSales), serviceCharge: String(d.service),
    },
    cashflow: {
      orderCash: String(d.cash), orderCard: String(d.card), debtRepaymentsCash: String(d.debtRepay),
      debtRepaymentsCard: '0', expenseReturns: String(d.expenseReturn), realCashIn: String(realCashIn),
    },
    expenses: { gross: String(d.operating), reversal: '0', net: String(d.operating), operating: String(d.operating) },
    pnl: { revenue: String(d.net), cogs: String(d.cogs), operatingExpense: String(d.operating), profit: String(profit) },
    results: { salesBasedProfit: String(profit), cashflowBasedNet: String(drawer) },
    debtSnapshot: { outstandingTotal: String(d.outstanding) },
  };
}

function buildMonthlyReport(month: string): MonthlyReport {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const monthNum = Number(monthStr) || 1;
  const count = daysInMonth(year, monthNum);
  const daily: MonthlyDayRow[] = [];
  for (let day = 1; day <= count; day += 1) {
    daily.push(monthlyDayRow(`${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`));
  }

  const last = daily.at(-1);
  return {
    month,
    totals: {
      closedOrders: sum(daily.map((d) => d.sales.closedOrders)),
      canceledOrders: sum(daily.map((d) => d.sales.canceledOrders)),
      grossSales: String(sum(daily.map((d) => d.sales.grossSales))),
      discounts: String(sum(daily.map((d) => d.sales.discounts))),
      netSales: String(sum(daily.map((d) => d.sales.netSales))),
      debtSales: String(sum(daily.map((d) => d.sales.debtSales))),
      serviceCharge: String(sum(daily.map((d) => d.sales.serviceCharge))),
      realCashIn: String(sum(daily.map((d) => d.cashflow.realCashIn))),
      expensesNet: String(sum(daily.map((d) => d.expenses.net))),
      salesBasedProfit: String(sum(daily.map((d) => d.results.salesBasedProfit))),
      cashflowBasedNet: String(sum(daily.map((d) => d.results.cashflowBasedNet))),
      outstandingDebtEndOfMonth: last?.debtSnapshot.outstandingTotal ?? '0',
    },
    daily,
  };
}

function eachDayKey(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const keys: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys.length > 0 ? keys : [from];
}

function buildSummaryReport(from: string, to: string): SummaryReport {
  const days = eachDayKey(from, to).map(syntheticDayNumbers);
  const grossRevenue = sum(days.map((d) => d.gross));
  const discount = sum(days.map((d) => d.discounts));
  const revenue = grossRevenue - discount;
  const cogs = sum(days.map((d) => d.cogs));
  const operatingExpense = sum(days.map((d) => d.operating));
  const profit = revenue - cogs - operatingExpense;
  const cash = sum(days.map((d) => d.cash));
  const card = sum(days.map((d) => d.card));
  const debtRepaid = sum(days.map((d) => d.debtRepay));
  const expenseReturns = sum(days.map((d) => d.expenseReturn));
  const salesInflow = cash + card;
  const totalIn = salesInflow + debtRepaid + expenseReturns;
  const totalOut = operatingExpense;

  // Category proportions borrowed from today's actual mix, scaled to the
  // range's revenue — categories stay realistic without a full recompute.
  const categoryFacts = new Map<string, { categoryId: string; categoryName: string; qty: number; revenue: number; cogs: number }>();
  for (const mf of f.mealFacts) {
    const row = categoryFacts.get(mf.categoryId) ?? { categoryId: mf.categoryId, categoryName: mf.categoryName, qty: 0, revenue: 0, cogs: 0 };
    row.qty += mf.qty;
    row.revenue += mf.revenue;
    row.cogs += mf.cogs;
    categoryFacts.set(mf.categoryId, row);
  }
  const todayMealRevenue = sum([...categoryFacts.values()].map((r) => r.revenue)) || 1;
  const scale = (grossRevenue + f.serviceCharge * days.length) / todayMealRevenue;
  const byMenuCategory = [...categoryFacts.values()]
    .map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      qty: Math.round(r.qty * scale),
      revenue: String(Math.round(r.revenue * scale)),
      cogs: String(Math.round(r.cogs * scale)),
      profit: String(Math.round((r.revenue - r.cogs) * scale)),
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));

  return {
    from,
    to,
    incomes: {
      byMenuCategory,
      totals: {
        qty: sum(byMenuCategory.map((r) => r.qty)),
        revenue: String(sum(byMenuCategory.map((r) => r.revenue))),
        cogs: String(sum(byMenuCategory.map((r) => r.cogs))),
      },
      other: { debtRepaid: String(debtRepaid), expenseReturns: String(expenseReturns) },
      salesByPaymentMethod: { cash: String(cash), card: String(card), debt: String(sum(days.map((d) => d.debtSales))) },
    },
    pnl: {
      expensesByCategory: [{ categoryId: 'seed-cat-operational', categoryName: 'Operatsion', amount: String(operatingExpense) }],
      revenue: String(revenue),
      grossRevenue: String(grossRevenue),
      discount: String(discount),
      cogs: String(cogs),
      operatingExpense: String(operatingExpense),
      profit: String(profit),
    },
    cash: {
      expensesByCategory: [
        { categoryId: 'seed-cat-ingredients', categoryName: "Mahsulot xaridi", amount: String(Math.round(operatingExpense * 0.28)) },
        { categoryId: 'seed-cat-operational', categoryName: 'Operatsion', amount: String(operatingExpense) },
      ],
      salesInflow: String(salesInflow),
      debtRepaid: String(debtRepaid),
      expenseReturns: String(expenseReturns),
      totalIn: String(totalIn),
      totalOut: String(totalOut),
      farq: String(totalIn - totalOut),
    },
  };
}

export const reportsRoutes: RouteHandler = (path, method) => {
  const { base, query } = splitPath(path);
  if (method !== 'GET') return null;

  if (base === '/api/reports/daily') {
    const date = query.get('date') || dayKey();
    return json(buildDailyReport(date));
  }
  if (base === '/api/reports/monthly') {
    const month = query.get('month') || dayKey().slice(0, 7);
    return json(buildMonthlyReport(month));
  }
  if (base === '/api/reports/summary') {
    const from = query.get('from') || `${dayKey().slice(0, 7)}-01`;
    const to = query.get('to') || dayKey();
    return json(buildSummaryReport(from, to));
  }

  return null;
};
