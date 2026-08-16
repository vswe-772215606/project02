import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Armchair, BadgeDollarSign, ClipboardCheck, Coins, FileBarChart2, HandCoins,
  History, LayoutDashboard, LogOut, MoreHorizontal, Package, Percent,
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
 * The six destinations touched every day. Fifteen nav items measured ~797px
 * against a 768px screen, so the rest live behind `Boshqa` rather than
 * forcing the operator to scroll the navigation before tapping it.
 */
const PRIMARY: Dest[] = [
  { to: '/', label: 'Bugun', icon: <LayoutDashboard size={ICON} />, roles: ['OWNER', 'ADMIN', 'WAITER'] },
  { to: '/approval-queue', label: 'Tasdiqlash', icon: <ClipboardCheck size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/orders', label: 'Buyurtmalar', icon: <ReceiptText size={ICON} />, roles: ['OWNER', 'ADMIN', 'WAITER'] },
  { to: '/ombor', label: 'Ombor', icon: <Package size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/tables', label: 'Stollar', icon: <Armchair size={ICON} />, roles: ['OWNER', 'ADMIN'] },
  { to: '/finance', label: 'Kunlik moliya', icon: <Coins size={ICON} />, roles: ['OWNER', 'ADMIN'] },
];

const SECONDARY: Dest[] = [
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
 */
export function NavRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const status = useConnectionStore((s) => s.status);
  const [showMore, setShowMore] = useState(false);

  const allowed = (dest: Dest) => (user ? dest.roles.includes(user.role) : false);
  const primary = PRIMARY.filter(allowed);
  const secondary = SECONDARY.filter(allowed);

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const go = (to: string) => {
    navigate(to);
    setShowMore(false);
  };

  return (
    <Seam className="w-[168px] shrink-0 content-start">
      <div className="bg-field-raised px-3 py-2.5">
        <div className="text-[15px] font-semibold leading-tight">Chayxana</div>
        <div className="text-[12px] text-muted-foreground">
          {user?.fullName ?? '—'}
        </div>
      </div>

      {primary.map((dest) => (
        <NavItem
          key={dest.to}
          label={dest.label}
          icon={dest.icon}
          active={isActive(dest.to)}
          onClick={() => go(dest.to)}
        />
      ))}

      {secondary.length > 0 && (
        <NavItem
          label="Boshqa"
          icon={<MoreHorizontal size={ICON} />}
          active={showMore || secondary.some((dest) => isActive(dest.to))}
          onClick={() => setShowMore((open) => !open)}
        />
      )}

      {showMore &&
        secondary.map((dest) => (
          <NavItem
            key={dest.to}
            label={dest.label}
            icon={dest.icon}
            active={isActive(dest.to)}
            onClick={() => go(dest.to)}
          />
        ))}

      <div className="mt-auto bg-field-raised px-3 py-2 text-[12px] text-muted-foreground">
        {status === 'online' ? 'Ulangan' : 'Ulanmoqda…'}
      </div>
      <NavItem label="Chiqish" icon={<LogOut size={ICON} />} onClick={() => clearAuth()} />
    </Seam>
  );
}
