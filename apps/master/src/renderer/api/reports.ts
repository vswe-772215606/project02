import { api } from './client';

export const reportsApi = {
  getDaily: (date: string) => api.get<any>(`/api/reports/daily?date=${date}`),
  getMonthly: (month: string) => api.get<any>(`/api/reports/monthly?month=${month}`),
};
