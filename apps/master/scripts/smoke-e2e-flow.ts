// End-to-end smoke: full chayxana count-based inventory cycle (2026-08
// refactor). Drives the running master via HTTP + verifies the resulting DB
// state directly, same style as smoke-stock-count.ts.
//
// Lifecycle:
//   1. Admin creates a COUNTED dish in ONE call — mode: 'COUNTED', a tan
//      narx (costPrice), and an initialCount — the new menu-create API.
//   2. Waiter opens a TAKEAWAY draft and sells some — stockCount decrements
//      1:1 and the line's cogsSnapshot books costPrice × qty.
//   3. Admin restocks via Ombor ("+ Keldi") with money paid and
//      setCostFromPaid: a StockEntry(RESTOCK) journals qty/paid/unitCost,
//      links an Expense in "Mahsulot xaridi", and refreshes costPrice.
//   4. Waiter sells more of the SAME dish on the SAME order — addLine merges
//      into the existing line instead of opening a second one, and the
//      extra portions accrue COGS at the then-current (post-restock)
//      costPrice — the "blended at time of sale" rule.
//   5. Waiter sends, admin confirms with an exact CASH payment — order goes
//      SENT → CLOSED, and the day's finance ledger books the line's
//      cogsSnapshot into pnl.cogs.
//   6. Admin corrects the count via Ombor ("Sanoq") — a StockEntry(COUNT)
//      journals countBefore/countAfter. This is the only stock-correction
//      mechanism; there is no batch history to reconcile against.
//
// Prereq: dev:master running on $BASE_URL (default http://localhost:4000).

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN_USER = { username: 'admin', password: 'admin123' };
const WAITER_PIN = '5678';

const prisma = new PrismaClient();
const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (n: string, msg: string) => console.log(`\n${c(36, `── ${n}`)} ${msg}`);
const ok = (msg: string) => console.log(`  ${c(32, '✓')} ${msg}`);
const note = (msg: string) => console.log(`    ${c(2, msg)}`);
const fail = (msg: string): never => { console.error(`  ${c(31, '✗')} ${msg}`); process.exit(1); };

function assertEq(label: string, actual: unknown, expected: unknown) {
  const a = String(actual);
  const e = String(expected);
  if (a !== e) fail(`${label}: expected ${e}, got ${a}`);
  ok(`${label} = ${a}`);
}

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

async function loginAdmin() {
  return (await http<{ token: string }>('POST', '/api/auth/login', { body: ADMIN_USER })).body.token;
}
async function loginWaiter() {
  return (await http<{ token: string }>('POST', '/api/auth/login-pin', { body: { pin: WAITER_PIN } })).body.token;
}
async function pickCategoryId(): Promise<string> {
  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  if (!cat) fail('No active category');
  return cat.id;
}
async function lineFor(orderId: string) {
  const lines = await prisma.orderLine.findMany({ where: { orderId, isCanceled: false } });
  if (lines.length === 0) fail(`No line in order ${orderId}`);
  return lines[0];
}

