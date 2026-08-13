import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { User } from '@/api/auth';

export type RoleFilter = 'ALL' | User['role'];

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'ALL', label: 'Hammasi' },
  { value: 'OWNER', label: 'Ega' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'WAITER', label: 'Ofitsiant' },
];

/**
 * Everything that narrows the roster, plus the one action that grows it.
 * Two independent toggle groups — role, then active/all — the way OmborPage
 * pairs Sanoqsiz/Hammasi: buttons, not a Chip, because these are controls.
 */
export function UserFilters({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  showInactive,
  onShowInactiveChange,
  activeCount,
  totalCount,
  onCreate,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: RoleFilter;
  onRoleFilterChange: (value: RoleFilter) => void;
  showInactive: boolean;
  onShowInactiveChange: (value: boolean) => void;
  activeCount: number;
  totalCount: number;
  onCreate: () => void;
}) {
  return (
    <>
      <div className="flex h-control w-[200px] items-center gap-2 bg-field px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          className="w-full min-w-0 bg-transparent text-[15px] text-foreground outline-none focus-block placeholder:text-muted-foreground"
          placeholder="Qidirish"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {ROLE_FILTERS.map((chip) => (
        <Button
          key={chip.value}
          size="sm"
          variant={roleFilter === chip.value ? 'default' : 'secondary'}
          onClick={() => onRoleFilterChange(chip.value)}
        >
          {chip.label}
        </Button>
      ))}

      {/* Says "Nofaollar bilan" rather than "Hammasi": the role group beside it
          already has a Hammasi, and two adjacent buttons sharing a label while
          doing different things is a mis-tap waiting to happen. */}
      <Button size="sm" variant={showInactive ? 'secondary' : 'default'} onClick={() => onShowInactiveChange(false)}>
        Faol {activeCount}
      </Button>
      <Button size="sm" variant={showInactive ? 'default' : 'secondary'} onClick={() => onShowInactiveChange(true)}>
        Nofaollar bilan {totalCount}
      </Button>

      <Button size="sm" onClick={onCreate}>
        Yangi foydalanuvchi
      </Button>
    </>
  );
}
