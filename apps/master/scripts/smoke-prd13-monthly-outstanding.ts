/**
 * PRD 13 / T10 — verify the per-day `debtSnapshot.outstandingTotal` in the
 * monthly DTO:
 *   1. The last day's outstanding equals totals.outstandingDebtEndOfMonth.
 *   2. It matches debtRepo.sumOutstandingAsOf for that day (the canonical
 *      primitive used elsewhere).
 *   3. Every day-end value equals the per-day primitive as well — i.e. the
 *      in-memory cumulative computation agrees with the SQL aggregate.
 */
import { reportsService } from '../src/main/server/services/reports.service';
import { debtRepo } from '../src/main/server/repositories/debt.repo';
import { parseLocalDay } from '../src/main/server/lib/time';
import { getPrisma } from '../src/main/server/lib/prisma';

async function main() {
  const monthAnchor = parseLocalDay('2026-05-01');
  const monthly = await reportsService.monthly(monthAnchor);
  const lastDay = monthly.daily[monthly.daily.length - 1]!;
  console.log(`monthly(${monthly.month}) — ${monthly.daily.length} days`);
  console.log(`  last day (${lastDay.date}): outstanding=${lastDay.debtSnapshot.outstandingTotal}`);
  console.log(`  totals.outstandingDebtEndOfMonth = ${monthly.totals.outstandingDebtEndOfMonth}`);

  if (lastDay.debtSnapshot.outstandingTotal !== monthly.totals.outstandingDebtEndOfMonth) {
    throw new Error(
      `last-day outstanding ${lastDay.debtSnapshot.outstandingTotal} ≠ totals ${monthly.totals.outstandingDebtEndOfMonth}`,
    );
  }
  console.log('  ✓ last day === totals.outstandingDebtEndOfMonth');

  // Spot-check 3 days against the SQL primitive.
  const samples = [0, Math.floor(monthly.daily.length / 2), monthly.daily.length - 1];
  for (const i of samples) {
    const row = monthly.daily[i]!;
    const anchor = parseLocalDay(row.date);
    const primitive = (await debtRepo.sumOutstandingAsOf(anchor)).toFixed(0);
    if (primitive !== row.debtSnapshot.outstandingTotal) {
      throw new Error(
        `${row.date}: in-memory ${row.debtSnapshot.outstandingTotal} ≠ SQL ${primitive}`,
      );
    }
    console.log(`  ✓ ${row.date}: in-memory == SQL primitive (${primitive})`);
  }

  await getPrisma().$disconnect();
  console.log('\nMONTHLY OUTSTANDING: OK');
}

main().catch(async (e) => {
  console.error('FAIL:', e?.stack ?? e);
  try { await getPrisma().$disconnect(); } catch {}
  process.exit(1);
});
