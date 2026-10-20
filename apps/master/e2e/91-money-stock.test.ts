/* eslint-disable @typescript-eslint/no-explicit-any */
// Stock counts, tan narx (COGS) and Keldi entries — a hand-modelled walkthrough over HTTP.
//
// Every expected figure is computed in a comment beside it, from round numbers, before the app is
// asked. Every state change goes through the API; Prisma is read only to cross-check rows. Each
// action is its own `it`, so one wrong figure does not hide the next. Where the app is already known
// to disagree, the `[issue N]` tag names the pin (docs/CURRENT_WORKFLOW.md §4 / §11, e2e/*.test.ts).
//
// World (harness.buildWorld): Osh 45 000 (COUNTED, tan narx 25 000, count 50), Somsa 8 000 (COUNTED,
// 4 000, count 100), Achichuk 20 000 (UNCOUNTED, no tan narx), Choy 5 000 (UNCOUNTED, tan narx 1 000),
// Xizmat haqi 5 000 (SERVICE). Three trading days: D1 sales and snapshots, D2 Keldi money, D3 Sanoq
// and who may see the tan narx.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, boot, buildWorld, capturePrints, itemState, n, openOrder, sendOrder, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

const D1 = '2026-10-20';
const D2 = '2026-10-21';
const D3 = '2026-10-22';

// One minute per write, so every journal row has its own instant and lists order deterministically.
let minute = 0;
function tick(day: string): void {
  minute += 1;
  setClock(new Date(at(`${day}T10:00`).getTime() + minute * 60_000));
}
async function newDay(day: string): Promise<void> {
  minute = 0;
  tick(day);
  await w.relogin();
}

beforeAll(async () => {
  setClock(at(`${D1}T09:00`));
  env = await boot('money-stock');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

// ─── helpers ──────────────────────────────────────────────────────────────

const err = (r: { status: number; body: any }) => `HTTP ${r.status} ${JSON.stringify(r.body?.error ?? r.body)}`;
const stockOf = async (id: string) => (await itemState(env, id)).stock;
const costOf = async (id: string) => (await itemState(env, id)).cost;
const liveLine = (orderId: string, itemId: string) =>
  env.prisma.orderLine.findFirstOrThrow({ where: { orderId, menuItemId: itemId, isCanceled: false } });
/** The line's booked food cost; null when nothing was ever booked on it. */
const cogsOf = async (orderId: string, itemId: string) => {
  const line = await liveLine(orderId, itemId);
  return line.cogsSnapshot === null ? null : Number(line.cogsSnapshot);
};
const daily = (day: string) => w.admin.get(`/api/finance/daily?date=${day}`);
const category = async () => (await w.admin.get('/api/menu/categories'))[0].id as string;
const createItem = async (body: Record<string, unknown>) => (await w.admin.post('/api/menu/items', body)).id as string;

/** Paths of every key in `keys` whose value is set (not null/undefined), e.g. `lines[0].cogsSnapshot=50000`. */
function setKeys(value: unknown, keys: Set<string>, path = '$', out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v, i) => setKeys(v, keys, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keys.has(k) && v !== null && v !== undefined) out.push(`${path}.${k}=${JSON.stringify(v)}`);
      setKeys(v, keys, `${path}.${k}`, out);
    }
  }
  return out;
}

/** Every numeric leaf (a number, or a string of digits) that is not a whole number, except under `allowed` keys. */
function fractionalLeaves(value: unknown, allowed: Set<string>, path = '$', out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v, i) => fractionalLeaves(v, allowed, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (allowed.has(k)) continue;
      fractionalLeaves(v, allowed, `${path}.${k}`, out);
    }
  } else if (typeof value === 'number' && !Number.isInteger(value)) out.push(`${path}=${value}`);
  else if (typeof value === 'string' && /^-?\d+\.\d+$/.test(value)) out.push(`${path}=${value}`);
  return out;
}

// ═══ 1. Consume at line-add ═══════════════════════════════════════════════

describe('1. Consume at line-add — Osh, count 50, tan narx 25 000', () => {
  let order: string;
  let lineId: string;

  it('adding Osh ×2 to a DRAFT takes 2 portions at once: 50 → 48; line cogs 2 × 25 000 = 50 000', async () => {
    tick(D1);
    expect(await stockOf(w.items.osh), 'Osh count before anything').toBe(50);
    order = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 2]]);
    const line = await liveLine(order, w.items.osh);
    lineId = line.id;
    expect.soft(await stockOf(w.items.osh), 'Osh count after add ×2 (still DRAFT)').toBe(48);
    expect.soft(Number(line.cogsSnapshot), 'line cogsSnapshot = 2 × 25 000').toBe(50000);
  });

  it('send moves nothing: 48 stays 48, cogs stays 50 000', async () => {
    tick(D1);
    await sendOrder(w.w1, order);
    expect.soft(await stockOf(w.items.osh), 'Osh count after send').toBe(48);
    expect.soft(await cogsOf(order, w.items.osh), 'cogs after send').toBe(50000);
  });

  it('increase 2 → 5 on the SENT order takes 3 more: 48 → 45; cogs 5 × 25 000 = 125 000', async () => {
    tick(D1);
    const r = await w.w1.call('PATCH', `/api/orders/${order}/lines/${lineId}/quantity`, { quantity: 5 });
    expect(r.status, err(r)).toBe(200);
    expect.soft(await stockOf(w.items.osh), 'Osh count after 2 → 5').toBe(45);
    expect.soft(await cogsOf(order, w.items.osh), 'cogs after 2 → 5').toBe(125000);
  });

  it('decrease 5 → 3 returns 2: 45 → 47; cogs 125 000 × 3 ÷ 5 = 75 000', async () => {
    tick(D1);
    const r = await w.w1.call('PATCH', `/api/orders/${order}/lines/${lineId}/quantity`, { quantity: 3 });
    expect(r.status, err(r)).toBe(200);
    expect.soft(await stockOf(w.items.osh), 'Osh count after 5 → 3').toBe(47);
    expect.soft(await cogsOf(order, w.items.osh), 'cogs after 5 → 3').toBe(75000);
  });

  it('cancelling the line returns the last 3: 47 → 50', async () => {
    tick(D1);
    const r = await w.w1.call('POST', `/api/orders/${order}/lines/${lineId}/cancel`, { reason: 'Mijoz fikrini o‘zgartirdi' });
    expect(r.status, err(r)).toBe(200);
    expect.soft(await stockOf(w.items.osh), 'Osh count after the line cancel').toBe(50);
    const line = await env.prisma.orderLine.findUniqueOrThrow({ where: { id: lineId } });
    expect.soft(line.isCanceled, 'line marked canceled').toBe(true);
  });

  it('cancelling the order whose only line is already canceled restores nothing: 50 stays 50 (no double restore)', async () => {
    tick(D1);
    const r = await w.w1.call('POST', `/api/orders/${order}/cancel`, { reason: 'Mijoz ketdi' });
    expect(r.status, err(r)).toBe(200);
    expect.soft(r.body?.status, 'order status').toBe('CANCELED');
    expect.soft(await stockOf(w.items.osh), 'Osh count after the order cancel').toBe(50);
  });
});

// ═══ 2. Guards ════════════════════════════════════════════════════════════

