import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { usersApi } from '@/api/users';
import type { User } from '@/api/auth';
import { useAuthStore } from '@/stores/auth.store';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { UserList } from '@/components/users/UserList';
import { UserPanel } from '@/components/users/UserPanel';
import { UserFilters, type RoleFilter } from '@/components/users/UserFilters';
import { TodayStatsPanel } from '@/components/users/TodayStatsPanel';
import { UserFormDialog, type UserFormPayload } from '@/components/users/UserFormDialog';

function extractApiError(err: unknown): string {
  if (err instanceof Error) return err.message || 'Xatolik yuz berdi';
  return 'Xatolik yuz berdi';
}

/**
 * Foydalanuvchilar — the staff roster.
 *
 * The list is a selection, not a menu: every action on a person — edit,
 * deactivate, reactivate — lives in the panel once they're chosen, instead
 * of a row of small icon buttons that only differentiated themselves on
 * hover, which does not exist on a touchscreen. When nobody's chosen, the
 * panel isn't empty — it shows today's waiter performance, which used to
 * sit above the roster as its own table.
 */
export function UsersPage() {
  usePageTitle('Foydalanuvchilar');
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [confirmTarget, setConfirmTarget] = useState<{ user: User; next: boolean } | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => usersApi.list(true),
  });

  const { data: todayStats } = useQuery({
    queryKey: ['users', 'today-stats'],
    queryFn: () => usersApi.todayStats(),
    refetchInterval: 60_000,
  });

  const activeCount = useMemo(() => users.filter((u) => u.isActive).length, [users]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (!showInactive && !u.isActive) return false;
      if (needle) {
        const haystack = `${u.fullName} ${u.username ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [users, roleFilter, showInactive, search]);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof usersApi.create>[0]) => usersApi.create(data),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setFormState({ open: false, user: null });
      setSelectedId(user.id);
      toast.success("Foydalanuvchi qo'shildi");
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setFormState({ open: false, user: null });
      setConfirmTarget(null);
      toast.success('Saqlandi');
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setConfirmTarget(null);
      toast.success('Foydalanuvchi faolsizlantirildi');
    },
    onError: (err: unknown) => toast.error(extractApiError(err)),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Screen
        title="Foydalanuvchilar"
        status={
          <UserFilters
            search={search}
            onSearchChange={setSearch}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            showInactive={showInactive}
            onShowInactiveChange={setShowInactive}
            activeCount={activeCount}
            totalCount={users.length}
            onCreate={() => setFormState({ open: true, user: null })}
          />
        }
        panel={
          selected ? (
            <UserPanel
              key={selected.id}
              user={selected}
              canToggle={selected.id !== currentUser?.id && (selected.role !== 'OWNER' || currentUser?.role === 'OWNER')}
              onEdit={() => setFormState({ open: true, user: selected })}
              onDeactivate={() => setConfirmTarget({ user: selected, next: false })}
              onReactivate={() => setConfirmTarget({ user: selected, next: true })}
            />
          ) : todayStats && todayStats.items.length > 0 ? (
            <TodayStatsPanel date={todayStats.date} items={todayStats.items} />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
              Ko'rish uchun xodimni tanlang
            </div>
          )
        }
      >
        <UserList users={filtered} selectedId={selectedId} onSelect={(user) => setSelectedId(user.id)} />
      </Screen>

      <UserFormDialog
        open={formState.open}
        user={formState.user}
        currentUserRole={currentUser?.role as User['role'] | undefined}
        isSaving={isSaving}
        onOpenChange={(open) => setFormState((s) => ({ ...s, open }))}
        onSave={(payload: UserFormPayload) =>
          formState.user
            ? updateMutation.mutate({ id: formState.user.id, data: payload })
            : createMutation.mutate(payload as Parameters<typeof usersApi.create>[0])
        }
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        title={confirmTarget?.next ? 'Qayta faollashtirish' : 'Foydalanuvchini faolsizlantirish'}
        description={
          confirmTarget
            ? confirmTarget.next
              ? `"${confirmTarget.user.fullName}" qayta faollashtiriladi.`
              : `"${confirmTarget.user.fullName}" tizimga kira olmaydi.`
            : undefined
        }
        confirmLabel={confirmTarget?.next ? 'Faollashtirish' : 'Faolsizlantirish'}
        destructive={!confirmTarget?.next}
        loading={deactivateMutation.isPending || updateMutation.isPending}
        onConfirm={() => {
          if (!confirmTarget) return;
          if (confirmTarget.next) {
            updateMutation.mutate({ id: confirmTarget.user.id, data: { isActive: true } });
          } else {
            deactivateMutation.mutate(confirmTarget.user.id);
          }
        }}
      />
    </>
  );
}
