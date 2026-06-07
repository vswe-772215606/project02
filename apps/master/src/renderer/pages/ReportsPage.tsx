import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, FileDown, RefreshCw, ChevronDown } from 'lucide-react';
import { DailyReport, MonthlyDayRow, MonthlyReport, SummaryReport, reportsApi } from '../api/reports';
import { ForbiddenMessage } from '../components/ForbiddenMessage';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SalesSummary } from '@/components/reports/SalesSummary';
import { CashflowSection } from '@/components/reports/CashflowSection';
import { ResultsSection } from '@/components/reports/ResultsSection';
import { ExpensesSection } from '@/components/reports/ExpensesSection';
import { DebtSection } from '@/components/reports/DebtSection';
import { OrdersSection } from '@/components/reports/OrdersSection';
import { PerWaiterSection } from '@/components/reports/PerWaiterSection';
import { MealSalesSection } from '@/components/reports/MealSalesSection';
import { IncidentsSection } from '@/components/reports/IncidentsSection';
import { GrandSummarySection } from '@/components/reports/GrandSummarySection';
import { MonthlyTable } from '@/components/reports/MonthlyTable';
import { StatTile } from '@/components/reports/report-helpers';
import { formatMoney, tashkentDayKey, tashkentMonthKey } from '@/lib/format';
import { printCurrentView, saveDailyReportPdf, saveFinancePdf } from '@/lib/save-pdf';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  HandCoins,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

const UZBEK_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

// Default date pickers are anchored to Tashkent so they match the backend's
// bucketing and the user's wall clock regardless of the host TZ.
const localDateString = tashkentDayKey;
const localMonthString = tashkentMonthKey;

function formatMonthLabel(month: string) {
  const parts = month.split('-');
  const year = parts[0] ?? '';
  const monthPart = parts[1] ?? '';
  const index = Number(monthPart) - 1;
  return `${UZBEK_MONTHS[index] ?? monthPart} ${year}`;
}

function formatDateLabel(dateStr: string) {
  const parts = dateStr.split('-');
  const year = parts[0] ?? '';
  const monthPart = parts[1] ?? '';
  const day = parts[2] ?? '';
  return `${Number(day)} ${UZBEK_MONTHS[Number(monthPart) - 1] ?? monthPart} ${year}`;
}

/** A print-only block at the top of the rendered page — shows in PDF / Ctrl+P, hidden on screen. */
function PrintHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="print-only mb-4 border-b pb-3">
      <div className="text-xl font-bold">Chayxana — {title}</div>
      <div className="text-sm text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function DailyReportSections({ report }: { report: DailyReport }) {
  return (
    <div className="space-y-6">
      <ResultsSection report={report} />
      <SalesSummary report={report} />
      <CashflowSection report={report} />
      <ExpensesSection report={report} />
      <DebtSection report={report} />

      {/* Collapsible detail tables — closed on screen, force-open in print via @media print rule */}
      <Collapsible title="Buyurtmalar reestri" count={`${report.ordersTable.length} ta yozuv`}>
        <OrdersSection report={report} />
      </Collapsible>

      <Collapsible title="Ofitsiantlar bo'yicha" count={`${report.perWaiter.length} ta ofitsiant`}>
        <PerWaiterSection report={report} />
      </Collapsible>

      <Collapsible title="Taomlar bo'yicha sotuv" count={`${report.mealSales.length} ta taom`}>
        <MealSalesSection report={report} />
      </Collapsible>

      <Collapsible
        title="Bekor / To'lamay ketgan"
        count={`${report.cancellations.length + report.walkouts.length} ta hodisa`}
      >
        <IncidentsSection report={report} />
      </Collapsible>

      {/* Always visible — this is the page everyone looks at. Print-keep so
          it doesn't get split across page boundaries when rendering as PDF. */}
      <div data-print-keep>
        <GrandSummarySection report={report} />
      </div>
    </div>
  );
}