describe('2. Guards — count 0, never counted, uncounted, service, two waiters at once', () => {
  let shashlik: string; // COUNTED, count 3
  let kabob: string; // COUNTED, count 3 — for the race
  let lagmon: string; // COUNTED, never counted (stockCount NULL)

  it('setup: Shashlik (3), Kabob (3) and Lagmon (no count yet) — counted dishes with a tan narx', async () => {
    tick(D1);
    const cat = await category();
    shashlik = await createItem({ categoryId: cat, name: 'Shashlik', price: 15000, mode: 'COUNTED', costPrice: 10000, initialCount: 3 });
    kabob = await createItem({ categoryId: cat, name: 'Kabob', price: 15000, mode: 'COUNTED', costPrice: 10000, initialCount: 3 });
    lagmon = await createItem({ categoryId: cat, name: 'Lagmon', price: 30000, mode: 'COUNTED', costPrice: 12000 });
    expect.soft(await itemState(env, shashlik), 'Shashlik').toEqual({ stock: 3, cost: 10000 });
    expect.soft(await itemState(env, kabob), 'Kabob').toEqual({ stock: 3, cost: 10000 });
    expect.soft(await itemState(env, lagmon), 'Lagmon: sanoq kiritilmagan').toEqual({ stock: null, cost: 12000 });
  });

  it('more than the count is refused (OUT_OF_STOCK) and the count does not move: 4 of 3 → 409, still 3, no line written', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), []);
    const r = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: shashlik, quantity: 4 });
    expect.soft({ status: r.status, code: r.body?.error?.code }, err(r)).toEqual({ status: 409, code: 'OUT_OF_STOCK' });
    expect.soft(await stockOf(shashlik), 'Shashlik count after the refused add').toBe(3);
    expect.soft(await env.prisma.orderLine.count({ where: { orderId: order } }), 'lines written by the refused add').toBe(0);
  });

  it('exactly the count is accepted and leaves 0: 3 of 3 → 201, count 0; the waiter menu shows it unavailable', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), []);
    const r = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: shashlik, quantity: 3 });
    expect.soft(r.status, err(r)).toBe(201);
    expect.soft(await stockOf(shashlik), 'Shashlik count after taking the last 3').toBe(0);
    expect.soft(await cogsOf(order, shashlik), 'cogs 3 × 10 000').toBe(30000);
    const menu = await w.w1.get('/api/menu');
    const row = menu.categories.flatMap((c: any) => c.items).find((i: any) => i.id === shashlik);
    expect.soft(row?.effectivelyAvailable, 'effectivelyAvailable at count 0').toBe(false);
    // at 0 even one more is refused, with the Uzbek message, and the merged line stays at 3
    const more = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: shashlik, quantity: 1 });
    expect.soft(
      { status: more.status, code: more.body?.error?.code, message: more.body?.error?.message },
      err(more),
    ).toEqual({ status: 409, code: 'OUT_OF_STOCK', message: 'Shashlik yetarli emas' });
    expect.soft(await stockOf(shashlik), 'Shashlik count after the refused add at 0').toBe(0);
    expect.soft((await liveLine(order, shashlik)).quantity, 'the existing line is not merged up to 4').toBe(3);
  });

  it('a counted dish that was never counted (sanoq kiritilmagan) is refused like 0, with the Uzbek message, and stays NULL', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), []);
    const r = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: lagmon, quantity: 1 });
    expect.soft(
      { status: r.status, code: r.body?.error?.code, message: r.body?.error?.message },
      err(r),
    ).toEqual({ status: 409, code: 'OUT_OF_STOCK', message: 'Lagmon yetarli emas' });
    expect.soft(await stockOf(lagmon), 'Lagmon count is still NULL, not −1').toBeNull();
    const menu = await w.w1.get('/api/menu');
    const row = menu.categories.flatMap((c: any) => c.items).find((i: any) => i.id === lagmon);
    expect.soft(row?.effectivelyAvailable, 'effectivelyAvailable while never counted').toBe(false);
  });

  it('UNCOUNTED never blocks and SERVICE never touches a count: Achichuk ×1000 and Xizmat haqi ×3 are accepted; no count, no cost booked', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), []);
    const a = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: w.items.salat, quantity: 1000 });
    const b = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: w.items.xizmat, quantity: 3 });
    expect.soft({ achichuk: a.status, xizmat: b.status }, `${err(a)} | ${err(b)}`).toEqual({ achichuk: 201, xizmat: 201 });
    expect.soft(await itemState(env, w.items.salat), 'Achichuk: no count, no tan narx').toEqual({ stock: null, cost: null });
    expect.soft(await itemState(env, w.items.xizmat), 'Xizmat haqi: no count, no tan narx').toEqual({ stock: null, cost: null });
    const achichukCogs = await cogsOf(order, w.items.salat);
    const xizmatCogs = await cogsOf(order, w.items.xizmat);
    // no tan narx → nothing booked: 0 (stored as NULL — recorded in the message)
    expect.soft(achichukCogs ?? 0, `Achichuk line cogs with no tan narx (raw ${achichukCogs})`).toBe(0);
    expect.soft(xizmatCogs ?? 0, `Xizmat haqi line cogs (raw ${xizmatCogs})`).toBe(0);
    await w.w1.post(`/api/orders/${order}/cancel`, { reason: 'Sinov' });
  });

  it('two waiters take the last 3 Kabob at the same moment: exactly one succeeds, the count ends at 0, never below', async () => {
    tick(D1);
    const [o1, o2] = await Promise.all([openOrder(w.w1, w.nextTable(), []), openOrder(w.w2, w.nextTable(), [])]);
    const [r1, r2] = await Promise.all([
      w.w1.call('POST', `/api/orders/${o1}/items`, { menuItemId: kabob, quantity: 3 }),
      w.w2.call('POST', `/api/orders/${o2}/items`, { menuItemId: kabob, quantity: 3 }),
    ]);
    expect.soft([r1.status, r2.status].sort(), `Aziz ${err(r1)} | Bekzod ${err(r2)}`).toEqual([201, 409]);
    expect.soft(await stockOf(kabob), 'Kabob count after the race').toBe(0);
    expect.soft(await env.prisma.orderLine.count({ where: { menuItemId: kabob } }), 'Kabob lines that exist').toBe(1);
  });
});

// ═══ 3. Restore ═══════════════════════════════════════════════════════════

describe('3. Restore — Osh 50 / Somsa 100', () => {
  it('cancelling a DRAFT returns every counted line: Osh 50 → 48 → 50, Somsa 100 → 97 → 100', async () => {
    tick(D1);
    expect({ osh: await stockOf(w.items.osh), somsa: await stockOf(w.items.somsa) }, 'counts before').toEqual({ osh: 50, somsa: 100 });
    const order = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 2], [w.items.somsa, 3]]);
    expect.soft({ osh: await stockOf(w.items.osh), somsa: await stockOf(w.items.somsa) }, 'counts while DRAFT').toEqual({ osh: 48, somsa: 97 });
    const r = await w.w1.call('POST', `/api/orders/${order}/cancel`, { reason: 'Mijoz ketdi' });
    expect(r.status, err(r)).toBe(200);
    expect.soft({ osh: await stockOf(w.items.osh), somsa: await stockOf(w.items.somsa) }, 'counts after cancel from DRAFT').toEqual({ osh: 50, somsa: 100 });
  });

  it('cancelling a SENT order returns every counted line the same way: 48/97 → 50/100', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 2], [w.items.somsa, 3]]);
    await sendOrder(w.w1, order);
    expect.soft({ osh: await stockOf(w.items.osh), somsa: await stockOf(w.items.somsa) }, 'counts while SENT').toEqual({ osh: 48, somsa: 97 });
    const r = await w.admin.call('POST', `/api/orders/${order}/cancel`, { reason: 'Oshxona bekor qildi' });
    expect(r.status, err(r)).toBe(200);
    expect.soft({ osh: await stockOf(w.items.osh), somsa: await stockOf(w.items.somsa) }, 'counts after cancel from SENT').toEqual({ osh: 50, somsa: 100 });
  });

  it('a line cancelled before the order is cancelled comes back once: Osh 50 → 48 → 50 (line) → 50 (order), not 52; Somsa 97 → 100', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 2], [w.items.somsa, 3]]);
    await sendOrder(w.w1, order);
    const line = await liveLine(order, w.items.osh);
    await w.w1.post(`/api/orders/${order}/lines/${line.id}/cancel`, { reason: 'Osh tugadi' });
    expect.soft({ osh: await stockOf(w.items.osh), somsa: await stockOf(w.items.somsa) }, 'counts after the line cancel').toEqual({ osh: 50, somsa: 97 });
    const r = await w.w1.call('POST', `/api/orders/${order}/cancel`, { reason: 'Mijoz ketdi' });
    expect(r.status, err(r)).toBe(200);
    expect.soft({ osh: await stockOf(w.items.osh), somsa: await stockOf(w.items.somsa) }, 'counts after the order cancel').toEqual({ osh: 50, somsa: 100 });
  });
});

