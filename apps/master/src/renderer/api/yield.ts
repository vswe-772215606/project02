import { api } from './client';

export interface YieldRow {
  menuItemId: string;
  menuItemName: string;
  kind: 'RECIPE' | 'DIRECT' | 'UNTRACKED';
  possiblePortions: number | null;
  bottleneckIngredientId: string | null;
  bottleneckIngredientName: string | null;
  bottleneckCurrentStock: string | null;
  bottleneckUnit: string | null;
}

export const yieldApi = {
  list: () => api.get<YieldRow[]>('/api/menu/yield'),
};
