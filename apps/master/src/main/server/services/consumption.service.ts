import { IngredientMovementType, MenuItemKind, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit } from '../lib/socket-events';
import { ingredientRepo } from '../repositories/ingredient.repo';
import { ingredientMovementRepo } from '../repositories/ingredientMovement.repo';
import { menuRepo } from '../repositories/menu.repo';
import { recipeRepo } from '../repositories/recipe.repo';

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

async function applyDelta(
  targets: ConsumeTarget[],
  line: LineRef,
  type: IngredientMovementType,
  sign: 1 | -1,
  tx: Tx,
) {
  for (const t of targets) {
    if (sign < 0) {
      const result = await ingredientRepo.decrementAtomic(t.ingredientId, t.needed, tx);
      if (result.count === 0) {
        throw Errors.OutOfStock(t.ingredientName, t.parentDishName);
      }
    } else {
      await ingredientRepo.incrementAtomic(t.ingredientId, t.needed, tx);
    }

    const fresh = await ingredientRepo.findById(t.ingredientId, tx);
    await ingredientMovementRepo.create({
      ingredient: { connect: { id: t.ingredientId } },
      type,
      quantity: t.needed,
      resultingStock: fresh?.currentStock ?? new Prisma.Decimal(0),
      resultingAvgCost: fresh?.weightedAvgCost ?? new Prisma.Decimal(0),
      orderLine: { connect: { id: line.id } },
      actor: { connect: { id: line.actorUserId } },
      occurredAt: new Date(),
    }, tx);

    deferEmit('admin', 'ingredient:stockChanged', { ingredientId: t.ingredientId });
  }
}

export const consumptionService = {
  /**
   * Decrement stock for N portions tied to an existing order line.
   * Atomic across all ingredients of the dish; if any fails, the surrounding
   * transaction rolls back and no partial deduction persists.
   */
  async consume(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const targets = await planConsumption(line.menuItemId, portions, tx);
    if (targets.length === 0) return;
    await applyDelta(targets, line, IngredientMovementType.CONSUME, -1, tx);
  },

  /**
   * Restore stock for N portions tied to a (canceled or shrunk) order line.
   * Caller must check the cancellation rule (ticket PENDING) before calling.
   */
  async restore(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const targets = await planConsumption(line.menuItemId, portions, tx);
    if (targets.length === 0) return;
    await applyDelta(targets, line, IngredientMovementType.RESTORE, 1, tx);
  },
};
