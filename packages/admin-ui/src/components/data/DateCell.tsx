import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function DateCell({
  value,
  className,
}: {
  value: string | Date | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)}>
      {formatDate(value)}
    </span>
  );
}

export function DateTimeCell({
  value,
  className,
}: {
  value: string | Date | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)}>
      {formatDateTime(value)}
    </span>
  );
}
