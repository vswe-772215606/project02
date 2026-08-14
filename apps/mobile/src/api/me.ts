import { api } from './client';

export type TodayStats = {
  date: string;
  userId: string;
  orderCount: number;
  ordersClosed: number;
  ordersCanceled: number;
  foodRevenue: string;
  serviceEarned: string;
  totalBilled: string;
};

export type DayStat = {
  date: string;
  ordersClosed: number;
  serviceEarned: string;
};

export type RangeStats = {
  from: string;
  to: string;
  userId: string;
  days: DayStat[];
  totalOrders: number;
  totalServiceEarned: string;
};

export const meApi = {
  todayStats: (date?: string) => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return api.get<TodayStats>(`/api/me/today-stats${qs}`);
  },
  rangeStats: (from: string, to: string) => {
    const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return api.get<RangeStats>(`/api/me/range-stats${qs}`);
  },
};
