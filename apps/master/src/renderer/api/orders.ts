import { api } from './client';
import { User } from './auth';

export type PaymentMethod = 'CASH' | 'CARD' | 'DEBT';

export interface ConfirmPayment {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface ConfirmBody {
  discountId?: string | null;
  // Ad-hoc discount amount in so'm — preferred over discountId for the
  // new confirm flow. When set, the server uses it directly (no preset/percent).
  discountAmount?: number | null;
  waiveServiceCharge?: boolean;
  payments: ConfirmPayment[];
  debt?: {
    debtorName: string;
    debtorPhone?: string;
    note?: string;
  };
}

export interface OrderLine {
  id: string;
  orderId: string;
  menuItemId: string | null;
  menuItemKind: 'FOOD' | 'SERVICE';
  comboId: string | null;
  comboGroupId?: string | null;
  comboNameSnapshot?: string | null;
  name: string;
  nameSnapshot: string;
  price: number;
  quantity: number;
  notes: string | null;
  status: string; // Internal line status if used
  isCanceled: boolean;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  tableId: string | null;
  tableName: string | null;
  waiterId: string;
  status: 'DRAFT' | 'SENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';
  itemCount: number;
  totalAmount: number;
  subtotalSnapshot: number | null;
  discountAmountSnapshot: number | null;
  serviceChargeSnapshot: number | null;
  totalSnapshot: number | null;
  discountId: string | null;
  serviceChargeWaived: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  debt?: {
    id: string;
    debtorName: string;
    originalAmount: number;
    remainingAmount: number;
    status: 'OPEN' | 'PARTIAL' | 'PAID';
  } | null;
  lines?: OrderLine[];
  waiter?: User;
}

export const ordersApi = {
  list: (params?: { status?: string; mine?: boolean; date?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.mine) q.append('mine', 'true');
    if (params?.date) q.append('date', params.date);
    const qs = q.toString();
    return api.get<Order[]>(`/api/orders${qs ? '?' + qs : ''}`);
  },
  getById: (id: string) => api.get<Order>(`/api/orders/${id}`),
  create: (data: { orderType: string; tableId?: string }) =>
    api.post<Order>('/api/orders', data),
  addItem: (id: string, data: { menuItemId: string; quantity: number; notes?: string }) =>
    api.post<OrderLine>(`/api/orders/${id}/items`, data),
  addCombo: (id: string, data: { comboId: string }) =>
    api.post<OrderLine[]>(`/api/orders/${id}/combos`, data),
  updateLineNotes: (id: string, lineId: string, notes: string) =>
    api.patch<OrderLine>(`/api/orders/${id}/lines/${lineId}/notes`, { notes }),
  cancelLine: (id: string, lineId: string, reason?: string) =>
    api.post<OrderLine>(`/api/orders/${id}/lines/${lineId}/cancel`, { reason }),
  send: (id: string) => api.post<Order>(`/api/orders/${id}/send`),
  transfer: (id: string, tableId: string) =>
    api.post<Order>(`/api/orders/${id}/transfer`, { tableId }),
  cancelOrder: (id: string, reason: string) =>
    api.post<Order>(`/api/orders/${id}/cancel`, { reason }),
  confirm: (id: string, body: ConfirmBody) =>
    api.post<Order>(`/api/orders/${id}/confirm`, body),
  markWalkout: (id: string, reason: string) =>
    api.post<Order>(`/api/orders/${id}/mark-walkout`, { reason }),
  reprintBill: (id: string, reason?: string) =>
    api.post<{ id: string }>(`/api/orders/${id}/reprint-bill`, { reason }),
};
