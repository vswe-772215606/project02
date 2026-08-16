import { api } from './client';

export type StockItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  stockCount: number | null;
  costPrice: string | null;
  isAvailable: boolean;
  isActive: boolean;
  lastEntryAt: string | null;
};

export type StockEntry = {
  id: string;
  menuItemId: string;
  kind: 'RESTOCK' | 'COUNT';
  qty: number;
  countBefore: number | null;
  countAfter: number;
  paidUzs: string | null;
  unitCost: string | null;
  note: string | null;
  occurredAt: string;
  actorName: string;
  expenseId: string | null;
};

export const stockApi = {
  list: () => api.get<StockItem[]>('/api/stock'),
  entries: (menuItemId: string) => api.get<StockEntry[]>(`/api/stock/${menuItemId}/entries`),
  restock: (menuItemId: string, body: { qty: number; paidUzs?: number | null; setCostFromPaid?: boolean; note?: string }) =>
    api.post<StockEntry>(`/api/stock/${menuItemId}/restock`, body),
  count: (menuItemId: string, body: { countedQty: number; note?: string }) =>
    api.post<StockEntry>(`/api/stock/${menuItemId}/count`, body),
};
