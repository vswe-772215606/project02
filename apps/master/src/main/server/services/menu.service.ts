import { Prisma } from '@prisma/client';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { menuRepo } from '../repositories/menu.repo';
import { stockService } from './stock.service';

export const menuService = {
  async listCategories(includeInactive = false) {
    return menuRepo.listCategories(includeInactive);
  },

  async listItems(includeInactive = false) {
    return menuRepo.listItems(includeInactive);
  },

  async listCombos(includeInactive = false) {
    return menuRepo.listCombos(includeInactive);
  },

  async listMenuForClients() {
    const [categories, items, todayStock] = await Promise.all([
      menuRepo.listCategories(),
      menuRepo.listItems(),
      stockService.listToday(),
    ]);

    const stockMap = new Map(todayStock.map((row) => [row.menuItemId, row]));

    return categories.map((category) => ({
      ...category,
      items: items
        .filter((item) => item.categoryId === category.id)
        .map((item) => {
          const stock = stockMap.get(item.id);
          const effectivelyAvailable = item.isAvailable && (!item.trackStock || (stock?.currentCount ?? 0) > 0);

          return {
            ...item,
            effectivelyAvailable,
          };
        }),
    }));
  },

  async createCategory(data: { name: string; displayOrder?: number }, _actorUserId: string) {
    return menuRepo.createCategory({
      name: data.name,
      displayOrder: data.displayOrder ?? 0,
    });
  },

  async updateCategory(id: string, data: Prisma.CategoryUpdateInput, _actorUserId: string) {
    return menuRepo.updateCategory(id, data);
  },

  async createItem(
    data: {
      categoryId: string;
      name: string;
      price: Prisma.Decimal | string | number;
      description?: string;
      displayOrder?: number;
      trackStock?: boolean;
    },
    _actorUserId: string,
  ) {
    return menuRepo.createItem({
      category: { connect: { id: data.categoryId } },
      name: data.name,
      price: new Prisma.Decimal(data.price),
      description: data.description ?? null,
      displayOrder: data.displayOrder ?? 0,
      trackStock: data.trackStock ?? false,
    });
  },

  async updateItem(id: string, data: Prisma.MenuItemUpdateInput, _actorUserId: string) {
    return menuRepo.updateItem(id, data);
  },

  async setItemAvailability(id: string, isAvailable: boolean, _actorUserId: string) {
    return withEmitContext(async () => {
      const item = await menuRepo.setAvailability(id, isAvailable);
      deferEmit('all', 'menu:itemAvailability', { menuItemId: id, isAvailable });
      await flushDeferredEmits();
      return item;
    });
  },

  async createCombo(
    data: { name: string; components: Array<{ menuItemId: string; quantity: number }> },
    _actorUserId: string,
  ) {
    return menuRepo.createCombo({
      name: data.name,
      components: {
        create: data.components.map((component) => ({
          quantity: component.quantity,
          menuItem: {
            connect: { id: component.menuItemId },
          },
        })),
      },
    });
  },

  async updateCombo(
    id: string,
    data: { name?: string; isActive?: boolean; components?: Array<{ menuItemId: string; quantity: number }> },
    _actorUserId: string,
  ) {
    if (data.components) {
      await menuRepo.replaceComponents(id, data.components);
    }

    return menuRepo.updateCombo(id, {
      name: data.name,
      isActive: data.isActive,
    });
  },
};
