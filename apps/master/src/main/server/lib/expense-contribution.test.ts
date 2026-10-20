import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { expenseContribution, type ExpenseRowForPnl } from './expense-contribution';

const d = (n: number) => new Prisma.Decimal(n);
/** Tashkent wall-clock, as the harness writes it. */
const at = (local: string) => new Date(`${local}:00+05:00`);
// The day being read is 2026-10-08; it ends at the next midnight.
const dayEnd = at('2026-10-09T00:00');
const sameDay = at('2026-10-08T15:00');
const laterDay = at('2026-10-09T10:00');

const row = (over: Partial<ExpenseRowForPnl>): ExpenseRowForPnl => ({
  status: 'ACTIVE',
  amount: d(0),
  repayable: false,
  writtenOffAt: null,
  returns: [],
  original: null,
  ...over,
});

const read = (r: ExpenseRowForPnl) => {
  const c = expenseContribution(r, dayEnd);
  return { operating: c.operating.toNumber(), pending: c.pending.toNumber() };
};

describe('expenseContribution', () => {
  it.each<[string, ExpenseRowForPnl, { operating: number; pending: number }]>([
    ['ACTIVE, not repayable, 40 000', row({ amount: d(40000) }), { operating: 40000, pending: 0 }],
    ['REVERSED, not repayable, 20 000', row({ status: 'REVERSED', amount: d(20000) }), { operating: 20000, pending: 0 }],
    [
      'REVERSAL of a not-repayable, 20 000',
      row({ status: 'REVERSAL', amount: d(20000), original: { repayable: false } }),
      { operating: -20000, pending: 0 },
    ],
    [
      'ACTIVE avans 50 000, 20 000 returned',
      row({ repayable: true, amount: d(50000), returns: [{ amount: d(20000), receivedAt: sameDay }] }),
      { operating: 0, pending: 30000 },
    ],
    ['ACTIVE avans 100 000, written off', row({ repayable: true, amount: d(100000), writtenOffAt: sameDay }), { operating: 0, pending: 0 }],
    ['REVERSED avans 50 000 (undone, §4 (30))', row({ status: 'REVERSED', repayable: true, amount: d(50000) }), { operating: 0, pending: 0 }],
    [
      'REVERSAL of an avans, 50 000',
      row({ status: 'REVERSAL', amount: d(50000), original: { repayable: true } }),
      { operating: 0, pending: 0 },
    ],
    ['REVERSAL whose original is unknown (null), 20 000', row({ status: 'REVERSAL', amount: d(20000), original: null }), { operating: -20000, pending: 0 }],
  ])('%s', (_name, input, expected) => {
    expect(read(input)).toEqual(expected);
  });

  describe('as of the day being read', () => {
    it('a return received after the day ended does not count: avans 50 000, 20 000 returned the next day → 50 000 still pending', () => {
      expect(read(row({ repayable: true, amount: d(50000), returns: [{ amount: d(20000), receivedAt: laterDay }] }))).toEqual({ operating: 0, pending: 50000 });
    });

    it('a write-off on a later day leaves the row pending on this day: avans 100 000 written off the next day → 100 000 pending, 0 Xarajat', () => {
      expect(read(row({ repayable: true, amount: d(100000), writtenOffAt: laterDay }))).toEqual({ operating: 0, pending: 100000 });
    });

    it('a return at the very moment the day ends belongs to the next day', () => {
      expect(read(row({ repayable: true, amount: d(50000), returns: [{ amount: d(20000), receivedAt: dayEnd }] }))).toEqual({ operating: 0, pending: 50000 });
    });
  });

  it('pending never goes below 0 when the returns exceed the avans', () => {
    expect(read(row({ repayable: true, amount: d(50000), returns: [{ amount: d(60000), receivedAt: sameDay }] }))).toEqual({ operating: 0, pending: 0 });
  });
});
