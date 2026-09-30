/* eslint-disable @typescript-eslint/no-explicit-any */
// Chegirma (F7, F8, C7) and the large-discount alert (F45, C45).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { boot, buildWorld, capturePrints, n, openOrder, sendOrder, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

beforeAll(async () => {
  env = await boot('discount');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

async function sentOrder(lines: Array<[string, number]>) {
  const id = await openOrder(w.w1, w.nextTable(), lines);
  await sendOrder(w.w1, id);
  return id;
}

describe('Chegirma', () => {
  it('control: a preset above "Maksimal" (100 000) cannot be created', async () => {
    const r = await w.admin.call('POST', '/api/discounts', { name: 'Katta', value: 150000 });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("[PRD 14 G3] a preset must be whole so'm: a negative or fractional one is refused", async () => {
    // A negative preset would add money to the bill: the confirm takes min(value, subtotal) off it.
    const before = await env.prisma.discount.count();
    const negative = await w.admin.call('POST', '/api/discounts', { name: 'Minus', value: -5000 });
    const fractional = await w.admin.call('POST', '/api/discounts', { name: 'Yarim', value: 2500.5 });
    const kept = await w.admin.post('/api/discounts', { name: 'Besh ming', value: 5000 }); // control: a whole preset still saves
    const edited = await w.admin.call('PATCH', `/api/discounts/${kept.id}`, { value: -1000 });
    const created = (await env.prisma.discount.count()) - before;
    const row = await env.prisma.discount.findUniqueOrThrow({ where: { id: kept.id } });
    expect(
      {
        negative: negative.status,
        code: negative.body?.error?.code,
        fractional: fractional.status,
        edited: edited.status,
        created,
        stored: n(row.value),
      },
      JSON.stringify([negative.body?.error, fractional.body?.error, edited.body?.error]),
    ).toEqual({ negative: 400, code: 'VALIDATION', fractional: 400, edited: 400, created: 1, stored: 5000 });
  });

  it('[issue 15] a typed discount above "Maksimal" (100 000) is refused, as the setting promises', async () => {
    const id = await sentOrder([[w.items.osh, 4], [w.items.salat, 1]]); // 200 000
    const r = await w.admin.call('POST', `/api/orders/${id}/confirm`, {
      discountAmount: 150000,
      payments: [{ method: 'CASH', amount: 50000 }],
    });
    const settings = await w.admin.get('/api/settings');
    const max = Array.isArray(settings) ? settings.find((s: any) => s.key === 'max_discount_amount')?.value : settings.max_discount_amount;
    expect(r.status, `Maksimal = ${max}; a 150 000 discount on a 200 000 bill was answered ${r.status}`).toBeGreaterThanOrEqual(400);
  });

  it('[issue 15] a discount cannot be given without a reason (decision D3)', async () => {
    const id = await sentOrder([[w.items.osh, 1]]); // 45 000
    const r = await w.admin.call('POST', `/api/orders/${id}/confirm`, {
      discountAmount: 5000,
      payments: [{ method: 'CASH', amount: 40000 }],
    });
    expect(r.status, 'confirm with a discount and no reason field').toBeGreaterThanOrEqual(400);
  });

  it('control: the owner is alerted about a discount of 50 000 or more, not below', async () => {
    const spy = vi.spyOn(env.svc.telegram, 'sendMessage');
    const big = await sentOrder([[w.items.osh, 2]]); // 90 000
    await w.admin.post(`/api/orders/${big}/confirm`, { discountAmount: 60000, payments: [{ method: 'CASH', amount: 30000 }] });
    const small = await sentOrder([[w.items.osh, 2]]);
    await w.admin.post(`/api/orders/${small}/confirm`, { discountAmount: 40000, payments: [{ method: 'CASH', amount: 50000 }] });
    const alerts = spy.mock.calls.map((c) => String(c[0])).filter((t) => t.includes('chegirma'));
    spy.mockRestore();
    expect(alerts.length).toBe(1);
  });
});
