import { api } from './client';
import { User } from './auth';

export type WaiterTodayStat = {
  waiterId: string;
  waiterName: string;
  orders: number;
  billedTotal: string;
  serviceEarned: string;
};

export const usersApi = {
  list: (includeInactive = false) => api.get<User[]>(`/api/users${includeInactive ? '?includeInactive=true' : ''}`),
  create: (data: { role: string; fullName: string; username?: string; password?: string; pin?: string }) =>
    api.post<User>('/api/users', data),
  update: (id: string, data: Partial<User> & { password?: string; pin?: string }) =>
    api.patch<User>(`/api/users/${id}`, data),
  deactivate: (id: string) => api.post<User>(`/api/users/${id}/deactivate`),
  todayStats: (date?: string) => api.get<{
    date: string;
    items: WaiterTodayStat[];
  }>(`/api/users/today-stats${date ? `?date=${date}` : ''}`),
};
