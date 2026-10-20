/* eslint-disable @typescript-eslint/no-explicit-any */
// Money walkthrough — Chiqim, its reversal, avans and avans returns, nasiya, repayments and
// write-offs. Every expected figure is hand-computed in a comment next to the assertion; the
// app is never consulted for an expectation. Four Tashkent days:
//   D1 — two expenses, a same-day reversal, five nasiya bills, same-day repayments and a race
//   D2 — a repayment, a cross-day reversal attempt, a debt write-off, a payment after the write-off
//   D3 — an avans of 100 000 and a 40 000 return
//   D4 — a later return, the avans write-off, an avans undone, and probes against closed days
//
// Hand model, D1 as it ends:
//   bills: Karim 120 000 (nasiya), Karim 120 000 (nasiya), Salim 120 000 (50 000 cash + 70 000 nasiya),
//          Olim 100 000 (nasiya), Rustam 120 000 (nasiya)       → netSales 580 000, debtSales 530 000
//   repayments: Karim#1 50 000 cash + 70 000 card; Olim 60 000 cash → cash 110 000, card 70 000
//   realCashIn = 50 000 + 0 + 110 000 + 70 000 + 0 = 230 000
//   Chiqim: Gaz 30 000 (reversed same day) + Bozor 40 000 → gross 70 000, cashOut 40 000, operating 0
//   drawer = 230 000 − 40 000 = 190 000; cogs 0 (Achichuk has no tan narx) → profit 580 000
//   outstanding at close = 530 000 − 180 000 = 350 000 (Karim#2 120 + Salim 70 + Olim 40 + Rustam 120)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, boot, buildWorld, capturePrints, n, sale, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D1 = '2026-10-05';
const D2 = '2026-10-06';
const D3 = '2026-10-07';
const D4 = '2026-10-08';

const ledger = (day: string) => env.svc.reports.dailyLedger(day);
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const sum = (rows: any[], pick: (r: any) => unknown) => rows.reduce((s: number, r: any) => s + n(pick(r)), 0);
/** What Qarzlar adds up: the balance of every debt that is OPEN or PARTIAL. */
const liveOutstanding = (list: any) =>
  sum(list.items.filter((d: any) => d.status === 'OPEN' || d.status === 'PARTIAL'), (d) => d.remainingAmount);
const debtOfOrder = async (orderId: string) => (await w.admin.get('/api/debts')).items.find((d: any) => d.orderId === orderId);
const answer = (r: { status: number; body: any }) => [r.status, r.body?.error?.code ?? null];

/** The figures of a ledger as numbers, for whole-day comparisons. */
const figures = (l: any) => ({
  sales: {
    closedCount: l.sales.closedCount,
    netSales: n(l.sales.netSales),
    debtSales: n(l.sales.debtSales),
    discount: n(l.sales.discount),
    serviceCharge: n(l.sales.serviceCharge),
  },
  cashflow: Object.fromEntries(Object.entries(l.cashflow).map(([k, v]) => [k, n(v)])),
  outflow: {
    expenseGross: n(l.outflow.expenseGross),
    expenseSameDayReversal: n(l.outflow.expenseSameDayReversal),
    expenseNet: n(l.outflow.expenseNet),
    operatingExpense: n(l.outflow.operatingExpense),
    pendingRepayable: n(l.outflow.pendingRepayable),
  },
  pnl: Object.fromEntries(Object.entries(l.pnl).map(([k, v]) => [k, n(v)])),
  debt: {
    openedTodayCount: l.debt.openedTodayCount,
    openedTodayAmount: n(l.debt.openedTodayAmount),
    repaidTodayAmount: n(l.debt.repaidTodayAmount),
    outstandingAsOfEod: n(l.debt.outstandingAsOfEod),
  },
});

/** Every JSON path in `obj` whose value prints as `needle` — to say where a figure surfaces. */
function where(obj: unknown, needle: string, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return String(obj) === needle ? [prefix || '<root>'] : [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => where(v, needle, prefix ? `${prefix}.${k}` : k));
}

