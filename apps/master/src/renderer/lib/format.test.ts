import { describe, expect, it } from 'vitest';

import { formatMoney } from './format';

/**
 * The separator is the whole point of these tests.
 *
 * `Intl.NumberFormat('uz-UZ')` groups with a COMMA in Chromium's CLDR data,
 * so every money value in the admin UI shipped as "1,673,000" — against
 * UI_UX_RULES §9.1, and against `formatMoney`'s own documented contract. A
 * comma reads as a decimal separator locally, which made every figure on the
 * till ambiguous to the person paying it.
 *
 * NBSP (U+00A0) rather than an ASCII space, so a figure never wraps across
 * two lines in a narrow column. The printer path keeps ASCII — see
 * `src/main/server/lib/format.ts`.
 */
const NB = ' ';

describe('formatMoney', () => {
  it('groups thousands with a non-breaking space, never a comma', () => {
    expect(formatMoney(1673000)).toBe(`1${NB}673${NB}000`);
    expect(formatMoney(1673000)).not.toContain(',');
  });

  it('groups every magnitude on the three-digit boundary', () => {
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(1)).toBe('1');
    expect(formatMoney(999)).toBe('999');
    expect(formatMoney(1000)).toBe(`1${NB}000`);
    expect(formatMoney(12000)).toBe(`12${NB}000`);
    expect(formatMoney(999999)).toBe(`999${NB}999`);
    expect(formatMoney(1000000)).toBe(`1${NB}000${NB}000`);
  });

  it('accepts the decimal strings the API sends', () => {
    // Every money field crosses the wire as a Decimal rendered by toFixed(0).
    expect(formatMoney('302000')).toBe(`302${NB}000`);
    expect(formatMoney('0')).toBe('0');
  });

  it('rounds to whole so\'m — there is no sub-so\'m amount in this product', () => {
    // The payroll average was rendering as "16 666.667" before this: three
    // files hand-rolled toLocaleString with no maximumFractionDigits.
    expect(formatMoney(150000 / 9)).toBe(`16${NB}667`);
    expect(formatMoney(0.4)).toBe('0');
    expect(formatMoney(0.5)).toBe('1');
  });

  it('keeps the sign outside the grouping for reversals and negative drawers', () => {
    expect(formatMoney(-1545000)).toBe(`-1${NB}545${NB}000`);
    expect(formatMoney(-999)).toBe('-999');
  });

  it('renders a dash for absent values, and zero as zero', () => {
    // UI_UX_RULES §9.1: only nullable money renders "—"; zero is "0".
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney('')).toBe('—');
    expect(formatMoney('abc')).toBe('—');
    expect(formatMoney(Number.NaN)).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatMoney(0)).toBe('0');
  });
});
