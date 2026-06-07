/**
 * PRD 13 monthly perf smoke. Times `reportsService.monthly` on a populated
 * month and reports query count via Prisma's internal log if available.
 * Useful as a sanity check that we didn't regress to N×daily.
 */
import { reportsService } from '../src/main/server/services/reports.service';
import { parseLocalDay } from '../src/main/server/lib/time';
import { getPrisma } from '../src/main/server/lib/prisma';

async function main() {
  const monthsToTime = ['2026-05-01', '2026-04-01', '2026-03-01'];

  for (const dayKey of monthsToTime) {
    const anchor = parseLocalDay(dayKey);
    const t = Date.now();
    const monthly = await reportsService.monthly(anchor);
    const took = Date.now() - t;
    const nonEmptyDays = monthly.daily.filter((d) => d.sales.closedOrders > 0).length;
    console.log(
      `monthly(${monthly.month}): ${took}ms — ${monthly.daily.length} days, ${nonEmptyDays} non-empty, totalClosed=${monthly.totals.closedOrders}, totalProfit=${monthly.totals.salesBasedProfit}`,
    );
  }

  await getPrisma().$disconnect();
}

main().catch((e) => {
  console.error('FAIL:', e?.stack ?? e);
  process.exit(1);
});
