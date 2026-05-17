// Production smoke for the SERVICE-kind menu item flow ("kishi boshi" service charge).
//
// Billing formula (verified in apps/master/src/main/server/services/billing.service.ts lines 54-110):
//
//   subtotal       = sum(qty * unitPrice) over FOOD lines (active, non-canceled)
//   serviceCharge  = sum(qty * unitPrice) over SERVICE lines (active, non-canceled)
//                  → 0 if `serviceChargeWaived: true` (alias `waiveServiceCharge` accepted)
//   discountAmount = applied to `subtotal` ONLY (services are NOT discounted)
//   total          = (subtotal - discountAmount) + serviceCharge
//
// Scenarios:
//   A — SERVICE applies (no discount, no waive).
//   B — waiveServiceCharge:true zeroes service while line stays present on the order.
//   C — SERVICE + 10% discount: discount applies to FOOD subtotal only.
//   D — Per-line cancel of a SERVICE line in DRAFT → service charge naturally 0.
//
// Prereq: dev:master running on $BASE_URL (default http://localhost:4000) with a freshly seeded DB.
// Usage:  pnpm --filter @chayxana/master exec tsx scripts/simulate-service-flow.ts

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN = { username: 'admin', password: 'admin123' };
const OWNER = { username: 'owner', password: 'owner123' };
const WAITER_PIN = '5678';

const prisma = new PrismaClient();

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (n: string, msg: string) => console.log(`\n${c(36, `── ${n}`)} ${msg}`);
const ok = (m: string) => console.log(`  ${c(32, '✓')} ${m}`);
const note = (m: string) => console.log(`    ${c(2, m)}`);
const fail = (m: string): never => {
  console.error(`  ${c(31, '✗')} ${m}`);
  process.exit(1);
};

const eq = (label: string, actual: string | number, expected: string | number) => {
  if (String(actual) !== String(expected)) {
    fail(`${label}: actual=${actual} expected=${expected}`);
  }
  ok(`${label} = ${actual}`);
};

async function http<T = unknown>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; expectStatus?: number } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  const expected = options.expectStatus;
  const ok2xx = res.status >= 200 && res.status < 300;
  if (expected !== undefined ? res.status !== expected : !ok2xx) {
    fail(`${method} ${path} expected ${expected ?? '2xx'}, got ${res.status} — body: ${text.slice(0, 400)}`);
  }
  return { status: res.status, body: parsed as T };
}

// ───────────────────────────────────────────────────────────────────
// Domain types
// ───────────────────────────────────────────────────────────────────

type Table = { id: string; name: string; activeOrderId: string | null };
type MenuItem = { id: string; name: string; price: string; kind: string; categoryId: string };
type OrderLine = {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: string;
  isCanceled: boolean;
  menuItem?: { id: string; kind: string };
};
type Order = {
  id: string;
  status: string;
  subtotalSnapshot: string | null;
  discountAmountSnapshot: string | null;
  serviceChargeSnapshot: string | null;
  totalSnapshot: string | null;
  lines: OrderLine[];
};

let adminToken = '';
let ownerToken = '';
let waiterToken = '';

async function loginUsername(username: string, password: string): Promise<string> {
  const { body } = await http<{ token: string }>('POST', '/api/auth/login', {
    body: { username, password },
  });
  return body.token;
}

async function loginPin(pin: string): Promise<string> {
  const { body } = await http<{ token: string }>('POST', '/api/auth/login-pin', { body: { pin } });
  return body.token;
}

// ───────────────────────────────────────────────────────────────────
// Menu / table / order helpers
// ───────────────────────────────────────────────────────────────────

let cachedMenu: MenuItem[] | null = null;
async function loadMenu(force = false): Promise<MenuItem[]> {
  if (cachedMenu && !force) return cachedMenu;
  const { body } = await http<MenuItem[]>('GET', '/api/menu/items', { token: waiterToken });
  cachedMenu = body;
  return cachedMenu;
}

function findItem(name: string): MenuItem {
  if (!cachedMenu) fail('Menu not loaded');
  const item = cachedMenu!.find((m) => m.name === name);
  if (!item) fail(`Menu item not found: ${name}`);
  return item!;
}

