import { api } from './client';

export type TicketStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'CANCELED';
export type OrderStatus = 'DRAFT' | 'SENT' | 'BILL_REQUESTED' | 'PENDING_PAYMENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';
export type OrderType = 'DINE_IN' | 'TAKEAWAY';

export type KitchenTicket = {
  id: string;
  orderId: string;
  status: TicketStatus;
  createdAt: string;
};

export type OrderLine = {
  id: string;
  orderId: string;
  menuItemId: string | null;
  comboGroupId: string | null;
  comboNameSnapshot: string | null;
  name: string;
  nameSnapshot: string;
  price: number;
  quantity: number;
  notes: string | null;
  isCanceled: boolean;
  createdAt: string;
  kitchenTicketId: string | null;
  kitchenTicket?: { id: string; status: TicketStatus } | null;
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
  createdAt: string;
  updatedAt: string;
  lines: OrderLine[];
  kitchenTickets: KitchenTicket[];
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
  requestBill: (orderId: string) => api.post<Order>(`/api/orders/${orderId}/request-bill`),
  cancel: (orderId: string, reason: string) =>
    api.post<Order>(`/api/orders/${orderId}/cancel`, { reason }),
};

export const ACTIVE_STATUSES: OrderStatus[] = ['DRAFT', 'SENT', 'BILL_REQUESTED'];
export const WORK_STATUSES: OrderStatus[] = ['DRAFT', 'SENT'];
export const BILL_STATUSES: OrderStatus[] = ['BILL_REQUESTED', 'PENDING_PAYMENT'];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Qoralama',
  SENT: 'Yuborildi',
  BILL_REQUESTED: "Hisob so'raldi",
  PENDING_PAYMENT: "To'lov kutilmoqda",
  CLOSED: 'Yopildi',
  WALKOUT: 'Ketib qoldi',
  CANCELED: 'Bekor qilindi',
};

export const TICKET_LABELS: Record<TicketStatus, string> = {
  PENDING: 'Kutilmoqda',
  IN_PROGRESS: 'Pishirilmoqda',
  READY: 'Tayyor',
  CANCELED: 'Bekor',
};
