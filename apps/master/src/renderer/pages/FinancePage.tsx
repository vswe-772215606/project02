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

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Uzbek weekday short letters indexed by Date.getDay() (0=Sun..6=Sat)
const UZ_WEEKDAY_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'] as const;

function fmtMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('uz-UZ').replace(/,/g, ' ');
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
  const [serviceMonth, setServiceMonth] = useState(currentMonthKey);

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'daily', date],
    queryFn: () => financeApi.daily(date),
    refetchInterval: 30_000,
  });

  const { data: serviceMatrix, isLoading: isMatrixLoading } = useQuery({
    queryKey: ['finance', 'service-charge', serviceMonth],
    queryFn: () => financeApi.serviceChargeMatrix(serviceMonth),
    refetchInterval: 60_000,
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
              <Row label={`To'lamay ketgan (${data.sales.walkoutOrders} ta)`} value={`-${Number(data.sales.walkoutLoss).toLocaleString('uz-UZ').replace(/,/g, ' ')}`} tone="danger" />
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

      <ServiceChargeMatrixSection
        month={serviceMonth}
        onMonthChange={setServiceMonth}
        matrix={serviceMatrix}
        isLoading={isMatrixLoading}
      />
    </PageContent>
  );
}

function ServiceChargeMatrixSection({
  month,
  onMonthChange,
  matrix,
  isLoading,
}: {
  month: string;
  onMonthChange: (next: string) => void;
  matrix: import('@/api/finance').ServiceChargeMatrix | undefined;
  isLoading: boolean;
}) {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr); // 1..12
  const days = matrix?.days ?? new Date(year, monthIdx, 0).getDate();

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === monthIdx;
  const todayDay = isCurrentMonth ? today.getDate() : -1;

  const dayHeaders = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const weekday = new Date(year, monthIdx - 1, day).getDay();
    return {
      day,
      weekdayLabel: UZ_WEEKDAY_SHORT[weekday] ?? '',
      isWeekend: weekday === 0 || weekday === 6,
      isToday: day === todayDay,
    };
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm font-semibold">Ofitsiantlar xizmat haqi (oylik)</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Yopilgan buyurtmalardan har bir ofitsiant uchun kunlik xizmat haqi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="service-month" className="text-xs text-muted-foreground">Oy:</Label>
          <Input
            id="service-month"
            type="month"
            value={month}
            onChange={(e) => onMonthChange(e.target.value || currentMonthKey())}
            className="w-40 h-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && !matrix ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Yuklanmoqda...</div>
        ) : !matrix || matrix.waiters.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Bu oyda yopilgan buyurtmalar topilmadi
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="text-xs tabular-nums border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 text-left font-semibold px-3 py-2 border-b border-border/60 min-w-[160px]">
                    Ofitsiant
                  </th>
                  {dayHeaders.map((h) => (
                    <th
                      key={h.day}
                      className={cn(
                        'text-center font-semibold px-1.5 py-1 border-b border-l border-border/60 min-w-[42px]',
                        h.isWeekend && 'bg-muted/60 text-muted-foreground',
                        h.isToday && 'bg-amber-100 text-amber-900',
                      )}
                    >
                      <div className="text-[9px] uppercase tracking-wider opacity-70 leading-tight">
                        {h.weekdayLabel}
                      </div>
                      <div className="text-[11px] leading-tight">{h.day}</div>
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 bg-muted/60 text-right font-semibold px-3 py-2 border-b border-l border-border/60 min-w-[110px]">
                    Jami
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrix.waiters.map((row) => (
                  <tr key={row.waiterId} className="hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-background hover:bg-muted/30 font-medium px-3 py-1.5 border-b border-border/40 whitespace-nowrap">
                      {row.waiterName}
                    </td>
                    {row.daily.map((value, idx) => {
                      const header = dayHeaders[idx];
                      const num = Number(value);
                      return (
                        <td
                          key={idx}
                          className={cn(
                            'text-right px-1.5 py-1.5 border-b border-l border-border/40 leading-tight',
                            header?.isWeekend && 'bg-muted/20',
                            header?.isToday && 'bg-amber-50',
                            num === 0 && 'text-muted-foreground/50',
                          )}
                          title={num > 0 ? `${header?.day}-kun: ${fmtMoney(value)} UZS` : undefined}
                        >
                          {fmtMoney(value)}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 bg-background hover:bg-muted/30 text-right font-semibold px-3 py-1.5 border-b border-l border-border/40 whitespace-nowrap">
                      {fmtMoney(row.total)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/50 font-semibold">
                  <td className="sticky left-0 z-10 bg-muted/50 px-3 py-2 border-t border-border/60">
                    Jami
                  </td>
                  {matrix.dayTotals.map((value, idx) => {
                    const header = dayHeaders[idx];
                    const num = Number(value);
                    return (
                      <td
                        key={idx}
                        className={cn(
                          'text-right px-1.5 py-2 border-t border-l border-border/60 leading-tight',
                          header?.isWeekend && 'bg-muted/60',
                          header?.isToday && 'bg-amber-100',
                          num === 0 && 'text-muted-foreground/60',
                        )}
                      >
                        {fmtMoney(value)}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-muted/60 text-right px-3 py-2 border-t border-l border-border/60 whitespace-nowrap">
                    {fmtMoney(matrix.grandTotal)} UZS
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
