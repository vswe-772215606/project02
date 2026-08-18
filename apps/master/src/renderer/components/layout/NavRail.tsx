import { useLocation, useNavigate } from 'react-router-dom';
import {
  Armchair, BadgeDollarSign, ClipboardCheck, Coins, FileBarChart2, HandCoins,
  History, LayoutDashboard, LogOut, Package, Percent,
  ReceiptText, Settings, UtensilsCrossed, Users, Wallet,
} from 'lucide-react';

import { NavItem, Seam } from '@/components/blocks';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectionStore } from '@/stores/connection.store';

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
const DESTINATIONS: Dest[] = [
  { to: '/', label: 'Bugun', icon: <LayoutDashboard size={ICON} />, roles: ['OWNER', 'ADMIN', 'WAITER'] },
  { to: '/approval-queue', label: 'Tasdiqlash', icon: <ClipboardCheck size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/orders', label: 'Buyurtmalar', icon: <ReceiptText size={ICON} />, roles: ['OWNER', 'ADMIN', 'WAITER'] },
  { to: '/ombor', label: 'Ombor', icon: <Package size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/tables', label: 'Stollar', icon: <Armchair size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/finance', label: 'Kunlik moliya', icon: <Coins size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/menu', label: 'Menyu', icon: <UtensilsCrossed size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/reports', label: 'Moliyaviy hisobot', icon: <FileBarChart2 size={ICON} />, roles: ['OWNER'] },
  { to: '/debts', label: 'Qarzlar', icon: <HandCoins size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/expenses', label: 'Chiqimlar', icon: <Wallet size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/salaries', label: 'Xodimlar maoshi', icon: <BadgeDollarSign size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/discounts', label: 'Chegirmalar', icon: <Percent size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/users', label: 'Foydalanuvchilar', icon: <Users size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/audit', label: 'Amallar tarixi', icon: <History size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/settings', label: 'Sozlamalar', icon: <Settings size={ICON} />, roles: ['OWNER', 'ADMIN'] },
];

/**
 * The left rail. Fixed width, never collapses to icons — a collapsed rail put
 * every destination's name inside a hover tooltip, which does not exist on a
 * touchscreen.
 *
 * Head, scrolling body and foot are three parts of a flex column. The foot
 * holds the two things that must never be unreachable — the connection state
 * and Chiqish — so they are siblings of the scroller, not inside it.
 */
export function NavRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const status = useConnectionStore((s) => s.status);

  const destinations = DESTINATIONS.filter((dest) =>
    user ? dest.roles.includes(user.role) : false,
  );

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <div className="flex w-[168px] shrink-0 flex-col gap-seam">
      <div className="shrink-0 bg-field-raised px-3 py-2.5">
        <div className="text-[15px] font-semibold leading-tight">Chayxana</div>
        <div className="text-[12px] text-muted-foreground">
          {user?.fullName ?? '—'}
        </div>
      </div>

      {/* `min-h-0` is what lets this shrink below its content height. Without
          it `overflow-y-auto` never engages — the same mistake that clipped
          the rail in the first place. */}
      <Seam className="min-h-0 flex-1 content-start overflow-y-auto overscroll-contain">
        {destinations.map((dest) => (
          <NavItem
            key={dest.to}
            label={dest.label}
            icon={dest.icon}
            active={isActive(dest.to)}
            onClick={() => navigate(dest.to)}
          />
        ))}
      </Seam>

      {/* Foot. `mt-auto` used to live here and could never work: a margin has
          no free space to absorb in a grid row sized to its content, which is
          why the two elements it was protecting were the two that got pushed
          off the bottom. */}
      <div className="shrink-0 bg-field-raised px-3 py-2 text-[12px] text-muted-foreground">
        {status === 'online' ? 'Ulangan' : 'Ulanmoqda…'}
      </div>
      <div className="shrink-0">
        <NavItem label="Chiqish" icon={<LogOut size={ICON} />} onClick={() => clearAuth()} />
      </div>
    </div>
  );
}
