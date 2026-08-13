import * as React from 'react';

import { cn } from '@/lib/utils';

type FieldTone = 'default' | 'raised' | 'live' | 'settled' | 'owed' | 'selected';

/**
 * Each tone also publishes `--label-fg`, the colour `FieldLabel` reads.
 *
 * A label cannot simply be muted ink: muted-foreground is chosen for the light
 * default surface, and on a coloured fill it collapses — 2.70:1 on settled,
 * 2.26:1 on live, 1.07:1 on owed, where a 12px caption is effectively
 * invisible. Following the fill's own foreground clears 4.5:1 on every tone.
 */
const toneClass: Record<FieldTone, string> = {
  default: 'bg-field text-foreground [--label-fg:var(--muted-foreground)]',
  raised: 'bg-field-raised text-foreground [--label-fg:var(--muted-foreground)]',
  live: 'bg-live text-live-foreground [--label-fg:var(--primary-foreground)]',
  settled: 'bg-settled text-settled-foreground [--label-fg:var(--success-foreground)]',
  owed: 'bg-owed text-owed-foreground [--label-fg:var(--destructive-foreground)]',
  selected: 'bg-selected text-selected-foreground [--label-fg:var(--selected-foreground)]',
};

type FieldProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: FieldTone;
  /** Drop the 12px padding — for fields that hold their own rows or tiles. */
  flush?: boolean;
};

/**
 * Any content surface: a panel, a card slot, a section body.
 *
 * A Field has a fill and padding and nothing else — no border, no radius,
 * no shadow. Place Fields inside a Seam and the 2px gaps between them do
 * the separating.
 */
export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, tone = 'default', flush = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(toneClass[tone], !flush && 'p-pad', className)}
      {...props}
    />
  ),
);
Field.displayName = 'Field';

/**
 * Small caps label used above a value, inside a Field.
 *
 * Takes its colour from the enclosing Field's `--label-fg` so it stays legible
 * on every tone, falling back to muted ink when used outside a Field.
 */
export const FieldLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-[12px] font-semibold uppercase tracking-[0.09em]',
      'text-[hsl(var(--label-fg,var(--muted-foreground)))]',
      className,
    )}
    {...props}
  />
));
FieldLabel.displayName = 'FieldLabel';

type MoneyFieldProps = Omit<FieldProps, 'children'> & {
  label: string;
  /** Pre-formatted for display, e.g. `'12 450 000'`. */
  value: string;
  /** Currency or unit shown small beside the value. */
  unit?: string;
  /** Secondary line under the value — comparison, count, timestamp. */
  note?: React.ReactNode;
  /**
   * `headline` (default) is the 31px page-level figure. `compact` holds the
   * 17px money floor instead, for two or three across inside a panel — where
   * the headline size overflows however narrow the track is allowed to get.
   */
  size?: 'headline' | 'compact';
};

/**
 * The headline money surface. Figures are tabular so columns of these line up
 * down a page. Money never renders below 17px anywhere in the system — here it
 * sits at 31, and in a table row `RowMoney` holds the 17px floor.
 */
export const MoneyField = React.forwardRef<HTMLDivElement, MoneyFieldProps>(
  ({ label, value, unit, note, className, size = 'headline', ...props }, ref) => (
    <Field ref={ref} className={className} {...props}>
      <FieldLabel>{label}</FieldLabel>
      <div
        className={cn(
          'mt-1 font-semibold leading-[1.15] tabular-nums',
          size === 'headline' ? 'text-[31px] tracking-[-0.02em]' : 'text-[17px]',
        )}
      >
        {value}
        {unit ? <span className="ml-1.5 text-[15px] font-normal tracking-normal text-muted-foreground">{unit}</span> : null}
      </div>
      {note ? <div className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">{note}</div> : null}
    </Field>
  ),
);
MoneyField.displayName = 'MoneyField';
