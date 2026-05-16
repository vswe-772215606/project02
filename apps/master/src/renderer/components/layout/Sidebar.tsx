import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ReceiptText,
  BookOpen,
  UtensilsCrossed,
  Armchair,
  Users,
  Percent,
  Settings,
  Package,
  HandCoins,
  ShoppingCart,
  PanelLeft,
  Wallet,
  Coins,
  History,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Role = 'OWNER' | 'ADMIN' | 'WAITER' | 'KITCHEN';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
};

type NavSection = {
  heading: string;
  items: NavItem[];
};

/**
 * Sidebar is the source of truth for what's visible in the admin nav.
 *
 * Pages hidden from the sidebar but still mounted as routes (URL-reachable):
 *   /reports   ("Hisobotlar")     — superseded by upcoming owner P&L (Phase 4)
 *
 * To re-show them, add them back to the NAV_SECTIONS below.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Boshqaruv',
    items: [
      { to: '/', label: 'Boshqaruv paneli', icon: LayoutDashboard, roles: ['OWNER', 'ADMIN', 'WAITER', 'KITCHEN'] },
      { to: '/orders', label: 'Buyurtmalar', icon: ReceiptText, roles: ['OWNER', 'ADMIN', 'WAITER'] },
      { to: '/finance', label: 'Kunlik moliya', icon: Coins, roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    heading: 'Mahsulot va retsept',
    items: [
      { to: '/ingredients', label: 'Mahsulotlar', icon: Package, roles: ['OWNER', 'ADMIN'] },
      { to: '/purchases', label: 'Xaridlar', icon: ShoppingCart, roles: ['OWNER', 'ADMIN'] },
      { to: '/recipes', label: 'Retseptlar', icon: BookOpen, roles: ['OWNER', 'ADMIN'] },
      { to: '/menu', label: 'Menyu', icon: UtensilsCrossed, roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    heading: 'Operatsiya',
    items: [
      { to: '/tables', label: 'Stollar', icon: Armchair, roles: ['OWNER', 'ADMIN'] },
      { to: '/users', label: 'Foydalanuvchilar', icon: Users, roles: ['OWNER', 'ADMIN'] },
      { to: '/expenses', label: 'Chiqimlar', icon: Wallet, roles: ['OWNER', 'ADMIN'] },
      { to: '/debts', label: 'Qarzlar', icon: HandCoins, roles: ['OWNER', 'ADMIN'] },
      { to: '/discounts', label: 'Chegirmalar', icon: Percent, roles: ['OWNER', 'ADMIN'] },
    ],
  },
  {
    heading: 'Tizim',
    items: [
      { to: '/audit', label: 'Amallar tarixi', icon: History, roles: ['OWNER', 'ADMIN'] },
      { to: '/settings', label: 'Sozlamalar', icon: Settings, roles: ['OWNER', 'ADMIN'] },
    ],
  },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const role = (user?.role ?? '') as Role;

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex flex-col border-r bg-card transition-[width] duration-200 ease-in-out shrink-0',
          collapsed ? 'w-[60px]' : 'w-[200px]',
        )}
      >
        <div className="h-14 flex items-center justify-between px-3 border-b shrink-0">
          {!collapsed && (
            <span className="text-base font-semibold text-foreground truncate">Chayxana</span>
          )}
          <button
            onClick={toggleSidebar}
            className={cn(
              'h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground',
              collapsed && 'mx-auto',
            )}
            title={collapsed ? 'Yoyish' : "Yig'ish"}
            aria-label={collapsed ? 'Yoyish' : "Yig'ish"}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) => item.roles.includes(role));
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.heading} className="px-2 pb-3">
                {!collapsed && (
                  <div className="px-2 pb-1 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    {section.heading}
                  </div>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const link = (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center rounded-md text-sm transition-colors',
                            collapsed ? 'justify-center h-9 w-9 mx-auto' : 'px-2 py-1.5 gap-2',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-foreground hover:bg-muted',
                          )
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    );
                    if (collapsed) {
                      return (
                        <Tooltip key={item.to}>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      );
                    }
                    return link;
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
