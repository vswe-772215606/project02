import { api } from './client';
import { User } from './auth';

export interface OrderLine {
  id: string;
  orderId: string;
  menuItemId: string | null;
  comboId: string | null;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELED';
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  tableId: string | null;
  waiterId: string;
  status: 'ACTIVE' | 'BILL_REQUESTED' | 'PAID' | 'CANCELED' | 'WALKOUT';
  itemCount: number;
  totalAmount: number;
  discountId: string | null;
  serviceChargeWaived: boolean;
  createdAt: string;
  updatedAt: string;
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
  requestBill: (id: string) => api.post<Order>(`/api/orders/${id}/request-bill`),
  cancelOrder: (id: string, reason: string) => 
    api.post<Order>(`/api/orders/${id}/cancel`, { reason }),
  approve: (id: string, data: { discountId?: string; serviceChargeWaived?: boolean }) => 
    api.post<Order>(`/api/orders/${id}/approve`, data),
  markPaid: (id: string, data: { payments: { method: string; amount: number; reference?: string }[] }) => 
    api.post<Order>(`/api/orders/${id}/mark-paid`, data),
  markWalkout: (id: string, reason: string) => 
    api.post<Order>(`/api/orders/${id}/mark-walkout`, { reason }),
  reprintBill: (id: string, reason?: string) => 
    api.post<{ id: string }>(`/api/orders/${id}/reprint-bill`, { reason }),
};
