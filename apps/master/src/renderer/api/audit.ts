import { api } from './client';

export const auditApi = {
  list: (params: any) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      q.set(key, String(value));
    });
    return api.get<any>(`/api/audit?${q.toString()}`);
  },
};
