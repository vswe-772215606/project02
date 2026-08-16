export function formatUZS(amount: number | string | bigint): string {
  const val = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (isNaN(val)) return '0 UZS';

  return new Intl.NumberFormat('uz-UZ', {
    style: 'currency',
    currency: 'UZS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

export function formatDateTimeUZ(date: string | Date): string {
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch (e) {
    return '—';
  }
}

export function formatMinutesElapsed(date: string | Date | undefined | null): string {
  if (!date) return '—';
  try {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Hozirgina';
    return `${mins} daqiqa`;
  } catch (e) {
    return '—';
  }
}
