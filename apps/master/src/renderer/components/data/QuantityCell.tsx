import { formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

export function QuantityCell({
  value,
  unit,
  className,
}: {
  value: string | number | null | undefined;
  unit: string;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)}>
      {formatQuantity(value, unit)}
    </span>
  );
}
