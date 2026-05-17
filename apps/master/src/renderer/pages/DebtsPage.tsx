import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandCoins, Info, Loader2, Plus, Search, X } from 'lucide-react';
import { debtsApi, type DebtListItem } from '../api/debts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateTimeCell } from '@/components/data/DateCell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMoney, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type DebtStatusFilter = '' | 'OPEN' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF';

const STATUS_FILTERS: Array<{ value: DebtStatusFilter; label: string }> = [
  { value: '', label: 'Barchasi' },
  { value: 'OPEN', label: 'Ochiq' },
  { value: 'PARTIAL', label: 'Qisman' },
  { value: 'PAID', label: 'Yopilgan' },
  { value: 'WRITTEN_OFF', label: "Yo'qotilgan" },
];

const STATUS_LABEL: Record<DebtListItem['status'], string> = {
  OPEN: 'Ochiq',
  PARTIAL: 'Qisman',
  PAID: 'Yopilgan',
  WRITTEN_OFF: "Yo'qotilgan",
};

function DebtStatusBadge({ status }: { status: DebtListItem['status'] }) {
  const classes: Record<DebtListItem['status'], string> = {
    OPEN: 'bg-warning/10 text-warning border-warning/20',
    PARTIAL: 'bg-info/10 text-info border-info/20',
    PAID: 'bg-success/10 text-success border-success/20',
    WRITTEN_OFF: 'bg-destructive/10 text-destructive border-destructive/20',
  };
  return (
    <Badge variant="outline" className={cn('font-medium', classes[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function DebtsPage() {
  usePageTitle('Qarzlar');
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DebtStatusFilter>('');
  const [search, setSearch] = useState('');
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const [repayOpen, setRepayOpen] = useState(false);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [repayNote, setRepayNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['debts', status],
    queryFn: () => debtsApi.list({ status: status || undefined }),
  });

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const nameMatch = item.debtorName.toLowerCase().includes(q);
      const phoneMatch = (item.debtorPhone ?? '').toLowerCase().includes(q);
      return nameMatch || phoneMatch;
    });
  }, [data, search]);

  const { data: detail } = useQuery({
    queryKey: ['debts', 'detail', selectedDebtId],
    queryFn: () => debtsApi.getById(selectedDebtId!),
    enabled: !!selectedDebtId,
  });

  const repayMutation = useMutation({
    mutationFn: () =>
      debtsApi.repay(selectedDebtId!, {
        amount: Number(repayAmount),
        method: repayMethod,
        note: repayNote,
      }),
    onSuccess: () => {
      setRepayAmount('');
      setRepayNote('');
      setRepayOpen(false);
      queryClient.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (error: Error) => setErrorMessage(error.message || "Qarz to'lovini saqlab bo'lmadi"),
  });

  // Close repay dialog if selection changes
  useEffect(() => {
    setRepayOpen(false);
    setRepayAmount('');
    setRepayNote('');
  }, [selectedDebtId]);

  const handleRepay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtId || !repayAmount) return;
    repayMutation.mutate();
  };

  const columns: DataTableColumn<DebtListItem>[] = [
    {
      key: 'opened',
      header: 'Sana / Chek',
      cell: (row) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <DateTimeCell value={row.openedAt} className="text-xs text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Chek #{row.orderNumber}
          </span>
        </div>
      ),
    },
    {
      key: 'debtor',
      header: 'Mijoz',
      cell: (row) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium truncate">{row.debtorName}</span>
          {row.debtorPhone && (
            <span className="text-xs text-muted-foreground tabular-nums">{row.debtorPhone}</span>
          )}
        </div>
      ),
    },
    {
      key: 'original',
      header: 'Asl summa',
      align: 'right',
      cell: (row) => <MoneyCell value={row.originalAmount} className="text-muted-foreground" />,
    },
    {
      key: 'repaid',
      header: "To'langan",
      align: 'right',
      cell: (row) => <MoneyCell value={row.repaidAmount} className="text-muted-foreground" />,
    },
    {
      key: 'remaining',
      header: 'Qoldiq',
      align: 'right',
      cell: (row) => <MoneyCell value={row.remainingAmount} className="font-semibold" />,
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (row) => <DebtStatusBadge status={row.status} />,
    },
    {
      key: 'lastActivity',
      header: 'Oxirgi yangilanish',
      cell: (row) => (
        <DateTimeCell value={row.closedAt ?? row.openedAt} className="text-muted-foreground" />
      ),
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Qarzlar"
        description="Mijozlar qarzlari, qaytimlar tarixi va to'lovni qabul qilish."
      />

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 max-w-md">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Qarzdorni qidirish (ism yoki telefon)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-muted-foreground hover:text-foreground"
                title="Tozalash"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Tabs value={status || '__all__'} onValueChange={(v) => setStatus((v === '__all__' ? '' : v) as DebtStatusFilter)}>
            <TabsList>
              {STATUS_FILTERS.map((f) => (
                <TabsTrigger key={f.value || '__all__'} value={f.value || '__all__'}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7">
          <DataTable
            columns={columns}
            data={filteredItems}
            isLoading={isLoading}
            rowKey={(row) => row.id}
            onRowClick={(row) => setSelectedDebtId(row.id)}
            emptyState={
              <EmptyState
                icon={HandCoins}
                title={search.trim() ? 'Hech narsa topilmadi' : "Qarzlar yo'q"}
                hint={
                  search.trim()
                    ? "Filtrlar yoki qidiruv so'rovini o'zgartiring."
                    : 'Buyurtmani qarz tarzida yopganda shu yerda paydo bo\'ladi.'
                }
              />
            }
          />
        </div>

        <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-4">
          {!detail ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Info className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
                <p className="text-sm font-medium text-foreground">Qarzni tanlang</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tafsilotlar va to'lov qabul qilish uchun chap tomondan qarzni tanlang.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mijoz</p>
                    <p className="text-lg font-semibold truncate">{detail.debtorName}</p>
                    {detail.debtorPhone && (
                      <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{detail.debtorPhone}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/60">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Asl qarz</p>
                      <p className="text-sm font-medium tabular-nums mt-0.5">{formatMoney(detail.originalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">To'langan</p>
                      <p className="text-sm font-medium tabular-nums mt-0.5">{formatMoney(detail.repaidAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Qoldiq</p>
                      <p
                        className={cn(
                          'text-base font-semibold tabular-nums mt-0.5',
                          Number(detail.remainingAmount) > 0 ? 'text-warning' : 'text-success',
                        )}
                      >
                        {formatMoney(detail.remainingAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <DebtStatusBadge status={detail.status} />
                    {detail.status !== 'PAID' && detail.status !== 'WRITTEN_OFF' && (
                      <Button size="sm" onClick={() => setRepayOpen(true)}>
                        <Plus className="h-4 w-4" />
                        To'lov qabul qilish
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Qaytimlar tarixi
                    </p>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {detail.repayments.length}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {detail.repayments.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic text-center py-6">
                        Hali to'lov qilinmagan
                      </p>
                    ) : (
                      detail.repayments.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium tabular-nums">{formatMoney(r.amount)}</p>
                            <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                              {formatDateTime(r.paidAt)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                'font-medium',
                                r.method === 'CASH'
                                  ? 'bg-success/10 text-success border-success/20'
                                  : 'bg-info/10 text-info border-info/20',
                              )}
                            >
                              {r.method === 'CASH' ? 'Naqd' : 'Karta'}
                            </Badge>
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[120px]">
                              {r.receivedByName}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <Dialog open={repayOpen} onOpenChange={setRepayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>To'lov qabul qilish</DialogTitle>
            <DialogDescription>
              {detail?.debtorName ? `${detail.debtorName} uchun yangi qaytim.` : "Yangi qaytim."}
              {detail && (
                <>
                  {' '}Qoldiq: <span className="font-medium tabular-nums">{formatMoney(detail.remainingAmount)}</span>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRepay} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="repay-amount">Summa</Label>
                <Input
                  id="repay-amount"
                  type="number"
                  min="1"
                  autoFocus
                  className="tabular-nums"
                  placeholder="0"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repay-method">Tur</Label>
                <Select value={repayMethod} onValueChange={(v) => setRepayMethod(v as 'CASH' | 'CARD')}>
                  <SelectTrigger id="repay-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Naqd</SelectItem>
                    <SelectItem value="CARD">Karta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repay-note">Izoh (ixtiyoriy)</Label>
              <Input
                id="repay-note"
                placeholder="..."
                value={repayNote}
                onChange={(e) => setRepayNote(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRepayOpen(false)}
                disabled={repayMutation.isPending}
              >
                Bekor qilish
              </Button>
              <Button type="submit" disabled={repayMutation.isPending || !repayAmount}>
                {repayMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                To'lovni tasdiqlash
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {errorMessage && (
        <ConfirmDialog message={errorMessage} onConfirm={() => setErrorMessage(null)} />
      )}
    </PageContent>
  );
}
