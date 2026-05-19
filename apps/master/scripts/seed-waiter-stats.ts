// Seed closed orders directly via Prisma for waiter-stats UI testing.
// Bypasses the HTTP /confirm flow (which would block on a real POS printer).
//
// Creates N orders per waiter per day for the past DAYS_BACK days,
// each with a few FOOD lines + a SERVICE line. Snapshots and Payment
// rows are written so reports / range-stats / SalariesPage all see them.
//
// Usage:
//   pnpm --filter @chayxana/master exec tsx scripts/seed-waiter-stats.ts
//
// Env knobs:
//   DAYS_BACK=7         number of past days, today inclusive
//   ORDERS_PER_DAY=2    orders per waiter per day

import {
  MenuItemKind,
  OrderStatus,
  OrderType,
  PaymentMethod,
  Prisma,
  PrismaClient,
  TableType,
} from '@prisma/client';

const prisma = new PrismaClient();

const DAYS_BACK = Number(process.env.DAYS_BACK ?? 7);
const ORDERS_PER_WAITER_PER_DAY = Number(process.env.ORDERS_PER_DAY ?? 2);

const WAITERS: Array<{ label: string; id: string }> = [
  { label: 'Botir', id: 'seed-waiter-botir' },
  { label: 'Aziza', id: 'seed-waiter-aziza' },
];

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (msg: string) => console.log(`\n${c(36, '──')} ${msg}`);
const ok = (m: string) => console.log(`  ${c(32, '✓')} ${m}`);
const fail = (m: string): never => {
  console.error(`  ${c(31, '✗')} ${m}`);
  process.exit(1);
};

function localMidnight(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function ensureServiceItem() {
  const existing = await prisma.menuItem.findFirst({
    where: { kind: MenuItemKind.SERVICE, isActive: true },
  });
  if (existing) return existing;

  const category = await prisma.category.findFirst({ where: { isActive: true } })
    ?? await prisma.category.create({ data: { id: 'seed-category-tea', name: 'Choy', displayOrder: 0 } });

  return prisma.menuItem.create({
    data: {
      categoryId: category.id,
      name: 'Xizmat haqi (kishi boshi)',
      price: new Prisma.Decimal(8000),
      kind: MenuItemKind.SERVICE,
    },
  });
}

async function ensureSomeTables(): Promise<string[]> {
  const existing = await prisma.table.findMany({ where: { isActive: true } });
  if (existing.length >= 2) return existing.map((t) => t.id);

  // Create a couple of tables if none exist.
  const created = await Promise.all([
    prisma.table.upsert({
      where: { name: 'Stol 1' },
      update: {},
      create: { name: 'Stol 1', type: TableType.TABLE, displayOrder: 1 },
    }),
    prisma.table.upsert({
      where: { name: 'Stol 2' },
      update: {},
      create: { name: 'Stol 2', type: TableType.TABLE, displayOrder: 2 },
    }),
  ]);
  return [...existing, ...created].map((t) => t.id);
}

async function main() {
  step('Catalog');
  const service = await ensureServiceItem();
  ok(`SERVICE item: ${service.name} @ ${service.price.toFixed(0)}`);

  const foods = await prisma.menuItem.findMany({
    where: { kind: MenuItemKind.FOOD, isActive: true },
    take: 20,
  });
  if (foods.length < 2) fail(`Need at least 2 FOOD menu items, found ${foods.length}`);
  ok(`${foods.length} FOOD items available`);

  const tableIds = await ensureSomeTables();
  ok(`${tableIds.length} active tables`);

  for (const w of WAITERS) {
    const u = await prisma.user.findUnique({ where: { id: w.id } });
    if (!u) fail(`Waiter not seeded: ${w.id}. Run prisma seed first.`);
  }

  step(`Seeding ${WAITERS.length} waiters × ${DAYS_BACK} days × ${ORDERS_PER_WAITER_PER_DAY} orders`);
  let created = 0;

  for (let dayIdx = 0; dayIdx < DAYS_BACK; dayIdx++) {
    const dayMidnight = localMidnight(dayIdx);
    let waiterPos = 0;
    for (const w of WAITERS) {
      for (let i = 0; i < ORDERS_PER_WAITER_PER_DAY; i++) {
        const seed = dayIdx * 11 + waiterPos * 5 + i;

        const foodPicks = [
          { item: foods[seed % foods.length]!, qty: 1 + (seed % 2) },
          { item: foods[(seed + 3) % foods.length]!, qty: 1 + ((seed + 1) % 3) },
        ];
        const serviceQty = 2 + ((seed + 1) % 3);

        const foodSubtotal = foodPicks.reduce(
          (s, p) => s + Math.round(Number(p.item.price)) * p.qty,
          0,
        );
        const serviceTotal = Math.round(Number(service.price)) * serviceQty;
        const total = foodSubtotal + serviceTotal;

        const hour = 10 + ((i * 5 + waiterPos * 2) % 11); // 10..20
        const minute = (seed * 13) % 60;
        const closedAt = new Date(dayMidnight);
        closedAt.setHours(hour, minute, 0, 0);

        await prisma.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              orderType: OrderType.DINE_IN,
              status: OrderStatus.CLOSED,
              tableId: tableIds[seed % tableIds.length]!,
              waiterId: w.id,
              approvedById: 'seed-admin',
              approvedAt: closedAt,
              closedAt,
              subtotalSnapshot: new Prisma.Decimal(foodSubtotal),
              discountAmountSnapshot: new Prisma.Decimal(0),
              serviceChargeSnapshot: new Prisma.Decimal(serviceTotal),
              totalSnapshot: new Prisma.Decimal(total),
              createdAt: closedAt,
              updatedAt: closedAt,
            },
          });

          for (const p of foodPicks) {
            await tx.orderLine.create({
              data: {
                orderId: order.id,
                menuItemId: p.item.id,
                nameSnapshot: p.item.name,
                unitPriceSnapshot: p.item.price,
                quantity: p.qty,
                createdAt: closedAt,
                updatedAt: closedAt,
              },
            });
          }
          await tx.orderLine.create({
            data: {
              orderId: order.id,
              menuItemId: service.id,
              nameSnapshot: service.name,
              unitPriceSnapshot: service.price,
              quantity: serviceQty,
              createdAt: closedAt,
              updatedAt: closedAt,
            },
          });

          await tx.payment.create({
            data: {
              orderId: order.id,
              method: PaymentMethod.CASH,
              amount: new Prisma.Decimal(total),
              createdAt: closedAt,
            },
          });

          created++;
        });
      }
      waiterPos++;
    }
    ok(`${dayMidnight.toISOString().slice(0, 10)} seeded`);
  }

  step('Done');
  console.log(`  Created ${created} closed orders across ${DAYS_BACK} days.`);
  console.log('  Log into mobile as Botir (PIN 5678) or Aziza (PIN 2468).');
  console.log('  Mening kunim → calendar button to browse past days.');
}

main()
  .catch((e) => {
    console.error(c(31, 'FATAL:'), e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