// ═══ 5. COGS snapshots and the day ledger ═════════════════════════════════

describe('5. COGS snapshots and the D1 ledger', () => {
  let sold: string;

  it('selling Osh ×2 (25 000) + Choy ×1 (1 000) + Achichuk ×1 (no tan narx): line cogs 50 000 / 1 000 / 0; confirm moves no count', async () => {
    tick(D1);
    expect(await stockOf(w.items.osh), 'Osh count before the sale').toBe(50);
    sold = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 2], [w.items.choy, 1], [w.items.salat, 1]]);
    expect.soft(await stockOf(w.items.osh), 'Osh after add').toBe(48);
    await sendOrder(w.w1, sold);
    // bill = 90 000 + 5 000 + 20 000 = 115 000, paid in cash
    const r = await w.admin.call('POST', `/api/orders/${sold}/confirm`, { payments: [{ method: 'CASH', amount: 115000 }] });
    expect(r.status, err(r)).toBe(200);
    expect.soft(r.body?.status, 'order status').toBe('CLOSED');
    expect.soft(await stockOf(w.items.osh), 'Osh after confirm (confirm moves nothing)').toBe(48);
    const achichuk = await cogsOf(sold, w.items.salat);
    expect.soft(
      { osh: await cogsOf(sold, w.items.osh), choy: await cogsOf(sold, w.items.choy), achichuk: achichuk ?? 0 },
      `line cogs (Achichuk raw ${achichuk}); there is no order-level cogs column — the bill's food cost is the sum of its lines`,
    ).toEqual({ osh: 50000, choy: 1000, achichuk: 0 });
  });

  it('D1 ledger: cogs 51 000, revenue 115 000, operating 0, profit 115 000 − 51 000 − 0 = 64 000; per dish Osh 50 000, Choy 1 000, Achichuk 0', async () => {
    const d = await daily(D1);
    expect.soft(
      { cogs: n(d.pnl.cogs), revenue: n(d.pnl.revenue), operating: n(d.pnl.operatingExpense), profit: n(d.pnl.profit) },
      JSON.stringify(d.pnl),
    ).toEqual({ cogs: 51000, revenue: 115000, operating: 0, profit: 64000 });
    const rows = Object.fromEntries(d.mealSales.map((r: any) => [r.menuItemName, { qty: r.qty, cogs: n(r.cogs), profit: n(r.profit) }]));
    expect.soft(rows, 'mealSales').toEqual({
      Osh: { qty: 2, cogs: 50000, profit: 90000 - 50000 },
      Choy: { qty: 1, cogs: 1000, profit: 5000 - 1000 },
      Achichuk: { qty: 1, cogs: 0, profit: 20000 },
    });
    expect.soft(n(d.mealSalesTotal.cogs), 'mealSalesTotal.cogs').toBe(51000);
    expect.soft(n(d.ledger.pnl.profit), 'canonical ledger profit').toBe(64000);
  });

  it('tan narx is frozen at line-add: Osh ×2 at 25 000, then a Keldi makes Osh 30 000, then confirm → cogs stays 50 000 (§4), count 46 → 48 → 48', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 2]]); // 48 → 46
    await sendOrder(w.w1, order);
    expect.soft(await cogsOf(order, w.items.osh), 'cogs at add').toBe(50000);
    // Keldi 2 Osh for 60 000 → tan narx 60 000 ÷ 2 = 30 000; count 46 → 48
    tick(D1);
    const keldi = await w.admin.call('POST', `/api/stock/${w.items.osh}/restock`, { qty: 2, paidUzs: 60000, setCostFromPaid: true });
    expect(keldi.status, err(keldi)).toBe(201);
    expect.soft(await itemState(env, w.items.osh), 'Osh after the Keldi').toEqual({ stock: 48, cost: 30000 });
    tick(D1);
    const r = await w.admin.call('POST', `/api/orders/${order}/confirm`, { payments: [{ method: 'CASH', amount: 90000 }] });
    expect(r.status, err(r)).toBe(200);
    expect.soft(await cogsOf(order, w.items.osh), 'cogs after confirm: add-time 2 × 25 000, not 2 × 30 000').toBe(50000);
    expect.soft(await stockOf(w.items.osh), 'confirm moves no count').toBe(48);
  });

  it('D1 ledger after that Keldi: operating still 0 (a Keldi is not a chiqim), cashOut 60 000, cogs 51 000 + 50 000 = 101 000, profit 205 000 − 101 000 = 104 000', async () => {
    const d = await daily(D1);
    expect.soft(
      {
        cogs: n(d.pnl.cogs),
        revenue: n(d.pnl.revenue),
        operating: n(d.pnl.operatingExpense),
        profit: n(d.pnl.profit),
        cashOut: n(d.outflow.cashOut),
        purchases: n(d.outflow.purchasesTotal),
      },
      JSON.stringify({ pnl: d.pnl, outflow: d.outflow }),
    ).toEqual({ cogs: 101000, revenue: 205000, operating: 0, profit: 104000, cashOut: 60000, purchases: 60000 });
  });

  it('decrease after a cost change recomputes proportionally: Osh ×2 at 30 000 = 60 000; tan narx → 35 000; 2 → 1 gives 60 000 × 1 ÷ 2 = 30 000; 1 → 3 adds 2 × 35 000 = 100 000', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 2]]); // 48 → 46
    expect.soft(await cogsOf(order, w.items.osh), 'cogs at add, 2 × 30 000').toBe(60000);
    const patched = await w.admin.call('PATCH', `/api/menu/items/${w.items.osh}`, { costPrice: 35000 });
    expect(patched.status, err(patched)).toBe(200);
    expect.soft(await costOf(w.items.osh), 'tan narx after the edit').toBe(35000);
    const line = await liveLine(order, w.items.osh);
    const down = await w.w1.call('PATCH', `/api/orders/${order}/lines/${line.id}/quantity`, { quantity: 1 });
    expect(down.status, err(down)).toBe(200);
    expect.soft(await cogsOf(order, w.items.osh), 'cogs after 2 → 1 (keeps the add-time 30 000, not 35 000)').toBe(30000);
    expect.soft(await stockOf(w.items.osh), 'Osh count 46 → 47').toBe(47);
    const up = await w.w1.call('PATCH', `/api/orders/${order}/lines/${line.id}/quantity`, { quantity: 3 });
    expect(up.status, err(up)).toBe(200);
    expect.soft(await cogsOf(order, w.items.osh), 'cogs after 1 → 3: 30 000 + 2 × 35 000 — each portion at the tan narx of its own add').toBe(100000);
    expect.soft(await stockOf(w.items.osh), 'Osh count 47 → 45').toBe(45);
    await w.w1.post(`/api/orders/${order}/cancel`, { reason: 'Sinov' });
    expect.soft(await stockOf(w.items.osh), 'Osh count after cancel 45 → 48').toBe(48);
    // tan narx back to 25 000 for the blocks below
    await w.admin.patch(`/api/menu/items/${w.items.osh}`, { costPrice: 25000 });
    expect(await costOf(w.items.osh), 'tan narx restored').toBe(25000);
  });
});