async function ensureServiceItem(): Promise<MenuItem> {
  const items = await loadMenu(true);
  const existing = items.find((i) => i.kind === 'SERVICE');
  if (existing) {
    note(`Reusing existing SERVICE item: ${existing.id} (${existing.name}, price=${existing.price})`);
    return existing;
  }
  const { body: created } = await http<MenuItem>('POST', '/api/menu/items', {
    token: adminToken,
    body: {
      categoryId: 'seed-category-tea',
      name: 'Xizmat haqi (kishi boshi)',
      price: 8000,
      kind: 'SERVICE',
    },
  });
  note(`Created SERVICE item: ${created.id} (${created.name}, price=${created.price})`);
  await loadMenu(true);
  return created;
}

async function pickFreeTable(): Promise<Table> {
  const { body: tables } = await http<Table[]>('GET', '/api/tables', { token: waiterToken });
  const t = tables.find((row) => !row.activeOrderId);
  if (!t) fail('No free tables left');
  return t!;
}

async function createDraft(tableId: string): Promise<Order> {
  const { body } = await http<Order>('POST', '/api/orders', {
    token: waiterToken,
    body: { orderType: 'DINE_IN', tableId },
  });
  return body;
}

async function addItem(orderId: string, menuItemId: string, quantity: number) {
  await http('POST', `/api/orders/${orderId}/items`, {
    token: waiterToken,
    body: { menuItemId, quantity },
  });
}

async function getOrder(orderId: string, token = waiterToken): Promise<Order> {
  const { body } = await http<Order>('GET', `/api/orders/${orderId}`, { token });
  return body;
}

async function send(orderId: string) {
  await http('POST', `/api/orders/${orderId}/send`, { token: waiterToken });
}

async function confirm(orderId: string, body: unknown): Promise<Order> {
  const { body: out } = await http<Order>('POST', `/api/orders/${orderId}/confirm`, {
    token: adminToken,
    body,
  });
  return out;
}

async function cancelLine(orderId: string, lineId: string, token: string, reason = 'simulate') {
  await http('POST', `/api/orders/${orderId}/lines/${lineId}/cancel`, {
    token,
    body: { reason },
  });
}

// ───────────────────────────────────────────────────────────────────
// Scenarios
// ───────────────────────────────────────────────────────────────────

async function scenarioA(service: MenuItem) {
  step('A', 'SERVICE charge applies (2× Achichuk + 4× Service)');
  const achichuk = findItem('Achichuk');
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, achichuk.id, 2); // 18 000 × 2 = 36 000 FOOD
  await addItem(order.id, service.id, 4);  //  8 000 × 4 = 32 000 SERVICE
  await send(order.id);

  const closed = await confirm(order.id, {
    payments: [{ method: 'CASH', amount: 68_000 }],
  });

  if (closed.status !== 'CLOSED') fail(`Expected CLOSED, got ${closed.status}`);
  eq('A.status', closed.status, 'CLOSED');
  eq('A.subtotalSnapshot', closed.subtotalSnapshot ?? '', '36000');
  eq('A.serviceChargeSnapshot', closed.serviceChargeSnapshot ?? '', '32000');
  eq('A.totalSnapshot', closed.totalSnapshot ?? '', '68000');
  // DB cross-check
  const fromDb = await prisma.order.findUnique({ where: { id: order.id } });
  if (!fromDb) fail('A: order missing in DB');
  eq('A.db.total', Number(fromDb!.totalSnapshot ?? 0), 68_000);
  eq('A.db.serviceCharge', Number(fromDb!.serviceChargeSnapshot ?? 0), 32_000);
}

async function scenarioB(service: MenuItem) {
  step('B', 'waiveServiceCharge:true zeroes the service line at billing time');
  const osh = findItem('Osh');
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, osh.id, 1);     // 35 000 FOOD
  await addItem(order.id, service.id, 2); //  8 000 × 2 = 16 000 SERVICE
  await send(order.id);

  const closed = await confirm(order.id, {
    waiveServiceCharge: true,
    payments: [{ method: 'CASH', amount: 35_000 }],
  });

  eq('B.status', closed.status, 'CLOSED');
  eq('B.subtotalSnapshot', closed.subtotalSnapshot ?? '', '35000');
  eq('B.serviceChargeSnapshot', closed.serviceChargeSnapshot ?? '', '0');
  eq('B.totalSnapshot', closed.totalSnapshot ?? '', '35000');

  // Verify SERVICE line is still present (waive is billing-only, doesn't delete line)
  const after = await getOrder(order.id, adminToken);
  const serviceLine = after.lines.find((l) => l.menuItemId === service.id);
  if (!serviceLine) fail('B: SERVICE line missing — waive should not delete the line');
  if (serviceLine!.isCanceled) fail('B: SERVICE line was canceled — waive should not cancel it');
  if (serviceLine!.quantity !== 2) fail(`B: SERVICE line qty changed: ${serviceLine!.quantity}`);
  ok(`B: SERVICE line preserved (qty=${serviceLine!.quantity}, isCanceled=${serviceLine!.isCanceled})`);
}

