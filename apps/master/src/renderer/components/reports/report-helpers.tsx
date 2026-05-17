import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'good' | 'warning' | 'danger' | 'muted';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-foreground',
  good: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
};

export function toneClass(tone: Tone | undefined): string {
  return TONE_TEXT[tone ?? 'neutral'];
}

/** Sum a list of money strings as BigInt and return as string. */
export function sumMoney(values: string[]): string {
  return values.reduce((sum, value) => sum + BigInt(value || '0'), 0n).toString();
}

/** Top stat tile used in the SalesSummary / ResultsSection. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  size?: 'md' | 'lg';
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'font-semibold tabular-nums',
            size === 'lg' ? 'text-3xl' : 'text-2xl',
            toneClass(tone),
          )}
        >
          {value}
        </div>
        {hint != null && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/** Standard sectioned Card used in P&L style layout. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="space-y-0 pb-3 flex flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

/** Label / value row inside a Section (P&L style). */
export function Row({
  label,
  value,
  bold,
  tone,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  bold?: boolean;
  tone?: Tone;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0 gap-3">
      <div className="min-w-0">
        <div className={cn('text-sm', tone === 'muted' && 'text-muted-foreground')}>{label}</div>
        {hint != null && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <span className={cn('text-sm tabular-nums whitespace-nowrap', bold && 'font-semibold', toneClass(tone))}>
        {value}
      </span>
    </div>
  );
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  CLOSED: 'Yopilgan',
  CANCELED: 'Bekor',
  WALKOUT: "To'lamagan",
  OPEN: 'Ochiq',
  PARTIAL: 'Qisman',
  PAID: 'Yopilgan',
};

const ORDER_STATUS_VARIANT: Record<string, string> = {
  CLOSED: 'bg-success/15 text-success border-success/30',
  CANCELED: 'bg-warning/15 text-warning border-warning/30',
  WALKOUT: 'bg-destructive/15 text-destructive border-destructive/30',
  OPEN: 'bg-warning/15 text-warning border-warning/30',
  PARTIAL: 'bg-info/15 text-info border-info/30',
  PAID: 'bg-success/15 text-success border-success/30',
};

export function ReportStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', ORDER_STATUS_VARIANT[status] ?? 'bg-muted text-foreground border-border')}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
