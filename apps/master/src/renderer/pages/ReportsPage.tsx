import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, FileDown, RefreshCw, ChevronDown } from 'lucide-react';
import { DailyReport, MonthlyReport, reportsApi } from '../api/reports';
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
import { formatMoney } from '@/lib/format';
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

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function localMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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
  onSelectDay: (day: DailyReport) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <StatTile
          label="Umumiy tushum"
          value={formatMoney(report.totals.realCashIn)}
          hint="Real kassa kirimi"
          icon={ArrowDownToLine}
        />
        <StatTile
          label="Sof savdo"
          value={formatMoney(report.totals.netSales)}
          hint="Chegirmadan keyin"
          icon={ShoppingBag}
        />
        <StatTile
          label="Xizmat haqi"
          value={formatMoney(report.totals.serviceCharge)}
          hint="Ofitsiantlarga jami"
          icon={Sparkles}
          tone={Number(report.totals.serviceCharge) > 0 ? 'good' : 'neutral'}
        />
        <StatTile
          label="Umumiy xarajat"
          value={formatMoney(report.totals.expensesNet)}
          hint="Netto chiqim"
          icon={ArrowUpFromLine}
          tone="warning"
        />
        <StatTile
          label="Sof foyda"
          value={formatMoney(report.totals.salesBasedProfit)}
          hint="Savdo asosida"
          icon={TrendingUp}
          tone={Number(report.totals.salesBasedProfit) >= 0 ? 'good' : 'danger'}
        />
        <StatTile
          label="Nasiya qoldig'i"
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
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');
  const [date, setDate] = useState(localDateString);
  const [month, setMonth] = useState(localMonthString);
  const [selectedDay, setSelectedDay] = useState<DailyReport | null>(null);
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

  const isForbidden =
    (dailyQuery.error as { code?: string } | null)?.code === 'FORBIDDEN' ||
    (monthlyQuery.error as { code?: string } | null)?.code === 'FORBIDDEN' ||
    (dailyQuery.error as Error | null)?.message === 'Forbidden' ||
    (monthlyQuery.error as Error | null)?.message === 'Forbidden';

  if (isForbidden) {
    return <ForbiddenMessage />;
  }

  const isLoading = tab === 'daily' ? dailyQuery.isLoading : monthlyQuery.isLoading;
  const isFetching = tab === 'daily' ? dailyQuery.isFetching : monthlyQuery.isFetching;
  const error = tab === 'daily' ? dailyQuery.error : monthlyQuery.error;

  const printSubtitle = tab === 'daily'
    ? `Kunlik moliyaviy hisobot — ${formatDateLabel(date)}`
    : `Oylik moliyaviy hisobot — ${formatMonthLabel(month)}`;

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
        title={tab === 'daily' ? 'Kunlik moliyaviy hisobot' : 'Oylik moliyaviy hisobot'}
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
            ) : (
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
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => (tab === 'daily' ? dailyQuery.refetch() : monthlyQuery.refetch())}
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
        <Tabs value={tab} onValueChange={(value) => setTab(value as 'daily' | 'monthly')}>
          <TabsList>
            <TabsTrigger value="daily">Kunlik</TabsTrigger>
            <TabsTrigger value="monthly">Oylik</TabsTrigger>
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
        <MonthlyView report={monthlyQuery.data} onSelectDay={setSelectedDay} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <EmptyState title="Hisobot mavjud emas" hint="Tanlangan davr uchun ma'lumot topilmadi." />
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedDay} onOpenChange={(open) => { if (!open) setSelectedDay(null); }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? `${formatDateLabel(selectedDay.date)} — kunlik hisobot` : ''}
            </DialogTitle>
          </DialogHeader>
          {selectedDay ? <DailyReportSections report={selectedDay} /> : null}
        </DialogContent>
      </Dialog>
    </PageContent>
  );
}
