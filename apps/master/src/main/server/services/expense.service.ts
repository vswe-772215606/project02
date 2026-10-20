import { ExpenseStatus, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { expenseContribution } from '../lib/expense-contribution';
import { getPrisma } from '../lib/prisma';
import { expenseRepo } from '../repositories/expense.repo';
import { userRepo } from '../repositories/user.repo';
import { auditService } from './audit.service';
import { alertService } from './alert.service';
import { writeOffService } from './write-off.service';
import { isSameLocalDay, localDayKey, localDayRange } from '../lib/time';

type Tx = Prisma.TransactionClient;

// A Keldi purchase, or a Chiqim filed as Mahsulot xaridi, is tan narx when the
// dish sells — never Xarajat. The category stays in the cash figures.
const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

function decimalToString(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(0);
}

function signedAmount(status: ExpenseStatus, amount: Prisma.Decimal): Prisma.Decimal {
  if (status === ExpenseStatus.REVERSAL) {
    return amount.negated();
  }
  return amount;
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
    const { start, end } = localDayRange(date);
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

    // Same-day reversal: only REVERSAL rows whose ORIGINAL expense also occurred
    // on this day. Cross-day reversals (e.g. deleting a prior-day ingredient
    // purchase — the REVERSAL row is stamped today but the original cash left on
    // an earlier day) must NOT reduce today's cash-out, otherwise the drawer
    // shows a phantom inflow. The original is "same-day" iff it appears in this
    // day's fetched list. See docs/MOLIYA_KASSA_HISOBLASH_XATOSI.md.
    const idsInDay = new Set(items.map((item) => item.id));
    let sameDayReversal = new Prisma.Decimal(0);

    // Xarajat (operating) and Kutilayotgan qaytim (pending) for the P&L: one
    // rule per row, as of this day's end — lib/expense-contribution.ts. The
    // loss of anything written off today is added after the loop.
    let operating = new Prisma.Decimal(0);
    let pendingRepayable = new Prisma.Decimal(0);

    const byCategoryMap = new Map<string, { categoryId: string; categoryName: string; amount: Prisma.Decimal }>();

    for (const item of items) {
      const isSameDayReversal =
        item.status === ExpenseStatus.REVERSAL &&
        !!item.reversedExpenseId &&
        idsInDay.has(item.reversedExpenseId);

      if (item.status === ExpenseStatus.ACTIVE || item.status === ExpenseStatus.REVERSED) {
        gross = gross.plus(item.amount);
      } else if (item.status === ExpenseStatus.REVERSAL) {
        reversal = reversal.plus(item.amount);
        if (isSameDayReversal) {
          sameDayReversal = sameDayReversal.plus(item.amount);
        }
      }

      // P&L side. Mahsulot xaridi rows contribute nothing to Xarajat whichever
      // filter the caller passed: that money is tan narx when the dish sells.
      const contribution = expenseContribution({
        status: item.status,
        amount: item.amount,
        repayable: item.repayable,
        writtenOffAt: item.writtenOffAt,
        returns: item.returns ?? [],
        original: item.reversedExpense ?? null,
      }, end);
      if (item.categoryId !== INGREDIENT_EXPENSE_CATEGORY_ID) {
        operating = operating.plus(contribution.operating);
      }
      pendingRepayable = pendingRepayable.plus(contribution.pending);

      // Cash "where money went" breakdown: cross-day reversals contribute 0
      // (their original cash belongs to an earlier day), so the per-category
      // sum reconciles to cashOut instead of producing phantom negatives.
      const sign = item.status === ExpenseStatus.REVERSAL
        ? (isSameDayReversal ? item.amount.negated() : new Prisma.Decimal(0))
        : item.amount;
      const existing = byCategoryMap.get(item.categoryId) ?? {
        categoryId: item.categoryId,
        categoryName: item.category.name,
        amount: new Prisma.Decimal(0),
      };
      existing.amount = existing.amount.plus(sign);
      byCategoryMap.set(item.categoryId, existing);
    }

    // What was written off today — an avans less what came back, a nasiya's
    // unpaid balance — is today's Xarajat (D14), whatever day it was given or
    // sold on. No cash moves, so the cash figures above do not see it.
    const writeOffs = await writeOffService.lossesForRange(start, end);
    const writeOffLoss = writeOffs.reduce((sum, loss) => sum.plus(loss.amount), new Prisma.Decimal(0));
    operating = operating.plus(writeOffLoss);

    return {
      date: localDayKey(date),
      items: items.map((item) => mapExpense({
        ...item,
        reversals: [],
      } as any)!),
      totals: {
        gross: decimalToString(gross),
        reversal: decimalToString(reversal),
        net: decimalToString(gross.minus(reversal)),
        // Real cash that left the till today: gross minus only the reversals
        // whose original was also today. Cross-day reversals excluded.
        sameDayReversal: decimalToString(sameDayReversal),
        cashOut: decimalToString(gross.minus(sameDayReversal)),
        operating: decimalToString(operating),
        pendingRepayable: decimalToString(pendingRepayable),
        writeOffLoss: decimalToString(writeOffLoss),
      },
      writeOffs: writeOffs.map((loss) => ({
        kind: loss.kind,
        id: loss.id,
        name: loss.name,
        reason: loss.reason,
        amount: decimalToString(loss.amount),
        writtenOffAt: loss.writtenOffAt.toISOString(),
        writtenOffByName: loss.writtenOffByName,
      })),
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

    // A category the caller named must exist and be active. An unknown one is
    // refused, never silently refiled under the default: the row would carry
    // a category the admin did not choose, and the figures would move with it.
    if (input.categoryId !== undefined && (!category || !category.isActive)) {
      throw Errors.Validation('Chiqim turi topilmadi yoki faol emas');
    }

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

    // Owner alert (post-commit, fire-and-forget). Only manual expenses go
    // through here; ingredient purchases create their expense via
    // purchaseService and are intentionally excluded from this alert.
    void alertService.largeExpense({
      reason: input.reason.trim(),
      amount: amount.toNumber(),
      categoryName: category.name,
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
      throw Errors.ExpenseAlreadyWrittenOff();
    }

    const writeOffReason = input.reason.trim();
    if (!writeOffReason) {
      throw Errors.Validation('Yo\'qotish sababini yozish kerak');
    }

    // Claim the avans before writing anything else: two write-offs at the same
    // moment — a double tap, two stations — write it off once, and the loss is
    // read from the row as it is inside the transaction, not from the read
    // above (a return could have landed in between).
    const lossAmount = await getPrisma().$transaction(async (tx) => {
      const writtenOffAt = new Date();
      const fresh = await expenseRepo.findById(original.id, tx);
      if (!fresh) {
        throw Errors.NotFound('Expense');
      }
      const claimed = await expenseRepo.markWrittenOffIfOpen(
        original.id,
        { writtenOffById: input.actorUserId, writtenOffReason: writeOffReason, writtenOffAt },
        tx,
      );
      if (!claimed) {
        throw Errors.ExpenseAlreadyWrittenOff();
      }

      const returned = (fresh.returns ?? []).reduce(
        (sum, r) => sum.plus(r.amount),
        new Prisma.Decimal(0),
      );
      const loss = fresh.amount.minus(returned);

      await auditService.log({
        userId: input.actorUserId,
        action: 'EXPENSE_WRITTEN_OFF',
        entityType: 'Expense',
        entityId: original.id,
        metadata: {
          reason: writeOffReason,
          originalAmount: fresh.amount.toFixed(0),
          returnedTotal: returned.toFixed(0),
          lossAmount: loss.toFixed(0),
          writtenOffAt: writtenOffAt.toISOString(),
        },
      }, tx);

      return loss;
    });

    // Owner alert (post-commit, fire-and-forget): a write-off always goes out,
    // naming who did it (money rules D14).
    const actor = await userRepo.findById(input.actorUserId);
    void alertService.avansWriteOff({
      reason: original.reason,
      amount: lossAmount.toFixed(0),
      writeOffReason,
      actorName: actor?.fullName ?? null,
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
