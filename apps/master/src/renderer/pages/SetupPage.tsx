import { useNavigate } from 'react-router-dom';

import { Screen } from '@/components/layout/Screen';
import { Seam } from '@/components/blocks';
import { NAV_ICONS } from '@/components/layout/NavRail';
import { usePageTitle } from '@/hooks/usePageTitle';
import { hubFor, type Role } from '@/lib/navigation';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Sozlamalar — the setup hub.
 *
 * The six screens a chayxana touches monthly at most, taken out of the rail so
 * the nine daily ones fit the panel. See `lib/navigation.ts` for the slot
 * budget that forced the split.
 *
 * Each door is a single large target with a word on it. No description beneath
 * it: the handover explains the product once, and a permanent paragraph on a
 * 623px-tall panel costs a row of real work forever after.
 */
export function SetupPage() {
  usePageTitle('Sozlamalar');
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const doors = hubFor(user?.role as Role | undefined);

  return (
    <Screen title="Sozlamalar">
      {/* Three fixed columns rather than auto-fill: the panel is a known
          size, and six doors over 3x2 read as a finished set where auto-fill
          left a 4+2 that looks like something failed to load. */}
      <Seam className="p-seam" columns="repeat(3, minmax(0, 1fr))">
        {doors.map((door) => (
          <button
            key={door.to}
            type="button"
            onClick={() => navigate(door.to)}
            className="press-block focus-block flex h-[96px] flex-col justify-between bg-field px-pad py-pad text-left"
          >
            <span className="text-muted-foreground">{NAV_ICONS[door.icon]}</span>
            <span className="text-[17px] font-semibold">{door.label}</span>
          </button>
        ))}
      </Seam>
    </Screen>
  );
}
