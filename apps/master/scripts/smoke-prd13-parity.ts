/**
 * PRD 13 / T8 parity smoke.
 *
 * Calls dailyLedger / daily / dailyForAdmin / monthly and asserts the
 * canonical numbers match across the three daily surfaces. Run via:
 *   pnpm exec tsx scripts/smoke-prd13-parity.ts
 */
import { reportsService } from '../src/main/server/services/reports.service';
import { financeService } from '../src/main/server/services/finance.service';
import { localDayKey, parseLocalDay } from '../src/main/server/lib/time';
import { getPrisma } from '../src/main/server/lib/prisma';

async function main() {
  // Allow `tsx smoke-prd13-parity.ts YYYY-MM-DD` to test a specific day.
  const cliDate = process.argv[2];
  const today = cliDate ?? localDayKey();
  console.log('Test day (Tashkent):', today);

  const t0 = Date.now();
  const ledger = await reportsService.dailyLedger(today);
  console.log(
    `dailyLedger(${ledger.date}) — ${Date.now() - t0}ms — closed=${ledger.sales.closedCount} netSales=${ledger.sales.netSales} profit=${ledger.pnl.profit}`,
  );

  const anchor = parseLocalDay(today);

  const t1 = Date.now();
  const daily = await reportsService.daily(anchor);
  console.log(
    `daily       (${daily.date}) — ${Date.now() - t1}ms — closed=${daily.sales.closedOrders} netSales=${daily.sales.netSales} salesBasedProfit=${daily.results.salesBasedProfit}`,
  );

  const t2 = Date.now();
  const admin = await financeService.dailyForAdmin(anchor);
  console.log(
    `dailyForAdmin(${admin.date}) — ${Date.now() - t2}ms — closed=${admin.sales.closedOrders} netFood=${admin.sales.netFood} pnl.profit=${admin.pnl.profit}`,
  );

  // Cross-surface parity — same date, the three surfaces must agree.
  const checks: Array<[string, string, string]> = [
    ['sales.gross/grossSales', ledger.sales.gross, daily.sales.grossSales],
    ['sales.gross→grossSales (admin)', ledger.sales.gross, admin.sales.grossSales],
    ['sales.netSales/netFood', ledger.sales.netSales, admin.sales.netFood],
    ['sales.netSales daily', ledger.sales.netSales, daily.sales.netSales],
    ['cashflow.orderCash', ledger.cashflow.orderCash, daily.cashflow.orderCash],
    ['cashflow.realCashIn', ledger.cashflow.realCashIn, daily.cashflow.realCashIn],
    ['outflow.expenseNet', ledger.outflow.expenseNet, admin.outflow.expensesNet],
    ['pnl.profit (admin)', ledger.pnl.profit, admin.pnl.profit],
    ['pnl.profit (daily.salesBasedProfit)', ledger.pnl.profit, daily.results.salesBasedProfit],
    ['debt.outstanding (daily)', ledger.debt.outstandingAsOfEod, daily.debtSnapshot.outstandingTotal],
  ];

  let bad = 0;
  for (const [name, expected, actual] of checks) {
    if (expected !== actual) {
      console.error(`  ✖ ${name}: canonical=${expected} legacy=${actual}`);
      bad += 1;
    } else {
      console.log(`  ✓ ${name} = ${expected}`);
    }
  }

  // Monthly perf
  const t3 = Date.now();
  const monthly = await reportsService.monthly(anchor);
  console.log(
    `monthly(${monthly.month}) — ${Date.now() - t3}ms — ${monthly.daily.length} days — totalProfit=${monthly.totals.salesBasedProfit}`,
  );

  await getPrisma().$disconnect();
  if (bad > 0) {
    console.error(`\n${bad} parity mismatch(es).`);
    process.exit(1);
  }
  console.log('\nCROSS-SURFACE PARITY: OK');
}

main().catch((e) => {
  console.error('FAIL:', e?.stack ?? e);
  process.exit(1);
});
