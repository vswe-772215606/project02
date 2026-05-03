import { api } from './client';
import { Ticket } from './types';

export const kitchenApi = {
  listActive: () => api.get<Ticket[]>('/api/kitchen/tickets/active'),
  getById: (id: string) => api.get<Ticket>(`/api/kitchen/tickets/${id}`),
  setStatus: (id: string, status: 'IN_PROGRESS' | 'READY') =>
    api.patch<Ticket>(`/api/kitchen/tickets/${id}`, { status }),
  reprint: (id: string) =>
    api.post<{ id: string }>(`/api/kitchen/tickets/${id}/reprint`),
};
