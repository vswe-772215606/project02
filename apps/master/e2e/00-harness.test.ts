import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, buildWorld, capturePrints, n, sale, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

beforeAll(async () => {
  env = await boot('harness');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('harness', () => {
  it('boots a prod-seeded server, sells through the real API and reports it', async () => {
    const { id, closed } = await sale(w, w.w1, [[w.items.osh, 1]], { payments: [{ method: 'CASH', amount: 45000 }] });
    expect(closed.status).toBe('CLOSED');
    expect(printer.billFor(id).umumiy).toBe(45000);
    const day = env.svc.time.localDayKey();
    const report = await w.owner.get(`/api/reports/daily?date=${day}`);
    expect(n(report.ledger.sales.netSales)).toBe(45000);
    expect(n(report.ledger.pnl.cogs)).toBe(25000);
  });
});
