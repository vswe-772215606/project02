import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { auditApi, type AuditLogItem } from '@/api/audit';
import { usersApi } from '@/api/users';
import { AUDIT_LABELS } from '@/lib/audit-labels';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { Seam } from '@/components/blocks';
import { AuditFilters } from '@/components/audit/AuditFilters';
import { AuditLogList } from '@/components/audit/AuditLogList';
import { AuditEntryPanel } from '@/components/audit/AuditEntryPanel';

const PAGE_SIZE = 25;

/**
 * Amallar tarixi — who did what, and when.
 *
 * The list stays a scan of time / actor / action / object; the row that used
 * to carry a truncated, `title`-only summary of the metadata now carries
 * nothing but a selection, because the touchscreen this runs on cannot hover.
 * The full entry lives in the panel instead.
 */
export function AuditPage() {
  usePageTitle('Amallar tarixi');

  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users', { all: true }],
    queryFn: () => usersApi.list(true),
  });

  const { data, isFetching } = useQuery({
    queryKey: ['audit', { page, action, userId, from, to }],
    queryFn: () =>
      auditApi.list({
        page,
        pageSize: PAGE_SIZE,
        action: action || undefined,
        userId: userId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const items = useMemo(() => {
    if (!search.trim()) return data?.items ?? [];
    const q = search.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      if (item.user.fullName.toLowerCase().includes(q)) return true;
      const label = (AUDIT_LABELS[item.action] ?? item.action).toLowerCase();
      if (label.includes(q)) return true;
      if (item.entityType.toLowerCase().includes(q)) return true;
      if (item.metadata && typeof item.metadata === 'object') {
        return JSON.stringify(item.metadata).toLowerCase().includes(q);
      }
      return false;
    });
  }, [data, search]);

  // The visible page is live-filtered client-side; keep a selection only
  // while its entry is still in view.
  useEffect(() => {
    if (selectedId && !items.some((item: AuditLogItem) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const hasActiveFilters = !!(action || userId || from || to || search);

  const resetFilters = () => {
    setAction('');
    setUserId('');
    setFrom('');
    setTo('');
    setSearch('');
    setPage(1);
  };

  return (
    <Screen
      title="Amallar tarixi"
      status={
        <AuditFilters
          search={search}
          onSearchChange={setSearch}
          action={action}
          onActionChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          userId={userId}
          onUserChange={(v) => {
            setUserId(v);
            setPage(1);
          }}
          from={from}
          onFromChange={(v) => {
            setFrom(v);
            setPage(1);
          }}
          to={to}
          onToChange={(v) => {
            setTo(v);
            setPage(1);
          }}
          users={users}
          hasActiveFilters={hasActiveFilters}
          onReset={resetFilters}
        />
      }
      panel={
        selected ? (
          <AuditEntryPanel key={selected.id} entry={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
            {items.length > 0 ? "Ko'rish uchun yozuvni tanlang" : "Yozuvlar yo'q"}
          </div>
        )
      }
    >
      <Seam className="content-start">
        <AuditLogList items={items} selectedId={selectedId} onSelect={(item) => setSelectedId(item.id)} />

        {data && data.total > 0 && (
          <div className="flex h-control items-center justify-between gap-seam bg-field-raised px-pad">
            <span className="text-[13px] text-muted-foreground">
              Jami <span className="font-semibold text-foreground tabular-nums">{data.total}</span> ta yozuv
              {isFetching ? ' · yangilanmoqda…' : ''}
            </span>
            <div className="flex items-center gap-seam">
              <Button size="sm" variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Oldingi
              </Button>
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Keyingi
              </Button>
            </div>
          </div>
        )}
      </Seam>
    </Screen>
  );
}
