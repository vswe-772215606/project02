import { api } from './client';

export type Ingredient = {
  id: string;
  name: string;
  parentMenuItemId: string;
  parentMenuItem: { id: string; name: string } | null;
  buyUnit: string;
  recipeUnit: string;
  conversionFactor: string;
  currentStock: string;
  weightedAvgCost: string;
  varianceThreshold: string;
  isActive: boolean;
  isSelfMenuItem: boolean;
  selfMenuItemId: string | null;
  selfMenuItem: { id: string; name: string } | null;
  expenseCategoryId: string | null;
  expenseCategory: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type IngredientCreateInput = {
  name: string;
  parentMenuItemId: string;
  buyUnit: string;
  recipeUnit: string;
  conversionFactor: number | string;
  varianceThreshold?: number | string;
  isSelfMenuItem?: boolean;
  selfMenuItemId?: string | null;
  expenseCategoryId?: string | null;
};

export type IngredientUpdateInput = Partial<Omit<IngredientCreateInput, 'parentMenuItemId'>> & {
  isActive?: boolean;
};

export const ingredientsApi = {
  list: (filters: { isActive?: boolean; isSelfMenuItem?: boolean; parentMenuItemId?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
    if (filters.isSelfMenuItem !== undefined) params.set('isSelfMenuItem', String(filters.isSelfMenuItem));
    if (filters.parentMenuItemId) params.set('parentMenuItemId', filters.parentMenuItemId);
    const qs = params.toString();
    return api.get<Ingredient[]>(`/api/ingredients${qs ? '?' + qs : ''}`);
  },

  getById: (id: string) => api.get<Ingredient>(`/api/ingredients/${id}`),

  create: (body: IngredientCreateInput) => api.post<Ingredient>('/api/ingredients', body),

  update: (id: string, body: IngredientUpdateInput) =>
    api.patch<Ingredient>(`/api/ingredients/${id}`, body),

  delete: (id: string) => api.delete<{ id: string }>(`/api/ingredients/${id}`),
};