// ═══ 6. Price snapshot ════════════════════════════════════════════════════

describe('6. Price snapshot', () => {
  it('price is frozen at line-add: Osh ×1 at 45 000, price → 50 000, confirm → the bill is 45 000, subtotal 45 000', async () => {
    tick(D1);
    const order = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1]]); // 48 → 47
    const patched = await w.admin.call('PATCH', `/api/menu/items/${w.items.osh}`, { price: 50000 });
    expect(patched.status, err(patched)).toBe(200);
    await sendOrder(w.w1, order);
    const o = await w.admin.get(`/api/orders/${order}`);
    const line = o.lines.find((l: any) => l.menuItemId === w.items.osh);
    expect.soft(
      { unit: line?.price, unitSnapshot: n(line?.unitPriceSnapshot), total: o.totalAmount },
      'the open order after the price change',
    ).toEqual({ unit: 45000, unitSnapshot: 45000, total: 45000 });
    const r = await w.admin.call('POST', `/api/orders/${order}/confirm`, { payments: [{ method: 'CASH', amount: 45000 }] });
    expect.soft(
      { status: r.status, subtotal: r.body?.subtotalSnapshot, total: r.body?.totalSnapshot },
      err(r),
    ).toEqual({ status: 200, subtotal: 45000, total: 45000 });
    await w.admin.patch(`/api/menu/items/${w.items.osh}`, { price: 45000 });
  });
});

// ═══ 4. Keldi ═════════════════════════════════════════════════════════════

