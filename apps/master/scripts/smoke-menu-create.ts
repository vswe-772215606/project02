// Smoke for the new three-mode menu-create flow.
// Drives the running master via HTTP and verifies DB state directly.
//
// Scenarios:
//   1. SIMPLE: "Pepsi 0.5L" (dona, qty=10, unitCost=8000) — verify MenuItem,
//      self-Ingredient, Purchase, and that selling one consumes one dona.
//   2. COMPOSITE: "Test palov" with 2 ingredients (Guruch 200g/portion, Go'sht
//      150g/portion) — verify MenuItem, Recipe, 2 Ingredient + RecipeIngredient,
//      2 Purchase, and that selling one fires FIFO peel on both.
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

async function loginAdmin(): Promise<string> {
  const { body } = await http<{ token: string }>('POST', '/api/auth/login', { body: ADMIN_USER });
  return body.token;
}
async function loginWaiter(): Promise<string> {
  const { body } = await http<{ token: string }>('POST', '/api/auth/login-pin', { body: { pin: WAITER_PIN } });
  return body.token;
}

async function pickCategoryId(): Promise<string> {
  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  if (!cat) fail('No active category in dev.db');
  return cat.id;
}

async function findFreeTable(): Promise<string> {
  const t = await prisma.table.findFirst({
    where: { isActive: true, orders: { none: { status: { in: ['DRAFT', 'SENT'] } } } },
  });
  if (!t) fail('No free table');
  return t.id;
}

