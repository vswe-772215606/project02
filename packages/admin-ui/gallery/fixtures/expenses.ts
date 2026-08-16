import type { ExpenseItem } from '@/api/expenses';
import { dayKey, errorJson, hoursAgo, json, splitPath, sum, uid, type RouteHandler } from './util';

const CATEGORY = {
  ingredients: { id: 'seed-cat-ingredients', name: "Mahsulot xaridi" },
  operational: { id: 'seed-cat-operational', name: 'Operatsion' },
};

export let items: ExpenseItem[] = [
  { id: 'x-101', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '200000', signedAmount: '200000', reason: 'Oshpazga avans', note: 'Bozor uchun', occurredAt: hoursAgo(9), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: true, repayStatus: 'PENDING', remainingAmount: '200000', returnedTotal: '0', writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-owner', createdByName: 'Dilshod Yusupov', createdAt: hoursAgo(9) },
  { id: 'x-102', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '180000', signedAmount: '180000', reason: "Elektr energiyasi to'lovi", note: null, occurredAt: hoursAgo(8), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(8) },
  { id: 'x-103', categoryId: CATEGORY.ingredients.id, categoryName: CATEGORY.ingredients.name, amount: '350000', signedAmount: '350000', reason: "Bozordan sabzavot va ko'katlar", note: 'Achchiq bozor', occurredAt: hoursAgo(10), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-owner', createdByName: 'Dilshod Yusupov', createdAt: hoursAgo(10) },
  { id: 'x-104', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '95000', signedAmount: '95000', reason: 'Idish-tovoq sotib olindi', note: null, occurredAt: hoursAgo(6), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(6) },
  { id: 'x-105', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '120000', signedAmount: '120000', reason: 'Gaz balloni', note: null, occurredAt: hoursAgo(5), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(5) },
  { id: 'x-106', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '45000', signedAmount: '45000', reason: 'Ofitsiantga transport puli', note: null, occurredAt: hoursAgo(4), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(4) },
  // Entered, then bekor qilindi the same day — the reversal pair.
  { id: 'x-107', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '20000', signedAmount: '20000', reason: 'Taksi puli (xato kiritilgan)', note: null, occurredAt: hoursAgo(7), status: 'REVERSED', reversedExpenseId: 'x-107r', purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(7) },
  { id: 'x-107r', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '20000', signedAmount: '-20000', reason: 'Taksi puli (xato kiritilgan) — bekor qilindi', note: "Noto'g'ri kategoriya, qayta kiritildi", occurredAt: hoursAgo(7), status: 'REVERSAL', reversedExpenseId: null, purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(7) },
  // Partially returned avans — the "still open, but not for the full amount" case.
  {
    id: 'x-108', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '500000', signedAmount: '500000', reason: "Sardorga avans (ta'mirlash uchun)", note: "Oshxona jo'mragi", occurredAt: hoursAgo(30), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: true, repayStatus: 'PARTIAL', remainingAmount: '260000', returnedTotal: '240000', writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null,
    returns: [{ id: 'ret-1', amount: '240000', receivedAt: hoursAgo(3), receivedById: 'u-owner', receivedByName: 'Dilshod Yusupov', note: "Qisman qaytardi, qolgani hafta oxirida", createdAt: hoursAgo(3) }],
    createdById: 'u-owner', createdByName: 'Dilshod Yusupov', createdAt: hoursAgo(30),
  },
  // Fully returned avans.
  {
    id: 'x-109', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '150000', signedAmount: '150000', reason: 'Bozorchiga avans', note: null, occurredAt: hoursAgo(28), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: true, repayStatus: 'RETURNED', remainingAmount: '0', returnedTotal: '150000', writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null,
    returns: [{ id: 'ret-2', amount: '150000', receivedAt: hoursAgo(20), receivedById: 'u-admin', receivedByName: 'Kamola Rashidova', note: null, createdAt: hoursAgo(20) }],
    createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(28),
  },
  // Awkward case: an avans nobody is ever getting back.
  { id: 'x-110', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '80000', signedAmount: '80000', reason: 'Sobiq xodimga avans', note: null, occurredAt: hoursAgo(200), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: true, repayStatus: 'WRITTEN_OFF', remainingAmount: '0', returnedTotal: '0', writtenOffAt: hoursAgo(190), writtenOffReason: "Xodim ishdan bo'shadi, qaytarib bo'lmadi", writtenOffById: 'u-owner', writtenOffByName: 'Dilshod Yusupov', returns: [], createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(200) },
  { id: 'x-111', categoryId: CATEGORY.ingredients.id, categoryName: CATEGORY.ingredients.name, amount: '420000', signedAmount: '420000', reason: "Go'sht va tovuq xaridi", note: 'Haftalik', occurredAt: hoursAgo(11), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-owner', createdByName: 'Dilshod Yusupov', createdAt: hoursAgo(11) },
  { id: 'x-112', categoryId: CATEGORY.operational.id, categoryName: CATEGORY.operational.name, amount: '60000', signedAmount: '60000', reason: 'Tozalik vositalari', note: null, occurredAt: hoursAgo(2), status: 'ACTIVE', reversedExpenseId: null, purchaseId: null, repayable: false, repayStatus: 'NOT_REPAYABLE', remainingAmount: null, returnedTotal: null, writtenOffAt: null, writtenOffReason: null, writtenOffById: null, writtenOffByName: null, returns: [], createdById: 'u-admin', createdByName: 'Kamola Rashidova', createdAt: hoursAgo(2) },
];

function todayTotals(list: ExpenseItem[]) {
  const gross = sum(list.filter((i) => i.status !== 'REVERSAL').map((i) => i.amount));
  const reversal = sum(list.filter((i) => i.status === 'REVERSAL').map((i) => i.amount));
  return { gross: String(gross), reversal: String(reversal), net: String(gross - reversal) };
}

function byCategory(list: ExpenseItem[]) {
  const totals = new Map<string, { categoryId: string; categoryName: string; amount: number }>();
  for (const item of list) {
    const row = totals.get(item.categoryId) ?? { categoryId: item.categoryId, categoryName: item.categoryName, amount: 0 };
    row.amount += Number(item.signedAmount);
    totals.set(item.categoryId, row);
  }
  return [...totals.values()]
    .filter((r) => r.amount !== 0)
    .map((r) => ({ categoryId: r.categoryId, categoryName: r.categoryName, amount: String(r.amount) }));
}

export const expensesRoutes: RouteHandler = (path, method, body) => {
  const { base, query } = splitPath(path);

  if (method === 'GET' && base === '/api/expenses') {
    return json({ date: query.get('date') || dayKey(), items, totals: todayTotals(items), byCategory: byCategory(items) });
  }

  if (method === 'GET' && base === '/api/expenses/search') {
    const q = query.get('q')?.toLowerCase() ?? '';
    const repayableParam = query.get('repayable');
    const openRepayable = query.get('openRepayable') === 'true';
    const limit = Number(query.get('limit') ?? '200');
    let results = items;
    if (q) results = results.filter((i) => i.reason.toLowerCase().includes(q) || i.categoryName.toLowerCase().includes(q));
    if (repayableParam !== null) results = results.filter((i) => i.repayable === (repayableParam === 'true'));
    if (openRepayable) results = results.filter((i) => i.repayable && (i.repayStatus === 'PENDING' || i.repayStatus === 'PARTIAL'));
    return json({ items: results.slice(0, limit) });
  }

  if (method === 'POST' && base === '/api/expenses') {
    const now = new Date().toISOString();
    const repayable = body.repayable === true;
    const created: ExpenseItem = {
      id: uid('x'),
      categoryId: typeof body.categoryId === 'string' ? body.categoryId : CATEGORY.operational.id,
      categoryName: typeof body.categoryId === 'string' && body.categoryId === CATEGORY.ingredients.id ? CATEGORY.ingredients.name : CATEGORY.operational.name,
      amount: String(Number(body.amount ?? 0)),
      signedAmount: String(Number(body.amount ?? 0)),
      reason: typeof body.reason === 'string' ? body.reason : '',
      note: typeof body.note === 'string' && body.note ? body.note : null,
      occurredAt: typeof body.occurredAt === 'string' ? body.occurredAt : now,
      status: 'ACTIVE',
      reversedExpenseId: null,
      purchaseId: null,
      repayable,
      repayStatus: repayable ? 'PENDING' : 'NOT_REPAYABLE',
      remainingAmount: repayable ? String(Number(body.amount ?? 0)) : null,
      returnedTotal: repayable ? '0' : null,
      writtenOffAt: null,
      writtenOffReason: null,
      writtenOffById: null,
      writtenOffByName: null,
      returns: [],
      createdById: 'u-owner',
      createdByName: 'Dilshod Yusupov',
      createdAt: now,
    };
    items = [created, ...items];
    return json(created, 201);
  }

  const reverseMatch = /^\/api\/expenses\/([^/]+)\/reverse$/.exec(base);
  if (method === 'POST' && reverseMatch) {
    const id = reverseMatch[1] as string;
    const original = items.find((i) => i.id === id);
    if (!original) return errorJson('NOT_FOUND', 'Chiqim topilmadi', 404);
    const now = new Date().toISOString();
    const reversal: ExpenseItem = {
      ...original,
      id: uid('x'),
      signedAmount: String(-Number(original.amount)),
      reason: `${original.reason} — bekor qilindi`,
      note: typeof body.note === 'string' ? body.note : null,
      status: 'REVERSAL',
      reversedExpenseId: null,
      returns: [],
      createdAt: now,
      occurredAt: now,
    };
    const updatedOriginal: ExpenseItem = { ...original, status: 'REVERSED', reversedExpenseId: reversal.id };
    items = [reversal, ...items.map((i) => (i.id === id ? updatedOriginal : i))];
    return json({ original: updatedOriginal, reversal });
  }

  const returnMatch = /^\/api\/expenses\/([^/]+)\/returns$/.exec(base);
  if (method === 'POST' && returnMatch) {
    const id = returnMatch[1] as string;
    const target = items.find((i) => i.id === id);
    if (!target) return errorJson('NOT_FOUND', 'Chiqim topilmadi', 404);
    const amount = Number(body.amount ?? 0);
    const returnedTotal = Number(target.returnedTotal ?? '0') + amount;
    const remaining = Math.max(Number(target.amount) - returnedTotal, 0);
    const updated: ExpenseItem = {
      ...target,
      returnedTotal: String(returnedTotal),
      remainingAmount: String(remaining),
      repayStatus: remaining <= 0 ? 'RETURNED' : 'PARTIAL',
      returns: [
        ...target.returns,
        {
          id: uid('ret'),
          amount: String(amount),
          receivedAt: typeof body.receivedAt === 'string' ? body.receivedAt : new Date().toISOString(),
          receivedById: 'u-owner',
          receivedByName: 'Dilshod Yusupov',
          note: typeof body.note === 'string' && body.note ? body.note : null,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    items = items.map((i) => (i.id === id ? updated : i));
    return json(updated);
  }

  const writeOffMatch = /^\/api\/expenses\/([^/]+)\/write-off$/.exec(base);
  if (method === 'POST' && writeOffMatch) {
    const id = writeOffMatch[1] as string;
    const target = items.find((i) => i.id === id);
    if (!target) return errorJson('NOT_FOUND', 'Chiqim topilmadi', 404);
    const updated: ExpenseItem = {
      ...target,
      repayStatus: 'WRITTEN_OFF',
      remainingAmount: '0',
      writtenOffAt: new Date().toISOString(),
      writtenOffReason: typeof body.reason === 'string' ? body.reason : '',
      writtenOffById: 'u-owner',
      writtenOffByName: 'Dilshod Yusupov',
    };
    items = items.map((i) => (i.id === id ? updated : i));
    return json(updated);
  }

  return null;
};
