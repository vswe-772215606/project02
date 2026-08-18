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
        'text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground',
        className,
      )}
      style={{ ...COLUMN_STYLE(columns), ...style }}
      {...props}
    />
  ),
);
RowHeader.displayName = 'RowHeader';

/**
 * Based on `HTMLElement` rather than `HTMLDivElement` because a Row renders as
 * a `<button>` when it has an action: handler parameters are contravariant, so
 * the wider element type is assignable to both branches.
 */
type RowProps = Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> & {
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
 * click handler on a `<tr>` and could not be tabbed to at all.
 *
 * Because a clickable Row *is* the button, never nest another control inside
 * one — button-in-button is invalid and breaks keyboard and screen-reader
 * behaviour. When a line needs its own action, leave the Row non-clickable and
 * put the control in its own grid cell beside it.
 *
 * Feedback is `:active` only. There is deliberately no hover state: the
 * terminal is a touchscreen and hover does not exist there.
 */
export const Row = React.forwardRef<HTMLElement, RowProps>(
  ({ className, columns, selected = false, inert = false, style, onClick, ...props }, ref) => {
    const classes = cn(
      'grid w-full items-center gap-2.5 px-pad text-left text-[14.5px] h-row',
      // Every cell must be allowed to shrink. A grid child defaults to
      // `min-width: auto`, so a `1fr` track is floored at its content width —
      // which means a long cell pushes the row wider instead of truncating,
      // and `truncate` on anything inside it never fires.
      '[&>*]:min-w-0',
      selected
        ? 'bg-selected text-selected-foreground'
        : inert
          ? 'bg-field-raised text-muted-foreground'
          : 'bg-field text-foreground',
      onClick && 'press-block focus-block cursor-pointer',
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

/**
 * Secondary line inside a Row cell — waiter name, timestamp, note.
 *
 * Held to a single truncated line on purpose. A Row is a fixed 48px box, so
 * anything that wraps inside one escapes it: the Kassa panel's "Ketgan"
 * sub-line wrapped to three lines, 60px of text in a 48px row, and spilled
 * 32px over whatever sat beneath. With 36 call sites the failure was not
 * specific to that panel — any long note in any narrow column did it.
 *
 * `min-w-0` is the half that is easy to miss: a grid or flex child defaults to
 * `min-width: auto`, so it refuses to shrink below its content and `truncate`
 * never gets the chance to fire.
 */
export const RowSub = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn('block min-w-0 truncate text-[13px] text-muted-foreground', className)}
    {...props}
  />
));
RowSub.displayName = 'RowSub';

/**
 * Money cell inside a Row — right-aligned, tabular, and held at the 17px
 * money floor rather than inheriting the row's 14.5px body size.
 */
export const RowMoney = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn('text-right text-[17px] font-semibold tabular-nums', className)}
    {...props}
  />
));
RowMoney.displayName = 'RowMoney';
