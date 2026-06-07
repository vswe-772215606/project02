/**
 * PRD 13 walkout-fields smoke. Seeds a SENT order, flips it to WALKOUT via
 * the new `orderRepo.setWalkout` path, then verifies that:
 *
 *   - the walkout appears in dailyLedger for its Tashkent day,
 *   - walkoutAt / walkoutById are populated on the row,
 *   - the daily Z-report exposes markedById / markedByName (the legacy
 *     `'unknown'` placeholder is gone).
 *
 * Cleans up after itself.
 */
import { PrismaClient } from '@prisma/client';
import { reportsService } from '../src/main/server/services/reports.service';
import { orderRepo } from '../src/main/server/repositories/order.repo';
import { localDayKey, parseLocalDay } from '../src/main/server/lib/time';

const prisma = new PrismaClient();
const SENTINEL = 'PRD13-WALKOUT-SMOKE';

async function cleanup() {
  await prisma.order.deleteMany({ where: { cancelReason: SENTINEL } });
}

async function main() {
  await cleanup();

  const waiter = await prisma.user.findFirst({ where: { role: 'WAITER' } });
  const admin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'OWNER'] } } });
  if (!waiter || !admin) throw new Error('Need at least one WAITER and one ADMIN seeded.');

  // Seed a SENT order with sentAt set, then call setWalkout to populate the
  // new walkout fields the same way orderService.markWalkout does at runtime.
  const sentAt = new Date();
  const order = await prisma.order.create({
    data: {
      orderType: 'TAKEAWAY',
      status: 'SENT',
      waiterId: waiter.id,
      sentAt,
      subtotalSnapshot: 50000,
      discountAmountSnapshot: 0,
      serviceChargeSnapshot: 0,
      totalSnapshot: 50000,
      // Sentinel for cleanup.
      cancelReason: SENTINEL,
    },
  });

  const walkoutAt = new Date();
  const flipped = await orderRepo.setWalkout(order.id, admin.id, walkoutAt);
  if (!flipped) throw new Error('setWalkout returned null — atomic guard rejected our SENT row');
  if (flipped.status !== 'WALKOUT') throw new Error('status not WALKOUT after setWalkout');
  if (!flipped.walkoutAt) throw new Error('walkoutAt was not stamped');
  if (flipped.walkoutById !== admin.id) throw new Error(`walkoutById mismatch: ${flipped.walkoutById} ≠ ${admin.id}`);

  console.log(`  ✓ setWalkout returned WALKOUT row with walkoutAt=${flipped.walkoutAt.toISOString()} walkoutById=${flipped.walkoutById}`);

  // Now verify reports.
  const dayKey = localDayKey(walkoutAt);
  const ledger = await reportsService.dailyLedger(dayKey);

  const ourWalkout = ledger.incidents.walkouts.find((w) => w.orderId === order.id);
  if (!ourWalkout) throw new Error(`our walkout missing from dailyLedger(${dayKey}).incidents.walkouts`);
  if (!ourWalkout.walkoutById) throw new Error('canonical walkoutById is null');
  if (ourWalkout.walkoutByName !== admin.fullName) {
    throw new Error(`walkoutByName mismatch: ${ourWalkout.walkoutByName} ≠ ${admin.fullName}`);
  }
  console.log(`  ✓ canonical incidents.walkouts has walkoutById=${ourWalkout.walkoutById} walkoutByName=${ourWalkout.walkoutByName}`);

  const legacy = await reportsService.daily(parseLocalDay(dayKey));
  const ourLegacyWalkout = legacy.walkouts.find((w: any) => w.orderId === order.id);
  if (!ourLegacyWalkout) throw new Error(`our walkout missing from daily(${dayKey}).walkouts`);
  if (ourLegacyWalkout.markedById !== admin.id) {
    throw new Error(`legacy markedById mismatch: ${ourLegacyWalkout.markedById} ≠ ${admin.id}`);
  }
  if (ourLegacyWalkout.markedByName !== admin.fullName) {
    throw new Error(`legacy markedByName mismatch: ${ourLegacyWalkout.markedByName} ≠ ${admin.fullName}`);
  }
  console.log(`  ✓ legacy walkouts[] has markedById=${ourLegacyWalkout.markedById} markedByName=${ourLegacyWalkout.markedByName} (no more 'unknown')`);

  // Walkout count surfaces.
  if (ledger.sales.walkoutCount < 1) throw new Error('walkoutCount not incremented in ledger');
  console.log(`  ✓ ledger.sales.walkoutCount = ${ledger.sales.walkoutCount}`);

  await cleanup();
  await prisma.$disconnect();
  console.log('\nWALKOUT FIELDS: OK');
}

main().catch(async (e) => {
  console.error('FAIL:', e?.stack ?? e);
  try { await cleanup(); } catch {}
  await prisma.$disconnect();
  process.exit(1);
});
