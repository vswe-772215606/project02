/* eslint-disable @typescript-eslint/no-explicit-any */
import { request } from 'http';
// Waiter pay, line edits, PIN login and who can see profit (F2, F31, F52, C44).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Api, boot, buildWorld, capturePrints, n, openOrder, sale, sendOrder, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

beforeAll(async () => {
  env = await boot('staff');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

/** A PIN login from another phone on the LAN: a second loopback source address. */
function loginPinFrom(localAddress: string, pin: string): Promise<{ status: number; body: any }> {
  const url = new URL('/api/auth/login-pin', env.base);
  const payload = JSON.stringify({ pin });
  return new Promise((resolve, reject) => {
    const req = request({
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      localAddress,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

describe('Waiter pay and line edits', () => {
  it('[issue 24] a waiter cannot silently remove the Xizmat haqi line from a sent order', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1], [w.items.xizmat, 3]]);
    await sendOrder(w.w1, id);
    const line = await env.prisma.orderLine.findFirstOrThrow({ where: { orderId: id, menuItemId: w.items.xizmat } });
    const auditBefore = await env.prisma.auditLog.count();
    const r = await w.w1.call('POST', `/api/orders/${id}/lines/${line.id}/cancel`, {});
    const auditAfter = await env.prisma.auditLog.count();
    const confirmed = await w.admin.post(`/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 45000 }] });
    const refusedOrLogged = r.status >= 400 || auditAfter > auditBefore;
    expect(
      refusedOrLogged,
      `waiter removed Xizmat haqi 15 000 from a sent order: HTTP ${r.status}, audit rows written ${auditAfter - auditBefore}; the bill then closed with Xizmat haqi ${confirmed.serviceChargeSnapshot}`,
    ).toBe(true);
  });

  it('control: Xodimlar maoshi adds up each waiter\'s Xizmat haqi', async () => {
    await sale(w, w.w1, [[w.items.osh, 1], [w.items.xizmat, 2]], { payments: [{ method: 'CASH', amount: 55000 }] });
    await sale(w, w.w2, [[w.items.osh, 1], [w.items.xizmat, 4]], { payments: [{ method: 'CARD', amount: 65000 }] });
    const day = env.svc.time.localDayKey();
    const m = await w.admin.get(`/api/finance/service-charge?from=${day}&to=${day}`);
    const byName = Object.fromEntries(m.waiters.map((r: any) => [r.waiterName, n(r.total)]));
    expect(byName).toEqual({ Aziz: 10000, Bekzod: 20000 });
  });

  it('[issue 6] a payout of Xizmat haqi to a waiter can be recorded', async () => {
    const r = await w.admin.call('POST', '/api/finance/waiter-payouts', { waiterId: w.waiterIds.w1, amount: 10000 });
    expect(r.status, 'no route exists for paying a waiter out of the till').toBeLessThan(300);
  });
});

describe('Who sees profit', () => {
  it('control: ADMIN cannot open the owner report', async () => {
    const day = env.svc.time.localDayKey();
    expect((await w.admin.call('GET', `/api/reports/daily?date=${day}`)).status).toBe(403);
  });

  it('[issue 20] ADMIN does not receive profit in the admin daily view', async () => {
    const day = env.svc.time.localDayKey();
    const admin = await w.admin.get(`/api/finance/daily?date=${day}`);
    const leaked = {
      'pnl.profit': admin.pnl?.profit,
      'ledger.pnl.profit': admin.ledger?.pnl?.profit,
      'mealSalesTotal.profit': admin.mealSalesTotal?.profit,
    };
    expect(Object.values(leaked).filter((v) => v !== undefined), JSON.stringify(leaked)).toEqual([]);
  });
});

describe('PIN login (what pushes waiters onto each other\'s accounts)', () => {
  it('[misuse] five mistyped PINs on one phone do not lock the other waiters out', async () => {
    const attempts: number[] = [];
    for (let i = 0; i < 5; i += 1) attempts.push((await Api.rawLoginPin(env.base, '8642')).status);
    const other = await loginPinFrom('127.0.0.2', '4926'); // Bekzod's correct PIN, on his own phone
    expect(
      other.status,
      `five wrong PINs answered ${attempts.join(', ')}; then Bekzod's correct PIN from another phone answered ${other.status} ${JSON.stringify(other.body?.error ?? '')}`,
    ).toBe(200);
  });

  it('[PRD 14 G5] a waiter\'s own lock stops only that waiter, not a colleague with the right PIN', async () => {
    // Aziz is first in the waiter list; the old login ran his lock before it compared anyone's PIN.
    const phone = '127.0.0.4';
    await env.prisma.user.update({ where: { id: w.waiterIds.w1 }, data: { lockedUntil: new Date(Date.now() + 10 * 60 * 1000) } });
    try {
      const colleague = await loginPinFrom(phone, '4926'); // Bekzod's correct PIN, Bekzod is not locked
      const locked = await loginPinFrom(phone, '5738'); // Aziz's correct PIN, Aziz is locked
      expect({ colleague: colleague.status, locked: locked.status }).toEqual({ colleague: 200, locked: 423 });
    } finally {
      await env.prisma.user.update({ where: { id: w.waiterIds.w1 }, data: { lockedUntil: null } });
    }
  });

  it('[PRD 14 G5] the phone that mistyped five times waits five minutes, even with a correct PIN', async () => {
    // Its own five misses, from an address no other test uses. It moves the clock, so it stays the last test in the file.
    const phone = '127.0.0.3';
    const misses: number[] = [];
    for (let i = 0; i < 5; i += 1) misses.push((await loginPinFrom(phone, '8642')).status);
    const locked = await loginPinFrom(phone, '5738'); // Aziz's correct PIN, same phone
    setClock(new Date(Date.now() + 5 * 60 * 1000 + 1000));
    const later = await loginPinFrom(phone, '5738');
    expect({ misses, locked: locked.status, later: later.status }).toEqual({ misses: [401, 401, 401, 401, 423], locked: 423, later: 200 });
  });
});
