// Wave-3 smoke. Six scenarios against a freshly-seeded DB on $BASE_URL:
//   A  Combos with component consumption (Lunch Set: Mastava + Mol kabob + Qora choy)
//   B  FIXED discount math (seed-discount-fixed-5k)
//   C  Order transfer between tables (+ activeOrderId hand-off, audit row)
//   D  Per-line edit: quantity update + cancel in DRAFT
//   E  Bill reprint on a CLOSED order (PrintJob + audit row)
//   F  /api/reports/monthly aggregation matches manually-summed CLOSED orders
//
// Prereq: dev:master running on $BASE_URL with a freshly seeded DB.
// Usage:  pnpm --filter @chayxana/master exec tsx scripts/simulate-wave3-flow.ts

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN = { username: 'admin', password: 'admin123' };
const OWNER = { username: 'owner', password: 'owner123' };
const WAITER_BOTIR_PIN = '5678';

const COMBO_ID = 'seed-combo-lunch-set';
const MASTAVA = 'seed-item-mastava';
const FIXED_DISCOUNT_ID = 'seed-discount-fixed-5k';

const prisma = new PrismaClient();

// ───────────────────────────────────────────────────────────────────
// Helpers (mirrored from simulate-finance-flow / simulate-service-flow)
// ───────────────────────────────────────────────────────────────────

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (n: string, msg: string) => console.log(`\n${c(36, `── ${n}`)} ${msg}`);
const ok = (m: string) => console.log(`  ${c(32, '✓')} ${m}`);
const info = (m: string) => console.log(`    ${c(2, m)}`);
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
type MenuItem = { id: string; name: string; price: string; kind: string };
type OrderLine = {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  comboGroupId: string | null;
  comboNameSnapshot: string | null;
  quantity: number;
  unitPriceSnapshot: string;
  isCanceled: boolean;
};
type Order = {
  id: string;
  status: string;
  tableId: string | null;
  subtotalSnapshot: string | number | null;
  discountAmountSnapshot: string | number | null;
  serviceChargeSnapshot: string | number | null;
  totalSnapshot: string | number | null;
  lines: OrderLine[];
};
type Ingredient = { id: string; name: string };

let adminToken = '';
let ownerToken = '';
let botirToken = '';

// ───────────────────────────────────────────────────────────────────
// Auth
// ───────────────────────────────────────────────────────────────────

async function login() {
  const a = await http<{ token: string }>('POST', '/api/auth/login', { body: ADMIN });
  adminToken = a.body.token;
  const o = await http<{ token: string }>('POST', '/api/auth/login', { body: OWNER });
  ownerToken = o.body.token;
  const b = await http<{ token: string }>('POST', '/api/auth/login-pin', { body: { pin: WAITER_BOTIR_PIN } });
  botirToken = b.body.token;
}

// ───────────────────────────────────────────────────────────────────
// Menu / table / order helpers
// ───────────────────────────────────────────────────────────────────

let cachedMenu: MenuItem[] = [];
async function loadMenu() {
  const { body } = await http<MenuItem[]>('GET', '/api/menu/items', { token: adminToken });
  cachedMenu = body;
}
function itemId(name: string): string {
  const m = cachedMenu.find((x) => x.name === name);
  if (!m) fail(`Menu item not found: ${name}`);
  return m!.id;
}

async function listTables(token = adminToken): Promise<Table[]> {
  const { body } = await http<Table[]>('GET', '/api/tables', { token });
  return body;
}

async function pickFreeTable(token = botirToken): Promise<Table> {
  const tables = await listTables(token);
  const t = tables.find((row) => !row.activeOrderId);
  if (!t) fail('No free tables left');
  return t!;
}

async function createDraftOn(tableId: string, token = botirToken): Promise<Order> {
  const { body } = await http<Order>('POST', '/api/orders', {
    token,
    body: { orderType: 'DINE_IN', tableId },
  });
  return body;
}

async function createDraft(token = botirToken): Promise<Order> {
  const t = await pickFreeTable(token);
  return createDraftOn(t.id, token);
}

async function addItem(token: string, orderId: string, menuItemId: string, qty: number) {
  await http('POST', `/api/orders/${orderId}/items`, {
    token,
    body: { menuItemId, quantity: qty },
  });
}

