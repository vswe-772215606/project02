import { IngredientMovementType, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { expenseRepo } from '../repositories/expense.repo';
import { ingredientRepo } from '../repositories/ingredient.repo';
import { ingredientMovementRepo } from '../repositories/ingredientMovement.repo';
import { purchaseRepo } from '../repositories/purchase.repo';
import { auditService } from './audit.service';

const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

function decimalToString(value: Prisma.Decimal | null | undefined, digits = 3): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(digits);
}

function mapPurchase(item: Awaited<ReturnType<typeof purchaseRepo.findById>>) {
  if (!item) return null;
  return {
    id: item.id,
    ingredientId: item.ingredientId,
    ingredient: item.ingredient,
    quantityBuyUnit: decimalToString(item.quantityBuyUnit),
    quantityRecipeUnit: decimalToString(item.quantityRecipeUnit),
    totalCostUzs: decimalToString(item.totalCostUzs, 0),
    unitCostPerRecipeUnit: decimalToString(item.unitCostPerRecipeUnit),
    supplierNote: item.supplierNote,
    recordedById: item.recordedById,
    recordedByName: item.recordedBy.fullName,
    expenseId: item.expense?.id ?? null,
    occurredAt: item.occurredAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
  };
}

export const purchaseService = {
  async list(filters: { from?: Date; to?: Date; ingredientId?: string } = {}) {
    const items = await purchaseRepo.list(filters);
    return items.map((item) => mapPurchase({
      ...item,
      expense: null,
    } as Awaited<ReturnType<typeof purchaseRepo.findById>>));
  },

  async getById(id: string) {
    const item = await purchaseRepo.findById(id);
    if (!item) {
      throw Errors.NotFound('Xarid');
    }
    return mapPurchase(item);
  },

  async record(input: {
    ingredientId: string;
    quantityBuyUnit: string | number;
    totalCostUzs: string | number;
    occurredAt: Date;
    supplierNote?: string;
    actorUserId: string;
  }) {
    return withEmitContext(async () => {
      const ingredient = await ingredientRepo.findById(input.ingredientId);
      if (!ingredient) {
        throw Errors.NotFound('Mahsulot');
      }
      if (!ingredient.isActive) {
        throw Errors.Validation('Faol bo\'lmagan mahsulot uchun xarid kiritib bo\'lmaydi');
      }

      const quantityBuyUnit = new Prisma.Decimal(input.quantityBuyUnit);
      if (quantityBuyUnit.lte(0)) {
        throw Errors.Validation('Xarid miqdori 0 dan katta bo\'lishi kerak');
      }

      const totalCostUzs = new Prisma.Decimal(input.totalCostUzs);
      if (totalCostUzs.lte(0)) {
        throw Errors.Validation('Xarid summasi 0 dan katta bo\'lishi kerak');
      }

      const quantityRecipeUnit = quantityBuyUnit.mul(ingredient.conversionFactor);
      const unitCostPerRecipeUnit = totalCostUzs.div(quantityRecipeUnit);

      const oldStock = ingredient.currentStock;
      const oldAvg = ingredient.weightedAvgCost;
      const newStock = oldStock.plus(quantityRecipeUnit);

      // Weighted average. If oldStock <= 0 then new avg = unitCostPerRecipeUnit.
      const newAvg = oldStock.lte(0)
        ? unitCostPerRecipeUnit
        : oldStock
            .mul(oldAvg)
            .plus(quantityRecipeUnit.mul(unitCostPerRecipeUnit))
            .div(newStock);

      const created = await getPrisma().$transaction(async (tx) => {
        // 1. Expense row (no separate EXPENSE_CREATED audit; the PURCHASE_RECORDED
        // audit carries expenseId for cross-reference).
        const expense = await expenseRepo.create(
          {
            category: { connect: { id: INGREDIENT_EXPENSE_CATEGORY_ID } },
            amount: totalCostUzs,
            reason: `Xarid: ${ingredient.name}`,
            note: input.supplierNote?.trim() || null,
            occurredAt: input.occurredAt,
            createdBy: { connect: { id: input.actorUserId } },
          },
          tx,
        );

        // 2. Purchase row linked to the Expense.
        const purchase = await purchaseRepo.create(
          {
            ingredient: { connect: { id: ingredient.id } },
            quantityBuyUnit,
            quantityRecipeUnit,
            totalCostUzs,
            unitCostPerRecipeUnit,
            supplierNote: input.supplierNote?.trim() || null,
            recordedBy: { connect: { id: input.actorUserId } },
            occurredAt: input.occurredAt,
            expense: { connect: { id: expense.id } },
          },
          tx,
        );

        // 3. Atomic ingredient update — stock + weighted avg cost.
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: {
            currentStock: newStock,
            weightedAvgCost: newAvg,
          },
        });

        // 4. Append ledger movement.
        await ingredientMovementRepo.create(
          {
            ingredient: { connect: { id: ingredient.id } },
            type: IngredientMovementType.PURCHASE,
            quantity: quantityRecipeUnit,
            unitCostSnapshot: unitCostPerRecipeUnit,
            resultingStock: newStock,
            resultingAvgCost: newAvg,
            purchase: { connect: { id: purchase.id } },
            actor: { connect: { id: input.actorUserId } },
            occurredAt: input.occurredAt,
          },
          tx,
        );

        // 5. Single audit row.
        await auditService.log(
          {
            userId: input.actorUserId,
            action: 'PURCHASE_RECORDED',
            entityType: 'Purchase',
            entityId: purchase.id,
            metadata: {
              ingredientId: ingredient.id,
              ingredientName: ingredient.name,
              quantityBuyUnit: quantityBuyUnit.toFixed(3),
              quantityRecipeUnit: quantityRecipeUnit.toFixed(3),
              totalCostUzs: totalCostUzs.toFixed(0),
              unitCostPerRecipeUnit: unitCostPerRecipeUnit.toFixed(3),
              expenseId: expense.id,
              previousStock: oldStock.toFixed(3),
              newStock: newStock.toFixed(3),
              previousAvgCost: oldAvg.toFixed(3),
              newAvgCost: newAvg.toFixed(3),
            },
          },
          tx,
        );

        deferEmit('admin', 'ingredient:changed', { ingredientId: ingredient.id });
        deferEmit('admin', 'purchase:recorded', { purchaseId: purchase.id });

        return purchase;
      });

      await flushDeferredEmits();
      return mapPurchase(await purchaseRepo.findById(created.id));
    });
  },
};
