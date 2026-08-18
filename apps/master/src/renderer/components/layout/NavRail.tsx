import { useLocation, useNavigate } from 'react-router-dom';
import {
  Armchair, BadgeDollarSign, ClipboardCheck, Coins, FileBarChart2, HandCoins,
  History, LayoutDashboard, LogOut, Package, PanelLeftClose, PanelLeftOpen, Percent,
  ReceiptText, Settings, UtensilsCrossed, Users, Wallet,
} from 'lucide-react';

import { NavItem, Seam } from '@/components/blocks';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectionStore } from '@/stores/connection.store';
import { useUIStore } from '@/stores/ui.store';

/** The auth store carries `role` as a plain string, so match it as one. */
type Dest = {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
};

const ICON = 18;

/**
 * Every destination, in the order the operator reaches for them: the six
 * touched daily first, then the rest.
 *
 * These used to be two arrays with the tail hidden behind a `Boshqa` toggle,
 * on the reasoning that fifteen items measured taller than the screen. The
 * toggle did not solve that — it deferred it. Expanded, the rail ran to 947px
 * inside a 619px box, and because the shell is `overflow-hidden` and `Seam` is
 * a plain grid, the overflow was clipped with no scrollbar and no wheel target:
 * Sozlamalar, Amallar tarixi, Foydalanuvchilar, Chegirmalar, Xodimlar maoshi
 * and — worst — Chiqish were simply unreachable.
 *
 * The rail scrolls now, so the list does not have to be rationed.
 */
// Labels are kept short enough to render whole at 168px. An ellipsis in a
// navigation label is worse than a shorter word: the operator is scanning for
// a destination, not reading a sentence.
const DESTINATIONS: Dest[] = [
  { to: '/', label: 'Bugun', icon: <LayoutDashboard size={ICON} />, roles: ['OWNER', 'ADMIN', 'WAITER'] },
  { to: '/approval-queue', label: 'Tasdiqlash', icon: <ClipboardCheck size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/orders', label: 'Buyurtmalar', icon: <ReceiptText size={ICON} />, roles: ['OWNER', 'ADMIN', 'WAITER'] },
  { to: '/ombor', label: 'Ombor', icon: <Package size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/tables', label: 'Stollar', icon: <Armchair size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/finance', label: 'Kunlik moliya', icon: <Coins size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/menu', label: 'Menyu', icon: <UtensilsCrossed size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/reports', label: 'Hisobot', icon: <FileBarChart2 size={ICON} />, roles: ['OWNER'] },
  { to: '/debts', label: 'Qarzlar', icon: <HandCoins size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/expenses', label: 'Chiqimlar', icon: <Wallet size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/salaries', label: 'Maoshlar', icon: <BadgeDollarSign size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/discounts', label: 'Chegirmalar', icon: <Percent size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/users', label: 'Xodimlar', icon: <Users size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/audit', label: 'Amallar tarixi', icon: <History size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/settings', label: 'Sozlamalar', icon: <Settings size={ICON} />, roles: ['OWNER', 'ADMIN'] },
];

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
 * holds the two things that must never be unreachable — the connection state
 * and Chiqish — so they are siblings of the scroller, not inside it.
 *
 * Collapsing to icons trades the labels for ~112px of work area. The state is
 * persisted, so the operator sets it once for their panel rather than every
 * session.
 */
export function NavRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const status = useConnectionStore((s) => s.status);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const destinations = DESTINATIONS.filter((dest) =>
    user ? dest.roles.includes(user.role) : false,
  );

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    // 68px collapsed, not 56: the rail scrolls, and a scrollbar takes 15px on
    // macOS and 17 on Windows out of the item's width. At 56 the icon targets
    // measured 41px wide — under the 48px touch floor. 68 clears it on either
    // platform and still hands 100px back to the work area.
    <div className={cn('flex shrink-0 flex-col gap-seam', collapsed ? 'w-[68px]' : 'w-[168px]')}>
      {/* The toggle lives in the head so it holds the same spot in both
          states — collapsed, it is the only thing the head can fit. */}
      <div
        className={cn(
          'flex shrink-0 items-center bg-field-raised',
          collapsed ? 'justify-center px-0 py-1' : 'gap-2 px-3 py-2.5',
        )}
      >
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold leading-tight">Chayxana</div>
            <div className="truncate text-[12px] text-muted-foreground">
              {user?.fullName ?? '—'}
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
            icon={dest.icon}
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
      {collapsed ? (
        /* A dot instead of the word — the strip is 56px wide and "Ulanmoqda…"
           does not fit. Never colour alone: it carries the state as its
           accessible name too. */
        <div className="flex shrink-0 items-center justify-center bg-field-raised py-2">
          <span
            role="status"
            aria-label={status === 'online' ? 'Ulangan' : 'Ulanmoqda'}
            className={cn('h-2 w-2', status === 'online' ? 'bg-settled' : 'bg-live')}
          />
        </div>
      ) : (
        <div className="shrink-0 bg-field-raised px-3 py-2 text-[12px] text-muted-foreground">
          {status === 'online' ? 'Ulangan' : 'Ulanmoqda…'}
        </div>
      )}
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