async function addCombo(token: string, orderId: string, comboId: string) {
  await http('POST', `/api/orders/${orderId}/combos`, {
    token,
    body: { comboId },
  });
}

async function send(token: string, orderId: string) {
  await http('POST', `/api/orders/${orderId}/send`, { token });
}

async function confirm(orderId: string, body: unknown): Promise<Order> {
  const { body: out } = await http<Order>('POST', `/api/orders/${orderId}/confirm`, {
    token: adminToken,
    body,
  });
  return out;
}

async function getOrder(orderId: string, token = adminToken): Promise<Order> {
  const { body } = await http<Order>('GET', `/api/orders/${orderId}`, { token });
  return body;
}

async function transferOrder(orderId: string, newTableId: string, token = adminToken): Promise<Order> {
  const { body } = await http<Order>('POST', `/api/orders/${orderId}/transfer`, {
    token,
    body: { tableId: newTableId },
  });
  return body;
}

async function updateLineQty(orderId: string, lineId: string, quantity: number, token = botirToken) {
  await http('PATCH', `/api/orders/${orderId}/lines/${lineId}/quantity`, {
    token,
    body: { quantity },
  });
}

async function cancelLine(orderId: string, lineId: string, token = botirToken, reason = 'simulate') {
  await http('POST', `/api/orders/${orderId}/lines/${lineId}/cancel`, {
    token,
    body: { reason },
  });
}

// ───────────────────────────────────────────────────────────────────
// Ingredient / recipe / purchase helpers
// ───────────────────────────────────────────────────────────────────

async function createIngredient(input: { name: string; parentMenuItemId: string }): Promise<Ingredient> {
  const { body } = await http<Ingredient>('POST', '/api/ingredients', {
    token: adminToken,
    body: {
      name: input.name,
      parentMenuItemId: input.parentMenuItemId,
      buyUnit: 'kg',
      recipeUnit: 'g',
      conversionFactor: 1000,
    },
  });
  return body;
}

async function setRecipe(menuItemId: string, ingredients: Array<{ ingredientId: string; quantity: number }>) {
  await http('PUT', `/api/menu/items/${menuItemId}/recipe`, {
    token: adminToken,
    body: { ingredients },
  });
}

async function recordPurchase(ingredientId: string, kg: number, totalUzs: number) {
  await http('POST', '/api/purchases', {
    token: adminToken,
    body: {
      ingredientId,
      quantityBuyUnit: kg,
      totalCostUzs: totalUzs,
      occurredAt: new Date().toISOString(),
      supplierNote: 'simulate-wave3',
    },
  });
}

// ───────────────────────────────────────────────────────────────────
// Scenarios
// ───────────────────────────────────────────────────────────────────

type ClosedSummary = {
  id: string;
  gross: number;
  discount: number;
  total: number;
};

const closed: ClosedSummary[] = [];

