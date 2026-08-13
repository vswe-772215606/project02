import { MenuItemKind, Prisma, StockEntryKind } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferAfterCommit, deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { alertService } from './alert.service';
import { auditService } from './audit.service';
import { menuRepo } from '../repositories/menu.repo';
import { stockEntryRepo } from '../repositories/stockEntry.repo';
import { expenseRepo } from '../repositories/expense.repo';

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

const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

type EntryRow = Awaited<ReturnType<typeof stockEntryRepo.create>>;

function mapEntry(e: EntryRow) {
  return {
    id: e.id,
    menuItemId: e.menuItemId,
    kind: e.kind,
    qty: e.qty,
    countBefore: e.countBefore,
    countAfter: e.countAfter,
    paidUzs: e.paidUzs ? e.paidUzs.toFixed(0) : null,
    unitCost: e.unitCost ? e.unitCost.toFixed(0) : null,
    note: e.note,
    occurredAt: e.occurredAt.toISOString(),
    actorName: e.actor.fullName,
    expenseId: e.expense?.id ?? null,
  };
}

async function getCountedItemOrThrow(menuItemId: string) {
  const item = await menuRepo.findItemById(menuItemId);
  if (!item || !item.isActive) throw Errors.NotFound('Taom');
  if (item.kind === MenuItemKind.SERVICE || !item.counted) {
    throw Errors.Validation('Bu taom sanalmaydi');
  }
  return item;
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

  /** "+ Keldi": additive restock, optional money → excluded Expense + derived cost. */
  async restock(input: {
    menuItemId: string;
    qty: number;
    paidUzs?: number | string | null;
    setCostFromPaid?: boolean;
    note?: string;
    occurredAt: Date;
    actorUserId: string;
  }) {
    return withEmitContext(async () => {
      const item = await getCountedItemOrThrow(input.menuItemId);
      if (!Number.isInteger(input.qty) || input.qty <= 0) {
        throw Errors.Validation("Miqdor 0 dan katta butun son bo'lishi kerak");
      }
      const paid = input.paidUzs !== undefined && input.paidUzs !== null
        ? new Prisma.Decimal(input.paidUzs)
        : null;
      if (paid && paid.lte(0)) {
        throw Errors.Validation("To'langan summa 0 dan katta bo'lishi kerak");
      }
      const unitCost = paid ? paid.div(input.qty) : null;

      const entry = await getPrisma().$transaction(async (tx) => {
        const fresh = await tx.menuItem.findUniqueOrThrow({
          where: { id: item.id },
          select: { stockCount: true },
        });
        const before = fresh.stockCount;
        const after = (before ?? 0) + input.qty;
        await menuRepo.setStock(item.id, after, tx);

        let expenseId: string | null = null;
        if (paid) {
          const expense = await expenseRepo.create({
            category: { connect: { id: INGREDIENT_EXPENSE_CATEGORY_ID } },
            amount: paid,
            reason: `Keldi: ${item.name}`,
            note: input.note?.trim() || null,
            occurredAt: input.occurredAt,
            createdBy: { connect: { id: input.actorUserId } },
          }, tx);
          expenseId = expense.id;
        }
        if (paid && unitCost && input.setCostFromPaid) {
          await menuRepo.updateItem(item.id, { costPrice: unitCost }, tx);
        }

        const created = await stockEntryRepo.create({
          menuItem: { connect: { id: item.id } },
          kind: StockEntryKind.RESTOCK,
          qty: input.qty,
          countBefore: before,
          countAfter: after,
          paidUzs: paid,
          unitCost,
          expense: expenseId ? { connect: { id: expenseId } } : undefined,
          note: input.note?.trim() || null,
          actor: { connect: { id: input.actorUserId } },
          occurredAt: input.occurredAt,
        }, tx);

        await auditService.log({
          userId: input.actorUserId,
          action: 'STOCK_RESTOCKED',
          entityType: 'MenuItem',
          entityId: item.id,
          metadata: {
            itemName: item.name,
            qty: input.qty,
            countBefore: before,
            countAfter: after,
            paidUzs: paid ? paid.toFixed(0) : null,
            unitCost: unitCost ? unitCost.toFixed(0) : null,
            costUpdated: Boolean(paid && input.setCostFromPaid),
            expenseId,
          },
        }, tx);

        deferEmit('admin', 'stock:changed', { menuItemId: item.id });
        if ((before ?? 0) <= 0 && after > 0) {
          deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: true });
        }
        return created;
      });

      await flushDeferredEmits();
      return mapEntry(entry);
    });
  },

  /** "Sanoq": absolute count set — the only stock correction mechanism. */
  async setCount(input: {
    menuItemId: string;
    countedQty: number;
    note?: string;
    occurredAt: Date;
    actorUserId: string;
  }) {
    return withEmitContext(async () => {
      const item = await getCountedItemOrThrow(input.menuItemId);
      if (!Number.isInteger(input.countedQty) || input.countedQty < 0) {
        throw Errors.Validation("Sanoq manfiy bo'lmagan butun son bo'lishi kerak");
      }

      const entry = await getPrisma().$transaction(async (tx) => {
        const fresh = await tx.menuItem.findUniqueOrThrow({
          where: { id: item.id },
          select: { stockCount: true },
        });
        const before = fresh.stockCount;
        await menuRepo.setStock(item.id, input.countedQty, tx);

        const created = await stockEntryRepo.create({
          menuItem: { connect: { id: item.id } },
          kind: StockEntryKind.COUNT,
          qty: input.countedQty,
          countBefore: before,
          countAfter: input.countedQty,
          note: input.note?.trim() || null,
          actor: { connect: { id: input.actorUserId } },
          occurredAt: input.occurredAt,
        }, tx);

        await auditService.log({
          userId: input.actorUserId,
          action: 'STOCK_COUNT_SET',
          entityType: 'MenuItem',
          entityId: item.id,
          metadata: {
            itemName: item.name,
            countBefore: before,
            countAfter: input.countedQty,
            note: input.note?.trim() || null,
          },
        }, tx);

        deferEmit('admin', 'stock:changed', { menuItemId: item.id });
        if ((before ?? 0) <= 0 && input.countedQty > 0) {
          deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: true });
        }
        if ((before ?? 0) > 0 && input.countedQty <= 0) {
          deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: false });
        }
        return created;
      });

      await flushDeferredEmits();
      return mapEntry(entry);
    });
  },

  /** Ombor page data: every counted FOOD item + its latest entry timestamp. */
  async listCounted() {
    const prisma = getPrisma();
    const items = await prisma.menuItem.findMany({
      where: { kind: MenuItemKind.FOOD, counted: true, isActive: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ category: { displayOrder: 'asc' } }, { displayOrder: 'asc' }, { name: 'asc' }],
    });
    const ids = items.map((i) => i.id);
    const latest = await prisma.stockEntry.findMany({
      where: { menuItemId: { in: ids } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { menuItemId: true, occurredAt: true },
    });
    const lastByItem = new Map<string, Date>();
    for (const row of latest) {
      if (!lastByItem.has(row.menuItemId)) lastByItem.set(row.menuItemId, row.occurredAt);
    }
    return items.map((i) => ({
      id: i.id,
      name: i.name,
      categoryId: i.categoryId,
      categoryName: i.category.name,
      price: Number(i.price),
      stockCount: i.stockCount,
      costPrice: i.costPrice ? i.costPrice.toFixed(0) : null,
      isAvailable: i.isAvailable,
      isActive: i.isActive,
      lastEntryAt: lastByItem.get(i.id)?.toISOString() ?? null,
    }));
  },

  async listEntries(menuItemId: string) {
    const rows = await stockEntryRepo.listForItem(menuItemId);
    return rows.map(mapEntry);
  },
};
