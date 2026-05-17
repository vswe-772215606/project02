// Smoke for the debt-repayment lifecycle and repayable-expense (avans) lifecycle.
//
// Part 1 — Debt: confirm an order with DEBT, then walk the debt through partial
//   repayments (status OPEN → PARTIAL → PARTIAL → PAID). Open a second debt and
//   probe the "write-off" endpoint (note: as of writing, no such endpoint exists
//   in the backend — the DebtStatus enum is OPEN | PARTIAL | PAID only).
//
// Part 2 — Repayable expense (avans): create, partial return, fully-returned
//   return, then create another avans and write it off. Verify
//   `repayStatus` transitions and the `remainingAmount` field after each step.
//
// Part 3 — Pull /api/reports/daily as OWNER and assert every cell against the
//   math derived from the actual server code (debt.service.ts +
//   expense.service.ts + reports.service.ts).
//
// Prereq: DB just reset + seeded; master listening on $BASE_URL.
// Usage:  pnpm --filter @chayxana/master exec tsx scripts/simulate-debts-avans-flow.ts

import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const ADMIN = { username: 'admin', password: 'admin123' };
const OWNER = { username: 'owner', password: 'owner123' };
const WAITER_PIN = '5678'; // Botir

const prisma = new PrismaClient();

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (n: string, msg: string) => console.log(`\n${c(36, `── ${n}`)} ${msg}`);
const ok = (m: string) => console.log(`  ${c(32, '✓')} ${m}`);
const info = (m: string) => console.log(`    ${c(2, m)}`);
const warn = (m: string) => console.log(`  ${c(33, '⚠')} ${m}`);
const fail = (m: string): never => { console.error(`  ${c(31, '✗')} ${m}`); process.exit(1); };

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

const eq = (label: string, actual: unknown, expected: unknown) => {
  if (String(actual) !== String(expected)) {
    fail(`${label}: actual=${actual} expected=${expected}`);
  }
  ok(`${label} = ${actual}`);
};

// ──────────────────────────────────────────────────────────────────
// Auth + setup
// ──────────────────────────────────────────────────────────────────

let adminToken = '';
let ownerToken = '';
let waiterToken = '';

async function login() {
  const a = await http<{ token: string }>('POST', '/api/auth/login', { body: ADMIN });
  adminToken = a.body.token;
  const o = await http<{ token: string }>('POST', '/api/auth/login', { body: OWNER });
  ownerToken = o.body.token;
  const w = await http<{ token: string }>('POST', '/api/auth/login-pin', { body: { pin: WAITER_PIN } });
  waiterToken = w.body.token;
}

type Table = { id: string; name: string; activeOrderId: string | null };
type Menu = { id: string; name: string; price: string };
type OrderResp = { id: string; status: string; totalSnapshot: string | null };

let menu: Menu[] = [];
async function loadMenu() {
  const { body } = await http<Menu[]>('GET', '/api/menu/items', { token: adminToken });
  menu = body;
}
function itemId(name: string): string {
  const m = menu.find((x) => x.name === name);
  if (!m) return fail(`Menu item not found: ${name}`);
  return m.id;
}
async function pickFreeTable(token: string): Promise<Table> {
  const { body } = await http<Table[]>('GET', '/api/tables', { token });
  const t = body.find((tb) => !tb.activeOrderId);
  if (!t) return fail('No free tables left');
  return t;
}

async function createOrderWithItems(items: Array<{ name: string; qty: number }>): Promise<OrderResp> {
  const t = await pickFreeTable(waiterToken);
  const { body: created } = await http<OrderResp>('POST', '/api/orders', {
    token: waiterToken,
    body: { orderType: 'DINE_IN', tableId: t.id },
  });
  for (const it of items) {
    await http('POST', `/api/orders/${created.id}/items`, {
      token: waiterToken,
      body: { menuItemId: itemId(it.name), quantity: it.qty },
    });
  }
  await http('POST', `/api/orders/${created.id}/send`, { token: waiterToken });
  return created;
}

