import { api } from './client';

export interface Table {
  id: string;
  name: string;
  type: 'TABLE' | 'BOOTH' | 'VIP';
  displayOrder: number;
  isActive: boolean;
  activeOrderId?: string | null;
}

export const tablesApi = {
  list: () => api.get<Table[]>('/api/tables'),
  create: (data: { name: string; type: string; displayOrder?: number }) => 
    api.post<Table>('/api/tables', data),
  update: (id: string, data: Partial<Table>) => 
    api.patch<Table>(`/api/tables/${id}`, data),
};