function Collapsible({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <details data-print-expand className="group rounded-lg border bg-card">
      <summary className="no-print cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors">
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{count}</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} />
        </span>
      </summary>
      <div className="px-4 pb-4 pt-2 border-t">{children}</div>
    </details>
  );
}

function DailyLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6 space-y-3">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-12 w-48" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-1">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-32 mb-1" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MonthlyView({
  report,
  onSelectDay,
}: {
  report: MonthlyReport;
  onSelectDay: (day: MonthlyDayRow) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <StatTile
          label="Kelgan pul"
          value={formatMoney(report.totals.realCashIn)}
          hint="Kassaga jami"
          icon={ArrowDownToLine}
        />
        <StatTile
          label="Sof sotuv"
          value={formatMoney(report.totals.netSales)}
          hint="Chegirmadan keyin"
          icon={ShoppingBag}
        />
        <StatTile
          label="Xizmat haqi"
          value={formatMoney(report.totals.serviceCharge)}
          hint="Ofitsiantlarga"
          icon={Sparkles}
          tone={Number(report.totals.serviceCharge) > 0 ? 'good' : 'neutral'}
        />
        <StatTile
          label="Jami chiqim"
          value={formatMoney(report.totals.expensesNet)}
          icon={ArrowUpFromLine}
          tone="warning"
        />
        <StatTile
          label="Sof foyda"
          value={formatMoney(report.totals.salesBasedProfit)}
          hint="Sotuv − tan narxi − chiqim"
          icon={TrendingUp}
          tone={Number(report.totals.salesBasedProfit) >= 0 ? 'good' : 'danger'}
        />
        <StatTile
          label="Qarz qoldig'i"
          value={formatMoney(report.totals.outstandingDebtEndOfMonth)}
          hint="Oy oxiriga"
          icon={HandCoins}
          tone={Number(report.totals.outstandingDebtEndOfMonth) > 0 ? 'danger' : 'good'}
        />
        <StatTile
          label="Buyurtmalar"
          value={`${report.totals.closedOrders} ta`}
          hint={`${report.totals.canceledOrders} bekor · ${report.totals.walkoutOrders} to'lamagan`}
          icon={ShoppingBag}
        />
      </div>

      <MonthlyTable report={report} onSelectDay={onSelectDay} />
    </div>
  );
}

