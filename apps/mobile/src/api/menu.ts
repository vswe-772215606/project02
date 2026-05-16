import { api } from './client';

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description: string | null;
  isAvailable: boolean;
  displayOrder: number;
  isActive: boolean;
  effectivelyAvailable: boolean;
};

export type Category = {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  items: MenuItem[];
};

export type ComboComponent = {
  id: string;
  menuItemId: string;
  quantity: number;
  menuItem: { name: string; price: number };
};

export type Combo = {
  id: string;
  name: string;
  isActive: boolean;
  components: ComboComponent[];
};

export const menuApi = {
  list: () => api.get<{ categories: Category[] }>('/api/menu'),
  combos: () => api.get<Combo[]>('/api/menu/combos'),
};
