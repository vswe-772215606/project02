// FIFO inventory smoke — drives the running master via HTTP + verifies the
// resulting DB state directly. Mirrors the user's scenario:
//   * Record purchase A: qty × cheap_unit_cost
//   * Record purchase B: qty × expensive_unit_cost
//   * Sell N portions of a dish whose recipe uses the ingredient — verify
//     that COGS peels from A first (oldest-first) and only spills into B
//     after A is exhausted
//   * Cancel the order line — verify qty restored to the SAME batches
//   * Soft-delete a partially-consumed batch — stock falls only by the
//     unconsumed remainder; past line.cogsSnapshot stays frozen.
//
// Prereq: dev:master running on $BASE_URL (default http://localhost:4000).
// Usage:  pnpm --filter @chayxana/master exec tsx scripts/smoke-fifo.ts

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

async function pickDishAndIngredient() {
  const items = await prisma.menuItem.findMany({
    where: { kind: 'FOOD', isActive: true, recipe: { isNot: null } },
    include: { recipe: { include: { ingredients: { include: { ingredient: true } } } } },
  });
  for (const item of items) {
    // Pick a dish whose recipe has exactly one ingredient — simplifies the
    // expected-COGS math since the only thing varying is that ingredient.
    if (item.recipe?.ingredients.length === 1) {
      const ri = item.recipe.ingredients[0];
      if (ri.ingredient.isActive) {
        return { menuItem: item, ingredient: ri.ingredient, recipeQty: ri.quantity };
      }
    }
  }
  return null;
}

async function resetIngredientState(ingredientId: string) {
  // Wipe FIFO state for the chosen ingredient so the smoke starts clean.
  // We don't care about audit/expense rows for the smoke — these are just
  // marked DELETED in the Purchase table and the ingredient stock is zeroed.
  await prisma.$executeRaw`UPDATE "Purchase" SET "remainingQty" = 0, "status" = 'DELETED' WHERE "ingredientId" = ${ingredientId} AND "status" = 'ACTIVE'`;
  await prisma.ingredient.update({ where: { id: ingredientId }, data: { currentStock: 0 } });
}

async function findFreeTable(): Promise<string> {
  const t = await prisma.table.findFirst({
    where: { isActive: true, orders: { none: { status: { in: ['DRAFT', 'SENT'] } } } },
  });
  if (!t) fail('No free table');
  return t.id;
}

