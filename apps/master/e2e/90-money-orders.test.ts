/* eslint-disable @typescript-eslint/no-explicit-any */
// Order lifecycle and bill math, walked end to end over HTTP with a hand model
// beside every figure. Every expectation is the hand model, never the app's own
// answer; where the two disagree the test fails and the report classifies it.
//
// Round numbers from buildWorld: Osh 45 000 (counted, tan narx 25 000, 50 in
// stock), Somsa 8 000 (counted, tan narx 4 000, 100), Achichuk 20 000 and Non
// 3 000 (uncounted, no tan narx), Choy 5 000 (uncounted, tan narx 1 000),
// Xizmat haqi 5 000 (SERVICE — the waiter's pay, never discounted).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Api,
  boot,
  buildWorld,
  capturePrints,
  itemState,
  n,
  openOrder,
  sendOrder,
  setClock,
  type Bill,
  type Env,
  type World,
} from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

const STALE_REASON = 'Avtomatik bekor qilindi: 12 soat yuborilmadi';
const HOUR = 60 * 60 * 1000;

// Orders other sections reuse.
let comboOrderId: string; // section 2 builds it, section 7 cancels it from DRAFT
let closedCashOrder: string; // section 4's Naqd bill, section 7 tries to cancel it
let debtOrderId: string; // section 4's Naqd + Nasiya bill, section 10 reads its shape
let debtConfirmResponse: any;