describe('4. Keldi — Manti, count 50, tan narx 25 000, on a day of its own (D2)', () => {
  let manti: string;
  let keldi1: any; // 30 for 900 000, sets the tan narx
  let keldi2: any; // 3 for 100 000, sets the tan narx (fractional)
  let keldi3: any; // 5 for 200 000, does not set the tan narx
  let expenseRows: number;
  let firstSale: string;
  let fractionalSale: string;

  it('setup: D2; Manti created with count 50 and tan narx 25 000', async () => {
    await newDay(D2);
    manti = await createItem({ categoryId: await category(), name: 'Manti', price: 40000, mode: 'COUNTED', costPrice: 25000, initialCount: 50 });
    expect(await itemState(env, manti), 'Manti').toEqual({ stock: 50, cost: 25000 });
    expenseRows = await env.prisma.expense.count();
  });

  it('Keldi 30 for 900 000 (setCostFromPaid): count 50 → 80; tan narx 900 000 ÷ 30 = 30 000 replaces 25 000 (no averaging); one Expense of 900 000 in Mahsulot xaridi', async () => {
    tick(D2);
    const r = await w.admin.call('POST', `/api/stock/${manti}/restock`, { qty: 30, paidUzs: 900000, setCostFromPaid: true, note: 'Bozor' });
    expect(r.status, err(r)).toBe(201);
    keldi1 = r.body;
    expect.soft(await itemState(env, manti), 'Manti after Keldi 1').toEqual({ stock: 80, cost: 30000 });
    expect.soft(
      { kind: keldi1.kind, qty: keldi1.qty, countBefore: keldi1.countBefore, countAfter: keldi1.countAfter, paidUzs: keldi1.paidUzs, unitCost: keldi1.unitCost, note: keldi1.note },
      JSON.stringify(keldi1),
    ).toEqual({ kind: 'RESTOCK', qty: 30, countBefore: 50, countAfter: 80, paidUzs: '900000', unitCost: '30000', note: 'Bozor' });
    expect.soft(typeof keldi1.expenseId, 'the entry links its Expense').toBe('string');
    const expense = await env.prisma.expense.findUniqueOrThrow({ where: { id: keldi1.expenseId } });
    expect.soft(
      { categoryId: expense.categoryId, amount: Number(expense.amount), status: expense.status, reason: expense.reason, repayable: expense.repayable },
      'the Expense row',
    ).toEqual({ categoryId: 'seed-cat-ingredients', amount: 900000, status: 'ACTIVE', reason: 'Keldi: Manti', repayable: false });
    expect.soft((await env.prisma.expense.count()) - expenseRows, 'Expense rows written by one Keldi').toBe(1);
    const audit = await env.prisma.auditLog.findFirst({ where: { action: 'STOCK_RESTOCKED', entityId: manti }, orderBy: { createdAt: 'desc' } });
    expect.soft(audit?.metadata, 'STOCK_RESTOCKED audit metadata').toMatchObject({
      itemName: 'Manti', qty: 30, countBefore: 50, countAfter: 80, paidUzs: '900000', unitCost: '30000', costUpdated: true, expenseId: keldi1.expenseId,
    });
  });

  it('a sale between the Keldis: Manti ×1 for 40 000 cash → count 80 → 79, cogs 30 000 (the new tan narx)', async () => {
    tick(D2);
    firstSale = await openOrder(w.w1, w.nextTable(), [[manti, 1]]);
    await sendOrder(w.w1, firstSale);
    const r = await w.admin.call('POST', `/api/orders/${firstSale}/confirm`, { payments: [{ method: 'CASH', amount: 40000 }] });
    expect(r.status, err(r)).toBe(200);
    expect.soft(await stockOf(manti), 'Manti count after the sale').toBe(79);
    expect.soft(await cogsOf(firstSale, manti), 'cogs 1 × 30 000').toBe(30000);
  });

  it('Keldi 3 for 100 000 (setCostFromPaid): count 79 → 82; tan narx 100 000 ÷ 3 = 33 333.333… unrounded (the one allowed non-integer); the entry shows unitCost "33333"', async () => {
    tick(D2);
    const r = await w.admin.call('POST', `/api/stock/${manti}/restock`, { qty: 3, paidUzs: 100000, setCostFromPaid: true });
    expect(r.status, err(r)).toBe(201);
    keldi2 = r.body;
    const state = await itemState(env, manti);
    expect.soft(state.stock, 'Manti count after Keldi 2').toBe(82);
    expect.soft(state.cost, `tan narx stored (raw ${state.cost})`).toBeCloseTo(100000 / 3, 5);
    expect.soft(Number.isInteger(state.cost), 'tan narx is left fractional, not rounded').toBe(false);
    expect.soft(
      { qty: keldi2.qty, countBefore: keldi2.countBefore, countAfter: keldi2.countAfter, paidUzs: keldi2.paidUzs, unitCost: keldi2.unitCost },
      JSON.stringify(keldi2),
    ).toEqual({ qty: 3, countBefore: 79, countAfter: 82, paidUzs: '100000', unitCost: '33333' });
    expect.soft((await env.prisma.expense.count()) - expenseRows, 'Expense rows after two Keldis').toBe(2);
  });

  it('Keldi 5 for 200 000 without setCostFromPaid: count 82 → 87; tan narx stays 33 333.333…; the unit cost 40 000 is on the entry only; Expense 200 000', async () => {
    tick(D2);
    const r = await w.admin.call('POST', `/api/stock/${manti}/restock`, { qty: 5, paidUzs: 200000 });
    expect(r.status, err(r)).toBe(201);
    keldi3 = r.body;
    const state = await itemState(env, manti);
    expect.soft(state.stock, 'Manti count after Keldi 3').toBe(87);
    expect.soft(state.cost, 'tan narx untouched').toBeCloseTo(100000 / 3, 5);
    expect.soft(
      { qty: keldi3.qty, countBefore: keldi3.countBefore, countAfter: keldi3.countAfter, paidUzs: keldi3.paidUzs, unitCost: keldi3.unitCost },
      JSON.stringify(keldi3),
    ).toEqual({ qty: 5, countBefore: 82, countAfter: 87, paidUzs: '200000', unitCost: '40000' });
    const expense = await env.prisma.expense.findUniqueOrThrow({ where: { id: keldi3.expenseId } });
    expect.soft({ amount: Number(expense.amount), categoryId: expense.categoryId }, 'the Expense row').toEqual({ amount: 200000, categoryId: 'seed-cat-ingredients' });
    const audit = await env.prisma.auditLog.findFirst({ where: { action: 'STOCK_RESTOCKED', entityId: manti }, orderBy: { createdAt: 'desc' } });
    expect.soft(audit?.metadata, 'audit says the tan narx was not updated').toMatchObject({ qty: 5, costUpdated: false });
  });

  it('a Keldi with no money: 10 for nothing → count 87 → 97, no Expense, no tan narx change, entry without paidUzs', async () => {
    tick(D2);
    const before = await env.prisma.expense.count();
    const r = await w.admin.call('POST', `/api/stock/${manti}/restock`, { qty: 10 });
    expect(r.status, err(r)).toBe(201);
    expect.soft({ paidUzs: r.body?.paidUzs, unitCost: r.body?.unitCost, expenseId: r.body?.expenseId, countAfter: r.body?.countAfter }, JSON.stringify(r.body)).toEqual({ paidUzs: null, unitCost: null, expenseId: null, countAfter: 97 });
    expect.soft((await env.prisma.expense.count()) - before, 'Expense rows written by a free Keldi').toBe(0);
    expect.soft((await itemState(env, manti)).cost, 'tan narx untouched').toBeCloseTo(100000 / 3, 5);
    // and back down to 87 for the arithmetic below: Sanoq 87 (absolute)
    tick(D2);
    const fix = await w.admin.call('POST', `/api/stock/${manti}/count`, { countedQty: 87, note: 'Sinov uchun' });
    expect(fix.status, err(fix)).toBe(201);
    expect(await stockOf(manti), 'Manti count after the Sanoq').toBe(87);
  });

  it('refused Keldis: qty 0 / −1 / 1.5 and paid 0 / −1 / 1000.5 → 400 VALIDATION; count stays 87, no Expense, no entry', async () => {
    tick(D2);
    const expensesBefore = await env.prisma.expense.count();
    const entriesBefore = await env.prisma.stockEntry.count({ where: { menuItemId: manti } });
    const attempts: Record<string, Record<string, unknown>> = {
      qtyZero: { qty: 0, paidUzs: 10000 },
      qtyNegative: { qty: -1, paidUzs: 10000 },
      qtyFractional: { qty: 1.5, paidUzs: 10000 },
      paidZero: { qty: 1, paidUzs: 0 },
      paidNegative: { qty: 1, paidUzs: -1 },
      paidFractional: { qty: 1, paidUzs: 1000.5 },
      paidAsText: { qty: 1, paidUzs: '10000' },
    };
    const results: Record<string, { status: number; code?: string }> = {};
    for (const [name, body] of Object.entries(attempts)) {
      const r = await w.admin.call('POST', `/api/stock/${manti}/restock`, body);
      results[name] = { status: r.status, code: r.body?.error?.code };
    }
    const refused = { status: 400, code: 'VALIDATION' };
    expect.soft(results, JSON.stringify(results)).toEqual({
      qtyZero: refused, qtyNegative: refused, qtyFractional: refused, paidZero: refused, paidNegative: refused, paidFractional: refused, paidAsText: refused,
    });
    expect.soft(await stockOf(manti), 'Manti count after the refused Keldis').toBe(87);
    expect.soft((await env.prisma.expense.count()) - expensesBefore, 'Expense rows written by refused Keldis').toBe(0);
    expect.soft((await env.prisma.stockEntry.count({ where: { menuItemId: manti } })) - entriesBefore, 'entries written by refused Keldis').toBe(0);
  });

  it('a Keldi on an UNCOUNTED dish (Choy) or a SERVICE line (Xizmat haqi) is refused (400) and writes nothing', async () => {
    tick(D2);
    const expensesBefore = await env.prisma.expense.count();
    const choy = await w.admin.call('POST', `/api/stock/${w.items.choy}/restock`, { qty: 10, paidUzs: 10000 });
    const xizmat = await w.admin.call('POST', `/api/stock/${w.items.xizmat}/restock`, { qty: 10, paidUzs: 10000 });
    expect.soft({ choy: choy.status, xizmat: xizmat.status }, `${err(choy)} | ${err(xizmat)}`).toEqual({ choy: 400, xizmat: 400 });
    expect.soft(choy.body?.error?.message, 'the Uzbek message').toBe('Bu taom sanalmaydi');
    expect.soft((await env.prisma.expense.count()) - expensesBefore, 'Expense rows written').toBe(0);
    expect.soft(await itemState(env, w.items.choy), 'Choy untouched').toEqual({ stock: null, cost: 1000 });
  });

  it('D2 ledger with three paid Keldis: operating 0, expensesGross 1 200 000, cashOut 1 200 000, purchases 1 200 000 (3), totalIn 40 000, drawer 40 000 − 1 200 000 = −1 160 000; cogs 30 000, profit 40 000 − 30 000 − 0 = 10 000', async () => {
    const d = await daily(D2);
    expect.soft(
      {
        operating: n(d.pnl.operatingExpense),
        expensesGross: n(d.outflow.expensesGross),
        sameDayReversal: n(d.outflow.expensesSameDayReversal),
        cashOut: n(d.outflow.cashOut),
        purchases: n(d.outflow.purchasesTotal),
        purchasesCount: d.outflow.purchasesCount,
        totalIn: n(d.cashflow.totalIn),
        drawer: n(d.drawer.movement),
        cogs: n(d.pnl.cogs),
        revenue: n(d.pnl.revenue),
        profit: n(d.pnl.profit),
      },
      JSON.stringify({ pnl: d.pnl, outflow: d.outflow, cashflow: d.cashflow, drawer: d.drawer }),
    ).toEqual({
      operating: 0,
      expensesGross: 1200000,
      sameDayReversal: 0,
      cashOut: 1200000,
      purchases: 1200000,
      purchasesCount: 3,
      totalIn: 40000,
      drawer: -1160000,
      cogs: 30000,
      revenue: 40000,
      profit: 10000,
    });
    // the Keldi expenses are not listed among operating expenses, and are listed under Xaridlar
    expect.soft(d.operatingExpenses.map((e: any) => e.reason), 'operating expense rows').toEqual([]);
    expect.soft(
      d.ingredientPurchases.map((p: any) => [p.ingredientName, p.quantityBuyUnit, n(p.totalCostUzs)]),
      'Xaridlar rows',
    ).toEqual([['Manti', '30', 900000], ['Manti', '3', 100000], ['Manti', '5', 200000]]);
    // drawer = realCashIn − cashOut, by the canonical ledger too
    expect.soft(n(d.ledger.cashflow.realCashIn) - n(d.ledger.cashflow.cashOut), 'ledger drawerMovement').toBe(n(d.ledger.cashflow.drawerMovement));
  });

  it('[issue 19] undoing Keldi 2 (100 000) the same day: cash comes back, and the 3 portions and the tan narx it set come back too — count 87 → 84, tan narx → 30 000', async () => {
    tick(D2);
    const r = await w.admin.call('POST', `/api/expenses/${keldi2.expenseId}/reverse`, { note: "Noto'g'ri kiritildi" });
    expect(r.status, err(r)).toBe(200);
    const expense = await env.prisma.expense.findUniqueOrThrow({ where: { id: keldi2.expenseId } });
    expect.soft(expense.status, 'the Keldi expense').toBe('REVERSED');
    const state = await itemState(env, manti);
    expect.soft(state, `Manti after the undo (stock/cost); §4 "Corrections" documents the current behaviour — the undo unwinds cash only`).toEqual({ stock: 84, cost: 30000 });
  });

  it('D2 ledger after the undo: expensesGross still 1 200 000, sameDayReversal 100 000, cashOut 1 100 000, purchases 1 100 000 (2), operating 0, drawer 40 000 − 1 100 000 = −1 060 000', async () => {
    const d = await daily(D2);
    expect.soft(
      {
        operating: n(d.pnl.operatingExpense),
        expensesGross: n(d.outflow.expensesGross),
        reversal: n(d.outflow.expensesReversal),
        sameDayReversal: n(d.outflow.expensesSameDayReversal),
        cashOut: n(d.outflow.cashOut),
        purchases: n(d.outflow.purchasesTotal),
        purchasesCount: d.outflow.purchasesCount,
        totalIn: n(d.cashflow.totalIn),
        drawer: n(d.drawer.movement),
        profit: n(d.pnl.profit),
      },
      JSON.stringify({ pnl: d.pnl, outflow: d.outflow, cashflow: d.cashflow, drawer: d.drawer }),
    ).toEqual({
      operating: 0,
      expensesGross: 1200000,
      reversal: 100000,
      sameDayReversal: 100000,
      cashOut: 1100000,
      purchases: 1100000,
      purchasesCount: 2,
      totalIn: 40000,
      drawer: -1060000,
      profit: 10000,
    });
  });

  it('selling at a fractional tan narx: Manti ×3 for 120 000 cash → count −3; cogs 3 × 33 333.333… = 100 000; D2 cogs 30 000 + 100 000 = 130 000, revenue 160 000, profit 30 000, drawer 160 000 − 1 100 000 = −940 000', async () => {
    tick(D2);
    // Read the dish as the undo above left it, so this block does not inherit that block's verdict:
    // the hand model is 3 × the tan narx of the moment (33 333.333… → 100 000; or 90 000 had the undo held).
    const before = await itemState(env, manti);
    const cost = before.cost!;
    const expectedCogs = Math.round(cost * 3);
    fractionalSale = await openOrder(w.w1, w.nextTable(), [[manti, 3]]);
    await sendOrder(w.w1, fractionalSale);
    const r = await w.admin.call('POST', `/api/orders/${fractionalSale}/confirm`, { payments: [{ method: 'CASH', amount: 120000 }] });
    expect(r.status, err(r)).toBe(200);
    expect.soft(await stockOf(manti), `Manti count ${before.stock} → ${before.stock! - 3}`).toBe(before.stock! - 3);
    const line = await liveLine(fractionalSale, manti);
    const raw = line.cogsSnapshot === null ? null : Number(line.cogsSnapshot);
    expect.soft(raw, `line cogsSnapshot = 3 × ${cost} (raw ${line.cogsSnapshot})`).toBeCloseTo(cost * 3, 3);
    const d = await daily(D2);
    expect.soft(
      { cogs: n(d.pnl.cogs), revenue: n(d.pnl.revenue), profit: n(d.pnl.profit), totalIn: n(d.cashflow.totalIn), drawer: n(d.drawer.movement) },
      JSON.stringify({ pnl: d.pnl, cashflow: d.cashflow, drawer: d.drawer }),
    ).toEqual({ cogs: 30000 + expectedCogs, revenue: 160000, profit: 160000 - 30000 - expectedCogs, totalIn: 160000, drawer: -940000 });
  });

  it('GET /api/stock lists Manti with its count and tan narx; GET /api/stock/:id/entries shows every entry newest first with the running count (sales are not journaled)', async () => {
    const list = await w.admin.get('/api/stock');
    const row = list.find((i: any) => i.id === manti);
    const current = await itemState(env, manti);
    expect.soft(
      { stockCount: row?.stockCount, costPrice: row?.costPrice, hasLastEntry: typeof row?.lastEntryAt === 'string' },
      JSON.stringify(row),
    ).toEqual({ stockCount: current.stock, costPrice: String(Math.round(current.cost!)), hasLastEntry: true }); // the listing rounds the tan narx with toFixed(0)
    expect.soft(list.map((i: any) => i.name).sort(), 'only counted FOOD dishes are listed').toEqual(['Kabob', 'Lagmon', 'Manti', 'Osh', 'Shashlik', 'Somsa']);
    const entries = await w.admin.get(`/api/stock/${manti}/entries`);
    expect.soft(
      entries.map((e: any) => [e.kind, e.qty, e.countBefore, e.countAfter, e.paidUzs, e.unitCost]),
      JSON.stringify(entries),
    ).toEqual([
      ['COUNT', 87, 97, 87, null, null], // the Sanoq back to 87
      ['RESTOCK', 10, 87, 97, null, null], // the free Keldi
      ['RESTOCK', 5, 82, 87, '200000', '40000'],
      ['RESTOCK', 3, 79, 82, '100000', '33333'], // 80 → 79 in between is the sale, reconstructible from the order line
      ['RESTOCK', 30, 50, 80, '900000', '30000'],
      ['COUNT', 50, null, 50, null, null], // the initial count at creation
    ]);
    expect.soft(entries.every((e: any) => e.actorName === 'Admin'), 'actor on every entry').toBe(true);
    const undone = entries.find((e: any) => e.id === keldi2.id);
    expect.soft(undone?.expenseId, 'the undone Keldi still links its (now REVERSED) Expense').toBe(keldi2.expenseId);
  });

  it('the Keldi expenses are visible on GET /api/expenses?date= as Mahsulot xaridi rows; the undone one is REVERSED with a REVERSAL beside it', async () => {
    const e = await w.admin.get(`/api/expenses?date=${D2}`);
    const rows = e.items
      .filter((x: any) => x.categoryId === 'seed-cat-ingredients')
      .map((x: any) => [x.reason, n(x.amount), x.status])
      .sort((a: any, b: any) => String(a).localeCompare(String(b)));
    expect.soft(rows, JSON.stringify(e.items)).toEqual([
      ['Keldi: Manti', 100000, 'REVERSED'],
      ['Keldi: Manti', 200000, 'ACTIVE'],
      ['Keldi: Manti', 900000, 'ACTIVE'],
      ['REVERSAL: Keldi: Manti', 100000, 'REVERSAL'],
    ]);
    // One word, one meaning: a Keldi's money is tan narx when the dish sells, never Xarajat — so the list's
    // `operating` is 0, the same figure the ledger subtracts from profit (D17; it used to count all categories).
    expect.soft(
      { gross: n(e.totals.gross), sameDayReversal: n(e.totals.sameDayReversal), cashOut: n(e.totals.cashOut), operating: n(e.totals.operating) },
      JSON.stringify(e.totals),
    ).toEqual({ gross: 1200000, sameDayReversal: 100000, cashOut: 1100000, operating: 0 });
    const d = await daily(D2);
    expect.soft(n(e.totals.operating), 'list operating == ledger pnl.operatingExpense').toBe(n(d.pnl.operatingExpense));
  });

  // ═══ 9. Money shape ═════════════════════════════════════════════════════

  it("9. on the wire every amount is a whole so'm except the tan narx (costPrice / unitCost)", async () => {
    const samples = {
      daily: await daily(D2),
      stock: await w.admin.get('/api/stock'),
      entries: await w.admin.get(`/api/stock/${manti}/entries`),
      items: await w.admin.get('/api/menu/items'),
      fractionalSale: await w.admin.get(`/api/orders/${fractionalSale}`),
      firstSale: await w.admin.get(`/api/orders/${firstSale}`),
      expenses: await w.admin.get(`/api/expenses?date=${D2}`),
    };
    const fractional = fractionalLeaves(samples, new Set(['costPrice', 'unitCost']));
    expect(fractional, 'fractional amounts on the wire').toEqual([]);
  });

  it('9. the tan narx itself may be fractional: Manti on GET /api/menu/items carries 100 000 ÷ 3 unrounded', async () => {
    const items = await w.admin.get('/api/menu/items');
    const row = items.find((i: any) => i.id === manti);
    expect.soft(Number(row?.costPrice), `costPrice on the wire: ${row?.costPrice}`).toBeCloseTo(100000 / 3, 5);
    expect.soft(Number.isInteger(Number(row?.costPrice)), 'not rounded').toBe(false);
  });
});

