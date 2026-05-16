import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CreditCard,
  HandCoins,
  Package,
  Receipt,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { financeApi } from '@/api/finance';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateTimeCell } from '@/components/data/DateCell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
}: {
  label: string;
  value: string | number;
  bold?: boolean;
  tone?: 'neutral' | 'good' | 'warning' | 'danger' | 'muted';
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
      <span className={cn('text-sm tabular-nums', bold && 'font-semibold', toneClass[tone])}>{value}</span>
    </div>
  );
}

export function FinancePage() {
  usePageTitle('Kunlik moliya');
  const [date, setDate] = useState(localDateString);

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'daily', date],
    queryFn: () => financeApi.daily(date),
    refetchInterval: 30_000,
  });

  const drawerMovement = data ? Number(data.drawer.movement) : 0;
  const drawerTone = drawerMovement > 0 ? 'good' : drawerMovement < 0 ? 'danger' : 'neutral';

  const purchaseColumns: DataTableColumn<NonNullable<typeof data>['purchases'][number]>[] = [
    { key: 'when', header: 'Vaqti', cell: (row) => <DateTimeCell value={row.occurredAt} className="text-muted-foreground" /> },
    { key: 'ingredient', header: 'Mahsulot', cell: (row) => <span className="font-medium">{row.ingredientName}</span> },
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

      {/* Top tiles — at-a-glance day summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatTile
          label="Bugungi savdo"
          value={data ? Number(data.sales.billedTotal).toLocaleString('uz-UZ').replace(/,/g, ' ') : '—'}
          hint={data ? `${data.sales.closedOrders} ta buyurtma` : ' '}
          icon={Receipt}
          tone="neutral"
        />
        <StatTile
          label="Pul tushdi"
          value={data ? Number(data.cashflow.totalIn).toLocaleString('uz-UZ').replace(/,/g, ' ') : '—'}
          hint="Naqd + karta + qaytim"
          icon={ArrowDownToLine}
          tone="good"
        />
        <StatTile
          label="Pul chiqdi"
          value={data ? Number(data.outflow.totalOut).toLocaleString('uz-UZ').replace(/,/g, ' ') : '—'}
          hint="Xarajat + xarid"
          icon={ArrowUpFromLine}
          tone="warning"
        />
        <StatTile
          label="Kassa harakati"
          value={data ? Number(data.drawer.movement).toLocaleString('uz-UZ').replace(/,/g, ' ') : '—'}
          hint={data && drawerMovement < 0 ? 'Kassa kamaydi' : 'Kassa o\'sdi'}
          icon={drawerMovement >= 0 ? TrendingUp : TrendingDown}
          tone={drawerTone}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Section title="Savdo" description="Bugun yopilgan buyurtmalar bo'yicha">
          <div className="space-y-0">
            <Row label="Brutto savdo" value={Number(data?.sales.grossSales ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} />
            <Row label="Chegirmalar" value={`-${Number(data?.sales.discounts ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')}`} tone="muted" />
            <Row label="Sof ovqat savdosi" value={Number(data?.sales.netFood ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} />
            <Row label="Xizmat haqi (ofitsiantlarga)" value={Number(data?.sales.serviceCharge ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} tone="muted" />
            <Row label="Jami chek summasi" value={Number(data?.sales.billedTotal ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} bold />
            {data && data.sales.walkoutOrders > 0 && (
              <Row label={`Walkout (${data.sales.walkoutOrders} ta)`} value={`-${Number(data.sales.walkoutLoss).toLocaleString('uz-UZ').replace(/,/g, ' ')}`} tone="danger" />
            )}
          </div>
        </Section>

        <Section title="Pul oqimi" description="Bugun kassaga tushgan + chiqqan">
          <div className="space-y-0">
            <Row label="Naqd (buyurtmalardan)" value={Number(data?.cashflow.cashIn ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} />
            <Row label="Karta (buyurtmalardan)" value={Number(data?.cashflow.cardIn ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} />
            <Row label="Qarz qaytimi (naqd)" value={Number(data?.cashflow.debtRepaidCash ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} tone="good" />
            <Row label="Qarz qaytimi (karta)" value={Number(data?.cashflow.debtRepaidCard ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} tone="good" />
            <Row label="Chiqim qaytimi (avans va h.k.)" value={Number(data?.cashflow.expenseReturns ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} tone="good" />
            <Row label="Jami kirim" value={Number(data?.cashflow.totalIn ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} bold />
            {data && Number(data.cashflow.debtOpened) > 0 && (
              <Row label={`+ Qarzga sotildi`} value={Number(data.cashflow.debtOpened).toLocaleString('uz-UZ').replace(/,/g, ' ')} tone="muted" />
            )}
          </div>
        </Section>

        <Section title="Xarajatlar" description="Bugun kassadan ketgan pul (xaridlardan tashqari)">
          <div className="space-y-0">
            <Row label="Brutto xarajat" value={Number(data?.outflow.expensesGross ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} />
            {data && Number(data.outflow.expensesReversal) > 0 && (
              <Row label="Bekor qilingan" value={`-${Number(data.outflow.expensesReversal).toLocaleString('uz-UZ').replace(/,/g, ' ')}`} tone="muted" />
            )}
            <Row label="Netto (haqiqiy kassa chiqimi)" value={Number(data?.outflow.expensesNet ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} bold />
            {data && Number(data.outflow.pendingRepayable) > 0 && (
              <Row label="Kutilayotgan qaytim (kelajak)" value={Number(data.outflow.pendingRepayable).toLocaleString('uz-UZ').replace(/,/g, ' ')} tone="muted" />
            )}
          </div>
        </Section>

        <Section title="Xaridlar" description="Bugun kelgan mahsulotlar uchun to'langan pul">
          <div className="space-y-0">
            <Row label={`Xaridlar soni`} value={data?.outflow.purchasesCount ?? 0} />
            <Row label="Jami summa" value={Number(data?.outflow.purchasesTotal ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} bold />
          </div>
        </Section>
      </div>

      {/* Drawer bottom line */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />
              Kassa harakati
            </div>
            <div className={cn('text-xl font-semibold tabular-nums', drawerTone === 'good' && 'text-success', drawerTone === 'danger' && 'text-destructive')}>
              {drawerMovement >= 0 ? '+' : ''}{Number(data?.drawer.movement ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} UZS
            </div>
            <p className="text-xs text-muted-foreground">Bugungi jami kirim − jami chiqim</p>
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
              <HandCoins className="h-3.5 w-3.5" />
              Hozirgi qarz qoldig'i
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {Number(data?.drawer.outstandingDebts ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} UZS
            </div>
            <p className="text-xs text-muted-foreground">Mijozlarda kutilayotgan jami qarz</p>
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
              <Banknote className="h-3.5 w-3.5" />
              Bugungi naqd
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {Number(data?.cashflow.cashIn ?? 0).toLocaleString('uz-UZ').replace(/,/g, ' ')} UZS
            </div>
            <p className="text-xs text-muted-foreground">Buyurtmalardan kelgan naqd</p>
          </div>
        </CardContent>
      </Card>

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
