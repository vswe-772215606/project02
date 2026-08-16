import { describe, expect, it } from 'vitest';
import { addLeg, removeLeg, setLegAmount, type Leg } from './payment-legs';

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

  it('rebalances when due changes, e.g. after a discount', () => {
    const legs: Leg[] = [cash(106_000)];
    const next = setLegAmount(legs, 0, 96_000, 96_000, 0);
    expect(next[0]?.amount).toBe(96_000);
  });
});
