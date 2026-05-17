// End-to-end production smoke for the post-refactor lifecycle:
//   DRAFT → SENT → CLOSED (via the new single-step /confirm flow)
//   DRAFT → SENT → WALKOUT
//   DRAFT → CANCELED (waiter, stock restored)
//   SENT → CANCELED (admin only, stock retained)
//
// Exercises confirm with: cash-only, split (cash+card), discount, DEBT payment,
// payment-sum mismatch (must reject). Verifies snapshots + Payment rows + audit
// trail + Debt row creation directly against the DB after each scenario.
//
// Prereq: dev:master running on $BASE_URL (default http://localhost:4000)
// Usage:  pnpm --filter @chayxana/master exec tsx scripts/simulate-confirm-flow.ts

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN_USER = { username: 'admin', password: 'admin123' };
const WAITER_PIN = '5678'; // Botir

const prisma = new PrismaClient();

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (n: string, msg: string) => console.log(`\n${c(36, `── ${n}`)} ${msg}`);
const ok = (msg: string) => console.log(`  ${c(32, '✓')} ${msg}`);
const note = (msg: string) => console.log(`    ${c(2, msg)}`);
const fail = (msg: string) => { console.error(`  ${c(31, '✗')} ${msg}`); process.exit(1); };

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
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  const expected = options.expectStatus;
  const ok2xx = res.status >= 200 && res.status < 300;
  if (expected !== undefined ? res.status !== expected : !ok2xx) {
    fail(`${method} ${path} expected ${expected ?? '2xx'}, got ${res.status} — body: ${text.slice(0, 400)}`);
  }
  return { status: res.status, body: parsed as T };
}

async function loginUsername(username: string, password: string): Promise<string> {
  const { body } = await http<{ token: string }>('POST', '/api/auth/login', {
    body: { username, password },
  });
  return body.token;
}

async function loginPin(pin: string): Promise<string> {
  const { body } = await http<{ token: string }>('POST', '/api/auth/login-pin', {
    body: { pin },
  });
  return body.token;
}

type Table = { id: string; name: string; activeOrderId: string | null };
type MenuItem = { id: string; name: string; price: string; kind: string; trackStock?: boolean };
type Order = {
  id: string;
  status: string;
  totalSnapshot: string | null;
  subtotalSnapshot: string | null;
  discountAmountSnapshot: string | null;
  approvedAt: string | null;
  closedAt: string | null;
  lines: Array<{ id: string; nameSnapshot: string; quantity: number; unitPriceSnapshot: string }>;
};

let waiterToken = '';
let adminToken = '';

async function pickFreeTable(): Promise<Table> {
  const { body: tables } = await http<Table[]>('GET', '/api/tables', { token: waiterToken });
  const t = tables.find((t) => !t.activeOrderId);
  if (!t) fail('No free tables — terminal orders should release tables, check Order state machine');
  return t!;
}

let cachedMenu: MenuItem[] | null = null;
async function menu(): Promise<MenuItem[]> {
  if (cachedMenu) return cachedMenu;
  const { body } = await http<MenuItem[]>('GET', '/api/menu/items', { token: waiterToken });
  cachedMenu = body.filter((i) => (i.kind ?? 'FOOD') === 'FOOD');
  return cachedMenu;
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

async function confirm(orderId: string, body: unknown, opts: { expectStatus?: number } = {}) {
  return http<Order>('POST', `/api/orders/${orderId}/confirm`, {
    token: adminToken,
    body,
    expectStatus: opts.expectStatus,
  });
}

async function walkout(orderId: string, reason: string) {
  await http('POST', `/api/orders/${orderId}/mark-walkout`, {
    token: adminToken,
    body: { reason },
  });
}

async function cancelOrder(orderId: string, token: string, opts: { expectStatus?: number; reason?: string } = {}) {
  return http('POST', `/api/orders/${orderId}/cancel`, {
    token,
    body: { reason: opts.reason ?? 'simulate' },
    expectStatus: opts.expectStatus,
  });
}

// ─────────────────────────────────────────────────────────────────────────

async function scenarioCashConfirm() {
  step('A', 'Cash-only confirm: DRAFT → SENT → CLOSED');
  const items = await menu();
  const achichuk = items.find((i) => i.name === 'Achichuk')!;
  const osh = items.find((i) => i.name === 'Osh')!;
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, achichuk.id, 2); // 36000
  await addItem(order.id, osh.id, 1);       // 35000
  await send(order.id);
  const sent = await getOrder(order.id);
  if (sent.status !== 'SENT') fail(`Expected SENT, got ${sent.status}`);
  ok(`Order ${order.id} sent (table ${table.name})`);

  const expectedTotal = 36000 + 35000; // no service charge by default
  const { body: closed } = await confirm(order.id, {
    payments: [{ method: 'CASH', amount: expectedTotal }],
  });
  if (closed.status !== 'CLOSED') fail(`Expected CLOSED, got ${closed.status}`);
  if (Number(closed.totalSnapshot) !== expectedTotal) {
    fail(`Total mismatch: snapshot=${closed.totalSnapshot} expected=${expectedTotal}`);
  }
  ok(`Confirm → CLOSED, total snapshot = ${closed.totalSnapshot}`);

  const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
  if (payments.length !== 1 || payments[0]!.method !== 'CASH' || Number(payments[0]!.amount) !== expectedTotal) {
    fail(`Payment row wrong: ${JSON.stringify(payments)}`);
  }
  ok(`Payment row written: ${payments[0]!.method} ${payments[0]!.amount}`);

  const audit = await prisma.auditLog.findFirst({
    where: { entityId: order.id, action: 'ORDER_CONFIRMED' },
    orderBy: { createdAt: 'desc' },
  });
  if (!audit) fail('No ORDER_CONFIRMED audit log');
  ok('Audit log ORDER_CONFIRMED present');

  const printJobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
  if (printJobs.length !== 1 || printJobs[0]!.type !== 'BILL') fail(`PrintJob wrong: ${JSON.stringify(printJobs)}`);
  ok(`PrintJob BILL row written, status=${printJobs[0]!.status}`);
}

