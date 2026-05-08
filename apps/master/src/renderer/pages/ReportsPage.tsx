import React, { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  ChefHat,
  CreditCard,
  HandCoins,
  Layers3,
  ReceiptText,
  RefreshCw,
  Search,
  Soup,
  TrendingUp,
  Users2,
  Wallet,
  X,
} from 'lucide-react';
import { DailyReport, MonthlyReport, reportsApi } from '../api/reports';
import { ForbiddenMessage } from '../components/ForbiddenMessage';
import { Modal } from '../components/Modal';
import { formatDateTimeUZ, formatUZS } from '../utils/format';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function localMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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

const UZBEK_DAY_ABBR = ['Du', 'Se', 'Ch', 'Pe', 'Ju', 'Sh', 'Ya'];

type DailySection = 'overview' | 'orders' | 'meals' | 'debts' | 'expenses' | 'team';

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split('-');
  const index = Number(monthPart) - 1;
  return `${UZBEK_MONTHS[index] ?? monthPart} ${year}`;
}

function formatDateLabel(dateStr: string) {
  const [year, monthPart, day] = dateStr.split('-');
  return `${Number(day)} ${UZBEK_MONTHS[Number(monthPart) - 1] ?? monthPart} ${year}`;
}

function sumMoney(values: string[]) {
  return values.reduce((sum, value) => sum + BigInt(value || '0'), 0n);
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(search: string, values: Array<string | number | null | undefined>) {
  if (!search) {
    return true;
  }

  return values.some((value) => String(value ?? '').toLocaleLowerCase().includes(search));
}

function buildCalendarGrid(year: number, monthNum: number, daily: DailyReport[]) {
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstDow = new Date(year, monthNum - 1, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  const reportByDate = new Map(daily.map((r) => [r.date, r]));

  const cells: Array<{ day: number | null; report: DailyReport | null }> = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null, report: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, report: reportByDate.get(dateStr) ?? null });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, report: null });

  const rows: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function buildMonthlySummary(report: MonthlyReport) {
  const serviceChargeTotal = sumMoney(report.daily.map((day) => day.sales.serviceCharge));
  const debtOpenedTotal = sumMoney(report.daily.map((day) => day.debtSnapshot.openedTodayAmount));
  const debtRepaidTotal = sumMoney(report.daily.map((day) => day.debtSnapshot.repaidTodayAmount));

  return {
    serviceChargeTotal,
    debtOpenedTotal,
    debtRepaidTotal,
  };
}

function SearchField({
  value,
  onChange,
  placeholder,
  helper,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  helper: string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100">
        <Search size={18} className="shrink-0 text-slate-400" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded-xl p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Qidiruvni tozalash"
          >
            <X size={16} />
          </button>
        ) : null}
      </label>
      <p className="text-[11px] font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">{title}</h3>
          {subtitle ? <p className="text-xs font-medium leading-5 text-slate-500">{subtitle}</p> : null}
        </div>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function TableViewport({
  children,
  maxHeight = 'max-h-[440px]',
}: {
  children: React.ReactNode;
  maxHeight?: string;
}) {
  return <div className={`overflow-auto ${maxHeight}`}>{children}</div>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
        {text}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: 'CLOSED' | 'CANCELED' | 'WALKOUT' | 'OPEN' | 'PARTIAL' | 'PAID' }) {
  const styles = {
    CLOSED: 'bg-emerald-100 text-emerald-700',
    CANCELED: 'bg-amber-100 text-amber-700',
    WALKOUT: 'bg-rose-100 text-rose-700',
    OPEN: 'bg-amber-100 text-amber-700',
    PARTIAL: 'bg-blue-100 text-blue-700',
    PAID: 'bg-emerald-100 text-emerald-700',
  }[status];

  const labels = {
    CLOSED: 'Yopilgan',
    CANCELED: 'Bekor',
    WALKOUT: 'To\'lamagan',
    OPEN: 'Ochiq',
    PARTIAL: 'Qisman',
    PAID: 'Yopilgan',
  }[status];

  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${styles}`}>{labels}</span>;
}

function MetricCard({
  title,
  value,
  subtitle,
  tone = 'slate',
  icon,
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'blue';
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const toneStyles = {
    slate: 'border-slate-200 bg-white text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-900',
    rose: 'border-rose-200 bg-rose-50/70 text-rose-900',
    blue: 'border-sky-200 bg-sky-50/70 text-sky-900',
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">{title}</div>
          <div className="text-2xl font-black tracking-tight">{value}</div>
        </div>
        <div className="rounded-2xl bg-white/80 p-3 shadow-sm">{icon}</div>
      </div>
      <p className="mt-3 text-xs font-medium leading-5 text-slate-600">{subtitle}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-3xl border p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${toneStyles}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`rounded-3xl border p-5 shadow-sm ${toneStyles}`}>{content}</div>;
}

function StatStrip({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'rose' | 'amber' | 'blue';
}) {
  const toneStyles = {
    slate: 'bg-slate-100 text-slate-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    rose: 'bg-rose-100 text-rose-800',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-sky-100 text-sky-800',
  }[tone];

  return (
    <div className={`rounded-2xl px-4 py-3 ${toneStyles}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em]">{label}</div>
      <div className="mt-1 text-lg font-black tracking-tight">{value}</div>
    </div>
  );
}

