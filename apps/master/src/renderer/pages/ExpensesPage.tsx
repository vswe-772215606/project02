import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { expensesApi, type ExpenseItem } from '@/api/expenses';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateTimeCell } from '@/components/data/DateCell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ExpenseStatusCell } from '@/components/expenses/ExpenseStatusBadge';
import {
  ExpenseCreateDialog,
} from '@/components/expenses/ExpenseCreateDialog';
import {
  ExpenseReverseDialog,
  type ReversalTarget,
} from '@/components/expenses/ExpenseReverseDialog';
import {
  ExpenseReturnDialog,
  type ReturnTarget,
} from '@/components/expenses/ExpenseReturnDialog';
import {
  ExpenseWriteOffDialog,
  type WriteOffTarget,
} from '@/components/expenses/ExpenseWriteOffDialog';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isToday(date: string | Date) {
  const value = new Date(date);
  const now = new Date();
  return value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'danger' | 'warning';
  hint?: string;
}) {
  const toneClass: Record<string, string> = {
    neutral: 'text-foreground',
    danger: 'text-destructive',
    warning: 'text-warning',
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-semibold tabular-nums', toneClass[tone])}>{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ExpensesPage() {
  usePageTitle('Xarajatlar');

  const [date, setDate] = useState(localDateString);
  const [searchQuery, setSearchQuery] = useState('');
  const [openRepayableOnly, setOpenRepayableOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<WriteOffTarget | null>(null);
  const [reversalTarget, setReversalTarget] = useState<ReversalTarget | null>(null);

  const isSearching = searchQuery.trim().length > 0 || openRepayableOnly;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['expenses', date],
    queryFn: () => expensesApi.getByDate(date),
    enabled: !isSearching,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['expenses', 'search', searchQuery, openRepayableOnly],
    queryFn: () => expensesApi.search({
      q: searchQuery.trim() || undefined,
      openRepayable: openRepayableOnly || undefined,
      limit: 200,
    }),
    enabled: isSearching,
  });

  const items: ExpenseItem[] = isSearching
    ? (searchData?.items ?? [])
    : (data?.items ?? []);

  const tableLoading = isSearching ? searchLoading : isLoading;

  const repayablePending = useMemo(() => {
    if (!data) return 0;
    return data.items
      .filter((it) => it.repayable && (it.repayStatus === 'PENDING' || it.repayStatus === 'PARTIAL'))
      .reduce((sum, it) => sum + Number(it.remainingAmount ?? '0'), 0);
  }, [data]);

  const columns: DataTableColumn<ExpenseItem>[] = [
    {
      key: 'when',
      header: 'Vaqti',
      cell: (row) => <DateTimeCell value={row.occurredAt} className="text-muted-foreground" />,
      width: '160px',
    },
    {
      key: 'category',
      header: 'Turkum',
      cell: (row) => (
        <Badge variant="outline" className="text-xs">{row.categoryName}</Badge>
      ),
    },
    {
      key: 'reason',
      header: 'Sabab',
      cell: (row) => (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'text-sm font-medium',
                row.status === 'REVERSED' && 'line-through text-muted-foreground',
              )}
            >
              {row.reason}
            </span>
            {row.purchaseId && (
              <Badge
                variant="outline"
                className="bg-warning/10 text-warning border-warning/30 text-[10px]"
                title="Bu chiqim Xaridlar sahifasidagi xarid bilan bog'liq"
              >
                Xarid
              </Badge>
            )}
          </div>
          {row.note && (
            <p className="text-xs italic text-muted-foreground">{row.note}</p>
          )}
          {row.repayable && row.returnedTotal && row.returnedTotal !== '0' && (
            <p className="text-xs text-muted-foreground tabular-nums">
              Qaytarildi: <MoneyCell value={row.returnedTotal} className="font-medium text-foreground" />
              {row.remainingAmount && row.remainingAmount !== '0' && (
                <>
                  {' · '}Qoldiq: <MoneyCell value={row.remainingAmount} className="font-medium text-foreground" />
                </>
              )}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Summa',
      align: 'right',
      cell: (row) => (
        <span className={cn('tabular-nums', row.status === 'REVERSAL' && 'text-destructive')}>
          {row.status === 'REVERSAL' ? '-' : ''}
          <MoneyCell value={row.amount} />
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (row) => <ExpenseStatusCell item={row} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => {
        const buttons: React.ReactNode[] = [];
        if (row.repayable && (row.repayStatus === 'PENDING' || row.repayStatus === 'PARTIAL')) {
          buttons.push(
            <Button
              key="return"
              size="sm"
              variant="ghost"
              className="h-7 text-success hover:text-success hover:bg-success/10"
              onClick={(e) => {
                e.stopPropagation();
                setReturnTarget({
                  id: row.id,
                  reason: row.reason,
                  remainingAmount: row.remainingAmount ?? '0',
                });
              }}
            >
              Qaytim
            </Button>,
          );
          buttons.push(
            <Button
              key="writeoff"
              size="sm"
              variant="ghost"
              className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                setWriteOffTarget({
                  id: row.id,
                  reason: row.reason,
                  remainingAmount: row.remainingAmount ?? '0',
                });
              }}
            >
              Yo&apos;qotish
            </Button>,
          );
        }
        if (row.status === 'ACTIVE' && !row.repayable) {
          if (isToday(row.occurredAt)) {
            buttons.push(
              <Button
                key="reverse"
                size="sm"
                variant="ghost"
                className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setReversalTarget({ id: row.id, reason: row.reason, amount: row.signedAmount });
                }}
              >
                Bekor qilish
              </Button>,
            );
          } else {
            buttons.push(
              <span key="hint" className="text-[11px] text-muted-foreground/70">
                Faqat bugun
              </span>,
            );
          }
        }
        if (buttons.length === 0) return <span className="text-muted-foreground">—</span>;
        return <div className="flex items-center justify-end gap-1">{buttons}</div>;
      },
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Xarajatlar"
        description="Kunlik chiqimlar va qaytariladigan avanslar"
        actions={
          <div className="flex items-center gap-2">
            {isFetching && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Yangilanmoqda
              </span>
            )}
            <div className="flex items-center gap-2">
              <Label htmlFor="expenses-date" className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Sana:
              </Label>
              <Input
                id="expenses-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-40 h-9"
              />
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Yangi xarajat
            </Button>
          </div>
        }
      />

      {/* Summary tiles — only for the daily view */}
      {!isSearching && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatTile
            label="Jami chiqim"
            value={Number(data?.totals.net ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')}
            icon={Wallet}
            hint="Bugun kassadan ketgan"
          />
          <StatTile
            label="Kutilayotgan qaytim"
            value={Number(repayablePending).toLocaleString('uz-UZ').replace(/,/g, ' ')}
            icon={TrendingUp}
            tone="warning"
            hint="Bugungi ochiq avanslar"
          />
          <StatTile
            label="Bekor qilingan"
            value={Number(data?.totals.reversal ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')}
            icon={TrendingDown}
            tone="danger"
            hint="Bugun bekor qilingan chiqimlar"
          />
        </div>
      )}

      {/* Search + filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Sabab yoki izoh bo'yicha qidirish (masalan: Aziza avans)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-muted-foreground hover:text-foreground"
                  title="Tozalash"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <label
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 h-9 cursor-pointer select-none transition-colors',
                openRepayableOnly
                  ? 'border-warning/40 bg-warning/10 text-warning'
                  : 'border-input bg-background',
              )}
            >
              <Checkbox
                checked={openRepayableOnly}
                onCheckedChange={(v) => setOpenRepayableOnly(v === true)}
              />
              <span className="text-xs font-medium whitespace-nowrap">
                Faqat ochiq qaytariladiganlar
              </span>
            </label>
            {isSearching && (
              <div className="text-xs text-muted-foreground tabular-nums">
                Topildi: <span className="font-medium text-foreground">{searchData?.items.length ?? 0}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={items}
        isLoading={tableLoading}
        rowKey={(row) => row.id}
        emptyState={
          <EmptyState
            icon={ReceiptText}
            title={isSearching ? 'Hech narsa topilmadi' : 'Bugun chiqimlar yo\'q'}
            hint={
              isSearching
                ? "Filtrlarni o'zgartiring yoki tozalang."
                : 'Yangi xarajat qo\'shish uchun yuqoridagi tugmadan foydalaning.'
            }
            action={
              !isSearching ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Yangi xarajat
                </Button>
              ) : undefined
            }
          />
        }
      />

      <ExpenseCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        date={date}
        onCreated={() => toast.success('Chiqim saqlandi')}
      />

      <ExpenseReverseDialog
        target={reversalTarget}
        onClose={() => setReversalTarget(null)}
        onSuccess={() => toast.success('Chiqim bekor qilindi')}
      />

      <ExpenseReturnDialog
        target={returnTarget}
        onClose={() => setReturnTarget(null)}
        onSuccess={() => toast.success('Qaytim yozildi')}
      />

      <ExpenseWriteOffDialog
        target={writeOffTarget}
        onClose={() => setWriteOffTarget(null)}
        onSuccess={() => toast.success("Yo'qotish belgilandi")}
      />
    </PageContent>
  );
}
