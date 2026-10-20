import { DebtStatus, Prisma } from '@prisma/client';

/** A debt as the nasiya ledger shows it for one day. */
export type DebtLedgerStatus = 'OPEN' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF';

type Repayment = { amount: Prisma.Decimal; paidAt: Date };

type DebtRows = {
  originalAmount: Prisma.Decimal;
  writtenOffAt: Date | null;
  repayments: Repayment[];
};

const zero = () => new Prisma.Decimal(0);
const total = (rows: Repayment[]) => rows.reduce((sum, row) => sum.plus(row.amount), zero());

/**
 * The status a debt takes once a repayment has landed (money rules D14, D24):
 * paid in full → PAID, written off or not; a balance left on a written-off
 * debt keeps it WRITTEN_OFF — its loss stays booked on the write-off day and
 * the rest stays payable; otherwise PARTIAL.
 */
export function debtStatusAfterRepayment(p: { remaining: Prisma.Decimal; writtenOff: boolean }): DebtStatus {
  if (p.remaining.lte(0)) return DebtStatus.PAID;
  return p.writtenOff ? DebtStatus.WRITTEN_OFF : DebtStatus.PARTIAL;
}

/**
 * What a write-off took off the books: the balance the debt held when it was
 * written off — the original less every repayment made before `writtenOffAt`.
 * Null for a debt never written off. (P6 keeps this in a column; until that
 * migration it is derived from the rows, so a repayment back-dated to before
 * the write-off counts as made before it.)
 */
export function writtenOffAmountOf(debt: DebtRows): Prisma.Decimal | null {
  const writtenOffAt = debt.writtenOffAt;
  if (writtenOffAt === null) return null;
  const paidBefore = total(debt.repayments.filter((row) => row.paidAt < writtenOffAt));
  return Prisma.Decimal.max(debt.originalAmount.minus(paidBefore), zero());
}

/**
 * One debt as the nasiya ledger shows it for the day [dayStart, dayEnd).
 * `totalRepaid` is only what was actually paid up to the day's end — never
 * original − remaining, which counted a write-off as repaid (issue 31). A debt
 * written off by the day's end is WRITTEN_OFF with nothing outstanding; what
 * its write-off still holds — the original less everything paid by the day's
 * end — is `writtenOff`, so a later payment shrinks it (D24).
 */
export function debtLedgerRow(
  debt: DebtRows,
  dayStart: Date,
  dayEnd: Date,
): {
  repaidToday: Prisma.Decimal;
  totalRepaid: Prisma.Decimal;
  remaining: Prisma.Decimal;
  writtenOff: Prisma.Decimal;
  status: DebtLedgerStatus;
} {
  const repaidToday = total(debt.repayments.filter((row) => row.paidAt >= dayStart && row.paidAt < dayEnd));
  const totalRepaid = total(debt.repayments.filter((row) => row.paidAt < dayEnd));

  if (debt.writtenOffAt !== null && debt.writtenOffAt < dayEnd) {
    return {
      repaidToday,
      totalRepaid,
      remaining: zero(),
      writtenOff: Prisma.Decimal.max(debt.originalAmount.minus(totalRepaid), zero()),
      status: 'WRITTEN_OFF',
    };
  }

  const remaining = debt.originalAmount.minus(totalRepaid);
  const status: DebtLedgerStatus = remaining.lte(0) ? 'PAID' : totalRepaid.gt(0) ? 'PARTIAL' : 'OPEN';
  return { repaidToday, totalRepaid, remaining, writtenOff: zero(), status };
}
