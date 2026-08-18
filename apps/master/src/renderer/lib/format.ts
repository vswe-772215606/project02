/**
 * UI/UX formatters. All values normalised to Asia/Tashkent local time.
 * Rules sourced from docs/UI_UX_RULES.md §9.
 */

const TASHKENT_TZ = 'Asia/Tashkent';

/**
 * Thousands separator for money. A non-breaking space, so a figure never
 * wraps across two lines in a narrow column.
 *
 * ⚠ Screen only. The printer path has its own formatter
 * (`src/main/server/lib/format.ts`) which must stay on an ASCII space —
 * NBSP is 0xC2 0xA0 in UTF-8 and renders as a Chinese glyph on a thermal
 * printer whose default code page is GB18030.
 */
const MONEY_GROUP_SEPARATOR = ' ';

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

/**
 * "1 234 567" — space-grouped, no decimal places, no UZS suffix. Null → "—".
 *
 * Grouping is applied explicitly rather than by `Intl.NumberFormat`. The
 * `uz-UZ` locale resolves to a **comma** separator in Chromium's CLDR data
 * (`uz-Cyrl-UZ` and `ru-RU` both give a space, `uz-UZ` does not), so every
 * money value in the admin UI rendered as "1,673,000" against a rule — and
 * against this function's own documented contract — that says otherwise. A
 * comma is a decimal separator in local convention, which made every figure
 * on the till ambiguous to the person paying it.
 *
 * Doing the grouping here also pins the behaviour: it cannot drift again when
 * a Chrome update ships new CLDR data.
 */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toFixed(0);
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, MONEY_GROUP_SEPARATOR);
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
