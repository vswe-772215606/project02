import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import { Keypad } from './Keypad';

/**
 * A money amount the operator can type OR tap.
 *
 * Two defects sat behind one complaint from the till.
 *
 * The keypad was a fixed 270px block (four 66px rows plus seams) inside a
 * container that also grows by 48px per payment leg, and nothing in that
 * container scrolled. With two legs present the bottom row was cut through the
 * middle, so `0` and backspace could not be pressed — no amount ending in zero
 * could be entered and no mistake corrected, on exactly the nasiya path that
 * needs the most typing. The pad now sits in its own scroller.
 *
 * And no amount anywhere in this app accepted a hardware keyboard: there were
 * zero `onKeyDown` handlers in the whole renderer, and every money value was a
 * plain text node driven only by `Keypad.onKey`. Every till on site has a
 * physical keyboard, one with a numeric pad — the operator asked for it to
 * work and for the on-screen pad to get out of the way. The input is the
 * source of truth now; the pad is an optional companion for finger use.
 *
 * Integer so'm only. There is no sub-so'm amount in this product, and a stray
 * decimal point reached the server's integer schema as an opaque 500.
 */
export function AmountField({
  value,
  onChange,
  onDone,
  showKeypad = true,
  label,
  autoFocus = true,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  onDone?: () => void;
  showKeypad?: boolean;
  label?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleKey = (key: string) => {
    if (key === 'backspace') {
      onChange(Math.floor(value / 10));
      return;
    }
    if (key === '000') {
      onChange(value * 1000);
      return;
    }
    if (key === 'decimal') return;
    onChange(value * 10 + Number(key));
  };

  return (
    <div className={cn('flex shrink-0 flex-col gap-seam', className)}>
      {label ? (
        <div className="shrink-0 bg-field px-pad py-2 text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {label}
        </div>
      ) : null}
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        className="focus-block h-action w-full shrink-0 bg-field px-pad text-right text-[22px] font-semibold tabular-nums"
        value={value === 0 ? '' : String(value)}
        placeholder="0"
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '');
          onChange(digits ? Number(digits) : 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onDone) {
            event.preventDefault();
            onDone();
          }
        }}
      />
      {/* `shrink-0`, and deliberately no scroller of its own. Giving the pad
          its own `overflow-auto` capped it at whatever height was left and
          re-created the clipping one level down — a row sliced through the
          middle, just inside a nested scrollbar. The pad renders at its full
          270px and the surrounding container does the scrolling. */}
      {showKeypad ? <Keypad onKey={handleKey} className="w-full shrink-0 [&>*]:w-full" /> : null}
    </div>
  );
}
