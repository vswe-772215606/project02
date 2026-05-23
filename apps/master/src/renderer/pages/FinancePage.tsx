import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Lock,
  LockOpen,
  Receipt,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { financeApi, type FinanceDailyClosedSnapshot } from '@/api/finance';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateTimeCell } from '@/components/data/DateCell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function fmt(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('uz-UZ').replace(/,/g, ' ');
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: 'neutral' | 'good' | 'warning' | 'danger';
}) {
  const toneClass: Record<string, string> = {
    neutral: 'text-foreground',
    good: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  bold,
  tone = 'neutral',
  delta,
}: {
  label: string;
  value: string | number;
  bold?: boolean;
  tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'muted';
  delta?: number;
}) {
  const toneClass: Record<string, string> = {
    neutral: 'text-foreground',
    good: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    muted: 'text-muted-foreground',
  };
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className={cn('text-sm', tone === 'muted' && 'text-muted-foreground')}>{label}</span>
      <div className="flex items-center gap-2">
        {delta !== undefined && delta !== 0 && (
          <span className={cn(
            'text-[10px] tabular-nums px-1.5 py-0.5 rounded',
            delta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
          )}>
            {delta > 0 ? '+' : ''}{fmt(delta)}
          </span>
        )}
        <span className={cn('text-sm tabular-nums', bold && 'font-semibold', toneClass[tone])}>{value}</span>
      </div>
    </div>
  );
}

// "Hozir" raqami minus "yopilgan paytdagi" snapshot raqami farqi.
function deltaOf(current: string | number | null | undefined, snap: string | number | null | undefined): number {
  const c = Number(current ?? 0);
  const s = Number(snap ?? 0);
  if (!Number.isFinite(c) || !Number.isFinite(s)) return 0;
  return c - s;
}

