// End-to-end smoke: full chayxana inventory cycle, post-FIFO + new menu UX.
//
// Lifecycle:
//   1. Admin creates a composite dish in ONE call (new menu-create API).
//   2. Waiter sells some — FIFO peels initial batches.
//   3. Admin restocks one ingredient via Xaridlar (new FIFO batch with a
//      DIFFERENT unit cost).
//   4. Waiter sells enough to drain the old batch and bite into the new —
//      verify COGS reflects the per-batch mix (the "honest history" rule).
//   5. Admin edits the recipe (portion qty) via Retseptlar.
//   6. Waiter sells again — verify the new per-portion qty and that COGS
//      uses the new batch's unit cost.
//   7. List ingredients (Mahsulotlar page data) — verify the new ones show.
//   8. List purchases — verify both batches are visible with the expected
//      consumed/remaining split.
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
async function findFreeTable(): Promise<string> {
  const t = await prisma.table.findFirst({
    where: { isActive: true, orders: { none: { status: { in: ['DRAFT', 'SENT'] } } } },
  });
  if (!t) fail('No free table');
  return t.id;
}
async function newOrderAndAdd(token: string, menuItemId: string, qty: number) {
  // TAKEAWAY — no table needed, so smoke can open many orders back-to-back
  // without exhausting the seeded tables (DINE_IN orders lock a table while DRAFT).
  const { body: order } = await http<{ id: string }>('POST', '/api/orders', {
    token, body: { orderType: 'TAKEAWAY' },
  });
  await http('POST', `/api/orders/${order.id}/items`, {
    token, body: { menuItemId, quantity: qty },
  });
  return order.id;
}
async function lineFor(orderId: string) {
  const lines = await prisma.orderLine.findMany({ where: { orderId, isCanceled: false } });
  if (lines.length === 0) fail(`No line in order ${orderId}`);
  return lines[0];
}

