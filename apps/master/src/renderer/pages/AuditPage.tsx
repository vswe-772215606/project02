import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, History, Search, X } from 'lucide-react';
import { auditApi, type AuditLogItem } from '@/api/audit';
import { usersApi } from '@/api/users';
import { AUDIT_LABELS, AUDIT_GROUPS, auditActionTone } from '@/lib/audit-labels';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { DateTimeCell } from '@/components/data/DateCell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

function ActionBadge({ action }: { action: string }) {
  const label = AUDIT_LABELS[action] ?? action;
  const tone = auditActionTone(action);
  const classes: Record<string, string> = {
    neutral: 'bg-muted text-foreground border-border',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger:  'bg-red-50 text-red-700 border-red-200',
    info:    'bg-sky-50 text-sky-700 border-sky-200',
  };
  return (
    <Badge variant="outline" className={cn('font-medium', classes[tone])} title={action}>
      {label}
    </Badge>
  );
}

function MetadataSummary({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== 'object') return <span className="text-muted-foreground">—</span>;
  const obj = metadata as Record<string, unknown>;

  const interesting: string[] = [];

  if (typeof obj.amount === 'string' || typeof obj.amount === 'number') {
    interesting.push(`summa: ${obj.amount}`);
  }
  if (typeof obj.totalCostUzs === 'string') interesting.push(`summa: ${obj.totalCostUzs}`);
  if (typeof obj.lossAmount === 'string') interesting.push(`yo'qotish: ${obj.lossAmount}`);
  if (typeof obj.ingredientName === 'string') interesting.push(`mahsulot: ${obj.ingredientName}`);
  if (typeof obj.reason === 'string' && obj.reason.length < 80) interesting.push(`sabab: ${obj.reason}`);
  if (typeof obj.note === 'string' && obj.note.length < 80) interesting.push(`izoh: ${obj.note}`);
  if (typeof obj.menuItemName === 'string') interesting.push(`taom: ${obj.menuItemName}`);
  if (typeof obj.debtorName === 'string') interesting.push(`qarzdor: ${obj.debtorName}`);

  if (interesting.length === 0) {
    const entries = Object.entries(obj).slice(0, 3);
    if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="text-xs text-muted-foreground truncate block max-w-md" title={JSON.stringify(obj)}>
        {entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ')}
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground truncate block max-w-md" title={JSON.stringify(obj)}>
      {interesting.join(' · ')}
    </span>
  );
}

export function AuditPage() {
  usePageTitle('Amallar tarixi');

  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['users', { all: true }],
    queryFn: () => usersApi.list(true),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit', { page, action, userId, from, to }],
    queryFn: () => auditApi.list({
      page,
      pageSize: PAGE_SIZE,
      action: action || undefined,
      userId: userId || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    placeholderData: (prev) => prev,
  });

  const filteredItems = useMemo(() => {
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

  const columns: DataTableColumn<AuditLogItem>[] = [
    {
      key: 'when',
      header: 'Vaqti',
      cell: (row) => <DateTimeCell value={row.createdAt} className="text-muted-foreground" />,
      width: '170px',
    },
    {
      key: 'user',
      header: 'Foydalanuvchi',
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{row.user.fullName}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{row.user.role}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Amal',
      cell: (row) => <ActionBadge action={row.action} />,
    },
    {
      key: 'entity',
      header: 'Obyekt',
      cell: (row) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap" title={row.entityId ?? ''}>
          {row.entityType}
          {row.entityId && <span className="ml-1 font-mono">#{row.entityId.slice(-6)}</span>}
        </span>
      ),
    },
    {
      key: 'meta',
      header: 'Tafsilot',
      cell: (row) => <MetadataSummary metadata={row.metadata} />,
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Amallar tarixi"
        description="Tizimda kim, qachon, nima qildi. Hamma o'zgarishlar yoziladi va o'chirilmaydi."
        actions={
          <Button variant="outline" onClick={resetFilters} disabled={!hasActiveFilters}>
            <X className="h-4 w-4" />
            Filtrlarni tozalash
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="audit-search">
                Qidirish
              </Label>
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  id="audit-search"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Foydalanuvchi, amal, summa, sabab..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="audit-action">
                Amal turi
              </Label>
              <Select value={action || '__all__'} onValueChange={(v) => { setAction(v === '__all__' ? '' : v); setPage(1); }}>
                <SelectTrigger id="audit-action" className="h-9">
                  <SelectValue placeholder="Hammasi" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__all__">Hammasi</SelectItem>
                  {AUDIT_GROUPS.flatMap((group) => [
                    <div key={`h-${group.label}`} className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {group.label}
                    </div>,
                    ...group.values.map((v) => (
                      <SelectItem key={v} value={v}>{AUDIT_LABELS[v] ?? v}</SelectItem>
                    )),
                  ])}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="audit-user">
                Foydalanuvchi
              </Label>
              <Select value={userId || '__all__'} onValueChange={(v) => { setUserId(v === '__all__' ? '' : v); setPage(1); }}>
                <SelectTrigger id="audit-user" className="h-9">
                  <SelectValue placeholder="Hammasi" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__all__">Hammasi</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Sana (dan / gacha)
              </Label>
              <div className="flex gap-1">
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 text-xs" />
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 text-xs" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={filteredItems}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <History className="h-6 w-6 text-muted-foreground/70" strokeWidth={1.5} />
            <p className="text-base font-medium text-foreground">Yozuvlar topilmadi</p>
            <p className="text-sm">Filtrlarni o'zgartiring yoki tozalang.</p>
          </div>
        }
      />

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-xs text-muted-foreground">
            Jami: <span className="font-medium text-foreground tabular-nums">{data.total}</span> ta yozuv
            {isFetching && <span className="ml-2">(yangilanmoqda…)</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Oldingi
            </Button>
            <span className="text-xs tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Keyingi
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PageContent>
  );
}
