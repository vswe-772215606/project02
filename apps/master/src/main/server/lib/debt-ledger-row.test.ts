import { DebtStatus, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { debtLedgerRow, debtStatusAfterRepayment, writtenOffAmountOf } from './debt-ledger-row';

const d = (value: number) => new Prisma.Decimal(value);
/** Tashkent wall-clock time, e.g. at('2026-10-10T11:00'). */
const at = (local: string) => new Date(`${local}:00+05:00`);
/** The Tashkent calendar day as a half-open range. */
const day = (key: string) => {
  const start = at(`${key}T00:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};
const numbers = (row: ReturnType<typeof debtLedgerRow>) => ({
  repaidToday: row.repaidToday.toNumber(),
  totalRepaid: row.totalRepaid.toNumber(),
  remaining: row.remaining.toNumber(),
  writtenOff: row.writtenOff.toNumber(),
  status: row.status,
});

describe('debtStatusAfterRepayment', () => {
  it.each([
    [0, false, DebtStatus.PAID],
    [40000, false, DebtStatus.PARTIAL],
    [40000, true, DebtStatus.WRITTEN_OFF],
    [0, true, DebtStatus.PAID],
  ])('%s left, written off %s → %s', (remaining, writtenOff, status) => {
    expect(debtStatusAfterRepayment({ remaining: d(remaining), writtenOff })).toBe(status);
  });
});

describe('debtLedgerRow', () => {
  // Karim aka: 100 000 opened on 05.10, written off on 10.10 at 11:00, 40 000 paid on 25.10
  // and 60 000 on 26.10 — the P6 table, viewed on each of the four days.
  const karim = {
    originalAmount: d(100000),
    writtenOffAt: at('2026-10-10T11:00'),
    repayments: [
      { amount: d(40000), paidAt: at('2026-10-25T12:00') },
      { amount: d(60000), paidAt: at('2026-10-26T12:00') },
    ],
  };

  it.each([
    ['2026-10-05', { repaidToday: 0, totalRepaid: 0, remaining: 100000, writtenOff: 0, status: 'OPEN' }],
    ['2026-10-10', { repaidToday: 0, totalRepaid: 0, remaining: 0, writtenOff: 100000, status: 'WRITTEN_OFF' }],
    ['2026-10-25', { repaidToday: 40000, totalRepaid: 40000, remaining: 0, writtenOff: 60000, status: 'WRITTEN_OFF' }],
    ['2026-10-26', { repaidToday: 60000, totalRepaid: 100000, remaining: 0, writtenOff: 0, status: 'WRITTEN_OFF' }],
  ])('Karim aka on %s', (key, expected) => {
    const { start, end } = day(key);
    expect(numbers(debtLedgerRow(karim, start, end))).toEqual(expected);
  });

  it('a debt never written off: 45 000 with 5 000 paid is PARTIAL with 40 000 left', () => {
    const { start, end } = day('2026-10-05');
    const row = debtLedgerRow(
      { originalAmount: d(45000), writtenOffAt: null, repayments: [{ amount: d(5000), paidAt: at('2026-10-05T12:00') }] },
      start,
      end,
    );
    expect(numbers(row)).toEqual({ repaidToday: 5000, totalRepaid: 5000, remaining: 40000, writtenOff: 0, status: 'PARTIAL' });
  });

  it('a debt never written off and never paid is OPEN; paid in full it is PAID', () => {
    const { start, end } = day('2026-10-05');
    const open = debtLedgerRow({ originalAmount: d(45000), writtenOffAt: null, repayments: [] }, start, end);
    const paid = debtLedgerRow(
      { originalAmount: d(45000), writtenOffAt: null, repayments: [{ amount: d(45000), paidAt: at('2026-10-05T12:00') }] },
      start,
      end,
    );
    expect(numbers(open)).toEqual({ repaidToday: 0, totalRepaid: 0, remaining: 45000, writtenOff: 0, status: 'OPEN' });
    expect(numbers(paid)).toEqual({ repaidToday: 45000, totalRepaid: 45000, remaining: 0, writtenOff: 0, status: 'PAID' });
  });

  it('a payment on the write-off day, before the write-off, is repaid; the rest is what was written off', () => {
    // 100 000; 5 000 paid at 10:00, written off at 11:00 the same day → 95 000 written off
    const { start, end } = day('2026-10-10');
    const row = debtLedgerRow(
      {
        originalAmount: d(100000),
        writtenOffAt: at('2026-10-10T11:00'),
        repayments: [{ amount: d(5000), paidAt: at('2026-10-10T10:00') }],
      },
      start,
      end,
    );
    expect(numbers(row)).toEqual({ repaidToday: 5000, totalRepaid: 5000, remaining: 0, writtenOff: 95000, status: 'WRITTEN_OFF' });
  });
});

describe('writtenOffAmountOf', () => {
  it('is null for a debt never written off', () => {
    expect(writtenOffAmountOf({ originalAmount: d(45000), writtenOffAt: null, repayments: [{ amount: d(5000), paidAt: at('2026-10-05T12:00') }] })).toBeNull();
  });

  it('is the balance held at the write-off: the original less what was paid before it', () => {
    // 100 000; 30 000 paid on 08.10; written off on 10.10; 40 000 paid on 25.10 → 70 000 was written off
    const amount = writtenOffAmountOf({
      originalAmount: d(100000),
      writtenOffAt: at('2026-10-10T11:00'),
      repayments: [
        { amount: d(30000), paidAt: at('2026-10-08T12:00') },
        { amount: d(40000), paidAt: at('2026-10-25T12:00') },
      ],
    });
    expect(amount?.toNumber()).toBe(70000);
  });

  it('counts a payment at the very instant of the write-off as made after it', () => {
    const amount = writtenOffAmountOf({
      originalAmount: d(45000),
      writtenOffAt: at('2026-10-10T11:00'),
      repayments: [{ amount: d(5000), paidAt: at('2026-10-10T11:00') }],
    });
    expect(amount?.toNumber()).toBe(45000);
  });

  it('never goes below 0', () => {
    const amount = writtenOffAmountOf({
      originalAmount: d(45000),
      writtenOffAt: at('2026-10-10T11:00'),
      repayments: [{ amount: d(50000), paidAt: at('2026-10-08T12:00') }],
    });
    expect(amount?.toNumber()).toBe(0);
  });
});
