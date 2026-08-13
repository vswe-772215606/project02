import * as React from 'react';

import { cn } from '@/lib/utils';

type FieldTone = 'default' | 'raised' | 'live' | 'settled' | 'owed' | 'selected';

const toneClass: Record<FieldTone, string> = {
  default: 'bg-field text-foreground',
  raised: 'bg-field-raised text-foreground',
  live: 'bg-live text-live-foreground',
  settled: 'bg-settled text-settled-foreground',
  owed: 'bg-owed text-owed-foreground',
  selected: 'bg-selected text-selected-foreground',
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

/** Small caps label used above a value, inside a Field. */
export const FieldLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground',
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
};

/**
 * The headline money surface. Figures are tabular so columns of these line up
 * down a page. Money never renders below 17px anywhere in the system — here it
 * sits at 31, and in a table row `RowMoney` holds the 17px floor.
 */
export const MoneyField = React.forwardRef<HTMLDivElement, MoneyFieldProps>(
  ({ label, value, unit, note, className, ...props }, ref) => (
    <Field ref={ref} className={cn('min-w-[190px]', className)} {...props}>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 text-[31px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums">
        {value}
        {unit ? <span className="ml-1.5 text-[15px] font-normal tracking-normal text-muted-foreground">{unit}</span> : null}
      </div>
      {note ? <div className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">{note}</div> : null}
    </Field>
  ),
);
MoneyField.displayName = 'MoneyField';
