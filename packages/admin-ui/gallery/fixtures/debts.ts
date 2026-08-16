import type { DebtDetail, DebtListItem } from '@/api/debts';
import { orders } from './orders';
import { daysAgo, errorJson, hoursAgo, json, splitPath, type RouteHandler } from './util';

type Repayment = DebtDetail['repayments'][number];
type OrderRef = DebtDetail['order'];

type Seed = {
  id: string;
  orderId: string;
  debtorName: string;
  debtorPhone: string | null;
  note: string | null;
  originalAmount: number;
  repaidAmount: number;
  openedAt: string;
  closedAt: string | null;
  status: DebtListItem['status'];
  repayments: Repayment[];
  order: OrderRef;
};

function orderRef(orderId: string, fallback: OrderRef): OrderRef {
  const real = orders.find((o) => o.id === orderId);
  if (!real) return fallback;
  return {
    id: real.id,
    orderNumber: real.orderNumber,
    closedAt: real.closedAt,
    totalSnapshot: String(real.totalSnapshot ?? real.totalAmount),
    waiterName: real.waiter?.fullName ?? '—',
    tableName: real.tableName,
  };
}

const SEEDS: Seed[] = [
  {
    id: 'debt-rustam', orderId: 'ord-closed-04', debtorName: 'Rustam Qodirov', debtorPhone: '+998 90 123 45 67', note: "Doimiy mijoz, ertaga to'lashga va'da berdi",
    originalAmount: 214000, repaidAmount: 0, openedAt: hoursAgo(8), closedAt: null, status: 'OPEN', repayments: [],
    order: orderRef('ord-closed-04', { id: 'ord-closed-04', orderNumber: 'D0-004', closedAt: hoursAgo(8), totalSnapshot: '410000', waiterName: 'Botir Nazarov', tableName: 'Xona 2' }),
  },
  {
    // Awkward case: fully repaid the same day it was opened.
    id: 'debt-zarina', orderId: 'ord-closed-10', debtorName: 'Zarina Yusupova', debtorPhone: '+998 91 234 56 78', note: null,
    originalAmount: 176000, repaidAmount: 176000, openedAt: hoursAgo(4), closedAt: hoursAgo(2), status: 'PAID',
    repayments: [{ id: 'rp-1', amount: '176000', method: 'CASH', paidAt: hoursAgo(2), note: null, receivedById: 'u-admin', receivedByName: 'Kamola Rashidova' }],
    order: orderRef('ord-closed-10', { id: 'ord-closed-10', orderNumber: 'SED-10', closedAt: hoursAgo(4), totalSnapshot: '286000', waiterName: 'Botir Nazarov', tableName: 'Stol 1' }),
  },
  {
    id: 'debt-malika', orderId: 'ord-hist-malika', debtorName: 'Malika Tosheva', debtorPhone: '+998 93 345 67 89', note: "To'y tashkil qilgan, katta buyurtma",
    originalAmount: 210000, repaidAmount: 84000, openedAt: daysAgo(2, 19, 30), closedAt: null, status: 'PARTIAL',
    repayments: [{ id: 'rp-2', amount: '84000', method: 'CASH', paidAt: hoursAgo(5), note: 'Qisman', receivedById: 'u-owner', receivedByName: 'Dilshod Yusupov' }],
    order: { id: 'ord-hist-malika', orderNumber: 'B77C41', closedAt: daysAgo(2, 19, 30), totalSnapshot: '210000', waiterName: 'Aziza Karimova', tableName: 'Xona 1' },
  },
  {
    id: 'debt-sherzod', orderId: 'ord-hist-sherzod', debtorName: 'Sherzod Aliyev', debtorPhone: null, note: null,
    originalAmount: 95000, repaidAmount: 0, openedAt: daysAgo(3, 13, 0), closedAt: null, status: 'OPEN', repayments: [],
    order: { id: 'ord-hist-sherzod', orderNumber: 'C29F05', closedAt: daysAgo(3, 13, 0), totalSnapshot: '95000', waiterName: 'Sardor Tishabayev', tableName: null },
  },
  {
    id: 'debt-gulnora', orderId: 'ord-hist-gulnora', debtorName: 'Gulnora Ismoilova', debtorPhone: '+998 94 456 78 90', note: "Har oy 27-sanada ish haqi olgach to'laydi",
    originalAmount: 400000, repaidAmount: 100000, openedAt: daysAgo(5, 14, 0), closedAt: null, status: 'PARTIAL',
    repayments: [{ id: 'rp-3', amount: '100000', method: 'CARD', paidAt: daysAgo(1, 12, 0), note: null, receivedById: 'u-admin', receivedByName: 'Kamola Rashidova' }],
    order: { id: 'ord-hist-gulnora', orderNumber: 'A41E88', closedAt: daysAgo(5, 14, 0), totalSnapshot: '400000', waiterName: 'Aziza Karimova', tableName: 'Xona 3' },
  },
  {
    id: 'debt-jasur', orderId: 'ord-hist-jasur', debtorName: 'Jasur Yoqubov', debtorPhone: '+998 95 567 89 01', note: null,
    originalAmount: 128000, repaidAmount: 0, openedAt: daysAgo(1, 21, 0), closedAt: null, status: 'OPEN', repayments: [],
    order: { id: 'ord-hist-jasur', orderNumber: 'F63B17', closedAt: daysAgo(1, 21, 0), totalSnapshot: '128000', waiterName: 'Sardor Tishabayev', tableName: 'Stol 6' },
  },
  {
    id: 'debt-shoira', orderId: 'ord-hist-shoira', debtorName: 'Shoira Nabieva', debtorPhone: '+998 97 678 90 12', note: null,
    originalAmount: 65000, repaidAmount: 65000, openedAt: daysAgo(6, 18, 0), closedAt: daysAgo(4, 10, 0), status: 'PAID',
    repayments: [{ id: 'rp-4', amount: '65000', method: 'CASH', paidAt: daysAgo(4, 10, 0), note: null, receivedById: 'u-owner', receivedByName: 'Dilshod Yusupov' }],
    order: { id: 'ord-hist-shoira', orderNumber: 'D92A73', closedAt: daysAgo(6, 18, 0), totalSnapshot: '65000', waiterName: 'Botir Nazarov', tableName: null },
  },
  {
    // Awkward case: old and large — the debt Hisobot's "qarz qoldig'i" mostly is.
    id: 'debt-akmal', orderId: 'ord-hist-akmal', debtorName: 'Akmal Rashidov', debtorPhone: '+998 99 789 01 23', note: "Restoran uchun muntazam yetkazib beruvchi, o'zaro hisob-kitob",
    originalAmount: 900000, repaidAmount: 0, openedAt: daysAgo(10, 20, 0), closedAt: null, status: 'OPEN', repayments: [],
    order: { id: 'ord-hist-akmal', orderNumber: 'E15C60', closedAt: daysAgo(10, 20, 0), totalSnapshot: '900000', waiterName: 'Botir Nazarov', tableName: 'Xona 4' },
  },
];

