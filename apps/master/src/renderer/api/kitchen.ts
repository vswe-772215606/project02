import { api } from './client';
import { Order, OrderLine } from './orders';

export interface KitchenTicket {
  id: string;
  orderId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'READY' | 'SERVED' | 'CANCELED';
  createdAt: string;
  order?: Order;
  lines?: OrderLine[];
}

export const kitchenApi = {
  listActive: () => api.get<KitchenTicket[]>('/api/kitchen/tickets/active'),
  getById: (id: string) => api.get<KitchenTicket>(`/api/kitchen/tickets/${id}`),
  updateStatus: (id: string, status: 'IN_PROGRESS' | 'READY') => 
    api.patch<KitchenTicket>(`/api/kitchen/tickets/${id}`, { status }),
  reprint: (id: string) => api.post<{ id: string }>(`/api/kitchen/tickets/${id}/reprint`),
};
