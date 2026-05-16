import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  ChefHat,
  Layers3,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { DailyReport, MonthlyReport, reportsApi } from '../api/reports';
import { ForbiddenMessage } from '../components/ForbiddenMessage';
import { Modal } from '../components/Modal';
import { formatDateTimeUZ, formatUZS } from '../utils/format';
import { DeprecationBanner } from '@/components/feedback/DeprecationBanner';

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

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split('-');
  const index = Number(monthPart) - 1;
  return `${UZBEK_MONTHS[index] ?? monthPart} ${year}`;
}


function sumMoney(values: string[]) {
  return values.reduce((sum, value) => sum + BigInt(value || '0'), 0n);
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

function TableCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TableViewport({
  children,
  maxHeight = 'max-h-[420px]',
  className = '',
}: {
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
}) {
  return <div className={`overflow-auto ${maxHeight} ${className}`}>{children}</div>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
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

type DetailSection = 'revenue' | 'expense' | 'debt' | 'profit';

function DailyView({ report }: { report: DailyReport }) {
  const [activeSection, setActiveSection] = useState<DetailSection>('revenue');

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
    revenue: sumMoney(report.perWaiter.map((item) => item.revenue)),
    serviceEarned: sumMoney(report.perWaiter.map((item) => item.serviceEarned)),
  }), [report.perWaiter]);

  const summaryRows: Array<{
    key: DetailSection;
    title: string;
    value: string;
    subtitle: string;
  }> = [
    {
      key: 'revenue',
      title: 'Umumiy tushum',
      value: formatUZS(report.cashflow.realCashIn),
      subtitle: `${report.sales.closedOrders} ta buyurtma, ${formatUZS(report.sales.netSales)} savdo + ${formatUZS(report.sales.serviceCharge)} xizmat haqi`,
    },
    {
      key: 'expense',
      title: 'Xarajat',
      value: formatUZS(report.expenses.net),
      subtitle: `Kiritilgan: ${formatUZS(report.checks.expenses.recordedExpense)}, qaytarilgan: ${formatUZS(report.checks.expenses.reversalAmount)}`,
    },
    {
      key: 'debt',
      title: 'Qarzlar',
      value: formatUZS(report.debtSnapshot.outstandingTotal),
      subtitle: `Bugun nasiya: ${formatUZS(report.debtSnapshot.openedTodayAmount)}, qaytgan: ${formatUZS(report.debtSnapshot.repaidTodayAmount)}`,
    },
    {
      key: 'profit',
      title: 'Sof foyda',
      value: formatUZS(report.results.salesBasedProfit),
      subtitle: `Pul oqimi natijasi: ${formatUZS(report.results.cashflowBasedNet)}`,
    },
  ];

  return (
    <div className="space-y-6">
      <TableCard
        title="Kunlik bosh jadval"
        subtitle="Bu yerda faqat 4 ta asosiy satr bor. Qaysi satrni bossangiz, pastda o'sha bo'limning to'liq tafsiloti ochiladi."
      >
        <TableViewport maxHeight="max-h-[560px]">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-6 py-4">Ko'rsatkich</th>
                <th className="px-6 py-4 text-right">Qiymat</th>
                <th className="px-6 py-4">Izoh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {summaryRows.map((row) => (
                <tr
                  key={row.key}
                  onClick={() => setActiveSection(row.key)}
                  className={`cursor-pointer transition-colors ${activeSection === row.key ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}
                >
                  <td className={`px-6 py-5 font-black ${activeSection === row.key ? 'text-white' : 'text-slate-900'}`}>{row.title}</td>
                  <td className={`px-6 py-5 text-right text-lg font-black ${activeSection === row.key ? 'text-white' : 'text-slate-900'}`}>{row.value}</td>
                  <td className={`px-6 py-5 text-sm ${activeSection === row.key ? 'text-slate-200' : 'text-slate-500'}`}>{row.subtitle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableViewport>
      </TableCard>

      {activeSection === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
            <TableCard
              title="Umumiy tushum tafsiloti"
              subtitle="Umumiy tushum ichida taomlar savdosi, xizmat haqi va to'lov tarkibi alohida ko'rsatiladi."
            >
              <TableViewport maxHeight="max-h-[480px]">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Taom</th>
                      <th className="px-6 py-4">Kategoriya</th>
                      <th className="px-6 py-4 text-right">Buyurtma soni</th>
                      <th className="px-6 py-4 text-right">Soni</th>
                      <th className="px-6 py-4 text-right">Jami</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.mealSales.length === 0 ? (
                      <EmptyRow colSpan={5} text="Tanlangan sana uchun taomlar savdosi topilmadi" />
                    ) : report.mealSales.map((item) => (
                      <tr key={`${item.mealName}-${item.categoryName}`} className="hover:bg-slate-50/70">
                        <td className="px-6 py-4 text-sm font-black text-slate-900">{item.mealName}</td>
                        <td className="px-6 py-4 text-xs font-semibold text-slate-600">{item.categoryName ?? '—'}</td>
                        <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{item.ordersCount}</td>
                        <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{item.qtyOrdered}</td>
                        <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.grossSales)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {report.mealSales.length > 0 ? (
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr className="text-xs font-black text-slate-900">
                        <td colSpan={3} className="px-6 py-4 uppercase tracking-widest">Jami</td>
                        <td className="px-6 py-4 text-right">{mealTotals.qtyOrdered}</td>
                        <td className="px-6 py-4 text-right">{formatUZS(mealTotals.grossSales)}</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </TableViewport>
            </TableCard>

            <TableCard
              title="Tushum qisqa ko'rinishi"
              subtitle="Xizmat haqi yo'qolib ketmasligi uchun alohida satrda ko'rsatiladi."
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Ko'rsatkich</th>
                      <th className="px-6 py-4 text-right">Qiymat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Yopilgan buyurtmalar</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{report.sales.closedOrders} ta</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Taomlar savdosi</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.sales.netSales)}</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Xizmat haqi</td><td className="px-6 py-4 text-right text-xs font-black text-blue-700">{formatUZS(report.sales.serviceCharge)}</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Yakuniy chek summasi</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.checks.salesVsPayments.billedTotal)}</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Naqd</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.cashflow.orderCash)}</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Karta</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.cashflow.orderCard)}</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Bugun qaytgan nasiya</td><td className="px-6 py-4 text-right text-xs font-black text-emerald-700">{formatUZS(report.debtSnapshot.repaidTodayAmount)}</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Real tushum</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.cashflow.realCashIn)}</td></tr>
                  </tbody>
                </table>
              </div>
            </TableCard>
          </div>

          <TableCard
            title="Ofitsiantlar bo'yicha jadval"
            subtitle="Har bir ofitsiant nechta buyurtma qilgani, umumiy savdosi va yozilgan umumiy xizmat haqi shu yerda ko'rinadi."
          >
            <TableViewport maxHeight="max-h-[360px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Ofitsiant</th>
                    <th className="px-6 py-4 text-right">Buyurtma soni</th>
                    <th className="px-6 py-4 text-right">Umumiy savdo</th>
                    <th className="px-6 py-4 text-right">Umumiy xizmat haqi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.perWaiter.length === 0 ? (
                    <EmptyRow colSpan={4} text="Ofitsiantlar bo'yicha ma'lumot yo'q" />
                  ) : report.perWaiter.map((item) => (
                    <tr key={item.waiterId} className="hover:bg-slate-50/70">
                      <td className="px-6 py-4 text-sm font-black text-slate-900">{item.waiterName}</td>
                      <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{item.orders}</td>
                      <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.revenue)}</td>
                      <td className="px-6 py-4 text-right text-xs font-black text-blue-700">{formatUZS(item.serviceEarned)}</td>
                    </tr>
                  ))}
                </tbody>
                {report.perWaiter.length > 0 ? (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr className="text-xs font-black text-slate-900">
                      <td className="px-6 py-4 uppercase tracking-widest">Jami</td>
                      <td className="px-6 py-4 text-right">{waiterTotals.orders}</td>
                      <td className="px-6 py-4 text-right">{formatUZS(waiterTotals.revenue)}</td>
                      <td className="px-6 py-4 text-right text-blue-700">{formatUZS(waiterTotals.serviceEarned)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableViewport>
          </TableCard>
        </div>
      )}

      {activeSection === 'expense' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.9fr)]">
          <TableCard
            title="Xarajat tafsiloti"
            subtitle="Kiritilgan chiqimlar, qaytarilgan satrlar va kategoriyalar."
          >
            <TableViewport maxHeight="max-h-[440px]">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Vaqt</th>
                    <th className="px-6 py-4">Kategoriya</th>
                    <th className="px-6 py-4">Sabab</th>
                    <th className="px-6 py-4 text-right">Imzoli summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.expenses.items.length === 0 ? (
                    <EmptyRow colSpan={4} text="Tanlangan sana uchun chiqimlar topilmadi" />
                  ) : report.expenses.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500">{formatDateTimeUZ(item.occurredAt)}</td>
                      <td className="px-6 py-4 text-xs font-black text-slate-900">{item.categoryName}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-700">{item.reason}</td>
                      <td className={`px-6 py-4 text-right text-xs font-black ${item.status === 'REVERSAL' ? 'text-rose-700' : 'text-slate-900'}`}>
                        {formatUZS(item.signedAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          </TableCard>

          <div className="space-y-6">
            <TableCard title="Xarajat qisqa ko'rinishi">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Ko'rsatkich</th>
                      <th className="px-6 py-4 text-right">Qiymat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Kiritilgan chiqim</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.checks.expenses.recordedExpense)}</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Adashib qaytarilgan</td><td className="px-6 py-4 text-right text-xs font-black text-amber-700">{formatUZS(report.checks.expenses.reversalAmount)}</td></tr>
                    <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Netto chiqim</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.expenses.net)}</td></tr>
                  </tbody>
                </table>
              </div>
            </TableCard>

            <TableCard title="Xarajat kategoriyalari">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Kategoriya</th>
                      <th className="px-6 py-4 text-right">Netto summa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.expenses.byCategory.length === 0 ? (
                      <EmptyRow colSpan={2} text="Kategoriyalar bo'yicha chiqim yo'q" />
                    ) : report.expenses.byCategory.map((item) => (
                      <tr key={item.categoryId} className="hover:bg-slate-50/70">
                        <td className="px-6 py-4 text-xs font-black text-slate-900">{item.categoryName}</td>
                        <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableCard>
          </div>
        </div>
      )}

      {activeSection === 'debt' && (
        <TableCard
          title="Qarzlar tafsiloti"
          subtitle="Bugun ochilgan, bugun qaytgan va hali yopilmagan qarzlar."
        >
          <TableViewport maxHeight="max-h-[460px]">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-6 py-4">Ochilgan vaqt</th>
                  <th className="px-6 py-4">Buyurtma</th>
                  <th className="px-6 py-4">Mijoz</th>
                  <th className="px-6 py-4 text-right">Nasiya</th>
                  <th className="px-6 py-4 text-right">Bugun qaytgan</th>
                  <th className="px-6 py-4 text-right">Jami qaytgan</th>
                  <th className="px-6 py-4 text-right">Qoldiq</th>
                  <th className="px-6 py-4">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.debtLedger.length === 0 ? (
                  <EmptyRow colSpan={8} text="Bu sana uchun nasiya harakati topilmadi" />
                ) : report.debtLedger.map((item) => (
                  <tr key={item.debtId} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4 text-xs font-semibold text-slate-500">{formatDateTimeUZ(item.openedAt)}</td>
                    <td className="px-6 py-4 text-xs font-black text-slate-900">#{item.orderNumber}</td>
                    <td className="px-6 py-4 text-xs font-black text-slate-900">{item.debtorName}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.originalAmount)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-emerald-700">{formatUZS(item.repaidToday)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.totalRepaid)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-rose-700">{formatUZS(item.remainingAmount)}</td>
                    <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
              {report.debtLedger.length > 0 ? (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr className="text-xs font-black text-slate-900">
                    <td colSpan={3} className="px-6 py-4 uppercase tracking-widest">Jami</td>
                    <td className="px-6 py-4 text-right">{formatUZS(debtTotals.originalAmount)}</td>
                    <td className="px-6 py-4 text-right">{formatUZS(debtTotals.repaidToday)}</td>
                    <td className="px-6 py-4 text-right">{formatUZS(debtTotals.totalRepaid)}</td>
                    <td className="px-6 py-4 text-right">{formatUZS(debtTotals.remainingAmount)}</td>
                    <td className="px-6 py-4" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </TableViewport>
        </TableCard>
      )}

      {activeSection === 'profit' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
          <TableCard
            title="Sof foyda tafsiloti"
            subtitle="Sof foyda qanday hosil bo'lganini oddiy formula bilan ko'rsatadi."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Ko'rsatkich</th>
                    <th className="px-6 py-4">Formula</th>
                    <th className="px-6 py-4 text-right">Qiymat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="px-6 py-4 text-sm font-black text-slate-900">Umumiy tushum</td><td className="px-6 py-4 text-sm text-slate-500">Naqd + karta + qaytgan nasiya</td><td className="px-6 py-4 text-right text-sm font-black text-slate-900">{formatUZS(report.cashflow.realCashIn)}</td></tr>
                  <tr><td className="px-6 py-4 text-sm font-black text-slate-900">Xizmat haqi</td><td className="px-6 py-4 text-sm text-slate-500">Alohida ko'rsatiladi, restoran foydasiga qo'shilmaydi</td><td className="px-6 py-4 text-right text-sm font-black text-blue-700">{formatUZS(report.sales.serviceCharge)}</td></tr>
                  <tr><td className="px-6 py-4 text-sm font-black text-slate-900">Netto chiqim</td><td className="px-6 py-4 text-sm text-slate-500">Kiritilgan chiqim - qaytarilgan</td><td className="px-6 py-4 text-right text-sm font-black text-slate-900">{formatUZS(report.expenses.net)}</td></tr>
                  <tr><td className="px-6 py-4 text-sm font-black text-slate-900">Sof foyda</td><td className="px-6 py-4 text-sm text-slate-500">Sof savdo - netto chiqim</td><td className="px-6 py-4 text-right text-sm font-black text-slate-900">{formatUZS(report.results.salesBasedProfit)}</td></tr>
                  <tr><td className="px-6 py-4 text-sm font-black text-slate-900">Pul oqimi natijasi</td><td className="px-6 py-4 text-sm text-slate-500">Umumiy tushum - netto chiqim</td><td className="px-6 py-4 text-right text-sm font-black text-slate-900">{formatUZS(report.results.cashflowBasedNet)}</td></tr>
                </tbody>
              </table>
            </div>
          </TableCard>

          <TableCard
            title="Tekshiruv"
            subtitle="Hisob xom summalar bilan mos tushganini ko'rsatadi."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Tekshiruv</th>
                    <th className="px-6 py-4 text-right">Qiymat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="px-6 py-4 text-xs font-black text-slate-900">To'lov farqi</td><td className={`px-6 py-4 text-right text-xs font-black ${Number(report.checks.salesVsPayments.difference) === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatUZS(report.checks.salesVsPayments.difference)}</td></tr>
                  <tr><td className="px-6 py-4 text-xs font-black text-slate-900">Yakuniy chek summasi</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.checks.salesVsPayments.billedTotal)}</td></tr>
                  <tr><td className="px-6 py-4 text-xs font-black text-slate-900">To'lovlar yig'indisi</td><td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(report.checks.salesVsPayments.paymentTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          </TableCard>
        </div>
      )}

      <div className="space-y-4">
        <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">Batafsil registrlar</div>

        <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none border-b border-slate-100 px-6 py-4 text-sm font-black uppercase tracking-widest text-slate-900">
            Buyurtmalar registri
          </summary>
          <TableViewport maxHeight="max-h-[520px]">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-6 py-4">Vaqt</th>
                  <th className="px-6 py-4">Buyurtma</th>
                  <th className="px-6 py-4">Joy</th>
                  <th className="px-6 py-4">Ofitsiant</th>
                  <th className="px-6 py-4">Holat</th>
                  <th className="px-6 py-4 text-right">Brutto</th>
                  <th className="px-6 py-4 text-right">Chegirma</th>
                  <th className="px-6 py-4 text-right">Sof</th>
                  <th className="px-6 py-4 text-right">Naqd</th>
                  <th className="px-6 py-4 text-right">Karta</th>
                  <th className="px-6 py-4 text-right">Qarz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.ordersTable.length === 0 ? (
                  <EmptyRow colSpan={11} text="Tanlangan sana uchun buyurtmalar topilmadi" />
                ) : report.ordersTable.map((item) => (
                  <tr key={item.orderId} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4 text-xs font-semibold text-slate-500">{formatDateTimeUZ(item.at)}</td>
                    <td className="px-6 py-4 text-xs font-black text-slate-900">#{item.orderNumber}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-600">{item.tableName ?? 'Takeaway'}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-700">{item.waiterName}</td>
                    <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.gross)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.discount)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.net)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.cash)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.card)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatUZS(item.debt)}</td>
                  </tr>
                ))}
              </tbody>
              {report.ordersTable.length > 0 ? (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr className="text-xs font-black text-slate-900">
                    <td colSpan={5} className="px-6 py-4 uppercase tracking-widest">Jami</td>
                    <td className="px-6 py-4 text-right">{formatUZS(orderTotals.gross)}</td>
                    <td className="px-6 py-4 text-right">{formatUZS(orderTotals.discount)}</td>
                    <td className="px-6 py-4 text-right">{formatUZS(orderTotals.net)}</td>
                    <td className="px-6 py-4 text-right">{formatUZS(orderTotals.cash)}</td>
                    <td className="px-6 py-4 text-right">{formatUZS(orderTotals.card)}</td>
                    <td className="px-6 py-4 text-right">{formatUZS(orderTotals.debt)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </TableViewport>
        </details>

        <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none border-b border-slate-100 px-6 py-4 text-sm font-black uppercase tracking-widest text-slate-900">
            Oshxona va tayyor bo'lgan taomlar
          </summary>
          <TableViewport maxHeight="max-h-[460px]">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-6 py-4">Taom</th>
                  <th className="px-6 py-4 text-right">Buyurtma</th>
                  <th className="px-6 py-4 text-right">Yuborilgan</th>
                  <th className="px-6 py-4 text-right">Boshlangan</th>
                  <th className="px-6 py-4 text-right">Tayyor</th>
                  <th className="px-6 py-4 text-right">Oldin bekor</th>
                  <th className="px-6 py-4 text-right">Keyin bekor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.kitchenProduction.length === 0 ? (
                  <EmptyRow colSpan={7} text="Tanlangan sana uchun oshxona harakati topilmadi" />
                ) : report.kitchenProduction.map((item) => (
                  <tr key={item.mealName} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4 text-sm font-black text-slate-900">{item.mealName}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{item.qtyOrdered}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{item.qtySent}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{item.qtyStarted}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-emerald-700">{item.qtyReady}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-amber-700">{item.qtyCanceledBeforeCooking}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-rose-700">{item.qtyCanceledAfterStart}</td>
                  </tr>
                ))}
              </tbody>
              {report.kitchenProduction.length > 0 ? (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr className="text-xs font-black text-slate-900">
                    <td className="px-6 py-4 uppercase tracking-widest">Jami</td>
                    <td className="px-6 py-4 text-right">{kitchenTotals.qtyOrdered}</td>
                    <td className="px-6 py-4 text-right">{kitchenTotals.qtySent}</td>
                    <td className="px-6 py-4 text-right">{kitchenTotals.qtyStarted}</td>
                    <td className="px-6 py-4 text-right">{kitchenTotals.qtyReady}</td>
                    <td className="px-6 py-4 text-right">{kitchenTotals.qtyCanceledBeforeCooking}</td>
                    <td className="px-6 py-4 text-right">{kitchenTotals.qtyCanceledAfterStart}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </TableViewport>
        </details>

        <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none border-b border-slate-100 px-6 py-4 text-sm font-black uppercase tracking-widest text-slate-900">
            Nasiya, chiqim va ofitsiantlar tafsiloti
          </summary>
          <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-3">
            <TableViewport maxHeight="max-h-[420px]" className="xl:col-span-2">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Ochilgan vaqt</th>
                    <th className="px-4 py-3">Buyurtma</th>
                    <th className="px-4 py-3">Mijoz</th>
                    <th className="px-4 py-3 text-right">Nasiya</th>
                    <th className="px-4 py-3 text-right">Bugun qaytgan</th>
                    <th className="px-4 py-3 text-right">Qoldiq</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.debtLedger.length === 0 ? (
                    <EmptyRow colSpan={6} text="Bu sana uchun nasiya harakati topilmadi" />
                  ) : report.debtLedger.map((item) => (
                    <tr key={item.debtId}>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500">{formatDateTimeUZ(item.openedAt)}</td>
                      <td className="px-4 py-3 text-xs font-black text-slate-900">#{item.orderNumber}</td>
                      <td className="px-4 py-3 text-xs font-black text-slate-900">{item.debtorName}</td>
                      <td className="px-4 py-3 text-right text-xs font-black text-slate-900">{formatUZS(item.originalAmount)}</td>
                      <td className="px-4 py-3 text-right text-xs font-black text-emerald-700">{formatUZS(item.repaidToday)}</td>
                      <td className="px-4 py-3 text-right text-xs font-black text-rose-700">{formatUZS(item.remainingAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                {report.debtLedger.length > 0 ? (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr className="text-xs font-black text-slate-900">
                      <td colSpan={3} className="px-4 py-3 uppercase tracking-widest">Jami</td>
                      <td className="px-4 py-3 text-right">{formatUZS(debtTotals.originalAmount)}</td>
                      <td className="px-4 py-3 text-right">{formatUZS(debtTotals.repaidToday)}</td>
                      <td className="px-4 py-3 text-right">{formatUZS(debtTotals.remainingAmount)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </TableViewport>

            <div className="space-y-6">
              <TableViewport maxHeight="max-h-[360px]" className="rounded-xl border border-slate-200">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Vaqt</th>
                      <th className="px-4 py-3">Kategoriya</th>
                      <th className="px-4 py-3 text-right">Imzoli summa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.expenses.items.length === 0 ? (
                      <EmptyRow colSpan={3} text="Chiqim satrlari yo'q" />
                    ) : report.expenses.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">{formatDateTimeUZ(item.occurredAt)}</td>
                        <td className="px-4 py-3 text-xs font-black text-slate-900">{item.categoryName}</td>
                        <td className={`px-4 py-3 text-right text-xs font-black ${item.status === 'REVERSAL' ? 'text-rose-700' : 'text-slate-900'}`}>
                          {formatUZS(item.signedAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableViewport>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

const UZBEK_DAY_ABBR = ['Du', 'Se', 'Ch', 'Pe', 'Ju', 'Sh', 'Ya'];

function formatDateLabel(dateStr: string) {
  const [year, monthPart, day] = dateStr.split('-');
  return `${Number(day)} ${UZBEK_MONTHS[Number(monthPart) - 1] ?? monthPart} ${year}`;
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

function MonthlyView({ report }: { report: MonthlyReport }) {
  const [selectedDay, setSelectedDay] = useState<DailyReport | null>(null);

  const [yearNum, monthNum] = report.month.split('-').map(Number);
  const summary = useMemo(() => buildMonthlySummary(report), [report]);
  const calendarRows = useMemo(
    () => buildCalendarGrid(yearNum, monthNum, report.daily),
    [yearNum, monthNum, report.daily],
  );

  const summaryItems = [
    { label: 'Umumiy tushum', value: formatUZS(report.totals.realCashIn), color: 'text-slate-900' },
    { label: 'Umumiy xarajat', value: formatUZS(report.totals.expensesNet), color: 'text-slate-900' },
    { label: 'Xizmat haqi', value: formatUZS(summary.serviceChargeTotal), color: 'text-blue-700' },
    { label: 'Nasiya qoldig\'i', value: formatUZS(report.totals.outstandingDebtEndOfMonth), color: 'text-rose-700' },
    { label: 'Sof foyda', value: formatUZS(report.totals.salesBasedProfit), color: 'text-slate-900' },
    { label: 'Buyurtmalar', value: `${report.totals.closedOrders} ta`, color: 'text-slate-900' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</div>
            <div className={`mt-1.5 text-base font-black ${item.color}`}>{item.value}</div>
          </div>
        ))}
      </div>

      <TableCard
        title={`${formatMonthLabel(report.month)} — kunlik taqvim`}
        subtitle="Kunni bosganingizda o'sha kunning to'liq hisoboti ochiladi."
      >
        <div className="p-6">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {UZBEK_DAY_ABBR.map((d) => (
              <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                {d}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {calendarRows.map((row, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-7 gap-2">
                {row.map((cell, cellIdx) => {
                  if (!cell.day) {
                    return <div key={cellIdx} className="h-20 rounded-xl" />;
                  }
                  const hasActivity = cell.report
                    && (cell.report.sales.closedOrders > 0 || Number(cell.report.cashflow.realCashIn) > 0);
                  return (
                    <button
                      key={cellIdx}
                      type="button"
                      disabled={!hasActivity}
                      onClick={() => cell.report && setSelectedDay(cell.report)}
                      className={`h-20 w-full rounded-xl border p-2 text-left transition-all ${
                        hasActivity
                          ? 'cursor-pointer border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 hover:shadow-sm'
                          : 'cursor-default border-slate-100 bg-slate-50/50'
                      }`}
                    >
                      <div className={`text-sm font-black ${hasActivity ? 'text-slate-900' : 'text-slate-300'}`}>
                        {cell.day}
                      </div>
                      {hasActivity && cell.report ? (
                        <div className="mt-1 space-y-0.5">
                          <div className="text-[10px] font-semibold text-slate-500">
                            {cell.report.sales.closedOrders} ta
                          </div>
                          <div className="truncate text-[10px] font-black leading-tight text-slate-700">
                            {formatUZS(cell.report.cashflow.realCashIn)}
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
      </TableCard>

      {selectedDay ? (
        <Modal
          title={`${formatDateLabel(selectedDay.date)} — kunlik hisobot`}
          onClose={() => setSelectedDay(null)}
          maxWidth="max-w-7xl"
        >
          <DailyView report={selectedDay} />
        </Modal>
      ) : null}
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');
  const [date, setDate] = useState(localDateString);
  const [month, setMonth] = useState(localMonthString);
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
      <DeprecationBanner
        message="Bu hisobot sahifasi keyingi bosqichda yangi «Foyda paneli» bilan almashtiriladi."
        replacement="Mahsulot tannarxiga asoslangan haqiqiy foyda hisoboti REFACTOR_PLAN 4-bosqichida tayyor bo'ladi."
      />
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white shadow-lg">
              {tab === 'daily' ? <ChefHat size={28} /> : <Layers3 size={28} />}
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Moliyaviy hisobotlar</h1>
              <p className="text-sm text-slate-500">
                Buyurtma, taom, oshxona, qarz va chiqim bo'yicha aniq owner hisobotlari.
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              onClick={() => setTab('daily')}
              className={`rounded-lg px-5 py-2 text-xs font-black uppercase tracking-widest ${
                tab === 'daily' ? 'bg-slate-900 text-white' : 'text-slate-500'
              }`}
            >
              Kunlik
            </button>
            <button
              onClick={() => setTab('monthly')}
              className={`rounded-lg px-5 py-2 text-xs font-black uppercase tracking-widest ${
                tab === 'monthly' ? 'bg-slate-900 text-white' : 'text-slate-500'
              }`}
            >
              Oylik
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          {tab === 'daily' ? (
            <label className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Calendar size={12} />
                Sana
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-sm font-black outline-none"
              />
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
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

              <label className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
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
                    return <option key={value} value={value}>{label}</option>;
                  })}
                </select>
              </label>
            </div>
          )}

          <button
            onClick={() => (tab === 'daily' ? dailyQuery.refetch() : monthlyQuery.refetch())}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-700 shadow-sm"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Yangilash
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm font-bold uppercase tracking-widest text-slate-400 shadow-sm">
          Hisobot yuklanmoqda...
        </div>
      ) : null}

      {!isLoading && tab === 'daily' && dailyQuery.data ? <DailyView report={dailyQuery.data} /> : null}

      {!isLoading && tab === 'monthly' && monthlyQuery.data ? (
        <MonthlyView report={monthlyQuery.data} />
      ) : null}
    </div>
  );
}
