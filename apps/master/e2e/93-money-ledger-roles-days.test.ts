/* eslint-disable @typescript-eslint/no-explicit-any */
// The daily ledger as a whole (money workstream): one scripted day on a fixed clock, hand-computed
// to the so'm; every surface that reports it (dailyLedger, /api/finance, /api/reports, order lists,
// raw rows, the nightly Telegram); drift under each later action; the Tashkent calendar-day and
// month boundaries; who may see what.
//
// Every state change goes through HTTP. Prisma is read only to cross-check rows (and, as in
// 09-nightly-report, to plant the two Telegram settings the nightly report needs).
//
// Classification used in the messages: HOLD = the app matches the hand model; FAIL = a wrong figure
// or a wrong accept/reject; DRIFT = a figure moved after an action that must not move it. An
// expectation is never bent to the app; a known defect is cited by its number.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { at, boot, buildWorld, capturePrints, itemState, n, openOrder, sale, sendOrder, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

const D0 = '2026-10-19'; // the day before D
const D = '2026-10-20'; // the scripted day
const D1 = '2026-10-21'; // the day after D
const OCT = '2026-10';
const NOV = '2026-11';

const ledger = (day: string) => env.svc.reports.dailyLedger(day);
const get = (obj: any, path: string): any => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const cash = (amount: number) => ({ payments: [{ method: 'CASH', amount }] });

// ─── Hand model for day D (whole so'm) ───────────────────────────────────────────────────
// S1 Aziz    Osh ×2                                    = 90 000   cash 90 000
// S2 Bekzod  Osh ×1 + Achichuk ×1                      = 65 000   card 65 000
// S3 Aziz    Somsa ×10                                 = 80 000   cash 50 000 + card 30 000
// S4 Bekzod  Osh ×2 + Choy ×2                          = 100 000  nasiya 100 000 (Karim aka)
// S5 Aziz    Osh ×2 + Xizmat haqi ×1, chegirma 10 000: food 90 000 − 10 000 + xizmat 5 000 = 85 000, cash 85 000
// C1 Aziz    Osh ×1 sent, then canceled                → contributes nothing; the Osh goes back
// E1 operating 30 000 · E2 "Mahsulot xaridi" 40 000 · E3 operating 20 000, reversed the same day
// R1 Olim aka's nasiya of 60 000 from D−1 (Bekzod, Choy ×12); 20 000 repaid in cash on D
//
// Service charge: billingService.computeTotals keeps SERVICE lines out of `subtotal` and adds them
// back only in `total`; dailyLedger sums `subtotalSnapshot` into gross — so Xizmat haqi is NOT in
// gross/netSales/revenue anywhere, and `pnl.revenue` is `netSales`. It is `sales.serviceCharge`.
const H_LEDGER: Record<string, number> = {
  'sales.closedCount': 5,
  'sales.canceledCount': 1,
  'sales.gross': 425000, // 90 000 + 65 000 + 80 000 + 100 000 + 90 000 (food only)
  'sales.discount': 10000,
  'sales.netSales': 415000, // 425 000 − 10 000
  'sales.serviceCharge': 5000,
  'sales.debtSales': 100000,
  'cashflow.orderCash': 225000, // 90 000 + 50 000 + 85 000
  'cashflow.orderCard': 95000, // 65 000 + 30 000
  'cashflow.debtRepaidCash': 20000,
  'cashflow.debtRepaidCard': 0,
  'cashflow.expenseReturns': 0,
  'cashflow.realCashIn': 340000, // 225 000 + 95 000 + 20 000 + 0 + 0
  'cashflow.cashOut': 70000, // expenseGross 90 000 − same-day reversal 20 000
  'cashflow.drawerMovement': 270000, // 340 000 − 70 000
  'outflow.expenseGross': 90000, // 30 000 + 40 000 + 20 000 (a reversed row still counts in gross)
  'outflow.expenseReversal': 20000,
  'outflow.expenseSameDayReversal': 20000,
  'outflow.expenseNet': 70000, // 90 000 − 20 000
  'outflow.operatingExpense': 30000, // 30 000 + 20 000 − 20 000; the 40 000 Mahsulot xaridi is Tan narxi when sold, not Chiqim
  'outflow.pendingRepayable': 0,
  'outflow.ingredientPurchases': 0, // E2 is a Chiqimlar row in the ingredients category, not a Keldi: no StockEntry
  'outflow.ingredientPurchasesCount': 0,
  'pnl.revenue': 415000,
  'pnl.cogs': 217000, // Osh (2+1+2+2) = 7 × 25 000 = 175 000 + Somsa 10 × 4 000 = 40 000 + Choy 2 × 1 000 = 2 000
  'pnl.operatingExpense': 30000,
  'pnl.profit': 168000, // 415 000 − 217 000 − 30 000
  'debt.openedTodayCount': 1,
  'debt.openedTodayAmount': 100000,
  'debt.repaidTodayAmount': 20000,
  'debt.outstandingAsOfEod': 140000, // Olim 60 000 − 20 000 = 40 000, Karim 100 000
  'perWaiter.length': 2,
  'incidents.cancellations.length': 1,
  'lines.closedOrders.length': 5,
  'lines.mealSales.length': 5, // Osh, Somsa, Achichuk, Choy, Xizmat haqi
  'lines.debtRepayments.length': 1,
};

// GET /api/finance/daily (Kunlik moliya) — the admin projection of the same ledger.
const H_ADMIN: Record<string, number> = {
  'sales.closedOrders': 5, 'sales.grossSales': 425000, 'sales.discounts': 10000, 'sales.netFood': 415000,
  'sales.serviceCharge': 5000, 'sales.billedTotal': 420000, // 415 000 + 5 000
  'cashflow.cashIn': 225000, 'cashflow.cardIn': 95000, 'cashflow.debtOpened': 100000, 'cashflow.debtRepaidCash': 20000,
  'cashflow.debtRepaidCard': 0, 'cashflow.expenseReturns': 0, 'cashflow.totalIn': 340000,
  'outflow.purchasesTotal': 0, 'outflow.purchasesCount': 0, 'outflow.expensesGross': 90000, 'outflow.expensesReversal': 20000,
  'outflow.expensesSameDayReversal': 20000, 'outflow.expensesNet': 70000, 'outflow.operatingExpense': 30000,
  'outflow.pendingRepayable': 0, 'outflow.cashOut': 70000, 'outflow.totalOut': 70000,
  'drawer.movement': 270000, 'drawer.outstandingDebts': 140000,
  // The dish table: food only (issue 10) — 20 portions = 7 + 10 + 1 + 2, 425 000 so'm, Tan narxi 217 000.
  'mealSalesTotal.qty': 20, 'mealSalesTotal.revenue': 425000, 'mealSalesTotal.cogs': 217000, 'mealSalesTotal.profit': 208000,
  'mealSales.length': 5, 'mealSalesByCategory.length': 3, // Taomlar, Choy va non, Xizmat
  'operatingExpensesTotal.count': 3, 'operatingExpensesTotal.gross': 50000, 'operatingExpensesTotal.operating': 30000, // E1, E3, E3's reversal
  'ingredientPurchasesTotal.count': 0, 'ingredientPurchasesTotal.amount': 0,
  'debtToday.openedCount': 1, 'debtToday.openedAmount': 100000, 'debtToday.collectedCount': 1, 'debtToday.collectedAmount': 20000,
  'debtToday.lifetimeOutstanding': 140000,
  'pnl.revenue': 415000, 'pnl.cogs': 217000, 'pnl.operatingExpense': 30000, 'pnl.profit': 168000,
  'closedOrders.length': 5, 'expensesItems.length': 4, 'operatingExpenses.length': 3, 'purchases.length': 0, 'ingredientPurchases.length': 0,
};

