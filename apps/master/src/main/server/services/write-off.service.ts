import { Prisma } from '@prisma/client';
import { debtRepo } from '../repositories/debt.repo';
import { expenseRepo } from '../repositories/expense.repo';

export type WriteOffLoss = {
  kind: 'NASIYA' | 'AVANS';
  id: string;
  /** The debtor, or what the avans was for. */
  name: string;
  /** Why it was written off. */
  reason: string;
  amount: Prisma.Decimal;
  writtenOffAt: Date;
  writtenOffByName: string | null;
};

/**
 * The losses a day carries because something was written off on it (money
 * rules D14): a nasiya's unpaid balance, an avans less what came back. Each
 * books on the day of `writtenOffAt` — never on the day the debt was opened or
 * the avans given. A payment on a written-off debt lowers its
 * `remainingAmount`, so the write-off day's loss shrinks by itself (D24).
 */
export const writeOffService = {
  async lossesForRange(start: Date, end: Date): Promise<WriteOffLoss[]> {
    const zero = new Prisma.Decimal(0);
    const [avans, debts] = await Promise.all([
      expenseRepo.listWrittenOffInRange(start, end),
      debtRepo.listWrittenOffInRange(start, end),
    ]);

    const rows: WriteOffLoss[] = [];
    for (const row of avans) {
      if (!row.writtenOffAt) continue;
      const returned = row.returns.reduce((sum, r) => sum.plus(r.amount), zero);
      rows.push({
        kind: 'AVANS',
        id: row.id,
        name: row.reason,
        reason: row.writtenOffReason ?? '',
        amount: Prisma.Decimal.max(row.amount.minus(returned), zero),
        writtenOffAt: row.writtenOffAt,
        writtenOffByName: row.writtenOffBy?.fullName ?? null,
      });
    }
    for (const row of debts) {
      if (!row.writtenOffAt) continue;
      rows.push({
        kind: 'NASIYA',
        id: row.id,
        name: row.debtorName,
        reason: row.writtenOffReason ?? '',
        amount: Prisma.Decimal.max(row.remainingAmount, zero),
        writtenOffAt: row.writtenOffAt,
        writtenOffByName: row.writtenOffBy?.fullName ?? null,
      });
    }
    return rows.sort((a, b) => a.writtenOffAt.getTime() - b.writtenOffAt.getTime());
  },
};