function SectionTabs({
  activeSection,
  onChange,
  counts,
}: {
  activeSection: DailySection;
  onChange: (section: DailySection) => void;
  counts: Record<DailySection, string>;
}) {
  const tabs: Array<{ key: DailySection; label: string }> = [
    { key: 'overview', label: 'Yadro' },
    { key: 'orders', label: 'Buyurtmalar' },
    { key: 'meals', label: 'Taomlar' },
    { key: 'debts', label: 'Nasiya' },
    { key: 'expenses', label: 'Chiqimlar' },
    { key: 'team', label: 'Ofitsiantlar' },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const active = tab.key === activeSection;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`min-w-[132px] rounded-2xl px-4 py-3 text-left transition-all ${
                active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.2em]">{tab.label}</div>
              <div className={`mt-1 text-sm font-black ${active ? 'text-white' : 'text-slate-900'}`}>{counts[tab.key]}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchScopeBanner({
  searchTerm,
  results,
}: {
  searchTerm: string;
  results: Array<{ label: string; count: number }>;
}) {
  if (!searchTerm) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-700">Qidiruv rejimi</div>
          <div className="mt-1 text-sm font-semibold text-amber-900">
            Yuqoridagi KPI kartalar to'liq kunlik raqamlarni ko'rsatadi. Qidiruv faqat pastdagi registrlarni toraytiradi.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {results.map((item) => (
            <span key={item.label} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-amber-800 shadow-sm">
              {item.label}: {item.count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function DailyView({ report, searchTerm }: { report: DailyReport; searchTerm: string }) {
  const [activeSection, setActiveSection] = useState<DailySection>('overview');

  const orderTotals = useMemo(() => ({
    gross: sumMoney(report.ordersTable.map((item) => item.gross)),
    discount: sumMoney(report.ordersTable.map((item) => item.discount)),
    net: sumMoney(report.ordersTable.map((item) => item.net)),
    cash: sumMoney(report.ordersTable.map((item) => item.cash)),
    card: sumMoney(report.ordersTable.map((item) => item.card)),
    debt: sumMoney(report.ordersTable.map((item) => item.debt)),
  }), [report.ordersTable]);

  const mealTotals = useMemo(() => ({
    qtyOrdered: report.mealSales.reduce((sum, item) => sum + item.qtyOrdered, 0),
    grossSales: sumMoney(report.mealSales.map((item) => item.grossSales)),
  }), [report.mealSales]);

  const kitchenTotals = useMemo(() => ({
    qtyOrdered: report.kitchenProduction.reduce((sum, item) => sum + item.qtyOrdered, 0),
    qtySent: report.kitchenProduction.reduce((sum, item) => sum + item.qtySent, 0),
    qtyStarted: report.kitchenProduction.reduce((sum, item) => sum + item.qtyStarted, 0),
    qtyReady: report.kitchenProduction.reduce((sum, item) => sum + item.qtyReady, 0),
    qtyCanceledBeforeCooking: report.kitchenProduction.reduce((sum, item) => sum + item.qtyCanceledBeforeCooking, 0),
    qtyCanceledAfterStart: report.kitchenProduction.reduce((sum, item) => sum + item.qtyCanceledAfterStart, 0),
  }), [report.kitchenProduction]);

  const debtTotals = useMemo(() => ({
    originalAmount: sumMoney(report.debtLedger.map((item) => item.originalAmount)),
    repaidToday: sumMoney(report.debtLedger.map((item) => item.repaidToday)),
    totalRepaid: sumMoney(report.debtLedger.map((item) => item.totalRepaid)),
    remainingAmount: sumMoney(report.debtLedger.map((item) => item.remainingAmount)),
  }), [report.debtLedger]);

  const waiterTotals = useMemo(() => ({
    orders: report.perWaiter.reduce((sum, item) => sum + item.orders, 0),
    canceledOrders: report.perWaiter.reduce((sum, item) => sum + item.canceledOrders, 0),
    revenue: sumMoney(report.perWaiter.map((item) => item.revenue)),
    serviceEarned: sumMoney(report.perWaiter.map((item) => item.serviceEarned)),
    serviceServings: report.perWaiter.reduce((sum, item) => sum + item.serviceServings, 0),
  }), [report.perWaiter]);

  const sectionCounts = useMemo<Record<DailySection, string>>(() => ({
    overview: `${report.sales.closedOrders}/${report.sales.canceledOrders}/${report.sales.walkoutOrders}`,
    orders: `${report.ordersTable.length} qator`,
    meals: `${report.mealSales.length} taom`,
    debts: `${report.debtLedger.length} nasiya`,
    expenses: `${report.expenses.items.length} chiqim`,
    team: `${report.perWaiter.length} ofitsiant`,
  }), [report]);

  const searchResults = useMemo(() => ([
    { label: 'Buyurtma', count: report.ordersTable.length },
    { label: 'Taom', count: report.mealSales.length },
    { label: 'Nasiya', count: report.debtLedger.length },
    { label: 'Chiqim', count: report.expenses.items.length },
    { label: 'Ofitsiant', count: report.perWaiter.length },
  ]), [report]);

  const quickRepaymentRows = report.debtSnapshot.repayments.slice(0, 6);
  const latestCancellations = report.cancellations.slice(0, 5);
  const latestWalkouts = report.walkouts.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-slate-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            title="Real tushum"
            value={formatUZS(report.cashflow.realCashIn)}
            subtitle={`${report.sales.closedOrders} ta yopilgan buyurtma, naqd + karta + qaytgan nasiya`}
            tone="emerald"
            icon={<Banknote size={20} className="text-emerald-700" />}
            onClick={() => setActiveSection('overview')}
          />
          <MetricCard
            title="Sof savdo"
            value={formatUZS(report.sales.netSales)}
            subtitle={`${formatUZS(report.sales.grossSales)} brutto - ${formatUZS(report.sales.discounts)} chegirma`}
            tone="slate"
            icon={<ReceiptText size={20} className="text-slate-700" />}
            onClick={() => setActiveSection('orders')}
          />
          <MetricCard
            title="Xizmat haqi"
            value={formatUZS(report.sales.serviceCharge)}
            subtitle={`${waiterTotals.serviceServings} servis dona, ofitsiantlarga ajratiladi`}
            tone="blue"
            icon={<Users2 size={20} className="text-sky-700" />}
            onClick={() => setActiveSection('team')}
          />
          <MetricCard
            title="Netto chiqim"
            value={formatUZS(report.expenses.net)}
            subtitle={`${report.expenses.items.length} satr, ${report.expenses.byCategory.length} kategoriya`}
            tone="amber"
            icon={<Wallet size={20} className="text-amber-700" />}
            onClick={() => setActiveSection('expenses')}
          />
          <MetricCard
            title="Ochiq nasiya"
            value={formatUZS(report.debtSnapshot.outstandingTotal)}
            subtitle={`${formatUZS(report.debtSnapshot.openedTodayAmount)} bugun ochilgan, ${formatUZS(report.debtSnapshot.repaidTodayAmount)} qaytgan`}
            tone="rose"
            icon={<HandCoins size={20} className="text-rose-700" />}
            onClick={() => setActiveSection('debts')}
          />
          <MetricCard
            title="Sof foyda"
            value={formatUZS(report.results.salesBasedProfit)}
            subtitle={`Pul oqimi natijasi: ${formatUZS(report.results.cashflowBasedNet)}`}
            tone="slate"
            icon={<TrendingUp size={20} className="text-slate-700" />}
            onClick={() => setActiveSection('overview')}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatStrip label="Yopilgan" value={`${report.sales.closedOrders} ta`} tone="emerald" />
          <StatStrip label="Bekor" value={`${report.sales.canceledOrders} ta`} tone="amber" />
          <StatStrip label="Walkout" value={`${report.sales.walkoutOrders} ta`} tone="rose" />
          <StatStrip label="Bekor yo'qotish" value={formatUZS(report.sales.canceledOrdersGross)} tone="amber" />
          <StatStrip label="Walkout yo'qotish" value={formatUZS(report.sales.walkoutOrdersGross)} tone="rose" />
        </div>
      </div>

      <SearchScopeBanner searchTerm={searchTerm} results={searchResults} />

      <SectionTabs activeSection={activeSection} onChange={setActiveSection} counts={sectionCounts} />

      {activeSection === 'overview' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
          <div className="space-y-6">
            <Panel
              title="Moliyaviy formula"
              subtitle="Rush paytida asosiy savol bitta: pul qayerdan keldi, qayerga ketdi, va farq normalmi."
            >
              <div className="grid gap-3 p-5 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Savdo registri</div>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-slate-600">Brutto savdo</span>
                      <span className="font-black text-slate-900">{formatUZS(report.sales.grossSales)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-slate-600">Chegirma</span>
                      <span className="font-black text-slate-900">{formatUZS(report.sales.discounts)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-slate-600">Sof savdo</span>
                      <span className="font-black text-slate-900">{formatUZS(report.sales.netSales)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-slate-600">Xizmat haqi</span>
                      <span className="font-black text-sky-700">{formatUZS(report.sales.serviceCharge)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-emerald-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-700">Pul oqimi registri</div>
                  <div className="mt-3 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-emerald-800">Naqd tushum</span>
                      <span className="font-black text-emerald-900">{formatUZS(report.cashflow.orderCash)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-emerald-800">Karta tushum</span>
                      <span className="font-black text-emerald-900">{formatUZS(report.cashflow.orderCard)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-emerald-800">Qaytgan nasiya</span>
                      <span className="font-black text-emerald-900">{formatUZS(report.debtSnapshot.repaidTodayAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-emerald-800">Umumiy tushum</span>
                      <span className="font-black text-emerald-900">{formatUZS(report.cashflow.realCashIn)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 md:col-span-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Yakun</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Sof foyda</div>
                      <div className="mt-2 text-xl font-black text-slate-900">{formatUZS(report.results.salesBasedProfit)}</div>
                      <p className="mt-2 text-xs font-medium text-slate-500">Sof savdo + xizmat haqi - netto chiqim</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Pul oqimi natijasi</div>
                      <div className="mt-2 text-xl font-black text-slate-900">{formatUZS(report.results.cashflowBasedNet)}</div>
                      <p className="mt-2 text-xs font-medium text-slate-500">Real tushum - netto chiqim</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Qarzga savdo</div>
                      <div className="mt-2 text-xl font-black text-slate-900">{formatUZS(report.sales.debtSales)}</div>
                      <p className="mt-2 text-xs font-medium text-slate-500">Bugun sotilgan, lekin darhol tushmagan pul</p>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              title="Tekshiruv paneli"
              subtitle="Har bir nol bo'lmagan farq audit uchun sabab. Bu yerda yashirin hisob qolmasligi kerak."
            >
              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
                <StatStrip
                  label="To'lov farqi"
                  value={formatUZS(report.checks.salesVsPayments.difference)}
                  tone={Number(report.checks.salesVsPayments.difference) === 0 ? 'emerald' : 'rose'}
                />
                <StatStrip
                  label="Taomlar farqi"
                  value={formatUZS(report.checks.salesVsPayments.mealSalesDifference)}
                  tone={Number(report.checks.salesVsPayments.mealSalesDifference) === 0 ? 'emerald' : 'amber'}
                />
                <StatStrip
                  label="Servis farqi"
                  value={formatUZS(report.checks.salesVsPayments.serviceLineDifference)}
                  tone={Number(report.checks.salesVsPayments.serviceLineDifference) === 0 ? 'emerald' : 'amber'}
                />
                <StatStrip label="Yakuniy chek" value={formatUZS(report.checks.salesVsPayments.billedTotal)} tone="slate" />
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel
              title="Xavf nuqtalari"
              subtitle="Rush paytida darhol ko'rinishi kerak bo'lgan istisnolar."
              rightSlot={<AlertTriangle size={18} className="text-amber-500" />}
            >
              <div className="space-y-3 p-5">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-700">Bekor qilingan buyurtmalar</div>
                  <div className="mt-1 text-lg font-black text-amber-900">{report.sales.canceledOrders} ta</div>
                  <div className="text-xs font-medium text-amber-800">Yo'qotilgan qiymat: {formatUZS(report.sales.canceledOrdersGross)}</div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-700">Walkoutlar</div>
                  <div className="mt-1 text-lg font-black text-rose-900">{report.sales.walkoutOrders} ta</div>
                  <div className="text-xs font-medium text-rose-800">Yo'qotilgan qiymat: {formatUZS(report.sales.walkoutOrdersGross)}</div>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-700">Bugun ochilgan nasiya</div>
                  <div className="mt-1 text-lg font-black text-sky-900">{report.debtSnapshot.openedTodayCount} ta</div>
                  <div className="text-xs font-medium text-sky-800">Summasi: {formatUZS(report.debtSnapshot.openedTodayAmount)}</div>
                </div>
              </div>
            </Panel>

            <Panel
              title="So'nggi qaytimlar"
              subtitle="Qaysi qarzlar bugun kassaga qaytdi."
              rightSlot={<CreditCard size={18} className="text-emerald-500" />}
            >
              <div className="divide-y divide-slate-100">
                {quickRepaymentRows.length === 0 ? (
                  <div className="px-5 py-10 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Bugun qaytim yo'q
                  </div>
                ) : quickRepaymentRows.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 px-5 py-4">
                    <div>
                      <div className="text-xs font-black text-slate-900">{item.debtorName}</div>
                      <div className="mt-1 text-[11px] font-medium text-slate-500">
                        #{item.orderNumber} • {formatDateTimeUZ(item.paidAt)} • {item.receivedByName}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-700">{formatUZS(item.amount)}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.method}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {activeSection === 'orders' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <Panel
            title="Buyurtmalar registri"
            subtitle="Rush paytida operator bir qarashda holat, ofitsiant, summa va to'lov tarkibini ko'rishi kerak."
          >
            <TableViewport maxHeight="max-h-[640px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Vaqt</th>
                    <th className="px-5 py-4">Buyurtma</th>
                    <th className="px-5 py-4">Joy</th>
                    <th className="px-5 py-4">Ofitsiant</th>
                    <th className="px-5 py-4">Holat</th>
                    <th className="px-5 py-4 text-right">Brutto</th>
                    <th className="px-5 py-4 text-right">Sof</th>
                    <th className="px-5 py-4 text-right">Naqd</th>
                    <th className="px-5 py-4 text-right">Karta</th>
                    <th className="px-5 py-4 text-right">Qarz</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.ordersTable.length === 0 ? (
                    <EmptyRow colSpan={10} text="Qidiruv yoki sana bo'yicha buyurtma topilmadi" />
                  ) : report.ordersTable.map((item) => (
                    <tr key={item.orderId} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 text-xs font-semibold text-slate-500">{formatDateTimeUZ(item.at)}</td>
                      <td className="px-5 py-4 text-xs font-black text-slate-900">#{item.orderNumber}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-600">{item.tableName ?? 'Takeaway'}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.waiterName}</td>
                      <td className="px-5 py-4"><StatusBadge status={item.status} /></td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.gross)}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.net)}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.cash)}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.card)}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.debt)}</td>
                    </tr>
                  ))}
                </tbody>
                {report.ordersTable.length > 0 ? (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr className="text-xs font-black text-slate-900">
                      <td colSpan={5} className="px-5 py-4 uppercase tracking-[0.22em]">Jami</td>
                      <td className="px-5 py-4 text-right">{formatUZS(orderTotals.gross)}</td>
                      <td className="px-5 py-4 text-right">{formatUZS(orderTotals.net)}</td>
                      <td className="px-5 py-4 text-right">{formatUZS(orderTotals.cash)}</td>
                      <td className="px-5 py-4 text-right">{formatUZS(orderTotals.card)}</td>
                      <td className="px-5 py-4 text-right">{formatUZS(orderTotals.debt)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableViewport>
          </Panel>

          <div className="space-y-6">
            <Panel title="Bekor qilinganlar" subtitle="Kim bekor qilganini yashirmaslik kerak.">
              <div className="divide-y divide-slate-100">
                {latestCancellations.length === 0 ? (
                  <div className="px-5 py-10 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Bekor qilingan buyurtma yo'q
                  </div>
                ) : latestCancellations.map((item) => (
                  <div key={`${item.orderId}-${item.canceledAt}`} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black text-slate-900">#{item.orderId.slice(-6).toUpperCase()}</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-500">{formatDateTimeUZ(item.canceledAt)} • {item.canceledBy}</div>
                      </div>
                      <StatusBadge status="CANCELED" />
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-600">{item.reason || 'Sabab kiritilmagan'}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Walkoutlar" subtitle="To'lovsiz ketganlar alohida ko'zga tashlanishi kerak.">
              <div className="divide-y divide-slate-100">
                {latestWalkouts.length === 0 ? (
                  <div className="px-5 py-10 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Walkout topilmadi
                  </div>
                ) : latestWalkouts.map((item) => (
                  <div key={`${item.orderId}-${item.markedAt}`} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black text-slate-900">#{item.orderId.slice(-6).toUpperCase()}</div>
                        <div className="mt-1 text-[11px] font-medium text-slate-500">{formatDateTimeUZ(item.markedAt)} • {item.markedBy}</div>
                      </div>
                      <div className="text-right">
                        <StatusBadge status="WALKOUT" />
                        <div className="mt-2 text-xs font-black text-rose-700">{formatUZS(item.amount)}</div>
                      </div>
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-600">{item.reason || 'Sabab kiritilmagan'}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {activeSection === 'meals' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Taomlar savdosi"
            subtitle="Qaysi taom eng ko'p buyurtma qilinganini ko'rsatadi. Service itemlar bu yerga kirmaydi."
          >
            <TableViewport maxHeight="max-h-[560px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Taom</th>
                    <th className="px-5 py-4">Kategoriya</th>
                    <th className="px-5 py-4 text-right">Buyurtma</th>
                    <th className="px-5 py-4 text-right">Soni</th>
                    <th className="px-5 py-4 text-right">Savdo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.mealSales.length === 0 ? (
                    <EmptyRow colSpan={5} text="Qidiruv yoki sana bo'yicha taom topilmadi" />
                  ) : report.mealSales.map((item) => (
                    <tr key={`${item.mealName}-${item.categoryName}`} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 text-sm font-black text-slate-900">{item.mealName}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-600">{item.categoryName ?? '—'}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{item.ordersCount}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{item.qtyOrdered}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.grossSales)}</td>
                    </tr>
                  ))}
                </tbody>
                {report.mealSales.length > 0 ? (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr className="text-xs font-black text-slate-900">
                      <td colSpan={3} className="px-5 py-4 uppercase tracking-[0.22em]">Jami</td>
                      <td className="px-5 py-4 text-right">{mealTotals.qtyOrdered}</td>
                      <td className="px-5 py-4 text-right">{formatUZS(mealTotals.grossSales)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableViewport>
          </Panel>

          <Panel
            title="Oshxona oqimi"
            subtitle="Buyurtma, yuborilgan, tayyor va bekor qilingan taomlar bir joyda."
          >
            <TableViewport maxHeight="max-h-[560px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Taom</th>
                    <th className="px-5 py-4 text-right">Buyurtma</th>
                    <th className="px-5 py-4 text-right">Yuborilgan</th>
                    <th className="px-5 py-4 text-right">Boshlangan</th>
                    <th className="px-5 py-4 text-right">Tayyor</th>
                    <th className="px-5 py-4 text-right">Oldin</th>
                    <th className="px-5 py-4 text-right">Keyin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.kitchenProduction.length === 0 ? (
                    <EmptyRow colSpan={7} text="Oshxona bo'yicha natija topilmadi" />
                  ) : report.kitchenProduction.map((item) => (
                    <tr key={item.mealName} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 text-sm font-black text-slate-900">{item.mealName}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{item.qtyOrdered}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{item.qtySent}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{item.qtyStarted}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-emerald-700">{item.qtyReady}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-amber-700">{item.qtyCanceledBeforeCooking}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-rose-700">{item.qtyCanceledAfterStart}</td>
                    </tr>
                  ))}
                </tbody>
                {report.kitchenProduction.length > 0 ? (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr className="text-xs font-black text-slate-900">
                      <td className="px-5 py-4 uppercase tracking-[0.22em]">Jami</td>
                      <td className="px-5 py-4 text-right">{kitchenTotals.qtyOrdered}</td>
                      <td className="px-5 py-4 text-right">{kitchenTotals.qtySent}</td>
                      <td className="px-5 py-4 text-right">{kitchenTotals.qtyStarted}</td>
                      <td className="px-5 py-4 text-right">{kitchenTotals.qtyReady}</td>
                      <td className="px-5 py-4 text-right">{kitchenTotals.qtyCanceledBeforeCooking}</td>
                      <td className="px-5 py-4 text-right">{kitchenTotals.qtyCanceledAfterStart}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableViewport>
          </Panel>
        </div>
      ) : null}

      {activeSection === 'debts' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <Panel
            title="Nasiya registri"
            subtitle="Ochilgan, qaytgan va qolgan nasiya summalari bir qatorda turadi."
          >
            <TableViewport maxHeight="max-h-[620px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Ochilgan</th>
                    <th className="px-5 py-4">Buyurtma</th>
                    <th className="px-5 py-4">Mijoz</th>
                    <th className="px-5 py-4 text-right">Nasiya</th>
                    <th className="px-5 py-4 text-right">Bugun qaytgan</th>
                    <th className="px-5 py-4 text-right">Jami qaytgan</th>
                    <th className="px-5 py-4 text-right">Qoldiq</th>
                    <th className="px-5 py-4">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.debtLedger.length === 0 ? (
                    <EmptyRow colSpan={8} text="Qidiruv yoki sana bo'yicha nasiya topilmadi" />
                  ) : report.debtLedger.map((item) => (
                    <tr key={item.debtId} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 text-xs font-semibold text-slate-500">{formatDateTimeUZ(item.openedAt)}</td>
                      <td className="px-5 py-4 text-xs font-black text-slate-900">#{item.orderNumber}</td>
                      <td className="px-5 py-4 text-xs font-black text-slate-900">{item.debtorName}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.originalAmount)}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-emerald-700">{formatUZS(item.repaidToday)}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.totalRepaid)}</td>
                      <td className="px-5 py-4 text-right text-xs font-black text-rose-700">{formatUZS(item.remainingAmount)}</td>
                      <td className="px-5 py-4"><StatusBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
                {report.debtLedger.length > 0 ? (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr className="text-xs font-black text-slate-900">
                      <td colSpan={3} className="px-5 py-4 uppercase tracking-[0.22em]">Jami</td>
                      <td className="px-5 py-4 text-right">{formatUZS(debtTotals.originalAmount)}</td>
                      <td className="px-5 py-4 text-right">{formatUZS(debtTotals.repaidToday)}</td>
                      <td className="px-5 py-4 text-right">{formatUZS(debtTotals.totalRepaid)}</td>
                      <td className="px-5 py-4 text-right">{formatUZS(debtTotals.remainingAmount)}</td>
                      <td className="px-5 py-4" />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableViewport>
          </Panel>

          <Panel
            title="Bugungi qaytimlar"
            subtitle="Kassaga qaytgan nasiya harakati."
          >
            <div className="divide-y divide-slate-100">
              {report.debtSnapshot.repayments.length === 0 ? (
                <div className="px-5 py-10 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Qaytim topilmadi
                </div>
              ) : report.debtSnapshot.repayments.map((item) => (
                <div key={item.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-slate-900">{item.debtorName}</div>
                      <div className="mt-1 text-[11px] font-medium text-slate-500">
                        #{item.orderNumber} • {formatDateTimeUZ(item.paidAt)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-700">{formatUZS(item.amount)}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.method}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-slate-500">{item.receivedByName}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeSection === 'expenses' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_340px]">
          <Panel
            title="Chiqim registri"
            subtitle="Kim kiritgan, qachon kiritgan va signed amount bir joyda ko'rinadi."
          >
            <TableViewport maxHeight="max-h-[620px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  <tr>
                    <th className="px-5 py-4">Vaqt</th>
                    <th className="px-5 py-4">Kategoriya</th>
                    <th className="px-5 py-4">Sabab</th>
                    <th className="px-5 py-4">Kim</th>
                    <th className="px-5 py-4 text-right">Signed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.expenses.items.length === 0 ? (
                    <EmptyRow colSpan={5} text="Qidiruv yoki sana bo'yicha chiqim topilmadi" />
                  ) : report.expenses.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 text-xs font-semibold text-slate-500">{formatDateTimeUZ(item.occurredAt)}</td>
                      <td className="px-5 py-4 text-xs font-black text-slate-900">{item.categoryName}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-700">{item.reason}</td>
                      <td className="px-5 py-4 text-xs font-semibold text-slate-500">{item.createdByName}</td>
                      <td className={`px-5 py-4 text-right text-xs font-black ${item.status === 'REVERSAL' ? 'text-rose-700' : 'text-slate-900'}`}>
                        {formatUZS(item.signedAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          </Panel>

          <div className="space-y-6">
            <Panel title="Chiqim formulasi" subtitle="Gross, reversal va net hech qachon aralashib ketmasligi kerak.">
              <div className="space-y-3 p-5">
                <StatStrip label="Kiritilgan" value={formatUZS(report.checks.expenses.recordedExpense)} tone="slate" />
                <StatStrip label="Qaytarilgan" value={formatUZS(report.checks.expenses.reversalAmount)} tone="amber" />
                <StatStrip label="Netto" value={formatUZS(report.expenses.net)} tone="rose" />
              </div>
            </Panel>

            <Panel title="Kategoriya bo'yicha" subtitle="Tez qidiruv uchun eng muhim kesim.">
              <div className="divide-y divide-slate-100">
                {report.expenses.byCategory.length === 0 ? (
                  <div className="px-5 py-10 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Kategoriya topilmadi
                  </div>
                ) : report.expenses.byCategory.map((item) => (
                  <div key={item.categoryId} className="flex items-center justify-between gap-3 px-5 py-4">
                    <div className="text-xs font-black text-slate-900">{item.categoryName}</div>
                    <div className="text-xs font-black text-slate-900">{formatUZS(item.amount)}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {activeSection === 'team' ? (
        <Panel
          title="Ofitsiantlar kesimi"
          subtitle="Rush paytida kim nima ko'tarayotgani, kimda bekor ko'p ekani shu jadvalda ko'rinadi."
        >
          <TableViewport maxHeight="max-h-[620px]">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                <tr>
                  <th className="px-5 py-4">Ofitsiant</th>
                  <th className="px-5 py-4 text-right">Yopilgan</th>
                  <th className="px-5 py-4 text-right">Bekor</th>
                  <th className="px-5 py-4 text-right">Umumiy savdo</th>
                  <th className="px-5 py-4 text-right">Servis</th>
                  <th className="px-5 py-4 text-right">Xizmat haqi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.perWaiter.length === 0 ? (
                  <EmptyRow colSpan={6} text="Qidiruv yoki sana bo'yicha ofitsiant topilmadi" />
                ) : report.perWaiter.map((item) => (
                  <tr key={item.waiterId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 text-sm font-black text-slate-900">{item.waiterName}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-emerald-700">{item.orders}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-rose-600">{item.canceledOrders}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.revenue)}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-sky-700">{item.serviceServings}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.serviceEarned)}</td>
                  </tr>
                ))}
              </tbody>
              {report.perWaiter.length > 0 ? (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr className="text-xs font-black text-slate-900">
                    <td className="px-5 py-4 uppercase tracking-[0.22em]">Jami</td>
                    <td className="px-5 py-4 text-right text-emerald-700">{waiterTotals.orders}</td>
                    <td className="px-5 py-4 text-right text-rose-600">{waiterTotals.canceledOrders}</td>
                    <td className="px-5 py-4 text-right">{formatUZS(waiterTotals.revenue)}</td>
                    <td className="px-5 py-4 text-right text-sky-700">{waiterTotals.serviceServings}</td>
                    <td className="px-5 py-4 text-right">{formatUZS(waiterTotals.serviceEarned)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </TableViewport>
        </Panel>
      ) : null}
    </div>
  );
}

function MonthlyView({
  report,
  searchTerm,
}: {
  report: MonthlyReport;
  searchTerm: string;
}) {
  const [selectedDay, setSelectedDay] = useState<DailyReport | null>(null);

  const [yearNum, monthNum] = report.month.split('-').map(Number);
  const summary = useMemo(() => buildMonthlySummary(report), [report]);
  const calendarRows = useMemo(
    () => buildCalendarGrid(yearNum, monthNum, report.daily),
    [yearNum, monthNum, report.daily],
  );

  const normalizedSearch = normalizeSearch(searchTerm);

  const filteredDailyRows = useMemo(
    () => report.daily.filter((day) =>
      matchesSearch(normalizedSearch, [
        day.date,
        day.sales.closedOrders,
        day.sales.netSales,
        day.cashflow.realCashIn,
        day.expenses.net,
        day.debtSnapshot.outstandingTotal,
      ])),
    [normalizedSearch, report.daily],
  );

  const filteredWaiters = useMemo(
    () => report.totals.perWaiter.filter((item) =>
      matchesSearch(normalizedSearch, [
        item.waiterName,
        item.orders,
        item.canceledOrders,
        item.revenue,
        item.serviceEarned,
        item.serviceServings,
      ])),
    [normalizedSearch, report.totals.perWaiter],
  );

  const summaryItems = [
    {
      label: 'Real tushum',
      value: formatUZS(report.totals.realCashIn),
      subtitle: 'Naqd + karta + qaytgan nasiya',
      tone: 'emerald' as const,
      icon: <Banknote size={18} className="text-emerald-700" />,
    },
    {
      label: 'Sof savdo',
      value: formatUZS(report.totals.netSales),
      subtitle: 'Brutto - chegirma',
      tone: 'slate' as const,
      icon: <ReceiptText size={18} className="text-slate-700" />,
    },
    {
      label: 'Netto chiqim',
      value: formatUZS(report.totals.expensesNet),
      subtitle: "Oy bo'yicha jamlangan",
      tone: 'amber' as const,
      icon: <Wallet size={18} className="text-amber-700" />,
    },
    {
      label: 'Xizmat haqi',
      value: formatUZS(summary.serviceChargeTotal),
      subtitle: 'Ofitsiantlar kesimida pass-through',
      tone: 'blue' as const,
      icon: <Users2 size={18} className="text-sky-700" />,
    },
    {
      label: 'Nasiya qoldig\'i',
      value: formatUZS(report.totals.outstandingDebtEndOfMonth),
      subtitle: report.isCurrentMonth ? `${report.daily.at(-1)?.date ?? ''} holatiga` : 'Oy oxiri snapshot',
      tone: 'rose' as const,
      icon: <HandCoins size={18} className="text-rose-700" />,
    },
    {
      label: 'Sof foyda',
      value: formatUZS(report.totals.salesBasedProfit),
      subtitle: 'Sof savdo + xizmat haqi - chiqim',
      tone: 'slate' as const,
      icon: <TrendingUp size={18} className="text-slate-700" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {summaryItems.map((item) => (
          <MetricCard
            key={item.label}
            title={item.label}
            value={item.value}
            subtitle={item.subtitle}
            tone={item.tone}
            icon={item.icon}
          />
        ))}
      </div>

      {searchTerm ? (
        <div className="rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm font-medium text-sky-900 shadow-sm">
          Oylik qidiruv kalendarni o'zgartirmaydi. Faqat pastdagi kunlik rollup jadvali va ofitsiantlar kesimi filtrlanadi.
        </div>
      ) : null}

      <Panel
        title={`${formatMonthLabel(report.month)} taqvimi`}
        subtitle="Har bir katakda alohida net savdo va real tushum bor. Kunni bossangiz, to'liq kunlik report ochiladi."
      >
        <div className="p-5">
          <div className="mb-3 grid grid-cols-7 gap-2">
            {UZBEK_DAY_ABBR.map((d) => (
              <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                {d}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {calendarRows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-7 gap-2">
                {row.map((cell, cellIdx) => {
                  if (!cell.day) {
                    return <div key={cellIdx} className="h-24 rounded-2xl" />;
                  }

                  const hasActivity = cell.report
                    && (cell.report.sales.closedOrders > 0 || Number(cell.report.cashflow.realCashIn) > 0);

                  return (
                    <button
                      key={cellIdx}
                      type="button"
                      disabled={!hasActivity}
                      onClick={() => cell.report && setSelectedDay(cell.report)}
                      className={`h-24 rounded-2xl border p-3 text-left transition-all ${
                        hasActivity
                          ? 'border-slate-200 bg-white shadow-sm hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md'
                          : 'border-slate-100 bg-slate-50/50'
                      }`}
                    >
                      <div className={`text-sm font-black ${hasActivity ? 'text-slate-900' : 'text-slate-300'}`}>
                        {cell.day}
                      </div>
                      {hasActivity && cell.report ? (
                        <div className="mt-2 space-y-1">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {cell.report.sales.closedOrders} ta
                          </div>
                          <div className="truncate text-[10px] font-semibold text-slate-500">
                            Savdo: {formatUZS(cell.report.sales.netSales)}
                          </div>
                          <div className="truncate text-[10px] font-black text-emerald-700">
                            Tushum: {formatUZS(cell.report.cashflow.realCashIn)}
                          </div>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_360px]">
        <Panel
          title="Kunlik rollup jadvali"
          subtitle="Oy ichidagi har bir kunni tez solishtirish uchun."
        >
          <TableViewport maxHeight="max-h-[620px]">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                <tr>
                  <th className="px-5 py-4">Sana</th>
                  <th className="px-5 py-4 text-right">Yopilgan</th>
                  <th className="px-5 py-4 text-right">Sof savdo</th>
                  <th className="px-5 py-4 text-right">Qarzga savdo</th>
                  <th className="px-5 py-4 text-right">Real tushum</th>
                  <th className="px-5 py-4 text-right">Chiqim</th>
                  <th className="px-5 py-4 text-right">Sof foyda</th>
                  <th className="px-5 py-4 text-right">Qarz qoldig'i</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDailyRows.length === 0 ? (
                  <EmptyRow colSpan={8} text="Oylik qidiruv bo'yicha kun topilmadi" />
                ) : filteredDailyRows.map((day) => (
                  <tr
                    key={day.date}
                    className="cursor-pointer hover:bg-slate-50/70"
                    onClick={() => setSelectedDay(day)}
                  >
                    <td className="px-5 py-4 text-xs font-black text-slate-900">{formatDateLabel(day.date)}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-emerald-700">{day.sales.closedOrders}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(day.sales.netSales)}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(day.sales.debtSales)}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-emerald-700">{formatUZS(day.cashflow.realCashIn)}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(day.expenses.net)}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(day.results.salesBasedProfit)}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-rose-700">{formatUZS(day.debtSnapshot.outstandingTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        </Panel>

        <Panel
          title="Oylik ofitsiantlar"
          subtitle="Qidiruv bilan waiter kesimini tez toraytirish mumkin."
        >
          <TableViewport maxHeight="max-h-[620px]">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                <tr>
                  <th className="px-5 py-4">Ofitsiant</th>
                  <th className="px-5 py-4 text-right">Yopilgan</th>
                  <th className="px-5 py-4 text-right">Bekor</th>
                  <th className="px-5 py-4 text-right">Savdo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWaiters.length === 0 ? (
                  <EmptyRow colSpan={4} text="Qidiruv bo'yicha ofitsiant topilmadi" />
                ) : filteredWaiters.map((item) => (
                  <tr key={item.waiterId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 text-sm font-black text-slate-900">{item.waiterName}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-emerald-700">{item.orders}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-rose-600">{item.canceledOrders}</td>
                    <td className="px-5 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        </Panel>
      </div>

      {selectedDay ? (
        <Modal
          title={`${formatDateLabel(selectedDay.date)} — kunlik hisobot`}
          onClose={() => setSelectedDay(null)}
          maxWidth="max-w-7xl"
        >
          <DailyView report={selectedDay} searchTerm="" />
        </Modal>
      ) : null}
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');
  const [date, setDate] = useState(localDateString);
  const [month, setMonth] = useState(localMonthString);
  const [dailySearch, setDailySearch] = useState('');
  const [monthlySearch, setMonthlySearch] = useState('');

  const deferredDailySearch = useDeferredValue(dailySearch.trim());
  const deferredMonthlySearch = useDeferredValue(monthlySearch.trim());

  const selectedYear = month.slice(0, 4);
  const selectedMonthPart = month.slice(5, 7);

  const dailyQuery = useQuery({
    queryKey: ['reports', 'daily', date, deferredDailySearch],
    queryFn: () => reportsApi.getDaily(date, deferredDailySearch || undefined),
    enabled: tab === 'daily',
    retry: false,
    placeholderData: (previousData) => previousData,
  });

  const monthlyQuery = useQuery({
    queryKey: ['reports', 'monthly', month],
    queryFn: () => reportsApi.getMonthly(month),
    enabled: tab === 'monthly',
    retry: false,
    placeholderData: (previousData) => previousData,
  });

  const isForbidden = (dailyQuery.error as { code?: string } | null)?.code === 'FORBIDDEN'
    || (monthlyQuery.error as { code?: string } | null)?.code === 'FORBIDDEN'
    || (dailyQuery.error as Error | null)?.message === 'Forbidden'
    || (monthlyQuery.error as Error | null)?.message === 'Forbidden';

  if (isForbidden) {
    return <ForbiddenMessage />;
  }

  const isLoading = tab === 'daily' ? dailyQuery.isLoading : monthlyQuery.isLoading;
  const isFetching = tab === 'daily' ? dailyQuery.isFetching : monthlyQuery.isFetching;

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 px-6 py-6 text-white shadow-xl">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="rounded-3xl bg-white/10 p-4 shadow-lg backdrop-blur">
                {tab === 'daily' ? <ChefHat size={30} /> : <Layers3 size={30} />}
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-white/80">
                  <AlertTriangle size={12} />
                  Rush-ready moliya paneli
                </div>
                <h1 className="text-3xl font-black tracking-tight">Moliyaviy hisobotlar</h1>
                <p className="max-w-3xl text-sm leading-6 text-white/75">
                  Eng muhim raqamlar yuqorida, batafsil registrlar qidiruv bilan pastda. Operator yoki owner shoshilgan paytda ham
                  bekorlar, walkoutlar, nasiya va tushum ko'zdan qochmasligi kerak.
                </p>
              </div>
            </div>

            <div className="inline-flex rounded-2xl bg-white/10 p-1 shadow-inner backdrop-blur">
              <button
                onClick={() => setTab('daily')}
                className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.22em] transition-all ${
                  tab === 'daily' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70 hover:text-white'
                }`}
              >
                Kunlik boshqaruv
              </button>
              <button
                onClick={() => setTab('monthly')}
                className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.22em] transition-all ${
                  tab === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70 hover:text-white'
                }`}
              >
                Oylik kuzatuv
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:min-w-[560px] xl:max-w-[640px] xl:flex-1">
            {tab === 'daily' ? (
              <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_auto]">
                <label className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                  <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/60">
                    <Calendar size={12} />
                    Sana
                  </div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-transparent text-sm font-black outline-none"
                  />
                </label>

                <SearchField
                  value={dailySearch}
                  onChange={setDailySearch}
                  placeholder="Buyurtma, taom, ofitsiant, mijoz yoki chiqim sababini qidiring"
                  helper="Server qidiruvi: registrlarni toraytiradi, KPI kartalarni o'zgartirmaydi."
                />

                <button
                  onClick={() => dailyQuery.refetch()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.22em] text-slate-900 shadow-sm"
                >
                  <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                  Yangilash
                </button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,1.2fr)_auto]">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/60">
                      <Calendar size={12} />
                      Yil
                    </div>
                    <input
                      type="number"
                      min="2020"
                      max="2100"
                      value={selectedYear}
                      onChange={(e) => {
                        const nextYear = e.target.value || selectedYear;
                        setMonth(`${nextYear}-${selectedMonthPart}`);
                      }}
                      className="w-full bg-transparent text-sm font-black outline-none"
                    />
                  </label>

                  <label className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/60">
                      <Calendar size={12} />
                      Oy
                    </div>
                    <select
                      value={selectedMonthPart}
                      onChange={(e) => setMonth(`${selectedYear}-${e.target.value}`)}
                      className="w-full bg-transparent text-sm font-black outline-none"
                    >
                      {UZBEK_MONTHS.map((label, index) => {
                        const value = String(index + 1).padStart(2, '0');
                        return <option key={value} value={value} className="text-slate-900">{label}</option>;
                      })}
                    </select>
                  </label>
                </div>

                <SearchField
                  value={monthlySearch}
                  onChange={setMonthlySearch}
                  placeholder="Sana, summa yoki ofitsiant nomi bo'yicha oy ichida qidiring"
                  helper="Frontend qidiruvi: kunlik rollup va ofitsiantlar jadvalini filtrlash uchun."
                />

                <button
                  onClick={() => monthlyQuery.refetch()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.22em] text-slate-900 shadow-sm"
                >
                  <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                  Yangilash
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-20 text-center text-sm font-bold uppercase tracking-[0.22em] text-slate-400 shadow-sm">
          Hisobot yuklanmoqda...
        </div>
      ) : null}

      {!isLoading && tab === 'daily' && dailyQuery.data ? (
        <DailyView report={dailyQuery.data} searchTerm={deferredDailySearch} />
      ) : null}

      {!isLoading && tab === 'monthly' && monthlyQuery.data ? (
        <MonthlyView report={monthlyQuery.data} searchTerm={deferredMonthlySearch} />
      ) : null}
    </div>
  );
}
