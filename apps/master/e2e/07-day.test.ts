/* eslint-disable @typescript-eslint/no-explicit-any */
// One ordinary trading day, then every surface that reports it (area 5, 6, 7).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, boot, buildWorld, capturePrints, n, sale, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D = '2026-09-29';
let ledger: any;

// Hand-computed truth for the day below.
const TRUTH = {
  gross: 171000, // A 100 000 + B 46 000 + C 25 000 (food only)
  discount: 6000,
  netSales: 165000,
  service: 25000,
  cash: 110000,
  card: 50000,
  nasiya: 30000,
  cogs: 73000, // Osh 2×25 000 + Choy 3×1 000 + Somsa 5×4 000 (Non, Achichuk have no tan narx)
  cashOut: 170000, // Keldi 80 000 + gas 40 000 + avans 50 000
  operating: 40000, // gas; Keldi is Tan narxi later, avans is owed back
  profit: 52000, // 165 000 − 73 000 − 40 000
  avansReturned: 20000,
  moneyIn: 180000, // cash 110 000 + card 50 000 + avans back 20 000
  drawer: 10000, // moneyIn − cashOut
  physicalCash: -40000, // cash 110 000 + avans back 20 000 − 170 000 paid from the till (card went to the bank)
  foodPortions: 13, // 2 + 2 + 5 + 2 + 1 + 1
};

const money = (s: string) => Number(String(s).replace(/[^\d-]/g, ''));
const pick = (msg: string, label: string) => {
  const m = msg.match(new RegExp(`${label}: <b>([^<]+)</b>`));
  return m ? money(m[1]!) : NaN;
};

