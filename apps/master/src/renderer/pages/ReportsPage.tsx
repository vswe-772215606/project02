import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  CreditCard,
  Banknote,
  Users as UsersIcon,
  XCircle,
  Ban,
  RefreshCw,
  Wallet,
  Receipt,
  User
} from 'lucide-react';
import { reportsApi } from '../api/reports';
import { formatUZS, formatDateTimeUZ } from '../utils/format';

export function ReportsPage() {
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const { data: dailyData, isLoading: isLoadingDaily } = useQuery({
    queryKey: ['reports', 'daily', date],
    queryFn: () => reportsApi.getDaily(date),
    enabled: tab === 'daily',
  });

  const { data: monthlyData, isLoading: isLoadingMonthly } = useQuery({
    queryKey: ['reports', 'monthly', month],
    queryFn: () => reportsApi.getMonthly(month),
    enabled: tab === 'monthly',
  });

  const renderDaily = () => {
    if (isLoadingDaily) return <div className="flex items-center justify-center p-12"><RefreshCw className="animate-spin text-blue-500" /></div>;
    if (!dailyData) return null;

    return (
      <div className="space-y-6">
        {/* Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Sotuvlar (Netto)" 
            value={formatUZS(dailyData.revenue.net)} 
            icon={TrendingUp} 
            color="bg-blue-500" 
            detail={`Brutto: ${formatUZS(dailyData.revenue.gross)}`}
          />
          <StatCard 
            title="Buyurtmalar" 
            value={dailyData.orders.closed} 
            icon={Receipt} 
            color="bg-green-500" 
            detail={`Jami: ${dailyData.orders.total} (Bekor: ${dailyData.orders.canceled})`}
          />
          <StatCard 
            title="Xizmat haqi" 
            value={formatUZS(dailyData.serviceCollected)} 
            icon={Wallet} 
            color="bg-purple-500" 
            detail="Ofitsiantlar ulushi"
          />
          <StatCard 
            title="To'lovlar" 
            value={`${formatUZS(dailyData.payments.cash)} / ${formatUZS(dailyData.payments.card)}`} 
            icon={CreditCard} 
            color="bg-orange-500" 
            detail="Naqd / Plastik"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Waiter Performance */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center space-x-2">
                <UsersIcon size={18} className="text-blue-500" />
                <span>Ofitsiantlar ish faoliyati</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Ofitsiant</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase text-center">Buyurtmalar</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase text-right">Sof tushum</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase text-right">Xizmat haqi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyData.perWaiter.map((w: any) => (
                    <tr key={w.waiterId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">{w.waiterName}</td>
                      <td className="px-6 py-4 text-center">{w.orders}</td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-700">{formatUZS(w.revenue)}</td>
                      <td className="px-6 py-4 text-right text-purple-600 font-medium">{formatUZS(w.serviceEarned)}</td>
                    </tr>
                  ))}
                  {dailyData.perWaiter.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Ma'lumotlar yo'q</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cancellations & Walkouts Summary */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-red-50/30">
                <h3 className="font-bold text-red-800 flex items-center space-x-2">
                  <XCircle size={18} />
                  <span>To'lovsiz ketganlar</span>
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {dailyData.walkouts.map((w: any) => (
                  <div key={w.orderId} className="p-3 border border-red-100 rounded-lg bg-red-50/20">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-red-700">ID: {w.orderId.slice(-6).toUpperCase()}</span>
                      <span className="text-xs text-slate-500">{formatDateTimeUZ(new Date(w.markedAt))}</span>
                    </div>
                    <div className="text-sm font-bold text-slate-800">{formatUZS(w.amount)}</div>
                    <div className="text-xs text-slate-600 italic">Sabab: {w.reason}</div>
                  </div>
                ))}
                {dailyData.walkouts.length === 0 && <p className="text-center text-slate-400 text-sm py-4">To'lovsiz ketganlar yo'q</p>}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-700 flex items-center space-x-2">
                  <Ban size={18} />
                  <span>Bekor qilinganlar</span>
                </h3>
              </div>
              <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                {dailyData.cancellations.map((c: any) => (
                  <div key={c.orderId} className="p-3 border border-slate-100 rounded-lg">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-slate-700">ID: {c.orderId.slice(-6).toUpperCase()}</span>
                      <span className="text-xs text-slate-500">{formatDateTimeUZ(new Date(c.canceledAt))}</span>
                    </div>
                    <div className="text-xs text-slate-600 italic">Sabab: {c.reason}</div>
                  </div>
                ))}
                {dailyData.cancellations.length === 0 && <p className="text-center text-slate-400 text-sm py-4">Bekor qilinganlar yo'q</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthly = () => {
    if (isLoadingMonthly) return <div className="flex items-center justify-center p-12"><RefreshCw className="animate-spin text-blue-500" /></div>;
    if (!monthlyData) return null;

    const { totals } = monthlyData;

    return (
      <div className="space-y-6">
        {/* Monthly Totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard 
            title="Oylik tushum (Netto)" 
            value={formatUZS(totals.net)} 
            icon={TrendingUp} 
            color="bg-blue-600" 
            detail={`Brutto: ${formatUZS(totals.gross)}`}
          />
          <StatCard 
            title="Oylik buyurtmalar" 
            value={totals.ordersClosed} 
            icon={Receipt} 
            color="bg-green-600" 
            detail={`Bekor qilingan: ${totals.ordersCanceled}`}
          />
          <StatCard 
            title="Oylik xizmat haqi" 
            value={formatUZS(totals.serviceCollected)} 
            icon={Wallet} 
            color="bg-purple-600" 
            detail="Jami yig'ilgan"
          />
        </div>

        {/* Day-by-Day Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">Kunbay tahlil</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Sana</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase text-center">Buyurtmalar</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase text-right">Sof tushum</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase text-right">Chegirmalar</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase text-center">To'lovsiz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyData.daily.map((d: any) => (
                  <tr key={d.date} className={`hover:bg-slate-50/50 transition-colors ${d.orders.total === 0 ? 'opacity-40' : ''}`}>
                    <td className="px-6 py-4 font-medium text-slate-800">{new Date(d.date).toLocaleDateString('uz-UZ')}</td>
                    <td className="px-6 py-4 text-center">{d.orders.closed}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-700">{formatUZS(d.revenue.net)}</td>
                    <td className="px-6 py-4 text-right text-red-500">{formatUZS(d.revenue.discounts)}</td>
                    <td className="px-6 py-4 text-center">
                      {d.orders.walkout > 0 ? (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">{d.orders.walkout}</span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Hisobotlar</h1>
            <p className="text-slate-500">Moliya va ish faoliyati tahlili</p>
          </div>
        </div>

        <div className="flex bg-slate-200 p-1 rounded-lg self-start">
          <button 
            onClick={() => setTab('daily')}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${tab === 'daily' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Kunlik
          </button>
          <button 
            onClick={() => setTab('monthly')}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${tab === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
          >
            Oylik
          </button>
        </div>

        <div className="flex items-center space-x-3">
          {tab === 'daily' ? (
            <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
              <Calendar size={16} className="text-slate-400" />
              <input 
                type="date" 
                value={date} 
                onChange={(e) => setDate(e.target.value)}
                className="border-none focus:ring-0 text-sm font-medium text-slate-700 bg-transparent"
              />
            </div>
          ) : (
            <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
              <Calendar size={16} className="text-slate-400" />
              <input 
                type="month" 
                value={month} 
                onChange={(e) => setMonth(e.target.value)}
                className="border-none focus:ring-0 text-sm font-medium text-slate-700 bg-transparent"
              />
            </div>
          )}
        </div>
      </div>

      {tab === 'daily' ? renderDaily() : renderMonthly()}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, detail }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-xl font-black text-slate-800">{value}</p>
        </div>
        <div className={`p-2 rounded-lg text-white ${color}`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="text-[10px] font-bold text-slate-400 uppercase">{detail}</div>
    </div>
  );
}