async function scenarioA(): Promise<{ molMastavaId: string; guruchId: string }> {
  step('A', 'Combo with component consumption (Lunch Set)');

  // Setup ingredients + recipe for Mastava only (other combo components untracked)
  const molMastava = await createIngredient({ name: "Mol go'shti (mastava)", parentMenuItemId: MASTAVA });
  const guruch = await createIngredient({ name: 'Guruch', parentMenuItemId: MASTAVA });
  await recordPurchase(molMastava.id, 5, 400_000);   // 5kg meat
  await recordPurchase(guruch.id, 10, 120_000);       // 10kg rice
  await setRecipe(MASTAVA, [
    { ingredientId: molMastava.id, quantity: 150 },
    { ingredientId: guruch.id, quantity: 80 },
  ]);
  info('Mastava recipe set: 150g meat + 80g rice (other combo components untracked)');

  const order = await createDraft();
  await addCombo(botirToken, order.id, COMBO_ID);

  // Inspect resulting lines. Service creates ONE line per combo component.
  const draft = await getOrder(order.id);
  const comboLines = draft.lines.filter((l) => !l.isCanceled);
  eq('A.lines.count (one per combo component)', comboLines.length, 3);

  const comboGroupIds = new Set(comboLines.map((l) => l.comboGroupId).filter((v): v is string => Boolean(v)));
  if (comboGroupIds.size !== 1) fail(`A: expected single comboGroupId, got ${comboGroupIds.size}`);
  ok(`A: comboGroupId shared across 3 component lines = ${[...comboGroupIds][0]}`);
  for (const line of comboLines) {
    if (line.comboNameSnapshot !== 'Lunch Set') fail(`A: comboNameSnapshot mismatch on line ${line.id}: ${line.comboNameSnapshot}`);
  }
  ok('A: all 3 lines tagged comboNameSnapshot="Lunch Set"');

  // 26 000 + 42 000 + 8 000 = 76 000
  const expectedTotal = 26_000 + 42_000 + 8_000;
  eq('A.expected combo total', expectedTotal, 76_000);

  await send(botirToken, order.id);
  const closedOrder = await confirm(order.id, {
    payments: [{ method: 'CASH', amount: expectedTotal }],
  });
  eq('A.status', closedOrder.status, 'CLOSED');
  eq('A.subtotalSnapshot', String(closedOrder.subtotalSnapshot ?? ''), String(expectedTotal));
  eq('A.totalSnapshot', String(closedOrder.totalSnapshot ?? ''), String(expectedTotal));

  closed.push({ id: order.id, gross: expectedTotal, discount: 0, total: expectedTotal });

  // Verify consumption: 1 portion of Mastava → 150g meat + 80g rice. Other combo
  // components have no recipe so they don't move any stock.
  const molM = await prisma.ingredient.findUnique({ where: { id: molMastava.id } });
  const gur = await prisma.ingredient.findUnique({ where: { id: guruch.id } });
  if (!molM || !gur) fail('A: ingredient missing in DB');
  eq("A.stock mol-mastava (g) after 1 Mastava component", Number(molM!.currentStock), 5000 - 150);
  eq('A.stock guruch (g) after 1 Mastava component', Number(gur!.currentStock), 10000 - 80);

  return { molMastavaId: molMastava.id, guruchId: guruch.id };
}

async function scenarioB() {
  step('B', 'FIXED discount math (2× Mastava + 1× Achichuk, seed-discount-fixed-5k)');

  const order = await createDraft();
  await addItem(botirToken, order.id, itemId('Mastava'), 2);   // 26 000 × 2 = 52 000
  await addItem(botirToken, order.id, itemId('Achichuk'), 1);   // 18 000
  await send(botirToken, order.id);
  // subtotal 70 000 − 5 000 = 65 000
  const closedOrder = await confirm(order.id, {
    discountId: FIXED_DISCOUNT_ID,
    payments: [{ method: 'CASH', amount: 65_000 }],
  });
  eq('B.status', closedOrder.status, 'CLOSED');
  eq('B.subtotalSnapshot', String(closedOrder.subtotalSnapshot ?? ''), '70000');
  eq('B.discountAmountSnapshot', String(closedOrder.discountAmountSnapshot ?? ''), '5000');
  eq('B.totalSnapshot', String(closedOrder.totalSnapshot ?? ''), '65000');

  closed.push({ id: order.id, gross: 70_000, discount: 5_000, total: 65_000 });
}

