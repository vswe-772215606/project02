import { NavLink, useLocation } from 'react-router-dom';
import {
  ReceiptText,
  PlusSquare,
  Armchair,
  UtensilsCrossed,
  Settings,
  PanelLeft,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

type NavSection = {
  heading: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Buyurtmalar',
    items: [
      { to: '/', label: 'Mening buyurtmalarim', icon: ReceiptText, end: true },
      { to: '/orders/new', label: 'Yangi buyurtma', icon: PlusSquare },
    ],
  },
  {
    heading: 'Operatsiya',
    items: [
      { to: '/tables', label: 'Stollar', icon: Armchair },
      { to: '/menu', label: 'Menyu', icon: UtensilsCrossed },
    ],
  },
  {
    heading: 'Tizim',
    items: [
      { to: '/settings', label: 'Sozlamalar', icon: Settings },
    ],
  },
];

function useIsActiveRoute() {
  const location = useLocation();
  return (to: string, end: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const isActiveRoute = useIsActiveRoute();

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
            'h-16 flex items-center border-b shrink-0',
            collapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          {!collapsed && (
            <span className="text-lg font-bold text-foreground truncate">Chayxana</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                className="h-11 w-11 inline-flex items-center justify-center rounded-md hover:bg-muted text-foreground/70 hover:text-foreground transition-colors active:scale-95"
                aria-label={collapsed ? 'Yoyish' : "Yig'ish"}
              >
                <PanelLeft className="h-5 w-5 text-current" strokeWidth={2} />
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Yoyish</TooltipContent>}
          </Tooltip>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {NAV_SECTIONS.map((section, sectionIdx) => (
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
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = isActiveRoute(item.to, item.end ?? false);
                  const link = (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end ?? false}
                      className={cn(
                        'group relative flex items-center rounded-md font-medium transition-all active:scale-[0.98]',
                        collapsed
                          ? 'justify-center h-12 w-12 mx-auto'
                          : 'px-3 py-2.5 gap-3 text-base min-h-[48px]',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      {collapsed && isActive && (
                        <span
                          aria-hidden
                          className="absolute -left-2 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r-full bg-primary"
                        />
                      )}
                      <Icon
                        className={cn(
                          'shrink-0 text-current',
                          collapsed ? 'h-6 w-6' : 'h-5 w-5',
                        )}
                        strokeWidth={isActive ? 2.25 : 2}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
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
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
