import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Printer,
  FileDown,
  RefreshCw,
  ChevronDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  HandCoins,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { DailyReport, MonthlyDayRow, MonthlyReport, SummaryReport, reportsApi } from '@/api/reports';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Field, FieldLabel, Row, RowHeader, RowMoney, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { PnlSummaryTiles } from '@/components/reports/PnlSummaryTiles';
import { formatMoney, tashkentDayKey, tashkentMonthKey } from '@/lib/format';
import { printCurrentView, saveDailyReportPdf, saveFinancePdf } from '@/lib/save-pdf';
import { cn } from '@/lib/utils';

const UZBEK_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
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

type SummaryPresetKey = 'today' | 'yesterday' | 'this-week' | 'this-month';

/** Tashkent-anchored range presets — same TZ-safe pattern as `tashkentDayKey`
 * and `MonthlyTable`'s weekday math (UTC-midnight instant, formatted in
 * Asia/Tashkent), so a preset picked here lands on the same calendar day the
 * backend buckets it under regardless of host TZ. */
function tashkentPreset(key: SummaryPresetKey): { from: string; to: string } {
  const todayKey = tashkentDayKey();
  if (key === 'today') return { from: todayKey, to: todayKey };
  if (key === 'yesterday') {
    const y = tashkentDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    return { from: y, to: y };
  }
  if (key === 'this-month') return { from: `${tashkentMonthKey()}-01`, to: todayKey };
  // this-week: Monday-start, computed off a UTC-midnight instant of "today".
  const [y, m, d] = todayKey.split('-').map(Number);
  const utcToday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const dow = utcToday.getUTCDay(); // 0=Sun
  const monday = new Date(utcToday);
  monday.setUTCDate(utcToday.getUTCDate() - ((dow + 6) % 7));
  return { from: tashkentDayKey(monday), to: todayKey };
}

const SUMMARY_PRESETS: Array<{ key: SummaryPresetKey; label: string }> = [
  { key: 'today', label: 'Bugun' },
  { key: 'yesterday', label: 'Kecha' },
  { key: 'this-week', label: 'Shu hafta' },
  { key: 'this-month', label: 'Shu oy' },
];

const TABS: Array<{ key: 'daily' | 'monthly' | 'summary'; label: string }> = [
  { key: 'daily', label: 'Kunlik' },
  { key: 'monthly', label: 'Oylik' },
  { key: 'summary', label: 'Umumiy' },
];

/** A print-only block at the top of the rendered page — shows in PDF / Ctrl+P, hidden on screen. */
function PrintHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="print-only mb-4 border-b pb-3">
      <div className="text-xl font-bold">Chayxana — {title}</div>
      <div className="text-sm text-muted-foreground">{subtitle}</div>
    </div>
  );
}

