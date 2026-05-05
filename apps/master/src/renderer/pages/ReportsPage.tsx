import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, RefreshCw } from 'lucide-react';
import { reportsApi } from '../api/reports';
import { ForbiddenMessage } from '../components/ForbiddenMessage';
import { formatUZS } from '../utils/format';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function localMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function StatCard(props: { title: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-sm text-slate-500">{props.title}</div>
      <div className="mt-1 text-2xl font-bold text-slate-800">{props.value}</div>
      {props.detail && <div className="mt-2 text-xs text-slate-500">{props.detail}</div>}
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');
  const [date, setDate] = useState(localDateString);
  const [month, setMonth] = useState(localMonthString);

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

  const isForbidden = (dailyQuery.error as any)?.message === 'Forbidden'
    || (monthlyQuery.error as any)?.message === 'Forbidden'
    || (dailyQuery.error as any)?.code === 'FORBIDDEN'
    || (monthlyQuery.error as any)?.code === 'FORBIDDEN';

  if (isForbidden) {
    return <ForbiddenMessage />;
  }

  const daily = dailyQuery.data;
  const monthly = monthlyQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Hisobotlar</h1>
            <p className="text-slate-500">Owner uchun moliyaviy yakunlar</p>
          </div>
        </div>
        {(dailyQuery.isFetching || monthlyQuery.isFetching) && <RefreshCw className="animate-spin text-slate-400" size={18} />}
      </div>

      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-slate-200 p-1">
          <button onClick={() => setTab('daily')} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${tab === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>Kunlik</button>
          <button onClick={() => setTab('monthly')} className={`rounded-md px-4 py-1.5 text-sm font-semibold ${tab === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>Oylik</button>
        </div>
        {tab === 'daily' ? (
          <input type="date" className="rounded-lg border border-slate-300 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
        ) : (
          <input type="month" className="rounded-lg border border-slate-300 px-3 py-2" value={month} onChange={(e) => setMonth(e.target.value)} />
        )}
      </div>

      {tab === 'daily' && (
        <>
          {dailyQuery.isLoading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">Yuklanmoqda...</div>}
          {daily && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard title="Brutto savdo" value={formatUZS(daily.sales.grossSales)} detail={`Chegirma: ${formatUZS(daily.sales.discounts)}`} />
                <StatCard title="Sof savdo" value={formatUZS(daily.sales.netSales)} detail={`Qarzga savdo: ${formatUZS(daily.sales.debtSales)}`} />
                <StatCard title="Real tushgan pul" value={formatUZS(daily.cashflow.realCashIn)} detail={`Qaytgan qarz: ${formatUZS(daily.debtSnapshot.repaidTodayAmount)}`} />
                <StatCard title="Kunlik chiqim" value={formatUZS(daily.expenses.net)} detail={`Bekor qilingan: ${formatUZS(daily.expenses.reversal)}`} />
                <StatCard title="Savdo foydasi" value={formatUZS(daily.results.salesBasedProfit)} detail="Sof savdo - chiqim" />
                <StatCard title="Pul oqimi natijasi" value={formatUZS(daily.results.cashflowBasedNet)} detail="Real tushum - chiqim" />
                <StatCard title="Xizmat haqi" value={formatUZS(daily.sales.serviceCharge)} detail={`Yopilgan buyurtmalar: ${daily.sales.closedOrders}`} />
                <StatCard title="Qarz qoldig'i" value={formatUZS(daily.debtSnapshot.outstandingTotal)} detail={`Bugun ochilgan: ${formatUZS(daily.debtSnapshot.openedTodayAmount)}`} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-800">Chiqimlar kesimi</div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Tur</th>
                        <th className="px-4 py-3 text-right">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.expenses.byCategory.map((item: any) => (
                        <tr key={item.categoryId} className="border-t border-slate-100">
                          <td className="px-4 py-3">{item.categoryName}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatUZS(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-800">Ofitsiantlar kesimi</div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Ofitsiant</th>
                        <th className="px-4 py-3 text-center">Buyurtma</th>
                        <th className="px-4 py-3 text-right">Tushum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.perWaiter.map((item: any) => (
                        <tr key={item.waiterId} className="border-t border-slate-100">
                          <td className="px-4 py-3">{item.waiterName}</td>
                          <td className="px-4 py-3 text-center">{item.orders}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatUZS(item.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'monthly' && (
        <>
          {monthlyQuery.isLoading && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">Yuklanmoqda...</div>}
          {monthly && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard title="Oylik brutto savdo" value={formatUZS(monthly.totals.grossSales)} />
                <StatCard title="Oylik sof savdo" value={formatUZS(monthly.totals.netSales)} detail={`Qarzga savdo: ${formatUZS(monthly.totals.debtSales)}`} />
                <StatCard title="Oylik real tushum" value={formatUZS(monthly.totals.realCashIn)} />
                <StatCard title="Oylik chiqim" value={formatUZS(monthly.totals.expensesNet)} />
                <StatCard title="Savdo foydasi" value={formatUZS(monthly.totals.salesBasedProfit)} />
                <StatCard title="Pul oqimi natijasi" value={formatUZS(monthly.totals.cashflowBasedNet)} />
                <StatCard title="Oy oxiri qarz qoldig'i" value={formatUZS(monthly.totals.outstandingDebtEndOfMonth)} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Sana</th>
                      <th className="px-4 py-3 text-right">Sof savdo</th>
                      <th className="px-4 py-3 text-right">Real tushum</th>
                      <th className="px-4 py-3 text-right">Chiqim</th>
                      <th className="px-4 py-3 text-right">Savdo foydasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.daily.map((day: any) => (
                      <tr key={day.date} className="border-t border-slate-100">
                        <td className="px-4 py-3">{day.date}</td>
                        <td className="px-4 py-3 text-right">{formatUZS(day.sales.netSales)}</td>
                        <td className="px-4 py-3 text-right">{formatUZS(day.cashflow.realCashIn)}</td>
                        <td className="px-4 py-3 text-right">{formatUZS(day.expenses.net)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatUZS(day.results.salesBasedProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
