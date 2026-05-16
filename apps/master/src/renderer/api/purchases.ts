import { api } from './client';

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
  totalCostUzs: string;
  unitCostPerRecipeUnit: string;
  supplierNote: string | null;
  recordedById: string;
  recordedByName: string;
  expenseId: string | null;
  occurredAt: string;
  createdAt: string;
};

export type PurchaseRecordInput = {
  ingredientId: string;
  quantityBuyUnit: number | string;
  totalCostUzs: number | string;
  occurredAt?: string;
  supplierNote?: string;
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
};
