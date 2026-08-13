import * as React from 'react';

import { cn } from '@/lib/utils';

const COLUMN_STYLE = (columns?: string): React.CSSProperties | undefined =>
  columns ? { gridTemplateColumns: columns } : undefined;

type RowHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Must match the `columns` given to the Rows beneath it. */
  columns?: string;
};

/** Column header strip. Sits on the raised fill so it reads as chrome, not data. */
export const RowHeader = React.forwardRef<HTMLDivElement, RowHeaderProps>(
  ({ className, columns, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'grid items-center gap-2.5 bg-field-raised px-pad py-2',
        'text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground',
        className,
      )}
      style={{ ...COLUMN_STYLE(columns), ...style }}
      {...props}
    />
  ),
);
RowHeader.displayName = 'RowHeader';

type RowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> & {
  columns?: string;
  /** Inverts the whole row to the selected fill. There is no edge bar. */
  selected?: boolean;
  /** Recedes the row — cancelled, disabled, unavailable. */
  inert?: boolean;
  onClick?: React.MouseEventHandler<HTMLElement>;
};

/**
 * One line of data, 48px tall.
 *
 * A Row with an `onClick` renders as a real button, so it is reachable by
 * keyboard and announced as actionable — the previous table rows carried a
 * click handler on a div and could not be tabbed to at all.
 *
 * Feedback is `:active` only. There is deliberately no hover state: the
 * terminal is a touchscreen and hover does not exist there.
 */
export const Row = React.forwardRef<HTMLElement, RowProps>(
  ({ className, columns, selected = false, inert = false, style, onClick, ...props }, ref) => {
    const classes = cn(
      'grid w-full items-center gap-2.5 px-pad text-left text-[14.5px]',
      'h-row transition-colors duration-75',
      selected
        ? 'bg-selected text-selected-foreground'
        : inert
          ? 'bg-field-raised text-muted-foreground'
          : 'bg-field text-foreground',
      onClick && !selected && !inert && 'active:bg-field-press',
      onClick && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      className,
    );

    if (onClick) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          className={classes}
          style={{ ...COLUMN_STYLE(columns), ...style }}
          onClick={onClick}
          {...props}
        />
      );
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={classes}
        style={{ ...COLUMN_STYLE(columns), ...style }}
        {...props}
      />
    );
  },
);
Row.displayName = 'Row';

/** Secondary line inside a Row cell — waiter name, timestamp, note. */
export const RowSub = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn('block text-[11.5px] text-muted-foreground', className)}
    {...props}
  />
));
RowSub.displayName = 'RowSub';

/** Money cell inside a Row — right-aligned, tabular, semibold. */
export const RowMoney = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn('text-right font-semibold tabular-nums', className)}
    {...props}
  />
));
RowMoney.displayName = 'RowMoney';
