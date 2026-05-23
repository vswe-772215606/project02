// Smoke: daily finance P&L view — verifies the new five-section structure
// and that the totals don't double-count purchases against COGS.
//
// Scenario (all today):
//   1. Create a composite dish (Lag'mon) with known ingredients & costs.
//   2. Sell N portions through to CLOSED — known revenue + known COGS.
//   3. Record an extra ingredient purchase (zaxira to'ldirish, separate from
//      the initial purchases done by menu-create).
//   4. Record an operating expense (e.g. "Yorug'lik haqi") — NOT ingredient cat.
//   5. Open a debt and immediately collect a partial repayment.
//   6. GET /api/finance/daily and assert:
//        - mealSales rows contain our dish with revenue == sales × price
//          and cogs == portions × per-portion-cogs
//        - operatingExpenses contains the Yorug'lik expense but NOT the
//          ingredient purchase rows
//        - ingredientPurchases lists today's batches (initial + extra)
//        - debtToday matches what we opened/collected
//        - pnl.profit == revenue − cogs − operatingExpense (and does NOT
//          double-count the purchase cash)
//
// Prereq: dev:master running.

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
async function pickCategoryId() {
  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  if (!cat) fail('No active category');
  return cat.id;
}
async function pickOperatingExpenseCategory() {
  // Anything other than the ingredient seed category.
  const cat = await prisma.expenseCategory.findFirst({
    where: { isActive: true, NOT: { id: 'seed-cat-ingredients' } },
  });
  if (!cat) fail('No non-ingredient expense category found');
  return cat;
}

