/* eslint-disable @typescript-eslint/no-explicit-any */
// The remaining ranked issues that can be reproduced: 23, 25, 35, 37, 38.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { at, boot, buildWorld, capturePrints, n, openOrder, sendOrder, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D1 = '2026-09-28';
const D2 = '2026-09-29';

beforeAll(async () => {
  setClock(at(`${D1}T09:00`));
  env = await boot('extras');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

const alertsDuring = async (fn: () => Promise<unknown>, needle: string) => {
  const spy = vi.spyOn(env.svc.telegram, 'sendMessage');
  await fn();
  const hits = spy.mock.calls.map((c) => String(c[0])).filter((t) => t.includes(needle));
  spy.mockRestore();
  return hits.length;
};

describe('Large-expense alert (C46)', () => {
  it('control: a manual expense of 600 000 alerts the owner', async () => {
    const count = await alertsDuring(
      () => w.admin.post('/api/expenses', { amount: 600000, reason: 'Ijara', occurredAt: at(`${D1}T09:30`).toISOString() }),
      'Katta chiqim',
    );
    expect(count).toBe(1);
  });

  it('[issue 23] a Keldi paid 600 000 from the till alerts the owner the same way', async () => {
    const count = await alertsDuring(
      () => w.admin.post(`/api/stock/${w.items.osh}/restock`, { qty: 30, paidUzs: 600000 }),
      'Katta chiqim',
    );
    expect(count, 'alerts sent for a 600 000 delivery payment').toBe(1);
  });
});

describe('Billing edge cases', () => {
  it('[issue 35] after a price change, a repeat add of the same dish is billed at the new price', async () => {
    setClock(at(`${D1}T10:00`));
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.somsa, 1]]); // at 8 000
    await w.admin.patch(`/api/menu/items/${w.items.somsa}`, { price: 10000 });
    await w.w1.post(`/api/orders/${id}/items`, { menuItemId: w.items.somsa, quantity: 1 }); // at 10 000
    await sendOrder(w.w1, id);
    const o = await w.admin.get(`/api/orders/${id}`);
    await w.admin.patch(`/api/menu/items/${w.items.somsa}`, { price: 8000 });
    await w.admin.post(`/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: o.totalAmount }] });
    expect(o.totalAmount, `lines: ${JSON.stringify(o.lines.map((l: any) => [l.nameSnapshot, l.quantity, l.price]))}`).toBe(18000);
  });

  it('[issue 38] when the waive switch zeroes Xizmat haqi, the printed bill still adds up', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1], [w.items.xizmat, 2]]);
    await sendOrder(w.w1, id);
    const closed = await w.admin.post(`/api/orders/${id}/confirm`, { waiveServiceCharge: true, payments: [{ method: 'CASH', amount: 45000 }] });
    const bill = printer.billFor(id);
    const sum = bill.lines.reduce((s, l) => s + l.amount, 0);
    expect(sum, `printed: ${bill.lines.map((l) => `${l.name} ${l.amount}`).join(', ')}; Umumiy ${bill.umumiy}; Xizmat haqi booked ${closed.serviceChargeSnapshot}`).toBe(bill.umumiy);
  });
});

describe('Older data (before the 22.06.2026 fix)', () => {
  it('[issue 25] on a day holding a correction of an earlier day, Chiqimlar "Jami chiqim" is the cash that left the till', async () => {
    // D1: a 100 000 purchase. The old "delete purchase" flow later wrote its REVERSAL stamped D2.
    // That code path is gone; the rows it wrote are still in older databases.
    setClock(at(`${D1}T12:00`));
    const original = await w.admin.post('/api/expenses', { amount: 100000, reason: 'Xarid', occurredAt: at(`${D1}T12:00`).toISOString() });
    setClock(at(`${D2}T10:00`));
    await w.relogin();
    await env.prisma.expense.update({ where: { id: original.id }, data: { status: 'REVERSED' } });
    await env.prisma.expense.create({
      data: {
        categoryId: 'seed-cat-operational', amount: 100000, reason: 'REVERSAL: Xarid', occurredAt: at(`${D2}T10:00`),
        status: 'REVERSAL', reversedExpenseId: original.id, createdById: 'seed-admin',
      },
    });
    await w.admin.post('/api/expenses', { amount: 30000, reason: 'Gaz', occurredAt: at(`${D2}T11:00`).toISOString() });
    const page = await w.admin.get(`/api/expenses?date=${D2}`);
    const pageTotal = page.items.reduce((s: number, e: any) => s + n(e.signedAmount), 0);
    const admin = await w.admin.get(`/api/finance/daily?date=${D2}`);
    expect(pageTotal, `Chiqimlar "Jami chiqim — bugun kassadan ketgan": ${pageTotal}; Kunlik moliya "Ketgan": ${admin.outflow.totalOut}`).toBe(n(admin.outflow.totalOut));
  });
});

describe('Telegram message length', () => {
  it('[issue 37] /omborxona fits in one Telegram message (4 096 characters) with 80 counted dishes', async () => {
    const cat = (await w.admin.get('/api/menu/categories'))[0].id;
    for (let i = 1; i <= 78; i += 1) {
      await w.admin.post('/api/menu/items', { categoryId: cat, name: `Mol go'shtli taom ${i}`, price: 30000, mode: 'COUNTED', costPrice: 12000, initialCount: 20 });
      await new Promise((r) => setTimeout(r, 40)); // human pace; machine-speed bursts are 13-contention's subject
    }
    const { stockService } = await import('../src/main/server/services/stock.service');
    const items = await stockService.listCounted();
    const msg = env.svc.telegram.formatStockMessage(items as any);
    expect(msg.length, `${items.length} counted dishes → ${msg.length} characters`).toBeLessThanOrEqual(4096);
  });
});