async function main() {
  console.log(c(35, '\n=== Menu create three-mode smoke ===\n'));

  step('1', 'Login');
  const adminToken = await loginAdmin();
  const waiterToken = await loginWaiter();
  ok('admin + waiter ok');

  const categoryId = await pickCategoryId();
  const uniqSuffix = Date.now().toString().slice(-5);

  // ─── SIMPLE ──────────────────────────────────────────────────────────────
  step('2', 'CREATE simple item: "Pepsi 0.5L" — dona, 10 × 8000');
  const pepsiName = `Pepsi smoke ${uniqSuffix}`;
  const { body: pepsi } = await http<{ id: string; name: string; kind: string; price: number }>(
    'POST', '/api/menu/items',
    {
      token: adminToken,
      body: {
        mode: 'SIMPLE',
        categoryId,
        name: pepsiName,
        price: 12000,
        simple: { unit: 'dona', unitCost: 8000, initialQty: 10 },
      },
    },
  );
  note(`menuItem id=${pepsi.id} name="${pepsi.name}" kind=${pepsi.kind} price=${pepsi.price}`);

  // Verify DB rows
  const pepsiSelfIng = await prisma.ingredient.findUnique({
    where: { selfMenuItemId: pepsi.id },
    include: { purchases: true },
  });
  if (!pepsiSelfIng) fail('No self-ingredient created for Pepsi');
  assertEq('Pepsi self-ingredient name', pepsiSelfIng.name, pepsiName);
  assertEq('Pepsi self-ingredient buyUnit', pepsiSelfIng.buyUnit, 'dona');
  assertEq('Pepsi self-ingredient currentStock', pepsiSelfIng.currentStock.toFixed(0), '10');
  assertEq('Pepsi purchases count', pepsiSelfIng.purchases.length, 1);
  const pepsiBatch = pepsiSelfIng.purchases[0];
  assertEq('Pepsi batch qty', pepsiBatch.quantityBuyUnit.toFixed(0), '10');
  assertEq('Pepsi batch totalCost', pepsiBatch.totalCostUzs.toFixed(0), '80000');
  assertEq('Pepsi batch remainingQty', pepsiBatch.remainingQty.toFixed(0), '10');

  // Sell one Pepsi → stock 10 -> 9, batch.remainingQty 10 -> 9
  step('3', 'Sell 1 Pepsi via waiter — verify FIFO peel from self-ingredient');
  const tableId = await findFreeTable();
  const { body: order } = await http<{ id: string }>(
    'POST', '/api/orders', { token: waiterToken, body: { orderType: 'DINE_IN', tableId } },
  );
  await http('POST', `/api/orders/${order.id}/items`, {
    token: waiterToken, body: { menuItemId: pepsi.id, quantity: 1 },
  });
  const pepsiIngAfter = await prisma.ingredient.findUnique({
    where: { id: pepsiSelfIng.id },
    include: { purchases: true },
  });
  assertEq('Pepsi stock after 1 sale', pepsiIngAfter?.currentStock.toFixed(0), '9');
  assertEq('Pepsi batch remaining after 1 sale', pepsiIngAfter?.purchases[0].remainingQty.toFixed(0), '9');
  const pepsiLines = await prisma.orderLine.findMany({ where: { orderId: order.id, isCanceled: false } });
  assertEq('Pepsi line cogsSnapshot', Number(pepsiLines[0]?.cogsSnapshot ?? 0).toFixed(0), '8000');

  // ─── COMPOSITE ───────────────────────────────────────────────────────────
  step('4', 'CREATE composite item: "Test palov" with Guruch + Go\'sht');
  const palovName = `Test palov ${uniqSuffix}`;
  const guruchName = `Guruch ${uniqSuffix}`;
  const goshtName = `Go'sht ${uniqSuffix}`;
  const { body: palov } = await http<{ id: string; name: string }>(
    'POST', '/api/menu/items',
    {
      token: adminToken,
      body: {
        mode: 'COMPOSITE',
        categoryId,
        name: palovName,
        price: 45000,
        composite: {
          ingredients: [
            { name: guruchName, unit: 'kg', quantityPerPortion: 200, initialQty: 10, initialUnitCost: 14000 }, // 200g/portion, 10kg @ 14k/kg
            { name: goshtName,  unit: 'kg', quantityPerPortion: 150, initialQty: 5,  initialUnitCost: 80000 }, // 150g/portion, 5kg @ 80k/kg
          ],
        },
      },
    },
  );
  note(`palov menuItem id=${palov.id} name="${palov.name}"`);

  // Verify recipe + ingredients + purchases
  const recipe = await prisma.recipe.findUnique({
    where: { menuItemId: palov.id },
    include: { ingredients: { include: { ingredient: { include: { purchases: true } } } } },
  });
  if (!recipe) fail('No recipe created for palov');
  assertEq('palov recipe ingredient count', recipe.ingredients.length, 2);
  for (const ri of recipe.ingredients) {
    const ing = ri.ingredient;
    assertEq(`${ing.name} buyUnit`, ing.buyUnit, 'kg');
    assertEq(`${ing.name} recipeUnit`, ing.recipeUnit, 'gramm');
    assertEq(`${ing.name} purchases count`, ing.purchases.length, 1);
    const batch = ing.purchases[0];
    assertEq(`${ing.name} batch remainingQty matches quantityRecipeUnit`, batch.remainingQty.toFixed(0), batch.quantityRecipeUnit.toFixed(0));
  }

  // Sell 1 palov → consume 200g guruch + 150g go'sht; cogs = 200*14 + 150*80 = 2800+12000 = 14800
  step('5', 'Sell 1 palov — verify FIFO peel hits both ingredients with correct COGS');
  const tableId2 = await findFreeTable();
  const { body: order2 } = await http<{ id: string }>(
    'POST', '/api/orders', { token: waiterToken, body: { orderType: 'DINE_IN', tableId: tableId2 } },
  );
  await http('POST', `/api/orders/${order2.id}/items`, {
    token: waiterToken, body: { menuItemId: palov.id, quantity: 1 },
  });
  const palovLines = await prisma.orderLine.findMany({ where: { orderId: order2.id, isCanceled: false } });
  // Guruch cost-per-gram = 14000/1000 = 14; Go'sht cost-per-gram = 80000/1000 = 80.
  // Per portion COGS = 200*14 + 150*80 = 2800 + 12000 = 14800.
  assertEq('palov line cogsSnapshot', Number(palovLines[0]?.cogsSnapshot ?? 0).toFixed(0), '14800');

  // Verify ingredient stocks dropped: guruch from 10000g to 9800g, go'sht from 5000g to 4850g
  const guruchAfter = await prisma.ingredient.findFirst({ where: { name: guruchName }, include: { purchases: true } });
  const goshtAfter = await prisma.ingredient.findFirst({ where: { name: goshtName }, include: { purchases: true } });
  assertEq('Guruch stock after 1 palov', guruchAfter?.currentStock.toFixed(0), '9800');
  assertEq('Go\'sht stock after 1 palov', goshtAfter?.currentStock.toFixed(0), '4850');
  assertEq('Guruch batch.remainingQty', guruchAfter?.purchases[0].remainingQty.toFixed(0), '9800');
  assertEq('Go\'sht batch.remainingQty', goshtAfter?.purchases[0].remainingQty.toFixed(0), '4850');

  // ─── SERVICE ─────────────────────────────────────────────────────────────
  step('6', 'CREATE service-charge item — no stock, no recipe');
  const svcName = `Xizmat haqi ${uniqSuffix}`;
  const { body: svc } = await http<{ id: string; kind: string }>(
    'POST', '/api/menu/items',
    {
      token: adminToken,
      body: { mode: 'SERVICE', categoryId, name: svcName, price: 5000 },
    },
  );
  assertEq('service item kind', svc.kind, 'SERVICE');
  const svcIng = await prisma.ingredient.findUnique({ where: { selfMenuItemId: svc.id } });
  assertEq('service item has no self-ingredient', svcIng, null);
  const svcRecipe = await prisma.recipe.findUnique({ where: { menuItemId: svc.id } });
  assertEq('service item has no recipe', svcRecipe, null);

  console.log(c(32, '\n=== Menu create smoke passed ===\n'));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
