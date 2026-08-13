import type { StockEntry, StockItem } from '@/api/stock';
import { categoryName, items, patchItemStock } from './menu';
import { daysAgo, errorJson, hoursAgo, json, splitPath, uid, type RouteHandler } from './util';

// Ombor only ever shows counted FOOD items that are still active — the exact
// filter `menuRepo.listCountedFoodItems` applies server-side. An inactive
// counted dish (Tuxum barak) or an untracked one (Oddiy non, Qora choy) never
// appears here even though it's still a MenuItem.
function countedFoodItems() {
  return items.filter((i) => i.kind === 'FOOD' && i.counted && i.isActive);
}

export let entries: StockEntry[] = [
  { id: 'se-1', menuItemId: 'mi-osh', kind: 'COUNT', qty: 42, countBefore: 38, countAfter: 42, paidUzs: null, unitCost: null, note: null, occurredAt: hoursAgo(3), actorName: 'Dilshod Yusupov', expenseId: null },
  { id: 'se-2', menuItemId: 'mi-osh', kind: 'RESTOCK', qty: 20, countBefore: 18, countAfter: 38, paidUzs: '400000', unitCost: '20000', note: 'Bozordan go\'sht va guruch', occurredAt: daysAgo(1, 8, 10), actorName: 'Kamola Rashidova', expenseId: 'x-1' },
  { id: 'se-3', menuItemId: 'mi-osh', kind: 'COUNT', qty: 18, countBefore: 22, countAfter: 18, paidUzs: null, unitCost: null, note: 'Kunlik sanoq', occurredAt: daysAgo(1, 8, 0), actorName: 'Dilshod Yusupov', expenseId: null },

  { id: 'se-4', menuItemId: 'mi-molkabob', kind: 'COUNT', qty: 0, countBefore: 3, countAfter: 0, paidUzs: null, unitCost: null, note: 'Hammasi sotildi', occurredAt: hoursAgo(1), actorName: 'Kamola Rashidova', expenseId: null },
  { id: 'se-5', menuItemId: 'mi-molkabob', kind: 'RESTOCK', qty: 15, countBefore: 0, countAfter: 15, paidUzs: '420000', unitCost: '28000', note: "Qassobdan mol go'shti", occurredAt: daysAgo(1, 9, 30), actorName: 'Dilshod Yusupov', expenseId: 'x-2' },

  { id: 'se-6', menuItemId: 'mi-tovuqkabob', kind: 'COUNT', qty: 27, countBefore: 20, countAfter: 27, paidUzs: null, unitCost: null, note: null, occurredAt: hoursAgo(4), actorName: 'Kamola Rashidova', expenseId: null },
  { id: 'se-7', menuItemId: 'mi-tovuqkabob', kind: 'RESTOCK', qty: 30, countBefore: 0, countAfter: 30, paidUzs: '540000', unitCost: '18000', note: null, occurredAt: daysAgo(2, 8, 15), actorName: 'Dilshod Yusupov', expenseId: 'x-3' },

  { id: 'se-8', menuItemId: 'mi-manti', kind: 'COUNT', qty: 35, countBefore: 40, countAfter: 35, paidUzs: null, unitCost: null, note: null, occurredAt: hoursAgo(5), actorName: 'Dilshod Yusupov', expenseId: null },

  { id: 'se-9', menuItemId: 'mi-somsa', kind: 'RESTOCK', qty: 60, countBefore: 0, countAfter: 60, paidUzs: '240000', unitCost: '4000', note: 'Tandirchidan', occurredAt: daysAgo(1, 7, 0), actorName: 'Kamola Rashidova', expenseId: 'x-4' },
  { id: 'se-10', menuItemId: 'mi-somsa', kind: 'COUNT', qty: 55, countBefore: 60, countAfter: 55, paidUzs: null, unitCost: null, note: null, occurredAt: hoursAgo(2), actorName: 'Dilshod Yusupov', expenseId: null },

  { id: 'se-11', menuItemId: 'mi-mastava', kind: 'COUNT', qty: 30, countBefore: 24, countAfter: 30, paidUzs: null, unitCost: null, note: null, occurredAt: hoursAgo(6), actorName: 'Kamola Rashidova', expenseId: null },
  { id: 'se-12', menuItemId: 'mi-achichuk', kind: 'COUNT', qty: 40, countBefore: 45, countAfter: 40, paidUzs: null, unitCost: null, note: null, occurredAt: hoursAgo(6), actorName: 'Kamola Rashidova', expenseId: null },
  { id: 'se-13', menuItemId: 'mi-patirnon', kind: 'RESTOCK', qty: 40, countBefore: 22, countAfter: 62, paidUzs: '100000', unitCost: '2500', note: 'Tandirdan yangi', occurredAt: hoursAgo(3), actorName: 'Dilshod Yusupov', expenseId: 'x-5' },
  { id: 'se-14', menuItemId: 'mi-vinegret', kind: 'COUNT', qty: 8, countBefore: 8, countAfter: 8, paidUzs: null, unitCost: null, note: null, occurredAt: daysAgo(1, 8, 0), actorName: 'Kamola Rashidova', expenseId: null },
];

