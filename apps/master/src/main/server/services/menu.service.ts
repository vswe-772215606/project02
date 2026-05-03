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
          const stockCount = stock?.count ?? 0;
          const effectivelyAvailable = item.isAvailable && (!item.trackStock || stockCount > 0);

          return {
            ...item,
            todayCurrentCount: item.trackStock ? stockCount : null,
            effectivelyAvailable,
          };
        }),
    }));
  },

  async createCategory(data: { name: string; displayOrder?: number }, _actorUserId: string) {
    return withEmitContext(async () => {
      const cat = await menuRepo.createCategory({
        name: data.name,
        displayOrder: data.displayOrder ?? 0,
      });
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return cat;
    });
  },

  async updateCategory(id: string, data: Prisma.CategoryUpdateInput, _actorUserId: string) {
    return withEmitContext(async () => {
      const cat = await menuRepo.updateCategory(id, data);
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return cat;
    });
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
    return withEmitContext(async () => {
      const item = await menuRepo.createItem({
        category: { connect: { id: data.categoryId } },
        name: data.name,
        price: new Prisma.Decimal(data.price),
        description: data.description ?? null,
        displayOrder: data.displayOrder ?? 0,
        trackStock: data.trackStock ?? false,
      });
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return item;
    });
  },

  async updateItem(id: string, data: Prisma.MenuItemUpdateInput, _actorUserId: string) {
    return withEmitContext(async () => {
      const item = await menuRepo.updateItem(id, data);
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return item;
    });
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
    return withEmitContext(async () => {
      const combo = await menuRepo.createCombo({
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
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return combo;
    });
  },

  async updateCombo(
    id: string,
    data: { name?: string; isActive?: boolean; components?: Array<{ menuItemId: string; quantity: number }> },
    _actorUserId: string,
  ) {
    return withEmitContext(async () => {
    if (data.components) {
      await menuRepo.replaceComponents(id, data.components);
    }

    const combo = await menuRepo.updateCombo(id, {
      name: data.name,
      isActive: data.isActive,
    });
    deferEmit('all', 'menu:changed', {});
    await flushDeferredEmits();
    return combo;
    });
  },
};
