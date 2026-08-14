import type { FinanceDaily, ServiceChargeMatrix } from '@/api/finance';
import type { DailyLedger } from '@/api/reports';
import { categoryName, items } from './menu';
import { orders } from './orders';
import { todayStats } from './users';
import { dayKey, hoursAgo, json, pseudoRange, splitPath, sum, type RouteHandler } from './util';

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

/**
 * The day's money, derived from the same order records Tasdiqlash and
 * Buyurtmalar show — so Kunlik moliya and Hisobot agree with the order list
 * instead of being an independently-typed set of numbers.
 */
const closedToday = orders.filter((o) => o.status === 'CLOSED');
// orders.ts dates one CANCELED order yesterday on purpose; today's ledger
// only counts the other two.
const canceledToday = orders.filter((o) => o.status === 'CANCELED' && o.id !== 'ord-canceled-03');

type MealFact = {
  menuItemId: string;
  menuItemName: string;
  categoryId: string;
  categoryName: string;
  isService: boolean;
  qty: number;
  revenue: number;
  cogs: number;
  profit: number;
};

function buildMealFacts(): MealFact[] {
  const qtyByItem = new Map<string, number>();
  for (const order of closedToday) {
    for (const line of order.lines ?? []) {
      if (line.isCanceled || !line.menuItemId) continue;
      qtyByItem.set(line.menuItemId, (qtyByItem.get(line.menuItemId) ?? 0) + line.quantity);
    }
  }
  const facts: MealFact[] = [];
  for (const [menuItemId, qty] of qtyByItem) {
    const item = items.find((i) => i.id === menuItemId);
    if (!item) continue;
    const cost = item.costPrice ? Number(item.costPrice) : 0;
    const revenue = item.price * qty;
    const cogs = cost * qty;
    facts.push({
      menuItemId: item.id,
      menuItemName: item.name,
      categoryId: item.categoryId,
      categoryName: categoryName(item.categoryId),
      isService: item.kind === 'SERVICE',
      qty,
      revenue,
      cogs,
      profit: revenue - cogs,
    });
  }
  return facts.sort((a, b) => b.revenue - a.revenue);
}

const mealFacts = buildMealFacts();
const mealSalesTotal = {
  qty: sum(mealFacts.map((f) => f.qty)),
  revenue: sum(mealFacts.map((f) => f.revenue)),
  cogs: sum(mealFacts.map((f) => f.cogs)),
  profit: sum(mealFacts.map((f) => f.profit)),
};

function mealSalesByCategoryRows() {
  const byCategory = new Map<string, { categoryId: string; categoryName: string; qty: number; revenue: number; cogs: number; profit: number }>();
  for (const f of mealFacts) {
    const row = byCategory.get(f.categoryId) ?? { categoryId: f.categoryId, categoryName: f.categoryName, qty: 0, revenue: 0, cogs: 0, profit: 0 };
    row.qty += f.qty;
    row.revenue += f.revenue;
    row.cogs += f.cogs;
    row.profit += f.profit;
    byCategory.set(f.categoryId, row);
  }
  return [...byCategory.values()].sort((a, b) => b.revenue - a.revenue);
}

// ─── Sales, straight off today's orders ──────────────────────────────────
const grossSales = sum(closedToday.map((o) => o.subtotalSnapshot ?? 0));
const discounts = sum(closedToday.map((o) => o.discountAmountSnapshot ?? 0));
const netSales = grossSales - discounts;
const serviceCharge = sum(closedToday.map((o) => o.serviceChargeSnapshot ?? 0));
const billedTotal = netSales + serviceCharge;
const debtSalesToday = sum(closedToday.filter((o) => o.debt).map((o) => o.debt?.originalAmount ?? 0));

const CASH_SHARE = 0.65;
function paymentSplit(order: (typeof orders)[number]) {
  const total = (order.subtotalSnapshot ?? 0) - (order.discountAmountSnapshot ?? 0) + (order.serviceChargeSnapshot ?? 0);
  const debtPortion = order.debt ? order.debt.originalAmount : 0;
  const payable = Math.max(total - debtPortion, 0);
  const cash = Math.round(payable * CASH_SHARE);
  const card = payable - cash;
  return { cash, card, debt: debtPortion, total };
}

const orderCash = sum(closedToday.map((o) => paymentSplit(o).cash));
const orderCard = sum(closedToday.map((o) => paymentSplit(o).card));

