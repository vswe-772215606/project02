import { describe, expect, it } from 'vitest';

import { localDaySchema } from './local-day';
import { isValidLocalDay } from './time';

describe('isValidLocalDay', () => {
  it.each(['2026-10-20', '2026-01-01', '2026-12-31', '2026-02-28', '2024-02-29'])('accepts %s', (value) => {
    expect(isValidLocalDay(value)).toBe(true);
  });

  it.each([
    // the shape is right, the day does not exist
    '2026-13-45', '2026-00-10', '2026-10-00', '2026-10-32', '2026-02-29', '2026-02-30', '2026-04-31', '2026-06-31',
    // the shape is wrong
    '20-10-2026', '2026-10-20T00:00', '2026-10-20 ', ' 2026-10-20', '2026-1-5', '2026-10', '', 'bugun',
  ])('refuses %j', (value) => {
    expect(isValidLocalDay(value)).toBe(false);
  });
});

describe('localDaySchema', () => {
  it('gives the day back unchanged', () => {
    expect(localDaySchema.parse('2026-10-20')).toBe('2026-10-20');
  });

  it("refuses a day that does not exist, saying Sana noto'g'ri", () => {
    const result = localDaySchema.safeParse('2026-13-45');
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual(["Sana noto'g'ri"]);
  });

  it('refuses anything that is not a string', () => {
    expect(localDaySchema.safeParse(20261020).success).toBe(false);
    expect(localDaySchema.safeParse(null).success).toBe(false);
    expect(localDaySchema.safeParse(undefined).success).toBe(false);
  });

  it('can be optional where a query may leave the day out', () => {
    expect(localDaySchema.optional().parse(undefined)).toBeUndefined();
    expect(localDaySchema.optional().safeParse('2026-02-30').success).toBe(false);
  });
});
