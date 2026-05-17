import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { DailyReport, MonthlyReport, reportsApi } from '../api/reports';
import { ForbiddenMessage } from '../components/ForbiddenMessage';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DeprecationBanner } from '@/components/feedback/DeprecationBanner';
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
import { PerWaiterSection } from '@/components/reports/PerWaiterSection';
import { MealSalesSection } from '@/components/reports/MealSalesSection';
import { OrdersSection } from '@/components/reports/OrdersSection';
import { MonthlyCalendar } from '@/components/reports/MonthlyCalendar';
import { StatTile, sumMoney } from '@/components/reports/report-helpers';
import { formatMoney } from '@/lib/format';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  HandCoins,
  Receipt,
  ShoppingBag,
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

function DailyReportSections({ report }: { report: DailyReport }) {
  return (
    <div className="space-y-6">
      <SalesSummary report={report} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CashflowSection report={report} />
        <ResultsSection report={report} />
      </div>
      <ExpensesSection report={report} />
      <DebtSection report={report} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PerWaiterSection report={report} />
        <MealSalesSection report={report} />
      </div>
      <OrdersSection report={report} />
    </div>
  );
}

function DailyLoadingSkeleton() {
  return (
    <div className="space-y-6">
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
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
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-5 w-full" />
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
  const serviceChargeTotal = sumMoney(report.daily.map((d) => d.sales.serviceCharge));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Umumiy tushum"
          value={formatMoney(report.totals.realCashIn)}
          hint="Real kassa kirimi"
          icon={ArrowDownToLine}
        />
        <StatTile
          label="Umumiy xarajat"
          value={formatMoney(report.totals.expensesNet)}
          hint="Netto chiqim"
          icon={ArrowUpFromLine}
          tone="warning"
        />
        <StatTile
          label="Xizmat haqi"
          value={formatMoney(serviceChargeTotal)}
          hint="Ofitsiantlarga jami"
          icon={Receipt}
          tone="muted"
        />
        <StatTile
          label="Nasiya qoldig'i"
          value={formatMoney(report.totals.outstandingDebtEndOfMonth)}
          hint="Oy oxiriga"
          icon={HandCoins}
          tone={Number(report.totals.outstandingDebtEndOfMonth) > 0 ? 'danger' : 'good'}
        />
        <StatTile
          label="Sof foyda"
          value={formatMoney(report.totals.salesBasedProfit)}
          hint="Savdo asosida"
          icon={TrendingUp}
          tone={Number(report.totals.salesBasedProfit) >= 0 ? 'good' : 'danger'}
        />
        <StatTile
          label="Buyurtmalar"
          value={`${report.totals.closedOrders} ta`}
          hint={`${report.totals.canceledOrders} bekor · ${report.totals.walkoutOrders} to'lamagan`}
          icon={ShoppingBag}
        />
      </div>

      <MonthlyCalendar
        report={report}
        title={`${formatMonthLabel(report.month)} — kunlik taqvim`}
        description="Kunni bossangiz o'sha kunning to'liq hisoboti ochiladi."
        onSelectDay={onSelectDay}
      />
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

  return (
    <PageContent>
      <DeprecationBanner
        message="Bu hisobot sahifasi keyingi bosqichda yangi «Foyda paneli» bilan almashtiriladi."
        replacement="Mahsulot tannarxiga asoslangan haqiqiy foyda hisoboti REFACTOR_PLAN 4-bosqichida tayyor bo'ladi."
      />

      <PageHeader
        title="Hisobotlar"
        description="Owner uchun kunlik va oylik moliyaviy hisobotlar."
        actions={
          <div className="flex items-center gap-2">
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
            >
              <RefreshCw className={isFetching ? 'animate-spin' : ''} />
              Yangilash
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as 'daily' | 'monthly')}>
        <TabsList>
          <TabsTrigger value="daily">Kunlik</TabsTrigger>
          <TabsTrigger value="monthly">Oylik</TabsTrigger>
        </TabsList>
      </Tabs>

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

