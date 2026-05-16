import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6 text-muted-foreground',
        className,
      )}
    >
      {Icon && <Icon className="h-6 w-6 mb-3 text-muted-foreground/70" strokeWidth={1.5} />}
      <p className="text-base font-medium text-foreground">{title}</p>
      {hint && <p className="text-sm mt-1 max-w-md">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