async function scenarioC(service: MenuItem) {
  step('C', 'SERVICE + 10% discount (discount applies to FOOD only)');
  const kabob = findItem('Mol kabob');
  const achichuk = findItem('Achichuk');
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, kabob.id, 1);     // 42 000 FOOD
  await addItem(order.id, achichuk.id, 2);   // 18 000 × 2 = 36 000 FOOD  → subtotal 78 000
  await addItem(order.id, service.id, 3);    //  8 000 × 3 = 24 000 SERVICE
  await send(order.id);

  // Expected: discount = round(78000 * 10%) = 7 800
  //           total = (78 000 - 7 800) + 24 000 = 94 200
  const closed = await confirm(order.id, {
    discountId: 'seed-discount-10pct',
    payments: [{ method: 'CASH', amount: 94_200 }],
  });

  eq('C.status', closed.status, 'CLOSED');
  eq('C.subtotalSnapshot', closed.subtotalSnapshot ?? '', '78000');
  eq('C.discountAmountSnapshot', closed.discountAmountSnapshot ?? '', '7800');
  eq('C.serviceChargeSnapshot', closed.serviceChargeSnapshot ?? '', '24000');
  eq('C.totalSnapshot', closed.totalSnapshot ?? '', '94200');
}

async function scenarioD(service: MenuItem) {
  step('D', 'Per-line cancel of SERVICE line in DRAFT (waiter)');
  const osh = findItem('Osh');
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, osh.id, 1);     // 35 000 FOOD
  await addItem(order.id, service.id, 3); //  8 000 × 3 = 24 000 SERVICE (will be canceled)

  // Find the SERVICE line id
  const draft = await getOrder(order.id);
  const serviceLine = draft.lines.find((l) => l.menuItemId === service.id);
  if (!serviceLine) fail('D: SERVICE line not present after add');
  await cancelLine(order.id, serviceLine!.id, waiterToken);

  const afterCancel = await getOrder(order.id);
  const stillThere = afterCancel.lines.find((l) => l.id === serviceLine!.id);
  if (stillThere && !stillThere.isCanceled) {
    fail('D: SERVICE line returned but not marked isCanceled');
  }
  if (stillThere) {
    ok(`D: SERVICE line present with isCanceled=true`);
  } else {
    ok(`D: SERVICE line removed from response`);
  }

  await send(order.id);
  const closed = await confirm(order.id, {
    payments: [{ method: 'CASH', amount: 35_000 }],
  });
  eq('D.status', closed.status, 'CLOSED');
  eq('D.subtotalSnapshot', closed.subtotalSnapshot ?? '', '35000');
  eq('D.serviceChargeSnapshot', closed.serviceChargeSnapshot ?? '', '0');
  eq('D.totalSnapshot', closed.totalSnapshot ?? '', '35000');
}

// ───────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────

async function main() {
  step('0', 'Health + logins');
  const { body: health } = await http<{ ok: boolean }>('GET', '/api/health');
  if (!health.ok) fail('Health check failed');
  ok('Master /api/health ok');

  adminToken = await loginUsername(ADMIN.username, ADMIN.password);
  ownerToken = await loginUsername(OWNER.username, OWNER.password);
  void ownerToken; // owner token retained for parity with other smokes
  waiterToken = await loginPin(WAITER_PIN);
  ok('admin / owner / waiter authenticated');

  step('1', 'Ensure a SERVICE-kind menu item exists');
  const service = await ensureServiceItem();
  if (service.kind !== 'SERVICE') fail(`Expected kind=SERVICE, got ${service.kind}`);
  await loadMenu(); // make sure cache is warm for findItem()

  await scenarioA(service);
  await scenarioB(service);
  await scenarioC(service);
  await scenarioD(service);

  console.log(`\n${c(32, '═══════════════════════════════════════════════════')}`);
  console.log(`${c(32, '  All 4 SERVICE-flow scenarios passed.')}`);
  console.log(`${c(32, '═══════════════════════════════════════════════════')}\n`);
}

main()
  .catch((err) => {
    console.error(c(31, 'FATAL:'), err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
