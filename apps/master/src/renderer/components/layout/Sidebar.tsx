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
  ClipboardCheck,
  FileBarChart2,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Role = 'OWNER' | 'ADMIN' | 'WAITER';

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
 * Sidebar — admin nav source of truth.
 *
 * Sizing (matches modern desktop shell standards):
 *   - Expanded: 240px
 *   - Collapsed: 72px (with 40×40 tap targets and 20×20 icons)
 *   - Active item: amber pill matching --primary token
 */
const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Boshqaruv',
    items: [
      { to: '/', label: 'Boshqaruv paneli', icon: LayoutDashboard, roles: ['OWNER', 'ADMIN', 'WAITER'] },
      { to: '/approval-queue', label: 'Tasdiqlash', icon: ClipboardCheck, roles: ['OWNER', 'ADMIN'] },
      { to: '/orders', label: 'Buyurtmalar', icon: ReceiptText, roles: ['OWNER', 'ADMIN', 'WAITER'] },
      { to: '/finance', label: 'Kunlik moliya', icon: Coins, roles: ['OWNER', 'ADMIN'] },
      { to: '/reports', label: 'Moliyaviy hisobot', icon: FileBarChart2, roles: ['OWNER'] },
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
          collapsed ? 'w-[72px]' : 'w-[240px]',
        )}
      >
        <div
          className={cn(
            'h-14 flex items-center border-b shrink-0',
            collapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          {!collapsed && (
            <span className="text-base font-semibold text-foreground truncate">Chayxana</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label={collapsed ? 'Yoyish' : "Yig'ish"}
              >
                <PanelLeft className="h-[18px] w-[18px]" strokeWidth={2} />
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Yoyish</TooltipContent>}
          </Tooltip>
        </div>

        <nav
          className={cn(
            'flex-1 overflow-y-auto overflow-x-hidden',
            collapsed ? 'py-3' : 'py-3',
          )}
        >
          {NAV_SECTIONS.map((section, sectionIdx) => {
            const visibleItems = section.items.filter((item) => item.roles.includes(role));
            if (visibleItems.length === 0) return null;
            return (
              <div
                key={section.heading}
                className={cn(
                  collapsed ? 'px-2 pb-2' : 'px-3 pb-3',
                  sectionIdx > 0 && collapsed && 'pt-2 mt-1 border-t border-border/60',
                )}
              >
                {!collapsed && (
                  <div className="px-2 pb-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/80">
                    {section.heading}
                  </div>
                )}
                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const link = (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center rounded-md font-medium transition-all',
                            collapsed
                              ? 'justify-center h-11 w-11 mx-auto'
                              : 'px-2.5 py-2 gap-3 text-sm',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'text-foreground/80 hover:bg-muted hover:text-foreground',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {/* Active indicator strip on the left when collapsed */}
                            {collapsed && isActive && (
                              <span
                                aria-hidden
                                className="absolute -left-2 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary"
                              />
                            )}
                            <Icon
                              className={cn(
                                'shrink-0',
                                collapsed ? 'h-[22px] w-[22px]' : 'h-[18px] w-[18px]',
                              )}
                              strokeWidth={isActive ? 2.25 : 2}
                            />
                            {!collapsed && <span className="truncate">{item.label}</span>}
                          </>
                        )}
                      </NavLink>
                    );
                    if (collapsed) {
                      return (
                        <Tooltip key={item.to}>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right" className="font-medium">
                            {item.label}
                          </TooltipContent>
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