// GET /api/reports/daily (the owner's Hisobot).
const H_OWNER: Record<string, number> = {
  'sales.closedOrders': 5, 'sales.canceledOrders': 1, 'sales.grossSales': 425000, 'sales.discounts': 10000, 'sales.netSales': 415000,
  'sales.debtSales': 100000, 'sales.serviceCharge': 5000,
  'cashflow.orderCash': 225000, 'cashflow.orderCard': 95000, 'cashflow.debtRepaymentsCash': 20000, 'cashflow.debtRepaymentsCard': 0,
  'cashflow.expenseReturns': 0, 'cashflow.realCashIn': 340000, 'cashflow.cashOut': 70000,
  'expenses.gross': 90000, 'expenses.reversal': 20000, 'expenses.sameDayReversal': 20000, 'expenses.net': 70000,
  'expenses.operating': 30000, // operating = expenses excluding the ingredients category, as in pnl.operatingExpense
  'expenses.pendingRepayable': 0, 'expenses.items.length': 4, 'expenses.byCategory.length': 2, // Operatsion 30 000, Mahsulot xaridi 40 000
  'results.salesBasedProfit': 168000, 'results.cashflowBasedNet': 270000,
  'checks.salesVsPayments.subtotal': 425000, 'checks.salesVsPayments.discounts': 10000, 'checks.salesVsPayments.netSales': 415000,
  'checks.salesVsPayments.serviceCharge': 5000, 'checks.salesVsPayments.billedTotal': 420000, 'checks.salesVsPayments.paymentTotal': 420000,
  'checks.salesVsPayments.difference': 0,
  'checks.expenses.recordedExpense': 90000, 'checks.expenses.reversalAmount': 20000, 'checks.expenses.sameDayReversalAmount': 20000,
  'checks.expenses.netExpense': 70000,
  'checks.debts.openedTodayAmount': 100000, 'checks.debts.repaidTodayAmount': 20000, 'checks.debts.outstandingTotal': 140000,
  'debtSnapshot.openedTodayCount': 1, 'debtSnapshot.openedTodayAmount': 100000, 'debtSnapshot.repaidTodayAmount': 20000,
  'debtSnapshot.repayments.length': 1, 'debtSnapshot.outstandingTotal': 140000,
  'perWaiter.length': 2, 'cancellations.length': 1, 'ordersTable.length': 6, 'mealSales.length': 4, 'debtLedger.length': 2,
};

// GET /api/reports/monthly?month=2026-10 — the row for D, and for D−1 (Olim's Choy ×12 on nasiya).
const H_MONTH_ROW_D: Record<string, number> = {
  'sales.closedOrders': 5, 'sales.canceledOrders': 1, 'sales.grossSales': 425000, 'sales.discounts': 10000, 'sales.netSales': 415000,
  'sales.debtSales': 100000, 'sales.serviceCharge': 5000,
  'cashflow.orderCash': 225000, 'cashflow.orderCard': 95000, 'cashflow.debtRepaymentsCash': 20000, 'cashflow.debtRepaymentsCard': 0,
  'cashflow.expenseReturns': 0, 'cashflow.realCashIn': 340000,
  'expenses.gross': 90000, 'expenses.reversal': 20000, 'expenses.net': 70000, 'expenses.operating': 30000,
  'pnl.revenue': 415000, 'pnl.cogs': 217000, 'pnl.operatingExpense': 30000, 'pnl.profit': 168000,
  'results.salesBasedProfit': 168000, 'results.cashflowBasedNet': 270000, 'debtSnapshot.outstandingTotal': 140000,
};
const H_MONTH_ROW_D0: Record<string, number> = {
  'sales.closedOrders': 1, 'sales.grossSales': 60000, 'sales.netSales': 60000, 'sales.debtSales': 60000, 'sales.serviceCharge': 0,
  'cashflow.realCashIn': 0, 'pnl.cogs': 12000, 'pnl.profit': 48000, // 60 000 − 12 × 1 000
  'results.cashflowBasedNet': 0, 'debtSnapshot.outstandingTotal': 60000,
};
// Month totals while October holds D−1 and D only.
const H_MONTH_TOTALS: Record<string, number> = {
  closedOrders: 6, canceledOrders: 1, grossSales: 485000, discounts: 10000, netSales: 475000, debtSales: 160000, serviceCharge: 5000,
  realCashIn: 340000, expensesNet: 70000, salesBasedProfit: 216000, cashflowBasedNet: 270000, outstandingDebtEndOfMonth: 140000,
};

// GET /api/reports/summary?from=D&to=D (Umumiy).
const H_SUMMARY: Record<string, number> = {
  'incomes.totals.qty': 20, 'incomes.totals.revenue': 425000, 'incomes.totals.cogs': 217000, 'incomes.byMenuCategory.length': 2,
  'incomes.other.debtRepaid': 20000, 'incomes.other.expenseReturns': 0,
  'incomes.salesByPaymentMethod.cash': 225000, 'incomes.salesByPaymentMethod.card': 95000, 'incomes.salesByPaymentMethod.debt': 100000,
  'pnl.revenue': 415000, 'pnl.grossRevenue': 425000, 'pnl.discount': 10000, 'pnl.cogs': 217000, 'pnl.operatingExpense': 30000,
  'pnl.profit': 168000, 'pnl.expensesByCategory.length': 1, // Operatsion 30 000
  'cash.salesInflow': 320000, 'cash.debtRepaid': 20000, 'cash.expenseReturns': 0, 'cash.totalIn': 340000, 'cash.totalOut': 70000,
  'cash.farq': 270000, 'cash.expensesByCategory.length': 2, // Operatsion 30 000, Mahsulot xaridi 40 000
};

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────
type Flat = Record<string, number | string | boolean | null>;
/** Leaves by dotted path; arrays contribute only their length (rows are checked by name elsewhere). */
function flatten(value: any, path = '', out: Flat = {}): Flat {
  if (Array.isArray(value)) {
    out[`${path}.length`] = value.length;
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
    return out;
  }
  out[path] = value;
  return out;
}
/** What moved between two ledgers: numeric deltas, or "before → after" for anything else. */
function diff(before: any, after: any): Record<string, number | string> {
  const a = flatten(before);
  const b = flatten(after);
  const moved: Record<string, number | string> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    const nx = Number(x);
    const ny = Number(y);
    moved[key] = x !== undefined && y !== undefined && Number.isFinite(nx) && Number.isFinite(ny) ? ny - nx : `${String(x)} → ${String(y)}`;
  }
  return moved;
}
/** One action against day D; only the named fields may move, by exactly the named amounts. */
async function step(label: string, action: () => Promise<unknown>, expectedMoves: Record<string, number>) {
  const before = await ledger(D);
  await action();
  const moved = diff(before, await ledger(D));
  expect.soft(moved, `${label}: fields of dailyLedger(${D}) that moved (delta)`).toEqual(expectedMoves);
}
function checkFields(body: any, expected: Record<string, number>, label: string) {
  for (const [path, value] of Object.entries(expected)) {
    expect.soft(n(get(body, path)), `${label}.${path}`).toBe(value);
  }
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The figure after "<label>: <b>…</b>" in a Telegram message, as a magnitude. */
const pick = (msg: string, label: string) => {
  const m = msg.match(new RegExp(`${esc(label)}: <b>([^<]+)</b>`));
  return m ? Number(m[1]!.replace(/[^\d]/g, '')) : NaN;
};
const LEAK_KEY = /costPrice|unitCost|cogs|profit|tan[_ ]?narx|consumptionSnapshot/i;
/** Every key in a payload that names a cost, a margin or a profit: `path=value`, first occurrence per key. */
function scanLeaks(value: any, path: string, seen: Map<string, string>): void {
  if (Array.isArray(value)) {
    value.forEach((v) => scanLeaks(v, `${path}[]`, seen));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const p = `${path}.${k}`;
      if (LEAK_KEY.test(k) && !seen.has(p)) seen.set(p, JSON.stringify(v));
      scanLeaks(v, p, seen);
    }
  }
}
/** Amounts must be whole so'm (integer, or an integer string); days are YYYY-MM-DD; months YYYY-MM. */
function walkShape(value: any, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkShape(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkShape(v, `${path}.${k}`, out);
    return;
  }
  const key = path.split('.').pop() ?? '';
  if (typeof value === 'number' && !Number.isInteger(value)) out.push(`${path}=${value} (not an integer)`);
  if (typeof value === 'string') {
    if (/^(date|from|to|key)$/.test(key) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) out.push(`${path}="${value}" (not YYYY-MM-DD)`);
    else if (key === 'month' && !/^\d{4}-\d{2}$/.test(value)) out.push(`${path}="${value}" (not YYYY-MM)`);
    else if (key !== 'avgPerOrder' && /^-?\d+(\.\d+)?$/.test(value) && !/^-?\d+$/.test(value)) out.push(`${path}="${value}" (fractional so'm)`);
  }
}

