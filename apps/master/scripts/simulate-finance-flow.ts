// Production-grade finance smoke. Starts from a freshly seeded DB and exercises:
//   - Ingredient + Recipe creation (per-dish model)
//   - Purchases (auto-creates expenses under "Mahsulot xaridi")
//   - Operating expenses (Ijara + Yoqilg'i, under "Operatsion")
//   - 4 confirmed orders (cash, card, discount + split, debt)
//   - 1 walkout (lost revenue, no stock movement)
//   - Per-order ingredient consumption (300g + 160g mastava-meat, 800g osh-meat, 100g flour)
//
// Then pulls /api/reports/daily as OWNER and asserts every cell of the P&L
// against a manually-computed expected report. Also checks ingredient
// currentStock decremented by exactly the right amount, and the audit log
// has matching ORDER_CONFIRMED + PURCHASE_RECORDED rows.
//
// Prereq: DB just reset + seeded; master listening on $BASE_URL.
// Usage:  pnpm --filter @chayxana/master exec tsx scripts/simulate-finance-flow.ts

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN = { username: 'admin', password: 'admin123' };
const OWNER = { username: 'owner', password: 'owner123' };
const WAITER_BOTIR_PIN = '5678';
const WAITER_AZIZA_PIN = '2468';

const prisma = new PrismaClient();

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (n: string, msg: string) => console.log(`\n${c(36, `── ${n}`)} ${msg}`);
const ok = (m: string) => console.log(`  ${c(32, '✓')} ${m}`);
const info = (m: string) => console.log(`    ${c(2, m)}`);
const fail = (m: string) => { console.error(`  ${c(31, '✗')} ${m}`); process.exit(1); };

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
    fail(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return { status: res.status, body: parsed as T };
}

const eq = (label: string, actual: string | number, expected: string | number) => {
  if (String(actual) !== String(expected)) {
    fail(`${label}: actual=${actual} expected=${expected}`);
  }
  ok(`${label} = ${actual}`);
};

let adminToken = '';
let ownerToken = '';
let botirToken = '';
let azizaToken = '';

async function login() {
  const a = await http<{ token: string }>('POST', '/api/auth/login', { body: ADMIN });
  adminToken = a.body.token;
  const o = await http<{ token: string }>('POST', '/api/auth/login', { body: OWNER });
  ownerToken = o.body.token;
  const b = await http<{ token: string }>('POST', '/api/auth/login-pin', { body: { pin: WAITER_BOTIR_PIN } });
  botirToken = b.body.token;
  const z = await http<{ token: string }>('POST', '/api/auth/login-pin', { body: { pin: WAITER_AZIZA_PIN } });
  azizaToken = z.body.token;
}

// ──────────────────────────────────────────────────────────────────
// Setup: ingredients + recipes
// ──────────────────────────────────────────────────────────────────

const MASTAVA = 'seed-item-mastava';
const OSH = 'seed-item-osh';
const LAGMON = 'seed-item-lagmon-soup';

type Ingredient = { id: string; name: string };

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
  // isComplete is a UI/UX gate (admin marks the recipe "ready") and requires
  // every ingredient to have at least one purchase. Consumption doesn't read
  // this flag, so we skip the /complete call to keep the script linear.
}

// ──────────────────────────────────────────────────────────────────
// Setup: purchases + operating expenses
// ──────────────────────────────────────────────────────────────────

async function recordPurchase(ingredientId: string, kg: number, totalUzs: number) {
  await http('POST', '/api/purchases', {
    token: adminToken,
    body: {
      ingredientId,
      quantityBuyUnit: kg,
      totalCostUzs: totalUzs,
      occurredAt: new Date().toISOString(),
      supplierNote: 'simulate',
    },
  });
}

async function recordExpense(amount: number, reason: string, categoryId: string) {
  await http('POST', '/api/expenses', {
    token: adminToken,
    body: {
      categoryId,
      amount,
      reason,
      occurredAt: new Date().toISOString(),
      repayable: false,
    },
  });
}

// ──────────────────────────────────────────────────────────────────
// Order helpers
// ──────────────────────────────────────────────────────────────────

type Table = { id: string; name: string; activeOrderId: string | null };
type Order = {
  id: string;
  status: string;
  subtotalSnapshot: string | null;
  discountAmountSnapshot: string | null;
  totalSnapshot: string | null;
};
type Menu = { id: string; name: string; price: string };

let menu: Menu[] = [];
async function loadMenu() {
  const { body } = await http<Menu[]>('GET', '/api/menu/items', { token: adminToken });
  menu = body;
}
function itemId(name: string) {
  const m = menu.find((x) => x.name === name);
  if (!m) fail(`Menu item not found: ${name}`);
  return m!.id;
}
async function pickFreeTable(token: string): Promise<Table> {
  const { body } = await http<Table[]>('GET', '/api/tables', { token });
  const t = body.find((t) => !t.activeOrderId);
  if (!t) fail('No free tables left');
  return t!;
}

