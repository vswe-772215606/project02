import * as React from 'react';

import { cn } from '@/lib/utils';

type NavItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  /** Icon only. The label stays as the accessible name. */
  collapsed?: boolean;
};

/**
 * One navigation target, 48px tall.
 *
 * The active item inverts to the selected fill. There is no left bar, no
 * tint and no coloured edge — in Blocks the fill is what says "you are here".
 *
 * Collapsed, the label is dropped from the layout but kept as `aria-label`,
 * so the target still has a name for assistive tech. It is deliberately NOT
 * moved into a `title` tooltip: hover does not exist on a touchscreen, and the
 * system forbids putting information anywhere that only a pointer can reach.
 * The rail is togglable precisely so the names are one tap away.
 */
export const NavItem = React.forwardRef<HTMLButtonElement, NavItemProps>(
  ({ className, label, icon, active = false, collapsed = false, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'flex h-row w-full items-center text-left text-[14.5px]',
        collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
        'press-block focus-block',
        active
          ? 'bg-selected font-semibold text-selected-foreground'
          : 'bg-field text-muted-foreground',
        className,
      )}
      {...props}
    >
      {icon ? <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">{icon}</span> : null}
      {/* `min-w-0` for the same reason as RowSub: a flex child defaults to
          min-width auto, so `truncate` never fires and a long label — the
          15-character "Moliyaviy hisobot" — pushes the rail into horizontal
          scroll instead of ellipsising. */}
      {collapsed ? null : <span className="min-w-0 truncate">{label}</span>}
    </button>
  ),
);
NavItem.displayName = 'NavItem';
