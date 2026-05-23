import { api } from './client';

export type PurchaseStatus = 'ACTIVE' | 'REVERSED' | 'DELETED';

export type Purchase = {
  id: string;
  ingredientId: string;
  ingredient: {
    id: string;
    name: string;
    buyUnit: string;
    recipeUnit: string;
    conversionFactor?: string;
  };
  quantityBuyUnit: string;
  quantityRecipeUnit: string;
  remainingQty: string;
  consumedQty: string;
  totalCostUzs: string;
  unitCostPerRecipeUnit: string;
  supplierNote: string | null;
  recordedById: string;
  recordedByName: string;
  expenseId: string | null;
  occurredAt: string;
  createdAt: string;
  status: PurchaseStatus;
  reversedAt: string | null;
  reversedById: string | null;
  reversedByName: string | null;
  reversalNote: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  deletionNote: string | null;
};

export type PurchaseRecordInput = {
  ingredientId: string;
  quantityBuyUnit: number | string;
  totalCostUzs: number | string;
  occurredAt?: string;
  supplierNote?: string;
};

export type PurchaseUpdateInput = {
  supplierNote?: string | null;
  occurredAt?: string;
};

export const purchasesApi = {
  list: (filters: { from?: string; to?: string; ingredientId?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.ingredientId) params.set('ingredientId', filters.ingredientId);
    const qs = params.toString();
    return api.get<Purchase[]>(`/api/purchases${qs ? '?' + qs : ''}`);
  },

  record: (body: PurchaseRecordInput) => api.post<Purchase>('/api/purchases', body),

  update: (id: string, body: PurchaseUpdateInput) =>
    api.patch<Purchase>(`/api/purchases/${id}`, body),

  reverse: (id: string, note: string) =>
    api.post<Purchase>(`/api/purchases/${id}/reverse`, { note }),

  delete: (id: string, note: string) =>
    api.post<Purchase>(`/api/purchases/${id}/delete`, { note }),
};
