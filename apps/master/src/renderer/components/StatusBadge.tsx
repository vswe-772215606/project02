import React from 'react';
import { 
  FileText, 
  Send, 
  Receipt, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Ban,
  LucideIcon
} from 'lucide-react';

export type OrderStatus = 'DRAFT' | 'SENT' | 'BILL_REQUESTED' | 'PENDING_PAYMENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';
export type KitchenTicketStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'CANCELED';

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  color: string;
}

const statusConfig: Record<OrderStatus, StatusConfig> = {
  DRAFT: { label: 'Qoralama', icon: FileText, color: 'bg-slate-100 text-slate-600 border-slate-200' },
  SENT: { label: 'Yuborilgan', icon: Send, color: 'bg-blue-100 text-blue-600 border-blue-200' },
  BILL_REQUESTED: { label: 'Hisob so\'ralgan', icon: Receipt, color: 'bg-amber-100 text-amber-600 border-amber-200' },
  PENDING_PAYMENT: { label: 'To\'lov kutilmoqda', icon: Clock, color: 'bg-orange-100 text-orange-600 border-orange-200' },
  CLOSED: { label: 'Yopilgan', icon: CheckCircle2, color: 'bg-green-100 text-green-600 border-green-200' },
  WALKOUT: { label: 'To\'lanmagan', icon: XCircle, color: 'bg-red-100 text-red-600 border-red-200' },
  CANCELED: { label: 'Bekor qilingan', icon: Ban, color: 'bg-slate-200 text-slate-500 border-slate-300' },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const config = statusConfig[status];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-semibold space-x-1.5 ${config.color}`}>
      <Icon size={14} />
      <span>{config.label}</span>
    </span>
  );
}

export function KitchenStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: 'bg-slate-100 text-slate-600 border-slate-200',
    IN_PROGRESS: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    READY: 'bg-green-100 text-green-700 border-green-200',
    CANCELED: 'bg-red-100 text-red-700 border-red-200',
  };
  
  const labels: Record<string, string> = {
    PENDING: 'Kutilmoqda',
    IN_PROGRESS: 'Tayyorlanmoqda',
    READY: 'Tayyor',
    CANCELED: 'Bekor qilingan',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${colors[status] || colors.PENDING}`}>
      {labels[status] || status}
    </span>
  );
}
