import { ExpenseStatus, IngredientMovementType, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { expenseRepo } from '../repositories/expense.repo';
import { ingredientRepo } from '../repositories/ingredient.repo';
import { ingredientMovementRepo } from '../repositories/ingredientMovement.repo';
import { purchaseRepo } from '../repositories/purchase.repo';
import { auditService } from './audit.service';
import { isSameLocalDay } from '../lib/time';

const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

function decimalToString(value: Prisma.Decimal | null | undefined, digits = 3): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(digits);
}

function mapPurchase(item: Awaited<ReturnType<typeof purchaseRepo.findById>>) {
  if (!item) return null;
  const consumedQty = item.quantityRecipeUnit.minus(item.remainingQty);
  return {
    id: item.id,
    ingredientId: item.ingredientId,
    ingredient: item.ingredient,
    quantityBuyUnit: decimalToString(item.quantityBuyUnit),
    quantityRecipeUnit: decimalToString(item.quantityRecipeUnit),
    remainingQty: decimalToString(item.remainingQty),
    // Recipe-unit qty already consumed from this batch (= qty - remaining).
    // Surfaced so the UI can warn before delete and block invalid edits.
    consumedQty: decimalToString(consumedQty),
    totalCostUzs: decimalToString(item.totalCostUzs, 0),
    unitCostPerRecipeUnit: decimalToString(item.unitCostPerRecipeUnit),
    supplierNote: item.supplierNote,
    recordedById: item.recordedById,
    recordedByName: item.recordedBy.fullName,
    expenseId: item.expense?.id ?? null,
    occurredAt: item.occurredAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    status: item.status,
    reversedAt: item.reversedAt?.toISOString() ?? null,
    reversedById: item.reversedById,
    reversedByName: item.reversedBy?.fullName ?? null,
    reversalNote: item.reversalNote,
    deletedAt: item.deletedAt?.toISOString() ?? null,
    deletedById: item.deletedById,
    deletionNote: item.deletionNote,
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

  /**
   * Record a new purchase batch.
   *
   * FIFO model: this batch enters with remainingQty = quantityRecipeUnit and
   * sits at the back of the queue (oldest-first peel by occurredAt).
   * Ingredient.weightedAvgCost is refreshed to this batch's unit cost so the
   * "joriy birlik narxi" display follows the most recent purchase.
   * Per-sale COGS is computed by FIFO peel, NOT from weightedAvgCost.
   */
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
      const newStock = oldStock.plus(quantityRecipeUnit);

      const created = await getPrisma().$transaction(async (tx) => {
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

        const purchase = await purchaseRepo.create(
          {
            ingredient: { connect: { id: ingredient.id } },
            quantityBuyUnit,
            quantityRecipeUnit,
            remainingQty: quantityRecipeUnit,
            totalCostUzs,
            unitCostPerRecipeUnit,
            supplierNote: input.supplierNote?.trim() || null,
            recordedBy: { connect: { id: input.actorUserId } },
            occurredAt: input.occurredAt,
            expense: { connect: { id: expense.id } },
          },
          tx,
        );

        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: {
            currentStock: newStock,
            // Display-only "joriy birlik narxi" — follows the most recent
            // purchase so admins see what they last paid. Sale COGS uses FIFO.
            weightedAvgCost: unitCostPerRecipeUnit,
          },
        });

        await ingredientMovementRepo.create(
          {
            ingredient: { connect: { id: ingredient.id } },
            type: IngredientMovementType.PURCHASE,
            quantity: quantityRecipeUnit,
            unitCostSnapshot: unitCostPerRecipeUnit,
            resultingStock: newStock,
            resultingAvgCost: unitCostPerRecipeUnit,
            purchase: { connect: { id: purchase.id } },
            actor: { connect: { id: input.actorUserId } },
            occurredAt: input.occurredAt,
          },
          tx,
        );

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
   * For quantity / amount / ingredient corrections, the user deletes the
   * batch and records a new one. (Soft-delete preserves past sales' COGS.)
   * Refused if already REVERSED or DELETED.
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
      if (existing.status !== 'ACTIVE') {
        throw Errors.Conflict("Faol bo'lmagan xaridni tahrirlab bo'lmaydi");
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
   * Reverse a purchase — same-day, only if NOTHING was peeled from the batch
   * yet (remainingQty == quantityRecipeUnit). Use this when admin realises
   * the batch was entered seconds ago and is wholly wrong. For batches that
   * have already been consumed against, use `delete` instead.
   */
  async reverse(input: { id: string; note: string; actorUserId: string }) {
    return withEmitContext(async () => {
      const existing = await purchaseRepo.findById(input.id);
      if (!existing) {
        throw Errors.NotFound('Xarid');
      }
      if (existing.status !== 'ACTIVE') {
        throw Errors.Conflict('Bu xarid allaqachon yopilgan');
      }
      if (!isSameLocalDay(existing.occurredAt, new Date())) {
        throw Errors.Conflict('Xaridni faqat u kiritilgan kunning o\'zida bekor qilish mumkin');
      }
      if (!existing.remainingQty.eq(existing.quantityRecipeUnit)) {
        throw Errors.Conflict(
          "Bu partiyadan allaqachon iste'mol bo'lgan — bekor qila olmaysiz. \"O'chirish\" tugmasidan foydalaning (faqat qoldiq olinadi).",
        );
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

      await getPrisma().$transaction(async (tx) => {
        await purchaseRepo.update(
          existing.id,
          {
            status: 'REVERSED',
            remainingQty: new Prisma.Decimal(0),
            reversedAt: new Date(),
            reversedBy: { connect: { id: input.actorUserId } },
            reversalNote: note,
          },
          tx,
        );

        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { currentStock: newStock },
        });

        await ingredientMovementRepo.create(
          {
            ingredient: { connect: { id: ingredient.id } },
            type: IngredientMovementType.ADJUST,
            quantity: qtyToRemove.neg(),
            unitCostSnapshot: existing.unitCostPerRecipeUnit,
            resultingStock: newStock,
            resultingAvgCost: ingredient.weightedAvgCost,
            purchase: { connect: { id: existing.id } },
            actor: { connect: { id: input.actorUserId } },
            occurredAt: new Date(),
          },
          tx,
        );

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

  /**
   * Soft-delete a purchase batch.
   *
   * - Untouched batch (remainingQty == quantityRecipeUnit): equivalent to a
   *   full reverse but allowed any day. Stock and expense fully removed.
   * - Partially consumed batch: only the UNUSED portion is removed from
   *   stock and expense. Past sales' OrderLineBatchConsumption rows are
   *   left alone — their cogsSnapshot is frozen at what the admin reported
   *   at the time of sale. This is the "honest history" rule: we never
   *   restate yesterday's reports when correcting today's mistake.
   * - Fully consumed batch (remainingQty == 0): nothing to remove from
   *   stock; the row is just marked DELETED for ledger hygiene. Past
   *   sales remain attributable to this batch.
   */
  async delete(input: { id: string; note: string; actorUserId: string }) {
    return withEmitContext(async () => {
      const existing = await purchaseRepo.findById(input.id);
      if (!existing) {
        throw Errors.NotFound('Xarid');
      }
      if (existing.status !== 'ACTIVE') {
        throw Errors.Conflict('Bu xarid allaqachon yopilgan');
      }
      const note = input.note.trim();
      if (note.length === 0) {
        throw Errors.Validation("O'chirish sababini kiriting");
      }

      const ingredient = await ingredientRepo.findById(existing.ingredientId);
      if (!ingredient) {
        throw Errors.NotFound('Mahsulot');
      }

      const remaining = existing.remainingQty;
      const consumed = existing.quantityRecipeUnit.minus(remaining);
      const stockDelta = remaining; // only the unused portion leaves stock
      const expenseRefund = remaining.mul(existing.unitCostPerRecipeUnit);
      const newStock = ingredient.currentStock.minus(stockDelta);

      if (newStock.isNegative()) {
        // Defence-in-depth: should never happen since remainingQty <= currentStock
        // is the FIFO invariant, but if the ledger is out of sync we'd rather
        // refuse than create negative stock.
        throw Errors.Conflict(
          "Ombor zaxirasi noaniq holatda — sanoq qilib tekshiring.",
        );
      }

      await getPrisma().$transaction(async (tx) => {
        await purchaseRepo.update(
          existing.id,
          {
            status: 'DELETED',
            remainingQty: new Prisma.Decimal(0),
            deletedAt: new Date(),
            deletedBy: { connect: { id: input.actorUserId } },
            deletionNote: note,
          },
          tx,
        );

        if (stockDelta.gt(0)) {
          await tx.ingredient.update({
            where: { id: ingredient.id },
            data: { currentStock: newStock },
          });

          await ingredientMovementRepo.create(
            {
              ingredient: { connect: { id: ingredient.id } },
              type: IngredientMovementType.ADJUST,
              quantity: stockDelta.neg(),
              unitCostSnapshot: existing.unitCostPerRecipeUnit,
              resultingStock: newStock,
              resultingAvgCost: ingredient.weightedAvgCost,
              purchase: { connect: { id: existing.id } },
              actor: { connect: { id: input.actorUserId } },
              occurredAt: new Date(),
            },
            tx,
          );
        }

        // Expense bookkeeping:
        //   - untouched batch: full reverse (mirrors `reverse`)
        //   - partial: REVERSAL row for the unused portion only
        //   - fully consumed: no change (all spend stays as real cost-of-goods)
        if (existing.expense && existing.expense.status === ExpenseStatus.ACTIVE && expenseRefund.gt(0)) {
          if (consumed.lte(0)) {
            // Whole expense is being unwound — mark original REVERSED and
            // mirror with a REVERSAL row (same shape as `reverse`).
            await expenseRepo.updateStatus(existing.expense.id, ExpenseStatus.REVERSED, tx);
            await expenseRepo.create(
              {
                category: { connect: { id: existing.expense.categoryId } },
                amount: existing.expense.amount,
                reason: `REVERSAL: ${existing.expense.reason}`,
                note,
                occurredAt: new Date(),
                status: ExpenseStatus.REVERSAL,
                reversedExpense: { connect: { id: existing.expense.id } },
                createdBy: { connect: { id: input.actorUserId } },
              },
              tx,
            );
          } else {
            // Partial — leave original ACTIVE (it covered the consumed portion),
            // add a standalone REVERSAL-typed row for the unused refund. We
            // don't link reversedExpense because the original isn't being
            // fully unwound; the link is for full reverses only.
            await expenseRepo.create(
              {
                category: { connect: { id: existing.expense.categoryId } },
                amount: expenseRefund,
                reason: `Qisman bekor: ${existing.expense.reason}`,
                note: `Partiyadan ${remaining.toFixed(3)} ${ingredient.recipeUnit} ishlatilmagan. ${note}`,
                occurredAt: new Date(),
                status: ExpenseStatus.REVERSAL,
                createdBy: { connect: { id: input.actorUserId } },
              },
              tx,
            );
          }
        }

        await auditService.log(
          {
            userId: input.actorUserId,
            action: 'PURCHASE_DELETED',
            entityType: 'Purchase',
            entityId: existing.id,
            metadata: {
              ingredientId: ingredient.id,
              ingredientName: ingredient.name,
              totalQty: existing.quantityRecipeUnit.toFixed(3),
              consumedQty: consumed.toFixed(3),
              removedQty: stockDelta.toFixed(3),
              totalCostUzs: existing.totalCostUzs.toFixed(0),
              expenseRefundUzs: expenseRefund.toFixed(0),
              expenseId: existing.expense?.id ?? null,
              previousStock: ingredient.currentStock.toFixed(3),
              newStock: newStock.toFixed(3),
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
