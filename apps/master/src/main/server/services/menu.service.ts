import { IngredientMovementType, MenuItemKind, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { ingredientRepo } from '../repositories/ingredient.repo';
import { ingredientMovementRepo } from '../repositories/ingredientMovement.repo';
import { menuRepo } from '../repositories/menu.repo';
import { purchaseRepo } from '../repositories/purchase.repo';
import { recipeRepo } from '../repositories/recipe.repo';
import { expenseRepo } from '../repositories/expense.repo';
import { auditService } from './audit.service';
import { yieldService } from './yield.service';

type Tx = Prisma.TransactionClient;

// All ingredient purchases land under this expense category, mirroring the
// purchaseService.record convention (seeded in prisma/seed.ts).
const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

/**
 * Internal helper: record an initial FIFO batch for a freshly-created ingredient
 * within the same transaction as the ingredient itself. Mirrors
 * purchaseService.record but skips the outer withEmitContext wrapper (the
 * caller is already inside one) and the ingredient existence checks.
 */
async function recordInitialPurchaseInTx(args: {
  ingredientId: string;
  ingredientName: string;
  quantityBuyUnit: Prisma.Decimal;
  quantityRecipeUnit: Prisma.Decimal;
  totalCostUzs: Prisma.Decimal;
  unitCostPerRecipeUnit: Prisma.Decimal;
  occurredAt: Date;
  actorUserId: string;
  tx: Tx;
}) {
  const { tx } = args;
  const expense = await expenseRepo.create({
    category: { connect: { id: INGREDIENT_EXPENSE_CATEGORY_ID } },
    amount: args.totalCostUzs,
    reason: `Boshlang'ich zaxira: ${args.ingredientName}`,
    occurredAt: args.occurredAt,
    createdBy: { connect: { id: args.actorUserId } },
  }, tx);

  const purchase = await purchaseRepo.create({
    ingredient: { connect: { id: args.ingredientId } },
    quantityBuyUnit: args.quantityBuyUnit,
    quantityRecipeUnit: args.quantityRecipeUnit,
    remainingQty: args.quantityRecipeUnit,
    totalCostUzs: args.totalCostUzs,
    unitCostPerRecipeUnit: args.unitCostPerRecipeUnit,
    recordedBy: { connect: { id: args.actorUserId } },
    occurredAt: args.occurredAt,
    expense: { connect: { id: expense.id } },
  }, tx);

  await tx.ingredient.update({
    where: { id: args.ingredientId },
    data: {
      currentStock: { increment: args.quantityRecipeUnit },
      weightedAvgCost: args.unitCostPerRecipeUnit, // display proxy; FIFO is source of truth
    },
  });

  await ingredientMovementRepo.create({
    ingredient: { connect: { id: args.ingredientId } },
    type: IngredientMovementType.PURCHASE,
    quantity: args.quantityRecipeUnit,
    unitCostSnapshot: args.unitCostPerRecipeUnit,
    resultingStock: args.quantityRecipeUnit, // ingredient is brand-new, prior stock = 0
    resultingAvgCost: args.unitCostPerRecipeUnit,
    purchase: { connect: { id: purchase.id } },
    actor: { connect: { id: args.actorUserId } },
    occurredAt: args.occurredAt,
  }, tx);

  await auditService.log({
    userId: args.actorUserId,
    action: 'PURCHASE_RECORDED',
    entityType: 'Purchase',
    entityId: purchase.id,
    metadata: {
      ingredientId: args.ingredientId,
      ingredientName: args.ingredientName,
      quantityBuyUnit: args.quantityBuyUnit.toFixed(3),
      quantityRecipeUnit: args.quantityRecipeUnit.toFixed(3),
      totalCostUzs: args.totalCostUzs.toFixed(0),
      unitCostPerRecipeUnit: args.unitCostPerRecipeUnit.toFixed(3),
      expenseId: expense.id,
      origin: 'initial-via-menu-create',
    },
  }, tx);
}

// User-entered amounts come in as the buy-unit (kg, dona, l). Recipe-unit
// (g, dona, ml) is what the recipe and stock ledger use. conversionFactor
// = recipeUnit per 1 buyUnit (e.g. 1000 g per 1 kg).
const UNIT_PRESETS: Record<string, { buyUnit: string; recipeUnit: string; conversionFactor: number }> = {
  dona: { buyUnit: 'dona', recipeUnit: 'dona', conversionFactor: 1 },
  kg:   { buyUnit: 'kg',   recipeUnit: 'gramm', conversionFactor: 1000 },
  l:    { buyUnit: 'l',    recipeUnit: 'ml',    conversionFactor: 1000 },
};

function unitPreset(key: string) {
  const preset = UNIT_PRESETS[key];
  if (!preset) {
    throw Errors.Validation(`Noma'lum birlik: ${key}. Quyidagilardan birini tanlang: dona, kg, l`);
  }
  return preset;
}

export type CreateItemMode = 'SERVICE' | 'SIMPLE' | 'COMPOSITE' | 'UNTRACKED';

export type CreateItemInput = {
  categoryId: string;
  name: string;
  price: Prisma.Decimal | string | number;
  description?: string;
  displayOrder?: number;
  mode: CreateItemMode;

  // SIMPLE mode — the item has its own stock (e.g. Pepsi, baklava).
  simple?: {
    unit: keyof typeof UNIT_PRESETS;
    unitCost: string | number;     // cost per buyUnit (e.g. so'm per kg)
    initialQty?: string | number;  // optional — initial stock in buyUnit
  };

  // COMPOSITE mode — the item is made from one or more ingredients (e.g. plov).
  composite?: {
    notes?: string | null;
    ingredients: Array<{
      name: string;
      unit: keyof typeof UNIT_PRESETS;
      quantityPerPortion: string | number; // in recipeUnit (e.g. gramm per portion)
      initialQty: string | number;         // in buyUnit
      initialUnitCost: string | number;    // in so'm per buyUnit
    }>;
  };
};

export const menuService = {
  async listCategories(includeInactive = false) {
    return menuRepo.listCategories(includeInactive);
  },

  async listItems(includeInactive = false) {
    return menuRepo.listItems(includeInactive);
  },

  async listCombos(includeInactive = false) {
    return menuRepo.listCombos(includeInactive);
  },

  async listMenuForClients() {
    const [categories, items, yieldRows] = await Promise.all([
      menuRepo.listCategories(),
      menuRepo.listItems(),
      yieldService.computeAll(),
    ]);

    const yieldMap = new Map(yieldRows.map((row) => [row.menuItemId, row]));

    return categories.map((category) => ({
      ...category,
      items: items
        .filter((item) => item.categoryId === category.id)
        .map((item) => {
          const y = yieldMap.get(item.id);
          const effectivelyAvailable = item.isAvailable
            && (y == null || y.kind === 'UNTRACKED' || (y.possiblePortions ?? 0) > 0);

          return {
            ...item,
            effectivelyAvailable,
          };
        }),
    }));
  },

  async createCategory(data: { name: string; displayOrder?: number }, _actorUserId: string) {
    return withEmitContext(async () => {
      const cat = await menuRepo.createCategory({
        name: data.name,
        displayOrder: data.displayOrder ?? 0,
      });
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return cat;
    });
  },

  async updateCategory(id: string, data: Prisma.CategoryUpdateInput, _actorUserId: string) {
    return withEmitContext(async () => {
      const cat = await menuRepo.updateCategory(id, data);
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return cat;
    });
  },

  /**
   * Create a menu item in one of four modes. All sub-rows (self-ingredient,
   * recipe ingredients, initial purchases) are written in a single
   * transaction — a failure anywhere rolls back the whole creation, so the
   * admin never sees a half-built item.
   *
   * - SIMPLE:    FOOD with its own stock (self-ingredient + optional batch).
   * - COMPOSITE: FOOD made of ingredients (recipe + per-ingredient batch).
   * - UNTRACKED: FOOD with NO recipe and NO self-ingredient — not counted,
   *              always available, no starting number (e.g. choy). Falls
   *              through both blocks below, so only the bare item is created.
   * - SERVICE:   a service-charge line (kind=SERVICE), not food.
   */
  async createItem(data: CreateItemInput, actorUserId: string) {
    return withEmitContext(async () => {
      const name = data.name.trim();
      if (!name) throw Errors.Validation('Mahsulot nomi bo\'sh bo\'lmasin');

      const kind = data.mode === 'SERVICE' ? MenuItemKind.SERVICE : MenuItemKind.FOOD;
      const price = new Prisma.Decimal(data.price);

      // Pre-validate per-mode payload so the transaction doesn't open on bad
      // input. Throws here surface as 400-level validation errors.
      if (data.mode === 'SIMPLE') {
        if (!data.simple) throw Errors.Validation('Oddiy mahsulot uchun ma\'lumotlar yetishmayapti');
        unitPreset(data.simple.unit); // throws if unknown
        if (new Prisma.Decimal(data.simple.unitCost).lte(0)) {
          throw Errors.Validation('Tan narxi 0 dan katta bo\'lishi kerak');
        }
        if (data.simple.initialQty !== undefined && new Prisma.Decimal(data.simple.initialQty).lt(0)) {
          throw Errors.Validation('Boshlang\'ich soni manfiy bo\'lishi mumkin emas');
        }
      } else if (data.mode === 'COMPOSITE') {
        if (!data.composite || data.composite.ingredients.length === 0) {
          throw Errors.Validation('Kompozit ovqatga kamida bitta mahsulot biriktiring');
        }
        const seenNames = new Set<string>();
        for (const ing of data.composite.ingredients) {
          const nm = ing.name.trim();
          if (!nm) throw Errors.Validation('Mahsulot nomi bo\'sh bo\'lmasin');
          if (seenNames.has(nm.toLowerCase())) {
            throw Errors.Validation(`"${nm}" mahsuloti ikki marta kiritilgan`);
          }
          seenNames.add(nm.toLowerCase());
          unitPreset(ing.unit);
          if (new Prisma.Decimal(ing.quantityPerPortion).lte(0)) {
            throw Errors.Validation(`"${nm}" — porsiyaga sarflanadigan miqdor 0 dan katta bo'lsin`);
          }
          if (new Prisma.Decimal(ing.initialQty).lte(0)) {
            throw Errors.Validation(`"${nm}" — boshlang'ich zaxira 0 dan katta bo'lsin`);
          }
          if (new Prisma.Decimal(ing.initialUnitCost).lte(0)) {
            throw Errors.Validation(`"${nm}" — birlik narxi 0 dan katta bo'lsin`);
          }
        }
      }

      const occurredAt = new Date();

      const item = await getPrisma().$transaction(async (tx) => {
        const created = await menuRepo.createItem({
          category: { connect: { id: data.categoryId } },
          name,
          price,
          description: data.description?.trim() || null,
          displayOrder: data.displayOrder ?? 0,
          kind,
        }, tx);

        if (data.mode === 'SIMPLE' && data.simple) {
          const preset = unitPreset(data.simple.unit);
          const conversionFactor = new Prisma.Decimal(preset.conversionFactor);
          // self-ingredient: tracks the item's own stock; sale of 1 portion
          // consumes 1 recipeUnit via consumption.service's selfIngredient path.
          const ingredient = await ingredientRepo.create({
            name,
            parentMenuItem: { connect: { id: created.id } },
            buyUnit: preset.buyUnit,
            recipeUnit: preset.recipeUnit,
            conversionFactor,
            isSelfMenuItem: true,
            selfMenuItem: { connect: { id: created.id } },
          }, tx);

          await auditService.log({
            userId: actorUserId,
            action: 'INGREDIENT_CREATED',
            entityType: 'Ingredient',
            entityId: ingredient.id,
            metadata: { name: ingredient.name, isSelfMenuItem: true, origin: 'menu-create-simple' },
          }, tx);

          const initialQty = data.simple.initialQty !== undefined
            ? new Prisma.Decimal(data.simple.initialQty)
            : new Prisma.Decimal(0);
          if (initialQty.gt(0)) {
            // Cost the user types is per buyUnit (e.g. so'm per dona). The
            // ledger stores it normalised per recipeUnit so the FIFO peel
            // math is consistent across all ingredients.
            const unitCostPerBuyUnit = new Prisma.Decimal(data.simple.unitCost);
            const totalCostUzs = initialQty.mul(unitCostPerBuyUnit).round();
            const quantityRecipeUnit = initialQty.mul(conversionFactor);
            const unitCostPerRecipeUnit = totalCostUzs.div(quantityRecipeUnit);
            await recordInitialPurchaseInTx({
              ingredientId: ingredient.id,
              ingredientName: ingredient.name,
              quantityBuyUnit: initialQty,
              quantityRecipeUnit,
              totalCostUzs,
              unitCostPerRecipeUnit,
              occurredAt,
              actorUserId,
              tx,
            });
          } else {
            // No initial stock — but still set weightedAvgCost so the admin
            // sees the intended cost in lists until the first real purchase.
            const unitCostPerBuyUnit = new Prisma.Decimal(data.simple.unitCost);
            await tx.ingredient.update({
              where: { id: ingredient.id },
              data: { weightedAvgCost: unitCostPerBuyUnit.div(conversionFactor) },
            });
          }
        }

        if (data.mode === 'COMPOSITE' && data.composite) {
          // Recipe shell — RecipeIngredients are connected as we create each
          // ingredient below. `isComplete` flips to true once the row has
          // at least one ingredient, which is always our case here.
          const recipe = await tx.recipe.create({
            data: {
              menuItem: { connect: { id: created.id } },
              notes: data.composite.notes?.trim() || null,
              isComplete: true,
            },
          });

          for (const row of data.composite.ingredients) {
            const ingName = row.name.trim();
            const preset = unitPreset(row.unit);
            const conversionFactor = new Prisma.Decimal(preset.conversionFactor);

            const ingredient = await ingredientRepo.create({
              name: ingName,
              parentMenuItem: { connect: { id: created.id } },
              buyUnit: preset.buyUnit,
              recipeUnit: preset.recipeUnit,
              conversionFactor,
            }, tx);

            await auditService.log({
              userId: actorUserId,
              action: 'INGREDIENT_CREATED',
              entityType: 'Ingredient',
              entityId: ingredient.id,
              metadata: { name: ingredient.name, origin: 'menu-create-composite', dishId: created.id },
            }, tx);

            // Recipe quantity is in recipeUnit per portion (e.g. 200 gramm
            // of guruch per 1 portion of plov).
            await tx.recipeIngredient.create({
              data: {
                recipe: { connect: { id: recipe.id } },
                ingredient: { connect: { id: ingredient.id } },
                quantity: new Prisma.Decimal(row.quantityPerPortion),
              },
            });

            const initialQtyBuyUnit = new Prisma.Decimal(row.initialQty);
            const unitCostPerBuyUnit = new Prisma.Decimal(row.initialUnitCost);
            const totalCostUzs = initialQtyBuyUnit.mul(unitCostPerBuyUnit).round();
            const quantityRecipeUnit = initialQtyBuyUnit.mul(conversionFactor);
            const unitCostPerRecipeUnit = totalCostUzs.div(quantityRecipeUnit);
            await recordInitialPurchaseInTx({
              ingredientId: ingredient.id,
              ingredientName: ingredient.name,
              quantityBuyUnit: initialQtyBuyUnit,
              quantityRecipeUnit,
              totalCostUzs,
              unitCostPerRecipeUnit,
              occurredAt,
              actorUserId,
              tx,
            });
          }

          await recipeRepo.logEdit({
            recipeId: recipe.id,
            editedById: actorUserId,
            beforeJson: { isComplete: false, ingredients: [], notes: null } as Prisma.InputJsonValue,
            afterJson: {
              isComplete: true,
              ingredients: data.composite.ingredients.map((r) => ({
                name: r.name,
                quantityPerPortion: String(r.quantityPerPortion),
              })),
              notes: data.composite.notes ?? null,
            } as Prisma.InputJsonValue,
          }, tx);

          await auditService.log({
            userId: actorUserId,
            action: 'RECIPE_CREATED',
            entityType: 'Recipe',
            entityId: recipe.id,
            metadata: { menuItemId: created.id, ingredientCount: data.composite.ingredients.length },
          }, tx);
        }

        return created;
      });

      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return item;
    });
  },

  async updateItem(id: string, data: Prisma.MenuItemUpdateInput, _actorUserId: string) {
    return withEmitContext(async () => {
      const item = await menuRepo.updateItem(id, data);
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return item;
    });
  },

  async setItemAvailability(id: string, isAvailable: boolean, _actorUserId: string) {
    return withEmitContext(async () => {
      const item = await menuRepo.setAvailability(id, isAvailable);
      deferEmit('all', 'menu:itemAvailability', { menuItemId: id, isAvailable });
      await flushDeferredEmits();
      return item;
    });
  },

  async createCombo(
    data: { name: string; components: Array<{ menuItemId: string; quantity: number }> },
    _actorUserId: string,
  ) {
    return withEmitContext(async () => {
      const combo = await menuRepo.createCombo({
        name: data.name,
        components: {
          create: data.components.map((component) => ({
            quantity: component.quantity,
            menuItem: {
              connect: { id: component.menuItemId },
            },
          })),
        },
      });
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return combo;
    });
  },

  async updateCombo(
    id: string,
    data: { name?: string; isActive?: boolean; components?: Array<{ menuItemId: string; quantity: number }> },
    _actorUserId: string,
  ) {
    return withEmitContext(async () => {
    if (data.components) {
      await menuRepo.replaceComponents(id, data.components);
    }

    const combo = await menuRepo.updateCombo(id, {
      name: data.name,
      isActive: data.isActive,
    });
    deferEmit('all', 'menu:changed', {});
    await flushDeferredEmits();
    return combo;
    });
  },
};
