import { ExpenseStatus, IngredientMovementType, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { dayKey } from '../lib/date';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { dailyCloseRepo } from '../repositories/dailyClose.repo';
import { expenseRepo } from '../repositories/expense.repo';
import { ingredientRepo } from '../repositories/ingredient.repo';
import { ingredientMovementRepo } from '../repositories/ingredientMovement.repo';
import { purchaseRepo } from '../repositories/purchase.repo';
import { auditService } from './audit.service';

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

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
    status: item.status,
    isAdjustment: item.isAdjustment,
    reversedAt: item.reversedAt?.toISOString() ?? null,
    reversedById: item.reversedById,
    reversedByName: item.reversedBy?.fullName ?? null,
    reversalNote: item.reversalNote,
  };
}

export const purchaseService = {
  async list(filters: { from?: Date; to?: Date; ingredientId?: string } = {}) {
    const items = await purchaseRepo.list(filters);
    return items.map((item) => mapPurchase(item as Awaited<ReturnType<typeof purchaseRepo.findById>>));
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

      if (input.occurredAt.getTime() > Date.now()) {
        throw Errors.Validation('Xarid sanasi kelajakka qaratib bo\'lmaydi');
      }

      // Yopilgan kunga kiritilgan xarid → tuzatish.
      const closedRow = await dailyCloseRepo.findByDate(dayKey(input.occurredAt));
      const isAdjustment = closedRow !== null;

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
            isAdjustment,
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
            isAdjustment,
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

  /**
   * Light edit — only metadata fields that don't change stock or cost.
   * For quantity / amount / ingredient corrections, the user must reverse
   * the purchase and record a new one. Refused if already REVERSED.
   */
  async update(input: {
    id: string;
    supplierNote?: string | null;
    occurredAt?: Date;
    actorUserId: string;
  }) {
    return withEmitContext(async () => {
      const existing = await purchaseRepo.findById(input.id);
      if (!existing) {
        throw Errors.NotFound('Xarid');
      }
      if (existing.status === 'REVERSED') {
        throw Errors.Conflict("Bekor qilingan xaridni tahrirlab bo'lmaydi");
      }

      const data: Prisma.PurchaseUpdateInput = {};
      if (input.supplierNote !== undefined) data.supplierNote = input.supplierNote?.trim() || null;
      if (input.occurredAt !== undefined) data.occurredAt = input.occurredAt;

      await getPrisma().$transaction(async (tx) => {
        await purchaseRepo.update(input.id, data, tx);

        await auditService.log(
          {
            userId: input.actorUserId,
            action: 'PURCHASE_UPDATED',
            entityType: 'Purchase',
            entityId: input.id,
            metadata: {
              before: {
                supplierNote: existing.supplierNote,
                occurredAt: existing.occurredAt.toISOString(),
              },
              after: {
                supplierNote: input.supplierNote !== undefined ? input.supplierNote?.trim() || null : existing.supplierNote,
                occurredAt: (input.occurredAt ?? existing.occurredAt).toISOString(),
              },
            },
          },
          tx,
        );

        deferEmit('admin', 'purchase:recorded', { purchaseId: input.id });
      });

      await flushDeferredEmits();
      return mapPurchase(await purchaseRepo.findById(input.id));
    });
  },

  /**
   * Reverse a purchase: deducts stock, recomputes weighted-avg cost from
   * remaining ACTIVE purchases, marks the purchase REVERSED, reverses the
   * linked Expense, and writes an ADJUST movement for the ledger.
   *
   * Rules (mirror Chiqim reversal):
   * - Same-day-only. Older corrections go through stocktake.
   * - Refuse if currentStock < quantityRecipeUnit (someone consumed beyond
   *   what we'd be rolling back; reversal would leave negative inventory).
   */
  async reverse(input: { id: string; note: string; actorUserId: string }) {
    return withEmitContext(async () => {
      const existing = await purchaseRepo.findById(input.id);
      if (!existing) {
        throw Errors.NotFound('Xarid');
      }
      if (existing.status === 'REVERSED') {
        throw Errors.Conflict('Bu xarid allaqachon bekor qilingan');
      }
      if (!isSameLocalDay(existing.occurredAt, new Date())) {
        throw Errors.Conflict('Xaridni faqat u kiritilgan kunning o\'zida bekor qilish mumkin');
      }
      const note = input.note.trim();
      if (note.length === 0) {
        throw Errors.Validation('Bekor qilish sababini kiriting');
      }

      const ingredient = await ingredientRepo.findById(existing.ingredientId);
      if (!ingredient) {
        throw Errors.NotFound('Mahsulot');
      }

      const qtyToRemove = existing.quantityRecipeUnit;
      const newStock = ingredient.currentStock.minus(qtyToRemove);
      if (newStock.isNegative()) {
        throw Errors.Conflict(
          "Mahsulot allaqachon ishlatilgan — xaridni bekor qilib bo'lmaydi. Sanoq orqali tuzating.",
        );
      }

      const totals = await purchaseRepo.activeTotalsForIngredient(existing.ingredientId, existing.id);
      const newAvg = totals.qty.lte(0)
        ? new Prisma.Decimal(0)
        : totals.cost.div(totals.qty);

      await getPrisma().$transaction(async (tx) => {
        await purchaseRepo.update(
          existing.id,
          {
            status: 'REVERSED',
            reversedAt: new Date(),
            reversedBy: { connect: { id: input.actorUserId } },
            reversalNote: note,
          },
          tx,
        );

        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: {
            currentStock: newStock,
            weightedAvgCost: newAvg,
          },
        });

        await ingredientMovementRepo.create(
          {
            ingredient: { connect: { id: ingredient.id } },
            type: IngredientMovementType.ADJUST,
            quantity: qtyToRemove.neg(),
            unitCostSnapshot: existing.unitCostPerRecipeUnit,
            resultingStock: newStock,
            resultingAvgCost: newAvg,
            purchase: { connect: { id: existing.id } },
            actor: { connect: { id: input.actorUserId } },
            occurredAt: new Date(),
          },
          tx,
        );

        // Reverse the linked Expense (mirrors expenseService.reverse logic)
        // but inline so we share the transaction and the actor.
        if (existing.expense && existing.expense.status === ExpenseStatus.ACTIVE) {
          await expenseRepo.updateStatus(existing.expense.id, ExpenseStatus.REVERSED, tx);
          await expenseRepo.create(
            {
              category: { connect: { id: existing.expense.categoryId } },
              amount: existing.expense.amount,
              reason: `REVERSAL: ${existing.expense.reason}`,
              note: note,
              occurredAt: new Date(),
              status: ExpenseStatus.REVERSAL,
              reversedExpense: { connect: { id: existing.expense.id } },
              createdBy: { connect: { id: input.actorUserId } },
            },
            tx,
          );
        }

        await auditService.log(
          {
            userId: input.actorUserId,
            action: 'PURCHASE_REVERSED',
            entityType: 'Purchase',
            entityId: existing.id,
            metadata: {
              ingredientId: ingredient.id,
              ingredientName: ingredient.name,
              quantityRecipeUnit: qtyToRemove.toFixed(3),
              totalCostUzs: existing.totalCostUzs.toFixed(0),
              expenseId: existing.expense?.id ?? null,
              previousStock: ingredient.currentStock.toFixed(3),
              newStock: newStock.toFixed(3),
              previousAvgCost: ingredient.weightedAvgCost.toFixed(3),
              newAvgCost: newAvg.toFixed(3),
              note,
            },
          },
          tx,
        );

        deferEmit('admin', 'ingredient:changed', { ingredientId: ingredient.id });
        deferEmit('admin', 'purchase:recorded', { purchaseId: existing.id });
      });

      await flushDeferredEmits();
      return mapPurchase(await purchaseRepo.findById(existing.id));
    });
  },
};