async function confirmDebt(orderId: string, amount: number, debtorName: string, debtorPhone?: string): Promise<OrderResp> {
  const { body } = await http<OrderResp>('POST', `/api/orders/${orderId}/confirm`, {
    token: adminToken,
    body: {
      payments: [{ method: 'DEBT', amount }],
      debt: { debtorName, debtorPhone, note: 'simulate-debts-avans' },
    },
  });
  if (body.status !== 'CLOSED') fail(`Order ${orderId} not CLOSED (got ${body.status})`);
  return body;
}

// ──────────────────────────────────────────────────────────────────
// Debt helpers
// ──────────────────────────────────────────────────────────────────

type DebtListItem = {
  id: string;
  orderId: string;
  status: 'OPEN' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF';
  originalAmount: string;
  remainingAmount: string;
  debtorName: string;
  writtenOffAt?: string | null;
  writtenOffReason?: string | null;
};
type DebtDetail = DebtListItem & {
  repayments: Array<{ id: string; amount: string; method: 'CASH' | 'CARD' }>;
};
type DebtResp = DebtDetail;

async function listDebts(): Promise<DebtListItem[]> {
  const { body } = await http<{ items: DebtListItem[] }>('GET', '/api/debts', { token: adminToken });
  return body.items;
}
async function getDebt(id: string): Promise<DebtDetail> {
  const { body } = await http<DebtDetail>('GET', `/api/debts/${id}`, { token: adminToken });
  return body;
}
async function repayDebt(id: string, amount: number, method: 'CASH' | 'CARD'): Promise<DebtDetail> {
  const { body } = await http<DebtDetail>('POST', `/api/debts/${id}/repayments`, {
    token: adminToken,
    body: { amount, method },
    expectStatus: 201,
  });
  return body;
}

// ──────────────────────────────────────────────────────────────────
// Expense helpers
// ──────────────────────────────────────────────────────────────────

type ExpenseResp = {
  id: string;
  amount: string;
  repayable: boolean;
  repayStatus: 'NOT_REPAYABLE' | 'PENDING' | 'PARTIAL' | 'RETURNED' | 'WRITTEN_OFF';
  remainingAmount: string | null;
  returnedTotal: string | null;
  writtenOffAt: string | null;
};