async function scenarioC() {
  step('C', 'Order transfer between tables (Botir, 1× Patir non)');

  const tablesBefore = await listTables(adminToken);
  const tableA = tablesBefore.find((t) => !t.activeOrderId);
  if (!tableA) fail('C: no free table for source');
  const tableB = tablesBefore.find((t) => !t.activeOrderId && t.id !== tableA!.id);
  if (!tableB) fail('C: no free table for destination');

  const order = await createDraftOn(tableA!.id, botirToken);
  await addItem(botirToken, order.id, itemId('Patir non'), 1);
  info(`C: created on Table A=${tableA!.name} (${tableA!.id}); will transfer to Table B=${tableB!.name} (${tableB!.id})`);

  // Sanity: tableA should now have this order as active
  const tablesMid = await listTables(adminToken);
  const tableAMid = tablesMid.find((t) => t.id === tableA!.id);
  eq('C.pre-transfer Table A.activeOrderId', String(tableAMid?.activeOrderId), order.id);

  await transferOrder(order.id, tableB!.id, adminToken);

  // Re-fetch
  const fresh = await getOrder(order.id, adminToken);
  eq('C.order.tableId after transfer', String(fresh.tableId), tableB!.id);

  const tablesAfter = await listTables(adminToken);
  const tableAAfter = tablesAfter.find((t) => t.id === tableA!.id);
  const tableBAfter = tablesAfter.find((t) => t.id === tableB!.id);
  eq('C.Table A.activeOrderId (cleared)', String(tableAAfter?.activeOrderId ?? 'null'), 'null');
  eq('C.Table B.activeOrderId (now this order)', String(tableBAfter?.activeOrderId), order.id);

  // Audit row
  const auditCount = await prisma.auditLog.count({
    where: { action: 'TABLE_TRANSFERRED', entityId: order.id },
  });
  if (auditCount < 1) fail(`C: expected TABLE_TRANSFERRED audit row for order ${order.id}, got ${auditCount}`);
  ok(`C: TABLE_TRANSFERRED audit row present (count=${auditCount})`);

  // Confirm to keep table B free for next scenarios
  await send(botirToken, order.id);
  const closedOrder = await confirm(order.id, {
    payments: [{ method: 'CASH', amount: 6_000 }],
  });
  eq('C.status (closed)', closedOrder.status, 'CLOSED');

  closed.push({ id: order.id, gross: 6_000, discount: 0, total: 6_000 });
}

async function scenarioD() {
  step('D', 'Per-line edit: quantity update + cancel');

  const order = await createDraft();
  await addItem(botirToken, order.id, itemId('Patir non'), 5);
  let draft = await getOrder(order.id);
  const patirLine = draft.lines.find((l) => !l.isCanceled && l.menuItemId === itemId('Patir non'));
  if (!patirLine) fail('D: Patir non line missing after add');
  eq('D.pre-edit Patir qty', patirLine!.quantity, 5);

  await updateLineQty(order.id, patirLine!.id, 3);
  draft = await getOrder(order.id);
  const afterUpdate = draft.lines.find((l) => l.id === patirLine!.id);
  eq('D.after-quantity-update Patir qty', afterUpdate!.quantity, 3);
  eq('D.after-quantity-update Patir isCanceled', String(afterUpdate!.isCanceled), 'false');

  // Add a second line so the order has something left after we cancel Patir
  await addItem(botirToken, order.id, itemId('Achichuk'), 1);

  // Now cancel Patir line
  await cancelLine(order.id, patirLine!.id, botirToken);
  draft = await getOrder(order.id);
  const afterCancel = draft.lines.find((l) => l.id === patirLine!.id);
  if (afterCancel && !afterCancel.isCanceled) {
    fail('D: Patir line present but not isCanceled after cancel');
  }
  if (afterCancel) {
    ok(`D: Patir line returned with isCanceled=true`);
  } else {
    ok('D: Patir line dropped from response');
  }

  const liveLines = draft.lines.filter((l) => !l.isCanceled);
  if (liveLines.length !== 1) fail(`D: expected exactly 1 live line, got ${liveLines.length}`);
  ok(`D: 1 live line remaining (Achichuk 18 000)`);

  await send(botirToken, order.id);
  const closedOrder = await confirm(order.id, {
    payments: [{ method: 'CASH', amount: 18_000 }],
  });
  eq('D.status', closedOrder.status, 'CLOSED');
  eq('D.subtotalSnapshot', String(closedOrder.subtotalSnapshot ?? ''), '18000');
  eq('D.totalSnapshot', String(closedOrder.totalSnapshot ?? ''), '18000');

  closed.push({ id: order.id, gross: 18_000, discount: 0, total: 18_000 });
}

