import { z } from 'zod';

// Both schemas take a number or a string of digits and give back a number.
//
// A number needs no bound of its own here: zod's `.int()` already refuses
// anything outside the safe-integer range (2 ** 53 and up). A string is held to
// 15 digits, which is below 2 ** 53, so `Number` keeps it exact.

/**
 * A whole so'm amount above zero: 45000 or "45000" — never 99999.5, "1e5" or
 * -30000. A debt repayment, an expense and an avans return use it (PRD 14 G3).
 */
export const somAmount = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9]\d{0,14}$/).transform(Number),
]);

/**
 * A whole so'm amount where 0 is allowed: a payment leg (the ticket sends
 * empty legs, and a fully discounted bill can pay 0), a menu price, a discount
 * preset.
 */
export const somAmountOrZero = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^(0|[1-9]\d{0,14})$/).transform(Number),
]);
