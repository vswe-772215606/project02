/**
 * PRD 13 boundary smoke. Seeds two synthetic CLOSED orders at the worst-case
 * Tashkent day boundary times:
 *
 *   - 23:30 Tashkent on day D  (UTC = 18:30 day D)  → must be in day D
 *   - 00:30 Tashkent on day D+1 (UTC = 19:30 day D) → must be in day D+1
 *
 * Pre-fix, the server-local boundary buckets these incorrectly on any
 * non-Tashkent host. Post-fix, the report must put each into its Tashkent
 * calendar day regardless of server TZ.
 *
 * Usage:
 *   pnpm exec tsx scripts/smoke-prd13-boundary.ts
 *
 * The script cleans up after itself — synthetic orders are deleted on exit.
 */
import { PrismaClient } from '@prisma/client';
import { reportsService } from '../src/main/server/services/reports.service';
import { localDayKey, parseLocalDay } from '../src/main/server/lib/time';

const prisma = new PrismaClient();
const SENTINEL = 'PRD13-BOUNDARY-SMOKE';

async function cleanup() {
  // Delete any stale synthetic rows from previous runs first, then the
  // current ones at the end. Cascade deletes line/payment via FK.
  await prisma.order.deleteMany({ where: { cancelReason: SENTINEL } });
}

async function seedClosedOrder(closedAtIso: string, totalUzs: number) {
  // Need a waiter user and an admin user. Pick any existing.
  const waiter = await prisma.user.findFirst({ where: { role: 'WAITER' } });
  const admin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'OWNER'] } } });
  if (!waiter || !admin) throw new Error('Need at least one WAITER and one ADMIN user seeded.');

  const closedAt = new Date(closedAtIso);
  const created = await prisma.order.create({
    data: {
      orderType: 'TAKEAWAY',
      status: 'CLOSED',
      waiterId: waiter.id,
      sentAt: closedAt,
      approvedAt: closedAt,
      approvedById: admin.id,
      closedAt,
      subtotalSnapshot: totalUzs,
      discountAmountSnapshot: 0,
      serviceChargeSnapshot: 0,
      totalSnapshot: totalUzs,
      // Sentinel so cleanup can find it.
      cancelReason: SENTINEL,
      payments: { create: [{ method: 'CASH', amount: totalUzs }] },
    },
  });
  return created.id;
}

async function main() {
  await cleanup();

  // Choose a test day far from real data so we control the totals.
  const testDay = '2030-03-15';
  const nextDay = '2030-03-16';

  // 23:30 Tashkent on testDay = 18:30Z on testDay
  // 00:30 Tashkent on nextDay = 19:30Z on testDay  (yes, same UTC date)
  const lateOrderId = await seedClosedOrder(`${testDay}T18:30:00.000Z`, 100000);
  const earlyOrderId = await seedClosedOrder(`${testDay}T19:30:00.000Z`, 200000);

  try {
    // Verify Tashkent-key derivation for the seeded instants.
    const lateKey = localDayKey(new Date(`${testDay}T18:30:00.000Z`));
    const earlyKey = localDayKey(new Date(`${testDay}T19:30:00.000Z`));
    console.log(`Tashkent key for 18:30Z on ${testDay} = ${lateKey}  (expected ${testDay})`);
    console.log(`Tashkent key for 19:30Z on ${testDay} = ${earlyKey} (expected ${nextDay})`);
    if (lateKey !== testDay) throw new Error(`late key mismatch: ${lateKey} ≠ ${testDay}`);
    if (earlyKey !== nextDay) throw new Error(`early key mismatch: ${earlyKey} ≠ ${nextDay}`);

    // Run dailyLedger for both days and check that each order lands in the
    // right bucket.
    const dayLedger = await reportsService.dailyLedger(testDay);
    const nextLedger = await reportsService.dailyLedger(nextDay);

    console.log(
      `dailyLedger(${testDay})  → closed=${dayLedger.sales.closedCount}  gross=${dayLedger.sales.gross}`,
    );
    console.log(
      `dailyLedger(${nextDay})  → closed=${nextLedger.sales.closedCount}  gross=${nextLedger.sales.gross}`,
    );

    // Expect: 23:30 Tashkent → testDay sees 100k, nextDay sees 0+200k.
    const dayClosed = dayLedger.lines.closedOrders.find((o) => o.orderId === lateOrderId);
    const nextClosed = nextLedger.lines.closedOrders.find((o) => o.orderId === earlyOrderId);
    if (!dayClosed) throw new Error(`23:30 Tashkent order missing from ${testDay} ledger`);
    if (!nextClosed) throw new Error(`00:30 Tashkent order missing from ${nextDay} ledger`);

    // And NOT the other way round.
    const dayLeak = dayLedger.lines.closedOrders.find((o) => o.orderId === earlyOrderId);
    const nextLeak = nextLedger.lines.closedOrders.find((o) => o.orderId === lateOrderId);
    if (dayLeak) throw new Error(`LEAK: 00:30 next-day order showed up in ${testDay} ledger`);
    if (nextLeak) throw new Error(`LEAK: 23:30 same-day order showed up in ${nextDay} ledger`);

    console.log(`\n  ✓ 23:30 Tashkent  → bucketed under ${testDay}`);
    console.log(`  ✓ 00:30 Tashkent  → bucketed under ${nextDay}`);
    console.log(`  ✓ no boundary leak in either direction`);

    // And the same via legacy `daily()` to confirm the projection is sane.
    const dayLegacy = await reportsService.daily(parseLocalDay(testDay));
    const nextLegacy = await reportsService.daily(parseLocalDay(nextDay));
    if (dayLegacy.sales.grossSales !== '100000') {
      throw new Error(`daily(${testDay}).grossSales = ${dayLegacy.sales.grossSales}, expected 100000`);
    }
    if (nextLegacy.sales.grossSales !== '200000') {
      throw new Error(`daily(${nextDay}).grossSales = ${nextLegacy.sales.grossSales}, expected 200000`);
    }
    console.log(`  ✓ legacy daily() bucket gross is correct on both sides`);

    console.log('\nBOUNDARY CHECK: OK');
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error('FAIL:', e?.stack ?? e);
  try { await cleanup(); } catch {}
  await prisma.$disconnect();
  process.exit(1);
});