async function scenarioE() {
  step('E', 'Reprint bill on a CLOSED order');

  const target = closed[0];
  if (!target) fail('E: no CLOSED order to reprint');

  const reprintsBefore = await prisma.printJob.count({
    where: { orderId: target!.id, type: 'BILL_REPRINT' },
  });
  const auditBefore = await prisma.auditLog.count({
    where: { entityId: target!.id, action: 'RECEIPT_REPRINTED' },
  });

  const { body: jobResp } = await http<unknown>('POST', `/api/orders/${target!.id}/reprint-bill`, {
    token: adminToken,
    body: { reason: 'simulate' },
  });
  if (!jobResp || typeof jobResp !== 'object') fail('E: reprint-bill response missing');
  ok('E: reprint-bill API returned ok response');

  const reprintsAfter = await prisma.printJob.count({
    where: { orderId: target!.id, type: 'BILL_REPRINT' },
  });
  const auditAfter = await prisma.auditLog.count({
    where: { entityId: target!.id, action: 'RECEIPT_REPRINTED' },
  });
  eq('E.PrintJob[type=BILL_REPRINT] delta', reprintsAfter - reprintsBefore, 1);
  eq('E.AuditLog[action=RECEIPT_REPRINTED] delta', auditAfter - auditBefore, 1);
}

async function scenarioF() {
  step('F', 'Monthly report aggregates today\'s CLOSED orders');

  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  type MonthlyResp = {
    month: string;
    totals: {
      closedOrders: number;
      canceledOrders: number;
      walkoutOrders: number;
      grossSales: string;
      discounts: string;
      netSales: string;
      debtSales: string;
      realCashIn: string;
      expensesNet: string;
      salesBasedProfit: string;
      cashflowBasedNet: string;
      outstandingDebtEndOfMonth: string;
    };
    daily: unknown[];
  };

  const { body: report } = await http<MonthlyResp>('GET', `/api/reports/monthly?month=${month}`, {
    token: ownerToken,
  });

  // Manual sum from our run
  const expectedGross = closed.reduce((s, o) => s + o.gross, 0);
  const expectedDiscount = closed.reduce((s, o) => s + o.discount, 0);
  const expectedNet = expectedGross - expectedDiscount;
  const expectedClosedCount = closed.length;

  info(`F: manual totals — closed=${expectedClosedCount} gross=${expectedGross} discount=${expectedDiscount} net=${expectedNet}`);
  info(`F: API totals     — closed=${report.totals.closedOrders} gross=${report.totals.grossSales} discount=${report.totals.discounts} net=${report.totals.netSales}`);

  eq('F.totals.month', report.month, month);
  eq('F.totals.closedOrders', report.totals.closedOrders, expectedClosedCount);
  eq('F.totals.grossSales', report.totals.grossSales, String(expectedGross));
  eq('F.totals.discounts', report.totals.discounts, String(expectedDiscount));
  eq('F.totals.netSales', report.totals.netSales, String(expectedNet));
  // No debts, no walkouts, no cancellations in this run.
  eq('F.totals.canceledOrders', report.totals.canceledOrders, 0);
  eq('F.totals.walkoutOrders', report.totals.walkoutOrders, 0);
  eq('F.totals.debtSales', report.totals.debtSales, '0');

  // Real cash in = sum of CASH payments (all our orders used CASH); equals net (no service charge in our orders)
  eq('F.totals.realCashIn', report.totals.realCashIn, String(expectedNet));
}

// ───────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────

async function main() {
  step('0', 'Health + logins');
  const { body: health } = await http<{ ok: boolean }>('GET', '/api/health');
  if (!health.ok) fail('Health check failed');
  ok('Master /api/health ok');

  await login();
  ok('admin / owner / botir authenticated');

  await loadMenu();

  await scenarioA();
  await scenarioB();
  await scenarioC();
  await scenarioD();
  await scenarioE();
  await scenarioF();

  console.log(`\n${c(32, '═══════════════════════════════════════════════════════════════')}`);
  console.log(`${c(32, '  Wave-3 smoke passed: combos + FIXED + transfer + per-line + reprint + monthly.')}`);
  console.log(`${c(32, '═══════════════════════════════════════════════════════════════')}\n`);
  info(`  CLOSED orders this run: ${closed.length}`);
  for (const o of closed) {
    info(`    ${o.id.slice(-6).toUpperCase()}  gross=${o.gross}  discount=${o.discount}  total=${o.total}`);
  }
}

main()
  .catch((err) => {
    console.error(c(31, 'FATAL:'), err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