/** Every numeric value in `obj` that is not a whole number. */
function fractional(obj: unknown, prefix = '', out: string[] = []): string[] {
  if (typeof obj === 'number') {
    if (!Number.isInteger(obj)) out.push(`${prefix}=${obj}`);
  } else if (typeof obj === 'string') {
    if (/^-?\d+\.\d+$/.test(obj)) out.push(`${prefix}=${obj}`);
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) fractional(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

// Shared across the days.
let e1: any; // D1 — 30 000 "Gaz", Operatsion, reversed the same day
let e2: any; // D1 — 40 000 "Bozor: go'sht", Mahsulot xaridi
let avans: any; // D3 — 100 000 "Oshpazga avans", repayable
const debts: Record<'k1' | 'k2' | 's' | 'o' | 'r', any> = {} as any;
let d1Close: any; // the D1 ledger as D1 ended
let d3Close: any; // the D3 ledger as D3 ended

beforeAll(async () => {
  setClock(at(`${D1}T09:00`));
  env = await boot('money-expenses-debts');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

// ─── D1 — Chiqim ──────────────────────────────────────────────────────────

describe('D1 — Chiqim', () => {
  it('the two seeded categories are the only ones; the router has no create, rename or deactivate', async () => {
    const cats = await w.admin.get('/api/expense-categories');
    expect.soft(cats.map((c: any) => [c.id, c.name, c.isActive]), 'GET /api/expense-categories').toEqual([
      ['seed-cat-ingredients', 'Mahsulot xaridi', true],
      ['seed-cat-operational', 'Operatsion', true],
    ]);
    // Record only: expense-category.routes.ts routes GET / and nothing else.
    const post = await w.admin.call('POST', '/api/expense-categories', { name: 'Ijara' });
    const patch = await w.admin.call('PATCH', '/api/expense-categories/seed-cat-operational', { name: 'Ijara' });
    expect.soft(
      [post.status, patch.status].every((s) => s >= 400),
      `POST answered ${post.status}, PATCH answered ${patch.status} — no category endpoints beyond GET`,
    ).toBe(true);
  });

  it('an operating expense of 30 000 books as Operatsion, whole so\'m, cash', async () => {
    setClock(at(`${D1}T10:00`));
    e1 = await w.admin.post('/api/expenses', { amount: 30000, reason: 'Gaz', occurredAt: at(`${D1}T10:00`).toISOString() });
    expect.soft(e1.amount, 'amount').toBe('30000');
    expect.soft(e1.categoryName, 'default category').toBe('Operatsion');
    expect.soft(e1.status, 'status').toBe('ACTIVE');
    expect.soft(e1.repayStatus, 'repayStatus').toBe('NOT_REPAYABLE');
    // createExpenseSchema has no payment-method field: every Chiqim is cash out of the till.
    expect.soft('method' in e1, 'an expense carries no payment method').toBe(false);
    const l = await ledger(D1);
    // gross 30 000; operating 30 000; cashOut 30 000; nothing came in → drawer −30 000
    expect.soft(n(l.outflow.expenseGross), 'expenseGross').toBe(30000);
    expect.soft(n(l.pnl.operatingExpense), 'operatingExpense').toBe(30000);
    expect.soft(n(l.cashflow.cashOut), 'cashOut').toBe(30000);
    expect.soft(n(l.cashflow.drawerMovement), 'drawerMovement').toBe(-30000);
  });

  it("[PRD 14 G3] amount 0, negative, fractional or text → 400 VALIDATION, no row written", async () => {
    const before = await env.prisma.expense.count();
    const book = (amount: unknown) =>
      w.admin.call('POST', '/api/expenses', { amount, reason: 'Summa sinovi', occurredAt: at(`${D1}T10:05`).toISOString() });
    const answers = { zero: await book(0), negative: await book(-5000), fractional: await book(12500.5), text: await book('12 500') };
    expect(
      {
        answers: Object.fromEntries(Object.entries(answers).map(([k, r]) => [k, answer(r)])),
        written: (await env.prisma.expense.count()) - before,
      },
    ).toEqual({
      answers: { zero: [400, 'VALIDATION'], negative: [400, 'VALIDATION'], fractional: [400, 'VALIDATION'], text: [400, 'VALIDATION'] },
      written: 0,
    });
  });

  it('[D15] a 40 000 "Mahsulot xaridi" through the expense endpoint leaves the till but stays out of Chiqim', async () => {
    e2 = await w.admin.post('/api/expenses', {
      categoryId: 'seed-cat-ingredients', amount: 40000, reason: "Bozor: go'sht", occurredAt: at(`${D1}T10:10`).toISOString(),
    });
    expect.soft(e2.categoryName, 'category').toBe('Mahsulot xaridi');
    const l = await ledger(D1);
    // gross 30 000 + 40 000 = 70 000; operating 30 000 (the 40 000 is food cost's domain); cashOut 70 000
    expect.soft(n(l.outflow.expenseGross), 'expenseGross').toBe(70000);
    expect.soft(n(l.pnl.operatingExpense), 'operatingExpense excludes Mahsulot xaridi').toBe(30000);
    expect.soft(n(l.cashflow.cashOut), 'cashOut includes it').toBe(70000);
    // the expense endpoint is not Keldi: no StockEntry was written
    expect.soft(n(l.outflow.ingredientPurchases), 'ingredientPurchases (StockEntry money)').toBe(0);
    expect.soft(n(l.cashflow.drawerMovement), 'drawerMovement').toBe(-70000);
  });

  it('a same-day reversal of the 30 000 takes it out of cash out and out of Chiqim', async () => {
    setClock(at(`${D1}T10:30`));
    const r = await w.admin.post(`/api/expenses/${e1.id}/reverse`, { note: "Noto'g'ri kiritildi" });
    expect.soft(r.original.status, 'original').toBe('REVERSED');
    expect.soft(r.reversal.status, 'reversal row').toBe('REVERSAL');
    expect.soft(String(r.reversal.amount), 'reversal amount').toBe('30000');
    const l = await ledger(D1);
    // gross stays 70 000 (the REVERSED original still counts as having left); sameDayReversal 30 000
    // cashOut = 70 000 − 30 000 = 40 000; operating = 30 000 − 30 000 = 0; drawer −40 000
    expect.soft(n(l.outflow.expenseGross), 'expenseGross').toBe(70000);
    expect.soft(n(l.outflow.expenseSameDayReversal), 'expenseSameDayReversal').toBe(30000);
    expect.soft(n(l.outflow.expenseNet), 'expenseNet').toBe(40000);
    expect.soft(n(l.cashflow.cashOut), 'cashOut').toBe(40000);
    expect.soft(n(l.pnl.operatingExpense), 'operatingExpense').toBe(0);
    expect.soft(n(l.cashflow.drawerMovement), 'drawerMovement').toBe(-40000);
  });

  it('reversing twice, or reversing the reversal row, is refused and moves nothing', async () => {
    const again = await w.admin.call('POST', `/api/expenses/${e1.id}/reverse`, { note: 'Yana bir bor' });
    const page = await w.admin.get(`/api/expenses?date=${D1}`);
    const reversalRow = page.items.find((x: any) => x.status === 'REVERSAL');
    const ofReversal = await w.admin.call('POST', `/api/expenses/${reversalRow.id}/reverse`, { note: 'Bekorni bekor' });
    const l = await ledger(D1);
    expect({
      again: answer(again),
      ofReversal: answer(ofReversal),
      cashOut: n(l.cashflow.cashOut),
      operating: n(l.pnl.operatingExpense),
    }).toEqual({ again: [409, 'EXPENSE_ALREADY_REVERSED'], ofReversal: [400, 'EXPENSE_REVERSAL_INVALID'], cashOut: 40000, operating: 0 });
  });

  it('a return on a plain (non-repayable) expense is refused', async () => {
    const r = await w.admin.call('POST', `/api/expenses/${e2.id}/returns`, { amount: 10000 });
    const l = await ledger(D1);
    expect({ answer: answer(r), expenseReturns: n(l.cashflow.expenseReturns) }).toEqual({ answer: [400, 'VALIDATION'], expenseReturns: 0 });
  });

  it('[D17] the Chiqimlar list for the day agrees with the ledger', async () => {
    const page = await w.admin.get(`/api/expenses?date=${D1}`);
    const l = await ledger(D1);
    // rows: Gaz +30 000 (REVERSED), Bozor +40 000, REVERSAL −30 000 → gross 70 000, Σ signed 40 000
    expect.soft(page.items.length, 'rows').toBe(3);
    expect.soft(n(page.totals.gross), 'list gross').toBe(70000);
    expect.soft(n(page.totals.gross), 'list gross == ledger expenseGross').toBe(n(l.outflow.expenseGross));
    expect.soft(sum(page.items, (e) => e.signedAmount), 'Σ signedAmount == cash that left').toBe(40000);
    expect.soft(n(page.totals.cashOut), 'list cashOut == ledger cashOut').toBe(n(l.cashflow.cashOut));
    // One word, one meaning: the Chiqim the list shows must be the Chiqim profit subtracts (0 — the 40 000 is food cost)
    expect.soft(
      n(page.totals.operating),
      `Chiqimlar list "operating" ${page.totals.operating} vs ledger pnl.operatingExpense ${l.pnl.operatingExpense}`,
    ).toBe(n(l.pnl.operatingExpense));
  });
});

// ─── D1 — Nasiya ──────────────────────────────────────────────────────────

describe('D1 — Nasiya', () => {
  it('a 120 000 bill closed as nasiya: revenue today, money in 0, one debt of 120 000', async () => {
    setClock(at(`${D1}T11:00`));
    const { id, closed } = await sale(w, w.w1, [[w.items.salat, 6]], {
      payments: [{ method: 'DEBT', amount: 120000 }],
      debt: { debtorName: 'Karim aka' },
    });
    // Achichuk 20 000 × 6 = 120 000; no tan narx → cogs 0
    expect.soft(closed.totalSnapshot, 'bill total').toBe(120000);
    expect.soft(closed.debt, 'debt on the closed order').toMatchObject({
      debtorName: 'Karim aka', originalAmount: 120000, remainingAmount: 120000, status: 'OPEN',
    });
    debts.k1 = await debtOfOrder(id);
    expect.soft(debts.k1, 'Qarzlar row').toMatchObject({
      debtorName: 'Karim aka', originalAmount: '120000', remainingAmount: '120000', repaidAmount: '0', status: 'OPEN',
    });
    const l = await ledger(D1);
    // netSales 120 000 (recognised at close); debtSales 120 000; orderCash 0; realCashIn 0; outstanding 120 000
    expect.soft(n(l.sales.netSales), 'netSales').toBe(120000);
    expect.soft(n(l.sales.debtSales), 'debtSales').toBe(120000);
    expect.soft(n(l.cashflow.orderCash), 'orderCash').toBe(0);
    expect.soft(n(l.cashflow.realCashIn), 'realCashIn').toBe(0);
    expect.soft(n(l.debt.openedTodayAmount), 'openedTodayAmount').toBe(120000);
    expect.soft(n(l.debt.outstandingAsOfEod), 'outstandingAsOfEod').toBe(120000);
  });

  it('a second nasiya for the same name is a second debt row — a debt is per bill, there is no debtor entity', async () => {
    const { id } = await sale(w, w.w1, [[w.items.salat, 6]], {
      payments: [{ method: 'DEBT', amount: 120000 }],
      debt: { debtorName: 'Karim aka' },
    });
    const list = await w.admin.get('/api/debts');
    const karim = list.items.filter((d: any) => d.debtorName === 'Karim aka');
    debts.k2 = karim.find((d: any) => d.orderId === id);
    // two rows named Karim aka, 120 000 + 120 000 = 240 000 owed
    expect({ rows: karim.length, owed: sum(karim, (d) => d.remainingAmount), distinctDebts: new Set(karim.map((d: any) => d.id)).size })
      .toEqual({ rows: 2, owed: 240000, distinctDebts: 2 });
  });

  it('partial nasiya — 50 000 cash + 70 000 nasiya on a 120 000 bill: a debt of 70 000, cash in 50 000', async () => {
    const { id, closed } = await sale(w, w.w2, [[w.items.salat, 6]], {
      payments: [{ method: 'CASH', amount: 50000 }, { method: 'DEBT', amount: 70000 }],
      debt: { debtorName: 'Salim aka' },
    });
    expect.soft(closed.totalSnapshot, 'bill total').toBe(120000);
    debts.s = await debtOfOrder(id);
    expect.soft(debts.s, 'Qarzlar row').toMatchObject({ debtorName: 'Salim aka', originalAmount: '70000', remainingAmount: '70000', status: 'OPEN' });
    const l = await ledger(D1);
    // netSales 120 + 120 + 120 = 360 000; orderCash 50 000; debtSales 120 + 120 + 70 = 310 000; realCashIn 50 000
    expect.soft(n(l.sales.netSales), 'netSales').toBe(360000);
    expect.soft(n(l.cashflow.orderCash), 'orderCash').toBe(50000);
    expect.soft(n(l.sales.debtSales), 'debtSales').toBe(310000);
    expect.soft(n(l.cashflow.realCashIn), 'realCashIn').toBe(50000);
    expect.soft(n(l.debt.outstandingAsOfEod), 'outstandingAsOfEod').toBe(310000);
  });

  it('setup: Olim aka 100 000 (for the race) and Rustam aka 120 000 (for tomorrow), both nasiya', async () => {
    const o = await sale(w, w.w2, [[w.items.salat, 5]], { payments: [{ method: 'DEBT', amount: 100000 }], debt: { debtorName: 'Olim aka' } });
    const r = await sale(w, w.w1, [[w.items.salat, 6]], { payments: [{ method: 'DEBT', amount: 120000 }], debt: { debtorName: 'Rustam aka' } });
    debts.o = await debtOfOrder(o.id);
    debts.r = await debtOfOrder(r.id);
    const l = await ledger(D1);
    // netSales 360 + 100 + 120 = 580 000; debtSales 310 + 100 + 120 = 530 000; 5 debts opened; outstanding 530 000
    expect({
      netSales: n(l.sales.netSales), debtSales: n(l.sales.debtSales),
      opened: l.debt.openedTodayCount, openedAmount: n(l.debt.openedTodayAmount), outstanding: n(l.debt.outstandingAsOfEod),
    }).toEqual({ netSales: 580000, debtSales: 530000, opened: 5, openedAmount: 530000, outstanding: 530000 });
  });

  it('50 000 cash on Karim #1: 70 000 left, money in +50 000, revenue unchanged', async () => {
    setClock(at(`${D1}T12:00`));
    const before = await ledger(D1);
    const r = await w.admin.post(`/api/debts/${debts.k1.id}/repayments`, { amount: 50000, method: 'CASH' });
    // 120 000 − 50 000 = 70 000
    expect.soft(r, 'debt after').toMatchObject({ remainingAmount: '70000', repaidAmount: '50000', status: 'PARTIAL', closedAt: null });
    expect.soft(r.repayments.map((x: any) => [x.amount, x.method]), 'repayment rows').toEqual([['50000', 'CASH']]);
    const l = await ledger(D1);
    expect.soft(n(l.cashflow.debtRepaidCash), 'debtRepaidCash').toBe(50000);
    // realCashIn = 50 000 (Salim's cash) + 50 000 (this repayment) = 100 000
    expect.soft(n(l.cashflow.realCashIn), 'realCashIn').toBe(100000);
    expect.soft(n(l.sales.netSales), 'netSales must not move on a repayment').toBe(n(before.sales.netSales));
    expect.soft(n(l.sales.netSales), 'netSales').toBe(580000);
    expect.soft(n(l.debt.repaidTodayAmount), 'repaidTodayAmount').toBe(50000);
    // 530 000 − 50 000 = 480 000
    expect.soft(n(l.debt.outstandingAsOfEod), 'outstandingAsOfEod').toBe(480000);
  });

  it("over-repaying by 1 so'm → 400 DEBT_OVERPAY, balance still 70 000", async () => {
    const r = await w.admin.call('POST', `/api/debts/${debts.k1.id}/repayments`, { amount: 70001, method: 'CASH' });
    const d = await w.admin.get(`/api/debts/${debts.k1.id}`);
    expect({ answer: answer(r), remaining: d.remainingAmount, rows: d.repayments.length })
      .toEqual({ answer: [400, 'DEBT_OVERPAY'], remaining: '70000', rows: 1 });
  });

  it("[PRD 14 G3] a repayment of 0, a fraction, text, or by nasiya → 400 VALIDATION; balance untouched", async () => {
    const pay = (body: unknown) => w.admin.call('POST', `/api/debts/${debts.k1.id}/repayments`, body);
    const answers = {
      zero: await pay({ amount: 0, method: 'CASH' }),
      fractional: await pay({ amount: 1000.5, method: 'CASH' }),
      text: await pay({ amount: '1 000', method: 'CASH' }),
      byDebt: await pay({ amount: 1000, method: 'DEBT' }),
    };
    const d = await w.admin.get(`/api/debts/${debts.k1.id}`);
    expect({
      answers: Object.fromEntries(Object.entries(answers).map(([k, r]) => [k, answer(r)])),
      remaining: d.remainingAmount,
      rows: d.repayments.length,
    }).toEqual({
      answers: { zero: [400, 'VALIDATION'], fractional: [400, 'VALIDATION'], text: [400, 'VALIDATION'], byDebt: [400, 'VALIDATION'] },
      remaining: '70000',
      rows: 1,
    });
  });

  it('70 000 by card settles Karim #1: 0 left, PAID, card money in 70 000', async () => {
    const r = await w.admin.post(`/api/debts/${debts.k1.id}/repayments`, { amount: 70000, method: 'CARD' });
    expect.soft(r, 'debt after').toMatchObject({ remainingAmount: '0', repaidAmount: '120000', status: 'PAID' });
    expect.soft(r.closedAt, 'closedAt set').not.toBeNull();
    const l = await ledger(D1);
    expect.soft(n(l.cashflow.debtRepaidCard), 'debtRepaidCard').toBe(70000);
    // realCashIn = 50 000 + 50 000 + 70 000 = 170 000
    expect.soft(n(l.cashflow.realCashIn), 'realCashIn').toBe(170000);
    expect.soft(n(l.debt.repaidTodayAmount), 'repaidTodayAmount').toBe(120000);
    // 480 000 − 70 000 = 410 000
    expect.soft(n(l.debt.outstandingAsOfEod), 'outstandingAsOfEod').toBe(410000);
    expect.soft(n(l.sales.netSales), 'netSales unchanged').toBe(580000);
  });

  it('a repayment on a PAID debt → 409 DEBT_NOT_OPEN', async () => {
    const r = await w.admin.call('POST', `/api/debts/${debts.k1.id}/repayments`, { amount: 1000, method: 'CASH' });
    const d = await w.admin.get(`/api/debts/${debts.k1.id}`);
    expect({ answer: answer(r), status: d.status, rows: d.repayments.length }).toEqual({ answer: [409, 'DEBT_NOT_OPEN'], status: 'PAID', rows: 2 });
  });

  it('[PRD 14 G2] two 60 000 repayments at the same moment on a 100 000 debt: one lands, 40 000 left, never negative', async () => {
    const pay = () => w.admin.call('POST', `/api/debts/${debts.o.id}/repayments`, { amount: 60000, method: 'CASH' });
    const [a, b] = await Promise.all([pay(), pay()]);
    const refused = [a, b].filter((x) => x.status !== 201);
    const row = await env.prisma.debt.findUniqueOrThrow({ where: { id: debts.o.id }, include: { repayments: true } });
    // 100 000 − 60 000 = 40 000; the second 60 000 does not fit
    expect({
      statuses: [a.status, b.status].sort(),
      refusedAs: refused.map((x) => x.body?.error?.code),
      remaining: n(row.remainingAmount),
      rows: row.repayments.length,
      status: row.status,
    }).toEqual({ statuses: [201, 400], refusedAs: ['DEBT_OVERPAY'], remaining: 40000, rows: 1, status: 'PARTIAL' });
  });

  it('D1 as it ends: the ledger, the admin page, Qarzlar and the rows agree on every figure', async () => {
    const l = await ledger(D1);
    const admin = await w.admin.get(`/api/finance/daily?date=${D1}`);
    const list = await w.admin.get('/api/debts');
    const live = liveOutstanding(list);
    const open = await env.prisma.debt.findMany({ where: { writtenOffAt: null }, include: { repayments: true } });
    const rebuilt = open.reduce((s, d) => s + n(d.originalAmount) - sum(d.repayments, (x) => x.amount), 0);
    const { start, end } = env.svc.time.localDayRangeFor(D1);
    const rows = await env.prisma.debtRepayment.findMany({ where: { paidAt: { gte: start, lt: end } } });

    expect.soft(figures(l), 'D1 ledger').toEqual({
      sales: { closedCount: 5, netSales: 580000, debtSales: 530000, discount: 0, serviceCharge: 0 },
      cashflow: {
        orderCash: 50000, orderCard: 0, debtRepaidCash: 110000, debtRepaidCard: 70000, expenseReturns: 0,
        realCashIn: 230000, cashOut: 40000, drawerMovement: 190000,
      },
      outflow: { expenseGross: 70000, expenseSameDayReversal: 30000, expenseNet: 40000, operatingExpense: 0, pendingRepayable: 0 },
      pnl: { revenue: 580000, cogs: 0, operatingExpense: 0, profit: 580000 },
      debt: { openedTodayCount: 5, openedTodayAmount: 530000, repaidTodayAmount: 180000, outstandingAsOfEod: 350000 },
    });
    expect.soft(admin.ledger, 'GET /api/finance/daily .ledger == dailyLedger').toEqual(json(l));
    expect.soft(
      { totalIn: n(admin.cashflow.totalIn), totalOut: n(admin.outflow.totalOut), movement: n(admin.drawer.movement), outstanding: n(admin.drawer.outstandingDebts), profit: n(admin.pnl.profit) },
      'admin page projection',
    ).toEqual({ totalIn: 230000, totalOut: 40000, movement: 190000, outstanding: 350000, profit: 580000 });
    // Karim#2 120 000 + Salim 70 000 + Olim 40 000 + Rustam 120 000 = 350 000
    expect.soft(live, 'Qarzlar Σ OPEN|PARTIAL').toBe(350000);
    expect.soft(rebuilt, 'Σ(original − Σ repayments) over the rows').toBe(350000);
    expect.soft(n(l.debt.outstandingAsOfEod), 'ledger outstanding == Qarzlar').toBe(live);
    // 50 000 + 70 000 + 60 000 = 180 000
    expect.soft(n(l.cashflow.debtRepaidCash) + n(l.cashflow.debtRepaidCard), 'ledger repaid == Σ repayment rows').toBe(sum(rows, (x) => x.amount));
    expect.soft(sum(rows, (x) => x.amount), 'Σ repayment rows').toBe(180000);
  });
});

// ─── D2 — the day after ───────────────────────────────────────────────────

describe('D2 — the day after', () => {
  beforeAll(async () => {
    setClock(at(`${D2}T11:00`));
    await w.relogin();
    d1Close = json(await ledger(D1));
  });

  it("reversing yesterday's 40 000 today is refused, and neither day moves", async () => {
    const r = await w.admin.call('POST', `/api/expenses/${e2.id}/reverse`, { note: 'Kechagi xarid' });
    const d2 = await ledger(D2);
    expect.soft(answer(r), 'answer').toEqual([409, 'EXPENSE_REVERSAL_SAME_DAY_ONLY']);
    expect.soft(json(await ledger(D1)), 'D1 ledger').toEqual(d1Close);
    expect.soft(
      { cashOut: n(d2.cashflow.cashOut), operating: n(d2.pnl.operatingExpense), reversal: n(d2.outflow.expenseReversal), realCashIn: n(d2.cashflow.realCashIn) },
      'D2 ledger',
    ).toEqual({ cashOut: 0, operating: 0, reversal: 0, realCashIn: 0 });
  });

  it("30 000 cash on Rustam today is money in today, not on the sale day", async () => {
    const r = await w.admin.post(`/api/debts/${debts.r.id}/repayments`, { amount: 30000, method: 'CASH' });
    // 120 000 − 30 000 = 90 000
    expect.soft(r, 'debt after').toMatchObject({ remainingAmount: '90000', status: 'PARTIAL' });
    const d2 = await ledger(D2);
    expect.soft(n(d2.cashflow.debtRepaidCash), 'D2 debtRepaidCash').toBe(30000);
    expect.soft(n(d2.cashflow.realCashIn), 'D2 realCashIn').toBe(30000);
    expect.soft(n(d2.sales.netSales), 'D2 netSales').toBe(0);
    expect.soft(n(d2.debt.repaidTodayAmount), 'D2 repaidTodayAmount').toBe(30000);
    // 350 000 − 30 000 = 320 000
    expect.soft(n(d2.debt.outstandingAsOfEod), 'D2 outstandingAsOfEod').toBe(320000);
    expect.soft(json(await ledger(D1)), 'D1 ledger must not move').toEqual(d1Close);
  });

  it("[D14] writing off Salim's 70 000: no longer outstanding, the loss is today's, the sale day keeps its revenue", async () => {
    setClock(at(`${D2}T12:00`));
    const before = await ledger(D2);
    const r = await w.admin.post(`/api/debts/${debts.s.id}/write-off`, { reason: 'Shahardan ketgan' });
    expect.soft(r.status, 'status').toBe('WRITTEN_OFF');
    expect.soft(r.writtenOffAt, 'writtenOffAt').not.toBeNull();
    const list = await w.admin.get('/api/debts');
    const row = list.items.find((d: any) => d.id === debts.s.id);
    expect.soft(row.status, 'Qarzlar row status').toBe('WRITTEN_OFF');
    expect.soft(row.writtenOffAt, 'Qarzlar row writtenOffAt').not.toBeNull();
    // what the write-off took: 70 000 − nothing paid before it = 70 000; the balance stays payable
    expect.soft(
      { list: row.writtenOffAmount, payable: row.remainingAmount, detail: r.writtenOffAmount, by: r.writtenOffByName },
      'writtenOffAmount on the list and the detail, and who did it',
    ).toEqual({ list: '70000', payable: '70000', detail: '70000', by: 'Admin' });
    // 320 000 − 70 000 = 250 000
    expect.soft(liveOutstanding(list), 'Qarzlar Σ OPEN|PARTIAL').toBe(250000);
    const d2 = await ledger(D2);
    expect.soft(n(d2.debt.outstandingAsOfEod), 'D2 outstandingAsOfEod').toBe(250000);
    // D14: a write-off books its loss on the write-off day → today's profit −70 000
    expect.soft(
      n(d2.pnl.profit) - n(before.pnl.profit),
      `D14: profit today ${before.pnl.profit} → ${d2.pnl.profit}; the 70 000 surfaces in the D2 ledger at: ${where(d2, '70000').join(', ') || 'nowhere'}`,
    ).toBe(-70000);
    expect.soft(n((await ledger(D1)).sales.netSales), 'D1 netSales keeps the 120 000 bill').toBe(580000);
  });

  it('writing off twice, or writing off a PAID debt, is refused', async () => {
    const again = await w.admin.call('POST', `/api/debts/${debts.s.id}/write-off`, { reason: 'Yana' });
    const paid = await w.admin.call('POST', `/api/debts/${debts.k1.id}/write-off`, { reason: "To'langan" });
    expect({ again: answer(again), paid: answer(paid) }).toEqual({ again: [409, 'DEBT_ALREADY_WRITTEN_OFF'], paid: [409, 'DEBT_NOT_OPEN'] });
  });

  it('[D14][D24] 20 000 paid on the written-off debt is accepted, keeps it written off, and is money in today', async () => {
    setClock(at(`${D2}T13:00`));
    const r = await w.admin.call('POST', `/api/debts/${debts.s.id}/repayments`, { amount: 20000, method: 'CASH' });
    expect.soft(r.status, 'HTTP').toBe(201);
    // 70 000 − 20 000 = 50 000 still payable; the debt stays written off until paid in full, and
    // what the write-off took stays 70 000
    expect.soft(
      { status: r.body?.status, remaining: r.body?.remainingAmount, writtenOffAmount: r.body?.writtenOffAmount },
      'debt after',
    ).toEqual({ status: 'WRITTEN_OFF', remaining: '50000', writtenOffAmount: '70000' });
    const d2 = await ledger(D2);
    // 30 000 (Rustam) + 20 000 = 50 000
    expect.soft(n(d2.cashflow.realCashIn), 'D2 realCashIn').toBe(50000);
    expect.soft(n(d2.cashflow.debtRepaidCash), 'D2 debtRepaidCash').toBe(50000);
    expect.soft(n(d2.debt.repaidTodayAmount), 'D2 repaidTodayAmount').toBe(50000);
  });

  it('[§11 #3] after that payment, Qarzlar and Hisobot agree: the debt stays written off, 20 000 came back', async () => {
    const list = await w.admin.get('/api/debts');
    const live = liveOutstanding(list);
    const d2 = await ledger(D2);
    const report = await w.owner.get(`/api/reports/daily?date=${D2}`);
    const row = report.debtLedger.find((x: any) => x.debtId === debts.s.id);
    const qarzlarRow = list.items.find((d: any) => d.id === debts.s.id);
    // Qarzlar: Karim#2 120 000 + Olim 40 000 + Rustam 90 000 = 250 000 — Salim is written off, not outstanding
    expect.soft(live, 'Qarzlar Σ OPEN|PARTIAL').toBe(250000);
    expect.soft(
      { status: qarzlarRow?.status, payable: qarzlarRow?.remainingAmount },
      'Qarzlar row for Salim: written off, 50 000 still payable',
    ).toEqual({ status: 'WRITTEN_OFF', payable: '50000' });
    expect.soft(
      n(d2.debt.outstandingAsOfEod),
      `Qarzlar says ${live}; Hisobot Qarz qoldig'i says ${d2.debt.outstandingAsOfEod}`,
    ).toBe(live);
    expect.soft(n(report.debtSnapshot.outstandingTotal), 'owner report outstandingTotal == Qarzlar').toBe(live);
    // The owner's row for Salim: 20 000 came back today and in all; the write-off still carries
    // 70 000 − 20 000 = 50 000 (D24), and nothing of it is outstanding
    expect.soft(
      {
        totalRepaid: row?.totalRepaid,
        repaidToday: row?.repaidToday,
        status: row?.status,
        remainingAmount: row?.remainingAmount,
        writtenOffAmount: row?.writtenOffAmount,
      },
      `owner debtLedger row for Salim: ${JSON.stringify(row)}`,
    ).toEqual({ totalRepaid: '20000', repaidToday: '20000', status: 'WRITTEN_OFF', remainingAmount: '0', writtenOffAmount: '50000' });
  });

  it('D2 as it ends: the ledger, the admin page and the rows agree', async () => {
    const l = await ledger(D2);
    const admin = await w.admin.get(`/api/finance/daily?date=${D2}`);
    const { start, end } = env.svc.time.localDayRangeFor(D2);
    const rows = await env.prisma.debtRepayment.findMany({ where: { paidAt: { gte: start, lt: end } } });
    const live = liveOutstanding(await w.admin.get('/api/debts'));
    const f = figures(l);
    // D14/D24: the write-off day carries the loss as Xarajat; the 20 000 recovered today shrinks it
    // → 70 000 − 20 000 = 50 000. No cash moved for it: cashOut 0.
    expect.soft(
      { sales: f.sales, cashflow: f.cashflow, outflow: f.outflow },
      'D2 ledger — no sales, 50 000 of repayments, no cash out, a 50 000 write-off loss',
    ).toEqual({
      sales: { closedCount: 0, netSales: 0, debtSales: 0, discount: 0, serviceCharge: 0 },
      cashflow: { orderCash: 0, orderCard: 0, debtRepaidCash: 50000, debtRepaidCard: 0, expenseReturns: 0, realCashIn: 50000, cashOut: 0, drawerMovement: 50000 },
      outflow: { expenseGross: 0, expenseSameDayReversal: 0, expenseNet: 0, operatingExpense: 50000, pendingRepayable: 0 },
    });
    expect.soft(f.pnl, 'D2 P&L (D14 loss, D24 recovery)').toEqual({ revenue: 0, cogs: 0, operatingExpense: 50000, profit: -50000 });
    expect.soft({ ...f.debt, outstandingAsOfEod: undefined }, 'D2 debt block').toEqual({ openedTodayCount: 0, openedTodayAmount: 0, repaidTodayAmount: 50000, outstandingAsOfEod: undefined });
    expect.soft(f.debt.outstandingAsOfEod, 'ledger outstanding == Qarzlar').toBe(live);
    expect.soft(admin.ledger, 'GET /api/finance/daily .ledger == dailyLedger').toEqual(json(l));
    // 30 000 + 20 000 = 50 000
    expect.soft(sum(rows, (x) => x.amount), 'Σ repayment rows D2').toBe(50000);
    expect.soft(n(l.cashflow.debtRepaidCash) + n(l.cashflow.debtRepaidCard), 'ledger repaid == Σ rows').toBe(sum(rows, (x) => x.amount));
  });
});

// ─── D3 — avans ───────────────────────────────────────────────────────────

describe('D3 — avans', () => {
  beforeAll(async () => {
    setClock(at(`${D3}T10:00`));
    await w.relogin();
  });

  it('a 100 000 avans leaves the till as a receivable, not as Chiqim', async () => {
    avans = await w.admin.post('/api/expenses', { amount: 100000, reason: 'Oshpazga avans', repayable: true, occurredAt: at(`${D3}T10:00`).toISOString() });
    expect.soft(avans, 'avans').toMatchObject({ repayable: true, repayStatus: 'PENDING', remainingAmount: '100000', returnedTotal: '0', categoryName: 'Operatsion' });
    const l = await ledger(D3);
    // gross 100 000; cashOut 100 000; operating 0; pendingRepayable 100 000; profit 0; drawer −100 000
    expect.soft(figures(l).outflow, 'outflow').toEqual({ expenseGross: 100000, expenseSameDayReversal: 0, expenseNet: 100000, operatingExpense: 0, pendingRepayable: 100000 });
    expect.soft(n(l.cashflow.cashOut), 'cashOut').toBe(100000);
    expect.soft(n(l.pnl.profit), 'profit').toBe(0);
    expect.soft(n(l.cashflow.drawerMovement), 'drawerMovement').toBe(-100000);
  });

  it('40 000 returned: money in 40 000 today, 60 000 still pending, Chiqim still 0', async () => {
    setClock(at(`${D3}T15:00`));
    const r = await w.admin.post(`/api/expenses/${avans.id}/returns`, { amount: 40000 });
    // 100 000 − 40 000 = 60 000
    expect.soft(r, 'avans after').toMatchObject({ repayStatus: 'PARTIAL', remainingAmount: '60000', returnedTotal: '40000' });
    expect.soft(r.returns.map((x: any) => x.amount), 'return rows').toEqual(['40000']);
    const l = await ledger(D3);
    const admin = await w.admin.get(`/api/finance/daily?date=${D3}`);
    expect.soft(n(l.cashflow.expenseReturns), 'expenseReturns').toBe(40000);
    expect.soft(n(l.cashflow.realCashIn), 'realCashIn (the return is money in)').toBe(40000);
    expect.soft(n(l.outflow.pendingRepayable), 'pendingRepayable').toBe(60000);
    expect.soft(n(l.pnl.operatingExpense), 'operatingExpense').toBe(0);
    expect.soft(n(l.cashflow.cashOut), 'cashOut stays 100 000').toBe(100000);
    // 40 000 − 100 000 = −60 000
    expect.soft(n(l.cashflow.drawerMovement), 'drawerMovement').toBe(-60000);
    expect.soft({ returns: n(admin.cashflow.expenseReturns), totalIn: n(admin.cashflow.totalIn), movement: n(admin.drawer.movement) }, 'admin page')
      .toEqual({ returns: 40000, totalIn: 40000, movement: -60000 });
  });

  it("[PRD 14 G3] a return above the balance, of 0, fractional or text is refused; 60 000 still pending", async () => {
    const ret = (amount: unknown) => w.admin.call('POST', `/api/expenses/${avans.id}/returns`, { amount });
    const answers = { over: await ret(60001), zero: await ret(0), fractional: await ret(1000.5), text: await ret('40 000') };
    const l = await ledger(D3);
    const row = await env.prisma.expense.findUniqueOrThrow({ where: { id: avans.id }, include: { returns: true } });
    expect({
      answers: Object.fromEntries(Object.entries(answers).map(([k, r]) => [k, answer(r)])),
      returned: sum(row.returns, (x) => x.amount),
      pending: n(l.outflow.pendingRepayable),
      expenseReturns: n(l.cashflow.expenseReturns),
    }).toEqual({
      answers: { over: [400, 'VALIDATION'], zero: [400, 'VALIDATION'], fractional: [400, 'VALIDATION'], text: [400, 'VALIDATION'] },
      returned: 40000,
      pending: 60000,
      expenseReturns: 40000,
    });
  });

  it('the open-avans search finds it with 60 000 left', async () => {
    const found = await w.admin.get('/api/expenses/search?openRepayable=true');
    expect(found.items.map((x: any) => [x.id, x.repayStatus, x.remainingAmount])).toEqual([[avans.id, 'PARTIAL', '60000']]);
  });
});

// ─── D4 — the avans later, and probes ─────────────────────────────────────

describe('D4 — the avans later', () => {
  beforeAll(async () => {
    setClock(at(`${D4}T10:00`));
    await w.relogin();
    d3Close = json(await ledger(D3));
  });

  it('10 000 returned today is money in today, not on the day the avans was given', async () => {
    const r = await w.admin.post(`/api/expenses/${avans.id}/returns`, { amount: 10000 });
    // 60 000 − 10 000 = 50 000
    expect.soft(r, 'avans after').toMatchObject({ repayStatus: 'PARTIAL', remainingAmount: '50000', returnedTotal: '50000' });
    const d4 = await ledger(D4);
    expect.soft(n(d4.cashflow.expenseReturns), 'D4 expenseReturns').toBe(10000);
    expect.soft(n(d4.cashflow.realCashIn), 'D4 realCashIn').toBe(10000);
    expect.soft(n(d4.cashflow.cashOut), 'D4 cashOut').toBe(0);
    expect.soft(json(await ledger(D3)), 'D3 ledger must not move').toEqual(d3Close);
  });

  it('[D14] writing off the remaining 50 000 books the loss today, not on the day the avans was given', async () => {
    const d4Before = await ledger(D4);
    const r = await w.admin.post(`/api/expenses/${avans.id}/write-off`, { reason: 'Ishdan ketdi' });
    expect.soft(r, 'avans after').toMatchObject({ repayStatus: 'WRITTEN_OFF', remainingAmount: '50000', returnedTotal: '50000', writtenOffReason: 'Ishdan ketdi' });
    const d3 = await ledger(D3);
    const d4 = await ledger(D4);
    // D14: the loss (100 000 − 50 000 returned = 50 000) is Chiqim on D4; D3 stays as it closed
    expect.soft(n(d4.pnl.operatingExpense) - n(d4Before.pnl.operatingExpense), 'D4 Chiqim change').toBe(50000);
    expect.soft(n(d4.pnl.profit) - n(d4Before.pnl.profit), 'D4 profit change').toBe(-50000);
    expect.soft(n(d4.cashflow.cashOut) - n(d4Before.cashflow.cashOut), 'D4 cashOut change (no cash moved)').toBe(0);
    expect.soft(
      { operating: n(d3.pnl.operatingExpense), profit: n(d3.pnl.profit), pending: n(d3.outflow.pendingRepayable) },
      'D3 ledger must not move',
    ).toEqual({ operating: n(d3Close.pnl.operatingExpense), profit: n(d3Close.pnl.profit), pending: n(d3Close.outflow.pendingRepayable) });
  });

  it('after the write-off: another return, a second write-off, and writing off a plain expense are refused', async () => {
    const ret = await w.admin.call('POST', `/api/expenses/${avans.id}/returns`, { amount: 10000 });
    const again = await w.admin.call('POST', `/api/expenses/${avans.id}/write-off`, { reason: 'Yana' });
    const plain = await w.admin.call('POST', `/api/expenses/${e2.id}/write-off`, { reason: 'Oddiy chiqim' });
    // A second write-off is a conflict with the first, not a malformed request (P6 Task 5: EXPENSE_ALREADY_WRITTEN_OFF).
    expect({ ret: answer(ret), again: answer(again), plain: answer(plain) })
      .toEqual({ ret: [400, 'VALIDATION'], again: [409, 'EXPENSE_ALREADY_WRITTEN_OFF'], plain: [400, 'VALIDATION'] });
  });

  it('[issue 30] an avans given and undone the same day leaves Chiqim, pending and cash out where they were', async () => {
    const before = await ledger(D4);
    const a = await w.admin.post('/api/expenses', { amount: 50000, reason: 'Avans (xato)', repayable: true, occurredAt: at(`${D4}T11:00`).toISOString() });
    await w.admin.post(`/api/expenses/${a.id}/reverse`, { note: 'Xato yozildi' });
    const after = await ledger(D4);
    expect({
      operating: n(after.pnl.operatingExpense) - n(before.pnl.operatingExpense),
      pending: n(after.outflow.pendingRepayable) - n(before.outflow.pendingRepayable),
      cashOut: n(after.cashflow.cashOut) - n(before.cashflow.cashOut),
    }).toEqual({ operating: 0, pending: 0, cashOut: 0 });
  });
});

describe('D4 — probes', () => {
  it('an expense against an unknown category is refused, not silently refiled', async () => {
    const before = await env.prisma.expense.count();
    const r = await w.admin.call('POST', '/api/expenses', {
      categoryId: 'no-such-category', amount: 10000, reason: "Noma'lum toifa", occurredAt: at(`${D4}T12:00`).toISOString(),
    });
    expect(
      { refused: r.status >= 400, written: (await env.prisma.expense.count()) - before },
      `answered ${r.status}${r.body?.categoryName ? `, filed under "${r.body.categoryName}"` : ` ${JSON.stringify(r.body?.error ?? '')}`}`,
    ).toEqual({ refused: true, written: 0 });
  });

  it('a `method` on an expense is ignored — there is no Karta Chiqim; it is cash out of the till', async () => {
    const before = await ledger(D4);
    const r = await w.admin.call('POST', '/api/expenses', { amount: 15000, reason: 'Karta sinovi', method: 'CARD', occurredAt: at(`${D4}T12:10`).toISOString() });
    const after = await ledger(D4);
    expect({
      status: r.status,
      methodEchoed: 'method' in (r.body ?? {}),
      cashOut: n(after.cashflow.cashOut) - n(before.cashflow.cashOut),
      operating: n(after.pnl.operatingExpense) - n(before.pnl.operatingExpense),
    }).toEqual({ status: 201, methodEchoed: false, cashOut: 15000, operating: 15000 });
  });

  it('[D13] a forgotten 25 000 Chiqim booked into D1 corrects D1, not today', async () => {
    const d1Before = await ledger(D1);
    const d4Before = await ledger(D4);
    const r = await w.admin.call('POST', '/api/expenses', { amount: 25000, reason: 'Qassobga (kecha uchun)', occurredAt: at(`${D1}T12:00`).toISOString() });
    const d1After = await ledger(D1);
    const d4After = await ledger(D4);
    expect({
      status: r.status,
      d1CashOut: n(d1After.cashflow.cashOut) - n(d1Before.cashflow.cashOut),
      d1Operating: n(d1After.pnl.operatingExpense) - n(d1Before.pnl.operatingExpense),
      d1Profit: n(d1After.pnl.profit) - n(d1Before.pnl.profit),
      d4CashOut: n(d4After.cashflow.cashOut) - n(d4Before.cashflow.cashOut),
    }).toEqual({ status: 201, d1CashOut: 25000, d1Operating: 25000, d1Profit: -25000, d4CashOut: 0 });
  });
});

// ─── Close ────────────────────────────────────────────────────────────────

describe('Close', () => {
  it('every day: the admin page is the ledger, repayments and returns are their rows, Qarzlar is its rows', async () => {
    for (const day of [D1, D2, D3, D4]) {
      const l = await ledger(day);
      const admin = await w.admin.get(`/api/finance/daily?date=${day}`);
      const { start, end } = env.svc.time.localDayRangeFor(day);
      const repayments = await env.prisma.debtRepayment.findMany({ where: { paidAt: { gte: start, lt: end } } });
      const returns = await env.prisma.expenseReturn.findMany({ where: { receivedAt: { gte: start, lt: end } } });
      expect.soft(admin.ledger, `${day}: GET /api/finance/daily .ledger == dailyLedger`).toEqual(json(l));
      expect.soft(n(l.cashflow.debtRepaidCash) + n(l.cashflow.debtRepaidCard), `${day}: repaid == Σ rows`).toBe(sum(repayments, (x) => x.amount));
      expect.soft(n(l.cashflow.expenseReturns), `${day}: expenseReturns == Σ rows`).toBe(sum(returns, (x) => x.amount));
      expect.soft(
        n(l.cashflow.realCashIn),
        `${day}: realCashIn = orderCash + orderCard + debtRepaidCash + debtRepaidCard + expenseReturns`,
      ).toBe(n(l.cashflow.orderCash) + n(l.cashflow.orderCard) + n(l.cashflow.debtRepaidCash) + n(l.cashflow.debtRepaidCard) + n(l.cashflow.expenseReturns));
      expect.soft(n(l.cashflow.drawerMovement), `${day}: drawerMovement = realCashIn − cashOut`).toBe(n(l.cashflow.realCashIn) - n(l.cashflow.cashOut));
    }
    const list = await w.admin.get('/api/debts');
    const live = liveOutstanding(list);
    const rows = await env.prisma.debt.findMany({ where: { status: { in: ['OPEN', 'PARTIAL'] } }, include: { repayments: true } });
    const rebuilt = rows.reduce((s, d) => s + n(d.originalAmount) - sum(d.repayments, (x) => x.amount), 0);
    expect.soft(live, 'Qarzlar Σ OPEN|PARTIAL == Σ(original − Σ repayments) over those rows').toBe(rebuilt);
    // Karim#2 120 000 + Olim 40 000 + Rustam 90 000 = 250 000 — Salim stays written off (D24):
    // 50 000 still payable, but a written-off debt is a loss, not a receivable.
    expect.soft(live, 'Qarzlar Σ OPEN|PARTIAL').toBe(250000);
    expect.soft(list.items.length, 'debt rows').toBe(5);
    // Σ expense returns over all days: 40 000 + 10 000 = 50 000 — the avans gave back 50 000 and lost 50 000
    const allReturns = await env.prisma.expenseReturn.findMany();
    expect.soft(sum(allReturns, (x) => x.amount), 'Σ avans returns').toBe(50000);
  });

  it("money shape: every amount in the ledger, Qarzlar, a debt, Chiqimlar and the admin page is whole so'm", async () => {
    const seen = {
      ledger: await ledger(D1),
      debts: await w.admin.get('/api/debts'),
      debt: await w.admin.get(`/api/debts/${debts.s.id}`),
      expenses: await w.admin.get(`/api/expenses?date=${D1}`),
      search: await w.admin.get('/api/expenses/search?repayable=true'),
      admin: await w.admin.get(`/api/finance/daily?date=${D1}`),
    };
    expect(fractional(json(seen))).toEqual([]);
  });
});