// ═══ 7. Sanoq ═════════════════════════════════════════════════════════════

describe('7. Sanoq (count correction) — Osh, on D3; writes no money', () => {
  let base: number; // Osh's count going into D3: 48 after D1's last cancel, minus the 1 sold in block 6 = 47
  let expenseRows: number;
  let costAudits: number;

  it('setup: D3; Osh as the days left it: count 47, tan narx 25 000', async () => {
    await newDay(D3);
    const before = await itemState(env, w.items.osh);
    base = before.stock!;
    expenseRows = await env.prisma.expense.count();
    costAudits = await env.prisma.auditLog.count({ where: { action: 'ITEM_COST_CHANGED', entityId: w.items.osh } });
    expect.soft(before.stock, 'Osh count going into D3').toBe(47);
    expect.soft(before.cost, 'Osh tan narx going into D3').toBe(25000);
  });

  it('Sanoq 10: count → 10 exactly (absolute, not additive); tan narx unchanged; no Expense; a COUNT entry and a STOCK_COUNT_SET audit row with before/after', async () => {
    tick(D3);
    const r = await w.admin.call('POST', `/api/stock/${w.items.osh}/count`, { countedQty: 10, note: 'Kechki sanoq' });
    expect(r.status, err(r)).toBe(201);
    expect.soft(r.body, 'the COUNT entry').toMatchObject({ kind: 'COUNT', qty: 10, countBefore: base, countAfter: 10, paidUzs: null, unitCost: null, expenseId: null, note: 'Kechki sanoq' });
    expect.soft(await itemState(env, w.items.osh), 'Osh after Sanoq 10').toEqual({ stock: 10, cost: 25000 });
    expect.soft((await env.prisma.expense.count()) - expenseRows, 'Expense rows written by a Sanoq').toBe(0);
    const audit = await env.prisma.auditLog.findFirst({ where: { action: 'STOCK_COUNT_SET', entityId: w.items.osh }, orderBy: { createdAt: 'desc' } });
    expect.soft({ userId: audit?.userId, metadata: audit?.metadata }, 'the audit row').toEqual({
      userId: 'seed-admin',
      metadata: { itemName: 'Osh', countBefore: base, countAfter: 10, note: 'Kechki sanoq' },
    });
    const listed = await w.admin.get('/api/audit?action=STOCK_COUNT_SET&pageSize=5');
    expect.soft(listed.items?.[0]?.entityId, 'GET /api/audit shows it first').toBe(w.items.osh);
  });

  it('Sanoq 0: count → 0; the dish is unavailable and a waiter add is refused; still no money written', async () => {
    tick(D3);
    const r = await w.admin.call('POST', `/api/stock/${w.items.osh}/count`, { countedQty: 0 });
    expect(r.status, err(r)).toBe(201);
    expect.soft(r.body, 'the COUNT entry').toMatchObject({ kind: 'COUNT', qty: 0, countBefore: 10, countAfter: 0 });
    expect.soft(await itemState(env, w.items.osh), 'Osh after Sanoq 0').toEqual({ stock: 0, cost: 25000 });
    const order = await openOrder(w.w1, w.nextTable(), []);
    const add = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: w.items.osh, quantity: 1 });
    expect.soft({ status: add.status, code: add.body?.error?.code }, err(add)).toEqual({ status: 409, code: 'OUT_OF_STOCK' });
    const menu = await w.w1.get('/api/menu');
    const row = menu.categories.flatMap((c: any) => c.items).find((i: any) => i.id === w.items.osh);
    expect.soft(row?.effectivelyAvailable, 'effectivelyAvailable at 0').toBe(false);
    expect.soft((await env.prisma.expense.count()) - expenseRows, 'Expense rows written').toBe(0);
  });

  it('Sanoq back to 47: the dish sells again (47 → 46 on add); no Expense and no tan narx change across the three corrections; refused: −1 and 2.5', async () => {
    tick(D3);
    const r = await w.admin.call('POST', `/api/stock/${w.items.osh}/count`, { countedQty: base });
    expect(r.status, err(r)).toBe(201);
    expect.soft(r.body, 'the COUNT entry').toMatchObject({ kind: 'COUNT', qty: base, countBefore: 0, countAfter: base });
    expect.soft(await itemState(env, w.items.osh), `Osh after Sanoq ${base}`).toEqual({ stock: base, cost: 25000 });
    const order = await openOrder(w.w1, w.nextTable(), []);
    const add = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: w.items.osh, quantity: 1 });
    expect.soft(add.status, err(add)).toBe(201);
    expect.soft(await stockOf(w.items.osh), 'Osh after the add').toBe(base - 1);
    await w.w1.post(`/api/orders/${order}/cancel`, { reason: 'Sinov' });
    expect.soft(await stockOf(w.items.osh), 'Osh after the cancel').toBe(base);
    const negative = await w.admin.call('POST', `/api/stock/${w.items.osh}/count`, { countedQty: -1 });
    const fractional = await w.admin.call('POST', `/api/stock/${w.items.osh}/count`, { countedQty: 2.5 });
    expect.soft({ negative: negative.status, fractional: fractional.status }, `${err(negative)} | ${err(fractional)}`).toEqual({ negative: 400, fractional: 400 });
    expect.soft(await stockOf(w.items.osh), 'Osh after the refused Sanoqs').toBe(base);
    expect.soft((await env.prisma.expense.count()) - expenseRows, 'Expense rows written by three Sanoqs').toBe(0);
    expect.soft((await env.prisma.auditLog.count({ where: { action: 'ITEM_COST_CHANGED', entityId: w.items.osh } })) - costAudits, 'tan narx audit rows written by Sanoq').toBe(0);
    const counts = await env.prisma.stockEntry.findMany({ where: { menuItemId: w.items.osh, kind: 'COUNT' }, orderBy: { occurredAt: 'asc' } });
    expect.soft(counts.map((c) => [c.countBefore, c.countAfter]), 'COUNT journal for Osh').toEqual([[null, 50], [base, 10], [10, 0], [0, base]]);
  });
});

