import { Prisma } from '@prisma/client';
import { Errors, AppError } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { dailyStockRepo } from '../repositories/dailyStock.repo';
import { menuRepo } from '../repositories/menu.repo';
import { auditService } from './audit.service';

type Tx = Prisma.TransactionClient;

export const stockService = {
  today(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  },

  async listToday() {
    const date = this.today();
    const [trackedItems, stockRows] = await Promise.all([
      menuRepo.listTrackedItems(),
      dailyStockRepo.listForDate(date),
    ]);

    const rowMap = new Map(stockRows.map((row) => [row.menuItemId, row]));

    return trackedItems.map((item) => {
      const row = rowMap.get(item.id);
      const count = row?.currentCount ?? 0;

      return {
        menuItemId: item.id,
        name: item.name,
        count,
        isAvailable: item.isAvailable && count > 0,
        hasDailyRow: !!row,
      };
    });
  },

  async setOrUpdate(menuItemId: string, count: number, actorUserId: string) {
    return withEmitContext(async () => {
      const date = this.today();

      const result = await getPrisma().$transaction(async (tx) => {
        const existing = await dailyStockRepo.findByItemAndDate(menuItemId, date, tx);
        
        const row = await dailyStockRepo.upsertForDate(
          menuItemId,
          date,
          count,
          count,
          actorUserId,
          tx,
        );

        await auditService.log({
          userId: actorUserId,
          action: existing ? 'DAILY_STOCK_ADJUSTED' : 'DAILY_STOCK_SET',
          entityType: 'DailyStock',
          entityId: row.id,
          metadata: {
            menuItemId,
            oldCount: existing?.currentCount ?? 0,
            newCount: count,
            oldInitial: existing?.initialCount ?? 0,
            newInitial: count,
          },
        }, tx);

        deferEmit('all', 'stock:changed', {
          menuItemId,
          currentCount: count,
        });

        return row;
      });

      await flushDeferredEmits();
      return result;
    });
  },

  /** @deprecated Use setOrUpdate */
  async setInitialForToday(entries: Array<{ menuItemId: string; count: number }>, actorUserId: string, _force = false) {
    for (const entry of entries) {
      await this.setOrUpdate(entry.menuItemId, entry.count, actorUserId);
    }
  },

  /** @deprecated Use setOrUpdate */
  async addBatch(menuItemId: string, additionalCount: number, actorUserId: string) {
    const date = this.today();
    const existing = await dailyStockRepo.findByItemAndDate(menuItemId, date);
    const current = existing?.currentCount ?? 0;
    return this.setOrUpdate(menuItemId, current + additionalCount, actorUserId);
  },

  /** @deprecated Use setOrUpdate */
  async removeBatch(menuItemId: string, removedCount: number, actorUserId: string) {
    const date = this.today();
    const existing = await dailyStockRepo.findByItemAndDate(menuItemId, date);
    if (!existing) {
      throw new AppError('NOT_FOUND', 404, 'Bugungi zaxira hali belgilanmagan');
    }
    return this.setOrUpdate(menuItemId, Math.max(0, existing.currentCount - removedCount), actorUserId);
  },

  async decrement(menuItemId: string, quantity: number, tx: Tx) {
    const item = await menuRepo.findItemById(menuItemId, tx);
    if (!item) {
      throw Errors.NotFound('Menu item');
    }
    if (!item.trackStock) {
      return;
    }

    const date = this.today();
    const existing = await dailyStockRepo.findByItemAndDate(menuItemId, date, tx);
    if (!existing) {
      throw new AppError('OUT_OF_STOCK', 409, 'Bu mahsulot uchun bugungi zaxira belgilanmagan');
    }

    const result = await dailyStockRepo.decrementAtomic(menuItemId, date, quantity, tx);
    if (result.count === 0) {
      throw Errors.OutOfStock(item.name);
    }

    const row = await dailyStockRepo.findByItemAndDate(menuItemId, date, tx);
    deferEmit('all', 'stock:changed', {
      menuItemId,
      currentCount: row?.currentCount ?? 0,
    });
  },

  async restore(menuItemId: string, quantity: number, tx: Tx) {
    const item = await menuRepo.findItemById(menuItemId, tx);
    if (!item || !item.trackStock) {
      return;
    }

    const date = this.today();
    await dailyStockRepo.incrementAtomic(menuItemId, date, quantity, tx);
    const row = await dailyStockRepo.findByItemAndDate(menuItemId, date, tx);
    deferEmit('all', 'stock:changed', {
      menuItemId,
      currentCount: row?.currentCount ?? 0,
    });
  },

  async historyForItem(menuItemId: string, from: Date, to: Date) {
    return dailyStockRepo.historyForItem(menuItemId, from, to);
  },
};