async function main() {
  console.log(c(35, '\n=== FIFO inventory smoke ===\n'));

  step('1', 'Login admin + waiter');
  const adminToken = await loginAdmin();
  const waiterToken = await loginWaiter();
  ok('logged in');

  step('2', 'Pick a single-ingredient dish');
  const picked = await pickDishAndIngredient();
  if (!picked) fail('No FOOD dish with exactly one recipe ingredient');
  const { menuItem, ingredient, recipeQty } = picked;
  note(`dish="${menuItem.name}"  ingredient="${ingredient.name}"  recipeQty/portion=${recipeQty} ${ingredient.recipeUnit}`);

  step('3', 'Reset FIFO state for the chosen ingredient');
  await resetIngredientState(ingredient.id);
  const ingAfterReset = await prisma.ingredient.findUnique({ where: { id: ingredient.id } });
  assertEq('currentStock after reset', ingAfterReset?.currentStock.toFixed(0), '0');

  step('4', 'Record Purchase A: 10 buy-units @ 20000 each');
  const { body: a } = await http<{ id: string; remainingQty: string; unitCostPerRecipeUnit: string; quantityRecipeUnit: string }>(
    'POST',
    '/api/purchases',
    {
      token: adminToken,
      body: {
        ingredientId: ingredient.id,
        quantityBuyUnit: 10,
        totalCostUzs: 10 * 20000,
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
        supplierNote: 'smoke-A',
      },
    },
  );
  note(`A: id=${a.id} qty=${a.quantityRecipeUnit} unit=${a.unitCostPerRecipeUnit} rem=${a.remainingQty}`);
  assertEq('A.remainingQty == quantityRecipeUnit', a.remainingQty, a.quantityRecipeUnit);

  step('5', 'Record Purchase B: 10 buy-units @ 21000 each');
  const { body: b } = await http<{ id: string; remainingQty: string; unitCostPerRecipeUnit: string; quantityRecipeUnit: string }>(
    'POST',
    '/api/purchases',
    {
      token: adminToken,
      body: {
        ingredientId: ingredient.id,
        quantityBuyUnit: 10,
        totalCostUzs: 10 * 21000,
        occurredAt: new Date().toISOString(),
        supplierNote: 'smoke-B',
      },
    },
  );
  note(`B: id=${b.id} qty=${b.quantityRecipeUnit} unit=${b.unitCostPerRecipeUnit} rem=${b.remainingQty}`);

  step('6', 'Waiter: open DRAFT order and add 1 portion of the dish');
  const tableId = await findFreeTable();
  const { body: order } = await http<{ id: string }>(
    'POST', '/api/orders',
    { token: waiterToken, body: { orderType: 'DINE_IN', tableId } },
  );
  await http(
    'POST', `/api/orders/${order.id}/items`,
    { token: waiterToken, body: { menuItemId: menuItem.id, quantity: 1 } },
  );
  const orderAfter1 = await prisma.order.findUnique({
    where: { id: order.id },
    include: { lines: { where: { isCanceled: false } } },
  });
  const line = orderAfter1?.lines[0];
  if (!line) fail('No line created');
  const aUnitCost = Number(a.unitCostPerRecipeUnit); // per recipeUnit (e.g. per gram)
  const bUnitCost = Number(b.unitCostPerRecipeUnit);
  const expectedCogs1 = Number(recipeQty) * 1 * aUnitCost;
  assertEq('line.cogsSnapshot after 1 portion (from A)', Number(line.cogsSnapshot ?? 0).toFixed(0), expectedCogs1.toFixed(0));
  const aAfter1 = await prisma.purchase.findUnique({ where: { id: a.id } });
  assertEq('A.remainingQty after 1 peel', Number(aAfter1?.remainingQty).toFixed(3), (Number(a.quantityRecipeUnit) - Number(recipeQty)).toFixed(3));
  const bAfter1 = await prisma.purchase.findUnique({ where: { id: b.id } });
  assertEq('B.remainingQty unchanged', bAfter1?.remainingQty.toFixed(3), b.remainingQty);

  step('7', 'Cancel order from DRAFT — qty restored to source batches');
  await http('POST', `/api/orders/${order.id}/cancel`, { token: waiterToken, body: { reason: 'smoke-restore' } });
  const aAfterCancel = await prisma.purchase.findUnique({ where: { id: a.id } });
  assertEq('A.remainingQty after cancel', aAfterCancel?.remainingQty.toFixed(3), a.quantityRecipeUnit);

  step('8', 'New order: consume enough portions to exhaust A and bite into B');
  const portionsToExhaustA = Math.ceil(Number(a.quantityRecipeUnit) / Number(recipeQty));
  const portionsToTake = portionsToExhaustA + 1;
  const tableId2 = await findFreeTable();
  const { body: order2 } = await http<{ id: string }>(
    'POST', '/api/orders',
    { token: waiterToken, body: { orderType: 'DINE_IN', tableId: tableId2 } },
  );
  await http(
    'POST', `/api/orders/${order2.id}/items`,
    { token: waiterToken, body: { menuItemId: menuItem.id, quantity: portionsToTake } },
  );
  const order2After = await prisma.order.findUnique({
    where: { id: order2.id },
    include: { lines: { where: { isCanceled: false } } },
  });
  const line2 = order2After?.lines[0];
  if (!line2) fail('No line2 created');
  const totalQtyNeeded = portionsToTake * Number(recipeQty);
  const fromA = Math.min(Number(a.quantityRecipeUnit), totalQtyNeeded);
  const fromB = totalQtyNeeded - fromA;
  const expectedCogs2 = fromA * aUnitCost + fromB * bUnitCost;
  assertEq(
    'line2.cogsSnapshot after multi-batch peel',
    Number(line2.cogsSnapshot ?? 0).toFixed(0),
    expectedCogs2.toFixed(0),
  );
  const aAfterMulti = await prisma.purchase.findUnique({ where: { id: a.id } });
  const bAfterMulti = await prisma.purchase.findUnique({ where: { id: b.id } });
  assertEq('A.remainingQty after exhaust', aAfterMulti?.remainingQty.toFixed(3), (Number(a.quantityRecipeUnit) - fromA).toFixed(3));
  assertEq('B.remainingQty after partial peel', bAfterMulti?.remainingQty.toFixed(3), (Number(b.quantityRecipeUnit) - fromB).toFixed(3));
  note(`took ${fromA} from A, ${fromB} from B`);

  step('9', 'Soft-delete B (partially consumed) — stock drops by remainder only, line.cogsSnapshot untouched');
  const stockBefore = (await prisma.ingredient.findUnique({ where: { id: ingredient.id } }))?.currentStock;
  const cogsBefore = (await prisma.orderLine.findUnique({ where: { id: line2.id } }))?.cogsSnapshot;
  const bRemBeforeDelete = Number(bAfterMulti?.remainingQty);
  await http('POST', `/api/purchases/${b.id}/delete`, { token: adminToken, body: { note: 'smoke-delete-partial' } });
  const stockAfter = (await prisma.ingredient.findUnique({ where: { id: ingredient.id } }))?.currentStock;
  const cogsAfter = (await prisma.orderLine.findUnique({ where: { id: line2.id } }))?.cogsSnapshot;
  const bAfterDelete = await prisma.purchase.findUnique({ where: { id: b.id } });
  assertEq('B.status after delete', bAfterDelete?.status, 'DELETED');
  assertEq('B.remainingQty zeroed', bAfterDelete?.remainingQty.toFixed(3), '0.000');
  assertEq(
    'currentStock dropped by B.remainingQty only',
    (Number(stockBefore) - bRemBeforeDelete).toFixed(3),
    Number(stockAfter).toFixed(3),
  );
  assertEq('past line2.cogsSnapshot UNCHANGED', Number(cogsAfter ?? 0).toFixed(0), Number(cogsBefore ?? 0).toFixed(0));

  console.log(c(32, '\n=== FIFO smoke passed ===\n'));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