beforeAll(async () => {
  env = await boot('money-orders');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

// ─── helpers ──────────────────────────────────────────────────────────────

const confirmPath = (id: string) => `/api/orders/${id}/confirm`;

async function sentOrder(waiter: Api, lines: Array<[string, number]>): Promise<string> {
  const id = await openOrder(waiter, w.nextTable(), lines);
  await sendOrder(waiter, id);
  return id;
}

/** The frozen bill: the four snapshots and the status. */
function figures(o: any) {
  return {
    status: o.status,
    subtotal: o.subtotalSnapshot,
    discount: o.discountAmountSnapshot,
    service: o.serviceChargeSnapshot,
    total: o.totalSnapshot,
  };
}

/** Tan narx booked on the bill's live lines. It never leaves the server (issue 32), so it is read from the rows. */
async function cogsOf(id: string): Promise<number> {
  const rows = await env.prisma.orderLine.findMany({ where: { orderId: id, isCanceled: false }, select: { cogsSnapshot: true } });
  return rows.reduce((s, r) => s + n(r.cogsSnapshot ?? 0), 0);
}

/**
 * What an unconfirmed order adds up to. Before Tasdiqlash the API carries only
 * `totalAmount` (food + xizmat); the food/service split is rebuilt here from
 * its live lines, the way both waiter apps do it.
 */
function draftMath(o: any) {
  const live = (o.lines ?? []).filter((l: any) => !l.isCanceled);
  const sum = (kind: string) =>
    live.filter((l: any) => l.menuItemKind === kind).reduce((s: number, l: any) => s + l.price * l.quantity, 0);
  return { lines: live.length, food: sum('FOOD'), service: sum('SERVICE'), total: o.totalAmount };
}

async function paymentRows(id: string) {
  const rows = await env.prisma.payment.findMany({ where: { orderId: id }, orderBy: { createdAt: 'asc' } });
  return rows.map((r) => ({ method: r.method, amount: n(r.amount) }));
}

const err = (r: { status: number; body: any }) => ({ status: r.status, code: r.body?.error?.code ?? null });
const errText = (r: { body: any }) => JSON.stringify(r.body?.error ?? '');

/** An observation the brief asked to record rather than judge. Printed only with E2E_DEBUG=1 (capturePrints swallows console.log otherwise). */
const record = (what: string, value: unknown) => console.log(`[money-orders] ${what}: ${JSON.stringify(value)}`);

/**
 * The printed slip against the API's frozen bill. Hand model of a receipt:
 * the item lines add up to Jami, Jami − Chegirma is Umumiy, and Umumiy is
 * what was charged. Soft, so every mismatch on one slip is reported.
 */
function receiptAddsUp(label: string, orderId: string, api: any): Bill {
  const bill = printer.billFor(orderId);
  const printed = bill.lines.map((l) => `${l.name} ${l.qty}×${l.unit}=${l.amount}`).join(', ');
  const linesSum = bill.lines.reduce((s, l) => s + l.amount, 0);
  expect.soft(bill.jami, `${label}: Jami printed ${bill.jami}; Σ printed lines ${linesSum} (${printed})`).toBe(linesSum);
  expect.soft(
    bill.jami - bill.chegirma,
    `${label}: Jami ${bill.jami} − Chegirma ${bill.chegirma} = ${bill.jami - bill.chegirma}; Umumiy printed ${bill.umumiy}`,
  ).toBe(bill.umumiy);
  expect.soft(bill.umumiy, `${label}: Umumiy printed ${bill.umumiy}; API totalSnapshot ${api.totalSnapshot}`).toBe(api.totalSnapshot);
  expect.soft(
    bill.chegirma,
    `${label}: Chegirma printed ${bill.chegirma}; API discountAmountSnapshot ${api.discountAmountSnapshot}`,
  ).toBe(api.discountAmountSnapshot);
  const apiLines = api.lines
    .filter((l: any) => !l.isCanceled)
    .map((l: any) => ({ name: l.nameSnapshot, qty: l.quantity, amount: l.price * l.quantity }));
  expect.soft(
    bill.lines.map((l) => ({ name: l.name, qty: l.qty, amount: l.amount })),
    `${label}: printed item lines vs the API's live lines`,
  ).toEqual(apiLines);
  return bill;
}

const MONEY_KEYS = new Set([
  'amount',
  'price',
  'costPrice',
  'unitPriceSnapshot',
  'cogsSnapshot',
  'subtotalSnapshot',
  'discountAmountSnapshot',
  'serviceChargeSnapshot',
  'totalSnapshot',
  'totalAmount',
  'originalAmount',
  'remainingAmount',
  'value',
]);

function moneyFields(node: unknown, path = ''): Array<[string, unknown]> {
  if (Array.isArray(node)) return node.flatMap((v, i) => moneyFields(v, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => {
      const p = path ? `${path}.${k}` : k;
      if (MONEY_KEYS.has(k)) return v === null ? [] : [[p, v] as [string, unknown]];
      return moneyFields(v, p);
    });
  }
  return [];
}

/** Money fields that are not whole-number JSON numbers, as `path=value`. */
function notWholeNumbers(node: unknown): string[] {
  return moneyFields(node)
    .filter(([, v]) => !(typeof v === 'number' && Number.isInteger(v)))
    .map(([p, v]) => `${p}=${JSON.stringify(v)}`);
}

// ─── 1 + 3. Draft, edits, send, edits after send, confirm, receipt ─────────

describe('1. Draft — Aziz builds one bill line by line (Stol 13 at the end)', () => {
  let id: string;
  const line: Record<string, string> = {};
  let freshTable: string;
  let confirmed: any;
  let firstSlip: Bill;

  it('POST /api/orders: a new order is DRAFT, no lines, nothing owed, nothing frozen', async () => {
    const o = await w.w1.post('/api/orders', { orderType: 'DINE_IN', tableId: w.nextTable() });
    id = o.id;
    expect.soft(o.status, 'status').toBe('DRAFT');
    expect.soft(o.totalAmount, 'totalAmount').toBe(0);
    expect.soft(o.totalSnapshot, 'totalSnapshot').toBeNull();
  });

  it('POST /:id/items Osh ×2: food 90 000; Osh count −2', async () => {
    const before = await itemState(env, w.items.osh);
    const l = await w.w1.post(`/api/orders/${id}/items`, { menuItemId: w.items.osh, quantity: 2 });
    line.osh = l.id;
    const o = await w.admin.get(`/api/orders/${id}`);
    // Osh 45 000 × 2 = 90 000
    expect.soft(draftMath(o), 'after Osh ×2').toEqual({ lines: 1, food: 90_000, service: 0, total: 90_000 });
    expect.soft((await itemState(env, w.items.osh)).stock, `Osh count (was ${before.stock})`).toBe(n(before.stock) - 2);
  });

  it('POST /:id/items Somsa ×3: food 114 000; Somsa count −3', async () => {
    const before = await itemState(env, w.items.somsa);
    const l = await w.w1.post(`/api/orders/${id}/items`, { menuItemId: w.items.somsa, quantity: 3 });
    line.somsa = l.id;
    const o = await w.admin.get(`/api/orders/${id}`);
    // 90 000 + Somsa 8 000 × 3 = 24 000 → 114 000
    expect.soft(draftMath(o), 'after Somsa ×3').toEqual({ lines: 2, food: 114_000, service: 0, total: 114_000 });
    expect.soft((await itemState(env, w.items.somsa)).stock, `Somsa count (was ${before.stock})`).toBe(n(before.stock) - 3);
  });

  it('POST /:id/items Choy ×2 (uncounted): food 124 000; no count to move', async () => {
    const l = await w.w1.post(`/api/orders/${id}/items`, { menuItemId: w.items.choy, quantity: 2 });
    line.choy = l.id;
    const o = await w.admin.get(`/api/orders/${id}`);
    // 114 000 + Choy 5 000 × 2 = 10 000 → 124 000
    expect.soft(draftMath(o), 'after Choy ×2').toEqual({ lines: 3, food: 124_000, service: 0, total: 124_000 });
    expect.soft((await itemState(env, w.items.choy)).stock, 'Choy is uncounted').toBeNull();
  });

  it('POST /:id/items Xizmat haqi ×2 (SERVICE): food 124 000 + xizmat 10 000 = 134 000', async () => {
    const l = await w.w1.post(`/api/orders/${id}/items`, { menuItemId: w.items.xizmat, quantity: 2 });
    line.xizmat = l.id;
    const o = await w.admin.get(`/api/orders/${id}`);
    // Xizmat haqi 5 000 × 2 = 10 000 → total 134 000
    expect.soft(draftMath(o), 'after Xizmat haqi ×2').toEqual({ lines: 4, food: 124_000, service: 10_000, total: 134_000 });
  });

  it('PATCH /:id/lines/:lineId/quantity Osh 2 → 4: food 214 000; Osh count −2', async () => {
    const before = await itemState(env, w.items.osh);
    await w.w1.patch(`/api/orders/${id}/lines/${line.osh}/quantity`, { quantity: 4 });
    const o = await w.admin.get(`/api/orders/${id}`);
    // Osh 45 000 × 4 = 180 000; Somsa 24 000; Choy 10 000 → food 214 000; xizmat 10 000 → 224 000
    expect.soft(draftMath(o), 'after Osh → 4').toEqual({ lines: 4, food: 214_000, service: 10_000, total: 224_000 });
    expect.soft((await itemState(env, w.items.osh)).stock, `Osh count (was ${before.stock})`).toBe(n(before.stock) - 2);
  });

  it('PATCH /:id/lines/:lineId/quantity Osh 4 → 3: food 169 000; Osh count +1', async () => {
    const before = await itemState(env, w.items.osh);
    await w.w1.patch(`/api/orders/${id}/lines/${line.osh}/quantity`, { quantity: 3 });
    const o = await w.admin.get(`/api/orders/${id}`);
    // Osh 45 000 × 3 = 135 000; Somsa 24 000; Choy 10 000 → food 169 000; xizmat 10 000 → 179 000
    expect.soft(draftMath(o), 'after Osh → 3').toEqual({ lines: 4, food: 169_000, service: 10_000, total: 179_000 });
    expect.soft((await itemState(env, w.items.osh)).stock, `Osh count (was ${before.stock})`).toBe(n(before.stock) + 1);
  });

  it('POST /:id/lines/:lineId/cancel Somsa: food 145 000; Somsa count +3', async () => {
    const before = await itemState(env, w.items.somsa);
    const r = await w.w1.post(`/api/orders/${id}/lines/${line.somsa}/cancel`, { reason: "Mijoz fikrini o'zgartirdi" });
    const o = await w.admin.get(`/api/orders/${id}`);
    // 169 000 − Somsa 24 000 = 145 000; xizmat 10 000 → 155 000
    expect.soft({ isCanceled: r.isCanceled, reason: r.canceledReason }, 'cancelled line').toEqual({
      isCanceled: true,
      reason: "Mijoz fikrini o'zgartirdi",
    });
    expect.soft(draftMath(o), 'after cancelling Somsa').toEqual({ lines: 3, food: 145_000, service: 10_000, total: 155_000 });
    expect.soft((await itemState(env, w.items.somsa)).stock, `Somsa count (was ${before.stock})`).toBe(n(before.stock) + 3);
  });

  it('PATCH /:id/lines/:lineId/notes on Choy: the note lands, no figure moves', async () => {
    const r = await w.w1.patch(`/api/orders/${id}/lines/${line.choy}/notes`, { notes: 'Shakarsiz' });
    const o = await w.admin.get(`/api/orders/${id}`);
    expect.soft(r.notes, 'note').toBe('Shakarsiz');
    expect.soft(draftMath(o), 'after the note').toEqual({ lines: 3, food: 145_000, service: 10_000, total: 155_000 });
  });

  it('POST /:id/transfer to a free table: the table changes, no figure moves', async () => {
    freshTable = (await w.admin.post('/api/tables', { name: 'Stol 13', type: 'TABLE' })).id;
    const moved = await w.w1.post(`/api/orders/${id}/transfer`, { tableId: freshTable });
    const o = await w.admin.get(`/api/orders/${id}`);
    expect.soft(moved.tableId, 'transfer response tableId').toBe(freshTable);
    expect.soft(o.tableId, 'GET tableId').toBe(freshTable);
    expect.soft(draftMath(o), 'after the transfer').toEqual({ lines: 3, food: 145_000, service: 10_000, total: 155_000 });
  });

  it('POST /:id/send: SENT, sentAt stamped, no figure moves, nothing frozen yet', async () => {
    const sent = await w.w1.post(`/api/orders/${id}/send`);
    const o = await w.admin.get(`/api/orders/${id}`);
    expect.soft(sent.status, 'send response status').toBe('SENT');
    expect.soft(typeof o.sentAt, 'sentAt').toBe('string');
    expect.soft(draftMath(o), 'after send').toEqual({ lines: 3, food: 145_000, service: 10_000, total: 155_000 });
    expect.soft(o.totalSnapshot, 'totalSnapshot (frozen only at Tasdiqlash)').toBeNull();
  });

  it('after send, POST /:id/items Non ×1 is still accepted (DRAFT and SENT are both editable): 158 000', async () => {
    const r = await w.w1.call('POST', `/api/orders/${id}/items`, { menuItemId: w.items.non, quantity: 1 });
    line.non = r.body?.id;
    const o = await w.admin.get(`/api/orders/${id}`);
    // 145 000 + Non 3 000 = 148 000; xizmat 10 000 → 158 000
    expect.soft(r.status, `add after send answered ${r.status} ${errText(r)}`).toBe(201);
    expect.soft(draftMath(o), 'after Non ×1 on a SENT order').toEqual({ lines: 4, food: 148_000, service: 10_000, total: 158_000 });
  });

  it('after send, POST /:id/lines/:lineId/cancel Non is accepted too: back to 155 000', async () => {
    const r = await w.w1.call('POST', `/api/orders/${id}/lines/${line.non}/cancel`, { reason: 'Non tugadi' });
    const o = await w.admin.get(`/api/orders/${id}`);
    expect.soft(r.status, `cancel line after send answered ${r.status} ${errText(r)}`).toBe(200);
    expect.soft(draftMath(o), 'after cancelling Non').toEqual({ lines: 3, food: 145_000, service: 10_000, total: 155_000 });
  });

  it('POST /:id/confirm CASH 155 000: frozen as food 145 000, chegirma 0, xizmat 10 000, total 155 000; tan narx 77 000', async () => {
    const r = await w.admin.call('POST', confirmPath(id), { payments: [{ method: 'CASH', amount: 155_000 }] });
    expect(r.status, `confirm answered ${r.status} ${errText(r)}`).toBe(200);
    confirmed = r.body;
    const got = await w.admin.get(`/api/orders/${id}`);
    // Osh 45 000 × 3 = 135 000; Choy 5 000 × 2 = 10 000 → food 145 000; chegirma 0;
    // Xizmat haqi 5 000 × 2 = 10 000 → total 155 000.
    // Tan narx: Osh 25 000 × 3 = 75 000; Choy 1 000 × 2 = 2 000 → 77 000 (the cancelled Somsa and Non lines count for nothing)
    const expected = { status: 'CLOSED', subtotal: 145_000, discount: 0, service: 10_000, total: 155_000 };
    expect.soft(figures(r.body), 'confirm response').toEqual(expected);
    expect.soft(figures(got), 'GET after confirm').toEqual(expected);
    expect.soft(await cogsOf(id), 'tan narx on the live lines (Osh 3 × 25 000 + Choy 2 × 1 000)').toBe(77_000);
    expect.soft(await paymentRows(id), 'Payment rows').toEqual([{ method: 'CASH', amount: 155_000 }]);
    expect.soft(r.body.billPrinted, 'billPrinted').toBe(true);
  });

  it('[issue 1] the printed slip adds up: Osh 135 000 + Choy 10 000 + Xizmat haqi 10 000 = Jami 155 000, Umumiy 155 000', () => {
    firstSlip = receiptAddsUp('walkthrough bill', id, confirmed);
  });

  it('POST /:id/reprint-bill prints the very same lines and figures', async () => {
    const r = await w.admin.call('POST', `/api/orders/${id}/reprint-bill`, { reason: "Mijoz nusxa so'radi" });
    expect(r.status, `reprint answered ${r.status} ${errText(r)}`).toBe(200);
    const again = printer.billFor(id);
    const slips = printer.prints.filter((p) => p.orderId === id).map((p) => p.label.split(' ')[0]);
    expect.soft(slips, 'slips printed for this order').toEqual(['[print-linux-stub]', '[print-linux-stub]']);
    expect.soft(printer.prints.filter((p) => p.orderId === id).at(-1)?.label, 'last slip is the reprint').toContain('BILL_REPRINT');
    expect.soft(
      { lines: again.lines, jami: again.jami, chegirma: again.chegirma, umumiy: again.umumiy },
      'reprint vs first slip',
    ).toEqual({ lines: firstSlip.lines, jami: firstSlip.jami, chegirma: firstSlip.chegirma, umumiy: firstSlip.umumiy });
  });

  it('after CLOSED, POST /:id/items is refused and the frozen bill does not move', async () => {
    const r = await w.admin.call('POST', `/api/orders/${id}/items`, { menuItemId: w.items.non, quantity: 1 });
    const got = await w.admin.get(`/api/orders/${id}`);
    expect.soft(err(r), `add to a CLOSED bill: ${errText(r)}`).toEqual({ status: 409, code: 'ILLEGAL_STATE' });
    expect.soft(figures(got).total, 'total after the refused add').toBe(155_000);
  });
});

// ─── 2. Combo ─────────────────────────────────────────────────────────────

describe('2. Kombo — Osh + Choy', () => {
  let comboId: string;

  it('POST /api/menu/combos: created from two components; its price is their sum, 50 000', async () => {
    const r = await w.admin.call('POST', '/api/menu/combos', {
      name: 'Osh + Choy',
      components: [
        { menuItemId: w.items.osh, quantity: 1 },
        { menuItemId: w.items.choy, quantity: 1 },
      ],
    });
    expect(r.status, `create combo answered ${r.status} ${errText(r)}`).toBe(201);
    comboId = r.body.id;
    // Osh 45 000 × 1 + Choy 5 000 × 1 = 50 000 — a combo carries no price of its own
    const sum = r.body.components.reduce((s: number, c: any) => s + n(c.menuItem.price) * c.quantity, 0);
    expect.soft(r.body.components.length, 'components').toBe(2);
    expect.soft(sum, 'Σ component prices').toBe(50_000);
  });

  it('POST /:id/combos: one line per component in one group; 50 000 on the bill; Osh count −1', async () => {
    comboOrderId = (await w.w2.post('/api/orders', { orderType: 'DINE_IN', tableId: w.nextTable() })).id;
    const before = await itemState(env, w.items.osh);
    const r = await w.w2.call('POST', `/api/orders/${comboOrderId}/combos`, { comboId });
    expect(r.status, `add combo answered ${r.status} ${errText(r)}`).toBe(201);
    const o = await w.admin.get(`/api/orders/${comboOrderId}`);
    expect.soft(r.body.length, 'lines created').toBe(2);
    expect.soft(new Set(r.body.map((l: any) => l.comboGroupId)).size, 'one combo group').toBe(1);
    expect.soft(
      r.body.map((l: any) => [l.nameSnapshot, n(l.unitPriceSnapshot), l.quantity, l.comboNameSnapshot]),
      'component lines',
    ).toEqual([
      ['Osh', 45_000, 1, 'Osh + Choy'],
      ['Choy', 5_000, 1, 'Osh + Choy'],
    ]);
    expect.soft(draftMath(o), 'order after the combo').toEqual({ lines: 2, food: 50_000, service: 0, total: 50_000 });
    expect.soft((await itemState(env, w.items.osh)).stock, `Osh count (was ${before.stock})`).toBe(n(before.stock) - 1);
  });
});

// ─── 4. Confirm variants ──────────────────────────────────────────────────

describe('4. Tasdiqlash — payment variants, each a fresh bill', () => {
  type Variant = {
    key: string;
    name: string;
    lines: Array<[string, number]>;
    body: Record<string, unknown>;
    expected: { subtotal: number; discount: number; service: number; total: number };
    cogs: number;
    payments: Array<{ method: string; amount: number }>;
    debt?: { debtorName: string; originalAmount: number; remainingAmount: number; status: string };
  };

  const variants: Variant[] = [
    {
      key: 'cash',
      name: 'Naqd',
      // Osh 45 000 × 2 = 90 000 → CASH 90 000; tan narx 25 000 × 2 = 50 000
      lines: [[() => w.items.osh, 2]] as any,
      body: { payments: [{ method: 'CASH', amount: 90_000 }] },
      expected: { subtotal: 90_000, discount: 0, service: 0, total: 90_000 },
      cogs: 50_000,
      payments: [{ method: 'CASH', amount: 90_000 }],
    },
    {
      key: 'card',
      name: 'Karta',
      // Somsa 8 000 × 5 = 40 000 → CARD 40 000; tan narx 4 000 × 5 = 20 000
      lines: [[() => w.items.somsa, 5]] as any,
      body: { payments: [{ method: 'CARD', amount: 40_000 }] },
      expected: { subtotal: 40_000, discount: 0, service: 0, total: 40_000 },
      cogs: 20_000,
      payments: [{ method: 'CARD', amount: 40_000 }],
    },
    {
      key: 'cashCard',
      name: 'Naqd + Karta',
      // Osh 45 000 × 2 = 90 000; Achichuk 20 000 → 110 000 → CASH 60 000 + CARD 50 000; tan narx 50 000 (Achichuk has none)
      lines: [[() => w.items.osh, 2], [() => w.items.salat, 1]] as any,
      body: { payments: [{ method: 'CASH', amount: 60_000 }, { method: 'CARD', amount: 50_000 }] },
      expected: { subtotal: 110_000, discount: 0, service: 0, total: 110_000 },
      cogs: 50_000,
      payments: [{ method: 'CASH', amount: 60_000 }, { method: 'CARD', amount: 50_000 }],
    },
    {
      key: 'cashDebt',
      name: 'Naqd + Nasiya',
      // Osh 45 000 × 2 = 90 000; Xizmat haqi 5 000 × 2 = 10 000 → 100 000 → CASH 40 000 + DEBT 60 000 (Karim aka); tan narx 50 000
      lines: [[() => w.items.osh, 2], [() => w.items.xizmat, 2]] as any,
      body: {
        payments: [{ method: 'CASH', amount: 40_000 }, { method: 'DEBT', amount: 60_000 }],
        debt: { debtorName: 'Karim aka' },
      },
      expected: { subtotal: 90_000, discount: 0, service: 10_000, total: 100_000 },
      cogs: 50_000,
      payments: [{ method: 'CASH', amount: 40_000 }, { method: 'DEBT', amount: 60_000 }],
      debt: { debtorName: 'Karim aka', originalAmount: 60_000, remainingAmount: 60_000, status: 'OPEN' },
    },
    {
      key: 'debt',
      name: 'Nasiya',
      // Osh 45 000 → DEBT 45 000 (Olim aka); tan narx 25 000
      lines: [[() => w.items.osh, 1]] as any,
      body: { payments: [{ method: 'DEBT', amount: 45_000 }], debt: { debtorName: 'Olim aka' } },
      expected: { subtotal: 45_000, discount: 0, service: 0, total: 45_000 },
      cogs: 25_000,
      payments: [{ method: 'DEBT', amount: 45_000 }],
      debt: { debtorName: 'Olim aka', originalAmount: 45_000, remainingAmount: 45_000, status: 'OPEN' },
    },
  ];

  for (const v of variants) {
    let id: string;
    let got: any;

    it(`${v.name}: confirm freezes ${v.expected.total} and writes ${v.payments.length} Payment row(s)`, async () => {
      const lines = (v.lines as unknown as Array<[() => string, number]>).map(([f, q]) => [f(), q] as [string, number]);
      id = await sentOrder(w.w1, lines);
      const r = await w.admin.call('POST', confirmPath(id), v.body);
      expect(r.status, `${v.name} confirm answered ${r.status} ${errText(r)}`).toBe(200);
      got = await w.admin.get(`/api/orders/${id}`);
      if (v.key === 'cash') closedCashOrder = id;
      if (v.key === 'cashDebt') {
        debtOrderId = id;
        debtConfirmResponse = r.body;
      }
      const expected = { status: 'CLOSED', ...v.expected };
      expect.soft(figures(r.body), `${v.name}: confirm response`).toEqual(expected);
      expect.soft(figures(got), `${v.name}: GET after confirm`).toEqual(expected);
      expect.soft(await cogsOf(id), `${v.name}: tan narx on the live lines`).toBe(v.cogs);
      expect.soft(await paymentRows(id), `${v.name}: Payment rows`).toEqual(v.payments);
      expect.soft(r.body.billPrinted, `${v.name}: billPrinted`).toBe(true);
      if (v.debt) {
        expect.soft(
          got.debt && {
            debtorName: got.debt.debtorName,
            originalAmount: got.debt.originalAmount,
            remainingAmount: got.debt.remainingAmount,
            status: got.debt.status,
          },
          `${v.name}: debt on the bill`,
        ).toEqual(v.debt);
      } else {
        expect.soft(got.debt, `${v.name}: no debt`).toBeNull();
      }
    });

    const hasService = v.expected.service > 0;
    it(`${hasService ? '[issue 1] ' : ''}${v.name}: the printed slip matches the frozen bill`, () => {
      receiptAddsUp(v.name, id, got);
    });
  }
});

// ─── 5. Discounts ─────────────────────────────────────────────────────────

describe('5. Chegirma', () => {
  let serviceDiscountOrder: string;
  let serviceDiscountBill: any;

  it('ad-hoc 5 000 under the food: Osh ×2 + Xizmat haqi ×1 → 90 000 − 5 000 + 5 000 = 90 000', async () => {
    serviceDiscountOrder = await sentOrder(w.w1, [[w.items.osh, 2], [w.items.xizmat, 1]]);
    const r = await w.admin.call('POST', confirmPath(serviceDiscountOrder), {
      discountAmount: 5_000,
      payments: [{ method: 'CASH', amount: 90_000 }],
    });
    expect(r.status, `confirm answered ${r.status} ${errText(r)}`).toBe(200);
    serviceDiscountBill = r.body;
    const got = await w.admin.get(`/api/orders/${serviceDiscountOrder}`);
    // Osh 45 000 × 2 = 90 000; chegirma 5 000 → 85 000; Xizmat haqi 5 000 → total 90 000; tan narx 50 000
    const expected = { status: 'CLOSED', subtotal: 90_000, discount: 5_000, service: 5_000, total: 90_000 };
    expect.soft(figures(r.body), 'confirm response').toEqual(expected);
    expect.soft(figures(got), 'GET after confirm').toEqual(expected);
    expect.soft(await cogsOf(serviceDiscountOrder), 'tan narx on the live lines').toBe(50_000);
    expect.soft(await paymentRows(serviceDiscountOrder), 'Payment rows').toEqual([{ method: 'CASH', amount: 90_000 }]);
  });

  it('[issue 1 / P3 T12] the slip of a bill with a service line and a discount: lines 95 000 = Jami; Jami − 5 000 = Umumiy 90 000', () => {
    receiptAddsUp('xizmat + chegirma bill', serviceDiscountOrder, serviceDiscountBill);
  });

  it('[issue 1 / P3 T12] its reprint carries the same printed figures', async () => {
    const first = printer.billFor(serviceDiscountOrder);
    const r = await w.admin.call('POST', `/api/orders/${serviceDiscountOrder}/reprint-bill`, { reason: 'Chek yirtilgan' });
    expect(r.status, `reprint answered ${r.status} ${errText(r)}`).toBe(200);
    const again = printer.billFor(serviceDiscountOrder);
    expect.soft(
      { jami: again.jami, chegirma: again.chegirma, umumiy: again.umumiy, lines: again.lines },
      'reprint vs first slip',
    ).toEqual({ jami: first.jami, chegirma: first.chegirma, umumiy: first.umumiy, lines: first.lines });
  });

  let compedOrder: string;
  let compedBill: any;
  it('ad-hoc equal to the food (100% comped): Osh ×1 + Xizmat haqi ×1, chegirma 45 000 → the xizmat 5 000 is still owed', async () => {
    compedOrder = await sentOrder(w.w1, [[w.items.osh, 1], [w.items.xizmat, 1]]);
    const r = await w.admin.call('POST', confirmPath(compedOrder), {
      discountAmount: 45_000,
      payments: [{ method: 'CASH', amount: 5_000 }],
    });
    expect(r.status, `confirm answered ${r.status} ${errText(r)}`).toBe(200);
    compedBill = r.body;
    const got = await w.admin.get(`/api/orders/${compedOrder}`);
    // Osh 45 000; chegirma 45 000 → food 0; Xizmat haqi 5 000 → total 5 000; tan narx 25 000 (the dish was still cooked)
    const expected = { status: 'CLOSED', subtotal: 45_000, discount: 45_000, service: 5_000, total: 5_000 };
    expect.soft(figures(r.body), 'confirm response').toEqual(expected);
    expect.soft(figures(got), 'GET after confirm').toEqual(expected);
    expect.soft(await cogsOf(compedOrder), 'tan narx on the live lines').toBe(25_000);
    expect.soft(await paymentRows(compedOrder), 'Payment rows').toEqual([{ method: 'CASH', amount: 5_000 }]);
  });

  it('[issue 1] the slip of the 100% comped bill: lines 50 000 = Jami; Jami − 45 000 = Umumiy 5 000', () => {
    receiptAddsUp('100% comped + xizmat', compedOrder, compedBill);
  });

  let clampedOrder: string;
  let clampedBill: any;
  it('ad-hoc above the food: Osh ×1 with chegirma 60 000 — the design clamps it to the food (45 000), total 0, paid with a CASH leg of 0', async () => {
    clampedOrder = await sentOrder(w.w1, [[w.items.osh, 1]]);
    const r = await w.admin.call('POST', confirmPath(clampedOrder), {
      discountAmount: 60_000,
      payments: [{ method: 'CASH', amount: 0 }],
    });
    record('discount above the food (60 000 on 45 000)', { status: r.status, error: r.body?.error ?? null, discount: r.body?.discountAmountSnapshot, total: r.body?.totalSnapshot });
    // Hand model follows billing.service's documented clamp: min(60 000, 45 000) = 45 000 → total 0.
    // Recorded either way: a refusal here would also be a defensible rule.
    expect(r.status, `confirm with a discount above the food answered ${r.status} ${errText(r)}`).toBe(200);
    clampedBill = r.body;
    const got = await w.admin.get(`/api/orders/${clampedOrder}`);
    const expected = { status: 'CLOSED', subtotal: 45_000, discount: 45_000, service: 0, total: 0 };
    expect.soft(figures(r.body), 'confirm response').toEqual(expected);
    expect.soft(figures(got), 'GET after confirm').toEqual(expected);
    expect.soft(await cogsOf(clampedOrder), 'tan narx on the live lines').toBe(25_000);
    expect.soft(await paymentRows(clampedOrder), 'Payment rows').toEqual([{ method: 'CASH', amount: 0 }]);
  });

  it('the slip of the clamped bill: Osh 45 000 = Jami; Jami − 45 000 = Umumiy 0', () => {
    receiptAddsUp('clamped discount', clampedOrder, clampedBill);
  });

  it('negative, fractional and string discounts → 400 VALIDATION; the bill stays SENT with no Payment row', async () => {
    const id = await sentOrder(w.w1, [[w.items.osh, 1]]); // 45 000
    const negative = await w.admin.call('POST', confirmPath(id), { discountAmount: -5_000, payments: [{ method: 'CASH', amount: 50_000 }] });
    const fractional = await w.admin.call('POST', confirmPath(id), { discountAmount: 2_500.5, payments: [{ method: 'CASH', amount: 42_499.5 }] });
    const string = await w.admin.call('POST', confirmPath(id), { discountAmount: '5000', payments: [{ method: 'CASH', amount: 40_000 }] });
    const o = await w.admin.get(`/api/orders/${id}`);
    expect.soft(err(negative), `negative discount: ${errText(negative)}`).toEqual({ status: 400, code: 'VALIDATION' });
    expect.soft(err(fractional), `fractional discount: ${errText(fractional)}`).toEqual({ status: 400, code: 'VALIDATION' });
    expect.soft(err(string), `string discount: ${errText(string)}`).toEqual({ status: 400, code: 'VALIDATION' });
    expect.soft({ status: o.status, payments: await paymentRows(id) }, 'bill after the three refusals').toEqual({ status: 'SENT', payments: [] });
  });

  let presetOrder: string;
  let presetBill: any;
  it("preset 10 000 under Maksimal: POST /api/discounts then confirm with its id → Osh ×2 90 000 − 10 000 = 80 000, preset recorded on the bill", async () => {
    const preset = await w.admin.post('/api/discounts', { name: "O'n ming", value: 10_000 });
    presetOrder = await sentOrder(w.w1, [[w.items.osh, 2]]);
    const r = await w.admin.call('POST', confirmPath(presetOrder), { discountId: preset.id, payments: [{ method: 'CASH', amount: 80_000 }] });
    expect(r.status, `confirm with preset answered ${r.status} ${errText(r)}`).toBe(200);
    presetBill = r.body;
    const got = await w.admin.get(`/api/orders/${presetOrder}`);
    // Osh 45 000 × 2 = 90 000; preset 10 000 → total 80 000; tan narx 50 000
    const expected = { status: 'CLOSED', subtotal: 90_000, discount: 10_000, service: 0, total: 80_000 };
    expect.soft(figures(r.body), 'confirm response').toEqual(expected);
    expect.soft(figures(got), 'GET after confirm').toEqual(expected);
    expect.soft(await cogsOf(presetOrder), 'tan narx on the live lines').toBe(50_000);
    expect.soft(got.appliedDiscountId, 'appliedDiscountId').toBe(preset.id);
    expect.soft(await paymentRows(presetOrder), 'Payment rows').toEqual([{ method: 'CASH', amount: 80_000 }]);
  });

  it('the slip of the preset bill: Osh 90 000 = Jami; Jami − 10 000 = Umumiy 80 000', () => {
    receiptAddsUp('preset discount', presetOrder, presetBill);
  });

  it('a preset above Maksimal (150 000 > 100 000) cannot be created → 400 DISCOUNT_CAP_EXCEEDED', async () => {
    const r = await w.admin.call('POST', '/api/discounts', { name: 'Katta', value: 150_000 });
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'DISCOUNT_CAP_EXCEEDED' });
  });

  it('a preset that Maksimal no longer allows is refused at confirm: preset 80 000, Maksimal lowered to 50 000 → 400 DISCOUNT_CAP_EXCEEDED', async () => {
    const preset = await w.admin.post('/api/discounts', { name: 'Sakson ming', value: 80_000 });
    await w.owner.patch('/api/settings', { key: 'max_discount_amount', value: '50000' });
    const id = await sentOrder(w.w1, [[w.items.osh, 2]]); // 90 000
    let r;
    try {
      r = await w.admin.call('POST', confirmPath(id), { discountId: preset.id, payments: [{ method: 'CASH', amount: 10_000 }] });
    } finally {
      await w.owner.patch('/api/settings', { key: 'max_discount_amount', value: '100000' });
    }
    const o = await w.admin.get(`/api/orders/${id}`);
    expect.soft(err(r), `preset over the lowered cap: ${errText(r)}`).toEqual({ status: 400, code: 'DISCOUNT_CAP_EXCEEDED' });
    expect.soft({ status: o.status, payments: await paymentRows(id) }, 'bill after the refusal').toEqual({ status: 'SENT', payments: [] });
  });

  it('[issue 15 / §11 #2] ad-hoc 150 000 above Maksimal 100 000 is refused, as the setting promises', async () => {
    const id = await sentOrder(w.w1, [[w.items.osh, 4], [w.items.salat, 1]]); // 180 000 + 20 000 = 200 000
    const r = await w.admin.call('POST', confirmPath(id), { discountAmount: 150_000, payments: [{ method: 'CASH', amount: 50_000 }] });
    const o = await w.admin.get(`/api/orders/${id}`);
    const max = (await w.admin.get('/api/settings')).max_discount_amount;
    expect.soft(r.status, `Maksimal = ${max}; a typed 150 000 discount on a 200 000 bill was answered ${r.status} ${errText(r)}`).toBe(400);
    expect.soft(
      { status: o.status, discount: o.discountAmountSnapshot, payments: await paymentRows(id) },
      'the bill after the attempt',
    ).toEqual({ status: 'SENT', discount: null, payments: [] });
  });
});

