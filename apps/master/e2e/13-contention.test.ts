/* eslint-disable @typescript-eslint/no-explicit-any */
// SQLite write contention on the live till (real clock, no fake timers).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { boot, buildWorld, capturePrints, openOrder, sendOrder, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const rejections: string[] = [];
const onRejection = (reason: unknown) => rejections.push(String((reason as any)?.code ?? reason));

beforeAll(async () => {
  process.on('unhandledRejection', onRejection);
  env = await boot('contention');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  process.off('unhandledRejection', onRejection);
  printer.restore();
  await env?.close();
});

describe('Write contention', () => {
  it('[new] 78 writes back to back (machine speed) raise no database errors', async () => {
    const before = rejections.length;
    const cat = (await w.admin.get('/api/menu/categories'))[0].id;
    for (let i = 1; i <= 78; i += 1) {
      await w.admin.post('/api/menu/items', { categoryId: cat, name: `Taom ${i}`, price: 30000, mode: 'COUNTED', costPrice: 12000, initialCount: 20 });
    }
    await new Promise((r) => setTimeout(r, 500));
    expect(rejections.slice(before), 'unhandled rejections during the burst').toEqual([]);
  });

  it('[new] while a bill prints slowly (8 s), a waiter can still add a dish to another table', async () => {
    const busy = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1]]);
    await sendOrder(w.w1, busy);
    const other = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 1]]);

    const { printService } = await import('../src/main/server/services/print.service');
    const realPrint = printService.printBill.bind(printService);
    const spy = vi.spyOn(printService, 'printBill').mockImplementation(async (order: any, tx: any) => {
      await new Promise((r) => setTimeout(r, 8000)); // a slow or jammed thermal printer
      return realPrint(order, tx);
    });

    const confirming = w.admin.call('POST', `/api/orders/${busy}/confirm`, { payments: [{ method: 'CASH', amount: 45000 }] });
    await new Promise((r) => setTimeout(r, 500)); // the confirm is now inside its transaction, printing
    const t0 = Date.now();
    const add = await w.w2.call('POST', `/api/orders/${other}/items`, { menuItemId: w.items.choy, quantity: 1 });
    const waited = Date.now() - t0;
    const confirm = await confirming;
    spy.mockRestore();

    expect(
      { addStatus: add.status, waitedUnder2s: waited < 2000 },
      `waiter's add answered ${add.status} ${JSON.stringify(add.body?.error ?? '')} after ${waited} ms; the confirm answered ${confirm.status}`,
    ).toEqual({ addStatus: 201, waitedUnder2s: true });
  });
});