// ─── Expenses today — not modeled off orders.ts, hand-set but self-summing ──
type ExpenseRow = FinanceDaily['operatingExpenses'][number];
const operatingExpenses: ExpenseRow[] = [
  { id: 'x-10', occurredAt: hoursAgo(9), reason: 'Oshpazga avans', amount: '200000', categoryName: 'Operatsion', repayable: true, repayStatus: 'PENDING', status: 'ACTIVE' },
  { id: 'x-11', occurredAt: hoursAgo(8), reason: 'Elektr energiyasi to\'lovi', amount: '180000', categoryName: 'Operatsion', repayable: false, repayStatus: 'NOT_REPAYABLE', status: 'ACTIVE' },
  { id: 'x-12', occurredAt: hoursAgo(6), reason: 'Idish-tovoq sotib olindi', amount: '95000', categoryName: 'Operatsion', repayable: false, repayStatus: 'NOT_REPAYABLE', status: 'ACTIVE' },
  { id: 'x-13', occurredAt: hoursAgo(5), reason: 'Gaz balloni', amount: '120000', categoryName: 'Operatsion', repayable: false, repayStatus: 'NOT_REPAYABLE', status: 'ACTIVE' },
  { id: 'x-14', occurredAt: hoursAgo(4), reason: 'Ofitsiantga transport puli', amount: '45000', categoryName: 'Operatsion', repayable: false, repayStatus: 'NOT_REPAYABLE', status: 'ACTIVE' },
  // Entered, then reversed the same day — the pair the reversal math cares about.
  { id: 'x-15', occurredAt: hoursAgo(7), reason: "Taksi puli (xato kiritilgan)", amount: '20000', categoryName: 'Operatsion', repayable: false, repayStatus: 'NOT_REPAYABLE', status: 'REVERSED' },
  { id: 'x-15r', occurredAt: hoursAgo(7), reason: "Taksi puli (xato kiritilgan) — bekor qilindi", amount: '20000', categoryName: 'Operatsion', repayable: false, repayStatus: 'NOT_REPAYABLE', status: 'REVERSAL' },
];
const operatingExpensesActive = operatingExpenses.filter((e) => e.status !== 'REVERSAL');
const operatingExpensesReversals = operatingExpenses.filter((e) => e.status === 'REVERSAL');
const expensesGross = sum(operatingExpensesActive.map((e) => e.amount));
const expensesReversal = sum(operatingExpensesReversals.map((e) => e.amount));
const expensesSameDayReversal = expensesReversal;
const operatingExpenseNet = expensesGross - expensesReversal;
const pendingRepayable = 200000; // x-10, still fully outstanding

const purchasesTotal = 100000; // matches stock.ts's se-13 restock — today's only ingredient buy
const purchasesCount = 1;
const cashOut = operatingExpenseNet + purchasesTotal;

const debtRepaidCash = 260000;
const debtRepaidCard = 0;
const expenseReturns = 40000;

const totalIn = sum([orderCash, orderCard, debtRepaidCash, debtRepaidCard, expenseReturns]);
const totalOut = sum([purchasesTotal, operatingExpenseNet]);
const realCashIn = sum([orderCash, debtRepaidCash, expenseReturns]);
const drawerMovement = totalIn - totalOut;
const lifetimeOutstandingDebt = 1940000;

type DebtRepaymentRow = DailyLedger['lines']['debtRepayments'][number];
const zarinaOrderNumber = orders.find((o) => o.id === 'ord-closed-10')?.orderNumber ?? 'SED-10';
const debtRepayments: DebtRepaymentRow[] = [
  { id: 'rp-1', amount: '176000', method: 'CASH', debtorName: 'Zarina Yusupova', orderNumber: zarinaOrderNumber, paidAt: hoursAgo(2), receivedByName: 'Kamola Rashidova' },
  { id: 'rp-2', amount: '84000', method: 'CASH', debtorName: 'Malika Tosheva', orderNumber: 'B77C41', paidAt: hoursAgo(5), receivedByName: 'Dilshod Yusupov' },
];

const perWaiter: DailyLedger['perWaiter'] = todayStats.items.map((w) => ({
  waiterId: w.waiterId,
  waiterName: w.waiterName,
  orders: w.orders,
  revenue: w.revenue,
  serviceEarned: w.serviceEarned,
}));

const incidentCancellations: DailyLedger['incidents']['cancellations'] = canceledToday.map((o) => ({
  orderId: o.id,
  canceledAt: o.canceledAt ?? o.createdAt,
  reason: o.cancelReason ?? '',
}));

