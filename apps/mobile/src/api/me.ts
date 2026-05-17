import { api } from './client';

export type TodayStats = {
  date: string;
  userId: string;
  orderCount: number;
  ordersClosed: number;
  ordersCanceled: number;
  ordersWalkout: number;
  foodRevenue: string;
  serviceEarned: string;
  totalBilled: string;
};

export const meApi = {
  todayStats: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return api.get<TodayStats>(`/api/me/today-stats${qs}`);
  },
};
