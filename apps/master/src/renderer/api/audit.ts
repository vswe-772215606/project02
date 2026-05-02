import { api } from './client';

export const auditApi = {
  list: (params: any) => {
    const q = new URLSearchParams(params);
    return api.get<any>(`/api/audit?${q.toString()}`);
  },
};