// ─── The world and the sales of day D ─────────────────────────────────────────────────────
let S1: { id: string; closed: any };
let S2: { id: string; closed: any };
let c1Id = '';
let e3Id = '';
let olimDebtId = '';
let karimDebtId = '';
let L0: any; // dailyLedger(D) right after the five sales, before anything else

beforeAll(async () => {
  setClock(at(`${D0}T09:00`));
  env = await boot('money-ledger');
  w = await buildWorld(env.base);

  // R1's origin: Bekzod sells Choy ×12 = 60 000 on nasiya to Olim aka, the day before D.
  setClock(at(`${D0}T14:00`));
  await w.relogin();
  await sale(w, w.w2, [[w.items.choy, 12]], { payments: [{ method: 'DEBT', amount: 60000 }], debt: { debtorName: 'Olim aka' } });

  // Day D, five bills ten minutes apart.
  setClock(at(`${D}T11:00`));
  await w.relogin();
  S1 = await sale(w, w.w1, [[w.items.osh, 2]], cash(90000));
  setClock(at(`${D}T11:10`));
  S2 = await sale(w, w.w2, [[w.items.osh, 1], [w.items.salat, 1]], { payments: [{ method: 'CARD', amount: 65000 }] });
  setClock(at(`${D}T11:20`));
  await sale(w, w.w1, [[w.items.somsa, 10]], { payments: [{ method: 'CASH', amount: 50000 }, { method: 'CARD', amount: 30000 }] });
  setClock(at(`${D}T11:30`));
  await sale(w, w.w2, [[w.items.osh, 2], [w.items.choy, 2]], { payments: [{ method: 'DEBT', amount: 100000 }], debt: { debtorName: 'Karim aka' } });
  setClock(at(`${D}T11:40`));
  await sale(w, w.w1, [[w.items.osh, 2], [w.items.xizmat, 1]], { discountAmount: 10000, payments: [{ method: 'CASH', amount: 85000 }] });
  setClock(at(`${D}T11:50`));
  L0 = await ledger(D);

  olimDebtId = (await w.admin.get(`/api/debts?date=${D0}`)).items.find((d: any) => d.debtorName === 'Olim aka').id;
  karimDebtId = (await w.admin.get(`/api/debts?date=${D}`)).items.find((d: any) => d.debtorName === 'Karim aka').id;
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

// ═══ 2. Drift: each later action, one at a time ═══════════════════════════════════════════
describe('Drift: after the five sales, one action at a time; only the fields the hand model names may move', () => {
  it('the five bills alone: closed 5, Sof sotuv 415 000, Tan narxi 217 000, nothing else yet', () => {
    expect({
      closed: L0.sales.closedCount, netSales: n(L0.sales.netSales), serviceCharge: n(L0.sales.serviceCharge), cogs: n(L0.pnl.cogs),
      expenseGross: n(L0.outflow.expenseGross), debtRepaidCash: n(L0.cashflow.debtRepaidCash), drawer: n(L0.cashflow.drawerMovement),
    }).toEqual({ closed: 5, netSales: 415000, serviceCharge: 5000, cogs: 217000, expenseGross: 0, debtRepaidCash: 0, drawer: 320000 });
  });

  it('C1: a sent order canceled contributes nothing and gives its Osh back', async () => {
    const before = (await itemState(env, w.items.osh)).stock;
    c1Id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1]]);
    await sendOrder(w.w1, c1Id);
    const whileSent = (await itemState(env, w.items.osh)).stock;
    await step('C1 cancel', () => w.admin.post(`/api/orders/${c1Id}/cancel`, { reason: 'Mijoz ketdi' }), {
      'sales.canceledCount': 1,
      'incidents.cancellations.length': 1,
    });
    const after = (await itemState(env, w.items.osh)).stock;
    expect.soft({ whileSent, after }, `Osh count: ${before} before C1`).toEqual({ whileSent: (before ?? 0) - 1, after });
    expect.soft(after, 'Osh count restored by the cancel').toBe(before);
  });

  it('E1: an operating expense of 30 000 leaves the till and the profit', () =>
    step('E1 operating 30 000', () => w.admin.post('/api/expenses', { amount: 30000, reason: 'Gaz', occurredAt: at(`${D}T12:00`).toISOString() }), {
      'outflow.expenseGross': 30000, 'outflow.expenseNet': 30000, 'outflow.operatingExpense': 30000,
      'cashflow.cashOut': 30000, 'cashflow.drawerMovement': -30000,
      'pnl.operatingExpense': 30000, 'pnl.profit': -30000,
    }));

  it('E2: 40 000 in the Mahsulot xaridi category leaves the till but not the profit', () =>
    step('E2 ingredients 40 000', () => w.admin.post('/api/expenses', { categoryId: 'seed-cat-ingredients', amount: 40000, reason: 'Guruch', occurredAt: at(`${D}T12:10`).toISOString() }), {
      'outflow.expenseGross': 40000, 'outflow.expenseNet': 40000,
      'cashflow.cashOut': 40000, 'cashflow.drawerMovement': -40000,
    }));

  it('E3: an operating expense of 20 000', () =>
    step('E3 operating 20 000', async () => {
      e3Id = (await w.admin.post('/api/expenses', { amount: 20000, reason: 'Suv', occurredAt: at(`${D}T12:20`).toISOString() })).id;
    }, {
      'outflow.expenseGross': 20000, 'outflow.expenseNet': 20000, 'outflow.operatingExpense': 20000,
      'cashflow.cashOut': 20000, 'cashflow.drawerMovement': -20000,
      'pnl.operatingExpense': 20000, 'pnl.profit': -20000,
    }));

  it('E3 reversed the same day: the cash is back in the till and the profit is back; gross keeps the row', () =>
    step('E3 reverse', () => w.admin.post(`/api/expenses/${e3Id}/reverse`, { note: 'Xato yozildi' }), {
      'outflow.expenseReversal': 20000, 'outflow.expenseSameDayReversal': 20000, 'outflow.expenseNet': -20000, 'outflow.operatingExpense': -20000,
      'cashflow.cashOut': -20000, 'cashflow.drawerMovement': 20000,
      'pnl.operatingExpense': -20000, 'pnl.profit': 20000,
    }));

  it("R1: 20 000 cash on Olim aka's nasiya from D−1 is money in on D, and D−1 does not move", async () => {
    const d0Before = await ledger(D0);
    await step('R1 repayment 20 000', () => w.admin.post(`/api/debts/${olimDebtId}/repayments`, { amount: 20000, method: 'CASH' }), {
      'cashflow.debtRepaidCash': 20000, 'cashflow.realCashIn': 20000, 'cashflow.drawerMovement': 20000,
      'debt.repaidTodayAmount': 20000, 'debt.outstandingAsOfEod': -20000,
      'lines.debtRepayments.length': 1,
    });
    expect.soft(diff(d0Before, await ledger(D0)), `dailyLedger(${D0}) after a repayment taken on ${D}`).toEqual({});
  });
});