// ═══ 8. Who sees the tan narx ═════════════════════════════════════════════

describe('8. Who sees the tan narx — WAITER must never receive costPrice / cogs / cogsSnapshot / profit', () => {
  const SECRET = new Set(['costPrice', 'cogs', 'cogsSnapshot', 'profit']);
  let order: string;
  let lineId: string;

  it('setup: Aziz opens an order with Osh ×1 (tan narx 25 000) and Choy ×1 (1 000)', async () => {
    tick(D3);
    order = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1], [w.items.choy, 1]]);
    lineId = (await liveLine(order, w.items.osh)).id;
  });

  it('WAITER GET /api/menu: 200 and no cost key', async () => {
    const r = await w.w1.call('GET', '/api/menu');
    expect({ status: r.status, leaks: setKeys(r.body, SECRET) }).toEqual({ status: 200, leaks: [] });
  });

  it('WAITER GET /api/menu/combos: 200 and no cost key', async () => {
    const r = await w.w1.call('GET', '/api/menu/combos');
    expect({ status: r.status, leaks: setKeys(r.body, SECRET) }).toEqual({ status: 200, leaks: [] });
  });

  it('WAITER GET /api/menu/items: 403', async () => {
    const r = await w.w1.call('GET', '/api/menu/items');
    expect({ status: r.status, leaks: setKeys(r.body, SECRET) }, err(r)).toEqual({ status: 403, leaks: [] });
  });

  it('WAITER GET /api/stock and GET /api/stock/:id/entries: 403', async () => {
    const list = await w.w1.call('GET', '/api/stock');
    const entries = await w.w1.call('GET', `/api/stock/${w.items.osh}/entries`);
    expect({ list: list.status, entries: entries.status, leaks: setKeys([list.body, entries.body], SECRET) }).toEqual({ list: 403, entries: 403, leaks: [] });
  });

  it('WAITER POST /api/stock/:id/restock and /count: 403 and nothing written', async () => {
    const before = await itemState(env, w.items.osh);
    const entries = await env.prisma.stockEntry.count();
    const restock = await w.w1.call('POST', `/api/stock/${w.items.osh}/restock`, { qty: 10, paidUzs: 100000, setCostFromPaid: true });
    const count = await w.w1.call('POST', `/api/stock/${w.items.osh}/count`, { countedQty: 999 });
    expect.soft({ restock: restock.status, count: count.status }, `${err(restock)} | ${err(count)}`).toEqual({ restock: 403, count: 403 });
    expect.soft(await itemState(env, w.items.osh), 'Osh untouched').toEqual(before);
    expect.soft((await env.prisma.stockEntry.count()) - entries, 'entries written').toBe(0);
  });

  it('[issue 32] WAITER GET /api/orders/:id carries no tan narx and no food cost', async () => {
    const r = await w.w1.call('GET', `/api/orders/${order}`);
    expect({ status: r.status, leaks: setKeys(r.body, SECRET) }).toEqual({ status: 200, leaks: [] });
  });

  it('[issue 32] WAITER GET /api/orders (the list) carries none', async () => {
    const r = await w.w1.call('GET', '/api/orders');
    const mine = (r.body as any[]).filter((o) => o.id === order);
    expect({ status: r.status, leaks: setKeys(mine, SECRET) }).toEqual({ status: 200, leaks: [] });
  });

  it('[issue 32] WAITER responses of POST items (first add and merge), PATCH quantity and POST send carry none', async () => {
    tick(D3);
    const first = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: w.items.somsa, quantity: 1 });
    const merge = await w.w1.call('POST', `/api/orders/${order}/items`, { menuItemId: w.items.somsa, quantity: 1 });
    const qty = await w.w1.call('PATCH', `/api/orders/${order}/lines/${lineId}/quantity`, { quantity: 2 });
    const send = await w.w1.call('POST', `/api/orders/${order}/send`);
    expect.soft({ first: first.status, merge: merge.status, qty: qty.status, send: send.status }, `${err(first)} | ${err(merge)} | ${err(qty)} | ${err(send)}`).toEqual({ first: 201, merge: 201, qty: 200, send: 200 });
    expect({
      first: setKeys(first.body, SECRET),
      merge: setKeys(merge.body, SECRET),
      qty: setKeys(qty.body, SECRET),
      send: setKeys(send.body, SECRET),
    }).toEqual({ first: [], merge: [], qty: [], send: [] });
  });

  it('WAITER GET /api/me/today-stats, /api/me/range-stats, /api/auth/me, /api/tables: 200 and no cost key', async () => {
    const paths = ['/api/me/today-stats', `/api/me/range-stats?from=${D1}&to=${D3}`, '/api/auth/me', '/api/tables'];
    const results: Record<string, { status: number; leaks: string[] }> = {};
    for (const path of paths) {
      const r = await w.w1.call('GET', path);
      results[path] = { status: r.status, leaks: setKeys(r.body, SECRET) };
    }
    expect(results).toEqual(Object.fromEntries(paths.map((p) => [p, { status: 200, leaks: [] }])));
  });

  it('WAITER GET /api/finance/daily, /api/reports/daily, /api/expenses, /api/audit, /api/users: 403', async () => {
    const paths = [`/api/finance/daily?date=${D3}`, `/api/reports/daily?date=${D3}`, `/api/expenses?date=${D3}`, '/api/audit', '/api/users'];
    const results: Record<string, { status: number; leaks: string[] }> = {};
    for (const path of paths) {
      const r = await w.w1.call('GET', path);
      results[path] = { status: r.status, leaks: setKeys(r.body, SECRET) };
    }
    expect(results).toEqual(Object.fromEntries(paths.map((p) => [p, { status: 403, leaks: [] }])));
  });

  it('ADMIN and OWNER GET /api/menu/items show the tan narx: Osh 25 000', async () => {
    const admin = (await w.admin.get('/api/menu/items')).find((i: any) => i.id === w.items.osh);
    const owner = (await w.owner.get('/api/menu/items')).find((i: any) => i.id === w.items.osh);
    expect({ admin: Number(admin?.costPrice), owner: Number(owner?.costPrice) }).toEqual({ admin: 25000, owner: 25000 });
  });

  it('ADMIN GET /api/finance/daily shows cogs and profit (D18 — allowed), and GET /api/stock the tan narx', async () => {
    const d = await daily(D1);
    const stock = (await w.admin.get('/api/stock')).find((i: any) => i.id === w.items.osh);
    // D1 closed three bills: 115 000 (cogs 51 000), 90 000 (50 000) and block 6's 45 000 (25 000):
    // cogs 126 000, revenue 250 000, operating 0 → profit 124 000
    expect({ cogs: n(d.pnl.cogs), profit: n(d.pnl.profit), stockCost: stock?.costPrice }).toEqual({ cogs: 126000, profit: 124000, stockCost: '25000' });
  });

  it('cleanup: the order is cancelled and its portions come back', async () => {
    tick(D3);
    const before = await stockOf(w.items.osh);
    const r = await w.w1.call('POST', `/api/orders/${order}/cancel`, { reason: 'Sinov tugadi' });
    expect(r.status, err(r)).toBe(200);
    expect(await stockOf(w.items.osh), 'Osh count: 2 portions back').toBe(before! + 2);
  });
});
