/**
 * UI/UX formatters. All values normalised to Asia/Tashkent local time.
 * Rules sourced from docs/UI_UX_RULES.md §9.
 */

const TASHKENT_TZ = 'Asia/Tashkent';

const moneyFormatter = new Intl.NumberFormat('uz-UZ', {
  maximumFractionDigits: 0,
  useGrouping: true,
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TASHKENT_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// "YYYY-MM-DD" in Asia/Tashkent — matches the backend's localDayKey output
// and the format <input type="date"> expects.
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TASHKENT_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TASHKENT_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  return value instanceof Date ? value : new Date(value);
}

/** "1 234 567" — uz-UZ grouping, no decimal places, no UZS suffix. Null → "—". */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return moneyFormatter.format(n);
}

/** "15.05.2026" in Asia/Tashkent. Null → "—". */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return dateFormatter.format(d).replace(/\//g, '.');
}

/** "15.05.2026 14:32" in Asia/Tashkent. Null → "—". */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d || Number.isNaN(d.getTime())) return '—';
  // Intl en-GB returns "15/05/2026, 14:32" — swap slashes for dots and drop the comma.
  return dateTimeFormatter.format(d).replace(/\//g, '.').replace(',', '');
}

/**
 * "YYYY-MM-DD" for the given instant (default: now) in Asia/Tashkent. Matches
 * the backend's localDayKey output exactly, so a value produced here can be
 * passed straight back to `/api/reports/daily?date=…` and the bucket is
 * guaranteed correct regardless of the renderer's host TZ.
 */
export function tashkentDayKey(at: Date = new Date()): string {
  return dayKeyFormatter.format(at);
}

/** "YYYY-MM" for the given instant (default: now) in Asia/Tashkent. */
export function tashkentMonthKey(at: Date = new Date()): string {
  return tashkentDayKey(at).slice(0, 7);
}

/** "500 g" — quantity with unit. Null → "—". */
export function formatQuantity(
  value: string | number | null | undefined,
  unit: string,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  // Strip trailing zeros: 500.000 → "500", 0.250 → "0.25".
  const formatted = Number.isInteger(n) ? n.toString() : n.toString();
  return `${formatted} ${unit}`;
}
