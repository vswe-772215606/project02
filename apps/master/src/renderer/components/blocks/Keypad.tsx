import * as React from 'react';

import { cn } from '@/lib/utils';
import { Seam } from './Seam';

type KeyProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/** One 66px key. Used inside a Keypad, or on its own for a quick-amount pad. */
export const Key = React.forwardRef<HTMLButtonElement, KeyProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex h-key items-center justify-center bg-field text-foreground',
        'text-[22px] font-semibold tabular-nums',
        'press-block focus-block',
        'disabled:pointer-events-none disabled:bg-field-raised disabled:text-muted-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Key.displayName = 'Key';

/** What a Keypad reports. Digits arrive as their own character. */
export type KeypadKey = string | 'decimal' | 'backspace';

type KeypadProps = {
  onKey: (key: KeypadKey) => void;
  /** Sums in so'm are whole numbers, so the decimal key is off by default. */
  showDecimal?: boolean;
  className?: string;
};

const DIGITS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'] as const;

/**
 * Numeric entry for tender and quantity — never for navigation.
 *
 * Fixed three columns of 66px keys with 2px seams, which is the layout every
 * till uses and the one a hand learns without looking.
 */
export function Keypad({ onKey, showDecimal = false, className }: KeypadProps) {
  return (
    <Seam columns="repeat(3, var(--h-key))" className={cn('w-max', className)}>
      {DIGITS.map((digit) => (
        <Key key={digit} onClick={() => onKey(digit)} aria-label={digit}>
          {digit}
        </Key>
      ))}
      {showDecimal ? (
        <Key onClick={() => onKey('decimal')} aria-label="Kasr">
          ,
        </Key>
      ) : (
        <Key disabled />
      )}
      <Key onClick={() => onKey('0')} aria-label="0">
        0
      </Key>
      <Key onClick={() => onKey('backspace')} aria-label="O'chirish">
        ←
      </Key>
    </Seam>
  );
}
