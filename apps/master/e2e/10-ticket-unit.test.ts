// The Tasdiqlash ticket's own arithmetic (F6) — pure renderer logic, no server.
import { describe, expect, it } from 'vitest';
import { addLeg, type Leg } from '../src/renderer/lib/payment-legs';
import { formatMoney } from '../src/renderer/lib/format';

/**
 * Mirrors OrderTicket.tsx: `due` (:138-141) and the effect that re-balances the
 * CASH leg whenever `due` changes (:151-166). The seeded CASH leg (index 0) is
 * the balancing leg; the ticket opens with it holding order.totalAmount.
 */
function ticket(foodBase: number, serviceBase: number) {
  const balancingIndex = 0;
  let discount = 0;
  let legs: Leg[] = [{ method: 'CASH', amount: foodBase + serviceBase }];
  const due = () => Math.max(foodBase - discount, 0) + serviceBase;
  const rebalance = () => {
    const others = legs.reduce((s, l, i) => (i === balancingIndex ? s : s + l.amount), 0);
    const target = Math.max(due() - others, 0);
    legs = legs.map((l, i) => (i === balancingIndex ? { ...l, amount: target } : l));
  };
  return {
    addCard() { legs = addLeg(legs, 'CARD', due(), balancingIndex); },
    setDiscount(v: number) { discount = Math.min(v, foodBase); rebalance(); },
    state() {
      const paid = legs.reduce((s, l) => s + l.amount, 0);
      return { due: due(), paid, farq: due() - paid, balanced: paid === due(), legs };
    },
  };
}

describe('Tasdiqlash ticket', () => {
  it('control: discount first, then + Karta — the bill stays payable', () => {
    const t = ticket(100000, 6000);
    t.setDiscount(20000);
    t.addCard();
    expect(t.state().balanced).toBe(true);
  });

  it('[issue 16] + Karta first, then a discount — the bill stays payable', () => {
    const t = ticket(100000, 6000);
    t.addCard();
    t.setDiscount(20000);
    const s = t.state();
    expect(s.balanced, `due ${s.due}, legs ${JSON.stringify(s.legs)}, Farq ${s.farq} — TASDIQLASH stays disabled`).toBe(true);
  });
});

describe('Numbers that are not money', () => {
  it('[latent] "portions per bill" 1.50 is not rounded like money', () => {
    // reports.service.ts:180 sends avgPerOrder as "1.50"; MealSalesSection renders it through formatMoney.
    expect(formatMoney('1.50')).toBe('1.5');
  });
});
