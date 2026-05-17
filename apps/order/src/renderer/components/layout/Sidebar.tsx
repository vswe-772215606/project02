import { NavLink } from 'react-router-dom';
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

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex flex-col border-r bg-card transition-[width] duration-200 ease-in-out shrink-0',
          collapsed ? 'w-[60px]' : 'w-[220px]',
        )}
      >
        <div className="h-14 flex items-center justify-between px-3 border-b shrink-0">
          {!collapsed && (
            <span className="text-base font-semibold text-foreground truncate">Chayxana</span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
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
          {NAV_SECTIONS.map((section) => (
            <div key={section.heading} className="px-2 pb-3">
              {!collapsed && (
                <div className="px-2 pb-1 text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  {section.heading}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const link = (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end ?? false}
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
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