// ═══ 1. Day D, field by field ═════════════════════════════════════════════════════════════
describe(`Day ${D}: dailyLedger(D) against the hand model`, () => {
  it('every canonical figure', async () => {
    const L = await ledger(D);
    expect.soft(L.date, 'date').toBe(D);
    checkFields(L, H_LEDGER, 'dailyLedger');
  });

  it("per waiter: the chegirma comes off the waiter's revenue; Xizmat haqi is kept apart from it", async () => {
    const L = await ledger(D);
    const rows = Object.fromEntries(L.perWaiter.map((r: any) => [r.waiterName, { orders: r.orders, revenue: n(r.revenue), serviceEarned: n(r.serviceEarned) }]));
    expect(rows).toEqual({
      Aziz: { orders: 3, revenue: 250000, serviceEarned: 5000 }, // 90 000 + 80 000 + (90 000 − 10 000); the 5 000 Xizmat haqi is not revenue
      Bekzod: { orders: 2, revenue: 165000, serviceEarned: 0 }, // 65 000 + 100 000
    });
  });

  it('per dish: portions, revenue and Tan narxi; the Xizmat haqi row is flagged as service', async () => {
    const L = await ledger(D);
    const rows = Object.fromEntries(L.lines.mealSales.map((r: any) => [r.menuItemName, { qty: r.qty, revenue: n(r.grossRevenue), cogs: n(r.cogs), profit: n(r.profit), isService: r.isService }]));
    expect(rows).toEqual({
      Osh: { qty: 7, revenue: 315000, cogs: 175000, profit: 140000, isService: false }, // 7 × 45 000; 7 × 25 000
      Somsa: { qty: 10, revenue: 80000, cogs: 40000, profit: 40000, isService: false },
      Achichuk: { qty: 1, revenue: 20000, cogs: 0, profit: 20000, isService: false }, // no tan narx
      Choy: { qty: 2, revenue: 10000, cogs: 2000, profit: 8000, isService: false },
      'Xizmat haqi': { qty: 1, revenue: 5000, cogs: 0, profit: 5000, isService: true },
    });
  });

  it('the bill register: five bills, Σ total 420 000 = Σ net 415 000 + Σ xizmat 5 000 = Σ naqd + karta + nasiya', async () => {
    const L = await ledger(D);
    const sum = (k: string) => L.lines.closedOrders.reduce((s: number, r: any) => s + n(r[k]), 0);
    expect({ rows: L.lines.closedOrders.length, gross: sum('gross'), discount: sum('discount'), net: sum('net'), service: sum('service'), total: sum('total'), cash: sum('cash'), card: sum('card'), debt: sum('debt') })
      .toEqual({ rows: 5, gross: 425000, discount: 10000, net: 415000, service: 5000, total: 420000, cash: 225000, card: 95000, debt: 100000 });
  });
});