async function createOrder(token: string): Promise<Order> {
  const t = await pickFreeTable(token);
  const { body } = await http<Order>('POST', '/api/orders', {
    token,
    body: { orderType: 'DINE_IN', tableId: t.id },
  });
  return body;
}

async function addItem(token: string, orderId: string, menuItemId: string, qty: number) {
  await http('POST', `/api/orders/${orderId}/items`, {
    token,
    body: { menuItemId, quantity: qty },
  });
}
async function sendOrder(token: string, orderId: string) {
  await http('POST', `/api/orders/${orderId}/send`, { token });
}
async function confirm(orderId: string, body: unknown): Promise<Order> {
  const { body: out } = await http<Order>('POST', `/api/orders/${orderId}/confirm`, {
    token: adminToken,
    body,
  });
  return out;
}
async function walkout(orderId: string, reason: string) {
  await http('POST', `/api/orders/${orderId}/mark-walkout`, {
    token: adminToken,
    body: { reason },
  });
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

async function main() {
  step('0', 'Logins');
  await login();
  ok('admin / owner / botir / aziza all authenticated');

  step('1', 'Create ingredients + recipes for Mastava, Osh, Lag\'mon');
  const molMastava = await createIngredient({ name: "Mol go'shti (mastava)", parentMenuItemId: MASTAVA });
  const guruch = await createIngredient({ name: 'Guruch', parentMenuItemId: MASTAVA });
  const molOsh = await createIngredient({ name: "Mol go'shti (osh)", parentMenuItemId: OSH });
  const un = await createIngredient({ name: "Bug'doy uni", parentMenuItemId: LAGMON });
  ok(`4 ingredients created: ${[molMastava, guruch, molOsh, un].map((i) => i.name).join(', ')}`);

  step('2', 'Purchases (each creates Expense in Mahsulot xaridi)');
  await recordPurchase(molMastava.id, 5, 400_000);   // 80 000/kg
  await recordPurchase(guruch.id, 10, 120_000);       // 12 000/kg
  await recordPurchase(molOsh.id, 8, 640_000);        // 80 000/kg
  await recordPurchase(un.id, 6, 48_000);             // 8 000/kg
  const expectedPurchaseExpenses = 400_000 + 120_000 + 640_000 + 48_000;
  ok(`4 purchases recorded — total expense = ${expectedPurchaseExpenses}`);

  step('2b', 'Set recipes (purchases done, ingredients in stock)');
  await setRecipe(MASTAVA, [
    { ingredientId: molMastava.id, quantity: 150 },
    { ingredientId: guruch.id, quantity: 80 },
  ]);
  await setRecipe(OSH, [{ ingredientId: molOsh.id, quantity: 200 }]);
  await setRecipe(LAGMON, [{ ingredientId: un.id, quantity: 100 }]);
  ok('Recipes set: Mastava (150g+80g), Osh (200g), Lag\'mon (100g)');

  step('3', 'Operating expenses (Operatsion category)');
  // Find Operatsion category id
  const { body: cats } = await http<Array<{ id: string; name: string }>>('GET', '/api/expense-categories', { token: adminToken });
  const operatsion = cats.find((c) => c.name === 'Operatsion');
  if (!operatsion) fail('Operatsion category missing');
  await recordExpense(2_000_000, 'Mayning ijarasi', operatsion!.id);
  await recordExpense(150_000, "Yoqilg'i", operatsion!.id);
  const expectedOperatingNonPurchase = 2_000_000 + 150_000;
  ok(`2 operating expenses recorded — total = ${expectedOperatingNonPurchase}`);

  await loadMenu();

  step('4', 'Order 1 — Botir: 2 Mastava + 1 Osh + 2 Qora choy, CASH');
  {
    const o = await createOrder(botirToken);
    await addItem(botirToken, o.id, itemId('Mastava'), 2);
    await addItem(botirToken, o.id, itemId('Osh'), 1);
    await addItem(botirToken, o.id, itemId('Qora choy'), 2);
    await sendOrder(botirToken, o.id);
    const closed = await confirm(o.id, { payments: [{ method: 'CASH', amount: 103_000 }] });
    if (closed.status !== 'CLOSED') fail('Order 1 not CLOSED');
    ok(`Order 1 closed — total ${closed.totalSnapshot}`);
  }

  step('5', "Order 2 — Aziza: 1 Lag'mon + 1 Patir non, CARD");
  {
    const o = await createOrder(azizaToken);
    await addItem(azizaToken, o.id, itemId("Lag'mon sho'rva"), 1);
    await addItem(azizaToken, o.id, itemId('Patir non'), 1);
    await sendOrder(azizaToken, o.id);
    const closed = await confirm(o.id, { payments: [{ method: 'CARD', amount: 36_000 }] });
    if (closed.status !== 'CLOSED') fail('Order 2 not CLOSED');
    ok(`Order 2 closed — total ${closed.totalSnapshot}`);
  }

  step('6', 'Order 3 — Botir: 3 Osh + 2 Achichuk, 10% discount, split CASH+CARD');
  {
    const o = await createOrder(botirToken);
    await addItem(botirToken, o.id, itemId('Osh'), 3);
    await addItem(botirToken, o.id, itemId('Achichuk'), 2);
    await sendOrder(botirToken, o.id);
    const closed = await confirm(o.id, {
      discountId: 'seed-discount-10pct',
      payments: [
        { method: 'CASH', amount: 60_000 },
        { method: 'CARD', amount: 66_900 },
      ],
    });
    if (closed.status !== 'CLOSED') fail('Order 3 not CLOSED');
    if (Number(closed.totalSnapshot) !== 126_900) fail(`Order 3 total ${closed.totalSnapshot}`);
    if (Number(closed.discountAmountSnapshot) !== 14_100) fail(`Order 3 discount ${closed.discountAmountSnapshot}`);
    ok(`Order 3 closed — subtotal 141 000 / discount 14 100 / total ${closed.totalSnapshot}`);
  }

  step('7', "Order 4 — Aziza: 1 Mol kabob + 1 Ko'k choy, DEBT");
  {
    const o = await createOrder(azizaToken);
    await addItem(azizaToken, o.id, itemId('Mol kabob'), 1);
    await addItem(azizaToken, o.id, itemId("Ko'k choy"), 1);
    await sendOrder(azizaToken, o.id);
    const closed = await confirm(o.id, {
      payments: [{ method: 'DEBT', amount: 50_000 }],
      debt: { debtorName: 'Aziz Karzdor', debtorPhone: '+998901234567', note: 'simulate-finance' },
    });
    if (closed.status !== 'CLOSED') fail('Order 4 not CLOSED');
    ok(`Order 4 closed — DEBT 50 000`);
  }

  step('8', 'Order 5 — Botir: Somsa + choy, then WALKOUT');
  {
    const o = await createOrder(botirToken);
    await addItem(botirToken, o.id, itemId('Somsa'), 1);
    await addItem(botirToken, o.id, itemId('Qora choy'), 1);
    await sendOrder(botirToken, o.id);
    await walkout(o.id, 'mijoz to\'lovsiz ketdi');
    ok('Order 5 marked WALKOUT');
  }

  // ──────────────────────────────────────────────────────────────────
  step('9', 'Stock check (direct DB)');
  const stockMolM = await prisma.ingredient.findUnique({ where: { id: molMastava.id } });
  const stockGuruch = await prisma.ingredient.findUnique({ where: { id: guruch.id } });
  const stockMolO = await prisma.ingredient.findUnique({ where: { id: molOsh.id } });
  const stockUn = await prisma.ingredient.findUnique({ where: { id: un.id } });
  // Mastava 2 portions → 300g meat + 160g guruch. Plus mastava in Order 1 only.
  eq("Mol go'shti (mastava) stock (g)", Number(stockMolM!.currentStock), 5000 - 300);
  eq('Guruch stock (g)', Number(stockGuruch!.currentStock), 10000 - 160);
  // Osh: 1 portion in Order 1 + 3 portions in Order 3 = 4 portions × 200g = 800g
  eq("Mol go'shti (osh) stock (g)", Number(stockMolO!.currentStock), 8000 - 800);
  // Lag'mon: 1 portion → 100g un
  eq("Bug'doy uni stock (g)", Number(stockUn!.currentStock), 6000 - 100);

  // Weighted avg cost sanity: avg cost = totalCost / quantity in recipe units
  // mol-mastava: 400,000 / 5000g = 80/g
  eq("Mol go'shti (mastava) avg cost (UZS/g)", Number(stockMolM!.weightedAvgCost), 80);
  eq('Guruch avg cost (UZS/g)', Number(stockGuruch!.weightedAvgCost), 12);
  eq("Mol go'shti (osh) avg cost (UZS/g)", Number(stockMolO!.weightedAvgCost), 80);
  eq("Bug'doy uni avg cost (UZS/g)", Number(stockUn!.weightedAvgCost), 8);

  // ──────────────────────────────────────────────────────────────────
  step('10', 'Pull /api/reports/daily as OWNER and verify');
  const today = new Date().toISOString().slice(0, 10);
  const { body: report } = await http<{
    sales: { closedOrders: number; canceledOrders: number; walkoutOrders: number; grossSales: string; discounts: string; netSales: string; debtSales: string; serviceCharge: string };
    cashflow: { orderCash: string; orderCard: string; debtRepaymentsCash: string; debtRepaymentsCard: string; realCashIn: string };
    expenses: { gross: string; reversal: string; net: string; operating: string; pendingRepayable: string };
    results: { salesBasedProfit: string; cashflowBasedNet: string };
    debtSnapshot: { openedTodayCount: number; openedTodayAmount: string; repaidTodayAmount: string; outstandingTotal: string };
  }>('GET', `/api/reports/daily?date=${today}`, { token: ownerToken });

  // Sales
  eq('sales.closedOrders', report.sales.closedOrders, 4);
  eq('sales.canceledOrders', report.sales.canceledOrders, 0);
  eq('sales.walkoutOrders', report.sales.walkoutOrders, 1);
  eq('sales.grossSales', report.sales.grossSales, '330000');
  eq('sales.discounts', report.sales.discounts, '14100');
  eq('sales.netSales', report.sales.netSales, '315900');
  eq('sales.debtSales', report.sales.debtSales, '50000');
  eq('sales.serviceCharge', report.sales.serviceCharge, '0');

  // Cashflow
  eq('cashflow.orderCash', report.cashflow.orderCash, '163000');
  eq('cashflow.orderCard', report.cashflow.orderCard, '102900');
  eq('cashflow.debtRepaymentsCash', report.cashflow.debtRepaymentsCash, '0');
  eq('cashflow.debtRepaymentsCard', report.cashflow.debtRepaymentsCard, '0');
  eq('cashflow.realCashIn', report.cashflow.realCashIn, '265900');

  // Expenses (operating includes purchase expenses since they hit "Mahsulot xaridi" category)
  const expectedExpensesGross = expectedPurchaseExpenses + expectedOperatingNonPurchase;
  eq('expenses.gross', report.expenses.gross, String(expectedExpensesGross));
  eq('expenses.reversal', report.expenses.reversal, '0');
  eq('expenses.net', report.expenses.net, String(expectedExpensesGross));
  eq('expenses.operating', report.expenses.operating, String(expectedExpensesGross));
  eq('expenses.pendingRepayable', report.expenses.pendingRepayable, '0');

  // Results — profit math
  const expectedSalesProfit = 315_900 - expectedExpensesGross;       // -3,042,100
  const expectedCashflowNet = 265_900 - expectedExpensesGross;        // -3,092,100
  eq('results.salesBasedProfit', report.results.salesBasedProfit, String(expectedSalesProfit));
  eq('results.cashflowBasedNet', report.results.cashflowBasedNet, String(expectedCashflowNet));

  // Debt snapshot
  eq('debtSnapshot.openedTodayCount', report.debtSnapshot.openedTodayCount, 1);
  eq('debtSnapshot.openedTodayAmount', report.debtSnapshot.openedTodayAmount, '50000');
  eq('debtSnapshot.repaidTodayAmount', report.debtSnapshot.repaidTodayAmount, '0');
  eq('debtSnapshot.outstandingTotal', report.debtSnapshot.outstandingTotal, '50000');

  // ──────────────────────────────────────────────────────────────────
  step('11', 'Audit log sanity');
  const auditConfirmed = await prisma.auditLog.count({ where: { action: 'ORDER_CONFIRMED' } });
  const auditPurchased = await prisma.auditLog.count({ where: { action: 'PURCHASE_RECORDED' } });
  const auditWalkout = await prisma.auditLog.count({ where: { action: 'WALKOUT_MARKED' } });
  eq('ORDER_CONFIRMED audit rows', auditConfirmed, 4);
  eq('PURCHASE_RECORDED audit rows', auditPurchased, 4);
  eq('WALKOUT_MARKED audit rows', auditWalkout, 1);

  console.log(`\n${c(32, '════════════════════════════════════════════════════════════')}`);
  console.log(`${c(32, '  Finance report verified. Every cell matches the manual P&L.')}`);
  console.log(`${c(32, '════════════════════════════════════════════════════════════')}\n`);
  info(`  Gross sales (4 closed orders): 330 000`);
  info(`  Discount: 14 100  →  Net sales: 315 900`);
  info(`  Cash in: 163 000   Card in: 102 900   Debt: 50 000`);
  info(`  Expenses gross: ${expectedExpensesGross.toLocaleString('en-US').replace(/,/g, ' ')}`);
  info(`  Sales-based profit (loss): ${expectedSalesProfit.toLocaleString('en-US').replace(/,/g, ' ')}`);
  info(`  Cashflow-based net (loss): ${expectedCashflowNet.toLocaleString('en-US').replace(/,/g, ' ')}`);
  info(`  Outstanding debt: 50 000  (Aziz Karzdor)`);
}

main()
  .catch((err) => {
    console.error(c(31, 'FATAL:'), err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
