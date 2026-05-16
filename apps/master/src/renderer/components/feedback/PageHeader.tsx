import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard top-of-page block: title left, actions right. Per UI_UX_RULES §8.1.
 * Pages should set the title once at mount via usePageTitle() so the Header
 * shows the same string; PageHeader's title is the visible on-page heading.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-4', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground truncate">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
