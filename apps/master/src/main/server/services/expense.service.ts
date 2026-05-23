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

function startOfLocalDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function isSameLocalDay(left: Date, right: Date) {
  return startOfLocalDay(left).getTime() === startOfLocalDay(right).getTime();
}

type RepayStatus = 'NOT_REPAYABLE' | 'PENDING' | 'PARTIAL' | 'RETURNED' | 'WRITTEN_OFF';

function repayStatus(item: NonNullable<Awaited<ReturnType<typeof expenseRepo.findById>>>): RepayStatus {
  if (!item.repayable) return 'NOT_REPAYABLE';
  if (item.writtenOffAt) return 'WRITTEN_OFF';
  const returns = item.returns ?? [];
  const returned = returns.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
  if (returned.gte(item.amount)) return 'RETURNED';
  if (returned.gt(0)) return 'PARTIAL';
  return 'PENDING';
}

function mapExpense(item: Awaited<ReturnType<typeof expenseRepo.findById>>) {
  if (!item) {
    return null;
  }

  const returns = item.returns ?? [];
  const returnedTotal = returns.reduce((sum, r) => sum.plus(r.amount), new Prisma.Decimal(0));
  const remainingAmount = item.repayable
    ? Prisma.Decimal.max(item.amount.minus(returnedTotal), new Prisma.Decimal(0))
    : null;

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
    purchaseId: item.purchaseId,
    repayable: item.repayable,
    repayStatus: repayStatus(item),
    remainingAmount: remainingAmount ? decimalToString(remainingAmount) : null,
    returnedTotal: item.repayable ? decimalToString(returnedTotal) : null,
    writtenOffAt: item.writtenOffAt ? item.writtenOffAt.toISOString() : null,
    writtenOffReason: item.writtenOffReason,
    writtenOffById: item.writtenOffById,
    writtenOffByName: item.writtenOffBy?.fullName ?? null,
    returns: returns.map((r) => ({
      id: r.id,
      amount: decimalToString(r.amount),
      receivedAt: r.receivedAt.toISOString(),
      receivedById: r.receivedById,
      receivedByName: r.receivedBy.fullName,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
    createdById: item.createdById,
    createdByName: item.createdBy.fullName,
    createdAt: item.createdAt.toISOString(),
  };
}

export const expenseService = {
  async listCategories() {
    return expenseRepo.listCategories();
  },

  async listByDate(date: Date, opts: { excludeCategoryIds?: string[] } = {}) {
    const allItems = await expenseRepo.listForDate(date);
    // Optional category filter — used by finance.dailyForAdmin to keep
    // ingredient-purchase Expense rows out of the operating-expense numbers
    // (they're displayed in their own "Xaridlar" block to avoid double-count
    // against COGS).
    const exclude = new Set(opts.excludeCategoryIds ?? []);
    const items = exclude.size > 0
      ? allItems.filter((item) => !exclude.has(item.categoryId))
      : allItems;
    let gross = new Prisma.Decimal(0);
    let reversal = new Prisma.Decimal(0);

    // Operating expense for P&L: excludes pending-repayable rows; for written-off
    // repayables, includes only the loss (amount − returned). Non-repayable rows
    // contribute their full amount.
    let operating = new Prisma.Decimal(0);
    let pendingRepayable = new Prisma.Decimal(0);

    const byCategoryMap = new Map<string, { categoryId: string; categoryName: string; amount: Prisma.Decimal }>();

    for (const item of items) {
      if (item.status === ExpenseStatus.ACTIVE || item.status === ExpenseStatus.REVERSED) {
        gross = gross.plus(item.amount);
      } else if (item.status === ExpenseStatus.REVERSAL) {
        reversal = reversal.plus(item.amount);
      }

      // Operating expense math (per CURRENT_WORKFLOW.md money-flow rules).
      if (item.status === ExpenseStatus.ACTIVE || item.status === ExpenseStatus.REVERSED) {
        if (!item.repayable) {
          operating = operating.plus(item.amount);
        } else if (item.writtenOffAt) {
          const returned = (item.returns ?? []).reduce(
            (sum, r) => sum.plus(r.amount),
            new Prisma.Decimal(0),
          );
          operating = operating.plus(item.amount.minus(returned));
        } else {
          // Pending-repayable: receivable, not an expense.
          const returned = (item.returns ?? []).reduce(
            (sum, r) => sum.plus(r.amount),
            new Prisma.Decimal(0),
          );
          pendingRepayable = pendingRepayable.plus(item.amount.minus(returned));
        }
      } else if (item.status === ExpenseStatus.REVERSAL) {
        operating = operating.minus(item.amount);
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
      } as any)!),
      totals: {
        gross: decimalToString(gross),
        reversal: decimalToString(reversal),
        net: decimalToString(gross.minus(reversal)),
        operating: decimalToString(operating),
        pendingRepayable: decimalToString(pendingRepayable),
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

  async search(filters: {
    q?: string;
    repayable?: boolean;
    openRepayable?: boolean;
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    const items = await expenseRepo.search(filters);
    let mapped = items.map((item) => mapExpense({ ...item, reversals: [] } as any)!);

    // openRepayable also implies "not fully returned" — SQL filter covers
    // `repayable && !writtenOffAt`; drop fully-RETURNED here.
    if (filters.openRepayable) {
      mapped = mapped.filter((i) => i.repayStatus === 'PENDING' || i.repayStatus === 'PARTIAL');
    }

    return mapped;
  },

  async create(input: {
    categoryId?: string;
    amount: string | number;
    reason: string;
    note?: string;
    occurredAt: Date;
    repayable?: boolean;
    actorUserId: string;
  }) {
    // Default category for manual expenses is "Operatsion". Admin no longer
    // chooses a category in the UI — they just type the reason.
    const DEFAULT_CATEGORY_ID = 'seed-cat-operational';

    let categoryId = input.categoryId ?? DEFAULT_CATEGORY_ID;
    let category = await expenseRepo.findCategoryById(categoryId);

    // If the default category doesn't exist (very old dev seed), fall back to
    // any active category — preferring one named "Operatsion" or "Boshqa".
    if (!category || !category.isActive) {
      const all = await expenseRepo.listCategories();
      const fallback =
        all.find((c) => c.name === 'Operatsion') ??
        all.find((c) => c.name === 'Boshqa') ??
        all[0];
      if (!fallback) {
        throw Errors.NotFound('Expense category');
      }
      category = fallback;
      categoryId = fallback.id;
    }

    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw Errors.Validation('Chiqim summasi 0 dan katta bo\'lishi kerak');
    }

    const expense = await getPrisma().$transaction(async (tx) => {
      const created = await expenseRepo.create({
        category: { connect: { id: categoryId } },
        amount,
        reason: input.reason.trim(),
        note: input.note?.trim() || null,
        occurredAt: input.occurredAt,
        repayable: input.repayable ?? false,
        createdBy: { connect: { id: input.actorUserId } },
      }, tx);

      await auditService.log({
        userId: input.actorUserId,
        action: 'EXPENSE_CREATED',
        entityType: 'Expense',
        entityId: created.id,
        metadata: {
          categoryId,
          categoryName: category.name,
          amount: created.amount.toFixed(0),
          reason: created.reason,
          repayable: input.repayable ?? false,
          occurredAt: created.occurredAt.toISOString(),
        },
      }, tx);

      return created;
    });

    return mapExpense(await expenseRepo.findById(expense.id));
  },

  async recordReturn(input: {
    expenseId: string;
    amount: string | number;
    receivedAt: Date;
    note?: string;
    actorUserId: string;
  }) {
    const original = await expenseRepo.findById(input.expenseId);
    if (!original) {
      throw Errors.NotFound('Expense');
    }
    if (!original.repayable) {
      throw Errors.Validation('Bu chiqim qaytariladigan emas');
    }
    if (original.writtenOffAt) {
      throw Errors.Validation('Bu chiqim allaqachon yo\'qotilgan deb belgilangan');
    }

    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw Errors.Validation('Qaytim summasi 0 dan katta bo\'lishi kerak');
    }

    // Sum of existing returns must not exceed the original amount.
    const returned = (original.returns ?? []).reduce(
      (sum, r) => sum.plus(r.amount),
      new Prisma.Decimal(0),
    );
    const remaining = original.amount.minus(returned);
    if (amount.gt(remaining)) {
      throw Errors.Validation(
        `Qaytim qoldiqdan oshib ketmasligi kerak (qoldiq: ${remaining.toFixed(0)})`,
      );
    }

    await getPrisma().$transaction(async (tx) => {
      const created = await expenseRepo.createReturn({
        expense: { connect: { id: original.id } },
        amount,
        receivedAt: input.receivedAt,
        note: input.note?.trim() || null,
        receivedBy: { connect: { id: input.actorUserId } },
      }, tx);

      await auditService.log({
        userId: input.actorUserId,
        action: 'EXPENSE_RETURN_RECEIVED',
        entityType: 'Expense',
        entityId: original.id,
        metadata: {
          expenseReturnId: created.id,
          amount: amount.toFixed(0),
          receivedAt: input.receivedAt.toISOString(),
          remainingAfter: remaining.minus(amount).toFixed(0),
        },
      }, tx);
    });

    return mapExpense(await expenseRepo.findById(original.id));
  },

  async writeOff(input: {
    expenseId: string;
    reason: string;
    actorUserId: string;
  }) {
    const original = await expenseRepo.findById(input.expenseId);
    if (!original) {
      throw Errors.NotFound('Expense');
    }
    if (!original.repayable) {
      throw Errors.Validation('Bu chiqim qaytariladigan emas');
    }
    if (original.writtenOffAt) {
      throw Errors.Validation('Bu chiqim allaqachon yo\'qotilgan deb belgilangan');
    }

    if (!input.reason.trim()) {
      throw Errors.Validation('Yo\'qotish sababini yozish kerak');
    }

    await getPrisma().$transaction(async (tx) => {
      await expenseRepo.markWrittenOff(
        original.id,
        {
          writtenOffById: input.actorUserId,
          writtenOffReason: input.reason.trim(),
        },
        tx,
      );

      const returned = (original.returns ?? []).reduce(
        (sum, r) => sum.plus(r.amount),
        new Prisma.Decimal(0),
      );
      const lossAmount = original.amount.minus(returned);

      await auditService.log({
        userId: input.actorUserId,
        action: 'EXPENSE_WRITTEN_OFF',
        entityType: 'Expense',
        entityId: original.id,
        metadata: {
          reason: input.reason.trim(),
          originalAmount: original.amount.toFixed(0),
          returnedTotal: returned.toFixed(0),
          lossAmount: lossAmount.toFixed(0),
        },
      }, tx);
    });

    return mapExpense(await expenseRepo.findById(original.id));
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
    if (!isSameLocalDay(original.occurredAt, new Date())) {
      throw Errors.ExpenseReversalSameDayOnly();
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
