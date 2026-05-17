const TASHKENT_TZ = 'Asia/Tashkent';

const moneyFormatter = new Intl.NumberFormat('uz-UZ', {
  maximumFractionDigits: 0,
  useGrouping: true,
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

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return moneyFormatter.format(n);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return dateTimeFormatter.format(d).replace(/\//g, '.').replace(',', '');
}
