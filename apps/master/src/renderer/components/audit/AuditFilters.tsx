import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AUDIT_GROUPS, AUDIT_LABELS } from '@/lib/audit-labels';
import type { User } from '@/api/auth';

const SELECT_TRIGGER = 'h-control w-[168px] border-0 bg-field px-3 text-[14px] shadow-none';

/**
 * Every filter this page has, all at the 48px touch floor — the search box,
 * the two dropdowns and the date range used to sit at h-9, a third shorter
 * than everything below them.
 */
export function AuditFilters({
  search,
  onSearchChange,
  action,
  onActionChange,
  userId,
  onUserChange,
  from,
  onFromChange,
  to,
  onToChange,
  users,
  hasActiveFilters,
  onReset,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  action: string;
  onActionChange: (value: string) => void;
  userId: string;
  onUserChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  users: User[];
  hasActiveFilters: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-seam">
      <div className="flex h-control w-[210px] items-center gap-2 bg-field px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          className="w-full min-w-0 bg-transparent text-[15px] text-foreground outline-none focus-block placeholder:text-muted-foreground"
          placeholder="Qidirish"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Select value={action || '__all__'} onValueChange={(v) => onActionChange(v === '__all__' ? '' : v)}>
        <SelectTrigger className={SELECT_TRIGGER}>
          <SelectValue placeholder="Amal turi" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="__all__">Barcha amallar</SelectItem>
          {AUDIT_GROUPS.flatMap((group) => [
            <div
              key={`h-${group.label}`}
              className="px-2 pb-0.5 pt-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {group.label}
            </div>,
            ...group.values.map((value) => (
              <SelectItem key={value} value={value}>
                {AUDIT_LABELS[value] ?? value}
              </SelectItem>
            )),
          ])}
        </SelectContent>
      </Select>

      <Select value={userId || '__all__'} onValueChange={(v) => onUserChange(v === '__all__' ? '' : v)}>
        <SelectTrigger className={SELECT_TRIGGER}>
          <SelectValue placeholder="Foydalanuvchi" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="__all__">Barcha xodimlar</SelectItem>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className="w-[148px] text-[14px]" />
      <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className="w-[148px] text-[14px]" />

      <Button size="sm" variant="secondary" onClick={onReset} disabled={!hasActiveFilters}>
        <X className="h-4 w-4" />
        Tozalash
      </Button>
    </div>
  );
}
