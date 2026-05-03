import { api } from './client';

export type Table = {
  id: string;
  name: string;
  type: 'TABLE' | 'ROOM';
  displayOrder: number;
  isActive: boolean;
  activeOrderId: string | null;
};

export const tablesApi = {
  list: () => api.get<Table[]>('/api/tables'),
};
