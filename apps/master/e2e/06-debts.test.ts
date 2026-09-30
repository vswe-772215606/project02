/* eslint-disable @typescript-eslint/no-explicit-any */
// Nasiya across two days (F12–F14, C12–C15).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, boot, buildWorld, capturePrints, n, sale, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D1 = '2026-09-28';
const D2 = '2026-09-29';
const ledger = (day: string) => env.svc.reports.dailyLedger(day);
const debtByName = async (name: string) => env.prisma.debt.findFirstOrThrow({ where: { debtorName: name } });

beforeAll(async () => {
  setClock(at(`${D1}T09:00`));
  env = await boot('debts');
  w = await buildWorld(env.base);
  setClock(at(`${D1}T10:00`));
  await sale(w, w.w1, [[w.items.osh, 2]], { payments: [{ method: 'DEBT', amount: 90000 }], debt: { debtorName: 'Karim aka' } });
  await sale(w, w.w1, [[w.items.osh, 1], [w.items.choy, 3]], { payments: [{ method: 'DEBT', amount: 60000 }], debt: { debtorName: 'Salim aka' } });
  for (let i = 1; i <= 5; i += 1) {
    await sale(w, w.w2, [[w.items.somsa, 5]], { payments: [{ method: 'DEBT', amount: 40000 }], debt: { debtorName: `Navbat ${i}` } });
  }
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('Nasiya', () => {
  it('control: a nasiya sale is revenue on the sale day and not money in', async () => {
    const l = await ledger(D1);
    expect({ debtSales: n(l.sales.debtSales), moneyIn: n(l.cashflow.realCashIn), netSales: n(l.sales.netSales) })
      .toEqual({ debtSales: 350000, moneyIn: 0, netSales: 350000 });
  });

  it('control: a repayment is money in on the day it arrives, and leaves the sale day alone', async () => {
    setClock(at(`${D2}T11:00`));
    await w.relogin();
    const d1Before = await ledger(D1);
    const karim = await debtByName('Karim aka');
    await w.admin.post(`/api/debts/${karim.id}/repayments`, { amount: 40000, method: 'CASH' });
    const d1After = await ledger(D1);
    const d2 = await ledger(D2);
    expect({ d2MoneyIn: n(d2.cashflow.realCashIn), d1Unchanged: d1After.cashflow.realCashIn === d1Before.cashflow.realCashIn })
      .toEqual({ d2MoneyIn: 40000, d1Unchanged: true });
  });

  it('[issue 29] two repayments taken at the same moment both reduce the balance', async () => {
    const lines: string[] = [];
    let lost = 0;
    for (let i = 1; i <= 5; i += 1) {
      const debt = await debtByName(`Navbat ${i}`);
      const pay = () => w.admin.call('POST', `/api/debts/${debt.id}/repayments`, { amount: 10000, method: 'CASH' });
      const [a, b] = await Promise.all([pay(), pay()]);
      const after = await env.prisma.debt.findUniqueOrThrow({ where: { id: debt.id }, include: { repayments: true } });
      const rows = after.repayments.reduce((s, r) => s + n(r.amount), 0);
      lines.push(`debt ${i}: HTTP ${a.status}/${b.status}, repayment rows ${rows}, balance left ${after.remainingAmount} (should be ${40000 - rows})`);
      if (n(after.remainingAmount) !== 40000 - rows) lost += 1;
    }
    expect(lost, lines.join('\n')).toBe(0);
  });

  it('[issue 31] writing off a debt reduces profit on the write-off day', async () => {
    const before = await ledger(D2);
    const salim = await debtByName('Salim aka');
    await w.admin.post(`/api/debts/${salim.id}/write-off`, { reason: 'Shahardan ketgan' });
    const after = await ledger(D2);
    const d1 = await ledger(D1);
    expect(
      n(after.pnl.profit) - n(before.pnl.profit),
      `a 60 000 nasiya was written off; profit on ${D2}: ${before.pnl.profit} → ${after.pnl.profit}; the 60 000 is still inside ${D1}'s Sof sotuv (${d1.sales.netSales})`,
    ).toBe(-60000);
  });

  it('[issue 31] the nasiya ledger does not show a written-off debt as repaid', async () => {
    const report = await w.owner.get(`/api/reports/daily?date=${D2}`);
    const row = report.debtLedger.find((r: any) => r.debtorName === 'Salim aka');
    expect({ status: row.status, totalRepaid: n(row.totalRepaid) }, `row: ${JSON.stringify(row)}`).toEqual({ status: 'WRITTEN_OFF', totalRepaid: 0 });
  });

  it('control: the written-off debt leaves Qarz qoldig\'i (rebuilt from debts and repayment rows)', async () => {
    const l = await ledger(D2);
    const open = await env.prisma.debt.findMany({ where: { writtenOffAt: null }, include: { repayments: true } });
    const expected = open.reduce((s, d) => s + n(d.originalAmount) - d.repayments.reduce((r, x) => r + n(x.amount), 0), 0);
    expect(n(l.debt.outstandingAsOfEod)).toBe(expected);
  });

  it('[issue 29] each debtor\'s balance on Qarzlar adds up to the reports\' Qarz qoldig\'i', async () => {
    const l = await ledger(D2);
    const list = await w.admin.get('/api/debts');
    const live = list.items
      .filter((d: any) => d.status === 'OPEN' || d.status === 'PARTIAL')
      .reduce((s: number, d: any) => s + n(d.remainingAmount), 0);
    expect(live, `Qarzlar balances add up to ${live}; Hisobot / Telegram Qarz qoldig'i ${l.debt.outstandingAsOfEod}`).toBe(n(l.debt.outstandingAsOfEod));
  });
});
