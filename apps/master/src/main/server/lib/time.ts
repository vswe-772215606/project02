const TASHKENT_TZ = 'Asia/Tashkent';

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TASHKENT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Returns a Date at midnight (00:00:00.000) on the current calendar day in
 * Asia/Tashkent (UTC+5). The returned Date is in UTC internally but represents
 * the moment when the local Tashkent day starts.
 *
 * Used as the canonical "today" anchor for ingredient stocktakes, ledger
 * partitioning, and any other surface that needs a stable local-date boundary.
 */
export function localToday(now: Date = new Date()): Date {
  const parts = localDateFormatter.format(now);
  return new Date(`${parts}T00:00:00+05:00`);
}

/**
 * Returns the start- and end-of-day Date bounds (in UTC) for the local
 * Tashkent calendar day that contains the supplied instant. Useful for range
 * queries like `gte: startOfLocalDay(now), lt: endOfLocalDay(now)`.
 */
export function localDayRange(at: Date = new Date()): { start: Date; end: Date } {
  const start = localToday(at);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
