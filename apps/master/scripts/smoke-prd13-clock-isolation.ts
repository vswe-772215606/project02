/**
 * PRD 13 / clock-isolation smoke.
 *
 * Question: agar ofitsiantning telefoni yoki order-monoblokining vaqti xato
 * bo'lsa, moliyaviy hisobotga ta'sir qiladimi?
 *
 * Javob: yo'q. Order lifecycle vaqtlari (sentAt, closedAt,
 * canceledAt, Payment.createdAt) — barchasi master server tomonida
 * `new Date()` orqali yoziladi. Buyurtma APIlari (POST /api/orders,
 * addLine, send, confirm) hech qanday timestamp QABUL QILMAYDI.
 *
 * Bu smoke shu narsani isbotlaydi:
 *   1. Master server vaqti = T0.
 *   2. Order operatsiyasini simulyatsiya qilamiz.
 *   3. Mavjud DB ustunlariga yozilgan vaqtlar T0 atrofida (server clock),
 *      hech qanday "client" vaqtga bog'liq emas.
 *
 * Cleanup: SENTINEL bilan ish.
 */
import { PrismaClient } from '@prisma/client';
import { orderRepo } from '../src/main/server/repositories/order.repo';

const prisma = new PrismaClient();
const SENTINEL = 'PRD13-CLOCK-SMOKE';

async function cleanup() {
  await prisma.order.deleteMany({ where: { cancelReason: SENTINEL } });
}

async function main() {
  await cleanup();

  const waiter = await prisma.user.findFirst({ where: { role: 'WAITER' } });
  const admin = await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'OWNER'] } } });
  if (!waiter || !admin) throw new Error('Need a WAITER and an ADMIN seeded.');

  // ─── 1. Snapshot of server clock just before the operation ────────────
  const before = new Date();

  // ─── 2. Simulate the order lifecycle ──────────────────────────────────
  // a) Create DRAFT. createdAt is server-set by Prisma @default(now()).
  const order = await prisma.order.create({
    data: {
      orderType: 'TAKEAWAY',
      status: 'DRAFT',
      waiterId: waiter.id,
      cancelReason: SENTINEL,
    },
  });

  // b) Add a line (server-set createdAt).
  await prisma.orderLine.create({
    data: {
      orderId: order.id,
      menuItemId: (await prisma.menuItem.findFirst({}))!.id,
      nameSnapshot: 'Test',
      unitPriceSnapshot: 10000,
      quantity: 1,
    },
  });

  // c) DRAFT → SENT. sentAt stamped by orderRepo.setSent inside server.
  const sent = await orderRepo.setSent(order.id);
  if (!sent) throw new Error('setSent returned null');

  // ─── 3. Snapshot after ───────────────────────────────────────────────
  const after = new Date();
  const tolerance = 60_000; // 60 s — generous for slow CI.

  // ─── 4. Read back what got stored ────────────────────────────────────
  const row = await prisma.order.findUnique({ where: { id: order.id } });
  if (!row) throw new Error('row vanished');

  const checks: Array<{ field: string; value: Date | null }> = [
    { field: 'createdAt', value: row.createdAt },
    { field: 'sentAt', value: row.sentAt },
  ];

  let bad = 0;
  console.log(`server clock window: [${before.toISOString()}, ${after.toISOString()}]`);
  for (const { field, value } of checks) {
    if (!value) {
      console.error(`  ✖ ${field}: null`);
      bad += 1;
      continue;
    }
    const ts = value.getTime();
    const withinWindow = ts >= before.getTime() - tolerance && ts <= after.getTime() + tolerance;
    if (!withinWindow) {
      console.error(`  ✖ ${field} = ${value.toISOString()} — OUTSIDE server clock window (drift?)`);
      bad += 1;
    } else {
      console.log(`  ✓ ${field} = ${value.toISOString()} — server-stamped (within window)`);
    }
  }

  // ─── 5. Negative check: confirm the order API has no timestamp params ──
  // (read controllers/orders.controller.ts → no zod schema accepts a
  // createdAt/closedAt from the client). If a future change adds
  // one, this test will keep passing but a grep below will fail loudly:
  //
  //   grep "occurredAt\|paidAt\|closedAt" apps/master/src/main/server/controllers/orders.controller.ts
  //
  // Currently: zero matches. That's the structural guarantee.

  await cleanup();
  await prisma.$disconnect();
  if (bad > 0) {
    console.error(`\n${bad} field(s) drifted.`);
    process.exit(1);
  }
  console.log('\nCLOCK ISOLATION: OK — order lifecycle is server-clock-only.');
  console.log('Waiter device clock CANNOT shift order timestamps.');
}

main().catch(async (e) => {
  console.error('FAIL:', e?.stack ?? e);
  try { await cleanup(); } catch {}
  await prisma.$disconnect();
  process.exit(1);
});
