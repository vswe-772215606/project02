import type { ReactNode } from 'react';

import { NavRail } from './NavRail';
import { ConnectionBanner } from '@/components/feedback/ConnectionBanner';

/**
 * Top-level shell: nav rail left, everything else right.
 *
 * The rail and the screen's panel never move; only the work area changes.
 * There is no app-wide header — a screen's title and its filters belong to
 * that screen's own top bar (see `Screen`), which keeps the vertical budget
 * for content on a 768px display.
 *
 * Pages that have not moved to `Screen` yet still render here and simply take
 * the full width.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-seam p-seam text-foreground">
      <NavRail />
      {/* min-h-0 so a tall screen scrolls inside the shell rather than
          stretching it past the display. */}
      <div className="ml-seam flex min-h-0 min-w-0 flex-1 flex-col gap-seam">
        <ConnectionBanner />
        {children}
      </div>
    </div>
  );
}
