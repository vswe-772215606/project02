// Smoke: cross-day purchase reversal must NOT inflate the cash drawer.
//
// Reproduces the bug documented in docs/MOLIYA_KASSA_HISOBLASH_XATOSI.md and
// proves the fix. Runs the REAL services (reportsService.dailyLedger,
// financeService.dailyForAdmin, reportsService.summary) against a throwaway
// SQLite DB — no HTTP server needed.
//
// Scenario:
//   - YESTERDAY: an ingredient purchase Expense of 5,856,000 (cash left then).
//   - TODAY: that purchase is "deleted" → its Expense flips to REVERSED and a
//            REVERSAL row dated TODAY is created (cross-day reversal).
//   - TODAY: a real operating expense of 3,346,000 and a cash sale of 4,121,000.
//
// Correct behaviour: today's cash-out = 3,346,000 (the cross-day reversal does
// NOT return cash today), drawer = 4,121,000 − 3,346,000 = +775,000.
// The OLD bug computed cash-out = gross − ALL reversals = 3,346,000 − 5,856,000
// = −2,510,000 and a drawer of +6,631,000 (phantom).
//
// Run:
//   cd apps/master
//   DATABASE_URL="file:./prisma/smoke-cashflow.db" pnpm exec prisma db push --skip-generate --accept-data-loss
//   DATABASE_URL="file:./prisma/smoke-cashflow.db" pnpm exec tsx scripts/smoke-cashflow-reversal.ts

import { PrismaClient } from '@prisma/client';
import { localDayKey } from '../src/main/server/lib/time';
import { reportsService } from '../src/main/server/services/reports.service';
import { financeService } from '../src/main/server/services/finance.service';

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const ok = (msg: string) => console.log(`  ${c(32, '✓')} ${msg}`);
const fail = (msg: string): never => { console.error(`  ${c(31, '✗')} ${msg}`); process.exit(1); };
const step = (msg: string) => console.log(`\n${c(36, '──')} ${msg}`);

function assertEq(label: string, actual: unknown, expected: unknown) {
  const a = String(actual);
  const e = String(expected);
  if (a !== e) fail(`${label}: expected ${e}, got ${a}`);
  ok(`${label} = ${a}`);
}

const INGREDIENT_CAT = 'seed-cat-ingredients';
const OPERATING_CAT = 'seed-cat-operational';

const SALE = 4_121_000;
const OPERATING = 3_346_000;
const CROSS_DAY_PURCHASE = 5_856_000;

const prisma = new PrismaClient();

