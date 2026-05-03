import { api } from './client';

export interface DailyStock {
  menuItemId: string;
  name: string;
  count: number;
  isAvailable: boolean;
  hasDailyRow: boolean;
}

export const stockApi = {
  getToday: () => api.get<DailyStock[]>('/api/stock/today'),
  setToday: (entries: { menuItemId: string; count: number }[], force = false) => 
    api.post<any[]>('/api/stock/today', { entries, force }),
  setCount: (menuItemId: string, count: number) => 
    api.patch<any>(`/api/stock/today/${menuItemId}`, { count }),
  getHistory: (params: { menuItemId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params.menuItemId) q.append('menuItemId', params.menuItemId);
    if (params.from) q.append('from', params.from);
    if (params.to) q.append('to', params.to);
    const qs = q.toString();
    return api.get<any[]>(`/api/stock/history${qs ? '?' + qs : ''}`);
  },
};
