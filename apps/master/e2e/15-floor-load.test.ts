/* eslint-disable @typescript-eslint/no-explicit-any */
// A busy floor on a real clock: waiter apps polling while the admin works normally.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, buildWorld, capturePrints, openOrder, sendOrder, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const rejections: string[] = [];
const onRejection = (reason: unknown) => rejections.push(String((reason as any)?.code ?? reason));

beforeAll(async () => {
  process.on('unhandledRejection', onRejection);
  env = await boot('floor');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  process.off('unhandledRejection', onRejection);
  printer.restore();
  await env?.close();
});

describe('Busy floor', () => {
  it('control: with both waiter apps polling, 20 ordinary bills confirm without a server error', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const waiter = i % 2 ? w.w2 : w.w1;
      const id = await openOrder(waiter, w.nextTable(), [[w.items.somsa, 1], [w.items.choy, 1]]);
      await sendOrder(waiter, id);
      ids.push(id);
    }
    let polling = true;
    const pollStatuses: number[] = [];
    const poll = async (api: typeof w.w1) => {
      while (polling) {
        pollStatuses.push((await api.call('GET', '/api/orders?mine=true')).status);
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    const pollers = [poll(w.w1), poll(w.w2)];
    const confirmStatuses: Array<{ status: number; ms: number; code?: string }> = [];
    for (const id of ids) {
      const t0 = Date.now();
      const r = await w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 13000 }] });
      confirmStatuses.push({ status: r.status, ms: Date.now() - t0, code: r.body?.error?.code });
    }
    polling = false;
    await Promise.all(pollers);
    await new Promise((r) => setTimeout(r, 500));
    const failedConfirms = confirmStatuses.filter((c) => c.status >= 300);
    const slowest = Math.max(...confirmStatuses.map((c) => c.ms));
    const failedPolls = pollStatuses.filter((s) => s >= 300).length;
    expect(
      { failedConfirms: failedConfirms.length, failedPolls },
      `confirms: ${confirmStatuses.length} (failed ${failedConfirms.length}: ${JSON.stringify(failedConfirms)}; slowest ${slowest} ms); polls: ${pollStatuses.length} (failed ${failedPolls}); background write timeouts: ${rejections.length}`,
    ).toEqual({ failedConfirms: 0, failedPolls: 0 });
  });
});