async function main() {
  console.log(c(35, '\n=== Cross-day reversal cash-flow smoke ===\n'));

  const today = new Date();
  const yesterday = new Date(today.getTime() - 2 * 86_400_000); // safely a prior Tashkent day
  const todayKey = localDayKey(today);

  step('Seed throwaway scenario');
  // Clean slate (idempotent across reruns on the same temp db).
  await prisma.payment.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.expenseCategory.deleteMany({});
  await prisma.user.deleteMany({});

  const user = await prisma.user.create({
    data: { fullName: 'Smoke Owner', role: 'OWNER' },
  });
  await prisma.expenseCategory.createMany({
    data: [
      { id: INGREDIENT_CAT, name: 'Mahsulot xaridlari', displayOrder: 0 },
      { id: OPERATING_CAT, name: 'Operatsion', displayOrder: 1 },
    ],
  });

  // A CLOSED cash sale TODAY → realCashIn.
  const order = await prisma.order.create({
    data: {
      orderType: 'TAKEAWAY',
      status: 'CLOSED',
      waiterId: user.id,
      subtotalSnapshot: SALE,
      discountAmountSnapshot: 0,
      serviceChargeSnapshot: 0,
      totalSnapshot: SALE,
      closedAt: today,
    },
  });
  await prisma.payment.create({
    data: { orderId: order.id, method: 'CASH', amount: SALE },
  });

  // A real operating expense TODAY.
  await prisma.expense.create({
    data: {
      categoryId: OPERATING_CAT,
      amount: OPERATING,
      reason: 'METAN GAZGA',
      occurredAt: today,
      status: 'ACTIVE',
      createdById: user.id,
    },
  });

  // A prior-day ingredient purchase Expense, now flipped to REVERSED, plus a
  // REVERSAL row dated TODAY linked back to it — exactly what purchase.delete
  // produces when a prior-day batch is removed today.
  const oldPurchaseExpense = await prisma.expense.create({
    data: {
      categoryId: INGREDIENT_CAT,
      amount: CROSS_DAY_PURCHASE,
      reason: 'Xarid: Go\'sht',
      occurredAt: yesterday,
      status: 'REVERSED',
      createdById: user.id,
    },
  });
  await prisma.expense.create({
    data: {
      categoryId: INGREDIENT_CAT,
      amount: CROSS_DAY_PURCHASE,
      reason: 'REVERSAL: Xarid: Go\'sht',
      occurredAt: today, // stamped today by purchase.delete
      status: 'REVERSAL',
      reversedExpenseId: oldPurchaseExpense.id,
      createdById: user.id,
    },
  });
  ok(`sale ${SALE} cash, operating ${OPERATING} today, cross-day reversal ${CROSS_DAY_PURCHASE}`);

  step('reportsService.dailyLedger — canonical numbers');
  const ledger = await reportsService.dailyLedger(todayKey);

  assertEq('realCashIn', ledger.cashflow.realCashIn, String(SALE));
  // gross = only TODAY's ACTIVE/REVERSED expenses = operating (the old purchase
  // is dated yesterday, so it is NOT in today's gross).
  assertEq('outflow.expenseGross (today only)', ledger.outflow.expenseGross, String(OPERATING));
  // all reversals dated today = the cross-day reversal.
  assertEq('outflow.expenseReversal (all)', ledger.outflow.expenseReversal, String(CROSS_DAY_PURCHASE));
  // same-day reversals = 0 (the reversal's original is on a prior day).
  assertEq('outflow.expenseSameDayReversal', ledger.outflow.expenseSameDayReversal, '0');
  // THE FIX: cash-out = gross − same-day reversals = operating (NOT negative).
  assertEq('cashflow.cashOut (fixed)', ledger.cashflow.cashOut, String(OPERATING));
  // drawer = realCashIn − cashOut (NOT inflated by the cross-day reversal).
  assertEq('cashflow.drawerMovement (fixed)', ledger.cashflow.drawerMovement, String(SALE - OPERATING));

  // Prove the OLD formula would have been wrong.
  const buggyCashOut = Number(ledger.outflow.expenseNet); // gross − ALL reversals
  const buggyDrawer = SALE - buggyCashOut;
  if (buggyCashOut >= 0) fail(`expected the OLD cash-out to be negative, got ${buggyCashOut}`);
  ok(`OLD (buggy) cash-out would have been ${buggyCashOut} → drawer +${buggyDrawer} (phantom). Fixed drawer = +${SALE - OPERATING}.`);

  step('financeService.dailyForAdmin — admin drawer');
  const fin = await financeService.dailyForAdmin(today);
  assertEq('outflow.cashOut', fin.outflow.cashOut, String(OPERATING));
  assertEq('outflow.totalOut (= cashOut)', fin.outflow.totalOut, String(OPERATING));
  assertEq('drawer.movement', fin.drawer.movement, String(SALE - OPERATING));

  step('reportsService.summary — Umumiy cash basis (range = today)');
  const summary = await reportsService.summary({ from: today, to: today });
  // cash-out over the range excludes the cross-day reversal (its original is
  // outside the range), so totalOut = operating, not operating − reversal.
  assertEq('cash.totalOut (range)', summary.cash.totalOut, String(OPERATING));
  // farq = cashIn − cashOut = SALE − OPERATING.
  assertEq('cash.farq (range)', summary.cash.farq, String(SALE - OPERATING));

  step('Same-day reversal still nets to zero (control case)');
  // Add an ACTIVE→REVERSED operating expense today + its same-day REVERSAL.
  const sameDayOriginal = await prisma.expense.create({
    data: {
      categoryId: OPERATING_CAT,
      amount: 100_000,
      reason: 'Xato kiritildi',
      occurredAt: today,
      status: 'REVERSED',
      createdById: user.id,
    },
  });
  await prisma.expense.create({
    data: {
      categoryId: OPERATING_CAT,
      amount: 100_000,
      reason: 'REVERSAL: Xato kiritildi',
      occurredAt: today,
      status: 'REVERSAL',
      reversedExpenseId: sameDayOriginal.id,
      createdById: user.id,
    },
  });
  const ledger2 = await reportsService.dailyLedger(todayKey);
  // gross now includes the 100k REVERSED original; same-day reversal cancels it.
  assertEq('gross incl same-day original', ledger2.outflow.expenseGross, String(OPERATING + 100_000));
  assertEq('sameDayReversal counts the same-day pair', ledger2.outflow.expenseSameDayReversal, '100000');
  assertEq('cashOut unchanged by the same-day pair', ledger2.cashflow.cashOut, String(OPERATING));

  console.log(c(32, '\n=== cash-flow reversal smoke passed ===\n'));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
