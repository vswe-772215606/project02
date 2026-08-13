import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.ComponentProps<'input'> {
  /**
   * Money and quantity entry: larger, semibold, right-aligned, tabular so a
   * column of them lines up.
   */
  numeric?: boolean;
}

/**
 * Blocks C1 input.
 *
 * 48px, filled, and borderless at rest — focus draws a 2px inset ring rather
 * than colouring a border that was never there.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, numeric = false, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-control w-full bg-field px-3 text-foreground',
        'placeholder:text-muted-foreground focus-block',
        'disabled:cursor-not-allowed disabled:bg-field-raised disabled:text-muted-foreground',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        numeric ? 'text-right text-[17px] font-semibold tabular-nums' : 'text-[15px]',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
