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

type ChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
};

/**
 * A state label: solid fill, no outline, no dot, no icon.
 *
 * The word is always present — `Kutilmoqda`, `Yopilgan`, `Nasiya` — so the
 * colour never carries the meaning on its own.
 */
export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, tone = 'inert', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center px-2.5 py-1.5',
        'text-[11.5px] font-semibold uppercase tracking-[0.05em]',
        toneClass[tone],
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = 'Chip';