// ─── 6. Payment guards ────────────────────────────────────────────────────

describe("6. To'lov qoidalari", () => {
  let guard: string; // Osh ×1 = 45 000, SENT; every refusal below must leave it SENT with no Payment row

  it('control: the guard bill is Osh ×1 = 45 000 and SENT', async () => {
    guard = await sentOrder(w.w1, [[w.items.osh, 1]]);
    const o = await w.admin.get(`/api/orders/${guard}`);
    expect({ status: o.status, total: o.totalAmount }).toEqual({ status: 'SENT', total: 45_000 });
  });

  it('Σ legs = total + 1 (45 001) → 400 PAYMENT_MISMATCH', async () => {
    const r = await w.admin.call('POST', confirmPath(guard), { payments: [{ method: 'CASH', amount: 45_001 }] });
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'PAYMENT_MISMATCH' });
  });

  it('Σ legs = total − 1 (44 999) → 400 PAYMENT_MISMATCH', async () => {
    const r = await w.admin.call('POST', confirmPath(guard), { payments: [{ method: 'CASH', amount: 44_999 }] });
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'PAYMENT_MISMATCH' });
  });

  it('two Nasiya legs (20 000 + 25 000) → 400 VALIDATION', async () => {
    const r = await w.admin.call('POST', confirmPath(guard), {
      payments: [{ method: 'DEBT', amount: 20_000 }, { method: 'DEBT', amount: 25_000 }],
      debt: { debtorName: 'Ikki qism' },
    });
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'VALIDATION' });
  });

  it('a Nasiya leg of 0 beside CASH 45 000 → 400 VALIDATION', async () => {
    const r = await w.admin.call('POST', confirmPath(guard), {
      payments: [{ method: 'DEBT', amount: 0 }, { method: 'CASH', amount: 45_000 }],
      debt: { debtorName: 'Nol qism' },
    });
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'VALIDATION' });
  });

  it('Nasiya 45 000 without a debtor → 400 DEBT_METADATA_REQUIRED', async () => {
    const r = await w.admin.call('POST', confirmPath(guard), { payments: [{ method: 'DEBT', amount: 45_000 }] });
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'DEBT_METADATA_REQUIRED' });
  });

  it('a fractional leg (45 000.5) → 400 VALIDATION', async () => {
    const r = await w.admin.call('POST', confirmPath(guard), { payments: [{ method: 'CASH', amount: 45_000.5 }] });
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'VALIDATION' });
  });

  it('a negative leg (CASH 50 000 + CARD −5 000) → 400 VALIDATION', async () => {
    const r = await w.admin.call('POST', confirmPath(guard), {
      payments: [{ method: 'CASH', amount: 50_000 }, { method: 'CARD', amount: -5_000 }],
    });
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'VALIDATION' });
  });

  it('control: after every refusal the guard bill is still SENT, unfrozen, with no Payment row and no slip', async () => {
    const o = await w.admin.get(`/api/orders/${guard}`);
    expect({
      status: o.status,
      total: o.totalSnapshot,
      payments: await paymentRows(guard),
      slips: printer.prints.filter((p) => p.orderId === guard).length,
    }).toEqual({ status: 'SENT', total: null, payments: [], slips: 0 });
  });

  it('a CASH leg of 0 beside CARD 45 000 is accepted (the ticket sends empty legs)', async () => {
    const id = await sentOrder(w.w1, [[w.items.osh, 1]]);
    const r = await w.admin.call('POST', confirmPath(id), { payments: [{ method: 'CASH', amount: 0 }, { method: 'CARD', amount: 45_000 }] });
    const rows = await paymentRows(id);
    record('Payment rows after a CASH leg of 0', rows);
    expect.soft(r.status, `confirm answered ${r.status} ${errText(r)}`).toBe(200);
    expect.soft(rows.reduce((s, p) => s + p.amount, 0), `Σ Payment rows (${JSON.stringify(rows)})`).toBe(45_000);
    expect.soft(r.body?.totalSnapshot, 'total').toBe(45_000);
  });

  it('control: a digit-string leg "45000" is accepted by the input contract and stored as 45 000', async () => {
    const id = await sentOrder(w.w1, [[w.items.osh, 1]]);
    const r = await w.admin.call('POST', confirmPath(id), { payments: [{ method: 'CASH', amount: '45000' }] });
    expect.soft(r.status, `confirm answered ${r.status} ${errText(r)}`).toBe(200);
    expect.soft(await paymentRows(id), 'Payment rows').toEqual([{ method: 'CASH', amount: 45_000 }]);
  });

  it('confirm twice: the second is refused (409 ILLEGAL_STATE) and exactly one Payment row and one slip exist', async () => {
    const id = await sentOrder(w.w1, [[w.items.osh, 1]]);
    const first = await w.admin.call('POST', confirmPath(id), { payments: [{ method: 'CASH', amount: 45_000 }] });
    const second = await w.admin.call('POST', confirmPath(id), { payments: [{ method: 'CASH', amount: 45_000 }] });
    expect.soft(first.status, `first confirm ${errText(first)}`).toBe(200);
    expect.soft(err(second), `second confirm: ${errText(second)}`).toEqual({ status: 409, code: 'ILLEGAL_STATE' });
    expect.soft(await paymentRows(id), 'Payment rows').toEqual([{ method: 'CASH', amount: 45_000 }]);
    expect.soft(printer.prints.filter((p) => p.orderId === id).length, 'slips printed').toBe(1);
  });

  it('confirm a DRAFT → 409 ILLEGAL_STATE, no Payment row, still DRAFT', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.somsa, 1]]); // 8 000, never sent
    const r = await w.admin.call('POST', confirmPath(id), { payments: [{ method: 'CASH', amount: 8_000 }] });
    const o = await w.admin.get(`/api/orders/${id}`);
    await w.w1.post(`/api/orders/${id}/cancel`, { reason: 'Sinov' }); // tidy up, so section 8's sweep finds one draft
    expect.soft(err(r), errText(r)).toEqual({ status: 409, code: 'ILLEGAL_STATE' });
    expect.soft({ status: o.status, payments: await paymentRows(id) }).toEqual({ status: 'DRAFT', payments: [] });
  });

  it('confirm as WAITER → 403 FORBIDDEN, no Payment row, still SENT', async () => {
    const id = await sentOrder(w.w1, [[w.items.osh, 1]]);
    const r = await w.w1.call('POST', confirmPath(id), { payments: [{ method: 'CASH', amount: 45_000 }] });
    const o = await w.admin.get(`/api/orders/${id}`);
    expect.soft(err(r), errText(r)).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect.soft({ status: o.status, payments: await paymentRows(id) }).toEqual({ status: 'SENT', payments: [] });
  });
});