function toListItem(s: Seed): DebtListItem {
  return {
    id: s.id,
    orderId: s.orderId,
    orderNumber: s.order.orderNumber,
    debtorName: s.debtorName,
    debtorPhone: s.debtorPhone,
    note: s.note,
    originalAmount: String(s.originalAmount),
    remainingAmount: String(s.originalAmount - s.repaidAmount),
    repaidAmount: String(s.repaidAmount),
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    status: s.status,
  };
}

export let debts: Seed[] = SEEDS;

export const debtsRoutes: RouteHandler = (path, method, body) => {
  const { base, query } = splitPath(path);

  if (method === 'GET' && base === '/api/debts') {
    const status = query.get('status');
    const filtered = status ? debts.filter((d) => d.status === status) : debts;
    return json({ items: filtered.map(toListItem) });
  }

  const getMatch = /^\/api\/debts\/([^/]+)$/.exec(base);
  if (method === 'GET' && getMatch) {
    const s = debts.find((d) => d.id === getMatch[1]);
    if (!s) return errorJson('NOT_FOUND', 'Qarz topilmadi', 404);
    const detail: DebtDetail = { ...toListItem(s), repayments: s.repayments, order: s.order };
    return json(detail);
  }

  const repayMatch = /^\/api\/debts\/([^/]+)\/repayments$/.exec(base);
  if (method === 'POST' && repayMatch) {
    const id = repayMatch[1] as string;
    const target = debts.find((d) => d.id === id);
    if (!target) return errorJson('NOT_FOUND', 'Qarz topilmadi', 404);
    if (target.status === 'PAID' || target.status === 'WRITTEN_OFF') {
      return errorJson('ILLEGAL_STATE', 'Bu qarz allaqachon yopilgan');
    }
    const amount = Number(body.amount ?? 0);
    const method2 = body.method === 'CARD' ? 'CARD' : 'CASH';
    const remaining = target.originalAmount - target.repaidAmount;
    if (amount <= 0 || amount > remaining) return errorJson('VALIDATION', "Noto'g'ri summa");
    const nowIso = new Date().toISOString();
    const newRepaid = target.repaidAmount + amount;
    const closed = newRepaid >= target.originalAmount;
    const updated: Seed = {
      ...target,
      repaidAmount: newRepaid,
      status: closed ? 'PAID' : 'PARTIAL',
      closedAt: closed ? nowIso : target.closedAt,
      repayments: [
        ...target.repayments,
        {
          id: `rp-${Date.now()}`,
          amount: String(amount),
          method: method2,
          paidAt: typeof body.paidAt === 'string' && body.paidAt ? body.paidAt : nowIso,
          note: typeof body.note === 'string' && body.note ? body.note : null,
          receivedById: 'u-owner',
          receivedByName: 'Dilshod Yusupov',
        },
      ],
    };
    debts = debts.map((d) => (d.id === id ? updated : d));
    const detail: DebtDetail = { ...toListItem(updated), repayments: updated.repayments, order: updated.order };
    return json(detail);
  }

  return null;
};
