import { api } from './client';

export type StockEntry = {
  menuItemId: string;
  name: string;
  initialCount: number;
  currentCount: number;
};

export const stockApi = {
  getToday: () => api.get<StockEntry[]>('/api/stock/today'),
};
