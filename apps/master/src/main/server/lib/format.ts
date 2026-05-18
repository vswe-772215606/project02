export function formatUZS(amount: number | string): string {
  const n = typeof amount === 'string' ? parseInt(amount, 10) : amount;
  // Plain ASCII space as the thousands separator: NBSP (U+00A0, UTF-8 0xC2 0xA0)
  // renders as a Chinese glyph on printers whose default code page is GB18030.
  return n.toLocaleString('uz-UZ').replace(/,/g, ' ');
}

export function formatDateTimeUZ(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const year = value.getFullYear();
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}
