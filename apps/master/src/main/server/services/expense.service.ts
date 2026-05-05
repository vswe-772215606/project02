import { ExpenseStatus, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { getPrisma } from '../lib/prisma';
import { expenseRepo } from '../repositories/expense.repo';
import { auditService } from './audit.service';

type Tx = Prisma.TransactionClient;

function decimalToString(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(0);
}

function signedAmount(status: ExpenseStatus, amount: Prisma.Decimal): Prisma.Decimal {
  if (status === ExpenseStatus.REVERSAL) {
    return amount.negated();
  }
  return amount;
}

function mapExpense(item: Awaited<ReturnType<typeof expenseRepo.findById>>) {
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    amount: decimalToString(item.amount),
    signedAmount: decimalToString(signedAmount(item.status, item.amount)),
    reason: item.reason,
    note: item.note,
    occurredAt: item.occurredAt.toISOString(),
    status: item.status,
    reversedExpenseId: item.reversedExpenseId,
    createdById: item.createdById,
    createdByName: item.createdBy.fullName,
    createdAt: item.createdAt.toISOString(),
  };
}

export const expenseService = {
  async listCategories() {
    return expenseRepo.listCategories();
  },

  async listByDate(date: Date) {
    const items = await expenseRepo.listForDate(date);
    let gross = new Prisma.Decimal(0);
    let reversal = new Prisma.Decimal(0);

    const byCategoryMap = new Map<string, { categoryId: string; categoryName: string; amount: Prisma.Decimal }>();

    for (const item of items) {
      if (item.status === ExpenseStatus.ACTIVE) {
        gross = gross.plus(item.amount);
      } else if (item.status === ExpenseStatus.REVERSAL) {
        reversal = reversal.plus(item.amount);
      }

      const sign = signedAmount(item.status, item.amount);
      const existing = byCategoryMap.get(item.categoryId) ?? {
        categoryId: item.categoryId,
        categoryName: item.category.name,
        amount: new Prisma.Decimal(0),
      };
      existing.amount = existing.amount.plus(sign);
      byCategoryMap.set(item.categoryId, existing);
    }

    return {
      date: date.toISOString().slice(0, 10),
      items: items.map((item) => mapExpense({
        ...item,
        reversals: [],
      })!),
      totals: {
        gross: decimalToString(gross),
        reversal: decimalToString(reversal),
        net: decimalToString(gross.minus(reversal)),
      },
      byCategory: Array.from(byCategoryMap.values())
        .filter((item) => !item.amount.isZero())
        .map((item) => ({
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          amount: decimalToString(item.amount),
        })),
    };
  },

  async create(input: {
    categoryId: string;
    amount: string | number;
    reason: string;
    note?: string;
    occurredAt: Date;
    actorUserId: string;
  }) {
    const category = await expenseRepo.findCategoryById(input.categoryId);
    if (!category || !category.isActive) {
      throw Errors.NotFound('Expense category');
    }

    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw Errors.Validation('Chiqim summasi 0 dan katta bo\'lishi kerak');
    }

    const expense = await getPrisma().$transaction(async (tx) => {
      const created = await expenseRepo.create({
        category: { connect: { id: input.categoryId } },
        amount,
        reason: input.reason.trim(),
        note: input.note?.trim() || null,
        occurredAt: input.occurredAt,
        createdBy: { connect: { id: input.actorUserId } },
      }, tx);

      await auditService.log({
        userId: input.actorUserId,
        action: 'EXPENSE_CREATED',
        entityType: 'Expense',
        entityId: created.id,
        metadata: {
          categoryId: input.categoryId,
          categoryName: category.name,
          amount: created.amount.toFixed(0),
          reason: created.reason,
          occurredAt: created.occurredAt.toISOString(),
        },
      }, tx);

      return created;
    });

    return mapExpense({
      ...expense,
      reversals: [],
    });
  },

  async reverse(input: {
    expenseId: string;
    note: string;
    actorUserId: string;
  }) {
    const original = await expenseRepo.findById(input.expenseId);
    if (!original) {
      throw Errors.NotFound('Expense');
    }
    if (original.status !== ExpenseStatus.ACTIVE) {
      if (original.status === ExpenseStatus.REVERSED) {
        throw Errors.ExpenseAlreadyReversed();
      }
      throw Errors.ExpenseReversalInvalid();
    }
    if (original.reversals.length > 0) {
      throw Errors.ExpenseAlreadyReversed();
    }

    const result = await getPrisma().$transaction(async (tx) => {
      await expenseRepo.updateStatus(original.id, ExpenseStatus.REVERSED, tx);

      const reversal = await expenseRepo.create({
        category: { connect: { id: original.categoryId } },
        amount: original.amount,
        reason: `REVERSAL: ${original.reason}`,
        note: input.note.trim(),
        occurredAt: new Date(),
        status: ExpenseStatus.REVERSAL,
        reversedExpense: { connect: { id: original.id } },
        createdBy: { connect: { id: input.actorUserId } },
      }, tx);

      await auditService.log({
        userId: input.actorUserId,
        action: 'EXPENSE_REVERSED',
        entityType: 'Expense',
        entityId: original.id,
        metadata: {
          originalExpenseId: original.id,
          reversalExpenseId: reversal.id,
          amount: original.amount.toFixed(0),
          note: input.note.trim(),
        },
      }, tx);

      return { originalId: original.id, reversalId: reversal.id };
    });

    return {
      original: await expenseRepo.findById(result.originalId),
      reversal: await expenseRepo.findById(result.reversalId),
    };
  },
};