async function createAvans(amount: number, reason: string): Promise<ExpenseResp> {
  const { body } = await http<ExpenseResp>('POST', '/api/expenses', {
    token: adminToken,
    body: {
      amount,
      reason,
      occurredAt: new Date().toISOString(),
      repayable: true,
    },
    expectStatus: 201,
  });
  return body;
}
async function recordReturn(id: string, amount: number): Promise<ExpenseResp> {
  const { body } = await http<ExpenseResp>('POST', `/api/expenses/${id}/returns`, {
    token: adminToken,
    body: { amount, receivedAt: new Date().toISOString() },
    expectStatus: 201,
  });
  return body;
}
async function writeOffExpense(id: string, reason: string): Promise<ExpenseResp> {
  const { body } = await http<ExpenseResp>('POST', `/api/expenses/${id}/write-off`, {
    token: adminToken,
    body: { reason },
  });
  return body;
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────

async function main() {
  step('0', 'Logins (admin / owner / waiter Botir)');
  await login();
  await loadMenu();
  ok('admin / owner / waiter authenticated');

  // ────────────────────────────────────────────────────────────────
  // PART 1 — Debt lifecycle
  // ────────────────────────────────────────────────────────────────

  step('1.1', "Order 1: Mol kabob + Qora choy → DEBT 50 000 (Akmal Karzdor)");
  const order1 = await createOrderWithItems([
    { name: 'Mol kabob', qty: 1 },
    { name: 'Qora choy', qty: 1 },
  ]);
  const order1Closed = await confirmDebt(order1.id, 50_000, 'Akmal Karzdor', '+998901234567');
  eq('order1.total', order1Closed.totalSnapshot, '50000');

  step('1.2', 'GET /api/debts → locate the new debt');
  const debts1 = await listDebts();
  const debt1 = debts1.find((d) => d.orderId === order1.id);
  if (!debt1) return fail('Debt for order1 not found in /api/debts');
  eq('debt1.status', debt1.status, 'OPEN');
  eq('debt1.originalAmount', debt1.originalAmount, '50000');
  eq('debt1.remainingAmount', debt1.remainingAmount, '50000');
  eq('debt1.debtorName', debt1.debtorName, 'Akmal Karzdor');

  step('1.3', 'Partial repayment: 20 000 CASH → status PARTIAL, remaining 30 000');
  await repayDebt(debt1.id, 20_000, 'CASH');
  const debt1AfterA = await getDebt(debt1.id);
  eq('debt1.status (after 20k cash)', debt1AfterA.status, 'PARTIAL');
  eq('debt1.remainingAmount (after 20k cash)', debt1AfterA.remainingAmount, '30000');

  step('1.4', 'Second partial: 15 000 CARD → status PARTIAL, remaining 15 000');
  await repayDebt(debt1.id, 15_000, 'CARD');
  const debt1AfterB = await getDebt(debt1.id);
  eq('debt1.status (after +15k card)', debt1AfterB.status, 'PARTIAL');
  eq('debt1.remainingAmount (after +15k card)', debt1AfterB.remainingAmount, '15000');

  step('1.5', 'Final repayment: 15 000 CASH → status PAID, remaining 0');
  await repayDebt(debt1.id, 15_000, 'CASH');
  const debt1AfterC = await getDebt(debt1.id);
  eq('debt1.status (after final 15k cash)', debt1AfterC.status, 'PAID');
  eq('debt1.remainingAmount (after final)', debt1AfterC.remainingAmount, '0');
  eq('debt1.repayments.length', debt1AfterC.repayments.length, 3);

  step('1.6', "Order 2: Somsa ×4 → DEBT 30 000 (Bobur Karzdor) — kept OPEN");
  // Use exactly 30 000 worth of items. Somsa price varies; build via menu.
  // Cheapest deterministic path: use Mol kabob unit price = 42 000 doesn't match.
  // Inspect what items add to 30 000 cleanly: Qora choy 8 000 × 3 = 24 000 +
  // Patir non 6 000 (= 30 000). Verify both exist.
  const somsaPrice = menu.find((m) => m.name === 'Somsa')?.price;
  info(`Somsa unit price (for ref): ${somsaPrice}`);
  // We'll construct: 3× Qora choy (24 000) + 1× Patir non (6 000) = 30 000
  const order2 = await createOrderWithItems([
    { name: 'Qora choy', qty: 3 },
    { name: 'Patir non', qty: 1 },
  ]);
  const order2Closed = await confirmDebt(order2.id, 30_000, 'Bobur Karzdor');
  eq('order2.total', order2Closed.totalSnapshot, '30000');

  const debts2 = await listDebts();
  const debt2 = debts2.find((d) => d.orderId === order2.id);
  if (!debt2) return fail('Debt for order2 not found');
  eq('debt2.status', debt2.status, 'OPEN');
  eq('debt2.remainingAmount', debt2.remainingAmount, '30000');

  step('1.7', "Debt write-off — debt2 marked WRITTEN_OFF");
  const writeOffRes = await http<DebtResp>('POST', `/api/debts/${debt2.id}/write-off`, {
    token: adminToken,
    body: { reason: 'Mijoz topilmadi' },
  });
  eq('debt2.status (after write-off)', writeOffRes.body.status, 'WRITTEN_OFF');
  // remainingAmount in DB stays at original loss; report excludes it from outstanding.
  eq('debt2.remainingAmount (DB)', writeOffRes.body.remainingAmount, '30000');
  if (!writeOffRes.body.writtenOffAt) fail('writtenOffAt should be set');
  if (writeOffRes.body.writtenOffReason !== 'Mijoz topilmadi') fail('writtenOffReason mismatch');
  ok('debt2 written off (status WRITTEN_OFF, audit row will be logged)');

  // Idempotency / state guard
  const repeat = await fetch(`${BASE_URL}/api/debts/${debt2.id}/write-off`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: 'again' }),
  });
  if (repeat.status !== 409) fail(`Second write-off should be 409 ALREADY_WRITTEN_OFF, got ${repeat.status}`);
  ok('Second write-off attempt rejected with 409');

  // ────────────────────────────────────────────────────────────────
  // PART 2 — Repayable expense (avans) lifecycle
  // ────────────────────────────────────────────────────────────────

  step('2.1', 'Create avans: 200 000 to "Aziza opaga avans"');
  const avans1 = await createAvans(200_000, 'Aziza opaga avans');
  eq('avans1.repayable', avans1.repayable, 'true');
  eq('avans1.repayStatus', avans1.repayStatus, 'PENDING');
  eq('avans1.amount', avans1.amount, '200000');
  eq('avans1.remainingAmount', avans1.remainingAmount, '200000');

  step('2.2', 'Partial return: 60 000 → status PARTIAL, remaining 140 000');
  const avans1AfterA = await recordReturn(avans1.id, 60_000);
  eq('avans1.repayStatus (after 60k)', avans1AfterA.repayStatus, 'PARTIAL');
  eq('avans1.remainingAmount (after 60k)', avans1AfterA.remainingAmount, '140000');
  eq('avans1.returnedTotal (after 60k)', avans1AfterA.returnedTotal, '60000');

  step('2.3', 'Final return: 140 000 → status RETURNED, remaining 0');
  const avans1AfterB = await recordReturn(avans1.id, 140_000);
  eq('avans1.repayStatus (after +140k)', avans1AfterB.repayStatus, 'RETURNED');
  eq('avans1.remainingAmount (after +140k)', avans1AfterB.remainingAmount, '0');
  eq('avans1.returnedTotal (after +140k)', avans1AfterB.returnedTotal, '200000');

  step('2.4', 'Second avans: 150 000 to "Botir aka" (will be written off)');
  const avans2 = await createAvans(150_000, 'Botir akaga avans');
  eq('avans2.repayStatus', avans2.repayStatus, 'PENDING');
  eq('avans2.remainingAmount', avans2.remainingAmount, '150000');

  step('2.5', 'Write-off avans2 → status WRITTEN_OFF');
  const avans2WrittenOff = await writeOffExpense(avans2.id, 'Pul qaytarilmadi');
  eq('avans2.repayStatus', avans2WrittenOff.repayStatus, 'WRITTEN_OFF');
  // After write-off, remainingAmount is computed from amount − returned; no
  // return was recorded, so remaining = 150 000.
  eq('avans2.remainingAmount (after write-off)', avans2WrittenOff.remainingAmount, '150000');
  if (!avans2WrittenOff.writtenOffAt) fail('avans2.writtenOffAt should be set');
  ok(`avans2.writtenOffAt = ${avans2WrittenOff.writtenOffAt}`);

  // ────────────────────────────────────────────────────────────────
  // PART 3 — Verify /api/reports/daily
  // ────────────────────────────────────────────────────────────────

  step('3.0', 'Pull /api/reports/daily as OWNER');
  const today = new Date().toISOString().slice(0, 10);
  const { body: report } = await http<{
    sales: { closedOrders: number; canceledOrders: number; walkoutOrders: number; grossSales: string; discounts: string; netSales: string; debtSales: string; serviceCharge: string };
    cashflow: { orderCash: string; orderCard: string; debtRepaymentsCash: string; debtRepaymentsCard: string; realCashIn: string };
    expenses: { gross: string; reversal: string; net: string; operating: string; pendingRepayable: string };
    results: { salesBasedProfit: string; cashflowBasedNet: string };
    debtSnapshot: { openedTodayCount: number; openedTodayAmount: string; repaidTodayAmount: string; outstandingTotal: string };
  }>('GET', `/api/reports/daily?date=${today}`, { token: ownerToken });

  step('3.1', 'Sales totals');
  eq('sales.closedOrders', report.sales.closedOrders, 2);
  eq('sales.canceledOrders', report.sales.canceledOrders, 0);
  eq('sales.walkoutOrders', report.sales.walkoutOrders, 0);
  eq('sales.grossSales', report.sales.grossSales, '80000');         // 50k + 30k
  eq('sales.discounts', report.sales.discounts, '0');
  eq('sales.netSales', report.sales.netSales, '80000');
  eq('sales.debtSales', report.sales.debtSales, '80000');           // both orders DEBT
  eq('sales.serviceCharge', report.sales.serviceCharge, '0');

  step('3.2', 'Cashflow');
  // Orders: 0 cash + 0 card (both DEBT).
  // Debt repayments today: 20 000 cash + 15 000 card + 15 000 cash = 50 000 total
  eq('cashflow.orderCash', report.cashflow.orderCash, '0');
  eq('cashflow.orderCard', report.cashflow.orderCard, '0');
  eq('cashflow.debtRepaymentsCash', report.cashflow.debtRepaymentsCash, '35000');
  eq('cashflow.debtRepaymentsCard', report.cashflow.debtRepaymentsCard, '15000');
  eq('cashflow.realCashIn', report.cashflow.realCashIn, '50000');

  step('3.3', 'Expenses');
  // Expense rows on the day:
  //   avans1 = 200 000 (ACTIVE, repayable, NOT written off, fully returned via separate
  //                     ExpenseReturn rows of 60k + 140k)
  //   avans2 = 150 000 (ACTIVE, repayable, written off — 0 returned)
  //
  // expense.service.ts listByDate math:
  //   gross += amount   for ACTIVE/REVERSED rows (returns DON'T reduce gross)
  //   net = gross − reversal
  //   operating:
  //     - if !repayable → amount
  //     - elif writtenOffAt → amount − returned (loss portion)
  //     - else (pending repayable) → 0, but adds (amount − returned) to pendingRepayable
  //
  // So with avans1 fully returned (NOT written off):
  //   - It's still "pending repayable" by the code path because !item.writtenOffAt.
  //   - returned = 200 000, so pendingRepayable contribution = 200 000 − 200 000 = 0.
  //   - operating contribution = 0.
  // avans2 written off, returned = 0:
  //   - operating contribution = 150 000 − 0 = 150 000.
  //   - pendingRepayable contribution = 0.
  //
  // Totals:
  //   gross = 200 000 + 150 000 = 350 000
  //   reversal = 0
  //   net = 350 000
  //   operating = 0 + 150 000 = 150 000
  //   pendingRepayable = 0 + 0 = 0
  eq('expenses.gross', report.expenses.gross, '350000');
  eq('expenses.reversal', report.expenses.reversal, '0');
  eq('expenses.net', report.expenses.net, '350000');
  eq('expenses.operating', report.expenses.operating, '150000');
  eq('expenses.pendingRepayable', report.expenses.pendingRepayable, '0');

  step('3.4', 'Results (profit math)');
  // salesBasedProfit = netSales − operating = 80 000 − 150 000 = -70 000
  // cashflowBasedNet = realCashIn − expenseNet = 50 000 − 350 000 = -300 000
  eq('results.salesBasedProfit', report.results.salesBasedProfit, '-70000');
  eq('results.cashflowBasedNet', report.results.cashflowBasedNet, '-300000');

  step('3.5', 'Debt snapshot');
  // outstandingTotal excludes WRITTEN_OFF debts via buildDebtLedger's
  // writtenOffAsOfDay branch. Debt 1: fully repaid → 0. Debt 2: WRITTEN_OFF
  // → counted as 0 outstanding (the loss is implicit in cashflow). So 0.
  eq('debtSnapshot.openedTodayCount', report.debtSnapshot.openedTodayCount, 2);
  eq('debtSnapshot.openedTodayAmount', report.debtSnapshot.openedTodayAmount, '80000');
  eq('debtSnapshot.repaidTodayAmount', report.debtSnapshot.repaidTodayAmount, '50000');
  eq('debtSnapshot.outstandingTotal', report.debtSnapshot.outstandingTotal, '0');

  // ────────────────────────────────────────────────────────────────
  // Verification gate — DB sanity
  // ────────────────────────────────────────────────────────────────
  step('4', 'DB sanity (Prisma direct)');
  const dbDebt1 = await prisma.debt.findUnique({ where: { id: debt1.id } });
  const dbDebt2 = await prisma.debt.findUnique({ where: { id: debt2.id } });
  if (!dbDebt1 || !dbDebt2) return fail('Debts missing in DB');
  eq('DB debt1.status', dbDebt1.status, 'PAID');
  eq('DB debt1.remainingAmount', dbDebt1.remainingAmount.toFixed(0), '0');
  eq('DB debt2.status', dbDebt2.status, 'WRITTEN_OFF');
  // Write-off does NOT zero remainingAmount in the DB — keeps the loss recorded.
  eq('DB debt2.remainingAmount', dbDebt2.remainingAmount.toFixed(0), '30000');
  if (!dbDebt2.writtenOffAt) fail('DB debt2.writtenOffAt should be set');
  eq('DB debt2.writtenOffReason', dbDebt2.writtenOffReason, 'Mijoz topilmadi');

  const dbAvans1 = await prisma.expense.findUnique({ where: { id: avans1.id }, include: { returns: true } });
  const dbAvans2 = await prisma.expense.findUnique({ where: { id: avans2.id }, include: { returns: true } });
  if (!dbAvans1 || !dbAvans2) return fail('Avans rows missing in DB');
  eq('DB avans1.repayable', dbAvans1.repayable, 'true');
  eq('DB avans1.writtenOffAt', dbAvans1.writtenOffAt === null, 'true');
  eq('DB avans1.returns.length', dbAvans1.returns.length, 2);
  const returnedSum = dbAvans1.returns.reduce((s, r) => s + Number(r.amount), 0);
  eq('DB avans1.returnedSum', returnedSum, 200000);
  eq('DB avans2.writtenOffAt set', dbAvans2.writtenOffAt !== null, 'true');
  eq('DB avans2.writtenOffReason', dbAvans2.writtenOffReason, 'Pul qaytarilmadi');

  // Audit log spot-check
  const auditRepayments = await prisma.auditLog.count({
    where: { action: 'DEBT_PAYMENT_RECORDED', entityId: debt1.id },
  });
  const auditDebtClosed = await prisma.auditLog.count({
    where: { action: 'DEBT_CLOSED', entityId: debt1.id },
  });
  const auditExpenseWriteOff = await prisma.auditLog.count({
    where: { action: 'EXPENSE_WRITTEN_OFF', entityId: avans2.id },
  });
  const auditDebtWrittenOff = await prisma.auditLog.count({
    where: { action: 'DEBT_WRITTEN_OFF', entityId: debt2.id },
  });
  eq('audit DEBT_PAYMENT_RECORDED for debt1', auditRepayments, 3);
  eq('audit DEBT_CLOSED for debt1', auditDebtClosed, 1);
  eq('audit EXPENSE_WRITTEN_OFF for avans2', auditExpenseWriteOff, 1);
  eq('audit DEBT_WRITTEN_OFF for debt2', auditDebtWrittenOff, 1);

  console.log(`\n${c(32, '════════════════════════════════════════════════════════════')}`);
  console.log(`${c(32, '  Debt + Avans smoke green. Daily report cells all match.')}`);
  console.log(`${c(32, '════════════════════════════════════════════════════════════')}\n`);
  info('Part 1 (debt): OPEN → PARTIAL → PARTIAL → PAID across 3 repayments');
  info('Part 1 (debt write-off): OPEN → WRITTEN_OFF via POST /:id/write-off');
  info('Part 2 (avans): PENDING → PARTIAL → RETURNED, then WRITTEN_OFF on a second row');
  info('Part 3 (report): netSales 80 000, operating 150 000, outstanding 0 (write-off excluded)');
}

main()
  .catch((err) => {
    console.error(c(31, 'FATAL:'), err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
