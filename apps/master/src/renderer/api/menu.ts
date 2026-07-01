import { api } from './client';

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description: string | null;
  displayOrder: number;
  kind: 'FOOD' | 'SERVICE';
  isAvailable: boolean;
  isActive: boolean;
  // Present on the GET /api/menu client payload: isAvailable AND in stock
  // (or untracked). Absent on the flat /items admin list.
  effectivelyAvailable?: boolean;
}

export interface Category {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  items?: MenuItem[];
}

export interface ComboComponent {
  id: string;
  comboId: string;
  menuItemId: string;
  quantity: number;
  menuItem?: MenuItem;
}

export interface Combo {
  id: string;
  name: string;
  price: number | null;
  isActive: boolean;
  components: ComboComponent[];
}

// Discriminated payload for POST /api/menu/items. `mode` decides whether the
// item carries its own stock (SIMPLE), is composed from ingredients with
// per-portion quantities (COMPOSITE), or is a non-tracked service charge (SERVICE).
export type CreateItemUnit = 'dona' | 'kg' | 'l';

export type CreateItemPayload = {
  categoryId: string;
  name: string;
  price: number;
  description?: string;
  displayOrder?: number;
} & (
  | { mode: 'SERVICE' }
  // Untracked FOOD: no recipe, no self-ingredient, no starting number —
  // always available (e.g. choy). Same payload shape as SERVICE (name/price only).
  | { mode: 'UNTRACKED' }
  | {
      mode: 'SIMPLE';
      simple: {
        unit: CreateItemUnit;
        unitCost: number;     // so'm per buyUnit
        initialQty?: number;  // optional, in buyUnit
      };
    }
  | {
      mode: 'COMPOSITE';
      composite: {
        notes?: string | null;
        ingredients: Array<{
          name: string;
          unit: CreateItemUnit;
          quantityPerPortion: number; // in recipeUnit per portion
          initialQty: number;         // in buyUnit
          initialUnitCost: number;    // so'm per buyUnit
        }>;
      };
    }
);

export const menuApi = {
  getMenu: (includeInactive = false) => api.get<{ categories: Category[] }>(`/api/menu${includeInactive ? '?includeInactive=true' : ''}`),
  listCategories: (includeInactive = false) => api.get<Category[]>(`/api/menu/categories${includeInactive ? '?includeInactive=true' : ''}`),
  createCategory: (data: { name: string; displayOrder?: number }) => 
    api.post<Category>('/api/menu/categories', data),
  updateCategory: (id: string, data: { name?: string; displayOrder?: number; isActive?: boolean }) => 
    api.patch<Category>(`/api/menu/categories/${id}`, data),
  
  listItems: (includeInactive = false) => api.get<MenuItem[]>(`/api/menu/items${includeInactive ? '?includeInactive=true' : ''}`),
  createItem: (data: CreateItemPayload) =>
    api.post<MenuItem>('/api/menu/items', data),
  updateItem: (id: string, data: Partial<MenuItem>) => 
    api.patch<MenuItem>(`/api/menu/items/${id}`, data),
  toggleAvailability: (id: string, isAvailable: boolean) => 
    api.patch<MenuItem>(`/api/menu/items/${id}/availability`, { isAvailable }),
    
  listCombos: (includeInactive = false) => api.get<Combo[]>(`/api/menu/combos${includeInactive ? '?includeInactive=true' : ''}`),
  createCombo: (data: { name: string; components: { menuItemId: string; quantity: number }[] }) => 
    api.post<Combo>('/api/menu/combos', data),
  updateCombo: (id: string, data: Partial<Combo>) => 
    api.patch<Combo>(`/api/menu/combos/${id}`, data),
};
