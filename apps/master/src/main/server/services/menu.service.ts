import { MenuItemKind, Prisma, StockEntryKind } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { menuRepo } from '../repositories/menu.repo';
import { stockEntryRepo } from '../repositories/stockEntry.repo';
import { auditService } from './audit.service';

export type CreateItemMode = 'SERVICE' | 'COUNTED' | 'UNCOUNTED';

export type CreateItemInput = {
  categoryId: string;
  name: string;
  price: Prisma.Decimal | string | number;
  description?: string;
  displayOrder?: number;
  mode: CreateItemMode;
  // COUNTED / UNCOUNTED only. Cost is optional everywhere — NULL books 0 COGS
  // and the admin UI shows "tan narxi kiritilmagan".
  costPrice?: string | number | null;
  // COUNTED only. Absent → stockCount NULL → blocked until the first Sanoq.
  initialCount?: number | null;
};

type UpdateItemInput = {
  categoryId?: string;
  name?: string;
  price?: number | string;
  description?: string;
  displayOrder?: number;
  kind?: MenuItemKind;
  isActive?: boolean;
  costPrice?: number | string | null;
  counted?: boolean;
};

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

  /**
   * Client-facing menu. Availability is count-based now:
   * SERVICE and uncounted FOOD are always available; counted FOOD needs a
   * positive stockCount (NULL = not yet counted = unavailable).
   */
  async listMenuForClients() {
    const [categories, items] = await Promise.all([
      menuRepo.listCategories(),
      menuRepo.listItems(),
    ]);

    return categories.map((category) => ({
      ...category,
      items: items
        .filter((item) => item.categoryId === category.id)
        .map((item) => ({
          ...item,
          effectivelyAvailable:
            item.isAvailable &&
            (item.kind === MenuItemKind.SERVICE || !item.counted || (item.stockCount ?? 0) > 0),
        })),
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

  /**
   * Create a menu item. Three modes:
   * - SERVICE:   xizmat haqi line (kind=SERVICE), never counted, no cost.
   * - COUNTED:   FOOD with a stock number. Optional tan narx and initial
   *              count; an initial count is journaled as StockEntry(COUNT)
   *              with countBefore NULL so history starts at creation.
   * - UNCOUNTED: FOOD that never runs out (choy). Optional tan narx.
   */
  async createItem(data: CreateItemInput, actorUserId: string) {
    return withEmitContext(async () => {
      const name = data.name.trim();
      if (!name) throw Errors.Validation("Mahsulot nomi bo'sh bo'lmasin");

      const kind = data.mode === 'SERVICE' ? MenuItemKind.SERVICE : MenuItemKind.FOOD;
      const counted = data.mode === 'COUNTED';
      const price = new Prisma.Decimal(data.price);
      const costPrice = data.mode !== 'SERVICE' && data.costPrice !== undefined && data.costPrice !== null
        ? new Prisma.Decimal(data.costPrice)
        : null;
      if (costPrice && costPrice.lte(0)) {
        throw Errors.Validation("Tan narx 0 dan katta bo'lishi kerak");
      }
      const initialCount = counted && data.initialCount !== undefined && data.initialCount !== null
        ? data.initialCount
        : null;
      if (initialCount !== null && (!Number.isInteger(initialCount) || initialCount < 0)) {
        throw Errors.Validation("Boshlang'ich sanoq manfiy bo'lmagan butun son bo'lishi kerak");
      }

      const item = await getPrisma().$transaction(async (tx) => {
        const created = await menuRepo.createItem({
          category: { connect: { id: data.categoryId } },
          name,
          price,
          description: data.description?.trim() || null,
          displayOrder: data.displayOrder ?? 0,
          kind,
          counted,
          costPrice,
          stockCount: initialCount,
        }, tx);

        if (initialCount !== null) {
          await stockEntryRepo.create({
            menuItem: { connect: { id: created.id } },
            kind: StockEntryKind.COUNT,
            qty: initialCount,
            countBefore: null,
            countAfter: initialCount,
            actor: { connect: { id: actorUserId } },
            occurredAt: new Date(),
          }, tx);

          await auditService.log({
            userId: actorUserId,
            action: 'STOCK_COUNT_SET',
            entityType: 'MenuItem',
            entityId: created.id,
            metadata: { itemName: name, countBefore: null, countAfter: initialCount, origin: 'menu-create' },
          }, tx);
        }

        return created;
      });

      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return item;
    });
  },

  async updateItem(id: string, data: UpdateItemInput, actorUserId: string) {
    return withEmitContext(async () => {
      const existing = await menuRepo.findItemById(id);
      if (!existing) throw Errors.NotFound('Menu item');

      const patch: Prisma.MenuItemUpdateInput = {};
      if (data.categoryId !== undefined) patch.category = { connect: { id: data.categoryId } };
      if (data.name !== undefined) patch.name = data.name.trim();
      if (data.price !== undefined) patch.price = new Prisma.Decimal(data.price);
      if (data.description !== undefined) patch.description = data.description.trim() || null;
      if (data.displayOrder !== undefined) patch.displayOrder = data.displayOrder;
      if (data.kind !== undefined) patch.kind = data.kind;
      if (data.isActive !== undefined) patch.isActive = data.isActive;

      const costChanged = data.costPrice !== undefined;
      if (costChanged) {
        const next = data.costPrice === null ? null : new Prisma.Decimal(data.costPrice as number | string);
        if (next && next.lte(0)) throw Errors.Validation("Tan narx 0 dan katta bo'lishi kerak");
        patch.costPrice = next;
      }

      const countedChanged = data.counted !== undefined && data.counted !== existing.counted;
      if (countedChanged) {
        patch.counted = data.counted;
        // ON: must be counted before it sells again. OFF: count is meaningless.
        patch.stockCount = null;
      }

      const item = await getPrisma().$transaction(async (tx) => {
        const updated = await menuRepo.updateItem(id, patch, tx);

        if (costChanged) {
          await auditService.log({
            userId: actorUserId,
            action: 'ITEM_COST_CHANGED',
            entityType: 'MenuItem',
            entityId: id,
            metadata: {
              itemName: existing.name,
              before: existing.costPrice ? existing.costPrice.toFixed(0) : null,
              after: updated.costPrice ? updated.costPrice.toFixed(0) : null,
            },
          }, tx);
        }
        if (countedChanged) {
          await auditService.log({
            userId: actorUserId,
            action: 'STOCK_COUNT_SET',
            entityType: 'MenuItem',
            entityId: id,
            metadata: {
              itemName: existing.name,
              countBefore: existing.stockCount,
              countAfter: null,
              origin: data.counted ? 'counted-enabled' : 'counted-disabled',
            },
          }, tx);
        }

        return updated;
      });

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
            menuItem: { connect: { id: component.menuItemId } },
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