// ─── 7. Cancel ────────────────────────────────────────────────────────────

describe('7. Bekor qilish', () => {
  it('from DRAFT (the combo order): CANCELED with its reason, Osh count +1, nothing frozen', async () => {
    const before = await itemState(env, w.items.osh);
    const r = await w.w2.call('POST', `/api/orders/${comboOrderId}/cancel`, { reason: 'Mijoz ketdi' });
    const o = await w.admin.get(`/api/orders/${comboOrderId}`);
    record('canceled-from-DRAFT order figures', { totalAmount: o.totalAmount, totalSnapshot: o.totalSnapshot, itemCount: o.itemCount });
    expect.soft(r.status, `cancel answered ${r.status} ${errText(r)}`).toBe(200);
    expect.soft({ status: o.status, reason: o.cancelReason, total: o.totalSnapshot }, `canceled order (totalAmount shows ${o.totalAmount})`).toEqual({
      status: 'CANCELED',
      reason: 'Mijoz ketdi',
      total: null,
    });
    expect.soft((await itemState(env, w.items.osh)).stock, `Osh count (was ${before.stock})`).toBe(n(before.stock) + 1);
  });

  it('without a reason → 400 VALIDATION', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.non, 1]]);
    const r = await w.w1.call('POST', `/api/orders/${id}/cancel`, {});
    expect(err(r), errText(r)).toEqual({ status: 400, code: 'VALIDATION' });
    await w.w1.post(`/api/orders/${id}/cancel`, { reason: 'Sinov' }); // tidy up
  });

  it("from SENT with a reason: CANCELED, both counted dishes back, the day's money and closed list unchanged", async () => {
    const day = env.svc.time.localDayKey();
    const id = await sentOrder(w.w1, [[w.items.osh, 2], [w.items.somsa, 2]]); // 90 000 + 16 000 = 106 000
    const osh0 = await itemState(env, w.items.osh);
    const somsa0 = await itemState(env, w.items.somsa);
    const ledger0 = await env.svc.reports.dailyLedger(day);
    const fin0 = await w.admin.get(`/api/finance/daily?date=${day}`);

    const r = await w.admin.call('POST', `/api/orders/${id}/cancel`, { reason: 'Mehmon ketdi' });
    const o = await w.admin.get(`/api/orders/${id}`);
    const ledger1 = await env.svc.reports.dailyLedger(day);
    const fin1 = await w.admin.get(`/api/finance/daily?date=${day}`);
    const closedToday = await w.admin.get(`/api/orders?status=CLOSED&date=${day}`);
    const canceled = await w.admin.get('/api/orders?status=CANCELED');
    const active = await w.admin.get('/api/orders');
    record('canceled-from-SENT order figures', { totalAmount: o.totalAmount, totalSnapshot: o.totalSnapshot, itemCount: o.itemCount });

    expect.soft(r.status, `cancel answered ${r.status} ${errText(r)}`).toBe(200);
    expect.soft({ status: o.status, reason: o.cancelReason, total: o.totalSnapshot }, `canceled order (totalAmount shows ${o.totalAmount})`).toEqual({
      status: 'CANCELED',
      reason: 'Mehmon ketdi',
      total: null,
    });
    expect.soft((await itemState(env, w.items.osh)).stock, `Osh count (was ${osh0.stock})`).toBe(n(osh0.stock) + 2);
    expect.soft((await itemState(env, w.items.somsa)).stock, `Somsa count (was ${somsa0.stock})`).toBe(n(somsa0.stock) + 2);
    expect.soft(
      { netSales: n(ledger1.sales.netSales), closed: ledger1.sales.closedCount, canceled: ledger1.sales.canceledCount },
      'dailyLedger after vs before',
    ).toEqual({ netSales: n(ledger0.sales.netSales), closed: ledger0.sales.closedCount, canceled: ledger0.sales.canceledCount + 1 });
    expect.soft(
      { netFood: n(fin1.sales.netFood), billed: n(fin1.sales.billedTotal), cashIn: n(fin1.cashflow.cashIn) },
      'GET /api/finance/daily after vs before',
    ).toEqual({ netFood: n(fin0.sales.netFood), billed: n(fin0.sales.billedTotal), cashIn: n(fin0.cashflow.cashIn) });
    expect.soft(closedToday.map((x: any) => x.id).includes(id), "in today's CLOSED list").toBe(false);
    expect.soft(canceled.map((x: any) => x.id).includes(id), 'in the CANCELED list').toBe(true);
    expect.soft(active.map((x: any) => x.id).includes(id), 'in the active list').toBe(false);
  });

  it('from CLOSED → refused; the bill stays CLOSED with its Payment row', async () => {
    const r = await w.admin.call('POST', `/api/orders/${closedCashOrder}/cancel`, { reason: 'Xato' });
    const o = await w.admin.get(`/api/orders/${closedCashOrder}`);
    record('cancel of a CLOSED bill', err(r));
    expect.soft(r.status, `cancel of a CLOSED bill answered ${r.status} ${errText(r)}`).toBeGreaterThanOrEqual(400);
    // CLOSED → CANCELED is not an edge of the state machine; the app's word for that elsewhere
    // (a second confirm, a line on a closed bill) is 409 ILLEGAL_STATE. Contract, not money.
    expect.soft(err(r), `state-machine answer for CLOSED → CANCELED: ${errText(r)}`).toEqual({ status: 409, code: 'ILLEGAL_STATE' });
    expect.soft({ status: o.status, total: o.totalSnapshot, payments: await paymentRows(closedCashOrder) }, 'the paid bill').toEqual({
      status: 'CLOSED',
      total: 90_000,
      payments: [{ method: 'CASH', amount: 90_000 }],
    });
  });
});

