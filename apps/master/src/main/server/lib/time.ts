/**
 * Tashkent-anchored local-day helpers.
 *
 * Chayxana operates on Asia/Tashkent calendar days (UTC+5, no DST). Storing
 * timestamps as instants (Prisma `DateTime`) is correct, but every "what is
 * today" / "give me this day's window" calculation must be done in Tashkent's
 * frame, NOT the server's local frame. Otherwise reports drift by 5 hours on
 * any non-Tashkent host (containers, CI, dev laptops in other zones).
 *
 * This module is the single source of truth. Anything in services/controllers/
 * repositories that buckets by day must go through it.
 *
 * All returned ranges are half-open: [start, end). end = start + 1 calendar
 * day in Tashkent. Use `gte: start, lt: end` in Prisma `where`.
 */

const TASHKENT_TZ = 'Asia/Tashkent';
const TASHKENT_OFFSET = '+05:00';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TASHKENT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TASHKENT_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Returns "YYYY-MM-DD" in Tashkent for the given instant (defaults to now).
 * Used everywhere we persist or compare a "local day key" — idempotency
 * slots, last-sent markers, audit metadata buckets.
 */
export function localDayKey(at: Date = new Date()): string {
  return dayKeyFormatter.format(at);
}

/**
 * Returns minutes-past-midnight (0..1439) in Tashkent for the given instant.
 * Used by the Telegram scheduler to compare "is it 23:30 yet" against the
 * Tashkent clock instead of the server's clock.
 */
export function localClockMinutes(at: Date = new Date()): number {
  const hhmm = clockFormatter.format(at); // "HH:mm"
  const [hh, mm] = hhmm.split(':').map((part) => parseInt(part, 10));
  return (hh ?? 0) * 60 + (mm ?? 0);
}

/**
 * Returns a Date at 00:00 in Tashkent on the given calendar day, as a UTC
 * instant. The result is suitable for Prisma `gte: start` filters.
 */
export function parseLocalDay(yyyyMmDd: string): Date {
  if (!ISO_DAY.test(yyyyMmDd)) {
    throw new Error(`parseLocalDay: invalid date "${yyyyMmDd}"`);
  }
  return new Date(`${yyyyMmDd}T00:00:00${TASHKENT_OFFSET}`);
}

/**
 * Half-open [start, end) range for the Tashkent calendar day named by
 * `yyyyMmDd`. end = next-day 00:00 in Tashkent.
 */
export function localDayRangeFor(yyyyMmDd: string): { start: Date; end: Date } {
  const start = parseLocalDay(yyyyMmDd);
  const end = new Date(start.getTime() + MS_PER_DAY);
  return { start, end };
}

/**
 * Half-open [start, end) range for the Tashkent calendar month named by
 * `yyyyMm` (e.g. "2026-06"). end = first day of the next month at 00:00.
 */
export function localMonthRangeFor(yyyyMm: string): { start: Date; end: Date } {
  if (!ISO_MONTH.test(yyyyMm)) {
    throw new Error(`localMonthRangeFor: invalid month "${yyyyMm}"`);
  }
  const [yearStr, monthStr] = yyyyMm.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10); // 1..12
  const start = new Date(`${yearStr}-${monthStr}-01T00:00:00${TASHKENT_OFFSET}`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthStr = String(nextMonth).padStart(2, '0');
  const end = new Date(`${nextYear}-${nextMonthStr}-01T00:00:00${TASHKENT_OFFSET}`);
  return { start, end };
}

/**
 * True iff `a` and `b` fall on the same Tashkent calendar day. Replaces the
 * server-local `getFullYear/getMonth/getDate` equality checks that were
 * scattered across purchase.service / expense.service.
 */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return localDayKey(a) === localDayKey(b);
}

// ─── Legacy helpers — kept for stocktake.service.ts and any other caller
// that wants "today" without a key string. ───────────────────────────────

/**
 * Returns a Date at midnight (00:00 Tashkent) on the current calendar day.
 */
export function localToday(now: Date = new Date()): Date {
  return parseLocalDay(localDayKey(now));
}

/**
 * Half-open [start, end) range for the Tashkent day containing `at`.
 */
export function localDayRange(at: Date = new Date()): { start: Date; end: Date } {
  return localDayRangeFor(localDayKey(at));
}