async function main() {
  console.log(c(35, '\n=== Full chayxana flow smoke (count-based inventory) ===\n'));

  const adminToken = await loginAdmin();
  const waiterToken = await loginWaiter();
  const categoryId = await pickCategoryId();
  const suffix = Date.now().toString().slice(-5);

  // ─────────────────────────────────────────────────────────────────────────
  step('1', "CREATE a COUNTED dish in one shot — Osh, costPrice 18 000, initialCount 10");
  const dishName = `Osh E2E ${suffix}`;
  const { body: dish } = await http<{ id: string }>(
    'POST', '/api/menu/items',
    {
      token: adminToken,
      body: {
        mode: 'COUNTED',
        categoryId,
        name: dishName,
        price: 30000,
        costPrice: 18000,
        initialCount: 10,
      },
    },
  );
  ok(`created dish id=${dish.id}`);
  const dishCreated = await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } });
  assertEq('counted flag on create', dishCreated.counted, true);
  assertEq('stockCount after initialCount 10', dishCreated.stockCount, 10);
  assertEq('costPrice after create', dishCreated.costPrice?.toFixed(0), '18000');

  // ─────────────────────────────────────────────────────────────────────────
  step('2', 'Waiter opens a TAKEAWAY draft, sells 4 — stockCount 10 → 6, line cogs 4 × 18 000');
  const { body: order } = await http<{ id: string }>('POST', '/api/orders', {
    token: waiterToken, body: { orderType: 'TAKEAWAY' },
  });
  await http('POST', `/api/orders/${order.id}/items`, {
    token: waiterToken, body: { menuItemId: dish.id, quantity: 4 },
  });
  const afterSale = await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } });
  assertEq('stockCount after selling 4 of 10', afterSale.stockCount, 6);
  const line1 = await lineFor(order.id);
  assertEq('line cogsSnapshot (18000 × 4)', line1.cogsSnapshot?.toFixed(0), '72000');

  // ─────────────────────────────────────────────────────────────────────────
  step('3', "Admin restocks 20 via Ombor, paid 300 000 with setCostFromPaid — cost refreshes to 15 000");
  await http('POST', `/api/stock/${dish.id}/restock`, {
    token: adminToken,
    body: { qty: 20, paidUzs: 300000, setCostFromPaid: true, note: 'e2e restock' },
  });
  const afterRestock = await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } });
  assertEq('stockCount after restock (6 + 20)', afterRestock.stockCount, 26);
  assertEq('costPrice refreshed to 300000/20', afterRestock.costPrice?.toFixed(0), '15000');
  const restockEntry = await prisma.stockEntry.findFirstOrThrow({
    where: { menuItemId: dish.id, kind: 'RESTOCK' },
    orderBy: { createdAt: 'desc' },
    include: { expense: true },
  });
  assertEq('restock entry unitCost', restockEntry.unitCost?.toFixed(0), '15000');
  if (!restockEntry.expense) fail('restock expense missing');
  assertEq('expense category (Mahsulot xaridi)', restockEntry.expense.categoryId, 'seed-cat-ingredients');
  assertEq('expense amount', restockEntry.expense.amount.toFixed(0), '300000');

  // ─────────────────────────────────────────────────────────────────────────
  step('4', 'Waiter sells 2 more of the same dish — addLine merges into line1, blended cost');
  await http('POST', `/api/orders/${order.id}/items`, {
    token: waiterToken, body: { menuItemId: dish.id, quantity: 2 },
  });
  const afterMerge = await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } });
  assertEq('stockCount after merge-add 2 (26 - 2)', afterMerge.stockCount, 24);
  const line2 = await lineFor(order.id);
  assertEq('merge reused the same line (no second line opened)', line2.id, line1.id);
  assertEq('merged line quantity (4 + 2)', line2.quantity, 6);
  assertEq('merged line cogsSnapshot (72000 + 2×15000)', line2.cogsSnapshot?.toFixed(0), '102000');

  // ─────────────────────────────────────────────────────────────────────────
  step('5', 'Send + confirm with exact CASH — order CLOSED, finance daily books the COGS');
  await http('POST', `/api/orders/${order.id}/send`, { token: waiterToken });
  const orderRow = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { lines: { where: { isCanceled: false } } },
  });
  const due = orderRow.lines.reduce((sum, l) => sum + Number(l.unitPriceSnapshot) * l.quantity, 0);
  assertEq('order due (price 30000 × qty 6)', due, 180000);
  await http('POST', `/api/orders/${order.id}/confirm`, {
    token: adminToken,
    body: { payments: [{ method: 'CASH', amount: due }] },
  });
  const closedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assertEq('order status', closedOrder.status, 'CLOSED');

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  const daily = (await http<{
    pnl: { cogs: string };
    ledger: { outflow: { ingredientPurchases: string } };
  }>('GET', `/api/finance/daily?date=${today}`, { token: adminToken })).body;
  if (Number(daily.pnl.cogs) < 102000) {
    fail(`daily pnl.cogs ${daily.pnl.cogs} does not include this order's 102000`);
  }
  ok(`daily pnl.cogs (${daily.pnl.cogs}) includes this order's 102000`);
  if (Number(daily.ledger.outflow.ingredientPurchases) < 300000) {
    fail(`ledger ingredientPurchases ${daily.ledger.outflow.ingredientPurchases} missing the 300000 restock`);
  }
  ok(`ledger ingredientPurchases (${daily.ledger.outflow.ingredientPurchases}) includes 300000`);

  // ─────────────────────────────────────────────────────────────────────────
  step('6', "Admin corrects the count via Sanoq — 24 → 3");
  await http('POST', `/api/stock/${dish.id}/count`, {
    token: adminToken, body: { countedQty: 3, note: 'e2e count-set' },
  });
  const afterCount = await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } });
  assertEq('stockCount after Sanoq', afterCount.stockCount, 3);
  const countEntry = await prisma.stockEntry.findFirstOrThrow({
    where: { menuItemId: dish.id, kind: 'COUNT' },
    orderBy: { createdAt: 'desc' },
  });
  assertEq('StockEntry(COUNT) countBefore', countEntry.countBefore, 24);
  assertEq('StockEntry(COUNT) countAfter', countEntry.countAfter, 3);

  console.log(c(32, '\n=== Full flow smoke passed ===\n'));
  note('Manual UI check next: open Menu → "Qo\'shish", pick COUNTED, verify live availability;');
  note('open Ombor to see the restock + Sanoq entries against this dish.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