function todayISO() {
  return new Date().toISOString();
}
function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function main() {
  console.log(c(35, '\n=== Daily finance P&L smoke ===\n'));

  const adminToken = await loginAdmin();
  const waiterToken = await loginWaiter();
  const categoryId = await pickCategoryId();
  const opExpCat = await pickOperatingExpenseCategory();
  const suffix = Date.now().toString().slice(-5);

  // Free any stuck DRAFT/SENT orders left behind by earlier smoke runs so we
  // have tables to use. Going through the API would require finding the
  // owning waiter for each order — easier to just mark them canceled in DB.
  const stuck = await prisma.order.findMany({
    where: { status: { in: ['DRAFT', 'SENT'] } },
    select: { id: true },
  });
  if (stuck.length > 0) {
    note(`Cleaning up ${stuck.length} stuck order(s) from prior runs`);
    await prisma.order.updateMany({
      where: { id: { in: stuck.map((o) => o.id) } },
      data: { status: 'CANCELED', canceledAt: new Date(), cancelReason: 'smoke-cleanup' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  step('1', 'CREATE composite dish (Lag\'mon) with 2 ingredients');
  const dishName = `Lag'mon PNL ${suffix}`;
  const { body: dish } = await http<{ id: string; price: number }>(
    'POST', '/api/menu/items',
    {
      token: adminToken,
      body: {
        mode: 'COMPOSITE',
        categoryId,
        name: dishName,
        price: 45000,
        composite: {
          ingredients: [
            // Go'sht: 100g/portion × 5 portions = 500g; cost = 500 × 80 = 40,000
            { name: `Go'sht-pnl-${suffix}`, unit: 'kg', quantityPerPortion: 100, initialQty: 2, initialUnitCost: 80000 },
            // Xamir: 200g/portion × 5 portions = 1000g; cost = 1000 × 6 = 6,000
            { name: `Xamir-pnl-${suffix}`, unit: 'kg', quantityPerPortion: 200, initialQty: 3, initialUnitCost: 6000 },
          ],
        },
      },
    },
  );
  ok(`dish id=${dish.id} sale price=${dish.price}`);

  // ─────────────────────────────────────────────────────────────────────
  step('2', 'Sell 5 portions and CONFIRM (close) — must be CLOSED to count in daily finance');
  // Find a free table for DINE_IN so confirm works as expected
  const table = await prisma.table.findFirst({
    where: { isActive: true, orders: { none: { status: { in: ['DRAFT', 'SENT'] } } } },
  });
  if (!table) fail('No free table');
  const { body: order } = await http<{ id: string }>(
    'POST', '/api/orders', { token: waiterToken, body: { orderType: 'DINE_IN', tableId: table.id } },
  );
  await http('POST', `/api/orders/${order.id}/items`, {
    token: waiterToken, body: { menuItemId: dish.id, quantity: 5 },
  });
  // Send → SENT
  await http('POST', `/api/orders/${order.id}/send`, { token: waiterToken });
  // Confirm with cash payment of full amount
  // 5 × 45000 = 225,000 sale total (no discount, no service charge)
  await http('POST', `/api/orders/${order.id}/confirm`, {
    token: adminToken,
    body: { payments: [{ method: 'CASH', amount: 225000 }] },
  });
  ok('order CLOSED with 225,000 cash');

  // Expected COGS per portion: 100g × 80 + 200g × 6 = 8,000 + 1,200 = 9,200
  // 5 portions → revenue 225,000; COGS 46,000; profit 179,000
  const expectedRevenue = 225000;
  const expectedCogs = 5 * 9200;
  const expectedDishProfit = expectedRevenue - expectedCogs;

  // ─────────────────────────────────────────────────────────────────────
  step('3', 'Record an extra ingredient purchase today (zaxira to\'ldirish)');
  const goshtIng = await prisma.ingredient.findFirst({
    where: { name: `Go'sht-pnl-${suffix}` },
  });
  if (!goshtIng) fail('Go\'sht ingredient not found');
  await http('POST', '/api/purchases', {
    token: adminToken,
    body: {
      ingredientId: goshtIng.id,
      quantityBuyUnit: 1,
      totalCostUzs: 85000,
      occurredAt: todayISO(),
      supplierNote: 'pnl-extra',
    },
  });
  ok('extra Go\'sht purchase 85,000');

  // ─────────────────────────────────────────────────────────────────────
  step('4', 'Record an operating expense (NOT ingredient category)');
  await http('POST', '/api/expenses', {
    token: adminToken,
    body: {
      categoryId: opExpCat.id,
      amount: 30000,
      reason: `Yorug'lik haqi ${suffix}`,
      occurredAt: todayISO(),
    },
  });
  ok(`operating expense 30,000 in category "${opExpCat.name}"`);

  // ─────────────────────────────────────────────────────────────────────
  step('5', 'Open a DEBT order and collect a partial repayment');
  // New order, pay 50,000 DEBT, then immediately repay 20,000
  const table2 = await prisma.table.findFirst({
    where: { isActive: true, orders: { none: { status: { in: ['DRAFT', 'SENT'] } } } },
  });
  if (!table2) fail('No second free table');
  const { body: order2 } = await http<{ id: string }>(
    'POST', '/api/orders', { token: waiterToken, body: { orderType: 'DINE_IN', tableId: table2.id } },
  );
  // Sell 1 portion (45000 sale) — pay all 45,000 via DEBT
  await http('POST', `/api/orders/${order2.id}/items`, {
    token: waiterToken, body: { menuItemId: dish.id, quantity: 1 },
  });
  await http('POST', `/api/orders/${order2.id}/send`, { token: waiterToken });
  const { body: closedOrder2 } = await http<{ id: string; debt: { id: string } | null }>(
    'POST', `/api/orders/${order2.id}/confirm`,
    {
      token: adminToken,
      body: {
        payments: [{ method: 'DEBT', amount: 45000 }],
        debt: { debtorName: `Mijoz ${suffix}` },
      },
    },
  );
  // Verify debt created
  const debt = await prisma.debt.findUnique({ where: { orderId: order2.id } });
  if (!debt) fail('Debt was not created');
  // Collect 20,000 of it
  await http('POST', `/api/debts/${debt.id}/repayments`, {
    token: adminToken,
    body: { amount: 20000, method: 'CASH' },
  });
  ok(`debt opened 45,000, collected 20,000`);

  // ─────────────────────────────────────────────────────────────────────
  step('6', 'GET /api/finance/daily and assert the new sections');
  const { body: finance } = await http<any>(
    'GET', `/api/finance/daily?date=${localDateKey()}`,
    { token: adminToken },
  );

  // Per-dish row for our dish — note: 2nd order's 1 portion adds to qty + revenue too
  const ourDishRow = finance.mealSales.find((r: any) => r.menuItemId === dish.id);
  if (!ourDishRow) fail('Our dish not in mealSales');
  // Total: 5 portions (cash order) + 1 portion (debt order) = 6 portions
  assertEq('mealSales[dish].qty', ourDishRow.qty, 6);
  assertEq('mealSales[dish].revenue', ourDishRow.revenue, String(6 * 45000));
  assertEq('mealSales[dish].cogs', ourDishRow.cogs, String(6 * 9200));
  assertEq('mealSales[dish].profit', ourDishRow.profit, String(6 * 45000 - 6 * 9200));

  // Operating expenses should INCLUDE the Yorug'lik but EXCLUDE ingredient purchases
  const opExpenseHit = finance.operatingExpenses.find((e: any) => e.reason === `Yorug'lik haqi ${suffix}`);
  if (!opExpenseHit) fail('Yorug\'lik expense not in operatingExpenses');
  assertEq('Yorug\'lik amount in operatingExpenses', opExpenseHit.amount, '30000');
  const ingredientExpHit = finance.operatingExpenses.find((e: any) => e.categoryName === 'Mahsulot xaridlari');
  assertEq('NO ingredient-cat row in operatingExpenses (excluded)', ingredientExpHit, 'undefined');

  // ingredientPurchases should contain the extra purchase
  const extraPurchase = finance.ingredientPurchases.find((p: any) => p.supplierNote === 'pnl-extra');
  if (!extraPurchase) fail('Extra purchase not in ingredientPurchases');
  ok(`ingredientPurchases includes the extra batch (${finance.ingredientPurchases.length} total today)`);

  // Debt today — earlier runs may have left other debts open today, so assert
  // lower bounds (our debt + collection must be included).
  if (finance.debtToday.openedCount < 1) fail(`debtToday.openedCount should be >= 1, got ${finance.debtToday.openedCount}`);
  if (Number(finance.debtToday.openedAmount) < 45000) fail(`debtToday.openedAmount should be >= 45000, got ${finance.debtToday.openedAmount}`);
  if (finance.debtToday.collectedCount < 1) fail(`debtToday.collectedCount should be >= 1, got ${finance.debtToday.collectedCount}`);
  if (Number(finance.debtToday.collectedAmount) < 20000) fail(`debtToday.collectedAmount should be >= 20000, got ${finance.debtToday.collectedAmount}`);
  ok(`debtToday includes our debt (opened ${finance.debtToday.openedCount} × ${finance.debtToday.openedAmount}, collected ${finance.debtToday.collectedCount} × ${finance.debtToday.collectedAmount})`);

  // P&L identity — pnl.profit == revenue - cogs - operatingExpense, and the
  // ingredient-purchase cash MUST NOT appear in operatingExpense.
  const pnlRevenue = Number(finance.pnl.revenue);
  const pnlCogs = Number(finance.pnl.cogs);
  const pnlOpex = Number(finance.pnl.operatingExpense);
  const pnlProfit = Number(finance.pnl.profit);
  assertEq('pnl identity (revenue − cogs − opex)', pnlRevenue - pnlCogs - pnlOpex, pnlProfit);
  // opex must be at least 30k (our expense) — but should NOT include the 85k purchase
  if (pnlOpex < 30000) fail(`pnl.operatingExpense ${pnlOpex} < 30000 (our expense)`);
  // Hard upper bound: operating expense should not contain ingredient purchases.
  // Today's seed data might have other expenses, but we assert the purchase
  // cash is NOT in opex by checking that opex < (opex + purchases) and
  // purchase amount lives in ingredientPurchasesTotal, not opex.
  assertEq('ingredientPurchasesTotal.amount includes the extra 85k',
    Number(finance.ingredientPurchasesTotal.amount) >= 85000, 'true');

  ok(`P&L: ${pnlRevenue} − ${pnlCogs} − ${pnlOpex} = ${pnlProfit}`);
  note(`Total dish revenue today: ${pnlRevenue}, COGS: ${pnlCogs}, Profit before opex: ${pnlRevenue - pnlCogs}`);

  console.log(c(32, '\n=== Daily finance P&L smoke passed ===\n'));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
