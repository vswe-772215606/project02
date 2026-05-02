import { api } from './client';

export interface Discount {
  id: string;
  name: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  isActive: boolean;
}

export const discountsApi = {
  list: (includeInactive = false) => api.get<Discount[]>(`/api/discounts${includeInactive ? '?includeInactive=true' : ''}`),
  create: (data: { name: string; type: string; value: number }) => 
    api.post<Discount>('/api/discounts', data),
  update: (id: string, data: Partial<Discount>) => 
    api.patch<Discount>(`/api/discounts/${id}`, data),
  delete: (id: string) => api.delete<{ ok: true }>(`/api/discounts/${id}`),
};