async function scenarioSplitCashCard() {
  step('B', 'Split payment cash+card: SENT → CLOSED');
  const items = await menu();
  const lagmon = items.find((i) => i.name === "Lag'mon sho'rva")!;
  const choy = items.find((i) => i.name === 'Qora choy')!;
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, lagmon.id, 1); // 30000
  await addItem(order.id, choy.id, 2);    // 16000
  await send(order.id);
  const expected = 30000 + 16000;

  const { body: closed } = await confirm(order.id, {
    payments: [
      { method: 'CASH', amount: 20000 },
      { method: 'CARD', amount: expected - 20000 },
    ],
  });
  if (closed.status !== 'CLOSED') fail(`Expected CLOSED, got ${closed.status}`);
  ok(`Confirm → CLOSED, total ${closed.totalSnapshot}`);

  const payments = await prisma.payment.findMany({ where: { orderId: order.id }, orderBy: { method: 'asc' } });
  if (payments.length !== 2) fail(`Expected 2 payments, got ${payments.length}`);
  ok(`2 payment rows: ${payments.map((p) => `${p.method}=${p.amount}`).join(', ')}`);
}

async function scenarioWithDiscount() {
  step('C', 'Discount applied: 10% percent discount');
  const items = await menu();
  const osh = items.find((i) => i.name === 'Osh')!;
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, osh.id, 3); // 105000
  await send(order.id);
  const subtotal = 105000;
  const expectedTotal = Math.round(subtotal * 0.9); // 94500

  const { body: closed } = await confirm(order.id, {
    discountId: 'seed-discount-10pct',
    payments: [{ method: 'CASH', amount: expectedTotal }],
  });
  if (closed.status !== 'CLOSED') fail(`Expected CLOSED, got ${closed.status}`);
  if (Number(closed.subtotalSnapshot) !== subtotal) fail(`Subtotal mismatch: ${closed.subtotalSnapshot}`);
  if (Number(closed.discountAmountSnapshot) !== subtotal - expectedTotal) {
    fail(`Discount mismatch: snapshot=${closed.discountAmountSnapshot} expected=${subtotal - expectedTotal}`);
  }
  if (Number(closed.totalSnapshot) !== expectedTotal) fail(`Total mismatch: ${closed.totalSnapshot}`);
  ok(`Subtotal=${subtotal}, discount=${closed.discountAmountSnapshot}, total=${closed.totalSnapshot}`);
}

async function scenarioDebtPayment() {
  step('D', 'DEBT payment: creates Debt row');
  const items = await menu();
  const kabob = items.find((i) => i.name === 'Mol kabob')!;
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, kabob.id, 2); // 84000
  await send(order.id);
  const total = 84000;

  const { body: closed } = await confirm(order.id, {
    payments: [{ method: 'DEBT', amount: total }],
    debt: { debtorName: 'Test Karzdor', debtorPhone: '+998901234567', note: 'simulation' },
  });
  if (closed.status !== 'CLOSED') fail(`Expected CLOSED, got ${closed.status}`);

  const debts = await prisma.debt.findMany({ where: { orderId: order.id } });
  if (debts.length !== 1) fail(`Expected 1 debt, got ${debts.length}`);
  const d = debts[0]!;
  if (Number(d.originalAmount) !== total || d.debtorName !== 'Test Karzdor' || d.status !== 'OPEN') {
    fail(`Debt row wrong: ${JSON.stringify(d)}`);
  }
  ok(`Debt row created: ${d.debtorName}, ${d.originalAmount} ${d.status}`);
}

