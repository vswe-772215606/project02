import { IngredientMovementType, MenuItemKind, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferAfterCommit, deferEmit } from '../lib/socket-events';
import { alertService } from './alert.service';
import { ingredientRepo } from '../repositories/ingredient.repo';
import { ingredientMovementRepo } from '../repositories/ingredientMovement.repo';
import { menuRepo } from '../repositories/menu.repo';
import { recipeRepo } from '../repositories/recipe.repo';
import { purchaseRepo } from '../repositories/purchase.repo';
import { orderLineBatchConsumptionRepo } from '../repositories/orderLineBatchConsumption.repo';

type Tx = Prisma.TransactionClient;

type LineRef = {
  id: string;
  menuItemId: string;
  actorUserId: string;
};

type ConsumeTarget = {
  ingredientId: string;
  ingredientName: string;
  parentDishName: string;
  needed: Prisma.Decimal;
};

async function planConsumption(
  menuItemId: string,
  portions: number,
  tx: Tx,
): Promise<ConsumeTarget[]> {
  const item = await menuRepo.findItemById(menuItemId, tx);
  if (!item) {
    throw Errors.NotFound('Menu item');
  }
  if (item.kind === MenuItemKind.SERVICE) {
    return [];
  }

  const recipe = await recipeRepo.findByMenuItemId(menuItemId, tx);
  if (recipe && recipe.ingredients.length > 0) {
    return recipe.ingredients.map((ri) => ({
      ingredientId: ri.ingredientId,
      ingredientName: ri.ingredient.name,
      parentDishName: item.name,
      needed: new Prisma.Decimal(ri.quantity).mul(portions),
    }));
  }

  const selfIngredient = await ingredientRepo.findBySelfMenuItem(menuItemId, tx);
  if (selfIngredient) {
    return [{
      ingredientId: selfIngredient.id,
      ingredientName: selfIngredient.name,
      parentDishName: item.name,
      needed: new Prisma.Decimal(portions),
    }];
  }

  // No recipe, no self-ingredient → not tracked (e.g. choy). Noop.
  return [];
}

/**
 * FIFO peel: oldest active batch first. Each peel
 *   - decrements the batch's remainingQty atomically
 *   - decrements Ingredient.currentStock atomically
 *   - records an OrderLineBatchConsumption row (used by restore)
 *   - records an IngredientMovement(CONSUME) ledger row
 *   - contributes (peeledQty * batch.unitCost) to the returned cogsDelta
 *
 * Throws OutOfStock if active batches can't cover `target.needed`. The
 * surrounding $transaction rolls back any partial peels.
 */
async function peelFifo(
  target: ConsumeTarget,
  line: LineRef,
  tx: Tx,
): Promise<Prisma.Decimal> {
  let remaining = target.needed;
  let cogsDelta = new Prisma.Decimal(0);

  // Snapshot the batches once; we'll loop with fresh decrement attempts.
  // findActiveBatchesForIngredient skips remainingQty=0 batches so this list
  // is the candidate set for THIS call.
  const batches = await purchaseRepo.findActiveBatchesForIngredient(target.ingredientId, tx);

  // Read current stock + avg-cost once, then track locally as we peel.
  // Avoids a per-batch findById round-trip — important for the 5s txn budget
  // when a single sale spills across many batches.
  const ingFresh = await ingredientRepo.findById(target.ingredientId, tx);
  let runningStock = ingFresh?.currentStock ?? new Prisma.Decimal(0);
  const preStock = runningStock;
  const runningAvg = ingFresh?.weightedAvgCost ?? new Prisma.Decimal(0);

  for (const batch of batches) {
    if (remaining.lte(0)) break;

    const take = Prisma.Decimal.min(remaining, batch.remainingQty);
    if (take.lte(0)) continue;

    // Atomic batch peel — if a concurrent transaction already drained this
    // batch (rare under SQLite/single-process but kept for correctness),
    // count=0 and we move on.
    const peelRes = await purchaseRepo.peelAtomic(batch.id, take, tx);
    if (peelRes.count === 0) {
      continue;
    }

    // Atomic ingredient stock decrement — if this fails we have a real
    // invariant break (batch said it had qty, ingredient said it didn't).
    // Throw out-of-stock; the txn rolls back the peel above.
    const stockRes = await ingredientRepo.decrementAtomic(target.ingredientId, take, tx);
    if (stockRes.count === 0) {
      throw Errors.OutOfStock(target.ingredientName, target.parentDishName);
    }
    runningStock = runningStock.minus(take);

    await orderLineBatchConsumptionRepo.create({
      orderLine: { connect: { id: line.id } },
      purchase: { connect: { id: batch.id } },
      quantity: take,
      unitCost: batch.unitCostPerRecipeUnit,
    }, tx);

    await ingredientMovementRepo.create({
      ingredient: { connect: { id: target.ingredientId } },
      type: IngredientMovementType.CONSUME,
      quantity: take,
      unitCostSnapshot: batch.unitCostPerRecipeUnit,
      resultingStock: runningStock,
      resultingAvgCost: runningAvg,
      purchase: { connect: { id: batch.id } },
      orderLine: { connect: { id: line.id } },
      actor: { connect: { id: line.actorUserId } },
      occurredAt: new Date(),
    }, tx);

    cogsDelta = cogsDelta.plus(take.mul(batch.unitCostPerRecipeUnit));
    remaining = remaining.minus(take);

    deferEmit('admin', 'ingredient:stockChanged', { ingredientId: target.ingredientId });
  }

  if (remaining.gt(0)) {
    throw Errors.OutOfStock(target.ingredientName, target.parentDishName);
  }

  // Owner alert: this sale drove the ingredient to zero. deferAfterCommit ties
  // it to the surrounding order transaction, so a rolled-back sale never sends
  // a false "tugadi".
  if (preStock.gt(0) && runningStock.lte(0)) {
    const ingredientName = target.ingredientName;
    const dishName = target.parentDishName;
    const unit = ingFresh?.recipeUnit ?? '';
    deferAfterCommit(() =>
      alertService.ingredientStockOut({ ingredientName, dishName, unit }),
    );
  }

  return cogsDelta;
}