// ─── 10. Money shape ──────────────────────────────────────────────────────

describe("10. Pul shakli — whole so'm as JSON numbers on the wire", () => {
  it('GET /api/orders/:id of the Naqd + Nasiya bill: every money field is a whole-number JSON number', async () => {
    const o = await w.admin.get(`/api/orders/${debtOrderId}`);
    expect(notWholeNumbers(o), 'money fields that are not whole-number JSON numbers').toEqual([]);
  });

  it('the confirm response of the same bill: every money field is a whole-number JSON number', () => {
    expect(notWholeNumbers(debtConfirmResponse), 'money fields that are not whole-number JSON numbers').toEqual([]);
  });

  it('POST /:id/items response: every money field is a whole-number JSON number', async () => {
    const id = await openOrder(w.w1, w.nextTable(), []);
    const l = await w.w1.post(`/api/orders/${id}/items`, { menuItemId: w.items.osh, quantity: 1 });
    await w.w1.post(`/api/orders/${id}/cancel`, { reason: 'Sinov' }); // tidy up, Osh back
    expect(notWholeNumbers(l), 'money fields that are not whole-number JSON numbers').toEqual([]);
  });

  it("GET /api/orders?status=CLOSED&date=today rows: every money field is a whole-number JSON number", async () => {
    const day = env.svc.time.localDayKey();
    const rows = await w.admin.get(`/api/orders?status=CLOSED&date=${day}`);
    const row = rows.find((x: any) => x.id === debtOrderId);
    expect(row, 'the Naqd + Nasiya bill is in the closed list').toBeTruthy();
    expect(notWholeNumbers(row), 'money fields that are not whole-number JSON numbers').toEqual([]);
  });
});

