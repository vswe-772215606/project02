import { api } from './client';

export type RecipeIngredient = {
  ingredientId: string;
  ingredientName: string;
  ingredientUnit: string;
  ingredientBuyUnit: string;
  quantity: string;
  ingredientWeightedAvgCost: string;
  ingredientIsActive: boolean;
};

export type Recipe = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  notes: string | null;
  isComplete: boolean;
  ingredients: RecipeIngredient[];
  createdAt: string;
  updatedAt: string;
};

export type RecipeUpsertInput = {
  ingredients: Array<{ ingredientId: string; quantity: number | string }>;
  notes?: string | null;
};

export const recipesApi = {
  getForMenuItem: (menuItemId: string) =>
    api.get<Recipe | null>(`/api/menu/items/${menuItemId}/recipe`),

  upsertForMenuItem: (menuItemId: string, body: RecipeUpsertInput) =>
    api.put<Recipe>(`/api/menu/items/${menuItemId}/recipe`, body),

  setComplete: (menuItemId: string, isComplete: boolean) =>
    api.post<Recipe>(`/api/menu/items/${menuItemId}/recipe/complete`, { isComplete }),
};
