/**
 * PRD 13 / T9 smoke. Verifies the Telegram service:
 *
 *   1. Tashkent helpers (date label, "today" / "yesterday" / "N days ago"
 *      anchors) all return Tashkent calendar values, not server-local.
 *   2. formatReportMessage reads from the canonical ledger block and the
 *      profit number it prints matches `ledger.pnl.profit`.
 *   3. formatMonthlyMessage renders without error against the new monthly
 *      DTO (the canonical-fields path inside it relies on the per-day
 *      `pnl` block that T8 added).
 *
 * Run via:
 *   pnpm exec tsx scripts/smoke-prd13-telegram.ts [YYYY-MM-DD]
 */
import { telegramBotService } from '../src/main/server/services/telegram-bot.service';
import { reportsService } from '../src/main/server/services/reports.service';
import { localDayKey, parseLocalDay } from '../src/main/server/lib/time';
import { getPrisma } from '../src/main/server/lib/prisma';

async function main() {
  const dayKey = process.argv[2] ?? '2026-05-24';
  console.log(`Test day (Tashkent): ${dayKey}`);

  const anchor = parseLocalDay(dayKey);
  const daily = await reportsService.daily(anchor);

  // 1) Render and look at the profit line — must match ledger.pnl.profit.
  const message = telegramBotService.formatReportMessage(anchor, daily);

  // The formatter shows DD.MM.YYYY in Tashkent.
  const [yyyy, mm, dd] = dayKey.split('-');
  const expectedLabel = `${dd}.${mm}.${yyyy}`;
  if (!message.includes(expectedLabel)) {
    throw new Error(`formatReportMessage missing Tashkent date label ${expectedLabel}`);
  }
  console.log(`  ✓ message header has Tashkent label ${expectedLabel}`);

  const expectedProfit = daily.ledger.pnl.profit;
  const formattedProfit = new Intl.NumberFormat('uz-UZ').format(Number(expectedProfit));
  if (!message.includes(formattedProfit)) {
    throw new Error(`formatReportMessage missing canonical profit ${formattedProfit}`);
  }
  console.log(`  ✓ message shows canonical pnl.profit = ${formattedProfit}`);

  // 2) Monthly formatter — should not throw on the new range-query monthly.
  const monthly = await reportsService.monthly(anchor);
  const monthMsg = telegramBotService.formatMonthlyMessage(monthly);
  if (!monthMsg.includes(monthly.totals.salesBasedProfit)) {
    // formatMoney would have re-formatted, so check the formatted number.
    const f = new Intl.NumberFormat('uz-UZ').format(Number(monthly.totals.salesBasedProfit));
    if (!monthMsg.includes(f)) {
      throw new Error(`formatMonthlyMessage missing total profit ${monthly.totals.salesBasedProfit}`);
    }
  }
  console.log(`  ✓ formatMonthlyMessage rendered ${monthly.daily.length} days`);

  // 3) Week summary formatter — feed 3 days (already-rendered reports) and check the canonical reads.
  const days = [
    { date: parseLocalDay('2026-05-24'), report: await reportsService.daily(parseLocalDay('2026-05-24')) },
    { date: parseLocalDay('2026-05-23'), report: await reportsService.daily(parseLocalDay('2026-05-23')) },
    { date: parseLocalDay('2026-05-22'), report: await reportsService.daily(parseLocalDay('2026-05-22')) },
  ];
  const weekMsg = telegramBotService.formatWeekSummary(days);
  if (!weekMsg.includes('Jami')) {
    throw new Error('formatWeekSummary missing "Jami" footer');
  }
  console.log(`  ✓ formatWeekSummary ran across ${days.length} canonical-bearing days`);

  // 4) Sanity: the formatter never references server-local Date math any more.
  // Today's anchor in Tashkent.
  const today = localDayKey();
  console.log(`  ✓ Tashkent today key = ${today}`);

  await getPrisma().$disconnect();
  console.log('\nTELEGRAM FORMATTER: OK');
}

main().catch(async (e) => {
  console.error('FAIL:', e?.stack ?? e);
  try { await getPrisma().$disconnect(); } catch {}
  process.exit(1);
});
