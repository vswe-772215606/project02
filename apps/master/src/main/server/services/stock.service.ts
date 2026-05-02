import { Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { dailyStockRepo } from '../repositories/dailyStock.repo';
import { menuRepo } from '../repositories/menu.repo';
import { auditService } from './audit.service';

type Tx = Prisma.TransactionClient;

export const stockService = {
  today(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
      const currentCount = row?.currentCount ?? 0;

      return {
        menuItemId: item.id,
        name: item.name,
        initialCount: row?.initialCount ?? 0,
        currentCount,
        isAvailable: item.isAvailable && currentCount > 0,
      };
    });
  },

  async setInitialCounts(entries: Array<{ menuItemId: string; count: number }>, actorUserId: string) {
    return withEmitContext(async () => {
      const date = this.today();

      const result = await getPrisma().$transaction(async (tx) => {
        const rows = [];
        for (const entry of entries) {
          const existing = await dailyStockRepo.findByItemAndDate(entry.menuItemId, date, tx);
          const row = await dailyStockRepo.upsertForDate(
            entry.menuItemId,
            date,
            entry.count,
            entry.count,
            actorUserId,
            tx,
          );
          await auditService.log({
            userId: actorUserId,
            action: 'DAILY_STOCK_SET',
            entityType: 'DailyStock',
            entityId: row.id,
            metadata: {
              menuItemId: entry.menuItemId,
              oldInitial: existing?.initialCount ?? 0,
              newInitial: entry.count,
            },
          }, tx);
          deferEmit('all', 'stock:changed', {
            menuItemId: entry.menuItemId,
            currentCount: entry.count,
          });
          rows.push(row);
        }
        return rows;
      });

      await flushDeferredEmits();
      return result;
    });
  },

  async adjustCurrent(menuItemId: string, newCount: number, actorUserId: string) {
    return withEmitContext(async () => {
      const date = this.today();
      const result = await getPrisma().$transaction(async (tx) => {
        const existing = await dailyStockRepo.findByItemAndDate(menuItemId, date, tx);
        const row = existing
          ? await dailyStockRepo.setCurrentCount(menuItemId, date, newCount, tx)
          : await dailyStockRepo.upsertForDate(menuItemId, date, newCount, newCount, actorUserId, tx);

        if (!row) {
          throw Errors.NotFound('DailyStock');
        }

        await auditService.log({
          userId: actorUserId,
          action: 'DAILY_STOCK_ADJUSTED',
          entityType: 'DailyStock',
          entityId: row.id,
          metadata: {
            menuItemId,
            oldCount: existing?.currentCount ?? 0,
            newCount,
            reason: 'manual_admin_edit',
          },
        }, tx);

        deferEmit('all', 'stock:changed', {
          menuItemId,
          currentCount: newCount,
        });

        return row;
      });

      await flushDeferredEmits();
      return result;
    });
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
