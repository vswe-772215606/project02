import { MenuItemKind, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { ingredientRepo } from '../repositories/ingredient.repo';
import { menuRepo } from '../repositories/menu.repo';
import { recipeRepo } from '../repositories/recipe.repo';
import { auditService } from './audit.service';

type RecipeWithIngredients = NonNullable<Awaited<ReturnType<typeof recipeRepo.findByMenuItemId>>>;

function snapshotRecipe(recipe: RecipeWithIngredients): Prisma.InputJsonValue {
  return {
    notes: recipe.notes ?? null,
    isComplete: recipe.isComplete,
    ingredients: recipe.ingredients.map((row) => ({
      ingredientId: row.ingredientId,
      ingredientName: row.ingredient.name,
      quantity: row.quantity.toFixed(3),
    })),
  };
}

function mapRecipe(recipe: RecipeWithIngredients | null) {
  if (!recipe) return null;
  return {
    id: recipe.id,
    menuItemId: recipe.menuItemId,
    menuItemName: recipe.menuItem.name,
    notes: recipe.notes,
    isComplete: recipe.isComplete,
    ingredients: recipe.ingredients.map((row) => ({
      ingredientId: row.ingredientId,
      ingredientName: row.ingredient.name,
      ingredientUnit: row.ingredient.recipeUnit,
      ingredientBuyUnit: row.ingredient.buyUnit,
      quantity: row.quantity.toFixed(3),
      ingredientWeightedAvgCost: row.ingredient.weightedAvgCost.toFixed(3),
      ingredientIsActive: row.ingredient.isActive,
    })),
    createdAt: recipe.createdAt.toISOString(),
    updatedAt: recipe.updatedAt.toISOString(),
  };
}

export const recipeService = {
  async findByMenuItemId(menuItemId: string) {
    const recipe = await recipeRepo.findByMenuItemId(menuItemId);
    return mapRecipe(recipe);
  },

  async upsert(input: {
    menuItemId: string;
    ingredients: Array<{ ingredientId: string; quantity: string | number }>;
    notes?: string | null;
    actorUserId: string;
  }) {
    return withEmitContext(async () => {
      const menuItem = await menuRepo.findItemById(input.menuItemId);
      if (!menuItem) {
        throw Errors.NotFound('Menyu mahsuloti');
      }
      if (menuItem.kind === MenuItemKind.SERVICE) {
        throw Errors.Validation('Xizmat haqi mahsulotlari retsept talab qilmaydi');
      }

      const seenIds = new Set<string>();
      for (const row of input.ingredients) {
        if (seenIds.has(row.ingredientId)) {
          throw Errors.Validation('Bir mahsulot retseptda ikki marta bo\'lishi mumkin emas');
        }
        seenIds.add(row.ingredientId);
        const qty = new Prisma.Decimal(row.quantity);
        if (qty.lte(0)) {
          throw Errors.Validation('Retsept miqdori 0 dan katta bo\'lishi kerak');
        }
      }

      // Per-dish scope: every ingredient must belong to this exact menu item.
      for (const row of input.ingredients) {
        const ing = await ingredientRepo.findById(row.ingredientId);
        if (!ing) {
          throw Errors.Validation('Mahsulot topilmadi', { ingredientId: row.ingredientId });
        }
        if (ing.parentMenuItemId !== input.menuItemId) {
          throw Errors.Validation(
            `"${ing.name}" mahsuloti boshqa taomga tegishli — bu retseptga qo'shib bo'lmaydi`,
            { ingredientId: row.ingredientId, parentMenuItemId: ing.parentMenuItemId },
          );
        }
      }

      const existing = await recipeRepo.findByMenuItemId(input.menuItemId);

      const updated = await getPrisma().$transaction(async (tx) => {
        let recipe: RecipeWithIngredients;
        let action: 'RECIPE_CREATED' | 'RECIPE_UPDATED';

        if (!existing) {
          recipe = (await recipeRepo.createForMenuItem(
            input.menuItemId,
            input.ingredients,
            input.notes?.trim() ?? null,
            tx,
          )) as RecipeWithIngredients;
          action = 'RECIPE_CREATED';
        } else {
          if (input.notes !== undefined) {
            await recipeRepo.update(
              existing.id,
              { notes: input.notes?.trim() ?? null },
              tx,
            );
          }
          recipe = (await recipeRepo.replaceIngredients(
            existing.id,
            input.ingredients,
            tx,
          )) as RecipeWithIngredients;
          action = 'RECIPE_UPDATED';
        }

        const beforeJson = existing
          ? snapshotRecipe(existing)
          : ({ isComplete: false, ingredients: [], notes: null } as Prisma.InputJsonValue);
        const afterJson = snapshotRecipe(recipe);

        await recipeRepo.logEdit(
          {
            recipeId: recipe.id,
            editedById: input.actorUserId,
            beforeJson,
            afterJson,
          },
          tx,
        );

        await auditService.log(
          {
            userId: input.actorUserId,
            action,
            entityType: 'Recipe',
            entityId: recipe.id,
            metadata: {
              menuItemId: input.menuItemId,
              ingredientCount: recipe.ingredients.length,
            },
          },
          tx,
        );

        deferEmit('admin', 'recipe:changed', {
          recipeId: recipe.id,
          menuItemId: input.menuItemId,
        });

        return recipe;
      });

      await flushDeferredEmits();
      return mapRecipe(updated);
    });
  },

  async setComplete(input: { recipeId: string; isComplete: boolean; actorUserId: string }) {
    return withEmitContext(async () => {
      const existing = await recipeRepo.findById(input.recipeId);
      if (!existing) {
        throw Errors.NotFound('Retsept');
      }

      // Activation gate: every referenced ingredient must be active and
      // have at least one Purchase (weightedAvgCost > 0). Deactivation is unrestricted.
      if (input.isComplete) {
        if (existing.ingredients.length === 0) {
          throw Errors.Validation('Retsept faolashtirilmadi: hech qanday mahsulot yo\'q', {
            ingredientIds: [],
          });
        }
        const blocked = existing.ingredients.filter((row) =>
          !row.ingredient.isActive || row.ingredient.weightedAvgCost.lte(0),
        );
        if (blocked.length > 0) {
          throw Errors.Validation(
            'Retsept faolashtirilmadi: bir nechta mahsulot uchun xarid yo\'q yoki mahsulot faol emas',
            { ingredientIds: blocked.map((row) => row.ingredientId) },
          );
        }
      }

      const updated = await getPrisma().$transaction(async (tx) => {
        await recipeRepo.setComplete(input.recipeId, input.isComplete, tx);

        await auditService.log(
          {
            userId: input.actorUserId,
            action: input.isComplete ? 'RECIPE_ACTIVATED' : 'RECIPE_DEACTIVATED',
            entityType: 'Recipe',
            entityId: input.recipeId,
            metadata: {
              menuItemId: existing.menuItemId,
              isComplete: input.isComplete,
            },
          },
          tx,
        );

        deferEmit('admin', 'recipe:changed', {
          recipeId: input.recipeId,
          menuItemId: existing.menuItemId,
        });

        return recipeRepo.findById(input.recipeId, tx);
      });

      await flushDeferredEmits();
      return mapRecipe(updated);
    });
  },

  async listEdits(recipeId: string) {
    return recipeRepo.listEdits(recipeId);
  },

  /**
   * Hard-delete a recipe for a given menu item. RecipeIngredient and
   * RecipeEdit rows are removed first by the repo (SQLite has no cascade
   * rules in our schema). The MenuItem itself is left intact — it just
   * loses its recipe.
   */
  async deleteForMenuItem(input: { menuItemId: string; actorUserId: string }) {
    return withEmitContext(async () => {
      const existing = await recipeRepo.findByMenuItemId(input.menuItemId);
      if (!existing) {
        throw Errors.NotFound('Retsept');
      }

      await getPrisma().$transaction(async (tx) => {
        await recipeRepo.deleteById(existing.id, tx);

        await auditService.log(
          {
            userId: input.actorUserId,
            action: 'RECIPE_DELETED',
            entityType: 'Recipe',
            entityId: existing.id,
            metadata: {
              menuItemId: input.menuItemId,
              ingredientCount: existing.ingredients.length,
              wasComplete: existing.isComplete,
            },
          },
          tx,
        );

        deferEmit('admin', 'recipe:changed', {
          recipeId: existing.id,
          menuItemId: input.menuItemId,
        });
      });

      await flushDeferredEmits();
      return { id: existing.id, menuItemId: input.menuItemId };
    });
  },
};