export function FinancePage() {
  usePageTitle('Kunlik moliya');
  const [date, setDate] = useState(localDateString);
  const [closeNote, setCloseNote] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = role === 'OWNER';

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'daily', date],
    queryFn: () => financeApi.daily(date),
    refetchInterval: 30_000,
  });

  const closeMutation = useMutation({
    mutationFn: () => financeApi.dailyClose({ date, note: closeNote || undefined }),
    onSuccess: () => {
      setCloseNote('');
      setCloseError(null);
      queryClient.invalidateQueries({ queryKey: ['finance', 'daily', date] });
    },
    onError: (err: Error) => setCloseError(err.message || "Yopib bo'lmadi"),
  });

  const drawerMovement = data ? Number(data.drawer.movement) : 0;
  const drawerTone = drawerMovement > 0 ? 'good' : drawerMovement < 0 ? 'danger' : 'neutral';

  // Hozirgi raqamlardan tuzatishlar yig'indisini ayirsak — yopilgan paytdagi
  // "haqiqiy" snapshot bilan taqqoslash uchun ishonchli baza. Lekin biz aniq
  // snapshotni saqlaymiz, shuning uchun to'g'ridan-to'g'ri taqqoslaymiz.
  const closed = data?.closed ?? null;
  const snap: FinanceDailyClosedSnapshot | null = closed?.snapshot ?? null;
  const adj = data?.adjustments ?? null;
  const hasAdjustments = !!adj && (adj.expenseCount > 0 || adj.purchaseCount > 0);

  const purchaseColumns: DataTableColumn<NonNullable<typeof data>['purchases'][number]>[] = [
    { key: 'when', header: 'Vaqti', cell: (row) => <DateTimeCell value={row.occurredAt} className="text-muted-foreground" /> },
    {
      key: 'ingredient',
      header: 'Mahsulot',
      cell: (row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{row.ingredientName}</span>
          {row.isAdjustment && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
              Tuzatish
            </Badge>
          )}
        </div>
      ),
    },
    { key: 'qty', header: 'Miqdor', align: 'right', cell: (row) => `${row.quantityBuyUnit} ${row.buyUnit}` },
    { key: 'cost', header: 'Summa', align: 'right', cell: (row) => <MoneyCell value={row.totalCostUzs} /> },
    { key: 'note', header: 'Izoh', cell: (row) => <span className="text-muted-foreground">{row.supplierNote ?? '—'}</span> },
  ];

  const expenseColumns: DataTableColumn<NonNullable<typeof data>['expensesItems'][number]>[] = [
    { key: 'when', header: 'Vaqti', cell: (row) => <DateTimeCell value={row.occurredAt} className="text-muted-foreground" /> },
    {
      key: 'reason',
      header: 'Sabab',
      cell: (row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{row.reason}</span>
          {row.isAdjustment && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
              Tuzatish
            </Badge>
          )}
          {row.purchaseId && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
              Xarid
            </Badge>
          )}
          {row.repayable && row.repayStatus === 'PENDING' && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
              Kutilmoqda
            </Badge>
          )}
          {row.repayable && row.repayStatus === 'PARTIAL' && (
            <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">
              Qisman
            </Badge>
          )}
          {row.repayable && row.repayStatus === 'RETURNED' && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
              Qaytarildi
            </Badge>
          )}
          {row.repayable && row.repayStatus === 'WRITTEN_OFF' && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
              Yo'qotildi
            </Badge>
          )}
        </div>
      ),
    },
    { key: 'category', header: 'Turkum', cell: (row) => <span className="text-muted-foreground">{row.categoryName}</span> },
    {
      key: 'amount',
      header: 'Summa',
      align: 'right',
      cell: (row) => (
        <span className={cn(row.status === 'REVERSAL' && 'text-destructive')}>
          {row.status === 'REVERSAL' ? '-' : ''}<MoneyCell value={row.amount} />
        </span>
      ),
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Kunlik moliya"
        description={data ? formatDate(data.date) : 'Bugungi pul oqimi'}
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="finance-date" className="text-xs text-muted-foreground">Sana:</Label>
            <Input
              id="finance-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44 h-9"
            />
          </div>
        }
      />

      {/* Yopilgan kun bannerasi */}
      {closed && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
            <Lock className="h-4 w-4 text-emerald-700" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-emerald-900">
                Kun yopilgan · <DateTimeCell value={closed.closedAt} className="inline" /> · {closed.closedByName}
              </div>
              {closed.note && (
                <div className="text-xs text-emerald-800/80 mt-0.5">Izoh: {closed.note}</div>
              )}
              {hasAdjustments && (
                <div className="text-xs text-amber-700 mt-0.5">
                  Yopilgandan keyin {adj!.expenseCount + adj!.purchaseCount} ta tuzatish kiritilgan — pastdagi bo'limni ko'ring.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* OWNER uchun yopish bloki */}
      {!closed && isOwner && (
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
            <LockOpen className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
            <div className="flex-1 text-sm">
              <span className="font-medium">Kun ochiq.</span>{' '}
              <span className="text-muted-foreground">
                Yopilgandan keyin yangi yozuvlar &quot;tuzatish&quot; sifatida belgilanadi va alohida ko'rinadi.
              </span>
            </div>
            <Input
              placeholder="Izoh (ixtiyoriy)"
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              className="w-60 h-9"
            />
            <Button
              size="sm"
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
            >
              {closeMutation.isPending ? 'Yopilmoqda...' : 'Kunni yopish'}
            </Button>
          </CardContent>
          {closeError && (
            <CardContent className="pt-0 pb-3 px-4">
              <Alert variant="destructive"><AlertDescription>{closeError}</AlertDescription></Alert>
            </CardContent>
          )}
        </Card>
      )}

      {/* Top tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatTile
          label="Bugungi savdo"
          value={data ? fmt(data.sales.billedTotal) : '—'}
          hint={data ? `${data.sales.closedOrders} ta buyurtma` : ' '}
          icon={Receipt}
          tone="neutral"
        />
        <StatTile
          label="Pul tushdi"
          value={data ? fmt(data.cashflow.totalIn) : '—'}
          hint="Naqd + karta + qaytim"
          icon={ArrowDownToLine}
          tone="good"
        />
        <StatTile
          label="Pul chiqdi"
          value={data ? fmt(data.outflow.expensesTotal) : '—'}
          hint="Xarajat + xarid (jami)"
          icon={ArrowUpFromLine}
          tone="warning"
        />
        <StatTile
          label="Kassa harakati"
          value={data ? fmt(data.drawer.movement) : '—'}
          hint={data && drawerMovement < 0 ? 'Kassa kamaydi' : 'Kassa o\'sdi'}
          icon={drawerMovement >= 0 ? TrendingUp : TrendingDown}
          tone={drawerTone}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Section title="Savdo" description="Bugun yopilgan buyurtmalar bo'yicha">
          <div className="space-y-0">
            <Row
              label="Brutto savdo"
              value={fmt(data?.sales.grossSales)}
              delta={snap ? deltaOf(data?.sales.grossSales, snap.grossSales) : undefined}
            />
            <Row label="Chegirmalar" value={`-${fmt(data?.sales.discounts)}`} tone="muted" />
            <Row
              label="Sof ovqat savdosi"
              value={fmt(data?.sales.netFood)}
              delta={snap ? deltaOf(data?.sales.netFood, snap.netSales) : undefined}
            />
            <Row label="Xizmat haqi" value={fmt(data?.sales.serviceCharge)} tone="muted" />
            <Row
              label="Jami chek summasi"
              value={fmt(data?.sales.billedTotal)}
              bold
              delta={snap ? deltaOf(data?.sales.billedTotal, snap.billedTotal) : undefined}
            />
            {data && data.sales.walkoutOrders > 0 && (
              <Row label={`To'lamay ketgan (${data.sales.walkoutOrders} ta)`} value={`-${fmt(data.sales.walkoutLoss)}`} tone="danger" />
            )}
          </div>
        </Section>

        <Section title="Pul oqimi" description="Bugun kassaga tushgan">
          <div className="space-y-0">
            <Row label="Naqd (buyurtmalardan)" value={fmt(data?.cashflow.cashIn)} />
            <Row label="Karta (buyurtmalardan)" value={fmt(data?.cashflow.cardIn)} />
            <Row label="Qarz qaytimi (naqd)" value={fmt(data?.cashflow.debtRepaidCash)} tone="good" />
            <Row label="Qarz qaytimi (karta)" value={fmt(data?.cashflow.debtRepaidCard)} tone="good" />
            <Row label="Chiqim qaytimi (avans va h.k.)" value={fmt(data?.cashflow.expenseReturns)} tone="good" />
            <Row
              label="Jami kirim"
              value={fmt(data?.cashflow.totalIn)}
              bold
              delta={snap ? deltaOf(data?.cashflow.totalIn, snap.realCashIn) : undefined}
            />
            {data && Number(data.cashflow.debtOpened) > 0 && (
              <Row label="+ Qarzga sotildi" value={fmt(data.cashflow.debtOpened)} tone="muted" />
            )}
          </div>
        </Section>

        <Section title="Xarajatlar" description="Xaridlardan tashqari operatsion chiqimlar">
          <div className="space-y-0">
            <Row label="Brutto" value={fmt(data?.outflow.expensesGross)} />
            {data && Number(data.outflow.expensesReversal) > 0 && (
              <Row label="Bekor qilingan" value={`-${fmt(data.outflow.expensesReversal)}`} tone="muted" />
            )}
            <Row
              label="Operatsion chiqim (xaridsiz)"
              value={fmt(data?.outflow.expensesNonPurchase)}
              bold
            />
            {data && Number(data.outflow.pendingRepayable) > 0 && (
              <Row label="Kutilayotgan qaytim (avans)" value={fmt(data.outflow.pendingRepayable)} tone="muted" />
            )}
          </div>
        </Section>

        <Section title="Xaridlar va jami chiqim" description="Xarid + xarajat = jami kassa chiqimi">
          <div className="space-y-0">
            <Row label={`Xaridlar soni`} value={data?.outflow.purchasesCount ?? 0} />
            <Row label="Xaridlar summasi" value={fmt(data?.outflow.purchasesTotal)} />
            <Row
              label="JAMI kassadan chiqdi"
              value={fmt(data?.outflow.expensesTotal)}
              bold
              delta={snap ? deltaOf(data?.outflow.expensesTotal, snap.expensesTotal) : undefined}
            />
          </div>
        </Section>
      </div>

      {/* Tuzatishlar bloki — yopilgan kun uchun keyin kiritilgan yozuvlar */}
      {hasAdjustments && (
        <Section
          title="Tuzatishlar"
          description="Kun yopilgandan keyin kiritilgan yozuvlar (snapshotga kirmagan)"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Row label={`Chiqimlar: ${adj!.expenseCount} ta`} value={fmt(adj!.expenseTotal)} tone="warning" />
              <Row label={`Xaridlar: ${adj!.purchaseCount} ta`} value={fmt(adj!.purchaseTotal)} tone="warning" />
            </div>
            {adj!.expenses.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Chiqimlar</p>
                <DataTable
                  columns={[
                    { key: 'created', header: 'Yozildi', cell: (row) => <DateTimeCell value={row.createdAt} className="text-muted-foreground" /> },
                    { key: 'reason', header: 'Sabab', cell: (row) => <span className="font-medium">{row.reason}</span> },
                    { key: 'category', header: 'Turkum', cell: (row) => <span className="text-muted-foreground">{row.categoryName}</span> },
                    { key: 'by', header: 'Kim', cell: (row) => <span className="text-muted-foreground">{row.createdByName}</span> },
                    { key: 'amount', header: 'Summa', align: 'right', cell: (row) => <MoneyCell value={row.amount} /> },
                  ]}
                  data={adj!.expenses}
                  rowKey={(row) => row.id}
                />
              </div>
            )}
            {adj!.purchases.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Xaridlar</p>
                <DataTable
                  columns={[
                    { key: 'created', header: 'Yozildi', cell: (row) => <DateTimeCell value={row.createdAt} className="text-muted-foreground" /> },
                    { key: 'ing', header: 'Mahsulot', cell: (row) => <span className="font-medium">{row.ingredientName}</span> },
                    { key: 'qty', header: 'Miqdor', align: 'right', cell: (row) => `${row.quantityBuyUnit} ${row.buyUnit}` },
                    { key: 'by', header: 'Kim', cell: (row) => <span className="text-muted-foreground">{row.recordedByName}</span> },
                    { key: 'cost', header: 'Summa', align: 'right', cell: (row) => <MoneyCell value={row.totalCostUzs} /> },
                  ]}
                  data={adj!.purchases}
                  rowKey={(row) => row.id}
                />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Drill-down tables */}
      {data && data.purchases.length > 0 && (
        <Section title="Bugungi xaridlar" description="Mahsulot xaridlari batafsil">
          <DataTable
            columns={purchaseColumns}
            data={data.purchases}
            isLoading={isLoading}
            rowKey={(row) => row.id}
          />
        </Section>
      )}

      {data && data.expensesItems.length > 0 && (
        <Section title="Bugungi xarajatlar" description="Sabab, summa, qaytarish statusi">
          <DataTable
            columns={expenseColumns}
            data={data.expensesItems}
            isLoading={isLoading}
            rowKey={(row) => row.id}
          />
        </Section>
      )}
    </PageContent>
  );
}
