import { MenuItemKind, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferAfterCommit, deferEmit } from '../lib/socket-events';
import { alertService } from './alert.service';
import { menuRepo } from '../repositories/menu.repo';

type Tx = Prisma.TransactionClient;

type LineRef = {
  id: string;
  menuItemId: string;
  actorUserId: string;
};

async function adjustLineCogs(orderLineId: string, delta: Prisma.Decimal, tx: Tx) {
  if (delta.eq(0)) return;
  const line = await tx.orderLine.findUnique({
    where: { id: orderLineId },
    select: { cogsSnapshot: true },
  });
  const before = line?.cogsSnapshot ?? new Prisma.Decimal(0);
  await tx.orderLine.update({
    where: { id: orderLineId },
    data: { cogsSnapshot: before.plus(delta) },
  });
}

export const stockService = {
  /**
   * Sale-side consumption for N portions of an order line. Same contract the
   * old FIFO consumptionService had: throws OutOfStock inside the caller's
   * transaction so a failed add rolls back atomically. Counted items get one
   * atomic conditional decrement; cost is booked as costPrice × portions.
   */
  async consume(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const item = await menuRepo.findItemById(line.menuItemId, tx);
    if (!item) throw Errors.NotFound('Menu item');
    if (item.kind === MenuItemKind.SERVICE) return;

    if (item.counted) {
      const res = await menuRepo.decrementStockAtomic(item.id, portions, tx);
      if (res.count === 0) {
        // Covers both "0 left" and "stockCount NULL (sanoq kiritilmagan)".
        throw Errors.OutOfStock(item.name);
      }
      const fresh = await tx.menuItem.findUnique({
        where: { id: item.id },
        select: { stockCount: true },
      });
      const after = fresh?.stockCount ?? 0;
      deferEmit('admin', 'stock:changed', { menuItemId: item.id });
      if (after <= 0) {
        deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: false });
        const itemName = item.name;
        deferAfterCommit(() => alertService.itemStockOut({ itemName }));
      }
    }

    if (item.costPrice) {
      await adjustLineCogs(line.id, new Prisma.Decimal(item.costPrice).mul(portions), tx);
    }
  },

  /**
   * Restore for N portions (quantity decrease, line cancel, order cancel from
   * DRAFT and SENT — same rules as before; WALKOUT never calls this).
   * cogsSnapshot is recomputed proportionally from the line's own snapshot,
   * which preserves the frozen at-add-time cost even if costPrice changed.
   * A line already marked isCanceled keeps its snapshot (reports filter it).
   */
  async restore(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const item = await menuRepo.findItemById(line.menuItemId, tx);
    if (!item) throw Errors.NotFound('Menu item');
    if (item.kind === MenuItemKind.SERVICE) return;

    if (item.counted) {
      const before = await tx.menuItem.findUnique({
        where: { id: item.id },
        select: { stockCount: true },
      });
      await menuRepo.incrementStockCounted(item.id, portions, tx);
      deferEmit('admin', 'stock:changed', { menuItemId: item.id });
      if ((before?.stockCount ?? 0) <= 0) {
        deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: true });
      }
    }

    const fresh = await tx.orderLine.findUnique({
      where: { id: line.id },
      select: { quantity: true, cogsSnapshot: true, isCanceled: true },
    });
    if (!fresh || fresh.isCanceled) return;
    const cogs = fresh.cogsSnapshot ?? new Prisma.Decimal(0);
    if (cogs.eq(0) || fresh.quantity <= 0) return;
    const remainingQty = Math.max(fresh.quantity - portions, 0);
    const newCogs = cogs.mul(remainingQty).div(fresh.quantity);
    await tx.orderLine.update({
      where: { id: line.id },
      data: { cogsSnapshot: newCogs },
    });
  },
};
