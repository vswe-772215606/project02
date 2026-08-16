import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Seam } from '@/components/blocks';

type SettingsGroupProps = {
  title: string;
  icon: LucideIcon;
  /** Optional control on the header strip — e.g. the printer list's refresh button. */
  action?: ReactNode;
  children: ReactNode;
};

/**
 * A named group of settings: a raised caption strip over a Seam of
 * `SettingField`s. The strip carries the group's word the way a Chip carries
 * a row's state — title first, icon as a hint, never the only signal.
 */
export function SettingsGroup({ title, icon: Icon, action, children }: SettingsGroupProps) {
  return (
    <Seam className="content-start">
      <div className="flex items-center justify-between gap-3 bg-field-raised px-pad py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="truncate text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            {title}
          </span>
        </div>
        {action}
      </div>
      {children}
    </Seam>
  );
}
