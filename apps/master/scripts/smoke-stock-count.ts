// Count-based inventory smoke — drives the running master via HTTP + verifies
// the resulting DB state directly. Mirrors the count-based sale scenario:
//   * A counted item with no count set is blocked from sale (409 OUT_OF_STOCK)
//   * Setting a count unblocks the sale; sale decrements stockCount and books
//     cost × qty onto the line's cogsSnapshot
//   * A quantity decrease restores stockCount and recomputes COGS
//     proportionally
//   * A count of zero blocks further sale
//
// Prereq: dev:master running on $BASE_URL (default http://localhost:4000).
// Usage:  pnpm --filter @chayxana/master exec tsx scripts/smoke-stock-count.ts

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

async function main() {
  const admin = await loginAdmin();
  const waiter = await loginWaiter();
  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  if (!cat) return fail('No active category — seed the dev DB first');
  const suffix = Date.now().toString().slice(-6);

  step('1', 'Counted item with no count is blocked');
  const item = (await http<{ id: string }>('POST', '/api/menu/items', {
    token: admin,
    body: { categoryId: cat.id, name: `Smoke plov ${suffix}`, price: 30000, mode: 'COUNTED', costPrice: 20000 },
  })).body;
  const draft = (await http<{ id: string }>('POST', '/api/orders', {
    token: waiter,
    body: { orderType: 'TAKEAWAY' },
  })).body;
  await http('POST', `/api/orders/${draft.id}/items`, {
    token: waiter,
    body: { menuItemId: item.id, quantity: 1 },
    expectStatus: 409,
  });
  ok('addLine on NULL count → 409 OUT_OF_STOCK');

  step('2', 'Count-set unblocks; sale decrements and books cost × qty');
  await http('POST', `/api/stock/${item.id}/count`, { token: admin, body: { countedQty: 10 } });
  await http('POST', `/api/orders/${draft.id}/items`, {
    token: waiter,
    body: { menuItemId: item.id, quantity: 3 },
  });
  const afterSale = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
  assertEq('stockCount after selling 3 of 10', afterSale.stockCount, 7);
  const line = await prisma.orderLine.findFirstOrThrow({ where: { orderId: draft.id, menuItemId: item.id } });
  assertEq('line cogsSnapshot (20000 × 3)', line.cogsSnapshot?.toFixed(0), '60000');

  step('3', 'Quantity decrease restores count and recomputes COGS proportionally');
  await http('PATCH', `/api/orders/${draft.id}/lines/${line.id}/quantity`, {
    token: waiter,
    body: { quantity: 1 },
  });
  const afterDecrease = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
  assertEq('stockCount after decrease to 1', afterDecrease.stockCount, 9);
  const lineAfter = await prisma.orderLine.findUniqueOrThrow({ where: { id: line.id } });
  assertEq('cogsSnapshot after decrease', lineAfter.cogsSnapshot?.toFixed(0), '20000');

  step('4', 'Zero blocks the sale');
  await http('POST', `/api/stock/${item.id}/count`, { token: admin, body: { countedQty: 0, note: 'smoke: zero' } });
  await http('POST', `/api/orders/${draft.id}/items`, {
    token: waiter,
    body: { menuItemId: item.id, quantity: 1 },
    expectStatus: 409,
  });
  ok('addLine at count 0 → 409');

  step('5', 'Restock with money: expense created, cost refreshed, entry journaled');
  await http('POST', `/api/stock/${item.id}/count`, { token: admin, body: { countedQty: 9 } });
  await http('POST', `/api/stock/${item.id}/restock`, {
    token: admin,
    body: { qty: 24, paidUzs: 240000, setCostFromPaid: true, note: 'smoke restock' },
  });
  const afterRestock = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
  assertEq('stockCount 9 + 24', afterRestock.stockCount, 33);
  assertEq('costPrice refreshed to 240000/24', afterRestock.costPrice?.toFixed(0), '10000');
  const entry = await prisma.stockEntry.findFirstOrThrow({
    where: { menuItemId: item.id, kind: 'RESTOCK' },
    orderBy: { createdAt: 'desc' },
    include: { expense: true },
  });
  assertEq('entry unitCost', entry.unitCost?.toFixed(0), '10000');
  if (!entry.expense) return fail('restock expense missing');
  assertEq('expense category', entry.expense.categoryId, 'seed-cat-ingredients');
  assertEq('expense amount', entry.expense.amount.toFixed(0), '240000');
  const auditRows = await prisma.auditLog.count({
    where: { action: { in: ['STOCK_RESTOCKED', 'STOCK_COUNT_SET'] }, entityId: item.id },
  });
  if (auditRows < 4) return fail(`expected >= 4 stock audit rows, got ${auditRows}`);
  ok(`audit rows for stock verbs: ${auditRows}`);

  step('6', 'Uncounted item books cost without a count');
  const choy = (await http<{ id: string }>('POST', '/api/menu/items', {
    token: admin,
    body: { categoryId: cat.id, name: `Smoke choy ${suffix}`, price: 3000, mode: 'UNCOUNTED', costPrice: 500 },
  })).body;
  await http('POST', `/api/orders/${draft.id}/items`, {
    token: waiter,
    body: { menuItemId: choy.id, quantity: 2 },
  });
  const choyLine = await prisma.orderLine.findFirstOrThrow({ where: { orderId: draft.id, menuItemId: choy.id } });
  assertEq('uncounted line cogs (500 × 2)', choyLine.cogsSnapshot?.toFixed(0), '1000');
  await http('POST', `/api/stock/${choy.id}/restock`, {
    token: admin,
    body: { qty: 5 },
    expectStatus: 400,
  });
  ok('restock on uncounted item → 400');

  console.log(`\n${c(32, 'SMOKE STOCK-COUNT (part 1) PASSED')}`);
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