// ─── 8. Stale draft — last, because it moves the clock ────────────────────

describe('8. Eski qoralama — a draft left 13 hours', () => {
  it('runDraftCleanup cancels it: CANCELED, the 12-hour reason, an automatic audit row by the waiter, counts restored', async () => {
    const id = await openOrder(w.w2, w.nextTable(), [[w.items.osh, 1], [w.items.somsa, 2]]);
    const osh0 = await itemState(env, w.items.osh);
    const somsa0 = await itemState(env, w.items.somsa);
    // The sweep cancels every stale draft; the count deltas below assume this is the only one open.
    const openDrafts = (await w.admin.get('/api/orders')).filter((x: any) => x.status === 'DRAFT').map((x: any) => x.id);
    expect(openDrafts, 'drafts open before the sweep (earlier sections tidy theirs up)').toEqual([id]);

    setClock(new Date(Date.now() + 13 * HOUR));
    await w.relogin();
    await env.svc.scheduler.runDraftCleanup();

    const o = await w.admin.get(`/api/orders/${id}`);
    const audit = await env.prisma.auditLog.findFirst({
      where: { action: 'ORDER_CANCELED', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
    const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
    expect.soft({ status: o.status, reason: o.cancelReason, total: o.totalSnapshot }, 'the draft').toEqual({
      status: 'CANCELED',
      reason: STALE_REASON,
      total: null,
    });
    expect.soft(
      { actor: audit?.userId ?? null, automatic: meta.automatic ?? null, reason: meta.reason ?? null, fromStatus: meta.fromStatus ?? null },
      'audit row',
    ).toEqual({ actor: w.waiterIds.w2, automatic: true, reason: STALE_REASON, fromStatus: 'DRAFT' });
    expect.soft((await itemState(env, w.items.osh)).stock, `Osh count (was ${osh0.stock})`).toBe(n(osh0.stock) + 1);
    expect.soft((await itemState(env, w.items.somsa)).stock, `Somsa count (was ${somsa0.stock})`).toBe(n(somsa0.stock) + 2);
  });
});
