import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Seam } from '@/components/blocks';

type ScreenProps = {
  /** Shown top-left of the work area. */
  title: string;
  /** Filters, counts, day switchers — top-right of the work area. */
  status?: ReactNode;
  /** The work area. Scrolls on its own. */
  children: ReactNode;
  /**
   * The right-hand panel: whatever is currently in hand. Omit it and the work
   * area takes the full width — which is what the wide tables (Hisobot,
   * Xodimlar maoshi, Sozlamalar) need.
   */
  panel?: ReactNode;
};

/**
 * The standard screen: work area left, panel right.
 *
 * The panel is furniture, not a dialog. Anything it holds — an order being
 * settled, a count being entered, a record being read — keeps its total and
 * its action pinned to the bottom edge, outside the scroll, so no amount of
 * content can push them off a 768px screen.
 */
export function Screen({ title, status, children, panel }: ScreenProps) {
  return (
    <div className="flex min-h-0 flex-1 gap-seam">
      <Seam className="min-w-0 flex-1 content-start" style={{ gridTemplateRows: 'auto 1fr' }}>
        <div className="flex items-center justify-between gap-3 bg-field px-pad py-2.5">
          <h1 className="truncate text-[17px] font-semibold">{title}</h1>
          {status ? <div className="flex shrink-0 items-center gap-seam">{status}</div> : null}
        </div>
        <div className="min-h-0 overflow-auto bg-seam">{children}</div>
      </Seam>

      {panel ? (
        <div className={cn('flex w-[30%] min-w-[320px] max-w-[440px] flex-col gap-seam')}>
          {panel}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Panel scaffolding: a fixed head, a flexible middle that scrolls or swaps,
 * and a foot that never moves. Pages compose these three so the pinning rule
 * is structural rather than remembered.
 */
export function Panel({
  head,
  children,
  foot,
}: {
  head?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-seam">
      {head ? <div className="shrink-0 bg-field-raised px-pad py-2.5">{head}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-seam overflow-hidden">{children}</div>
      {foot ? <div className="shrink-0">{foot}</div> : null}
    </div>
  );
}
