/* eslint-disable @typescript-eslint/no-explicit-any */
// Nasiya across two days (F12–F14, C12–C15).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

  it("[PRD 14 G3] a repayment must be whole so'm and above zero", async () => {
    const karim = await debtByName('Karim aka');
    const snapshot = async () => {
      const debt = await env.prisma.debt.findUniqueOrThrow({ where: { id: karim.id }, include: { repayments: true } });
      return { balance: n(debt.remainingAmount), repayments: debt.repayments.length };
    };
    const before = await snapshot();
    const pay = (amount: unknown) => w.admin.call('POST', `/api/debts/${karim.id}/repayments`, { amount, method: 'CASH' });
    const answers = {
      fractional: await pay(1000.5),
      zero: await pay(0),
      negative: await pay(-1000),
      text: await pay('1 000'),
    };
    expect(
      {
        statuses: Object.fromEntries(Object.entries(answers).map(([what, r]) => [what, r.status])),
        after: await snapshot(),
      },
      JSON.stringify(Object.values(answers).map((r) => r.body?.error?.code)),
    ).toEqual({ statuses: { fractional: 400, zero: 400, negative: 400, text: 400 }, after: before });
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

  it('[PRD 14 G2] a write-off racing a repayment never miscounts the debt', async () => {
    // The owner alert carries the written-off balance too, so it is read back as well.
    const { alertService } = await import('../src/main/server/services/alert.service');
    const alerted = vi.spyOn(alertService, 'debtWriteOff').mockImplementation(async () => {});
    const lines: string[] = [];
    let miscounted = 0;
    for (let i = 1; i <= 5; i += 1) {
      const name = `Poyga ${i}`;
      await sale(w, w.w1, [[w.items.osh, 1]], { payments: [{ method: 'DEBT', amount: 45000 }], debt: { debtorName: name } });
      const debt = await debtByName(name);
      const repaying = i % 2 === 1 ? 5000 : 45000;
      const requests = {
        repayment: () => w.admin.call('POST', `/api/debts/${debt.id}/repayments`, { amount: repaying, method: 'CASH' }),
        'write-off': () => w.admin.call('POST', `/api/debts/${debt.id}/write-off`, { reason: 'Shahardan ketgan' }),
      };
      // The request sent first reaches the server first and commits first, so both
      // orders are tried: the repayment leads in attempts 1 and 2, the write-off in 3 to 5.
      const order: Array<keyof typeof requests> = i > 2 ? ['write-off', 'repayment'] : ['repayment', 'write-off'];
      const answers = await Promise.all(order.map(async (what) => ({ what, status: (await requests[what]()).status })));
      const http = Object.fromEntries(answers.map((a) => [a.what, a.status]));

      const after = await env.prisma.debt.findUniqueOrThrow({ where: { id: debt.id }, include: { repayments: true } });
      const repaid = after.repayments.reduce((s, r) => s + n(r.amount), 0);
      const left = n(after.remainingAmount);
      const recorded = (await env.prisma.auditLog.findMany({ where: { action: 'DEBT_WRITTEN_OFF', entityId: debt.id } }))
        .map((a) => n((a.metadata as any).remainingAtWriteOff));
      const alerts = alerted.mock.calls.filter(([c]) => c.debtorName === name).map(([c]) => n(c.amount));
      // A payment that lands on a written-off debt turns it PARTIAL or PAID (the D14 test below), so a
      // debt still WRITTEN_OFF took its payment before the write-off, and one that is not took it after.
      const heldAtWriteOff = after.status === 'WRITTEN_OFF' ? left : 45000;

      const problems: string[] = [];
      if (left + repaid !== 45000) problems.push(`${left} left + repayments ${repaid} is not 45000`);
      if (http.repayment !== 201) problems.push(`the repayment answered ${http.repayment}, yet a written-off debt stays repayable (D14)`);
      if (http['write-off'] !== 200 && repaying !== 45000) problems.push(`the write-off answered ${http['write-off']} on a debt that still owed money`);
      if (recorded.length !== (http['write-off'] === 200 ? 1 : 0)) problems.push(`${recorded.length} write-off(s) on record after HTTP ${http['write-off']}`);
      if (recorded.length === 1 && recorded[0] !== heldAtWriteOff) problems.push(`written off at ${recorded[0]}, but the debt held ${heldAtWriteOff} then`);
      if (after.status === 'WRITTEN_OFF' && left === 0) problems.push('a fully repaid debt was written off');
      if (alerts.join() !== recorded.join()) problems.push(`the owner alert said ${alerts.join() || 'nothing'}, the record says ${recorded.join() || 'nothing'}`);
      if (problems.length > 0) miscounted += 1;
      lines.push(`debt ${i}: repaying ${repaying}, sent ${answers.map((a) => `${a.what} ${a.status}`).join(', then ')}; now ${after.status}, ${left} left, repayment rows ${repaid}, written off at ${recorded.join() || 'never'}${problems.length > 0 ? ` — ${problems.join('; ')}` : ''}`);
    }
    alerted.mockRestore();
    expect(miscounted, lines.join('\n')).toBe(0);
  });

  it('[D14] a payment on a written-off debt is accepted, lowers the balance and is money in that day', async () => {
    await sale(w, w.w1, [[w.items.osh, 1]], { payments: [{ method: 'DEBT', amount: 45000 }], debt: { debtorName: 'Keyinroq' } });
    const debt = await debtByName('Keyinroq');
    await w.admin.post(`/api/debts/${debt.id}/write-off`, { reason: 'Shahardan ketgan' });
    const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); // the clock's Tashkent day
    const moneyInBefore = n((await ledger(today)).cashflow.realCashIn);
    const seen: string[] = [];
    for (const amount of [5000, 40000]) {
      const paid = await w.admin.call('POST', `/api/debts/${debt.id}/repayments`, { amount, method: 'CASH' });
      const now = await env.prisma.debt.findUniqueOrThrow({ where: { id: debt.id } });
      seen.push(`${amount}: HTTP ${paid.status}, ${now.status}, ${n(now.remainingAmount)} left`);
    }
    const moneyIn = n((await ledger(today)).cashflow.realCashIn) - moneyInBefore;
    expect(
      { seen, moneyIn },
      `money rules D14: a payment made later on a written-off debt is Kirim on that day; after the write-off: ${seen.join(' | ')}, Kirim +${moneyIn}`,
    ).toEqual({ seen: ['5000: HTTP 201, PARTIAL, 40000 left', '40000: HTTP 201, PAID, 0 left'], moneyIn: 45000 });
  });

  it('[PRD 14 G2] two repayments that together exceed the balance: exactly one lands, the other is an overpay', async () => {
    const lines: string[] = [];
    let wrong = 0;
    const pairs = [[25000, 25000], [30000, 20000], [20000, 30000], [40000, 10000], [10000, 40000]];
    for (let i = 1; i <= pairs.length; i += 1) {
      const [first, second] = pairs[i - 1]!;
      const name = `Ortiqcha ${i}`;
      await sale(w, w.w1, [[w.items.osh, 1]], { payments: [{ method: 'DEBT', amount: 45000 }], debt: { debtorName: name } });
      const debt = await debtByName(name);
      const pay = (amount: number) => w.admin.call('POST', `/api/debts/${debt.id}/repayments`, { amount, method: 'CASH' });
      const answers = await Promise.all([pay(first!), pay(second!)]);
      const after = await env.prisma.debt.findUniqueOrThrow({ where: { id: debt.id }, include: { repayments: true } });
      const repaid = after.repayments.reduce((s, r) => s + n(r.amount), 0);
      const left = n(after.remainingAmount);
      const refused = answers.filter((a) => a.status !== 201);

      const problems: string[] = [];
      if (answers.filter((a) => a.status === 201).length !== 1 || refused.length !== 1) problems.push('not exactly one repayment landed');
      if (refused.some((a) => a.status !== 400 || a.body?.error?.code !== 'DEBT_OVERPAY')) problems.push(`the other answered ${refused.map((a) => `${a.status} ${a.body?.error?.code}`).join()}, not 400 DEBT_OVERPAY`);
      if (after.repayments.length !== 1) problems.push(`${after.repayments.length} repayment rows`);
      if (left < 0) problems.push(`the balance went below 0 (${left})`);
      if (left + repaid !== 45000) problems.push(`${left} left + repayments ${repaid} is not 45000`);
      if (problems.length > 0) wrong += 1;
      lines.push(`debt ${i}: repaying ${first} and ${second} together, HTTP ${answers.map((a) => a.status).join('/')}, ${after.status}, ${left} left, repayment rows ${repaid}${problems.length > 0 ? ` — ${problems.join('; ')}` : ''}`);
    }
    expect(wrong, lines.join('\n')).toBe(0);
  });
});