/** Centered status text — loading / error / empty / forbidden. Not a data figure, so it's exempt from the tabular-money floor. */
function ReportMessage({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-pad py-16 text-center">
      <div className="text-[15px] font-semibold">{title}</div>
      {hint ? <div className="max-w-md text-[13px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** Collapsible detail table — closed on screen, force-open in print via the
 * `data-print-expand` rule in styles.css. Rebuilt on Blocks C1 tokens; the
 * print contract (`no-print` on the summary, `data-print-expand` on the
 * element) is unchanged. */
function Collapsible({ title, count, children }: { title: string; count: string; children: ReactNode }) {
  return (
    <details data-print-expand className="group">
      <summary className="no-print flex h-row [list-style:none] cursor-pointer items-center justify-between gap-2 bg-field-raised px-pad press-block focus-block [&::-webkit-details-marker]:hidden">
        <span className="text-[14.5px] font-semibold">{title}</span>
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="tabular-nums">{count}</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2} />
        </span>
      </summary>
      <div className="bg-field p-pad">{children}</div>
    </details>
  );
}

/**
 * One day's report — the summary tiles lead, the existing sections (reused
 * as-is from `components/reports/`) prove them underneath. Used both for the
 * Kunlik tab and the monthly drill-down dialog, exactly as before.
 */
function DailyView({ report }: { report: DailyReport }) {
  const pnl = report.ledger.pnl;
  return (
    <div className="flex flex-col gap-pad p-pad">
      <PnlSummaryTiles
        revenue={pnl.revenue}
        cogs={pnl.cogs}
        operatingExpense={pnl.operatingExpense}
        profit={pnl.profit}
      />

      <div className="flex flex-col gap-4">
        <ResultsSection report={report} />
        <SalesSummary report={report} />
        <CashflowSection report={report} />
        <ExpensesSection report={report} />
        <DebtSection report={report} />

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
          count={`${report.cancellations.length} ta hodisa`}
        >
          <IncidentsSection report={report} />
        </Collapsible>

        {/* Always visible — this is the page everyone looks at, now also led
            by the tiles above. Print-keep so it doesn't split across page
            boundaries when rendering as PDF. */}
        <div data-print-keep>
          <GrandSummarySection report={report} />
        </div>
      </div>
    </div>
  );
}

function MonthlyReportView({
  report,
  onSelectDay,
}: {
  report: MonthlyReport;
  onSelectDay: (day: MonthlyDayRow) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-pad">
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
          hint={`${report.totals.canceledOrders} bekor`}
          icon={ShoppingBag}
        />
      </div>

      <MonthlyTable report={report} onSelectDay={onSelectDay} />
    </div>
  );
}

const CATEGORY_COLUMNS = '1fr 90px 160px 160px 160px';

function IncomesByCategory({ report }: { report: SummaryReport }) {
  return (
    <Seam className="content-start">
      <div className="bg-field-raised px-pad py-2.5">
        <FieldLabel>Kirimlar — kategoriyalar bo'yicha</FieldLabel>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Menyu kategoriyalari bo'yicha sotuv</p>
      </div>

      {report.incomes.byMenuCategory.length === 0 ? (
        <div className="bg-field px-pad py-8 text-center text-[14px] text-muted-foreground">
          Tanlangan davrda sotuv yo'q
        </div>
      ) : (
        <>
          <RowHeader columns={CATEGORY_COLUMNS}>
            <span>Kategoriya</span>
            <span className="text-right">Soni</span>
            <span className="text-right">Sotuv</span>
            <span className="text-right">Tan narxi</span>
            <span className="text-right">Yalpi foyda</span>
          </RowHeader>
          {report.incomes.byMenuCategory.map((row) => {
            const p = Number(row.profit);
            return (
              <Row key={row.categoryId} columns={CATEGORY_COLUMNS}>
                <span className="min-w-0 truncate font-semibold">{row.categoryName}</span>
                <span className="text-right text-[14px] tabular-nums">{row.qty}</span>
                <RowMoney>{formatMoney(row.revenue)}</RowMoney>
                <RowMoney className="text-muted-foreground">{formatMoney(row.cogs)}</RowMoney>
                <RowMoney className={cn(p > 0 && 'text-success', p < 0 && 'text-destructive')}>
                  {formatMoney(row.profit)}
                </RowMoney>
              </Row>
            );
          })}
          <Row inert columns={CATEGORY_COLUMNS}>
            <span className="font-semibold uppercase tracking-[0.05em]">Jami</span>
            <span className="text-right text-[14px] tabular-nums">{report.incomes.totals.qty}</span>
            <RowMoney>{formatMoney(report.incomes.totals.revenue)}</RowMoney>
            <RowMoney>{formatMoney(report.incomes.totals.cogs)}</RowMoney>
            <RowMoney>
              {formatMoney(String(Number(report.incomes.totals.revenue) - Number(report.incomes.totals.cogs)))}
            </RowMoney>
          </Row>
        </>
      )}

      {(Number(report.incomes.other.debtRepaid) > 0 || Number(report.incomes.other.expenseReturns) > 0) && (
        <Field>
          <FieldLabel>Boshqa kirimlar</FieldLabel>
          <div className="mt-2 flex flex-col gap-1.5">
            {Number(report.incomes.other.debtRepaid) > 0 && (
              <div className="flex items-baseline justify-between text-[14px]">
                <span className="text-muted-foreground">Qarz qaytimi</span>
                <span className="font-semibold tabular-nums">{formatMoney(report.incomes.other.debtRepaid)}</span>
              </div>
            )}
            {Number(report.incomes.other.expenseReturns) > 0 && (
              <div className="flex items-baseline justify-between text-[14px]">
                <span className="text-muted-foreground">Chiqim qaytimi (avans va h.k.)</span>
                <span className="font-semibold tabular-nums">{formatMoney(report.incomes.other.expenseReturns)}</span>
              </div>
            )}
          </div>
        </Field>
      )}
    </Seam>
  );
}

function PnlBreakdownCard({ report }: { report: SummaryReport }) {
  const profit = Number(report.pnl.profit);
  return (
    <Seam className="content-start">
      <div className="bg-field-raised px-pad py-2.5">
        <FieldLabel>Sof foyda</FieldLabel>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Sotuv − sotilgan ovqat tan narxi − chiqim</p>
      </div>
      <Field className="flex flex-col gap-4">
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Chiqimlar — kategoriyalar bo'yicha
          </div>
          {report.pnl.expensesByCategory.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">Operatsion chiqim yo'q</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {report.pnl.expensesByCategory.map((row) => (
                <div key={row.categoryId} className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px]">{row.categoryName}</span>
                  <span className="text-[15px] font-semibold tabular-nums">{formatMoney(row.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[14px]">
            <span>Sotuv</span>
            <span className="tabular-nums text-success">+{formatMoney(report.pnl.grossRevenue)}</span>
          </div>
          {Number(report.pnl.discount) > 0 && (
            <div className="flex items-baseline justify-between text-[14px]">
              <span>Chegirma</span>
              <span className="tabular-nums text-destructive">−{formatMoney(report.pnl.discount)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between text-[14px]">
            <span>Tan narxi</span>
            <span className="tabular-nums text-destructive">−{formatMoney(report.pnl.cogs)}</span>
          </div>
          <div className="flex items-baseline justify-between text-[14px]">
            <span>Chiqim</span>
            <span className="tabular-nums text-destructive">−{formatMoney(report.pnl.operatingExpense)}</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between bg-field-raised px-3 py-2.5 text-[17px] font-bold">
          <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Sof foyda</span>
          <span className={cn('tabular-nums', profit > 0 && 'text-success', profit < 0 && 'text-destructive')}>
            {formatMoney(report.pnl.profit)}
          </span>
        </div>
      </Field>
    </Seam>
  );
}

function CashBreakdownCard({ report }: { report: SummaryReport }) {
  const cashFarq = Number(report.cash.farq);
  return (
    <Seam className="content-start">
      <div className="bg-field-raised px-pad py-2.5">
        <FieldLabel>Pul harakati</FieldLabel>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Haqiqatda kassaga kelgan/ketgan pul</p>
      </div>
      <Field className="flex flex-col gap-4">
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Kategoriyalar bo'yicha chiqimlar (xaridlar bilan)
          </div>
          {report.cash.expensesByCategory.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">Chiqim yo'q</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {report.cash.expensesByCategory.map((row) => (
                <div key={row.categoryId} className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px]">{row.categoryName}</span>
                  <span className="text-[15px] font-semibold tabular-nums">{formatMoney(row.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[14px]">
            <span>Sotuv (naqd va karta)</span>
            <span className="tabular-nums text-success">+{formatMoney(report.cash.salesInflow)}</span>
          </div>
          {Number(report.cash.debtRepaid) > 0 && (
            <div className="flex items-baseline justify-between text-[14px]">
              <span>Qarz qaytimi</span>
              <span className="tabular-nums text-success">+{formatMoney(report.cash.debtRepaid)}</span>
            </div>
          )}
          {Number(report.cash.expenseReturns) > 0 && (
            <div className="flex items-baseline justify-between text-[14px]">
              <span>Chiqim qaytimi</span>
              <span className="tabular-nums text-success">+{formatMoney(report.cash.expenseReturns)}</span>
            </div>
          )}
        </div>

        <div className="flex items-baseline justify-between bg-field-raised px-3 py-2 text-[15px] font-semibold">
          <span>Jami kelgan</span>
          <span className="tabular-nums text-success">{formatMoney(report.cash.totalIn)}</span>
        </div>

        <div className="flex items-baseline justify-between text-[14px]">
          <span>Jami ketgan</span>
          <span className="tabular-nums text-destructive">−{formatMoney(report.cash.totalOut)}</span>
        </div>

        <div className="flex items-baseline justify-between bg-field-raised px-3 py-2.5 text-[17px] font-bold">
          <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">Farq</span>
          <span className={cn('tabular-nums', cashFarq > 0 && 'text-success', cashFarq < 0 && 'text-destructive')}>
            {formatMoney(report.cash.farq)}
          </span>
        </div>
      </Field>
    </Seam>
  );
}

function SummaryReportView({ report }: { report: SummaryReport }) {
  return (
    <div className="flex flex-col gap-pad p-pad">
      <PnlSummaryTiles
        revenue={report.pnl.revenue}
        cogs={report.pnl.cogs}
        operatingExpense={report.pnl.operatingExpense}
        profit={report.pnl.profit}
      />

      <IncomesByCategory report={report} />

      <div className="grid grid-cols-1 gap-pad xl:grid-cols-2">
        <PnlBreakdownCard report={report} />
        <CashBreakdownCard report={report} />
      </div>
    </div>
  );
}

export function ReportsPage() {
  usePageTitle('Moliyaviy hisobot');
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

  const onRefetch = () => {
    if (tab === 'daily') dailyQuery.refetch();
    else if (tab === 'monthly') monthlyQuery.refetch();
    else summaryQuery.refetch();
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

  const todayKey = tashkentDayKey();
  const yesterdayKey = tashkentPreset('yesterday').from;

  return (
    <Screen
      title="Moliyaviy hisobot"
      status={
        <div className="no-print flex flex-wrap items-center justify-end gap-seam">
          <div className="flex gap-seam">
            {TABS.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={tab === t.key ? 'default' : 'secondary'}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {tab === 'daily' ? (
            <div className="flex items-center gap-seam">
              <Button size="sm" variant={date === todayKey ? 'default' : 'secondary'} onClick={() => setDate(todayKey)}>
                Bugun
              </Button>
              <Button
                size="sm"
                variant={date === yesterdayKey ? 'default' : 'secondary'}
                onClick={() => setDate(yesterdayKey)}
              >
                Kecha
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-[168px]"
                aria-label="Sana"
              />
            </div>
          ) : tab === 'monthly' ? (
            <div className="flex items-center gap-seam">
              <Input
                type="number"
                min={2020}
                max={2100}
                value={selectedYear}
                onChange={(e) => {
                  const nextYear = e.target.value || selectedYear;
                  setMonth(`${nextYear}-${selectedMonthPart}`);
                }}
                className="w-[92px]"
                numeric
                aria-label="Yil"
              />
              <select
                value={selectedMonthPart}
                onChange={(e) => setMonth(`${selectedYear}-${e.target.value}`)}
                className="h-control bg-field px-3 text-[15px] text-foreground focus-block"
                aria-label="Oy"
              >
                {UZBEK_MONTHS.map((label, index) => {
                  const value = String(index + 1).padStart(2, '0');
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            <div className="flex flex-wrap gap-seam">
              {SUMMARY_PRESETS.map((p) => {
                const preset = tashkentPreset(p.key);
                const active = preset.from === summaryFrom && preset.to === summaryTo;
                return (
                  <Button
                    key={p.key}
                    size="sm"
                    variant={active ? 'default' : 'secondary'}
                    onClick={() => {
                      setSummaryFrom(preset.from);
                      setSummaryTo(preset.to);
                    }}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
          )}

          <Button size="sm" variant="secondary" onClick={onRefetch} disabled={isFetching} title="Yangilash">
            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
          </Button>
          <Button size="sm" variant="secondary" onClick={onPrint} title="Chop etish">
            <Printer />
          </Button>
          <Button size="sm" onClick={onSavePdf} title="PDF saqlash">
            <FileDown />
            PDF
          </Button>
        </div>
      }
    >
      <PrintHeader
        title={
          tab === 'daily' ? 'Kunlik moliyaviy hisobot'
          : tab === 'monthly' ? 'Oylik moliyaviy hisobot'
          : 'Umumiy moliyaviy hisobot'
        }
        subtitle={printSubtitle}
      />

      {isForbidden ? (
        <ReportMessage title="Ruxsat yo'q" hint="Faqat egasi (Owner) bu sahifani ko'ra oladi." />
      ) : isLoading ? (
        <ReportMessage title="Yuklanmoqda…" />
      ) : error ? (
        <ReportMessage
          title="Hisobotni yuklab bo'lmadi"
          hint={(error as Error)?.message ?? "Iltimos, qayta urinib ko'ring."}
        />
      ) : tab === 'daily' && dailyQuery.data ? (
        <DailyView report={dailyQuery.data} />
      ) : tab === 'monthly' && monthlyQuery.data ? (
        <MonthlyReportView report={monthlyQuery.data} onSelectDay={(row) => setSelectedDayDate(row.date)} />
      ) : tab === 'summary' && summaryQuery.data ? (
        <SummaryReportView report={summaryQuery.data} />
      ) : (
        <ReportMessage title="Hisobot mavjud emas" hint="Tanlangan davr uchun ma'lumot topilmadi." />
      )}

      <Dialog open={!!selectedDayDate} onOpenChange={(open) => { if (!open) setSelectedDayDate(null); }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDayDate ? `${formatDateLabel(selectedDayDate)} — kunlik hisobot` : ''}
            </DialogTitle>
          </DialogHeader>
          {selectedDayQuery.data
            ? <DailyView report={selectedDayQuery.data} />
            : selectedDayQuery.isLoading
              ? <div className="py-8 text-center text-[14px] text-muted-foreground">Yuklanmoqda…</div>
              : null}
        </DialogContent>
      </Dialog>
    </Screen>
  );
}
