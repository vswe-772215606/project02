import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

/**
 * Right-aligned, tabular-numeric UZS amount. Negative values are tinted
 * destructive. UI_UX_RULES §9.1.
 */
export function MoneyCell({
  value,
  className,
}: {
  value: string | number | null | undefined;
  className?: string;
}) {
  const n = typeof value === 'number' ? value : value != null ? Number(value) : null;
  const isNegative = n !== null && Number.isFinite(n) && n < 0;
  return (
    <span
      className={cn(
        'tabular-nums text-right',
        isNegative && 'text-destructive',
        className,
      )}
    >
      {formatMoney(value)}
    </span>
  );
}