const ledgerClosedOrders: DailyLedger['lines']['closedOrders'] = closedToday.map((o) => {
  const split = paymentSplit(o);
  const gross = o.subtotalSnapshot ?? 0;
  const discount = o.discountAmountSnapshot ?? 0;
  return {
    orderId: o.id,
    orderNumber: o.orderNumber,
    closedAt: o.closedAt,
    tableName: o.tableName,
    waiterName: o.waiter?.fullName ?? '—',
    gross: String(gross),
    discount: String(discount),
    net: String(gross - discount),
    service: String(o.serviceChargeSnapshot ?? 0),
    cash: String(split.cash),
    card: String(split.card),
    debt: String(split.debt),
    total: String(o.totalSnapshot ?? o.totalAmount),
  };
});

const ledgerMealSales: DailyLedger['lines']['mealSales'] = mealFacts.map((f) => ({
  menuItemId: f.menuItemId,
  menuItemName: f.menuItemName,
  categoryId: f.categoryId,
  categoryName: f.categoryName,
  isService: f.isService,
  qty: f.qty,
  grossRevenue: String(f.revenue),
  cogs: String(f.cogs),
  profit: String(f.profit),
}));

/**
 * Top-line numbers for an arbitrary day. `orders.ts` only models "today" in
 * any detail, so every other date — the monthly table, a summary range, the
 * "Kecha" button, a hand-picked date, a drill-down row — is generated
 * deterministically here instead. Exported so reports.ts (Oylik/Umumiy)
 * builds its rows from the exact same numbers a Kunlik/Hisobot lookup for
 * that same date would show, rather than a second, independent generator.
 */
export type SyntheticDayNumbers = {
  gross: number; discounts: number; net: number; service: number; cogs: number; operating: number;
  cash: number; card: number; debtSales: number; debtRepay: number; expenseReturn: number;
  closedOrders: number; canceledOrders: number; outstanding: number;
};

export function isToday(dateKey: string): boolean {
  return dateKey === dayKey();
}

export function syntheticDayNumbers(dateKey: string): SyntheticDayNumbers {
  if (isToday(dateKey)) {
    return {
      gross: grossSales, discounts, net: netSales, service: serviceCharge, cogs: mealSalesTotal.cogs,
      operating: operatingExpenseNet, cash: orderCash, card: orderCard, debtSales: debtSalesToday,
      debtRepay: debtRepaidCash + debtRepaidCard, expenseReturn: expenseReturns,
      closedOrders: closedToday.length, canceledOrders: canceledToday.length,
      outstanding: lifetimeOutstandingDebt,
    };
  }
  const seed = dateKey.split('-').reduce((acc, part) => acc * 37 + Number(part), 7);
  const weekday = parseDayKey(dateKey)?.getUTCDay() ?? 1;
  const isWeekend = weekday === 0 || weekday === 6;
  const gross = pseudoRange(seed, isWeekend ? 3200000 : 1600000, isWeekend ? 5600000 : 3400000);
  const dayDiscounts = Math.round((gross * pseudoRange(seed + 1, 0, 6)) / 100);
  const net = gross - dayDiscounts;
  const service = Math.round(net * 0.08);
  const cogs = Math.round((net * pseudoRange(seed + 2, 36, 44)) / 100);
  const operating = pseudoRange(seed + 3, 250000, 750000);
  const cash = Math.round((net + service) * 0.62);
  const card = net + service - cash;
  return {
    gross, discounts: dayDiscounts, net, service, cogs, operating, cash, card,
    debtSales: pseudoRange(seed + 4, 0, 300000),
    debtRepay: pseudoRange(seed + 5, 0, 250000),
    expenseReturn: pseudoRange(seed + 6, 0, 60000),
    closedOrders: pseudoRange(seed + 7, isWeekend ? 18 : 10, isWeekend ? 30 : 20),
    canceledOrders: pseudoRange(seed + 8, 0, 3),
    outstanding: pseudoRange(seed + 10, 900000, 2200000),
  };
}

