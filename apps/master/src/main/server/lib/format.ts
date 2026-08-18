/**
 * "1 234 567" — space-grouped whole so'm.
 *
 * Plain ASCII space as the thousands separator: NBSP (U+00A0, UTF-8 0xC2 0xA0)
 * renders as a Chinese glyph on printers whose default code page is GB18030.
 * The renderer's `formatMoney` uses NBSP instead, because a screen has no such
 * constraint and a figure should not wrap mid-number.
 *
 * Grouping is applied explicitly rather than via `toLocaleString('uz-UZ')`:
 * that locale resolves to a comma separator in Node's ICU data, so the old
 * comma-to-space substitution was doing the real work — and it silently let
 * fractions through, because no `maximumFractionDigits` was ever set.
 */
export function formatUZS(amount: number | string): string {
  const parsed = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(parsed)) return '0';
  const rounded = Math.round(parsed);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toFixed(0);
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatDateTimeUZ(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const year = value.getFullYear();
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}
