import { describe, expect, it } from 'vitest';
import { addLeg, removeLeg, setLegAmount, toPayments, type Leg } from './payment-legs';

const cash = (amount: number): Leg => ({ method: 'CASH', amount });

describe('payment legs', () => {
  it('moves the whole outstanding into a newly added method', () => {
    const next = addLeg([cash(106_000)], 'DEBT', 106_000, 0);
    expect(next).toEqual([
      { method: 'CASH', amount: 0 },
      { method: 'DEBT', amount: 106_000 },
    ]);
  });

  it('keeps the legs summing to due after adding', () => {
    const next = addLeg([cash(106_000)], 'CARD', 106_000, 0);
    expect(next.reduce((sum, leg) => sum + leg.amount, 0)).toBe(106_000);
  });

  it('makes the balancing leg absorb an edit to another leg', () => {
    const legs: Leg[] = [cash(106_000), { method: 'DEBT', amount: 0 }];
    const next = setLegAmount(legs, 1, 40_000, 106_000, 0);
    expect(next[0]?.amount).toBe(66_000);
    expect(next[1]?.amount).toBe(40_000);
  });

  it('clamps the balancing leg at zero rather than going negative', () => {
    const legs: Leg[] = [cash(106_000), { method: 'DEBT', amount: 0 }];
    const next = setLegAmount(legs, 1, 150_000, 106_000, 0);
    expect(next[0]?.amount).toBe(0);
    expect(next[1]?.amount).toBe(150_000);
  });

  it('editing the balancing leg itself leaves the others alone', () => {
    const legs: Leg[] = [cash(60_000), { method: 'CARD', amount: 46_000 }];
    const next = setLegAmount(legs, 0, 70_000, 106_000, 0);
    expect(next[0]?.amount).toBe(70_000);
    expect(next[1]?.amount).toBe(46_000);
  });

  it('returns the removed amount to the balancing leg', () => {
    const legs: Leg[] = [cash(66_000), { method: 'DEBT', amount: 40_000 }];
    const next = removeLeg(legs, 1, 106_000, 0);
    expect(next).toEqual([{ method: 'CASH', amount: 106_000 }]);
  });

  it('never removes the last leg', () => {
    const legs: Leg[] = [cash(106_000)];
    expect(removeLeg(legs, 0, 106_000, 0)).toEqual(legs);
  });

  // The original version of this test edited the leg at balancingIndex
  // itself, which takes rebalance's early return and never reads `due` —
  // it passed for the wrong reason and pinned nothing about a due change.
  // This edits a non-balancing leg with a due that no longer equals the
  // legs' current sum (106_000), so the balancing leg's new amount can only
  // come from actually consulting `due`.
  it('rebalances the balancing leg to match a due that no longer equals the legs sum', () => {
    const legs: Leg[] = [cash(66_000), { method: 'CARD', amount: 40_000 }];
    const next = setLegAmount(legs, 1, 40_000, 96_000, 0);
    expect(next[0]?.amount).toBe(56_000);
    expect(next[1]?.amount).toBe(40_000);
  });

  // removeLeg's balancing-index bookkeeping has three branches; each of the
  // three cases below exercises one that the tests above never touched.
  it('shifts the balancing index down when a leg before it is removed', () => {
    const legs: Leg[] = [
      { method: 'CARD', amount: 20_000 },
      { method: 'DEBT', amount: 20_000 },
      cash(66_000),
    ];
    // CASH is the balancing leg at index 2; removing index 0 (before it)
    // must re-point balancing at CASH's new position (index 1), not stay at
    // the numeral 2, which would now be out of range.
    const next = removeLeg(legs, 0, 106_000, 2);
    expect(next).toEqual([
      { method: 'DEBT', amount: 20_000 },
      { method: 'CASH', amount: 86_000 },
    ]);
  });

  it('hands balancing duty to the next leg when the balancing leg itself is removed', () => {
    const legs: Leg[] = [
      cash(66_000),
      { method: 'CARD', amount: 20_000 },
      { method: 'DEBT', amount: 20_000 },
    ];
    // CASH is the balancing leg at index 0. Removing it should not leave the
    // ticket without a balancing leg — the leg that shifts into index 0
    // (CARD) takes over.
    const next = removeLeg(legs, 0, 106_000, 0);
    expect(next).toEqual([
      { method: 'CARD', amount: 86_000 },
      { method: 'DEBT', amount: 20_000 },
    ]);
  });

  it('clamps the recomputed balancing index to stay in range', () => {
    const legs: Leg[] = [cash(66_000), { method: 'DEBT', amount: 40_000 }];
    // DEBT is the balancing leg at the last index (1). Removing it leaves a
    // single-element array whose only valid index is 0 — without the
    // Math.min clamp, rebalance would look for index 1 in a 1-element array,
    // find nothing, and leave CASH at its stale 66_000.
    const next = removeLeg(legs, 1, 106_000, 1);
    expect(next).toEqual([{ method: 'CASH', amount: 106_000 }]);
  });
});

describe('toPayments', () => {
  it('drops a zero-amount DEBT leg rather than sending a payment with no matching debt block', () => {
    const legs: Leg[] = [cash(106_000), { method: 'DEBT', amount: 0 }];
    expect(toPayments(legs)).toEqual([{ method: 'CASH', amount: 106_000 }]);
  });

  it('keeps a zero-amount CASH leg so a zero-due ticket still sends at least one payment', () => {
    const legs: Leg[] = [cash(0)];
    expect(toPayments(legs)).toEqual([{ method: 'CASH', amount: 0 }]);
  });

  it('keeps a DEBT leg that actually carries an amount', () => {
    const legs: Leg[] = [cash(0), { method: 'DEBT', amount: 106_000 }];
    expect(toPayments(legs)).toEqual([
      { method: 'CASH', amount: 0 },
      { method: 'DEBT', amount: 106_000 },
    ]);
  });
});
