import { describe, expect, it } from 'vitest';

import { somAmount, somAmountOrZero } from './money-input';

describe('somAmount', () => {
  it("takes whole so'm as a number or a string of digits", () => {
    expect(somAmount.parse(45000)).toBe(45000);
    expect(somAmount.parse('45000')).toBe(45000);
  });

  it.each([0, -30000, 99999.5, '0', '-30000', '99999.5', '1e5', '', 'abc', ' 45000', '45000 ', '045000'])('refuses %j', (value) => {
    expect(somAmount.safeParse(value).success).toBe(false);
  });

  it('keeps every accepted amount exact', () => {
    // A number up to 2 ** 53 - 1 is exact, and zod refuses the rest; a string is capped at 15 digits.
    expect(somAmount.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(somAmount.parse('9'.repeat(15))).toBe(999_999_999_999_999);
    expect(somAmount.safeParse(2 ** 53).success).toBe(false);
    expect(somAmount.safeParse('9'.repeat(16)).success).toBe(false);
  });

  it('can be optional and nullable, as a form that leaves the field blank sends it', () => {
    const optional = somAmount.optional().nullable();
    expect(optional.parse(undefined)).toBeUndefined();
    expect(optional.parse(null)).toBeNull();
    expect(optional.parse('12000')).toBe(12000);
    expect(optional.safeParse(0).success).toBe(false);
  });
});

describe('somAmountOrZero', () => {
  it('allows an empty amount of 0', () => {
    expect(somAmountOrZero.parse(0)).toBe(0);
    expect(somAmountOrZero.parse('0')).toBe(0);
  });

  it("takes whole so'm as a number or a string of digits", () => {
    expect(somAmountOrZero.parse(45000)).toBe(45000);
    expect(somAmountOrZero.parse('45000')).toBe(45000);
  });

  it.each([-30000, 99999.5, '-4000', '12.5', '007', '00', '1e5', '', 'abc', ' 0'])('refuses %j', (value) => {
    expect(somAmountOrZero.safeParse(value).success).toBe(false);
  });

  it('keeps every accepted amount exact', () => {
    expect(somAmountOrZero.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(somAmountOrZero.parse('9'.repeat(15))).toBe(999_999_999_999_999);
    expect(somAmountOrZero.safeParse(2 ** 53).success).toBe(false);
    expect(somAmountOrZero.safeParse('9'.repeat(16)).success).toBe(false);
  });
});
