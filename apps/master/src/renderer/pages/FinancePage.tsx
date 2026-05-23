import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpFromLine,
  ChevronDown,
  ChevronUp,
  Receipt,
  TrendingDown,
  TrendingUp,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { financeApi, type FinanceDaily } from '@/api/finance';
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

function fmtUzs(value: string | number) {
  return Number(value).toLocaleString('uz-UZ').replace(/,/g, ' ');
}

function StatTile({
  label, value, hint, icon: Icon, tone = 'neutral',
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
  title, description, children,
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

function CollapsibleSection({
  title, description, badge, defaultOpen = false, children,
}: {
  title: string;
  description?: string;
  badge?: string;          // small counter shown next to title (e.g. "33 ta")
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader
        className="space-y-0 pb-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {title}
              {badge && (
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {badge}
                </span>
              )}
            </CardTitle>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
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

  // ─── 1. Sotilgan ovqatlar (per-dish + per-category) ─────────────────
  // Build a flat render list: for each category, the category header row
  // (subtotal), then its dishes underneath. Sorted by category revenue desc,
  // then dishes by revenue desc within the category.
  type MealRowDisplay =
    | { type: 'category'; data: NonNullable<typeof data>['mealSalesByCategory'][number] }
    | { type: 'item'; data: NonNullable<typeof data>['mealSales'][number] };

  const mealRows = useMemo<MealRowDisplay[]>(() => {
    if (!data) return [];
    const itemsByCat = new Map<string, typeof data.mealSales>();
    for (const item of data.mealSales) {
      const list = itemsByCat.get(item.categoryId) ?? [];
      list.push(item);
      itemsByCat.set(item.categoryId, list);
    }
    const out: MealRowDisplay[] = [];
    for (const cat of data.mealSalesByCategory) {
      out.push({ type: 'category', data: cat });
      const items = itemsByCat.get(cat.categoryId) ?? [];
      for (const item of items) {
        out.push({ type: 'item', data: item });
      }
    }
    return out;
  }, [data]);

  const mealColumns: DataTableColumn<MealRowDisplay>[] = [
    {
      key: 'name',
      header: 'Ovqat / Kategoriya',
      cell: (row) => row.type === 'category'
        ? (
          <span className="font-bold uppercase tracking-wide text-xs text-muted-foreground">
            {row.data.categoryName}
          </span>
        )
        : (
          <span className={cn('pl-4 text-sm', row.data.isService && 'italic text-muted-foreground')}>
            {row.data.menuItemName}
            {row.data.isService && ' (xizmat)'}
          </span>
        ),
    },
    {
      key: 'qty', header: 'Soni', align: 'right',
      cell: (row) => <span className={row.type === 'category' ? 'font-semibold' : ''}>{row.data.qty}</span>,
    },
    {
      key: 'revenue', header: 'Sotuv', align: 'right',
      cell: (row) => <span className={cn('tabular-nums', row.type === 'category' && 'font-semibold')}>{fmtUzs(row.data.revenue)}</span>,
    },
    {
      key: 'cogs', header: 'Tan narxi', align: 'right',
      cell: (row) => (
        <span className={cn('tabular-nums text-muted-foreground', row.type === 'category' && 'font-semibold')}>
          {fmtUzs(row.data.cogs)}
        </span>
      ),
    },
    {
      key: 'profit', header: 'Foyda', align: 'right',
      cell: (row) => {
        const v = Number(row.data.profit);
        return (
          <span className={cn(
            'tabular-nums',
            row.type === 'category' && 'font-semibold',
            v > 0 && 'text-success',
            v < 0 && 'text-destructive',
          )}>
            {fmtUzs(row.data.profit)}
          </span>
        );
      },
    },
  ];

  // ─── 3. Chiqimlar (operatsion) ───────────────────────────────────────
  const opExpenseColumns: DataTableColumn<FinanceDaily['operatingExpenses'][number]>[] = [
    { key: 'when', header: 'Vaqti', cell: (row) => <DateTimeCell value={row.occurredAt} className="text-muted-foreground" /> },
    {
      key: 'reason', header: 'Sabab',
      cell: (row) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{row.reason}</span>
          {row.repayable && row.repayStatus === 'PENDING' && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Kutilmoqda</Badge>
          )}
          {row.repayable && row.repayStatus === 'PARTIAL' && (
            <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px]">Qisman</Badge>
          )}
          {row.repayable && row.repayStatus === 'RETURNED' && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Qaytarildi</Badge>
          )}
          {row.repayable && row.repayStatus === 'WRITTEN_OFF' && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Yo'qotildi</Badge>
          )}
        </div>
      ),
    },
    { key: 'category', header: 'Turkum', cell: (row) => <span className="text-muted-foreground">{row.categoryName}</span> },
    {
      key: 'amount', header: 'Summa', align: 'right',
      cell: (row) => (
        <span className={cn(row.status === 'REVERSAL' && 'text-destructive')}>
          {row.status === 'REVERSAL' ? '-' : ''}<MoneyCell value={row.amount} />
        </span>
      ),
    },
  ];

  // ─── 4. Xaridlar (ombor uchun) ───────────────────────────────────────
  const purchaseColumns: DataTableColumn<FinanceDaily['ingredientPurchases'][number]>[] = [
    { key: 'when', header: 'Vaqti', cell: (row) => <DateTimeCell value={row.occurredAt} className="text-muted-foreground" /> },
    { key: 'ingredient', header: 'Mahsulot', cell: (row) => <span className="font-medium">{row.ingredientName}</span> },
    { key: 'qty', header: 'Miqdor', align: 'right', cell: (row) => `${row.quantityBuyUnit} ${row.buyUnit}` },
    { key: 'cost', header: 'Summa', align: 'right', cell: (row) => <MoneyCell value={row.totalCostUzs} /> },
    { key: 'note', header: 'Izoh', cell: (row) => <span className="text-muted-foreground">{row.supplierNote ?? '—'}</span> },
  ];

  const profit = data ? Number(data.pnl.profit) : 0;
  const profitTone = profit > 0 ? 'good' : profit < 0 ? 'danger' : 'neutral';

  return (
    <PageContent>
      <PageHeader
        title="Kunlik moliya"
        description={data ? formatDate(data.date) : 'Bugungi foyda hisobi'}
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

      {/* Top tiles — at-a-glance P&L */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatTile
          label="Sotuv"
          value={data ? fmtUzs(data.pnl.revenue) : '—'}
          hint={data ? `${data.mealSalesTotal.qty} ta porsiya` : ' '}
          icon={Receipt}
          tone="neutral"
        />
        <StatTile
          label="Tan narxi (COGS)"
          value={data ? fmtUzs(data.pnl.cogs) : '—'}
          hint="Sotilgan ovqat masalliqlari"
          icon={Package}
          tone="warning"
        />
        <StatTile
          label="Operatsion chiqim"
          value={data ? fmtUzs(data.pnl.operatingExpense) : '—'}
          hint="Xaridlardan tashqari"
          icon={ArrowUpFromLine}
          tone="warning"
        />
        <StatTile
          label="Sof foyda"
          value={data ? fmtUzs(data.pnl.profit) : '—'}
          hint={profit < 0 ? 'Zarar' : 'Sotuv − COGS − chiqim'}
          icon={profit >= 0 ? TrendingUp : TrendingDown}
          tone={profitTone}
        />
      </div>

      {/* ─── 1. Sotilgan ovqatlar ─── */}
      <Section
        title="Sotilgan ovqatlar"
        description="Ovqat va kategoriya bo'yicha: tan narxi, sotuv narxi va foyda"
      >
        {data && data.mealSales.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Bugun sotuv yo'q</p>
        ) : (
          <>
            <DataTable
              columns={mealColumns}
              data={mealRows}
              isLoading={isLoading}
              rowKey={(row) => `${row.type}-${row.type === 'category' ? row.data.categoryId : row.data.menuItemId}`}
            />
            {data && data.mealSalesTotal.qty > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-bold uppercase tracking-wide">Jami</span>
                <div className="flex gap-6 text-sm tabular-nums">
                  <span>Soni: <span className="font-semibold">{data.mealSalesTotal.qty}</span></span>
                  <span>Sotuv: <span className="font-semibold">{fmtUzs(data.mealSalesTotal.revenue)}</span></span>
                  <span className="text-muted-foreground">Tan narxi: <span className="font-semibold">{fmtUzs(data.mealSalesTotal.cogs)}</span></span>
                  <span className={cn('font-bold', Number(data.mealSalesTotal.profit) > 0 ? 'text-success' : 'text-destructive')}>
                    Foyda: {fmtUzs(data.mealSalesTotal.profit)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* ─── 2. Nasiya ─── */}
        <Section title="Nasiya (qarz)" description="Bugun ochilgan va yopilgan">
          <div className="space-y-2">
            <div className="flex items-start justify-between py-1 border-b border-border/40">
              <div>
                <div className="text-sm font-medium">Bugun ochilgan</div>
                <div className="text-xs text-muted-foreground">{data?.debtToday.openedCount ?? 0} ta</div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-warning">
                +{fmtUzs(data?.debtToday.openedAmount ?? 0)}
              </div>
            </div>
            <div className="flex items-start justify-between py-1 border-b border-border/40">
              <div>
                <div className="text-sm font-medium">Bugun olingan to'lov</div>
                <div className="text-xs text-muted-foreground">{data?.debtToday.collectedCount ?? 0} ta</div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-success">
                {fmtUzs(data?.debtToday.collectedAmount ?? 0)}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Jami ochiq qoldiq</span>
              <span className="text-sm font-bold tabular-nums">{fmtUzs(data?.debtToday.lifetimeOutstanding ?? 0)}</span>
            </div>
          </div>
        </Section>

        {/* ─── 3. Chiqimlar (operatsion, xaridlarsiz) ─── */}
        <Section title="Chiqimlar" description="Operatsion (ijara, maosh, kommunal — xaridlarsiz)">
          <div className="space-y-2">
            <div className="flex items-start justify-between py-1 border-b border-border/40">
              <div>
                <div className="text-sm font-medium">Bugungi chiqim</div>
                <div className="text-xs text-muted-foreground">{data?.operatingExpensesTotal.count ?? 0} ta</div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-destructive">
                −{fmtUzs(data?.operatingExpensesTotal.operating ?? 0)}
              </div>
            </div>
            {data && Number(data.operatingExpensesTotal.gross) !== Number(data.operatingExpensesTotal.operating) && (
              <div className="text-xs text-muted-foreground pt-1">
                Brutto: {fmtUzs(data.operatingExpensesTotal.gross)} so'm
              </div>
            )}
          </div>
        </Section>

        {/* ─── 4. Xaridlar (info) ─── */}
        <Section title="Xaridlar (ombor)" description="Bugun ombor uchun ketgan pul">
          <div className="space-y-2">
            <div className="flex items-start justify-between py-1 border-b border-border/40">
              <div>
                <div className="text-sm font-medium">Bugungi xaridlar</div>
                <div className="text-xs text-muted-foreground">{data?.ingredientPurchasesTotal.count ?? 0} ta partiya</div>
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {fmtUzs(data?.ingredientPurchasesTotal.amount ?? 0)}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug pt-1">
              Bu summa zaxiraga kirdi. Sof foyda hisobiga sotilgandan keyin tan narx sifatida kiradi.
            </p>
          </div>
        </Section>
      </div>

      {/* ─── Yakuniy P&L ─── */}
      <Section title="Bugungi yakun (P&L)" description="Sotuv − Tan narxi − Operatsion chiqim = Sof foyda">
        <div className="space-y-2 max-w-md mx-auto">
          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="text-sm">Sotuv (kirim)</span>
            <span className="text-base font-semibold tabular-nums text-success">+{fmtUzs(data?.pnl.revenue ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="text-sm">Tan narxi (COGS)</span>
            <span className="text-base font-semibold tabular-nums text-destructive">−{fmtUzs(data?.pnl.cogs ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-border/40">
            <span className="text-sm">Operatsion chiqim</span>
            <span className="text-base font-semibold tabular-nums text-destructive">−{fmtUzs(data?.pnl.operatingExpense ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between pt-3">
            <span className="text-base font-bold uppercase tracking-wide">Sof foyda</span>
            <span className={cn('text-2xl font-bold tabular-nums', profitTone === 'good' ? 'text-success' : profitTone === 'danger' ? 'text-destructive' : '')}>
              {fmtUzs(data?.pnl.profit ?? 0)}
            </span>
          </div>
        </div>
      </Section>

      {/* Drill-down: today's operating expenses */}
      {data && data.operatingExpenses.length > 0 && (
        <Section title="Bugungi chiqimlar — batafsil" description="Operatsion xarajatlarning to'liq ro'yxati">
          <DataTable
            columns={opExpenseColumns}
            data={data.operatingExpenses}
            isLoading={isLoading}
            rowKey={(row) => row.id}
          />
        </Section>
      )}

      {/* Drill-down: today's ingredient purchases (collapsible) */}
      {data && data.ingredientPurchases.length > 0 && (
        <CollapsibleSection
          title="Bugungi xaridlar — batafsil"
          description="Ombor uchun olingan mahsulotlar"
          badge={`${data.ingredientPurchases.length} ta`}
          defaultOpen={false}
        >
          <DataTable
            columns={purchaseColumns}
            data={data.ingredientPurchases}
            isLoading={isLoading}
            rowKey={(row) => row.id}
          />
        </CollapsibleSection>
      )}

      {/* Pul oqimi (cash drawer) — secondary view, kept for cash reconciliation.
          Math: data.outflow.expensesNet ALREADY includes ingredient-purchase
          expense rows (since record-purchase auto-creates an Expense). So if we
          showed "Xaridlar + Operatsion = Jami" using expensesNet, the xaridlar
          would be double-counted. Split it instead:
            opsXaridsiz = expensesNet − purchasesTotal
          and totalOut == expensesNet keeps the drawer identity intact. */}
      {data && (() => {
        const expensesNet = Number(data.outflow.expensesNet);
        const purchasesTotal = Number(data.outflow.purchasesTotal);
        const opExclPurchases = Math.max(0, expensesNet - purchasesTotal);
        const totalIn = Number(data.cashflow.totalIn);
        const totalOut = Number(data.outflow.totalOut);
        const drawer = Number(data.drawer.movement);
        const drawerTone = drawer > 0 ? 'text-success' : drawer < 0 ? 'text-destructive' : '';
        return (
          <Section title="Pul oqimi (kassa)" description="Bugun kassaga tushgan va chiqqan haqiqiy pul (P&L emas, naqd pul harakati)">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Kirim */}
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Kirim</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Naqd (savdo)</span>
                    <span className="tabular-nums">{fmtUzs(data.cashflow.cashIn)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Karta (savdo)</span>
                    <span className="tabular-nums">{fmtUzs(data.cashflow.cardIn)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Qarz qaytimi</span>
                    <span className="tabular-nums">{fmtUzs(Number(data.cashflow.debtRepaidCash) + Number(data.cashflow.debtRepaidCard))}</span>
                  </div>
                  {Number(data.cashflow.expenseReturns) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Avans qaytimi</span>
                      <span className="tabular-nums">{fmtUzs(data.cashflow.expenseReturns)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
                  <span>Jami kirim</span>
                  <span className="tabular-nums text-success">+{fmtUzs(totalIn)}</span>
                </div>
              </div>

              {/* Chiqim */}
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Chiqim</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Xaridlar</span>
                    <span className="tabular-nums">{fmtUzs(purchasesTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Operatsion</span>
                    <span className="tabular-nums">{fmtUzs(opExclPurchases)}</span>
                  </div>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
                  <span>Jami chiqim</span>
                  <span className="tabular-nums text-destructive">−{fmtUzs(totalOut)}</span>
                </div>
              </div>

              {/* Kassa o'zgarishi — full-height centered, fixed via flex container */}
              <div className="flex flex-col">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Kassa o'zgarishi</div>
                <div className="flex-1 flex items-center justify-center py-4">
                  <div className="text-center">
                    <div className={cn('text-3xl font-bold tabular-nums', drawerTone)}>
                      {drawer >= 0 ? '+' : ''}{fmtUzs(drawer)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {drawer > 0 ? "Kassa o'sdi" : drawer < 0 ? 'Kassa kamaydi' : "O'zgarmadi"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        );
      })()}
    </PageContent>
  );
}
