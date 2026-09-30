/* eslint-disable @typescript-eslint/no-explicit-any */
// Chiqimlar, avans and Keldi payments across two days (F15–F20, C16–C25).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, boot, buildWorld, capturePrints, itemState, n, sale, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D1 = '2026-09-28';
const D2 = '2026-09-29';

const ledger = (day: string) => env.svc.reports.dailyLedger(day);

beforeAll(async () => {
  setClock(at(`${D1}T09:00`));
  env = await boot('expenses');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('Day 1', () => {
  it('[issue 3] raw materials bought through Chiqimlar for a dish that has a tan narx reach profit once, not twice', async () => {
    // 20 cups of choy (tan narx 1 000) sold for 100 000; the tea itself bought for 20 000.
    setClock(at(`${D1}T10:00`));
    await sale(w, w.w1, [[w.items.choy, 20]], { payments: [{ method: 'CASH', amount: 100000 }] });
    // Keldi is the purchase path that stays out of profit — but it refuses uncounted dishes:
    const keldi = await w.admin.call('POST', `/api/stock/${w.items.choy}/restock`, { qty: 20, paidUzs: 20000 });
    expect(keldi.status, 'Keldi for an uncounted dish').toBeGreaterThanOrEqual(400);
    // …so the tea is entered where the app allows it: a Chiqimlar entry, always filed as "Operatsion".
    await w.admin.post('/api/expenses', { amount: 20000, reason: 'Choy bargi', occurredAt: at(`${D1}T10:30`).toISOString() });
    const l = await ledger(D1);
    const spent = 20000;
    expect(
      n(l.pnl.profit),
      `Sof sotuv ${l.pnl.revenue} − Tan narxi ${l.pnl.cogs} − Chiqim ${l.pnl.operatingExpense} = ${l.pnl.profit}; the ${spent} spent on tea is inside both Tan narxi and Chiqim`,
    ).toBe(100000 - spent);
  });

  it('control: a paid Keldi stays out of profit and is inside cash out', async () => {
    setClock(at(`${D1}T11:00`));
    const before = await ledger(D1);
    await w.admin.post(`/api/stock/${w.items.somsa}/restock`, { qty: 20, paidUzs: 80000 });
    const after = await ledger(D1);
    expect({
      operating: n(after.pnl.operatingExpense) - n(before.pnl.operatingExpense),
      cashOut: n(after.cashflow.cashOut) - n(before.cashflow.cashOut),
    }).toEqual({ operating: 0, cashOut: 80000 });
  });

  it('[issue 8] Telegram /xarajatlar "Foyda hisobida" equals the expense counted in profit (as /bugun shows it)', async () => {
    const l = await ledger(D1);
    const summary = await env.svc.expenses.listByDate(env.svc.time.parseLocalDay(D1));
    const msg: string = env.svc.telegram.formatExpensesMessage(env.svc.time.parseLocalDay(D1), summary);
    const shown = Number((msg.match(/Foyda hisobida: <b>([^<]+)<\/b>/)?.[1] ?? '').replace(/\D/g, ''));
    expect(shown, `/xarajatlar shows ${shown}; /bugun and the P&L use ${l.pnl.operatingExpense}`).toBe(n(l.pnl.operatingExpense));
  });

  it('[issue 19] undoing a Keldi payment also takes back the stock and the tan narx it set', async () => {
    setClock(at(`${D1}T12:00`));
    const before = await itemState(env, w.items.somsa);
    const entry = await w.admin.post(`/api/stock/${w.items.somsa}/restock`, { qty: 10, paidUzs: 60000, setCostFromPaid: true });
    await w.admin.post(`/api/expenses/${entry.expenseId}/reverse`, { note: "Noto'g'ri kiritildi" });
    const after = await itemState(env, w.items.somsa);
    expect(after, `before ${JSON.stringify(before)}, after undo ${JSON.stringify(after)}`).toEqual(before);
  });

  it('[issue 30] undoing an open avans (API only) leaves the profit-side Chiqim at 0, not negative', async () => {
    setClock(at(`${D1}T13:00`));
    const before = await ledger(D1);
    const avans = await w.admin.post('/api/expenses', { amount: 50000, reason: 'Avans (xato)', repayable: true, occurredAt: at(`${D1}T13:00`).toISOString() });
    await w.admin.post(`/api/expenses/${avans.id}/reverse`, { note: "Xato yozildi" });
    const after = await ledger(D1);
    expect({
      chiqimChange: n(after.pnl.operatingExpense) - n(before.pnl.operatingExpense),
      pendingChange: n(after.outflow.pendingRepayable) - n(before.outflow.pendingRepayable),
    }, `Chiqim ${before.pnl.operatingExpense} → ${after.pnl.operatingExpense}; Kutilayotgan qaytim ${before.outflow.pendingRepayable} → ${after.outflow.pendingRepayable}`).toEqual({ chiqimChange: 0, pendingChange: 0 });
  });

  it('setup: an avans of 100 000 given on day 1', async () => {
    setClock(at(`${D1}T14:00`));
    await w.admin.post('/api/expenses', { amount: 100000, reason: 'Oshpazga avans', repayable: true, occurredAt: at(`${D1}T14:00`).toISOString() });
  });
});

describe('Day 2', () => {
  let d1Before: any;

  it('[issue 5] an expense cannot be booked into a day that has already closed', async () => {
    setClock(at(`${D2}T11:00`));
    await w.relogin();
    d1Before = await ledger(D1);
    // What Chiqimlar does while its date picker shows yesterday: noon of that day.
    const r = await w.admin.call('POST', '/api/expenses', { amount: 300000, reason: "Qassobga (kecha uchun)", occurredAt: at(`${D1}T12:00`).toISOString() });
    const d1After = await ledger(D1);
    const undo = r.status < 300 ? await w.admin.call('POST', `/api/expenses/${r.body.id}/reverse`, { note: 'Qaytarish' }) : null;
    expect(
      r.status,
      `booked into ${D1}: Kassa o'zgarishi ${d1Before.cashflow.drawerMovement} → ${d1After.cashflow.drawerMovement}, Sof foyda ${d1Before.pnl.profit} → ${d1After.pnl.profit}; undo answered ${undo?.status} ${JSON.stringify(undo?.body?.error?.code ?? '')}`,
    ).toBeGreaterThanOrEqual(400);
  });

  it("[issue 18] writing off yesterday's avans books the loss today, not on the day it was given", async () => {
    const avans = (await w.admin.get(`/api/expenses?date=${D1}`)).items.find((e: any) => e.reason === 'Oshpazga avans');
    const d1Before = await ledger(D1);
    const d2Before = await ledger(D2);
    await w.admin.post(`/api/expenses/${avans.id}/write-off`, { reason: 'Ishdan ketdi' });
    const d1After = await ledger(D1);
    const d2After = await ledger(D2);
    expect({
      d1ProfitChange: n(d1After.pnl.profit) - n(d1Before.pnl.profit),
      d2ProfitChange: n(d2After.pnl.profit) - n(d2Before.pnl.profit),
    }).toEqual({ d1ProfitChange: 0, d2ProfitChange: -100000 });
  });

  it('[latent] an avans return must be whole so\'m', async () => {
    const avans = await w.admin.post('/api/expenses', { amount: 100000, reason: 'Ofitsiantga avans', repayable: true, occurredAt: at(`${D2}T12:00`).toISOString() });
    const r = await w.admin.call('POST', `/api/expenses/${avans.id}/returns`, { amount: 99999.5 });
    const state = r.status < 300 ? `${r.body.repayStatus}, remaining ${r.body.remainingAmount}` : '';
    expect(r.status, `a 99 999.5 return was answered ${r.status} ${state}`).toBeGreaterThanOrEqual(400);
  });
});
