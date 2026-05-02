import { api } from './client';

export interface DailyStock {
  menuItemId: string;
  name: string;
  initialCount: number;
  currentCount: number;
  isAvailable: boolean;
  hasDailyRow: boolean;
}

export const stockApi = {
  getToday: () => api.get<DailyStock[]>('/api/stock/today'),
  setToday: (entries: { menuItemId: string; count: number }[], force = false) => 
    api.post<any[]>('/api/stock/today', { entries, force }),
  addBatch: (menuItemId: string, count: number) => 
    api.post<any>(`/api/stock/today/${menuItemId}/batch-add`, { count }),
  removeBatch: (menuItemId: string, count: number) => 
    api.post<any>(`/api/stock/today/${menuItemId}/batch-remove`, { count }),
  getHistory: (params: { menuItemId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params.menuItemId) q.append('menuItemId', params.menuItemId);
    if (params.from) q.append('from', params.from);
    if (params.to) q.append('to', params.to);
    const qs = q.toString();
    return api.get<any[]>(`/api/stock/history${qs ? '?' + qs : ''}`);
  },
};