export function ReportsPage() {
  usePageTitle('Hisobotlar');
  const [tab, setTab] = useState<'daily' | 'monthly' | 'summary'>('daily');
  const [date, setDate] = useState(localDateString);
  const [month, setMonth] = useState(localMonthString);
  // Summary tab: default to first-of-month → today, all in Tashkent.
  const [summaryFrom, setSummaryFrom] = useState(() => `${tashkentMonthKey()}-01`);
  const [summaryTo, setSummaryTo] = useState(localDateString);
  // Monthly drill-down: user clicks a day row → fetch the FULL daily report
  // for that date (the per-day rows in MonthlyReport are intentionally slim).
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const selectedYear = month.slice(0, 4);
  const selectedMonthPart = month.slice(5, 7);

  const dailyQuery = useQuery({
    queryKey: ['reports', 'daily', date],
    queryFn: () => reportsApi.getDaily(date),
    enabled: tab === 'daily',
    retry: false,
  });

  const monthlyQuery = useQuery({
    queryKey: ['reports', 'monthly', month],
    queryFn: () => reportsApi.getMonthly(month),
    enabled: tab === 'monthly',
    retry: false,
  });

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', summaryFrom, summaryTo],
    queryFn: () => reportsApi.getSummary(summaryFrom, summaryTo),
    enabled: tab === 'summary',
    retry: false,
  });

  // Drill-down query — fires only when the user picks a monthly day row.
  const selectedDayQuery = useQuery({
    queryKey: ['reports', 'daily', selectedDayDate],
    queryFn: () => reportsApi.getDaily(selectedDayDate!),
    enabled: !!selectedDayDate,
    retry: false,
  });

  const isForbidden =
    (dailyQuery.error as { code?: string } | null)?.code === 'FORBIDDEN' ||
    (monthlyQuery.error as { code?: string } | null)?.code === 'FORBIDDEN' ||
    (summaryQuery.error as { code?: string } | null)?.code === 'FORBIDDEN' ||
    (dailyQuery.error as Error | null)?.message === 'Forbidden' ||
    (monthlyQuery.error as Error | null)?.message === 'Forbidden' ||
    (summaryQuery.error as Error | null)?.message === 'Forbidden';

  if (isForbidden) {
    return <ForbiddenMessage />;
  }

  const isLoading = tab === 'daily' ? dailyQuery.isLoading
    : tab === 'monthly' ? monthlyQuery.isLoading
    : summaryQuery.isLoading;
  const isFetching = tab === 'daily' ? dailyQuery.isFetching
    : tab === 'monthly' ? monthlyQuery.isFetching
    : summaryQuery.isFetching;
  const error = tab === 'daily' ? dailyQuery.error
    : tab === 'monthly' ? monthlyQuery.error
    : summaryQuery.error;

  const printSubtitle = tab === 'daily'
    ? `Kunlik moliyaviy hisobot — ${formatDateLabel(date)}`
    : tab === 'monthly'
      ? `Oylik moliyaviy hisobot — ${formatMonthLabel(month)}`
      : `Umumiy moliyaviy hisobot — ${formatDateLabel(summaryFrom)} … ${formatDateLabel(summaryTo)}`;

  const onPrint = () => {
    printCurrentView();
  };

  const onSavePdf = async () => {
    if (tab === 'daily') {
      // Server-side composed PDF — multi-page, paginated, all sections.
      const res = await saveDailyReportPdf({
        date,
        defaultName: `chayxana-moliyaviy-${date}.pdf`,
        title: 'Kunlik hisobotni saqlash',
      });
      if (!res.saved && !res.canceled && res.error) {
        // Show the actual failure so the user can report it rather than just
        // seeing the OS "failed to load" dialog on a corrupt/empty file.
        // eslint-disable-next-line no-alert
        window.alert(`PDF saqlashda xatolik:\n\n${res.error}`);
      }
      return;
    }
    // Monthly report still uses DOM-capture for now.
    await saveFinancePdf({
      defaultName: `chayxana-moliyaviy-${month}.pdf`,
      title: 'Oylik hisobotni saqlash',
    });
  };

  return (
    <PageContent>
      <PrintHeader
        title={
          tab === 'daily' ? 'Kunlik moliyaviy hisobot'
          : tab === 'monthly' ? 'Oylik moliyaviy hisobot'
          : "Umumiy moliyaviy hisobot"
        }
        subtitle={printSubtitle}
      />

      <PageHeader
        title="Moliyaviy hisobot"
        description="Owner uchun kunlik va oylik P&L: tushum, chiqim, foyda, nasiya."
        actions={
          <div className="flex items-center gap-2 no-print">
            {tab === 'daily' ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="report-date" className="text-xs text-muted-foreground">Sana:</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-44 h-9"
                />
              </div>
            ) : tab === 'monthly' ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Davr:</Label>
                <Input
                  type="number"
                  min={2020}
                  max={2100}
                  value={selectedYear}
                  onChange={(e) => {
                    const nextYear = e.target.value || selectedYear;
                    setMonth(`${nextYear}-${selectedMonthPart}`);
                  }}
                  className="w-24 h-9 tabular-nums"
                />
                <Select
                  value={selectedMonthPart}
                  onValueChange={(value) => setMonth(`${selectedYear}-${value}`)}
                >
                  <SelectTrigger className="h-9 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UZBEK_MONTHS.map((label, index) => {
                      const value = String(index + 1).padStart(2, '0');
                      return (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Label htmlFor="report-from" className="text-xs text-muted-foreground">Davr:</Label>
                <Input
                  id="report-from"
                  type="date"
                  value={summaryFrom}
                  onChange={(e) => setSummaryFrom(e.target.value)}
                  className="w-40 h-9"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  id="report-to"
                  type="date"
                  value={summaryTo}
                  onChange={(e) => setSummaryTo(e.target.value)}
                  className="w-40 h-9"
                />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => (
                tab === 'daily' ? dailyQuery.refetch()
                : tab === 'monthly' ? monthlyQuery.refetch()
                : summaryQuery.refetch()
              )}
              disabled={isFetching}
              title="Yangilash"
            >
              <RefreshCw className={isFetching ? 'animate-spin' : ''} />
              Yangilash
            </Button>
            <Button variant="outline" size="sm" onClick={onPrint} title="Chop etish">
              <Printer />
              Chop etish
            </Button>
            <Button variant="default" size="sm" onClick={onSavePdf} title="PDF saqlash">
              <FileDown />
              PDF saqlash
            </Button>
          </div>
        }
      />

      <div className="no-print">
        <Tabs value={tab} onValueChange={(value) => setTab(value as 'daily' | 'monthly' | 'summary')}>
          <TabsList>
            <TabsTrigger value="daily">Kunlik</TabsTrigger>
            <TabsTrigger value="monthly">Oylik</TabsTrigger>
            <TabsTrigger value="summary">Umumiy</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <DailyLoadingSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="Hisobotni yuklab bo'lmadi"
              hint={(error as Error)?.message ?? 'Iltimos, qayta urinib ko\'ring.'}
            />
          </CardContent>
        </Card>
      ) : tab === 'daily' && dailyQuery.data ? (
        <DailyReportSections report={dailyQuery.data} />
      ) : tab === 'monthly' && monthlyQuery.data ? (
        <MonthlyView
          report={monthlyQuery.data}
          onSelectDay={(row) => setSelectedDayDate(row.date)}
        />
      ) : tab === 'summary' && summaryQuery.data ? (
        <SummaryView report={summaryQuery.data} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <EmptyState title="Hisobot mavjud emas" hint="Tanlangan davr uchun ma'lumot topilmadi." />
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedDayDate} onOpenChange={(open) => { if (!open) setSelectedDayDate(null); }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDayDate ? `${formatDateLabel(selectedDayDate)} — kunlik hisobot` : ''}
            </DialogTitle>
          </DialogHeader>
          {selectedDayQuery.data
            ? <DailyReportSections report={selectedDayQuery.data} />
            : selectedDayQuery.isLoading
              ? <div className="py-8 text-center text-sm text-muted-foreground">Yuklanmoqda…</div>
              : null}
        </DialogContent>
      </Dialog>
    </PageContent>
  );
}

