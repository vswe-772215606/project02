import React from 'react';
import { StatusBadge, OrderStatus } from '../components/StatusBadge';
import { LayoutDashboard } from 'lucide-react';

export function DashboardPage() {
  const exampleStatuses: OrderStatus[] = [
    'SENT',
    'BILL_REQUESTED',
    'PENDING_PAYMENT',
    'CLOSED',
    'WALKOUT',
    'CANCELED'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <LayoutDashboard className="text-slate-400" size={28} />
        <h1 className="text-2xl font-bold text-slate-800">Bosh sahifa</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="text-slate-500 text-sm font-medium">Faol buyurtmalar</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">12</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="text-slate-500 text-sm font-medium">Tasdiqlash kutilmoqda</div>
          <div className="text-3xl font-bold text-slate-900 mt-1">3</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="text-slate-500 text-sm font-medium">Bugungi tushum</div>
          <div className="text-3xl font-bold text-green-600 mt-1">4,250,000 UZS</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 font-semibold text-slate-800">
          Namuna statuslar
        </div>
        <div className="p-6 flex flex-wrap gap-3">
          {exampleStatuses.map(status => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </div>
    </div>
  );
}
