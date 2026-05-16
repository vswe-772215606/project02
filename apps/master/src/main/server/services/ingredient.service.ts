import { Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { ingredientRepo } from '../repositories/ingredient.repo';
import { auditService } from './audit.service';

function decimalToString(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(3);
}

function mapIngredient(item: Awaited<ReturnType<typeof ingredientRepo.findById>>) {
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    name: item.name,
    parentMenuItemId: item.parentMenuItemId,
    parentMenuItem: item.parentMenuItem,
    buyUnit: item.buyUnit,
    recipeUnit: item.recipeUnit,
    conversionFactor: decimalToString(item.conversionFactor),
    currentStock: decimalToString(item.currentStock),
    weightedAvgCost: decimalToString(item.weightedAvgCost),
    varianceThreshold: decimalToString(item.varianceThreshold),
    isActive: item.isActive,
    isSelfMenuItem: item.isSelfMenuItem,
    selfMenuItemId: item.selfMenuItemId,
    selfMenuItem: item.selfMenuItem,
    expenseCategoryId: item.expenseCategoryId,
    expenseCategory: item.expenseCategory
      ? { id: item.expenseCategory.id, name: item.expenseCategory.name }
      : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export const ingredientService = {
  async list(filters: { isActive?: boolean; isSelfMenuItem?: boolean; parentMenuItemId?: string } = {}) {
    const items = await ingredientRepo.list(filters);
    return items.map((item) => mapIngredient(item)!);
  },

  async getById(id: string) {
    const item = await ingredientRepo.findById(id);
    if (!item) {
      throw Errors.NotFound('Mahsulot');
    }
    return mapIngredient(item)!;
  },

  async create(input: {
    name: string;
    parentMenuItemId: string;
    buyUnit: string;
    recipeUnit: string;
    conversionFactor: string | number;
    varianceThreshold?: string | number;
    isSelfMenuItem?: boolean;
    selfMenuItemId?: string | null;
    expenseCategoryId?: string | null;
    actorUserId: string;
  }) {
    return withEmitContext(async () => {
      const name = input.name.trim();
      if (name.length === 0) {
        throw Errors.Validation('Mahsulot nomi bo\'sh bo\'lishi mumkin emas');
      }

      if (input.isSelfMenuItem && input.selfMenuItemId && input.selfMenuItemId !== input.parentMenuItemId) {
        throw Errors.Validation('Self-ingredient parent va self menu item bir xil bo\'lishi kerak');
      }

      const existing = await ingredientRepo.findByName(input.parentMenuItemId, name);
      if (existing) {
        throw Errors.Conflict('Bu taom uchun shu nomdagi mahsulot allaqachon mavjud');
      }

      const conversionFactor = new Prisma.Decimal(input.conversionFactor);
      if (conversionFactor.lte(0)) {
        throw Errors.Validation('O\'lchov koeffitsiyenti 0 dan katta bo\'lishi kerak');
      }

      const created = await getPrisma().$transaction(async (tx) => {
        const ingredient = await ingredientRepo.create(
          {
            name,
            parentMenuItem: { connect: { id: input.parentMenuItemId } },
            buyUnit: input.buyUnit.trim(),
            recipeUnit: input.recipeUnit.trim(),
            conversionFactor,
            varianceThreshold: input.varianceThreshold !== undefined
              ? new Prisma.Decimal(input.varianceThreshold)
              : new Prisma.Decimal(5),
            isSelfMenuItem: input.isSelfMenuItem ?? false,
            selfMenuItem: input.selfMenuItemId
              ? { connect: { id: input.selfMenuItemId } }
              : undefined,
            expenseCategory: input.expenseCategoryId
              ? { connect: { id: input.expenseCategoryId } }
              : undefined,
          },
          tx,
        );

        await auditService.log(
          {
            userId: input.actorUserId,
            action: 'INGREDIENT_CREATED',
            entityType: 'Ingredient',
            entityId: ingredient.id,
            metadata: {
              name: ingredient.name,
              parentMenuItemId: ingredient.parentMenuItemId,
              buyUnit: ingredient.buyUnit,
              recipeUnit: ingredient.recipeUnit,
              conversionFactor: ingredient.conversionFactor.toFixed(3),
              isSelfMenuItem: ingredient.isSelfMenuItem,
            },
          },
          tx,
        );

        deferEmit('admin', 'ingredient:changed', { ingredientId: ingredient.id });
        return ingredient;
      });

      await flushDeferredEmits();
      return mapIngredient(created);
    });
  },

  async update(
    id: string,
    input: {
      name?: string;
      buyUnit?: string;
      recipeUnit?: string;
      conversionFactor?: string | number;
      varianceThreshold?: string | number;
      isActive?: boolean;
      expenseCategoryId?: string | null;
      actorUserId: string;
    },
  ) {
    return withEmitContext(async () => {
      const existing = await ingredientRepo.findById(id);
      if (!existing) {
        throw Errors.NotFound('Mahsulot');
      }

      const data: Prisma.IngredientUpdateInput = {};
      if (input.name !== undefined) data.name = input.name.trim();
      if (input.buyUnit !== undefined) data.buyUnit = input.buyUnit.trim();
      if (input.recipeUnit !== undefined) data.recipeUnit = input.recipeUnit.trim();
      if (input.conversionFactor !== undefined) {
        data.conversionFactor = new Prisma.Decimal(input.conversionFactor);
      }
      if (input.varianceThreshold !== undefined) {
        data.varianceThreshold = new Prisma.Decimal(input.varianceThreshold);
      }
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.expenseCategoryId !== undefined) {
        data.expenseCategory = input.expenseCategoryId
          ? { connect: { id: input.expenseCategoryId } }
          : { disconnect: true };
      }

      const updated = await getPrisma().$transaction(async (tx) => {
        const updatedRow = await ingredientRepo.update(id, data, tx);

        const action = input.isActive === false
          ? 'INGREDIENT_DEACTIVATED'
          : input.isActive === true
            ? 'INGREDIENT_ACTIVATED'
            : 'INGREDIENT_UPDATED';

        await auditService.log(
          {
            userId: input.actorUserId,
            action,
            entityType: 'Ingredient',
            entityId: id,
            metadata: {
              before: {
                name: existing.name,
                buyUnit: existing.buyUnit,
                recipeUnit: existing.recipeUnit,
                conversionFactor: existing.conversionFactor.toFixed(3),
                varianceThreshold: existing.varianceThreshold.toFixed(3),
                isActive: existing.isActive,
              },
              after: data,
            },
          },
          tx,
        );

        deferEmit('admin', 'ingredient:changed', { ingredientId: id });
        return updatedRow;
      });

      await flushDeferredEmits();
      return mapIngredient(await ingredientRepo.findById(updated.id));
    });
  },
};
