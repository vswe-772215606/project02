import { api } from './client';

export type OrderStatus = 'DRAFT' | 'SENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';
export type OrderType = 'DINE_IN' | 'TAKEAWAY';

export type OrderLine = {
  id: string;
  orderId: string;
  menuItemId: string | null;
  menuItemKind: 'FOOD' | 'SERVICE';
  comboGroupId: string | null;
  comboNameSnapshot: string | null;
  name: string;
  nameSnapshot: string;
  price: number;
  quantity: number;
  notes: string | null;
  isCanceled: boolean;
  createdAt: string;
  menuItem?: { id: string; name: string; price: number } | null;
};

export type OrderTable = {
  id: string;
  name: string;
  type: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  status: OrderStatus;
  tableId: string | null;
  table: OrderTable | null;
  waiterId: string;
  itemCount: number;
  totalAmount: number;
  subtotalSnapshot: number | null;
  discountAmountSnapshot: number | null;
  serviceChargeSnapshot: number | null;
  totalSnapshot: number | null;
  createdAt: string;
  updatedAt: string;
  lines: OrderLine[];
};

export const ordersApi = {
  list: (params?: { mine?: boolean; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.mine) q.set('mine', 'true');
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return api.get<Order[]>(`/api/orders${qs ? `?${qs}` : ''}`);
  },
  getById: (id: string) => api.get<Order>(`/api/orders/${id}`),
  create: (body: { orderType: OrderType; tableId?: string }) =>
    api.post<Order>('/api/orders', body),
  addItem: (orderId: string, body: { menuItemId: string; quantity: number; notes?: string }) =>
    api.post<OrderLine>(`/api/orders/${orderId}/items`, body),
  addCombo: (orderId: string, body: { comboId: string }) =>
    api.post<OrderLine[]>(`/api/orders/${orderId}/combos`, body),
  updateLineQuantity: (orderId: string, lineId: string, quantity: number) =>
    api.patch<OrderLine>(`/api/orders/${orderId}/lines/${lineId}/quantity`, { quantity }),
  editLineNote: (orderId: string, lineId: string, notes: string) =>
    api.patch<OrderLine>(`/api/orders/${orderId}/lines/${lineId}/notes`, { notes }),
  cancelLine: (orderId: string, lineId: string, reason?: string) =>
    api.post<OrderLine>(`/api/orders/${orderId}/lines/${lineId}/cancel`, { reason }),
  send: (orderId: string) => api.post<Order>(`/api/orders/${orderId}/send`),
  transfer: (orderId: string, tableId: string) =>
    api.post<Order>(`/api/orders/${orderId}/transfer`, { tableId }),
  cancel: (orderId: string, reason: string) =>
    api.post<Order>(`/api/orders/${orderId}/cancel`, { reason }),
};

export const ACTIVE_STATUSES: OrderStatus[] = ['DRAFT', 'SENT'];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Qoralama',
  SENT: 'Yuborilgan',
  CLOSED: 'Yopilgan',
  WALKOUT: "To'lamay ketdi",
  CANCELED: 'Bekor qilingan',
};
