import { useLocation, useNavigate } from 'react-router-dom';
import {
  Armchair, BadgeDollarSign, ClipboardCheck, Coins, FileBarChart2, HandCoins,
  History, LayoutDashboard, LogOut, Package, PanelLeftClose, PanelLeftOpen, Percent,
  ReceiptText, Settings, UtensilsCrossed, Users, Wallet,
} from 'lucide-react';

import { NavItem, Seam } from '@/components/blocks';
import { cn } from '@/lib/utils';
import { HUB_ROUTE, hubFor, railFor, type Role } from '@/lib/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectionStore } from '@/stores/connection.store';
import { useUIStore } from '@/stores/ui.store';

const ICON = 18;

/**
 * Which glyph belongs to which destination.
 *
 * Kept here rather than in `lib/navigation` so that module stays free of JSX
 * and can be unit tested — the rail's slot budget is an invariant worth a
 * gate, and a module full of React elements is a poor place to hold it.
 */
export const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard size={ICON} />,
  approve: <ClipboardCheck size={ICON} />,
  orders: <ReceiptText size={ICON} />,
  stock: <Package size={ICON} />,
  finance: <Coins size={ICON} />,
  menu: <UtensilsCrossed size={ICON} />,
  reports: <FileBarChart2 size={ICON} />,
  debts: <HandCoins size={ICON} />,
  expenses: <Wallet size={ICON} />,
  settings: <Settings size={ICON} />,
  tables: <Armchair size={ICON} />,
  users: <Users size={ICON} />,
  discounts: <Percent size={ICON} />,
  salaries: <BadgeDollarSign size={ICON} />,
  audit: <History size={ICON} />,
};

/**
 * The left rail.
 *
 * Collapses to icons on request, and remembers the choice. It used to be fixed
 * width on the reasoning that a collapsed rail hides every destination's name
 * in a hover tooltip — true, and still a rule: there is no tooltip here. The
 * label survives as the button's accessible name, and the toggle sits in the
 * head so the names are always one tap away rather than one hover away.
 *
 * Head, scrolling body and foot are three parts of a flex column. The foot
 * holds Chiqish, which must never be unreachable, so it is a sibling of the
 * scroller rather than inside it.
 *
 * ## Why the destinations are split
 *
 * The rail once carried all fifteen. Measured at the real windowed viewport of
 * 1236x623 that asked for 748px of a 461px box: five destinations sat below
 * the fold and a sixth was sliced to an 11px sliver. Making it scroll — which
 * it does — made them reachable, not visible; the operator still saw nine
 * doors of fifteen at rest, with a thin scrollbar as the only clue.
 *
 * Collapsing does not help. It trades width for work area, 168px down to 68px,
 * but it drops labels rather than rows: the content stays 748px either way.
 *
 * So the six setup destinations moved behind one `Sozlamalar` entry. See
 * `lib/navigation.ts` for the slot budget and the split; a test holds it.
 */
export function NavRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const status = useConnectionStore((s) => s.status);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const destinations = railFor(user?.role as Role | undefined);

  // The hub entry owns its children: standing on Xodimlar or Chegirmalar, the
  // rail still has to say where the operator is, and those screens have no
  // entry of their own to light up.
  const hubRoutes = hubFor(user?.role as Role | undefined).map((dest) => dest.to);
  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    if (to === HUB_ROUTE) {
      return (
        location.pathname.startsWith(HUB_ROUTE) ||
        hubRoutes.some((route) => location.pathname.startsWith(route))
      );
    }
    return location.pathname.startsWith(to);
  };

  const online = status === 'online';
  const connectionWord = online ? 'Ulangan' : 'Ulanmoqda…';

  return (
    // 68px collapsed, not 56: the rail scrolls, and a scrollbar takes 15px on
    // macOS and 17 on Windows out of the item's width. At 56 the icon targets
    // measured 41px wide — under the 48px touch floor. 68 clears it on either
    // platform and still hands 100px back to the work area.
    <div className={cn('flex shrink-0 flex-col gap-seam', collapsed ? 'w-[68px]' : 'w-[168px]')}>
      {/* The toggle lives in the head so it holds the same spot in both
          states — collapsed, it is nearly the only thing the head can fit.
          The connection state lives here too. It used to be a 36px strip of
          its own above Chiqish; folding it into a line the head already draws
          returns 38px to the scroller, which is the difference between nine
          destinations and ten. `py-2` rather than `py-2.5` for the same
          reason — the head is sized by the 48px toggle, so the four pixels
          come off the padding without touching the touch target. */}
      <div
        className={cn(
          'flex shrink-0 items-center bg-field-raised',
          collapsed ? 'justify-center gap-1.5 px-0 py-1' : 'gap-2 px-3 py-2',
        )}
      >
        {collapsed ? (
          /* A dot instead of the word — 68px does not fit "Ulanmoqda…".
             Never colour alone: it carries the state as its accessible name. */
          <span
            role="status"
            aria-label={connectionWord}
            className={cn('h-2 w-2 shrink-0', online ? 'bg-settled' : 'bg-live')}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold leading-tight">Chayxana</div>
            {/* Name normally; the connection word in its place when the
                socket is not up. Both together truncated to "Owner · Ulan…"
                at 168px, and a clipped "Ulan…" cannot be told apart from
                "Ulanmoqda…" — the one reading that has to be unambiguous.
                Nothing is lost by yielding the line: ConnectionBanner already
                states `reconnecting` and `auth-failed` across the full width,
                so this only has to cover the first connect. */}
            <div
              className={cn(
                'truncate text-[12px]',
                online ? 'text-muted-foreground' : 'font-semibold text-foreground',
              )}
            >
              {online ? user?.fullName ?? '—' : connectionWord}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Menyuni ochish' : 'Menyuni yig\'ish'}
          aria-expanded={!collapsed}
          className="press-block focus-block flex h-control w-control shrink-0 items-center justify-center bg-field text-muted-foreground"
        >
          {collapsed ? <PanelLeftOpen size={ICON} /> : <PanelLeftClose size={ICON} />}
        </button>
      </div>

      {/* `min-h-0` is what lets this shrink below its content height. Without
          it `overflow-y-auto` never engages — the same mistake that clipped
          the rail in the first place. */}
      {/* `grid-cols-[minmax(0,1fr)]` is the third place this bites: a grid's
          implicit column is `auto`, so the track grows to the widest item and
          "Moliyaviy hisobot" pushed the rail 14px past its own width. The
          explicit `minmax(0, …)` floor is what lets NavItem's label truncate. */}
      <Seam className="min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start overflow-y-auto overscroll-contain">
        {destinations.map((dest) => (
          <NavItem
            key={dest.to}
            label={dest.label}
            icon={NAV_ICONS[dest.icon]}
            active={isActive(dest.to)}
            collapsed={collapsed}
            onClick={() => navigate(dest.to)}
          />
        ))}
      </Seam>

      {/* Foot. `mt-auto` used to live here and could never work: a margin has
          no free space to absorb in a grid row sized to its content, which is
          why the two elements it was protecting were the two that got pushed
          off the bottom. */}
      <div className="shrink-0">
        <NavItem
          label="Chiqish"
          icon={<LogOut size={ICON} />}
          collapsed={collapsed}
          onClick={() => clearAuth()}
        />
      </div>
    </div>
  );
}
