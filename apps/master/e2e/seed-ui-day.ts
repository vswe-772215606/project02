/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Generates today's trading day on a running server (default :4020) through the
 * real HTTP API, for the browser pass. Same day as 07-day.test.ts, plus one
 * SENT bill left open for the Tasdiqlash ticket.
 *
 *   BASE_URL=http://localhost:4020 pnpm exec tsx e2e/seed-ui-day.ts
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:4020';

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (res.status >= 300) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return json;
}

async function main() {
  const owner = (await call(null, 'POST', '/api/auth/login', { username: 'owner', password: 'owner123' })).token;
  await call(owner, 'POST', '/api/users', { role: 'WAITER', fullName: 'Aziz', pin: '5738' });
  await call(owner, 'POST', '/api/users', { role: 'WAITER', fullName: 'Bekzod', pin: '4926' });
  // owner session is kicked by nothing below; admin logs in last so the browser can take over admin
  const w1 = (await call(null, 'POST', '/api/auth/login-pin', { pin: '5738' })).token;
  const w2 = (await call(null, 'POST', '/api/auth/login-pin', { pin: '4926' })).token;

  const tables: string[] = [];
  for (let i = 1; i <= 8; i += 1) tables.push((await call(owner, 'POST', '/api/tables', { name: `Stol ${i}`, type: 'TABLE' })).id);
  const cFood = (await call(owner, 'POST', '/api/menu/categories', { name: 'Taomlar' })).id;
  const cTea = (await call(owner, 'POST', '/api/menu/categories', { name: 'Choy va non' })).id;
  const cSvc = (await call(owner, 'POST', '/api/menu/categories', { name: 'Xizmat' })).id;
  const item = async (b: any) => (await call(owner, 'POST', '/api/menu/items', b)).id;
  const osh = await item({ categoryId: cFood, name: 'Osh', price: 45000, mode: 'COUNTED', costPrice: 25000, initialCount: 50 });
  const somsa = await item({ categoryId: cFood, name: 'Somsa', price: 8000, mode: 'COUNTED', costPrice: 4000, initialCount: 100 });
  const salat = await item({ categoryId: cFood, name: 'Achichuk', price: 20000, mode: 'UNCOUNTED' });
  const non = await item({ categoryId: cTea, name: 'Non', price: 3000, mode: 'UNCOUNTED' });
  const choy = await item({ categoryId: cTea, name: 'Choy', price: 5000, mode: 'UNCOUNTED', costPrice: 1000 });
  const xizmat = await item({ categoryId: cSvc, name: 'Xizmat haqi', price: 5000, mode: 'SERVICE' });

  const admin = (await call(null, 'POST', '/api/auth/login', { username: 'admin', password: 'admin123' })).token;
  let t = 0;
  const order = async (waiter: string, lines: Array<[string, number]>) => {
    const o = await call(waiter, 'POST', '/api/orders', { orderType: 'DINE_IN', tableId: tables[t++] });
    for (const [menuItemId, quantity] of lines) await call(waiter, 'POST', `/api/orders/${o.id}/items`, { menuItemId, quantity });
    await call(waiter, 'POST', `/api/orders/${o.id}/send`, {});
    return o.id as string;
  };
  const confirm = (id: string, body: any) => call(admin, 'POST', `/api/orders/${id}/confirm`, body);

  await confirm(await order(w1, [[osh, 2], [choy, 2], [xizmat, 2]]), { payments: [{ method: 'CASH', amount: 110000 }] });
  await confirm(await order(w2, [[somsa, 5], [non, 2], [xizmat, 2]]), { discountAmount: 6000, payments: [{ method: 'CARD', amount: 50000 }] });
  await confirm(await order(w1, [[salat, 1], [choy, 1], [xizmat, 1]]), { payments: [{ method: 'DEBT', amount: 30000 }], debt: { debtorName: 'Dilshod' } });
  await call(admin, 'POST', `/api/stock/${somsa}/restock`, { qty: 20, paidUzs: 80000 });
  await call(admin, 'POST', '/api/expenses', { amount: 40000, reason: 'Gaz', occurredAt: new Date().toISOString() });
  const avans = await call(admin, 'POST', '/api/expenses', { amount: 50000, reason: 'Oshpazga avans', repayable: true, occurredAt: new Date().toISOString() });
  await call(admin, 'POST', `/api/expenses/${avans.id}/returns`, { amount: 20000 });
  // left SENT for the Tasdiqlash ticket: food 100 000 + Xizmat haqi 6 000 would need a 6-guest line; use Osh ×2 + Choy ×2 + Xizmat ×1
  const open = await order(w2, [[osh, 2], [choy, 2], [xizmat, 1]]); // food 100 000, xizmat 5 000 → 105 000
  console.log(JSON.stringify({ ok: true, openOrder: open.slice(-6).toUpperCase() }));
}

main().catch((e) => { console.error(e); process.exit(1); });