/** A day this preview has no line-item detail for: real top-line numbers, empty drill-down lists. */
function buildThinDailyLedger(date: string): DailyLedger {
  const d = syntheticDayNumbers(date);
  const profit = d.net - d.cogs - d.operating;
  const dayRealCashIn = d.cash + d.debtRepay + d.expenseReturn;
  return {
    date,
    sales: {
      closedCount: d.closedOrders, canceledCount: d.canceledOrders,
      gross: String(d.gross), discount: String(d.discounts), netSales: String(d.net),
      serviceCharge: String(d.service), debtSales: String(d.debtSales),
    },
    cashflow: {
      orderCash: String(d.cash), orderCard: String(d.card), debtRepaidCash: String(d.debtRepay), debtRepaidCard: '0',
      expenseReturns: String(d.expenseReturn), realCashIn: String(dayRealCashIn),
      cashOut: String(d.operating), drawerMovement: String(dayRealCashIn - d.operating),
    },
    outflow: {
      expenseGross: String(d.operating), expenseReversal: '0', expenseSameDayReversal: '0', expenseNet: String(d.operating),
      operatingExpense: String(d.operating), pendingRepayable: '0', ingredientPurchases: '0', ingredientPurchasesCount: 0,
    },
    pnl: { revenue: String(d.net), cogs: String(d.cogs), operatingExpense: String(d.operating), profit: String(profit) },
    debt: {
      openedTodayCount: 0, openedTodayAmount: String(d.debtSales), repaidTodayAmount: String(d.debtRepay),
      outstandingAsOfEod: String(d.outstanding),
    },
    perWaiter: [],
    incidents: { cancellations: [] },
    lines: { closedOrders: [], mealSales: [], debtRepayments: [] },
  };
}

export function buildDailyLedger(date: string): DailyLedger {
  if (!isToday(date)) return buildThinDailyLedger(date);
  return {
    date,
    sales: {
      closedCount: closedToday.length,
      canceledCount: canceledToday.length,
      gross: String(grossSales),
      discount: String(discounts),
      netSales: String(netSales),
      serviceCharge: String(serviceCharge),
      debtSales: String(debtSalesToday),
    },
    cashflow: {
      orderCash: String(orderCash),
      orderCard: String(orderCard),
      debtRepaidCash: String(debtRepaidCash),
      debtRepaidCard: String(debtRepaidCard),
      expenseReturns: String(expenseReturns),
      realCashIn: String(realCashIn),
      cashOut: String(cashOut),
      drawerMovement: String(drawerMovement),
    },
    outflow: {
      expenseGross: String(expensesGross),
      expenseReversal: String(expensesReversal),
      expenseSameDayReversal: String(expensesSameDayReversal),
      expenseNet: String(operatingExpenseNet),
      operatingExpense: String(operatingExpenseNet),
      pendingRepayable: String(pendingRepayable),
      ingredientPurchases: String(purchasesTotal),
      ingredientPurchasesCount: purchasesCount,
    },
    pnl: {
      revenue: String(netSales),
      cogs: String(mealSalesTotal.cogs),
      operatingExpense: String(operatingExpenseNet),
      profit: String(netSales - mealSalesTotal.cogs - operatingExpenseNet),
    },
    debt: {
      openedTodayCount: closedToday.filter((o) => o.debt).length,
      openedTodayAmount: String(debtSalesToday),
      repaidTodayAmount: String(debtRepaidCash + debtRepaidCard),
      outstandingAsOfEod: String(lifetimeOutstandingDebt),
    },
    perWaiter,
    incidents: { cancellations: incidentCancellations },
    lines: {
      closedOrders: ledgerClosedOrders,
      mealSales: ledgerMealSales,
      debtRepayments,
    },
  };
}

/** A day this preview has no line-item detail for: real top-line numbers, empty drill-down lists. */
function buildThinFinanceDaily(date: string): FinanceDaily {
  const d = syntheticDayNumbers(date);
  const profit = d.net - d.cogs - d.operating;
  const dayRealCashIn = d.cash + d.debtRepay + d.expenseReturn;
  return {
    date,
    sales: {
      closedOrders: d.closedOrders, grossSales: String(d.gross),
      discounts: String(d.discounts), netFood: String(d.net), serviceCharge: String(d.service),
      billedTotal: String(d.net + d.service),
    },
    cashflow: {
      cashIn: String(d.cash), cardIn: String(d.card), debtOpened: String(d.debtSales),
      debtRepaidCash: String(d.debtRepay), debtRepaidCard: '0', expenseReturns: String(d.expenseReturn),
      totalIn: String(d.cash + d.card + d.debtRepay + d.expenseReturn),
    },
    outflow: {
      purchasesTotal: '0', purchasesCount: 0, expensesGross: String(d.operating), expensesReversal: '0',
      expensesSameDayReversal: '0', expensesNet: String(d.operating), operatingExpense: String(d.operating),
      pendingRepayable: '0', cashOut: String(d.operating), totalOut: String(d.operating),
    },
    drawer: { movement: String(dayRealCashIn - d.operating), outstandingDebts: String(d.outstanding) },
    purchases: [],
    expensesItems: [],
    closedOrders: [],
    mealSales: [],
    mealSalesByCategory: [],
    mealSalesTotal: { qty: 0, revenue: '0', cogs: '0', profit: '0' },
    operatingExpenses: [],
    operatingExpensesTotal: { count: 0, gross: String(d.operating), operating: String(d.operating) },
    ingredientPurchases: [],
    ingredientPurchasesTotal: { count: 0, amount: '0' },
    debtToday: {
      openedCount: 0, openedAmount: String(d.debtSales), collectedCount: 0, collectedAmount: String(d.debtRepay),
      lifetimeOutstanding: String(d.outstanding),
    },
    pnl: { revenue: String(d.net), cogs: String(d.cogs), operatingExpense: String(d.operating), profit: String(profit) },
    ledger: buildThinDailyLedger(date),
  };
}

