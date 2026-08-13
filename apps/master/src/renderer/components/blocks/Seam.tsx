import * as React from 'react';

import { cn } from '@/lib/utils';

type SeamProps = React.HTMLAttributes<HTMLDivElement> & {
  /** `column` stacks children, `row` lines them up. Ignored when `columns` is set. */
  direction?: 'column' | 'row';
  /** Any `grid-template-columns` value, e.g. `'1fr 112px 88px'` or `'repeat(3, 66px)'`. */
  columns?: string;
  /** Let children wrap onto further lines. Only meaningful with `direction="row"`. */
  wrap?: boolean;
};

/**
 * The structural primitive of Blocks C1.
 *
 * Nothing in this system draws a border. Separation comes from a 2px gap
 * with the page ground showing through it — so a Seam is simply a grid on
 * the seam colour with `gap: 2px`. Put fields inside it and the gaps become
 * the lines.
 *
 * Nesting is expected: a Seam of rows inside a Seam of sections produces one
 * consistent 2px grid across the whole screen.
 */
export const Seam = React.forwardRef<HTMLDivElement, SeamProps>(
  ({ className, direction = 'column', columns, wrap = false, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'grid gap-seam bg-seam',
        !columns && direction === 'row' && (wrap ? 'grid-flow-col auto-cols-max' : 'grid-flow-col'),
        className,
      )}
      style={columns ? { gridTemplateColumns: columns, ...style } : style}
      {...props}
    />
  ),
);
Seam.displayName = 'Seam';
