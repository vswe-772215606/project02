import React from 'react';
import {
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  LucideIcon,
} from 'lucide-react';

export type OrderStatus = 'DRAFT' | 'SENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  color: string;
}

const statusConfig: Record<OrderStatus, StatusConfig> = {
  DRAFT: { label: 'Qoralama', icon: FileText, color: 'bg-slate-100 text-slate-600 border-slate-200' },
  SENT: { label: 'Yuborilgan', icon: Send, color: 'bg-blue-100 text-blue-600 border-blue-200' },
  CLOSED: { label: 'Yopilgan', icon: CheckCircle2, color: 'bg-green-100 text-green-600 border-green-200' },
  WALKOUT: { label: "To'lamay ketdi", icon: XCircle, color: 'bg-red-100 text-red-600 border-red-200' },
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