function buildFinanceDaily(date: string): FinanceDaily {
  if (!isToday(date)) return buildThinFinanceDaily(date);
  return {
    date,
    sales: {
      closedOrders: closedToday.length,
      grossSales: String(grossSales),
      discounts: String(discounts),
      netFood: String(netSales),
      serviceCharge: String(serviceCharge),
      billedTotal: String(billedTotal),
    },
    cashflow: {
      cashIn: String(orderCash),
      cardIn: String(orderCard),
      debtOpened: String(debtSalesToday),
      debtRepaidCash: String(debtRepaidCash),
      debtRepaidCard: String(debtRepaidCard),
      expenseReturns: String(expenseReturns),
      totalIn: String(totalIn),
    },
    outflow: {
      purchasesTotal: String(purchasesTotal),
      purchasesCount,
      expensesGross: String(expensesGross),
      expensesReversal: String(expensesReversal),
      expensesSameDayReversal: String(expensesSameDayReversal),
      expensesNet: String(operatingExpenseNet),
      operatingExpense: String(operatingExpenseNet),
      pendingRepayable: String(pendingRepayable),
      cashOut: String(cashOut),
      totalOut: String(totalOut),
    },
    drawer: {
      movement: String(drawerMovement),
      outstandingDebts: String(lifetimeOutstandingDebt),
    },
    purchases: [
      { id: 'x-5', occurredAt: hoursAgo(3), ingredientName: 'Patir non', quantityBuyUnit: '40', buyUnit: 'dona', totalCostUzs: '100000', supplierNote: 'Tandirdan yangi' },
    ],
    expensesItems: operatingExpenses.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      reason: e.reason,
      amount: e.amount,
      categoryName: e.categoryName,
      repayable: e.repayable,
      repayStatus: e.repayStatus,
      purchaseId: null,
      status: e.status,
    })),
    closedOrders: closedToday.map((o) => ({
      id: o.id,
      closedAt: o.closedAt,
      waiterName: o.waiter?.fullName ?? '—',
      tableName: o.tableName,
      billedTotal: String(o.totalSnapshot ?? o.totalAmount),
    })),
    mealSales: mealFacts.map((f) => ({
      menuItemId: f.menuItemId,
      menuItemName: f.menuItemName,
      categoryId: f.categoryId,
      categoryName: f.categoryName,
      isService: f.isService,
      qty: f.qty,
      revenue: String(f.revenue),
      cogs: String(f.cogs),
      profit: String(f.profit),
    })),
    mealSalesByCategory: mealSalesByCategoryRows().map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      qty: r.qty,
      revenue: String(r.revenue),
      cogs: String(r.cogs),
      profit: String(r.profit),
    })),
    mealSalesTotal: {
      qty: mealSalesTotal.qty,
      revenue: String(mealSalesTotal.revenue),
      cogs: String(mealSalesTotal.cogs),
      profit: String(mealSalesTotal.profit),
    },
    operatingExpenses,
    operatingExpensesTotal: {
      count: operatingExpensesActive.length,
      gross: String(expensesGross),
      operating: String(operatingExpenseNet),
    },
    ingredientPurchases: [
      { id: 'x-5', occurredAt: hoursAgo(3), ingredientName: 'Patir non', quantityBuyUnit: '40', buyUnit: 'dona', totalCostUzs: '100000', supplierNote: 'Tandirdan yangi' },
    ],
    ingredientPurchasesTotal: { count: purchasesCount, amount: String(purchasesTotal) },
    debtToday: {
      openedCount: closedToday.filter((o) => o.debt).length,
      openedAmount: String(debtSalesToday),
      collectedCount: debtRepayments.length,
      collectedAmount: String(debtRepaidCash + debtRepaidCard),
      lifetimeOutstanding: String(lifetimeOutstandingDebt),
    },
    pnl: {
      revenue: String(netSales),
      cogs: String(mealSalesTotal.cogs),
      operatingExpense: String(operatingExpenseNet),
      profit: String(netSales - mealSalesTotal.cogs - operatingExpenseNet),
    },
    ledger: buildDailyLedger(date),
  };
}

