import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  ClipboardCheck, 
  Clock, 
  History,
  ArrowRight,
  TrendingUp,
  Table as TableIcon,
  User as UserIcon
} from 'lucide-react';
import { ordersApi } from '../api/orders';
import { StatusBadge } from '../components/StatusBadge';
import { formatUZS, formatDateTimeUZ } from '../utils/format';
import { Link } from 'react-router-dom';
import { summarizeOrderLines } from '../utils/order-line-summary';

export function DashboardPage() {
  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['orders', 'dashboard'],
    queryFn: () => ordersApi.list(),
    refetchInterval: 10000,
  });

  const activeCount = allOrders.filter(o => o.status === 'SENT' || o.status === 'BILL_REQUESTED').length;
  const pendingApprovalCount = allOrders.filter(o => o.status === 'BILL_REQUESTED').length;
  const pendingPaymentCount = allOrders.filter(o => o.status === 'PENDING_PAYMENT').length;

  const recentOrders = [...allOrders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <LayoutDashboard className="text-slate-400" size={28} />
          <h1 className="text-2xl font-bold text-slate-800">Bosh sahifa</h1>
        </div>
        <div className="text-sm font-medium text-slate-500 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
          Bugun: {new Date().toLocaleDateString('uz-UZ')}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          label="Faol buyurtmalar" 
          value={activeCount} 
          icon={ShoppingBag} 
          color="blue" 
          description="Hozirgi vaqtda tayyorlanayotgan"
        />
        <StatCard 
          label="Tasdiqlash kutilmoqda" 
          value={pendingApprovalCount} 
          icon={ClipboardCheck} 
          color="amber" 
          description="Hisob so'ralgan buyurtmalar"
          link="/approval-queue"
        />
        <StatCard 
          label="To'lov kutilmoqda" 
          value={pendingPaymentCount} 
          icon={Clock} 
          color="green" 
          description="Tasdiqlangan, to'lov kutilmoqda"
          link="/orders"
        />
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="text-slate-400" size={20} />
            <h2 className="font-bold text-slate-800">Yaqinda bo'lgan harakatlar</h2>
          </div>
          <Link to="/orders" className="text-blue-600 hover:text-blue-700 text-sm font-bold flex items-center space-x-1">
            <span>Hammasini ko'rish</span>
            <ArrowRight size={16} />
          </Link>
        </div>

        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            Hozircha ma'lumotlar yo'q
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-widest border-b border-slate-100">
                  <th className="px-6 py-4 font-bold">Buyurtma</th>
                  <th className="px-6 py-4 font-bold">Vaqt</th>
                  <th className="px-6 py-4 font-bold">Stol / Waiter</th>
                  <th className="px-6 py-4 font-bold">Summa</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map((order) => {
                  const mealSummary = summarizeOrderLines(order.lines);

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <span className="font-bold text-slate-700">#{order.orderNumber}</span>
                          {mealSummary && (
                            <p
                              className="max-w-xs text-xs text-slate-500"
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {mealSummary}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-500">{formatDateTimeUZ(order.createdAt)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-1 text-sm font-medium text-slate-700">
                            <TableIcon size={14} className="text-slate-400" />
                            <span>{order.tableId || 'Olib ketish'}</span>
                          </div>
                          <div className="flex items-center space-x-1 text-xs text-slate-400 mt-0.5">
                            <UserIcon size={12} />
                            <span>{order.waiter?.fullName}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {formatUZS(order.totalSnapshot || order.totalAmount)}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={order.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mini Charts / Other info could go here */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shadow-blue-200">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp size={24} className="opacity-80" />
            <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded">LIVE</span>
          </div>
          <h3 className="text-lg font-medium opacity-90">Ish samaradorligi</h3>
          <p className="text-sm opacity-70 mt-1 mb-4">Barcha tizimlar normal ishlamoqda.</p>
          <div className="text-3xl font-black">100%</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, description, link }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100 shadow-blue-50',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 shadow-amber-50',
    green: 'bg-green-50 text-green-600 border-green-100 shadow-green-50',
  };

  const CardContent = (
    <div className={`p-6 rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${link ? 'cursor-pointer group' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">{label}</div>
          <div className="text-4xl font-black text-slate-900">{value}</div>
          <div className="text-xs text-slate-400 mt-2 font-medium">{description}</div>
        </div>
        <div className={`p-3 rounded-xl border ${colors[color]}`}>
          <Icon size={24} />
        </div>
      </div>
      {link && (
        <div className="mt-4 pt-4 border-t border-slate-50 flex items-center text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
          <span>Batafsil</span>
          <ArrowRight size={14} className="ml-1" />
        </div>
      )}
    </div>
  );

  return link ? <Link to={link}>{CardContent}</Link> : CardContent;
}
