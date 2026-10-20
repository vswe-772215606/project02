import { Prisma } from '@prisma/client';

/**
 * What a Chiqim row contributes to a day's P&L (money rules §4, D14; P6 Task 5).
 * The one place the per-row rule lives: expense.service.listByDate feeds every
 * surface — the Chiqimlar page, the ledger, the admin day, Telegram — from it.
 */
export type ExpenseRowForPnl = {
  status: 'ACTIVE' | 'REVERSED' | 'REVERSAL';
  amount: Prisma.Decimal;
  repayable: boolean;
  writtenOffAt: Date | null;
  returns: Array<{ amount: Prisma.Decimal; receivedAt: Date }>;
  /** REVERSAL rows: the row they undo. Null when it is not known. */
  original: { repayable: boolean } | null;
};

export type ExpenseContribution = {
  /** Xarajat: what the day's profit subtracts for this row. */
  operating: Prisma.Decimal;
  /** Kutilayotgan qaytim: an avans still owed back as the day ends. */
  pending: Prisma.Decimal;
};

/**
 * `dayEnd` is the end of the day being read: the balance of an avans and the
 * question "was it written off yet" are answered AS OF that moment, so a return
 * or a write-off on a later day never rewrites the day the avans was given
 * (a day already read must not change). The loss of a written-off avans books
 * on the write-off day through writeOffService, never here.
 */
export function expenseContribution(row: ExpenseRowForPnl, dayEnd: Date): ExpenseContribution {
  const zero = new Prisma.Decimal(0);
  if (row.status === 'REVERSAL') {
    // Undoing an avans undoes a receivable, never an expense: it must not
    // lower Xarajat (§4 (30)). Undoing an ordinary expense does. An unknown
    // original is read as ordinary.
    return { operating: row.original?.repayable ? zero : row.amount.negated(), pending: zero };
  }
  if (!row.repayable) {
    // ACTIVE or REVERSED: the cash went out; a REVERSED row's own REVERSAL
    // row takes it back on the day it was undone.
    return { operating: row.amount, pending: zero };
  }
  // An avans is owed back, not spent. Once undone (REVERSED) it is nothing;
  // once written off, its loss is the write-off day's (D14).
  if (row.status === 'REVERSED') return { operating: zero, pending: zero };
  if (row.writtenOffAt !== null && row.writtenOffAt < dayEnd) return { operating: zero, pending: zero };
  const returned = row.returns
    .filter((r) => r.receivedAt < dayEnd)
    .reduce((sum, r) => sum.plus(r.amount), zero);
  return { operating: zero, pending: Prisma.Decimal.max(row.amount.minus(returned), zero) };
}