beforeAll(async () => {
  setClock(at(`${D}T09:00`));
  env = await boot('day');
  w = await buildWorld(env.base);
  setClock(at(`${D}T10:00`));
  await sale(w, w.w1, [[w.items.osh, 2], [w.items.choy, 2], [w.items.xizmat, 2]], { payments: [{ method: 'CASH', amount: 110000 }] });
  setClock(at(`${D}T11:00`));
  await sale(w, w.w2, [[w.items.somsa, 5], [w.items.non, 2], [w.items.xizmat, 2]], { discountAmount: 6000, payments: [{ method: 'CARD', amount: 50000 }] });
  setClock(at(`${D}T12:00`));
  await sale(w, w.w1, [[w.items.salat, 1], [w.items.choy, 1], [w.items.xizmat, 1]], { payments: [{ method: 'DEBT', amount: 30000 }], debt: { debtorName: 'Dilshod' } });
  setClock(at(`${D}T13:00`));
  await w.admin.post(`/api/stock/${w.items.somsa}/restock`, { qty: 20, paidUzs: 80000 });
  setClock(at(`${D}T14:00`));
  await w.admin.post('/api/expenses', { amount: 40000, reason: 'Gaz', occurredAt: at(`${D}T14:00`).toISOString() });
  setClock(at(`${D}T15:00`));
  const avans = await w.admin.post('/api/expenses', { amount: 50000, reason: 'Oshpazga avans', repayable: true, occurredAt: at(`${D}T15:00`).toISOString() });
  setClock(at(`${D}T16:00`));
  await w.admin.post(`/api/expenses/${avans.id}/returns`, { amount: 20000 });
  setClock(at(`${D}T16:30`));
  ledger = await env.svc.reports.dailyLedger(D);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('The day ledger (C29–C39)', () => {
  it('control: every canonical figure matches the hand-computed day', () => {
    const got = {
      gross: n(ledger.sales.gross), discount: n(ledger.sales.discount), netSales: n(ledger.sales.netSales),
      service: n(ledger.sales.serviceCharge), cash: n(ledger.cashflow.orderCash), card: n(ledger.cashflow.orderCard),
      nasiya: n(ledger.sales.debtSales), cogs: n(ledger.pnl.cogs), cashOut: n(ledger.cashflow.cashOut),
      operating: n(ledger.pnl.operatingExpense), profit: n(ledger.pnl.profit), avansReturned: n(ledger.cashflow.expenseReturns),
      moneyIn: n(ledger.cashflow.realCashIn), drawer: n(ledger.cashflow.drawerMovement),
    };
    const { physicalCash: _p, foodPortions: _f, ...expected } = TRUTH;
    expect(got).toEqual(expected);
  });

  it('control: owner daily, admin daily, the month and the period report agree on the day', async () => {
    const daily = await w.owner.get(`/api/reports/daily?date=${D}`);
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    const month = await w.owner.get(`/api/reports/monthly?month=${D.slice(0, 7)}`);
    const row = month.daily.find((r: any) => r.date === D);
    const period = await w.owner.get(`/api/reports/summary?from=${D}&to=${D}`);
    expect({
      ownerProfit: n(daily.results.salesBasedProfit), adminProfit: n(admin.pnl.profit), monthProfit: n(row.pnl.profit), periodProfit: n(period.pnl.profit),
      ownerDrawer: n(daily.results.cashflowBasedNet), adminDrawer: n(admin.drawer.movement), monthDrawer: n(row.results.cashflowBasedNet), periodDrawer: n(period.cash.farq),
    }).toEqual({
      ownerProfit: TRUTH.profit, adminProfit: TRUTH.profit, monthProfit: TRUTH.profit, periodProfit: TRUTH.profit,
      ownerDrawer: TRUTH.drawer, adminDrawer: TRUTH.drawer, monthDrawer: TRUTH.drawer, periodDrawer: TRUTH.drawer,
    });
  });
});

describe('Reports on the till (area 6)', () => {
  it('[issue 2] Kunlik moliya\'s "Bugungi naqd pul harakati" is the change in cash in the till (card goes to the bank)', async () => {
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    expect(
      n(admin.drawer.movement),
      `shown ${admin.drawer.movement}; the till's cash moved ${TRUTH.physicalCash} (Karta ${admin.cashflow.cardIn} is inside the shown figure)`,
    ).toBe(TRUTH.physicalCash);
  });

  it('[issue 10] Kunlik moliya\'s dish table totals food sales and food portions only', async () => {
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    expect({ sotuv: n(admin.mealSalesTotal.revenue), portions: admin.mealSalesTotal.qty })
      .toEqual({ sotuv: TRUTH.gross, portions: TRUTH.foodPortions });
  });

  it('[issue 11] every figure labelled "Chiqim" on the admin screens is the same number', async () => {
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    const expenses = await w.admin.get(`/api/expenses?date=${D}`);
    const figures = {
      "Bugun → Chiqim": n(admin.pnl.operatingExpense),
      'Chiqimlar → Jami chiqim': expenses.items.reduce((s: number, e: any) => s + n(e.signedAmount), 0),
      "Kunlik moliya → Ketgan": n(admin.outflow.totalOut),
    };
    expect(new Set(Object.values(figures)).size, JSON.stringify(figures)).toBe(1);
  });

  it('[issue 14] in the bill register, Naqd + Karta + Qarz adds up to the "Sof" column for every bill', async () => {
    const daily = await w.owner.get(`/api/reports/daily?date=${D}`);
    const off = daily.ordersTable
      .filter((r: any) => r.status === 'CLOSED')
      .filter((r: any) => n(r.cash) + n(r.card) + n(r.debt) !== n(r.net))
      .map((r: any) => `#${r.orderNumber}: Sof ${r.net}, paid ${n(r.cash) + n(r.card) + n(r.debt)} (Xizmat ${r.service}, no column on screen or PDF)`);
    expect(off).toEqual([]);
  });
});

describe("Owner's Telegram (area 7)", () => {
  it('[issue 13] /bugun "Kassaga kelgan pul" lines add up to "Jami kelgan"', async () => {
    const report = await env.svc.reports.daily(env.svc.time.parseLocalDay(D));
    const msg: string = env.svc.telegram.formatReportMessage(env.svc.time.parseLocalDay(D), report);
    const block = msg.split('Kassaga kelgan pul')[1]!.split('Jami kelgan')[0]!;
    const listed = [...block.matchAll(/<b>([^<]+)<\/b> so'm/g)].map((m) => money(m[1]!));
    const total = pick(msg, '📥 Jami kelgan');
    expect(listed.reduce((s, v) => s + v, 0), `lines listed: ${listed.join(' + ')} (includes Qarzga sotildi, misses the avans return); Jami kelgan ${total}`).toBe(total);
  });

  it('[issue 9] /hafta "Sotuv" is the same Sof sotuv as /bugun', async () => {
    const report = await env.svc.reports.daily(env.svc.time.parseLocalDay(D));
    const msg: string = env.svc.telegram.formatWeekSummary([{ date: env.svc.time.parseLocalDay(D), report }]);
    expect(pick(msg, 'Sotuv'), `/hafta Sotuv vs Sof sotuv ${TRUTH.netSales} (Xizmat haqi ${TRUTH.service})`).toBe(TRUTH.netSales);
  });

  it('[issue 12] /oylik shows the terms of "Sof foyda" so the owner can check it', async () => {
    const month = await env.svc.reports.monthly(env.svc.time.parseLocalDay(D));
    const msg: string = env.svc.telegram.formatMonthlyMessage(month);
    expect(msg).toMatch(/Tan narxi/);
  });
});
