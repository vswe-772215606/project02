// One-time back-fill for the FIFO migration (20260523141631_fifo_inventory).
//
// Pre-FIFO, Ingredient.currentStock was the single source of truth for stock
// and remainingQty did not exist. After the migration every ACTIVE Purchase
// row has remainingQty=0 (column default), which would make FIFO consume
// immediately throw OutOfStock for any pre-existing data.
//
// This script sets remainingQty = quantityRecipeUnit for every ACTIVE batch.
// The total may overcount stock vs. currentStock (we don't know historical
// consumption per batch), so we also realign Ingredient.currentStock to
// SUM(Purchase.remainingQty WHERE ACTIVE) — the FIFO invariant going forward.
//
// Safe to re-run: idempotent UPDATE WHERE remainingQty = 0 + recompute.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('FIFO back-fill: setting remainingQty for ACTIVE purchases...');

  const updated = await prisma.$executeRaw`
    UPDATE "Purchase"
    SET "remainingQty" = "quantityRecipeUnit"
    WHERE "status" = 'ACTIVE' AND "remainingQty" = 0
  `;
  console.log(`  Updated ${updated} purchase row(s).`);

  console.log('Realigning Ingredient.currentStock to SUM(active batches.remainingQty)...');
  const ingredients = await prisma.ingredient.findMany({ select: { id: true, name: true } });
  let fixed = 0;
  for (const ing of ingredients) {
    const agg = await prisma.purchase.aggregate({
      where: { ingredientId: ing.id, status: 'ACTIVE' },
      _sum: { remainingQty: true },
    });
    const newStock = agg._sum.remainingQty ?? 0;
    const before = await prisma.ingredient.findUnique({ where: { id: ing.id }, select: { currentStock: true } });
    await prisma.ingredient.update({
      where: { id: ing.id },
      data: { currentStock: newStock },
    });
    if (!before?.currentStock.equals(newStock as any)) {
      console.log(`  ${ing.name}: ${before?.currentStock.toString()} -> ${newStock.toString()}`);
      fixed++;
    }
  }
  console.log(`Realigned ${fixed} ingredient stock value(s).`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
