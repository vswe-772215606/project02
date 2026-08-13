import * as React from 'react';

import { cn } from '@/lib/utils';

type NavItemProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
};

/**
 * One navigation target, 48px tall.
 *
 * The active item inverts to the selected fill. There is no left bar, no
 * tint and no coloured edge — in Blocks the fill is what says "you are here".
 */
export const NavItem = React.forwardRef<HTMLButtonElement, NavItemProps>(
  ({ className, label, icon, active = false, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-row w-full items-center gap-2.5 px-3 text-left text-[14.5px]',
        'transition-colors duration-75',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        active
          ? 'bg-selected font-semibold text-selected-foreground'
          : 'bg-field text-muted-foreground active:bg-field-press',
        className,
      )}
      {...props}
    >
      {icon ? <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">{icon}</span> : null}
      <span className="truncate">{label}</span>
    </button>
  ),
);
NavItem.displayName = 'NavItem';
