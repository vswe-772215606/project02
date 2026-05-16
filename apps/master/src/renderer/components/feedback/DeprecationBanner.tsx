import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Marks a page that's being phased out. Visible but not loud. Pages with this
 * banner are also hidden from the default sidebar — only URL-reachable.
 */
export function DeprecationBanner({
  message,
  replacement,
  className,
}: {
  message: string;
  replacement?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm',
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
      <div className="flex-1">
        <p className="text-foreground">{message}</p>
        {replacement && <p className="text-xs text-muted-foreground mt-0.5">{replacement}</p>}
      </div>
    </div>
  );
}