/**
 * LIFO restore over FIFO consume: the most-recent peels are undone first.
 * Returns qty to the original batches via OrderLineBatchConsumption rows.
 */
async function unwindRestore(
  target: ConsumeTarget,
  line: LineRef,
  tx: Tx,
): Promise<Prisma.Decimal> {
  let remaining = target.needed;
  let cogsDelta = new Prisma.Decimal(0);

  const peels = await orderLineBatchConsumptionRepo.listForLineAndIngredient(
    line.id,
    target.ingredientId,
    tx,
  );

  // Mirror peelFifo: snapshot stock once, track locally.
  const ingFresh = await ingredientRepo.findById(target.ingredientId, tx);
  let runningStock = ingFresh?.currentStock ?? new Prisma.Decimal(0);
  const runningAvg = ingFresh?.weightedAvgCost ?? new Prisma.Decimal(0);

  for (const peel of peels) {
    if (remaining.lte(0)) break;

    const take = Prisma.Decimal.min(remaining, peel.quantity);
    if (take.lte(0)) continue;

    await orderLineBatchConsumptionRepo.decrementQty(peel.id, take, tx);
    await purchaseRepo.restoreToBatch(peel.purchaseId, take, tx);
    await ingredientRepo.incrementAtomic(target.ingredientId, take, tx);
    runningStock = runningStock.plus(take);

    await ingredientMovementRepo.create({
      ingredient: { connect: { id: target.ingredientId } },
      type: IngredientMovementType.RESTORE,
      quantity: take,
      unitCostSnapshot: peel.unitCost,
      resultingStock: runningStock,
      resultingAvgCost: runningAvg,
      purchase: { connect: { id: peel.purchaseId } },
      orderLine: { connect: { id: line.id } },
      actor: { connect: { id: line.actorUserId } },
      occurredAt: new Date(),
    }, tx);

    cogsDelta = cogsDelta.plus(take.mul(peel.unitCost));
    remaining = remaining.minus(take);

    deferEmit('admin', 'ingredient:stockChanged', { ingredientId: target.ingredientId });
  }

  // Restoring more than was peeled would mean our consumption ledger lost
  // a peel — bug, not user input. Surface as 500 via the central handler.
  if (remaining.gt(0)) {
    throw Errors.Business(
      'CONSUMPTION_LEDGER_MISSING',
      `Cannot restore ${remaining.toString()} of ${target.ingredientName} — no matching peel found.`,
    );
  }

  return cogsDelta;
}

async function adjustLineCogs(orderLineId: string, delta: Prisma.Decimal, tx: Tx) {
  if (delta.eq(0)) return;
  const line = await tx.orderLine.findUnique({
    where: { id: orderLineId },
    select: { cogsSnapshot: true },
  });
  const before = line?.cogsSnapshot ?? new Prisma.Decimal(0);
  await tx.orderLine.update({
    where: { id: orderLineId },
    data: { cogsSnapshot: before.plus(delta) },
  });
}

export const consumptionService = {
  /**
   * Decrement stock for N portions tied to an existing order line.
   * FIFO peel across active batches. Atomic across all ingredients of the dish;
   * if any fails, the surrounding transaction rolls back and no partial
   * deduction persists. Per-line cogsSnapshot accumulates the cost.
   */
  async consume(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const targets = await planConsumption(line.menuItemId, portions, tx);
    if (targets.length === 0) return;
    let cogsDelta = new Prisma.Decimal(0);
    for (const target of targets) {
      cogsDelta = cogsDelta.plus(await peelFifo(target, line, tx));
    }
    await adjustLineCogs(line.id, cogsDelta, tx);
  },

  /**
   * Restore stock for N portions tied to a (canceled or shrunk) order line.
   * Unwinds the most recent peels back into their source batches.
   */
  async restore(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const targets = await planConsumption(line.menuItemId, portions, tx);
    if (targets.length === 0) return;
    let cogsDelta = new Prisma.Decimal(0);
    for (const target of targets) {
      cogsDelta = cogsDelta.plus(await unwindRestore(target, line, tx));
    }
    await adjustLineCogs(line.id, cogsDelta.neg(), tx);
  },
};