function lastEntryAt(menuItemId: string): string | null {
  let latest: string | null = null;
  for (const e of entries) {
    if (e.menuItemId !== menuItemId) continue;
    if (latest === null || e.occurredAt > latest) latest = e.occurredAt;
  }
  return latest;
}

function toStockItem(item: (typeof items)[number]): StockItem {
  return {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: categoryName(item.categoryId),
    price: item.price,
    stockCount: item.stockCount,
    costPrice: item.costPrice,
    isAvailable: item.isAvailable,
    isActive: item.isActive,
    lastEntryAt: lastEntryAt(item.id),
  };
}

export const stockRoutes: RouteHandler = (path, method, body) => {
  const { base } = splitPath(path);

  if (method === 'GET' && base === '/api/stock') {
    return json(countedFoodItems().map(toStockItem));
  }

  const entriesMatch = /^\/api\/stock\/([^/]+)\/entries$/.exec(base);
  if (method === 'GET' && entriesMatch) {
    const id = entriesMatch[1] as string;
    return json(
      entries.filter((e) => e.menuItemId === id).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
    );
  }

  const countMatch = /^\/api\/stock\/([^/]+)\/count$/.exec(base);
  if (method === 'POST' && countMatch) {
    const id = countMatch[1] as string;
    const before = items.find((i) => i.id === id)?.stockCount ?? null;
    const countedQty = Number(body.countedQty ?? 0);
    if (!Number.isInteger(countedQty) || countedQty < 0) {
      return errorJson('VALIDATION', "Sanoq manfiy bo'lmagan butun son bo'lishi kerak");
    }
    patchItemStock(id, { stockCount: countedQty });
    const note = typeof body.note === 'string' && body.note ? body.note : null;
    const entry: StockEntry = {
      id: uid('se'),
      menuItemId: id,
      kind: 'COUNT',
      qty: countedQty,
      countBefore: before,
      countAfter: countedQty,
      paidUzs: null,
      unitCost: null,
      note,
      occurredAt: new Date().toISOString(),
      actorName: 'Dilshod Yusupov',
      expenseId: null,
    };
    entries = [entry, ...entries];
    return json(entry);
  }

  const restockMatch = /^\/api\/stock\/([^/]+)\/restock$/.exec(base);
  if (method === 'POST' && restockMatch) {
    const id = restockMatch[1] as string;
    const qty = Number(body.qty ?? 0);
    if (!Number.isInteger(qty) || qty <= 0) {
      return errorJson('VALIDATION', "Miqdor 0 dan katta butun son bo'lishi kerak");
    }
    const before = items.find((i) => i.id === id)?.stockCount ?? null;
    const after = (before ?? 0) + qty;
    const paidUzs = body.paidUzs == null ? null : Number(body.paidUzs);
    const setCostFromPaid = body.setCostFromPaid === true;
    const unitCost = paidUzs && qty ? Math.round(paidUzs / qty) : null;
    patchItemStock(id, {
      stockCount: after,
      ...(setCostFromPaid && unitCost ? { costPrice: String(unitCost) } : {}),
    });
    const note = typeof body.note === 'string' && body.note ? body.note : null;
    const entry: StockEntry = {
      id: uid('se'),
      menuItemId: id,
      kind: 'RESTOCK',
      qty,
      countBefore: before,
      countAfter: after,
      paidUzs: paidUzs === null ? null : String(paidUzs),
      unitCost: unitCost === null ? null : String(unitCost),
      note,
      occurredAt: new Date().toISOString(),
      actorName: 'Dilshod Yusupov',
      expenseId: paidUzs ? uid('x') : null,
    };
    entries = [entry, ...entries];
    return json(entry);
  }

  return null;
};