// ═══ Cross-agreement: every surface that reports day D ════════════════════════════════════
describe(`Every surface reports the same day ${D}`, () => {
  it('GET /api/finance/daily as ADMIN: every field (D18: ADMIN may see profit)', async () => {
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    expect.soft(admin.date, 'date').toBe(D);
    checkFields(admin, H_ADMIN, 'finance/daily');
    const cats = Object.fromEntries(admin.mealSalesByCategory.map((c: any) => [c.categoryName, { qty: c.qty, revenue: n(c.revenue), cogs: n(c.cogs) }]));
    expect.soft(cats, 'mealSalesByCategory').toEqual({
      Taomlar: { qty: 18, revenue: 415000, cogs: 215000 }, // Osh 7 + Somsa 10 + Achichuk 1
      'Choy va non': { qty: 2, revenue: 10000, cogs: 2000 },
      Xizmat: { qty: 1, revenue: 5000, cogs: 0 },
    });
  });

  it('GET /api/finance/daily carries the write-off pass-through, empty on a day without one', async () => {
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    expect({ avans: admin.outflow.avansWriteOffs, debt: admin.outflow.debtWriteOffs, rows: admin.writeOffs })
      .toEqual({ avans: '0', debt: '0', rows: [] });
  });

  it('GET /api/finance/daily as OWNER is the same payload, figure for figure', async () => {
    const [admin, owner] = await Promise.all([w.admin.get(`/api/finance/daily?date=${D}`), w.owner.get(`/api/finance/daily?date=${D}`)]);
    expect(diff(admin, owner), 'ADMIN vs OWNER finance/daily').toEqual({});
    expect(n(owner.pnl.profit)).toBe(168000);
  });

  it('GET /api/reports/daily as OWNER: every field', async () => {
    const r = await w.owner.get(`/api/reports/daily?date=${D}`);
    expect.soft(r.date, 'date').toBe(D);
    checkFields(r, H_OWNER, 'reports/daily');
  });

  it('GET /api/reports/daily: the bill register, the dish table (food only) and the nasiya ledger', async () => {
    const r = await w.owner.get(`/api/reports/daily?date=${D}`);
    const closed = r.ordersTable.filter((x: any) => x.status === 'CLOSED');
    const sum = (k: string) => closed.reduce((s: number, x: any) => s + n(x[k]), 0);
    expect.soft({
      rows: r.ordersTable.length, closed: closed.length, canceled: r.ordersTable.filter((x: any) => x.status === 'CANCELED').length,
      gross: sum('gross'), discount: sum('discount'), net: sum('net'), service: sum('service'), cash: sum('cash'), card: sum('card'), debt: sum('debt'),
    }, 'ordersTable').toEqual({ rows: 6, closed: 5, canceled: 1, gross: 425000, discount: 10000, net: 415000, service: 5000, cash: 225000, card: 95000, debt: 100000 });
    const meals = Object.fromEntries(r.mealSales.map((m: any) => [m.mealName, { qty: m.qtyOrdered, gross: n(m.grossSales), orders: m.ordersCount }]));
    expect.soft(meals, 'mealSales').toEqual({
      Osh: { qty: 7, gross: 315000, orders: 4 }, // S1, S2, S4, S5
      Somsa: { qty: 10, gross: 80000, orders: 1 },
      Achichuk: { qty: 1, gross: 20000, orders: 1 },
      Choy: { qty: 2, gross: 10000, orders: 1 },
    });
    const debts = Object.fromEntries(r.debtLedger.map((d: any) => [d.debtorName, { status: d.status, openedToday: d.openedToday, repaidToday: n(d.repaidToday), totalRepaid: n(d.totalRepaid), remaining: n(d.remainingAmount) }]));
    expect.soft(debts, 'debtLedger').toEqual({
      'Karim aka': { status: 'OPEN', openedToday: true, repaidToday: 0, totalRepaid: 0, remaining: 100000 },
      'Olim aka': { status: 'PARTIAL', openedToday: false, repaidToday: 20000, totalRepaid: 20000, remaining: 40000 },
    });
  });

  it('GET /api/reports/monthly?month=2026-10: the rows for D and D−1, and the totals over both', async () => {
    const m = await w.owner.get(`/api/reports/monthly?month=${OCT}`);
    expect.soft(m.month, 'month').toBe(OCT);
    expect.soft(m.daily.length, 'days in October').toBe(31);
    const row = (date: string) => m.daily.find((r: any) => r.date === date);
    checkFields(row(D), H_MONTH_ROW_D, `monthly.daily[${D}]`);
    checkFields(row(D0), H_MONTH_ROW_D0, `monthly.daily[${D0}]`);
    checkFields(m.totals, H_MONTH_TOTALS, 'monthly.totals');
    const empty = m.daily.filter((r: any) => r.date !== D && r.date !== D0).filter((r: any) => r.sales.closedOrders !== 0 || n(r.pnl.profit) !== 0 || n(r.cashflow.realCashIn) !== 0);
    expect.soft(empty.map((r: any) => r.date), 'other days of October must be empty').toEqual([]);
  });

  it('GET /api/reports/summary?from=D&to=D: every field; and D−1..D adds the nasiya day', async () => {
    const s = await w.owner.get(`/api/reports/summary?from=${D}&to=${D}`);
    expect.soft({ from: s.from, to: s.to }).toEqual({ from: D, to: D });
    checkFields(s, H_SUMMARY, 'summary(D..D)');
    const cats = Object.fromEntries(s.incomes.byMenuCategory.map((c: any) => [c.categoryName, { qty: c.qty, revenue: n(c.revenue), cogs: n(c.cogs) }]));
    expect.soft(cats, 'summary.incomes.byMenuCategory (food only)').toEqual({ Taomlar: { qty: 18, revenue: 415000, cogs: 215000 }, 'Choy va non': { qty: 2, revenue: 10000, cogs: 2000 } });
    expect.soft(Object.fromEntries(s.cash.expensesByCategory.map((c: any) => [c.categoryName, n(c.amount)])), 'summary.cash.expensesByCategory')
      .toEqual({ Operatsion: 30000, 'Mahsulot xaridi': 40000 });
    expect.soft(Object.fromEntries(s.pnl.expensesByCategory.map((c: any) => [c.categoryName, n(c.amount)])), 'summary.pnl.expensesByCategory')
      .toEqual({ Operatsion: 30000 });
    const two = await w.owner.get(`/api/reports/summary?from=${D0}&to=${D}`);
    expect.soft({ revenue: n(two.pnl.revenue), cogs: n(two.pnl.cogs), operating: n(two.pnl.operatingExpense), profit: n(two.pnl.profit), debtSales: n(two.incomes.salesByPaymentMethod.debt), totalIn: n(two.cash.totalIn), farq: n(two.cash.farq) }, 'summary(D−1..D)')
      .toEqual({ revenue: 475000, cogs: 229000, operating: 30000, profit: 216000, debtSales: 160000, totalIn: 340000, farq: 270000 }); // + Olim: 60 000, 12 000, profit 48 000
  });

  it('GET /api/finance/service-charge?from=D&to=D: Xizmat haqi per waiter', async () => {
    const m = await w.admin.get(`/api/finance/service-charge?from=${D}&to=${D}`);
    const rows = Object.fromEntries(m.waiters.map((r: any) => [r.waiterName, { total: n(r.total), orders: r.orderCount, daily: r.daily.map(n) }]));
    expect({ from: m.from, to: m.to, days: m.days, dayTotals: m.dayTotals.map(n), grand: n(m.grandTotal), rows })
      .toEqual({ from: D, to: D, days: 1, dayTotals: [5000], grand: 5000, rows: { Aziz: { total: 5000, orders: 3, daily: [5000] }, Bekzod: { total: 0, orders: 2, daily: [0] } } });
  });

  it('GET /api/users/today-stats (admin) and GET /api/me/* (each waiter) agree per waiter', async () => {
    const admin = await w.admin.get(`/api/users/today-stats?date=${D}`);
    const rows = Object.fromEntries(admin.items.map((r: any) => [r.waiterName, { orders: r.orders, revenue: n(r.revenue), billed: n(r.billedTotal), service: n(r.serviceEarned) }]));
    expect.soft(rows, 'users/today-stats').toEqual({
      Aziz: { orders: 3, revenue: 250000, billed: 255000, service: 5000 }, // billed 90 000 + 80 000 + 85 000
      Bekzod: { orders: 2, revenue: 165000, billed: 165000, service: 0 },
    });
    const me = (r: any) => ({ date: r.date, closed: r.ordersClosed, canceled: r.ordersCanceled, food: n(r.foodRevenue), service: n(r.serviceEarned), billed: n(r.totalBilled) });
    expect.soft({ aziz: me(await w.w1.get(`/api/me/today-stats?date=${D}`)), bekzod: me(await w.w2.get(`/api/me/today-stats?date=${D}`)) }, 'me/today-stats').toEqual({
      aziz: { date: D, closed: 3, canceled: 1, food: 250000, service: 5000, billed: 255000 }, // C1 was Aziz's
      bekzod: { date: D, closed: 2, canceled: 0, food: 165000, service: 0, billed: 165000 },
    });
    const range = await w.w2.get(`/api/me/range-stats?from=${D0}&to=${D}`);
    expect.soft({ days: range.days.map((d: any) => [d.date, d.ordersClosed, n(d.serviceEarned)]), total: range.totalOrders, service: n(range.totalServiceEarned) }, "Bekzod's me/range-stats")
      .toEqual({ days: [[D0, 1, 0], [D, 2, 0]], total: 3, service: 0 });
  });

  it('GET /api/orders?status=CLOSED&date=D: five bills, Σ total 420 000; the canceled order is only in the CANCELED list', async () => {
    const closed = await w.admin.get(`/api/orders?status=CLOSED&date=${D}`);
    const canceled = await w.admin.get(`/api/orders?status=CANCELED&date=${D}`);
    expect({
      count: closed.length, total: closed.reduce((s: number, o: any) => s + o.totalSnapshot, 0), statuses: [...new Set(closed.map((o: any) => o.status))],
      hasC1: closed.some((o: any) => o.id === c1Id), canceled: canceled.map((o: any) => [o.id, o.status, o.totalSnapshot]),
    }).toEqual({ count: 5, total: 420000, statuses: ['CLOSED'], hasC1: false, canceled: [[c1Id, 'CANCELED', null]] });
  });

  it("GET /api/expenses?date=D: the Chiqimlar page's totals", async () => {
    const e = await w.admin.get(`/api/expenses?date=${D}`);
    const signed = e.items.reduce((s: number, x: any) => s + n(x.signedAmount), 0);
    expect.soft({ items: e.items.length, gross: n(e.totals.gross), reversal: n(e.totals.reversal), sameDayReversal: n(e.totals.sameDayReversal), net: n(e.totals.net), cashOut: n(e.totals.cashOut), pending: n(e.totals.pendingRepayable), signed }, 'expenses totals')
      .toEqual({ items: 4, gross: 90000, reversal: 20000, sameDayReversal: 20000, net: 70000, cashOut: 70000, pending: 0, signed: 70000 });
    expect.soft(n(e.totals.operating), '[issue 8 / issue 11] Chiqimlar "operating" vs the P&L operating expense (ingredients excluded)').toBe(30000);
  });

  it("GET /api/debts: each debtor's balance, and the live balances add up to the ledger's Qarz qoldig'i", async () => {
    const list = await w.admin.get('/api/debts');
    const rows = Object.fromEntries(list.items.map((d: any) => [d.debtorName, { status: d.status, remaining: n(d.remainingAmount), repaid: n(d.repaidAmount), original: n(d.originalAmount) }]));
    expect.soft(rows, 'debts').toEqual({
      'Karim aka': { status: 'OPEN', remaining: 100000, repaid: 0, original: 100000 },
      'Olim aka': { status: 'PARTIAL', remaining: 40000, repaid: 20000, original: 60000 },
    });
    const live = list.items.filter((d: any) => d.status === 'OPEN' || d.status === 'PARTIAL').reduce((s: number, d: any) => s + n(d.remainingAmount), 0);
    expect.soft(live, 'Σ Qarzlar balances vs dailyLedger.debt.outstandingAsOfEod').toBe(n((await ledger(D)).debt.outstandingAsOfEod));
  });

  it('raw rows: Payment, Debt, DebtRepayment, Expense, Order and OrderLine rows on D add up to the ledger', async () => {
    const { start, end } = env.svc.time.localDayRangeFor(D);
    const inDay = { gte: start, lt: end };
    const payments = await env.prisma.payment.findMany({ where: { order: { status: 'CLOSED', closedAt: inDay } } });
    const byMethod = (m: string) => payments.filter((p) => p.method === m).reduce((s, p) => s + n(p.amount), 0);
    const expenses = await env.prisma.expense.findMany({ where: { occurredAt: inDay } });
    const byStatus = (st: string) => expenses.filter((e) => e.status === st).reduce((s, e) => s + n(e.amount), 0);
    const debts = await env.prisma.debt.findMany({ where: { openedAt: inDay } });
    const repayments = await env.prisma.debtRepayment.findMany({ where: { paidAt: inDay } });
    const lines = await env.prisma.orderLine.findMany({ where: { isCanceled: false, order: { status: 'CLOSED', closedAt: inDay } } });
    expect({
      paymentRows: payments.length, cash: byMethod('CASH'), card: byMethod('CARD'), debt: byMethod('DEBT'),
      expenseRows: expenses.length, active: byStatus('ACTIVE'), reversed: byStatus('REVERSED'), reversal: byStatus('REVERSAL'),
      debtRows: debts.length, debtOpened: debts.reduce((s, d) => s + n(d.originalAmount), 0),
      repaymentRows: repayments.length, repaid: repayments.reduce((s, r) => s + n(r.amount), 0),
      closed: await env.prisma.order.count({ where: { status: 'CLOSED', closedAt: inDay } }),
      canceled: await env.prisma.order.count({ where: { status: 'CANCELED', canceledAt: inDay } }),
      lineRows: lines.length, cogs: lines.reduce((s, l) => s + n(l.cogsSnapshot ?? 0), 0),
    }).toEqual({
      paymentRows: 6, cash: 225000, card: 95000, debt: 100000, // S3 has two legs
      expenseRows: 4, active: 70000, reversed: 20000, reversal: 20000, // E1 + E2 active; E3 reversed; its reversal
      debtRows: 1, debtOpened: 100000, repaymentRows: 1, repaid: 20000, closed: 5, canceled: 1,
      lineRows: 8, cogs: 217000, // S1 1 line (Osh ×2), S2 2, S3 1, S4 2, S5 2
    });
  });

  it("the nightly Telegram report (financeReportService → reportsService.daily → formatReportMessage) carries the ledger's figures", async () => {
    for (const [key, value] of [['telegram_bot_token', '000000:placeholder'], ['owner_telegram_chat_id', '42']] as const) {
      await env.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    await env.svc.settings.loadAll();
    // Captured inside the mock: vitest's mockRestore() also clears mock.calls.
    let msg = '';
    const sent = vi.spyOn(env.svc.telegram, 'sendMessage').mockImplementation(async (text: string) => { msg = text; });
    try {
      await env.svc.financeReport.sendDailyTelegramSummary(at(`${D}T23:31`));
    } finally {
      sent.mockRestore();
    }
    const L = await ledger(D);
    expect({
      closed: pick(msg, 'Yopilgan buyurtmalar'), canceled: pick(msg, 'Bekor qilinganlar'), gross: pick(msg, 'Yalpi sotuv'), discount: pick(msg, 'Chegirmalar'),
      netSales: pick(msg, 'Sof sotuv'), service: pick(msg, '✨ Xizmat haqi (ofitsiantlarga)'), cash: pick(msg, 'Naqd (sotuvdan)'), card: pick(msg, 'Karta (sotuvdan)'),
      debtSales: pick(msg, 'Qarzga sotildi'), repaid: pick(msg, 'Qaytgan qarz'), moneyIn: pick(msg, '📥 Jami kelgan'), expenseGross: pick(msg, 'Kiritilgan'),
      sameDayReversal: pick(msg, 'Bekor qilingan'), operating: pick(msg, 'Foyda hisobida'), profit: pick(msg, 'Sof foyda'), drawer: pick(msg, "Kassa o'zgarishi"),
      outstanding: pick(msg, "Qarz qoldig'i"),
    }, `message:\n${msg}`).toEqual({
      closed: L.sales.closedCount, canceled: L.sales.canceledCount, gross: n(L.sales.gross), discount: n(L.sales.discount),
      netSales: n(L.sales.netSales), service: n(L.sales.serviceCharge), cash: n(L.cashflow.orderCash), card: n(L.cashflow.orderCard),
      debtSales: n(L.sales.debtSales), repaid: n(L.cashflow.debtRepaidCash) + n(L.cashflow.debtRepaidCard), moneyIn: n(L.cashflow.realCashIn), expenseGross: n(L.outflow.expenseGross),
      sameDayReversal: n(L.outflow.expenseSameDayReversal), operating: n(L.outflow.operatingExpense), profit: n(L.pnl.profit), drawer: n(L.cashflow.drawerMovement),
      outstanding: n(L.debt.outstandingAsOfEod),
    });
  });
});

// ═══ 2 (continued). A reprint and a write-off ═════════════════════════════════════════════
describe('Drift, continued: a reprint and a write-off', () => {
  it('reprinting S1 moves nothing', () =>
    step('reprint S1', () => w.admin.post(`/api/orders/${S1.id}/reprint-bill`, { reason: "Mijoz so'radi" }), {}));

  it("writing off Karim aka's 100 000 (opened on D): the receivable goes; [issue 31] the loss is booked on the write-off day", async () => {
    const before = await ledger(D);
    await w.admin.post(`/api/debts/${karimDebtId}/write-off`, { reason: 'Topilmadi' });
    const moved = diff(before, await ledger(D));
    const {
      'debt.outstandingAsOfEod': outstanding, 'pnl.profit': profit,
      'pnl.operatingExpense': _carrierA, 'outflow.operatingExpense': _carrierB, // the only legitimate carriers of the loss, whichever one is used
      'outflow.debtWriteOffs': debtWriteOffs, 'lines.writeOffs.length': writeOffRows, // the write-off's own fields
      ...others
    } = moved;
    expect.soft(outstanding, 'debt.outstandingAsOfEod').toBe(-100000);
    expect.soft(profit, '[issue 31] a nasiya written off is a loss on the write-off day: pnl.profit delta').toBe(-100000);
    expect.soft({ debtWriteOffs, writeOffRows }, 'the write-off is recorded: outflow.debtWriteOffs and one lines.writeOffs row').toEqual({ debtWriteOffs: 100000, writeOffRows: 1 });
    expect.soft(others, 'no other field may move on a write-off').toEqual({});
  });
});

// ═══ 3. Day boundaries (Tashkent calendar day; the 05:00 trading day is NOT built) ═════════
describe('Calendar-day boundaries (Asia/Tashkent); the 05:00 trading day of the money rules is not built yet', () => {
  it('a bill closed at 23:30 of D is in D, not in D+1', async () => {
    setClock(at(`${D}T23:30`));
    await w.relogin();
    const dBefore = await ledger(D);
    const d1Before = await ledger(D1);
    await sale(w, w.w1, [[w.items.osh, 1]], cash(45000));
    expect.soft(diff(dBefore, await ledger(D)), `dailyLedger(${D}) delta`).toEqual({
      'sales.closedCount': 1, 'sales.gross': 45000, 'sales.netSales': 45000,
      'cashflow.orderCash': 45000, 'cashflow.realCashIn': 45000, 'cashflow.drawerMovement': 45000,
      'pnl.revenue': 45000, 'pnl.cogs': 25000, 'pnl.profit': 20000, 'lines.closedOrders.length': 1,
    });
    expect.soft(diff(d1Before, await ledger(D1)), `dailyLedger(${D1}) delta`).toEqual({});
  });

  it('a bill closed at 00:30 of D+1 is in D+1, not in D', async () => {
    setClock(at(`${D1}T00:30`));
    await w.relogin();
    const dBefore = await ledger(D);
    await sale(w, w.w2, [[w.items.osh, 1]], cash(45000));
    expect.soft(diff(dBefore, await ledger(D)), `dailyLedger(${D}) delta`).toEqual({});
    const d1 = await ledger(D1);
    expect.soft({ date: d1.date, closed: d1.sales.closedCount, cash: n(d1.cashflow.orderCash) }, `dailyLedger(${D1})`).toEqual({ date: D1, closed: 1, cash: 45000 });
  });

  it('a bill closed at 04:30 of D+1 is in D+1 today (calendar day; a 05:00 trading day would put it in D)', async () => {
    setClock(at(`${D1}T04:30`));
    await w.relogin();
    await sale(w, w.w1, [[w.items.osh, 1]], cash(45000));
    const d1 = await ledger(D1);
    const d = await ledger(D);
    expect({ d1Closed: d1.sales.closedCount, dClosed: d.sales.closedCount }).toEqual({ d1Closed: 2, dClosed: 6 });
    const admin = await w.admin.get(`/api/finance/daily?date=${D1}`);
    expect(admin.sales.closedOrders).toBe(2);
  });

  it('a date that is not a day is refused with 400 VALIDATION', async () => {
    const answers = {
      'finance/daily?date=2026-13-45 (admin)': await w.admin.call('GET', '/api/finance/daily?date=2026-13-45'),
      'finance/daily?date=20-10-2026 (admin)': await w.admin.call('GET', '/api/finance/daily?date=20-10-2026'),
      'reports/daily?date=2026-13-45 (owner)': await w.owner.call('GET', '/api/reports/daily?date=2026-13-45'),
      'reports/daily (no date, owner)': await w.owner.call('GET', '/api/reports/daily'),
      'reports/monthly?month=2026-13 (owner)': await w.owner.call('GET', '/api/reports/monthly?month=2026-13'),
      'reports/summary to before from (owner)': await w.owner.call('GET', `/api/reports/summary?from=${D1}&to=${D}`),
      'me/today-stats?date=2026-13-45 (waiter)': await w.w1.call('GET', '/api/me/today-stats?date=2026-13-45'),
    };
    expect(Object.fromEntries(Object.entries(answers).map(([k, r]) => [k, `${r.status} ${r.body?.error?.code ?? ''}`.trim()])))
      .toEqual(Object.fromEntries(Object.keys(answers).map((k) => [k, '400 VALIDATION'])));
  });

  it("no date means today, by the till's clock (Tashkent)", async () => {
    const r = await w.admin.get('/api/finance/daily');
    expect({ date: r.date, today: env.svc.time.localDayKey() }).toEqual({ date: D1, today: D1 });
  });
});

// ═══ 3 (continued). Month boundary ════════════════════════════════════════════════════════
describe('Month boundary (Tashkent calendar month)', () => {
  it('23:50 on 31 October is October; 00:10 on 1 November is November', async () => {
    setClock(at('2026-10-31T23:50'));
    await w.relogin();
    await sale(w, w.w1, [[w.items.osh, 1]], cash(45000));
    setClock(at('2026-11-01T00:10'));
    await w.relogin();
    await sale(w, w.w2, [[w.items.somsa, 5]], cash(40000));
    const oct = await w.owner.get(`/api/reports/monthly?month=${OCT}`);
    const nov = await w.owner.get(`/api/reports/monthly?month=${NOV}`);
    const row = (m: any, date: string) => m.daily.find((r: any) => r.date === date);
    expect({
      oct31: row(oct, '2026-10-31').sales.closedOrders, octDays: oct.daily.length, octClosed: oct.totals.closedOrders,
      nov1: row(nov, '2026-11-01').sales.closedOrders, novDays: nov.daily.length, novClosed: nov.totals.closedOrders, novNet: n(nov.totals.netSales),
      octHasNov1: oct.daily.some((r: any) => r.date === '2026-11-01'), novHasOct31: nov.daily.some((r: any) => r.date === '2026-10-31'),
    }).toEqual({
      oct31: 1, octDays: 31, octClosed: 10, // D−1 1 + D 6 + D+1 2 + 31 Oct 1
      nov1: 1, novDays: 30, novClosed: 1, novNet: 40000, octHasNov1: false, novHasOct31: false,
    });
  });

  it('October totals are the sum of its days', async () => {
    const m = await w.owner.get(`/api/reports/monthly?month=${OCT}`);
    const rows = m.daily;
    const sum = (path: string) => rows.reduce((s: number, r: any) => s + n(get(r, path)), 0);
    const T = m.totals;
    expect({
      closedOrders: T.closedOrders, canceledOrders: T.canceledOrders, grossSales: n(T.grossSales), discounts: n(T.discounts), netSales: n(T.netSales),
      debtSales: n(T.debtSales), serviceCharge: n(T.serviceCharge), realCashIn: n(T.realCashIn), expensesNet: n(T.expensesNet),
      salesBasedProfit: n(T.salesBasedProfit), cashflowBasedNet: n(T.cashflowBasedNet), outstandingDebtEndOfMonth: n(T.outstandingDebtEndOfMonth),
    }).toEqual({
      closedOrders: sum('sales.closedOrders'), canceledOrders: sum('sales.canceledOrders'), grossSales: sum('sales.grossSales'), discounts: sum('sales.discounts'),
      netSales: sum('sales.netSales'), debtSales: sum('sales.debtSales'), serviceCharge: sum('sales.serviceCharge'), realCashIn: sum('cashflow.realCashIn'),
      expensesNet: sum('expenses.net'), salesBasedProfit: sum('pnl.profit'), cashflowBasedNet: sum('results.cashflowBasedNet'),
      outstandingDebtEndOfMonth: n(rows[rows.length - 1].debtSnapshot.outstandingTotal),
    });
  });

  it(`the monthly row for ${D} is dailyLedger(${D}), figure for figure (as both stand now)`, async () => {
    const L = await ledger(D);
    const row = (await w.owner.get(`/api/reports/monthly?month=${OCT}`)).daily.find((r: any) => r.date === D);
    const pairs: Array<[string, string]> = [
      ['sales.closedOrders', 'sales.closedCount'], ['sales.canceledOrders', 'sales.canceledCount'], ['sales.grossSales', 'sales.gross'], ['sales.discounts', 'sales.discount'],
      ['sales.netSales', 'sales.netSales'], ['sales.debtSales', 'sales.debtSales'], ['sales.serviceCharge', 'sales.serviceCharge'],
      ['cashflow.orderCash', 'cashflow.orderCash'], ['cashflow.orderCard', 'cashflow.orderCard'], ['cashflow.debtRepaymentsCash', 'cashflow.debtRepaidCash'],
      ['cashflow.debtRepaymentsCard', 'cashflow.debtRepaidCard'], ['cashflow.expenseReturns', 'cashflow.expenseReturns'], ['cashflow.realCashIn', 'cashflow.realCashIn'],
      ['expenses.gross', 'outflow.expenseGross'], ['expenses.reversal', 'outflow.expenseReversal'], ['expenses.net', 'outflow.expenseNet'], ['expenses.operating', 'outflow.operatingExpense'],
      ['pnl.revenue', 'pnl.revenue'], ['pnl.cogs', 'pnl.cogs'], ['pnl.operatingExpense', 'pnl.operatingExpense'], ['pnl.profit', 'pnl.profit'],
      ['results.salesBasedProfit', 'pnl.profit'], ['results.cashflowBasedNet', 'cashflow.drawerMovement'], ['debtSnapshot.outstandingTotal', 'debt.outstandingAsOfEod'],
    ];
    const off = pairs.filter(([a, b]) => n(get(row, a)) !== n(get(L, b))).map(([a, b]) => `monthly.${a}=${get(row, a)} vs ledger.${b}=${get(L, b)}`);
    expect(off).toEqual([]);
  });

  it(`summary(${D}..${D}) is dailyLedger(${D}), figure for figure`, async () => {
    const L = await ledger(D);
    const s = await w.owner.get(`/api/reports/summary?from=${D}&to=${D}`);
    const pairs: Array<[string, string]> = [
      ['incomes.totals.cogs', 'pnl.cogs'], ['incomes.salesByPaymentMethod.cash', 'cashflow.orderCash'], ['incomes.salesByPaymentMethod.card', 'cashflow.orderCard'],
      ['incomes.salesByPaymentMethod.debt', 'sales.debtSales'], ['pnl.revenue', 'pnl.revenue'], ['pnl.grossRevenue', 'sales.gross'], ['pnl.discount', 'sales.discount'],
      ['pnl.cogs', 'pnl.cogs'], ['pnl.operatingExpense', 'pnl.operatingExpense'], ['pnl.profit', 'pnl.profit'], ['cash.totalIn', 'cashflow.realCashIn'],
      ['cash.totalOut', 'cashflow.cashOut'], ['cash.farq', 'cashflow.drawerMovement'], ['cash.expenseReturns', 'cashflow.expenseReturns'],
    ];
    const off = pairs.filter(([a, b]) => n(get(s, a)) !== n(get(L, b))).map(([a, b]) => `summary.${a}=${get(s, a)} vs ledger.${b}=${get(L, b)}`);
    if (n(s.incomes.other.debtRepaid) !== n(L.cashflow.debtRepaidCash) + n(L.cashflow.debtRepaidCard)) off.push(`summary.incomes.other.debtRepaid=${s.incomes.other.debtRepaid}`);
    expect(off).toEqual([]);
  });
});

// ═══ 4. Roles ═════════════════════════════════════════════════════════════════════════════
describe('Roles', () => {
  const FORBIDDEN_FOR_WAITER = [
    `/api/finance/daily?date=${D}`, `/api/finance/service-charge?from=${D}&to=${D}`,
    `/api/reports/daily?date=${D}`, `/api/reports/monthly?month=${OCT}`, `/api/reports/summary?from=${D}&to=${D}`,
    '/api/debts', `/api/expenses?date=${D}`, '/api/expense-categories', '/api/stock', '/api/menu/items',
    '/api/users', `/api/users/today-stats?date=${D}`, '/api/settings', '/api/audit', '/api/discounts', '/api/printers',
  ];

  it('WAITER: every money and admin surface answers 403 FORBIDDEN', async () => {
    const answers: Record<string, string> = {};
    for (const path of FORBIDDEN_FOR_WAITER) {
      const r = await w.w1.call('GET', path);
      answers[path] = `${r.status} ${r.body?.error?.code ?? ''}`.trim();
    }
    expect(answers).toEqual(Object.fromEntries(FORBIDDEN_FOR_WAITER.map((p) => [p, '403 FORBIDDEN'])));
  });

  it('ADMIN: the owner reports are 403; Kunlik moliya is 200 and carries profit (D18 — ADMIN may see profit)', async () => {
    const forbidden = [`/api/reports/daily?date=${D}`, `/api/reports/monthly?month=${OCT}`, `/api/reports/summary?from=${D}&to=${D}`];
    const answers: Record<string, string> = {};
    for (const path of forbidden) {
      const r = await w.admin.call('GET', path);
      answers[path] = `${r.status} ${r.body?.error?.code ?? ''}`.trim();
    }
    expect.soft(answers).toEqual(Object.fromEntries(forbidden.map((p) => [p, '403 FORBIDDEN'])));
    const daily = await w.admin.call('GET', `/api/finance/daily?date=${D}`);
    expect.soft({ status: daily.status, profit: daily.body?.pnl?.profit, ledgerProfit: daily.body?.ledger?.pnl?.profit })
      .toEqual({ status: 200, profit: (await ledger(D)).pnl.profit, ledgerProfit: (await ledger(D)).pnl.profit });
  });

  it("[issue 32] WAITER's reachable payloads carry no tan narx, no cogs and no profit", async () => {
    const reachable: Array<[string, () => Promise<any>]> = [
      ['GET /api/auth/me', () => w.w1.get('/api/auth/me')],
      [`GET /api/me/today-stats?date=${D}`, () => w.w1.get(`/api/me/today-stats?date=${D}`)],
      [`GET /api/me/range-stats?from=${D0}&to=${D1}`, () => w.w1.get(`/api/me/range-stats?from=${D0}&to=${D1}`)],
      ['GET /api/menu', () => w.w1.get('/api/menu')],
      ['GET /api/menu/categories', () => w.w1.get('/api/menu/categories')],
      ['GET /api/menu/combos', () => w.w1.get('/api/menu/combos')],
      ['GET /api/tables', () => w.w1.get('/api/tables')],
      ['GET /api/orders (own list)', () => w.w1.get('/api/orders')],
      [`GET /api/orders/:id (own closed bill S1)`, () => w.w1.get(`/api/orders/${S1.id}`)],
      ['GET /api/health', () => w.w1.get('/api/health')],
    ];
    const leaks: string[] = [];
    const statuses: Record<string, number> = {};
    for (const [name, call] of reachable) {
      try {
        const body = await call();
        statuses[name] = 200;
        const seen = new Map<string, string>();
        scanLeaks(body, '$', seen);
        for (const [path, value] of seen) leaks.push(`${name} → ${path}=${value}`);
      } catch (error) {
        statuses[name] = (error as any).status ?? -1;
      }
    }
    expect.soft(statuses, 'every listed endpoint must answer a WAITER with 200').toEqual(Object.fromEntries(reachable.map(([name]) => [name, 200])));
    expect.soft(leaks, '[issue 32] keys naming cost/cogs/profit on the waiter wire').toEqual([]);
  });

  it("WAITER cannot read a colleague's order (403), and cannot confirm or reprint anything", async () => {
    const other = await w.w1.call('GET', `/api/orders/${S2.id}`); // S2 is Bekzod's
    const confirm = await w.w1.call('POST', `/api/orders/${S1.id}/confirm`, cash(1));
    const reprint = await w.w1.call('POST', `/api/orders/${S1.id}/reprint-bill`, {});
    expect({ other: other.status, confirm: confirm.status, reprint: reprint.status }).toEqual({ other: 403, confirm: 403, reprint: 403 });
  });
});

// ═══ 5. Money shape ═══════════════════════════════════════════════════════════════════════
describe("Money shape: whole so'm everywhere, Tashkent day strings", () => {
  it('every amount in the finance and report payloads is a whole integer; days are YYYY-MM-DD, months YYYY-MM', async () => {
    const payloads: Record<string, any> = {
      [`admin finance/daily?date=${D}`]: await w.admin.get(`/api/finance/daily?date=${D}`),
      [`admin finance/service-charge?from=${D0}&to=${D1}`]: await w.admin.get(`/api/finance/service-charge?from=${D0}&to=${D1}`),
      [`admin finance/service-charge?month=${OCT}`]: await w.admin.get(`/api/finance/service-charge?month=${OCT}`),
      [`owner reports/daily?date=${D}`]: await w.owner.get(`/api/reports/daily?date=${D}`),
      [`owner reports/monthly?month=${OCT}`]: await w.owner.get(`/api/reports/monthly?month=${OCT}`),
      [`owner reports/summary?from=${D0}&to=${D1}`]: await w.owner.get(`/api/reports/summary?from=${D0}&to=${D1}`),
      [`admin users/today-stats?date=${D}`]: await w.admin.get(`/api/users/today-stats?date=${D}`),
      [`Aziz me/today-stats?date=${D}`]: await w.w1.get(`/api/me/today-stats?date=${D}`),
      [`Aziz me/range-stats?from=${D0}&to=${D1}`]: await w.w1.get(`/api/me/range-stats?from=${D0}&to=${D1}`),
      [`admin expenses?date=${D}`]: await w.admin.get(`/api/expenses?date=${D}`),
      ['admin debts']: await w.admin.get('/api/debts'),
      [`admin orders?status=CLOSED&date=${D}`]: await w.admin.get(`/api/orders?status=CLOSED&date=${D}`),
    };
    const violations: string[] = [];
    for (const [name, body] of Object.entries(payloads)) walkShape(body, name, violations);
    expect(violations).toEqual([]);
  });

  it('the ledger DTO itself: every amount a whole-integer string, the date the day key', async () => {
    const violations: string[] = [];
    for (const day of [D0, D, D1]) walkShape(await ledger(day), `dailyLedger(${day})`, violations);
    expect(violations).toEqual([]);
  });
});
