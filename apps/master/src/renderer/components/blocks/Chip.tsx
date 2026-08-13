import * as React from 'react';

import { cn } from '@/lib/utils';

export type ChipTone = 'live' | 'settled' | 'owed' | 'inert' | 'selected';

const toneClass: Record<ChipTone, string> = {
  live: 'bg-live text-live-foreground',
  settled: 'bg-settled text-settled-foreground',
  owed: 'bg-owed text-owed-foreground',
  inert: 'bg-field-raised text-muted-foreground',
  selected: 'bg-selected text-selected-foreground',
};

/**
 * A Chip is a label, never a control.
 *
 * The props are an allowlist rather than an omission list: subtracting the
 * handlers you can think of still leaves `role`, `onFocus` and every pointer
 * and touch event untouched — and pointer events are the natural interaction
 * vector on a till, so a denylist blocks the wrong things. Naming what a
 * label legitimately needs means nothing interactive can slip through at all.
 *
 * Use a `Button` or a clickable `Row` when a press is actually wanted.
 */
type ChipProps = {
  tone?: ChipTone;
  children?: React.ReactNode;
  className?: string;
  /** Hover text for the rare abbreviation. Never the only carrier of meaning. */
  title?: string;
  id?: string;
};

/**
 * A state label: solid fill, no outline, no dot, no icon.
 *
 * The word is always present — `Kutilmoqda`, `Yopilgan`, `Nasiya` — so the
 * colour never carries the meaning on its own.
 */
export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, tone = 'inert', children, title, id }, ref) => (
    <span
      ref={ref}
      id={id}
      title={title}
      className={cn(
        'inline-flex items-center px-2.5 py-1.5',
        'text-[12px] font-semibold uppercase tracking-[0.05em]',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  ),
);
Chip.displayName = 'Chip';
