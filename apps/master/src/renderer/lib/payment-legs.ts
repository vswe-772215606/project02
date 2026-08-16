import type { PaymentMethod } from '@/api/orders';

export type Leg = { method: PaymentMethod; amount: number };

/**
 * One leg is the balancing leg: it always holds whatever the other legs do
 * not cover. Adding a method moves the entire outstanding amount into the new
 * leg; editing any other leg makes the balancing leg absorb the difference.
 *
 * This is what the operator asked for — "when other type is added
 * automatically subtract the typed amount from total". The previous behaviour
 * seeded every added leg at 0 while the bill was already fully covered by
 * cash, which made an all-card sale roughly eighteen taps and left a
 * mis-tapped nasiya leg impossible to remove.
 */
function rebalance(legs: Leg[], due: number, balancingIndex: number): Leg[] {
  const others = legs.reduce(
    (sum, leg, index) => (index === balancingIndex ? sum : sum + leg.amount),
    0,
  );
  return legs.map((leg, index) =>
    index === balancingIndex ? { ...leg, amount: Math.max(due - others, 0) } : leg,
  );
}

export function addLeg(
  legs: Leg[],
  method: PaymentMethod,
  due: number,
  balancingIndex: number,
): Leg[] {
  const others = legs.reduce(
    (sum, leg, index) => (index === balancingIndex ? sum : sum + leg.amount),
    0,
  );
  const outstanding = Math.max(due - others, 0);
  const zeroed = legs.map((leg, index) =>
    index === balancingIndex ? { ...leg, amount: 0 } : leg,
  );
  return [...zeroed, { method, amount: outstanding }];
}

export function setLegAmount(
  legs: Leg[],
  index: number,
  amount: number,
  due: number,
  balancingIndex: number,
): Leg[] {
  const updated = legs.map((leg, i) => (i === index ? { ...leg, amount } : leg));
  if (index === balancingIndex) return updated;
  return rebalance(updated, due, balancingIndex);
}

export function removeLeg(
  legs: Leg[],
  index: number,
  due: number,
  balancingIndex: number,
): Leg[] {
  if (legs.length <= 1) return legs;
  const kept = legs.filter((_, i) => i !== index);
  const nextBalancing = index < balancingIndex ? balancingIndex - 1 : balancingIndex;
  return rebalance(kept, due, Math.min(nextBalancing, kept.length - 1));
}