/**
 * Everything above in one bundle, so reports.ts (Hisobot — the same numbers
 * projected into DailyReport/MonthlyReport instead of FinanceDaily) doesn't
 * re-derive or restate them.
 */
export const dayFacts = {
  closedToday,
  canceledToday,
  mealFacts,
  mealSalesTotal,
  grossSales,
  discounts,
  netSales,
  serviceCharge,
  billedTotal,
  debtSalesToday,
  orderCash,
  orderCard,
  operatingExpenses,
  expensesGross,
  expensesReversal,
  expensesSameDayReversal,
  operatingExpenseNet,
  pendingRepayable,
  purchasesTotal,
  purchasesCount,
  cashOut,
  totalIn,
  totalOut,
  realCashIn,
  drawerMovement,
  lifetimeOutstandingDebt,
  debtRepaidCash,
  debtRepaidCard,
  expenseReturns,
  debtRepayments,
  paymentSplit,
};

// ─── Xodimlar maoshi — service-charge matrix over an arbitrary range ──────
const WAITERS = [
  { waiterId: 'u-waiter-botir', waiterName: 'Botir Nazarov' },
  { waiterId: 'u-waiter-aziza', waiterName: 'Aziza Karimova' },
  { waiterId: 'u-waiter-sardor', waiterName: 'Sardor Tishabayev' },
];

function buildServiceChargeMatrix(from: string, to: string): ServiceChargeMatrix {
  const start = parseDayKey(from) ?? parseDayKey(dayKey(30)) ?? new Date();
  const end = parseDayKey(to) ?? parseDayKey(dayKey()) ?? new Date();
  const todayUtc = parseDayKey(dayKey()) ?? new Date();

  const dayLabels: ServiceChargeMatrix['dayLabels'] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const d = new Date(t);
    dayLabels.push({
      key: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      month: d.getUTCMonth() + 1,
      weekday: d.getUTCDay(),
      isMonthStart: d.getUTCDate() === 1,
    });
  }
  const days = dayLabels.length;

  const waiters: ServiceChargeMatrix['waiters'] = WAITERS.map((w, wi) => {
    let total = 0;
    let orderCount = 0;
    const daily = dayLabels.map((label, di) => {
      const d = parseDayKey(label.key);
      const isFuture = d !== null && d.getTime() > todayUtc.getTime();
      if (isFuture) return '0';
      // A weekday flavour: weekends run busier, deterministic per (waiter, day).
      const isWeekend = label.weekday === 0 || label.weekday === 6;
      const base = isWeekend ? pseudoRange(wi * 100 + di, 60000, 220000) : pseudoRange(wi * 100 + di, 20000, 140000);
      total += base;
      orderCount += pseudoRange(wi * 1000 + di, isWeekend ? 3 : 1, isWeekend ? 9 : 6);
      return String(base);
    });
    return { waiterId: w.waiterId, waiterName: w.waiterName, daily, total: String(total), orderCount };
  });

  const dayTotals = dayLabels.map((_, di) => String(sum(waiters.map((w) => w.daily[di] ?? '0'))));
  const grandTotal = sum(waiters.map((w) => w.total));

  return { from, to, days, dayLabels, waiters, dayTotals, grandTotal: String(grandTotal) };
}

export const financeRoutes: RouteHandler = (path, method) => {
  const { base, query } = splitPath(path);

  if (method === 'GET' && base === '/api/finance/daily') {
    const date = query.get('date') || dayKey();
    return json(buildFinanceDaily(date));
  }

  if (method === 'GET' && base === '/api/finance/service-charge') {
    const from = query.get('from') || `${dayKey(30).slice(0, 7)}-01`;
    const to = query.get('to') || dayKey();
    return json(buildServiceChargeMatrix(from, to));
  }

  return null;
};
