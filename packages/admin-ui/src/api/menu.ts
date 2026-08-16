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
  counted: boolean;
  stockCount: number | null;
  costPrice: string | null;
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

// Payload for POST /api/menu/items. `mode` decides whether the item's stock
// is counted (COUNTED), untracked and always available (UNCOUNTED), or the
// item is a non-stock service charge (SERVICE).
export type CreateItemPayload = {
  categoryId: string;
  name: string;
  price: number;
  description?: string;
  displayOrder?: number;
  mode: 'SERVICE' | 'COUNTED' | 'UNCOUNTED';
  costPrice?: number | null;
  initialCount?: number | null;
};

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
  updateItem: (id: string, data: Partial<MenuItem> & { costPrice?: string | number | null; counted?: boolean }) =>
    api.patch<MenuItem>(`/api/menu/items/${id}`, data),
  toggleAvailability: (id: string, isAvailable: boolean) => 
    api.patch<MenuItem>(`/api/menu/items/${id}/availability`, { isAvailable }),
    
  listCombos: (includeInactive = false) => api.get<Combo[]>(`/api/menu/combos${includeInactive ? '?includeInactive=true' : ''}`),
  createCombo: (data: { name: string; components: { menuItemId: string; quantity: number }[] }) => 
    api.post<Combo>('/api/menu/combos', data),
  updateCombo: (id: string, data: Partial<Combo>) => 
    api.patch<Combo>(`/api/menu/combos/${id}`, data),
};
