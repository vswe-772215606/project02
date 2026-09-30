/* eslint-disable @typescript-eslint/no-explicit-any */
// Stock and food cost (F1, F2, F4, F11, F22, C2, C3, C26, C27).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, buildWorld, capturePrints, itemState, n, openOrder, sale, sendOrder, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

beforeAll(async () => {
  env = await boot('stock');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

const lineCost = async (orderId: string, itemId: string) => {
  const line = await env.prisma.orderLine.findFirstOrThrow({ where: { orderId, menuItemId: itemId } });
  return { qty: line.quantity, cogs: n(line.cogsSnapshot ?? 0), id: line.id };
};

describe('Stock and food cost', () => {
  it('control: selling a counted dish takes the portions and books tan narx × portions', async () => {
    const before = await itemState(env, w.items.osh);
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 3]]);
    const after = await itemState(env, w.items.osh);
    const line = await lineCost(id, w.items.osh);
    expect({ stockTaken: before.stock! - after.stock!, cogs: line.cogs }).toEqual({ stockTaken: 3, cogs: 75000 });
    await sendOrder(w.w1, id);
    // control: removing two portions from the sent order returns them, with their cost
    await w.w1.call('PATCH', `/api/orders/${id}/lines/${line.id}/quantity`, { quantity: 1 });
    const afterDecrease = await itemState(env, w.items.osh);
    const line2 = await lineCost(id, w.items.osh);
    expect({ stockBack: afterDecrease.stock! - after.stock!, cogs: line2.cogs }).toEqual({ stockBack: 2, cogs: 25000 });
    // control: cancelling the order returns the rest
    await w.w1.post(`/api/orders/${id}/cancel`, { reason: 'Mijoz ketdi' });
    expect((await itemState(env, w.items.osh)).stock).toBe(before.stock);
  });

  it('[issue 4] a food dish cannot be saved without a tan narx (decision D4)', async () => {
    const cat = (await w.admin.get('/api/menu/categories'))[0].id;
    const r = await w.admin.call('POST', '/api/menu/items', { categoryId: cat, name: 'Lagmon', price: 30000, mode: 'UNCOUNTED' });
    expect(r.status, `a FOOD dish with no tan narx was answered ${r.status}`).toBeGreaterThanOrEqual(400);
  });

  it('[issue 4] selling a dish with no tan narx books its food cost, not a 100% margin', async () => {
    await sale(w, w.w1, [[w.items.salat, 2]], { payments: [{ method: 'CASH', amount: 40000 }] });
    const ledger = await env.svc.reports.dailyLedger(env.svc.time.localDayKey());
    const row = ledger.lines.mealSales.find((r: any) => r.menuItemId === w.items.salat)!;
    expect(n(row.cogs), `Achichuk sold for ${row.grossRevenue}; food cost booked ${row.cogs}; margin counted ${row.profit}`).toBeGreaterThan(0);
  });

  it('[issue 7] when the automatic cleanup deletes a stale draft, its portions go back to stock', async () => {
    const before = await itemState(env, w.items.somsa);
    const draftId = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 5]]); // never sent
    const taken = await itemState(env, w.items.somsa);
    expect(before.stock! - taken.stock!).toBe(5);
    const entriesBefore = await env.prisma.stockEntry.count({ where: { menuItemId: w.items.somsa } });

    setClock(new Date(Date.now() + 13 * 60 * 60 * 1000)); // 13 hours later
    await env.svc.scheduler.runDraftCleanup();

    const gone = (await env.prisma.order.findUnique({ where: { id: draftId } })) === null;
    const after = await itemState(env, w.items.somsa);
    const entriesAfter = await env.prisma.stockEntry.count({ where: { menuItemId: w.items.somsa } });
    expect(gone, 'the draft should have been deleted by the cleanup').toBe(true);
    expect(
      after.stock,
      `Somsa count: ${before.stock} before the draft, ${taken.stock} with it, ${after.stock} after cleanup; stock entries written by the cleanup: ${entriesAfter - entriesBefore}`,
    ).toBe(before.stock);
  });
});
