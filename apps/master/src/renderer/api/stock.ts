import { api } from './client';

export interface DailyStock {
  id: string;
  date: string;
  menuItemId: string;
  initialCount: number;
  currentCount: number;
  name?: string;
}

export const stockApi = {
  getToday: () => api.get<DailyStock[]>('/api/stock/today'),
  setToday: (entries: { menuItemId: string; count: number }[]) => 
    api.post<DailyStock[]>('/api/stock/today', { entries }),
  adjust: (menuItemId: string, count: number) => 
    api.patch<DailyStock>(`/api/stock/today/${menuItemId}`, { count }),
  getHistory: (params: { menuItemId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params.menuItemId) q.append('menuItemId', params.menuItemId);
    if (params.from) q.append('from', params.from);
    if (params.to) q.append('to', params.to);
    const qs = q.toString();
    return api.get<DailyStock[]>(`/api/stock/history${qs ? '?' + qs : ''}`);
  },
};
