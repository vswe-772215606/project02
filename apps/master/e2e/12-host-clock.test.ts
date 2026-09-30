// Dates on documents depend on the till's own time zone (issue 34).
import { describe, expect, it } from 'vitest';
import { formatDateTimeUZ } from '../src/main/server/lib/format';

describe('Dates on the printed bill', () => {
  it('control: on a till set to Tashkent time, a bill printed at 00:30 shows 30.09.2026 00:30', () => {
    process.env.TZ = 'Asia/Tashkent';
    expect(formatDateTimeUZ(new Date('2026-09-30T00:30:00+05:00'))).toBe('30.09.2026 00:30');
  });

  it('[issue 34] on a till whose Windows time zone is UTC, the same bill still shows the Tashkent date', () => {
    process.env.TZ = 'UTC';
    expect(formatDateTimeUZ(new Date('2026-09-30T00:30:00+05:00'))).toBe('30.09.2026 00:30');
  });
});