async function main() {
  console.log(c(35, '\n=== Full chayxana flow smoke ===\n'));

  const adminToken = await loginAdmin();
  const waiterToken = await loginWaiter();
  const categoryId = await pickCategoryId();
  const suffix = Date.now().toString().slice(-5);

  // ─────────────────────────────────────────────────────────────────────────
  step('1', 'CREATE composite dish in one shot — Lag\'mon');
  const dishName = `Lag'mon E2E ${suffix}`;
  const goshtName = `Go'sht E2E ${suffix}`;
  const xamirName = `Xamir E2E ${suffix}`;
  const { body: dish } = await http<{ id: string }>(
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
            // Go'sht: 100g/portion, 1 kg @ 80,000 so'm/kg (unit cost per gram = 80)
            { name: goshtName, unit: 'kg', quantityPerPortion: 100, initialQty: 1, initialUnitCost: 80000 },
            // Xamir: 200g/portion, 2 kg @ 6,000 so'm/kg (unit cost per gram = 6)
            { name: xamirName, unit: 'kg', quantityPerPortion: 200, initialQty: 2, initialUnitCost: 6000 },
          ],
        },
      },
    },
  );
  ok(`created dish id=${dish.id}`);
  // Sanity: recipe + 2 ingredients + 2 purchases exist.
  const goshtIng = await prisma.ingredient.findFirst({ where: { name: goshtName }, include: { purchases: true } });
  const xamirIng = await prisma.ingredient.findFirst({ where: { name: xamirName }, include: { purchases: true } });
  if (!goshtIng || !xamirIng) fail('Missing ingredients after create');
  assertEq('Go\'sht initial batch remaining (g)', goshtIng.purchases[0].remainingQty.toFixed(0), '1000');
  assertEq('Xamir initial batch remaining (g)', xamirIng.purchases[0].remainingQty.toFixed(0), '2000');

  // ─────────────────────────────────────────────────────────────────────────
  step('2', 'Sell 3 portions — verify FIFO COGS = portions × (100×80 + 200×6) = portions × 9200');
  const order1 = await newOrderAndAdd(waiterToken, dish.id, 3);
  const line1 = await lineFor(order1);
  // Expected COGS = 3 × (100×80 + 200×6) = 3 × (8000 + 1200) = 3 × 9200 = 27600
  assertEq('order1 line cogsSnapshot', Number(line1.cogsSnapshot).toFixed(0), '27600');
  const goshtAfter1 = await prisma.ingredient.findUnique({ where: { id: goshtIng.id }, include: { purchases: true } });
  const xamirAfter1 = await prisma.ingredient.findUnique({ where: { id: xamirIng.id }, include: { purchases: true } });
  // Go'sht: 1000g - 3×100 = 700g; Xamir: 2000g - 3×200 = 1400g
  assertEq('Go\'sht stock after 3 portions', goshtAfter1?.currentStock.toFixed(0), '700');
  assertEq('Xamir stock after 3 portions', xamirAfter1?.currentStock.toFixed(0), '1400');

  // ─────────────────────────────────────────────────────────────────────────
  step('3', 'Restock both ingredients via /api/purchases — Go\'sht at HIGHER price');
  // New Go'sht batch: 1 kg @ 90,000 so'm/kg (was 80,000). Per-gram cost = 90.
  await http('POST', '/api/purchases', {
    token: adminToken,
    body: {
      ingredientId: goshtIng.id,
      quantityBuyUnit: 1,
      totalCostUzs: 90000,
      occurredAt: new Date().toISOString(),
      supplierNote: 'restock-gosht-e2e',
    },
  });
  // New Xamir batch: 2 kg @ 6,000 so'm/kg (same price). Just to give us headroom.
  await http('POST', '/api/purchases', {
    token: adminToken,
    body: {
      ingredientId: xamirIng.id,
      quantityBuyUnit: 2,
      totalCostUzs: 12000,
      occurredAt: new Date().toISOString(),
      supplierNote: 'restock-xamir-e2e',
    },
  });
  const goshtAfterRestock = await prisma.ingredient.findUnique({
    where: { id: goshtIng.id },
    include: { purchases: { orderBy: { occurredAt: 'asc' } } },
  });
  assertEq('Go\'sht batches count after restock', goshtAfterRestock?.purchases.length, 2);
  assertEq('Go\'sht stock after restock (700 + 1000)', goshtAfterRestock?.currentStock.toFixed(0), '1700');
  assertEq('Go\'sht batch 1 remaining (oldest)', goshtAfterRestock?.purchases[0].remainingQty.toFixed(0), '700');
  assertEq('Go\'sht batch 2 remaining (newest)', goshtAfterRestock?.purchases[1].remainingQty.toFixed(0), '1000');

  // ─────────────────────────────────────────────────────────────────────────
  step('4', 'Sell 10 portions — drain old Go\'sht batch (700g/100 = 7 portions) and bite into new (3 × 100g = 300g from new)');
  const order2 = await newOrderAndAdd(waiterToken, dish.id, 10);
  const line2 = await lineFor(order2);
  // Go'sht COGS: 700 × 80 (old batch) + 300 × 90 (new batch) = 56000 + 27000 = 83000
  // Xamir COGS: 10 × 200g × 6 = 12000
  // Total: 83000 + 12000 = 95000
  assertEq('order2 line cogsSnapshot (mixed batches)', Number(line2.cogsSnapshot).toFixed(0), '95000');
  const goshtAfter2 = await prisma.ingredient.findUnique({
    where: { id: goshtIng.id },
    include: { purchases: { orderBy: { occurredAt: 'asc' } } },
  });
  assertEq('Go\'sht batch 1 fully consumed', goshtAfter2?.purchases[0].remainingQty.toFixed(0), '0');
  assertEq('Go\'sht batch 2 remaining (1000 - 300)', goshtAfter2?.purchases[1].remainingQty.toFixed(0), '700');

  // ─────────────────────────────────────────────────────────────────────────
  step('5', 'Edit recipe — bump Go\'sht per-portion qty from 100g to 120g');
  // PUT /api/menu/items/:id/recipe expects ingredients array
  const recipe = await prisma.recipe.findUnique({
    where: { menuItemId: dish.id },
    include: { ingredients: true },
  });
  if (!recipe) fail('No recipe');
  await http('PUT', `/api/menu/items/${dish.id}/recipe`, {
    token: adminToken,
    body: {
      ingredients: recipe.ingredients.map((ri) => ({
        ingredientId: ri.ingredientId,
        quantity: ri.ingredientId === goshtIng.id ? 120 : Number(ri.quantity),
      })),
    },
  });
  const recipeAfter = await prisma.recipe.findUnique({
    where: { menuItemId: dish.id },
    include: { ingredients: true },
  });
  const goshtRi = recipeAfter?.ingredients.find((ri) => ri.ingredientId === goshtIng.id);
  assertEq('Go\'sht per-portion qty after edit', Number(goshtRi?.quantity).toFixed(0), '120');

  // ─────────────────────────────────────────────────────────────────────────
  step('6', 'Sell 2 more — should consume 2 × 120g = 240g Go\'sht @ new batch 90/g + 2 × 200g Xamir');
  const order3 = await newOrderAndAdd(waiterToken, dish.id, 2);
  const line3 = await lineFor(order3);
  // Go'sht: 240 × 90 = 21600; Xamir: 2 × 200 × 6 = 2400; Total: 24000
  assertEq('order3 line cogsSnapshot (new portion qty + new batch price)', Number(line3.cogsSnapshot).toFixed(0), '24000');
  const goshtAfter3 = await prisma.ingredient.findUnique({
    where: { id: goshtIng.id },
    include: { purchases: { orderBy: { occurredAt: 'asc' } } },
  });
  assertEq('Go\'sht batch 2 remaining (700 - 240)', goshtAfter3?.purchases[1].remainingQty.toFixed(0), '460');

  // ─────────────────────────────────────────────────────────────────────────
  step('7', 'Mahsulotlar (GET /api/ingredients) shows our new ingredients');
  const { body: ingsList } = await http<Array<{ id: string; name: string }>>(
    'GET', '/api/ingredients', { token: adminToken },
  );
  const haveGosht = ingsList.find((i) => i.id === goshtIng.id);
  const haveXamir = ingsList.find((i) => i.id === xamirIng.id);
  if (!haveGosht) fail('Go\'sht not in ingredients list');
  if (!haveXamir) fail('Xamir not in ingredients list');
  ok(`both ingredients listed (${ingsList.length} total)`);

  // ─────────────────────────────────────────────────────────────────────────
  step('8', 'Xaridlar (GET /api/purchases) shows both Go\'sht batches');
  const { body: purchasesList } = await http<Array<{ id: string; ingredientId: string; remainingQty: string; status: string }>>(
    'GET', `/api/purchases?ingredientId=${goshtIng.id}`, { token: adminToken },
  );
  const myGoshtPurchases = purchasesList.filter((p) => p.ingredientId === goshtIng.id);
  assertEq('Go\'sht ACTIVE batch rows in list', myGoshtPurchases.filter((p) => p.status === 'ACTIVE').length, 2);

  console.log(c(32, '\n=== Full flow smoke passed ===\n'));
  note('Manual UI check next: open Menu → "Qo\'shish", switch modes, verify live cost preview;');
  note('open Xaridlar to see the new Go\'sht batches with the consumed/remaining counts.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
