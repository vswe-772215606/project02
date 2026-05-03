import { api } from './client';

export interface Table {
  id: string;
  name: string;
  type: 'TABLE' | 'ROOM';
  displayOrder: number;
  isActive: boolean;
  activeOrderId?: string | null;
}

export const tablesApi = {
  list: (includeInactive = false) => api.get<Table[]>(`/api/tables${includeInactive ? '?includeInactive=true' : ''}`),
  create: (data: { name: string; type: string; displayOrder?: number }) => 
    api.post<Table>('/api/tables', data),
  update: (id: string, data: Partial<Table>) => 
    api.patch<Table>(`/api/tables/${id}`, data),
};
