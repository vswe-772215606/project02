import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, FieldLabel, type ChipTone } from '@/components/blocks';
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
        <FieldLabel>{label}</FieldLabel>
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
        {hint != null && <div className="mt-0.5 text-[13px] text-muted-foreground">{hint}</div>}
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
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

/**
 * Label / value row inside a Section (P&L style). Every caller passes a
 * formatted money string as `value`, so it's held at the 17px money floor
 * regardless of the row's own `bold` emphasis — `bold` still toggles weight
 * so totals keep reading heavier than line items.
 */
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
        {hint != null && <div className="mt-0.5 text-[13px] text-muted-foreground">{hint}</div>}
      </div>
      <span
        className={cn(
          'text-[17px] tabular-nums whitespace-nowrap',
          bold && 'font-semibold',
          toneClass(tone),
        )}
      >
        {value}
      </span>
    </div>
  );
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  CLOSED: 'Yopilgan',
  CANCELED: 'Bekor',
  OPEN: 'Ochiq',
  PARTIAL: 'Qisman',
  PAID: 'Yopilgan',
};

// State-tone mapping, not a color palette: CANCELED is `inert` per Row's own
// definition of that tone ("cancelled, disabled, unavailable"); PARTIAL keeps
// a distinct neutral `selected` fill rather than collapsing into OPEN's more
// urgent `live` tone.
const ORDER_STATUS_TONE: Record<string, ChipTone> = {
  CLOSED: 'settled',
  PAID: 'settled',
  OPEN: 'live',
  PARTIAL: 'selected',
  CANCELED: 'inert',
};

export function ReportStatusBadge({ status }: { status: string }) {
  return <Chip tone={ORDER_STATUS_TONE[status] ?? 'inert'}>{ORDER_STATUS_LABEL[status] ?? status}</Chip>;
}
