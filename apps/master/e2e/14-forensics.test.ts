/* eslint-disable @typescript-eslint/no-explicit-any */
// Validates prod-forensics.ts: plant one case of every cause on a real clock, then detect it.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Api, boot, buildWorld, capturePrints, openOrder, sale, sendOrder, type Env, type World } from './harness';
import { runForensics } from './prod-forensics';

const printer = capturePrints();
let env: Env;
let w: World;
let result: Awaited<ReturnType<typeof runForensics>>;

const yesterdayNoon = () => {
  const now = new Date();
  const tk = new Date(now.getTime() + 5 * 3600e3 - 24 * 3600e3).toISOString().slice(0, 10);
  return new Date(`${tk}T12:00:00+05:00`).toISOString();
};

beforeAll(async () => {
  env = await boot('forensics');
  w = await buildWorld(env.base);
  const cash = (amount: number) => ({ payments: [{ method: 'CASH', amount }] });

  await sale(w, w.w1, [[w.items.salat, 2]], cash(40000)); // no tan narx
  await sale(w, w.w1, [[w.items.choy, 10]], cash(50000)); // tan narx → Tan narxi 10 000
  await w.admin.post('/api/expenses', { amount: 10000, reason: 'Choy bargi', occurredAt: new Date().toISOString() }); // …and as Chiqim
  await sale(w, w.w2, [[w.items.osh, 1]], { payments: [{ method: 'CARD', amount: 45000 }] }); // card
  // legacy cross-day correction
  const old = await w.admin.post('/api/expenses', { amount: 70000, reason: 'Xarid', occurredAt: yesterdayNoon() });
  await env.prisma.expense.update({ where: { id: old.id }, data: { status: 'REVERSED' } });
  await env.prisma.expense.create({ data: { categoryId: 'seed-cat-operational', amount: 70000, reason: 'REVERSAL: Xarid', occurredAt: new Date(), status: 'REVERSAL', reversedExpenseId: old.id, createdById: 'seed-admin' } });
  // The damage below is what the old build let through. PRD 14's guards refuse it
  // through the API, so it is written the way it sits in an old database: directly.
  // Double confirm: a second payment row on a closed bill, with the ORDER_CONFIRMED
  // audit row and the BILL print job that a real second confirm wrote beside it.
  for (let i = 0; i < 2; i += 1) {
    const { id } = await sale(w, w.w1, [[w.items.somsa, 1]], cash(8000));
    await env.prisma.payment.create({ data: { orderId: id, method: 'CASH', amount: 8000 } });
    const { id: _auditId, ...audit } = await env.prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'ORDER_CONFIRMED' } });
    await env.prisma.auditLog.create({ data: audit });
    const { id: _jobId, ...job } = await env.prisma.printJob.findFirstOrThrow({ where: { orderId: id, type: 'BILL' } });
    await env.prisma.printJob.create({ data: job });
  }
  // Negative leg: Naqd 20 000 + Karta −4 000 on a 16 000 bill.
  {
    const { id } = await sale(w, w.w1, [[w.items.somsa, 2]], cash(16000));
    const leg = await env.prisma.payment.findFirstOrThrow({ where: { orderId: id } });
    await env.prisma.payment.update({ where: { id: leg.id }, data: { amount: 20000 } });
    await env.prisma.payment.create({ data: { orderId: id, method: 'CARD', amount: -4000 } });
  }
  // Two Nasiya legs of 50 000 and 40 000; only the first became a debt.
  {
    const { id } = await sale(w, w.w1, [[w.items.osh, 2]], { payments: [{ method: 'DEBT', amount: 90000 }], debt: { debtorName: 'A' } });
    const leg = await env.prisma.payment.findFirstOrThrow({ where: { orderId: id, method: 'DEBT' } });
    await env.prisma.payment.update({ where: { id: leg.id }, data: { amount: 50000 } });
    await env.prisma.payment.create({ data: { orderId: id, method: 'DEBT', amount: 40000 } });
    await env.prisma.debt.update({ where: { orderId: id }, data: { originalAmount: 50000, remainingAmount: 50000 } });
  }
  // Repayment race: two repayment rows, the balance reduced once.
  const r1 = await sale(w, w.w2, [[w.items.osh, 1]], { payments: [{ method: 'DEBT', amount: 45000 }], debt: { debtorName: 'B' } });
  const d1 = await env.prisma.debt.findFirstOrThrow({ where: { orderId: r1.id } });
  await w.admin.post(`/api/debts/${d1.id}/repayments`, { amount: 5000, method: 'CASH' });
  await env.prisma.debtRepayment.create({ data: { debtId: d1.id, amount: 5000, method: 'CASH', paidAt: new Date(), receivedById: 'seed-admin' } });
  // Write-off: debt C is given up on.
  const r2 = await sale(w, w.w2, [[w.items.somsa, 1]], { payments: [{ method: 'DEBT', amount: 8000 }], debt: { debtorName: 'C' } });
  const d2 = await env.prisma.debt.findFirstOrThrow({ where: { orderId: r2.id } });
  await w.admin.post(`/api/debts/${d2.id}/write-off`, { reason: 'Topilmadi' });
  // backdated expense; avans given yesterday, written off today; avans undone; Keldi undone
  await w.admin.post('/api/expenses', { amount: 120000, reason: 'Qassobga', occurredAt: yesterdayNoon() });
  const avansOld = await w.admin.post('/api/expenses', { amount: 30000, reason: 'Avans', repayable: true, occurredAt: yesterdayNoon() });
  await w.admin.post(`/api/expenses/${avansOld.id}/write-off`, { reason: 'Ketdi' });
  const avansNow = await w.admin.post('/api/expenses', { amount: 20000, reason: 'Avans xato', repayable: true, occurredAt: new Date().toISOString() });
  await w.admin.post(`/api/expenses/${avansNow.id}/reverse`, { note: 'Xato yozildi' });
  const keldi = await w.admin.post(`/api/stock/${w.items.somsa}/restock`, { qty: 5, paidUzs: 25000 });
  await w.admin.post(`/api/expenses/${keldi.expenseId}/reverse`, { note: 'Xato yozildi' });
  // waiter pay entered as an expense; a service line cut after sending
  await w.admin.post('/api/expenses', { amount: 15000, reason: 'Ofitsiantga xizmat haqi', occurredAt: new Date().toISOString() });
  { const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1], [w.items.xizmat, 2]]); await sendOrder(w.w1, id);
    const line = await env.prisma.orderLine.findFirstOrThrow({ where: { orderId: id, menuItemId: w.items.xizmat } });
    await w.w1.post(`/api/orders/${id}/lines/${line.id}/cancel`, {});
    await w.admin.post(`/api/orders/${id}/confirm`, cash(45000)); }
  // a bill under the owner's account; a failed PIN
  { const id = await openOrder(w.owner, w.nextTable(), [[w.items.somsa, 1]]); await sendOrder(w.owner, id);
    await w.admin.post(`/api/orders/${id}/confirm`, cash(8000)); }
  await Api.rawLoginPin(env.base, '8642');
  // a discount above Maksimal; a count lower than the system expected
  await sale(w, w.w1, [[w.items.osh, 4], [w.items.salat, 1]], { discountAmount: 150000, payments: [{ method: 'CASH', amount: 50000 }] });
  const osh = await env.prisma.menuItem.findUniqueOrThrow({ where: { id: w.items.osh } });
  await w.admin.post(`/api/stock/${w.items.osh}/count`, { countedQty: (osh.stockCount ?? 0) - 3 });

  result = await runForensics(env.dbPath, { days: 30 });
  const { fmt: _f, ...json } = result;
  writeFileSync(join(__dirname, '.data', 'forensics-sample.json'), JSON.stringify(json, null, 2));
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('prod-forensics detects every planted cause', () => {
  const planted = [
    'no-tan-narx', 'double-count', 'card-in-kassa', 'cross-day-reversal', 'double-charge', 'odd-legs', 'lost-nasiya-leg',
    'repayment-race', 'debt-write-off', 'backdated', 'avans-write-off', 'avans-undone', 'keldi-undone', 'waiter-pay',
    'lines-cut', 'attribution', 'discounts', 'count-shrinkage',
  ];
  // The four causes written row by row above are pinned to what was written, so a
  // plant that loses a row cannot hide behind "more than 0". The double confirm also
  // pins the diagnostic's own sentence: a real second confirm left an audit row and a
  // bill print job, and the diagnostic counts both.
  const pinned: Record<string, { count: number; amount: number; meaning?: string }> = {
    'double-charge': { count: 2, amount: 16000, meaning: 'Confirmed twice: 2; printed as a bill twice: 2.' },
    'odd-legs': { count: 1, amount: -4000 },
    'lost-nasiya-leg': { count: 1, amount: 40000 },
    'repayment-race': { count: 1, amount: 5000 },
  };
  for (const id of planted) {
    it(`finds: ${id}`, () => {
      const f = result.findings.find((x) => x.id === id);
      expect(f, `finding ${id} missing`).toBeDefined();
      expect(f!.count, `${f!.title}: ${f!.meaning}`).toBeGreaterThan(0);
      const pin = pinned[id];
      if (pin) {
        expect({ count: f!.count, amount: f!.amount }, f!.title).toEqual({ count: pin.count, amount: pin.amount });
        if (pin.meaning) expect(f!.meaning).toContain(pin.meaning);
      }
    });
  }
  it('reads settings without printing the bot token', () => {
    expect(JSON.stringify(result.settings)).not.toMatch(/\d{6,}:/);
  });
});