async function scenarioPaymentMismatch() {
  step('E', 'Payment-sum mismatch must be rejected');
  const items = await menu();
  const choy = items.find((i) => i.name === 'Qora choy')!;
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, choy.id, 1); // 8000
  await send(order.id);

  const { body } = await confirm(order.id, {
    payments: [{ method: 'CASH', amount: 5000 }], // wrong
  }, { expectStatus: 400 });
  const code = (body as { error?: { code?: string } }).error?.code;
  if (code !== 'PAYMENT_MISMATCH') fail(`Expected PAYMENT_MISMATCH, got ${JSON.stringify(body)}`);
  ok(`Rejected with PAYMENT_MISMATCH`);

  // Order should stay SENT — clean it up.
  const after = await getOrder(order.id);
  if (after.status !== 'SENT') fail(`Order should still be SENT after rejection, is ${after.status}`);
  ok(`Order remains SENT after rejection`);

  // Recover the table by cancelling as admin.
  await cancelOrder(order.id, adminToken);
}

async function scenarioWalkout() {
  step('F', 'Walkout: SENT → WALKOUT');
  const items = await menu();
  const somsa = items.find((i) => i.name === 'Somsa')!;
  const table = await pickFreeTable();
  const order = await createDraft(table.id);
  await addItem(order.id, somsa.id, 4); // 48000
  await send(order.id);

  await walkout(order.id, 'mijoz to\'lovsiz ketdi');
  const after = await getOrder(order.id, adminToken);
  if (after.status !== 'WALKOUT') fail(`Expected WALKOUT, got ${after.status}`);
  ok(`Order marked WALKOUT`);
}

async function scenarioCancelRules() {
  step('G', 'Cancel rules: waiter DRAFT ok, waiter SENT forbidden, admin SENT ok');

  const items = await menu();
  const choy = items.find((i) => i.name === "Ko'k choy")!;

  // G1: waiter cancels DRAFT — must succeed
  {
    const table = await pickFreeTable();
    const order = await createDraft(table.id);
    await addItem(order.id, choy.id, 1);
    await cancelOrder(order.id, waiterToken);
    const after = await getOrder(order.id, adminToken);
    if (after.status !== 'CANCELED') fail(`G1 status ${after.status}`);
    ok(`G1: waiter cancelled DRAFT → CANCELED`);
  }

  // G2: waiter cancels SENT — must be forbidden
  {
    const table = await pickFreeTable();
    const order = await createDraft(table.id);
    await addItem(order.id, choy.id, 1);
    await send(order.id);
    await cancelOrder(order.id, waiterToken, { expectStatus: 403 });
    const after = await getOrder(order.id, adminToken);
    if (after.status !== 'SENT') fail(`G2 expected SENT, got ${after.status}`);
    ok(`G2: waiter blocked from cancelling SENT`);
    // Admin cleans up.
    await cancelOrder(order.id, adminToken);
  }

  // G3: admin cancels SENT — must succeed
  {
    const table = await pickFreeTable();
    const order = await createDraft(table.id);
    await addItem(order.id, choy.id, 1);
    await send(order.id);
    await cancelOrder(order.id, adminToken);
    const after = await getOrder(order.id, adminToken);
    if (after.status !== 'CANCELED') fail(`G3 status ${after.status}`);
    ok(`G3: admin cancelled SENT → CANCELED`);
  }
}

// ─────────────────────────────────────────────────────────────────────────

async function main() {
  step('0', 'Health + logins');
  const { body: health } = await http<{ ok: boolean }>('GET', '/api/health');
  if (!health.ok) fail('Health check failed');
  ok('Master /api/health ok');

  adminToken = await loginUsername(ADMIN_USER.username, ADMIN_USER.password);
  ok(`Admin logged in (username/password)`);
  waiterToken = await loginPin(WAITER_PIN);
  ok(`Waiter logged in (PIN ${WAITER_PIN})`);

  await scenarioCashConfirm();
  await scenarioSplitCashCard();
  await scenarioWithDiscount();
  await scenarioDebtPayment();
  await scenarioPaymentMismatch();
  await scenarioWalkout();
  await scenarioCancelRules();

  console.log(`\n${c(32, '════════════════════════════════════════')}`);
  console.log(`${c(32, '  All 7 scenarios passed.')}`);
  console.log(`${c(32, '════════════════════════════════════════')}\n`);
}

main()
  .catch((err) => {
    console.error(c(31, 'FATAL:'), err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