// ─── Summary (Umumiy) tab — date-range P&L + Cash basis side-by-side ──────
function SummaryView({ report }: { report: SummaryReport }) {
  const profit = Number(report.pnl.profit);
  const cashFarq = Number(report.cash.farq);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            Kirimlar — kategoriyalar bo'yicha
          </h3>
          <p className="text-xs text-muted-foreground">
            Menyu kategoriyalari bo'yicha sotuv
          </p>
        </CardHeader>
        <CardContent>
          {report.incomes.byMenuCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Tanlangan davrda sotuv yo'q
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left py-2 font-medium">Kategoriya</th>
                  <th className="text-right py-2 font-medium">Soni</th>
                  <th className="text-right py-2 font-medium">Sotuv (so'm)</th>
                  <th className="text-right py-2 font-medium">Tan narxi</th>
                  <th className="text-right py-2 font-medium" title="Sotuv − Tan narxi (operatsion chiqimga bo'lib o'tmagan)">
                    Yalpi foyda
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.incomes.byMenuCategory.map((row) => {
                  const p = Number(row.profit);
                  return (
                    <tr key={row.categoryId} className="border-b border-border/40">
                      <td className="py-2 font-medium">{row.categoryName}</td>
                      <td className="py-2 text-right tabular-nums">{row.qty}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(row.revenue)}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{formatMoney(row.cogs)}</td>
                      <td className={`py-2 text-right tabular-nums font-medium ${p > 0 ? 'text-success' : p < 0 ? 'text-destructive' : ''}`}>
                        {formatMoney(row.profit)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-border font-bold">
                  <td className="py-2 uppercase tracking-wide text-xs">Jami</td>
                  <td className="py-2 text-right tabular-nums">{report.incomes.totals.qty}</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(report.incomes.totals.revenue)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{formatMoney(report.incomes.totals.cogs)}</td>
                  <td className="py-2 text-right tabular-nums text-success">
                    {formatMoney(String(Number(report.incomes.totals.revenue) - Number(report.incomes.totals.cogs)))}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          {(Number(report.incomes.other.debtRepaid) > 0 || Number(report.incomes.other.expenseReturns) > 0) && (
            <div className="mt-3 pt-3 border-t border-dashed border-border space-y-1 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Boshqa kirimlar
              </div>
              {Number(report.incomes.other.debtRepaid) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Qarz qaytimi</span>
                  <span className="tabular-nums">{formatMoney(report.incomes.other.debtRepaid)}</span>
                </div>
              )}
              {Number(report.incomes.other.expenseReturns) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chiqim qaytimi (avans va h.k.)</span>
                  <span className="tabular-nums">{formatMoney(report.incomes.other.expenseReturns)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two side-by-side cards: P&L | Cash basis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold uppercase tracking-wide">Sof foyda</h3>
            <p className="text-xs text-muted-foreground">
              Sotuv − sotilgan ovqat tan narxi − chiqim
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Chiqimlar — kategoriyalar bo'yicha
              </div>
              {report.pnl.expensesByCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">Operatsion chiqim yo'q</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {report.pnl.expensesByCategory.map((row) => (
                      <tr key={row.categoryId} className="border-b border-border/40">
                        <td className="py-1.5">{row.categoryName}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatMoney(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="space-y-1 pt-3 border-t border-border">
              <div className="flex justify-between text-sm">
                <span>Sotuv</span>
                <span className="tabular-nums text-success">+{formatMoney(report.pnl.revenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tan narxi</span>
                <span className="tabular-nums text-destructive">−{formatMoney(report.pnl.cogs)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Chiqim</span>
                <span className="tabular-nums text-destructive">−{formatMoney(report.pnl.operatingExpense)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                <span className="uppercase tracking-wide">Sof foyda</span>
                <span className={`tabular-nums ${profit > 0 ? 'text-success' : profit < 0 ? 'text-destructive' : ''}`}>
                  {formatMoney(report.pnl.profit)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold uppercase tracking-wide">Pul harakati</h3>
            <p className="text-xs text-muted-foreground">
              Haqiqatda kassaga kelgan/ketgan pul
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Kategoriyalar bo'yicha chiqimlar (xaridlar bilan)
              </div>
              {report.cash.expensesByCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">Chiqim yo'q</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {report.cash.expensesByCategory.map((row) => (
                      <tr key={row.categoryId} className="border-b border-border/40">
                        <td className="py-1.5">{row.categoryName}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatMoney(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="space-y-1 pt-3 border-t border-border">
              <div className="flex justify-between text-sm">
                <span>Sotuv (naqd va karta)</span>
                <span className="tabular-nums text-success">+{formatMoney(report.cash.salesInflow)}</span>
              </div>
              {Number(report.cash.debtRepaid) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Qarz qaytimi</span>
                  <span className="tabular-nums text-success">+{formatMoney(report.cash.debtRepaid)}</span>
                </div>
              )}
              {Number(report.cash.expenseReturns) > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Chiqim qaytimi</span>
                  <span className="tabular-nums text-success">+{formatMoney(report.cash.expenseReturns)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold border-t border-border/40 pt-1">
                <span>Jami kelgan</span>
                <span className="tabular-nums text-success">{formatMoney(report.cash.totalIn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Jami ketgan</span>
                <span className="tabular-nums text-destructive">−{formatMoney(report.cash.totalOut)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                <span className="uppercase tracking-wide">Farq</span>
                <span className={`tabular-nums ${cashFarq > 0 ? 'text-success' : cashFarq < 0 ? 'text-destructive' : ''}`}>
                  {formatMoney(report.cash.farq)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
