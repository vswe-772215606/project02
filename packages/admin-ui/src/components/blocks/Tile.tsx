import * as React from 'react';

import { cn } from '@/lib/utils';

export type TileTone = 'default' | 'live' | 'settled' | 'owed' | 'inert' | 'selected';

const toneClass: Record<TileTone, string> = {
  default: 'bg-field text-foreground',
  live: 'bg-live text-live-foreground',
  settled: 'bg-settled text-settled-foreground',
  owed: 'bg-owed text-owed-foreground',
  inert: 'bg-field-raised text-muted-foreground',
  selected: 'bg-selected text-selected-foreground',
};

type TileProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Main line — table name, dish name, category. */
  label: string;
  /** State word shown beneath. Always present when the tone is not `default`. */
  state?: string;
  tone?: TileTone;
};

/**
 * A square target: floor plan table, menu item, category.
 *
 * The whole tile is the button and the fill is the signal, so there is never
 * a question of whether a tap landed on an edge or inside it. Tiles are laid
 * out inside a Seam, which puts a 2px gap between them.
 */
export const Tile = React.forwardRef<HTMLButtonElement, TileProps>(
  ({ className, label, state, tone = 'default', ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex h-[78px] w-[100px] flex-col justify-between px-2.5 py-2.5 text-left',
        'press-block focus-block disabled:pointer-events-none',
        toneClass[tone],
        className,
      )}
      {...props}
    >
      <span className="text-[14.5px] font-semibold">{label}</span>
      {state ? (
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em]">{state}</span>
      ) : null}
    </button>
  ),
);
Tile.displayName = 'Tile';
