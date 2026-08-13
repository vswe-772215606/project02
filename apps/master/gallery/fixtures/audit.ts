import type { AuditLogItem } from '@/api/audit';
import { orders } from './orders';
import { daysAgo, hoursAgo, json, minutesAgo, splitPath, type RouteHandler } from './util';

function orderNumberOf(orderId: string): string {
  return orders.find((o) => o.id === orderId)?.orderNumber ?? orderId.slice(-6).toUpperCase();
}

type Actor = AuditLogItem['user'];

const DILSHOD: Actor = { id: 'u-owner', fullName: 'Dilshod Yusupov', role: 'OWNER' };
const KAMOLA: Actor = { id: 'u-admin', fullName: 'Kamola Rashidova', role: 'ADMIN' };
const BOTIR: Actor = { id: 'u-waiter-botir', fullName: 'Botir Nazarov', role: 'WAITER' };
const AZIZA: Actor = { id: 'u-waiter-aziza', fullName: 'Aziza Karimova', role: 'WAITER' };
const SARDOR: Actor = { id: 'u-waiter-sardor', fullName: 'Sardor Tishabayev', role: 'WAITER' };

let seq = 0;
function row(createdAt: string, user: Actor, action: string, entityType: string, entityId: string | null, metadata: unknown): AuditLogItem {
  seq += 1;
  return { id: `audit-${seq}`, userId: user.id, action, entityType, entityId, metadata, createdAt, user };
}

// One entry per order today already settled, canceled or walked out — reuses
// the real order records so Amallar tarixi agrees with Buyurtmalar.
const orderRows: AuditLogItem[] = orders.flatMap((o, idx) => {
  const admin = idx % 2 === 0 ? KAMOLA : DILSHOD;
  if (o.status === 'CLOSED') {
    return [
      row(o.closedAt ?? o.createdAt, admin, 'ORDER_CONFIRMED', 'Order', o.id, {
        orderNumber: o.orderNumber,
        tableName: o.tableName ?? "Olib ketish",
        waiterName: o.waiter?.fullName ?? '—',
        total: String(o.totalSnapshot ?? o.totalAmount),
        payments: o.debt ? "naqd + qarz" : 'naqd + karta',
      }),
    ];
  }
  if (o.status === 'WALKOUT') {
    return [
      row(o.closedAt ?? o.createdAt, admin, 'WALKOUT_MARKED', 'Order', o.id, {
        orderNumber: o.orderNumber,
        amount: String(o.totalAmount),
        reason: o.cancelReason ?? '',
      }),
    ];
  }
  if (o.status === 'CANCELED') {
    return [
      row(o.canceledAt ?? o.createdAt, o.waiter ?? admin, 'ORDER_CANCELED', 'Order', o.id, {
        orderNumber: o.orderNumber,
        reason: o.cancelReason ?? '',
      }),
    ];
  }
  return [];
});

const otherRows: AuditLogItem[] = [
  row(hoursAgo(9), DILSHOD, 'EXPENSE_CREATED', 'Expense', 'x-101', { reason: 'Oshpazga avans', amount: '200000', categoryName: 'Operatsion', repayable: true }),
  row(hoursAgo(8), KAMOLA, 'EXPENSE_CREATED', 'Expense', 'x-102', { reason: "Elektr energiyasi to'lovi", amount: '180000', categoryName: 'Operatsion' }),
  row(hoursAgo(10), DILSHOD, 'EXPENSE_CREATED', 'Expense', 'x-103', { reason: "Bozordan sabzavot va ko'katlar", amount: '350000', categoryName: "Mahsulot xaridi" }),
  row(hoursAgo(7), KAMOLA, 'EXPENSE_CREATED', 'Expense', 'x-107', { reason: 'Taksi puli (xato kiritilgan)', amount: '20000', categoryName: 'Operatsion' }),
  row(hoursAgo(7), KAMOLA, 'EXPENSE_REVERSED', 'Expense', 'x-107', { reason: 'Taksi puli (xato kiritilgan)', amount: '20000', note: "Noto'g'ri kategoriya, qayta kiritildi" }),
  row(hoursAgo(3), DILSHOD, 'EXPENSE_RETURN_RECEIVED', 'Expense', 'x-108', { reason: "Sardorga avans (ta'mirlash uchun)", amount: '240000' }),
  row(daysAgo(1, 15, 0), KAMOLA, 'EXPENSE_RETURN_RECEIVED', 'Expense', 'x-109', { reason: 'Bozorchiga avans', amount: '150000' }),
  row(daysAgo(2, 9, 0), DILSHOD, 'EXPENSE_WRITTEN_OFF', 'Expense', 'x-110', { reason: 'Sobiq xodimga avans', amount: '80000', writtenOffReason: "Xodim ishdan bo'shadi, qaytarib bo'lmadi" }),

  row(hoursAgo(8), KAMOLA, 'DEBT_CREATED', 'Debt', 'debt-rustam', { debtorName: 'Rustam Qodirov', amount: '214000', orderNumber: 'D0-004' }),
  row(hoursAgo(4), KAMOLA, 'DEBT_CREATED', 'Debt', 'debt-zarina', { debtorName: 'Zarina Yusupova', amount: '176000', orderNumber: 'SED-10' }),
  row(daysAgo(2, 19, 30), AZIZA, 'DEBT_CREATED', 'Debt', 'debt-malika', { debtorName: 'Malika Tosheva', amount: '210000', orderNumber: 'B77C41' }),
  row(hoursAgo(2), KAMOLA, 'DEBT_PAYMENT_RECORDED', 'Debt', 'debt-zarina', { debtorName: 'Zarina Yusupova', amount: '176000', method: 'CASH' }),
  row(hoursAgo(2), KAMOLA, 'DEBT_CLOSED', 'Debt', 'debt-zarina', { debtorName: 'Zarina Yusupova', totalRepaid: '176000' }),
  row(hoursAgo(5), DILSHOD, 'DEBT_PAYMENT_RECORDED', 'Debt', 'debt-malika', { debtorName: 'Malika Tosheva', amount: '84000', method: 'CASH' }),
  row(daysAgo(4, 10, 0), DILSHOD, 'DEBT_PAYMENT_RECORDED', 'Debt', 'debt-shoira', { debtorName: 'Shoira Nabieva', amount: '65000', method: 'CASH' }),
  row(daysAgo(4, 10, 0), DILSHOD, 'DEBT_CLOSED', 'Debt', 'debt-shoira', { debtorName: 'Shoira Nabieva', totalRepaid: '65000' }),

  row(minutesAgo(140), KAMOLA, 'TABLE_TRANSFERRED', 'Order', 'ord-stol5', { orderNumber: orderNumberOf('ord-stol5'), fromTable: 'Stol 4', toTable: 'Stol 5' }),
  row(daysAgo(1, 13, 20), SARDOR, 'TABLE_TRANSFERRED', 'Order', 'ord-hist-jasur', { orderNumber: 'F63B17', fromTable: 'Stol 3', toTable: 'Stol 6' }),

  row(hoursAgo(1), KAMOLA, 'RECEIPT_REPRINTED', 'Order', 'ord-closed-14', { orderNumber: orderNumberOf('ord-closed-14'), reason: 'Chek yoʻqolgan' }),
  row(daysAgo(1, 12, 0), DILSHOD, 'RECEIPT_REPRINTED', 'Order', 'ord-hist-malika', { orderNumber: 'B77C41', reason: "Nasiya to'lov vaqtida" }),

  row(hoursAgo(6), KAMOLA, 'DISCOUNT_APPLIED', 'Order', 'ord-closed-02', { orderNumber: orderNumberOf('ord-closed-02'), discountName: "Doimiy mijoz chegirmasi", amount: '8000' }),
  row(hoursAgo(3), DILSHOD, 'DISCOUNT_APPLIED', 'Order', 'ord-closed-12', { orderNumber: orderNumberOf('ord-closed-12'), discountName: 'Chegirma', amount: '15000' }),
  row(hoursAgo(2), KAMOLA, 'SERVICE_CHARGE_WAIVED', 'Order', 'ord-walkout-03', { orderNumber: orderNumberOf('ord-walkout-03'), amount: '20000' }),

  row(daysAgo(3, 11, 0), DILSHOD, 'DISCOUNT_CREATED', 'Discount', 'disc-birthday', { name: "Tug'ilgan kun chegirmasi", type: 'PERCENT', value: 20 }),
  row(daysAgo(3, 11, 5), DILSHOD, 'DISCOUNT_CREATED', 'Discount', 'disc-15pct-vip', { name: 'VIP mijozlar uchun', type: 'PERCENT', value: 15 }),
  row(daysAgo(2, 16, 0), DILSHOD, 'DISCOUNT_EDITED', 'Discount', 'disc-20k', { name: "20 000 so'm chegirma", changes: 'value: 15000 -> 20000' }),
  row(daysAgo(9, 10, 0), DILSHOD, 'DISCOUNT_DELETED', 'Discount', 'disc-staff', { name: 'Xodimlar uchun chegirma' }),

  row(daysAgo(6, 9, 0), DILSHOD, 'USER_CREATED', 'User', 'u-waiter-sardor', { fullName: 'Sardor Tishabayev', role: 'WAITER' }),
  row(daysAgo(15, 14, 0), DILSHOD, 'USER_DEACTIVATED', 'User', 'u-waiter-nodira', { fullName: 'Nodira Ergasheva' }),

  row(daysAgo(1, 21, 40), DILSHOD, 'SETTINGS_CHANGED', 'Setting', 'alert_expense_threshold', { key: 'alert_expense_threshold', value: '500000' }),
  row(daysAgo(4, 8, 15), KAMOLA, 'SETTINGS_CHANGED', 'Setting', 'admin_printer_name', { key: 'admin_printer_name', value: 'POS-80 (USB)' }),
  row(daysAgo(30, 9, 0), DILSHOD, 'SETTINGS_CHANGED', 'Setting', 'store_heading', { key: 'store_heading', value: 'Chayxana "Guliston"' }),

  row(daysAgo(1, 8, 30), KAMOLA, 'EXPENSE_CREATED', 'Expense', 'x-111', { reason: "Go'sht va tovuq xaridi", amount: '420000', categoryName: 'Mahsulot xaridi' }),
  row(daysAgo(1, 19, 10), DILSHOD, 'EXPENSE_CREATED', 'Expense', 'hist-1', { reason: 'Ijara toʻlovi', amount: '3500000', categoryName: 'Operatsion' }),
  row(daysAgo(2, 20, 0), DILSHOD, 'DEBT_WRITTEN_OFF', 'Debt', 'hist-debt-1', { debtorName: "Noma'lum mijoz", amount: '35000', reason: "Qidirib topilmadi" }),
  row(daysAgo(5, 14, 0), KAMOLA, 'DEBT_CREATED', 'Debt', 'debt-gulnora', { debtorName: 'Gulnora Ismoilova', amount: '400000', orderNumber: 'A41E88' }),
  row(daysAgo(1, 12, 0), KAMOLA, 'DEBT_PAYMENT_RECORDED', 'Debt', 'debt-gulnora', { debtorName: 'Gulnora Ismoilova', amount: '100000', method: 'CARD' }),
  row(daysAgo(10, 20, 0), BOTIR, 'DEBT_CREATED', 'Debt', 'debt-akmal', { debtorName: 'Akmal Rashidov', amount: '900000', orderNumber: 'E15C60' }),
  row(daysAgo(3, 13, 0), SARDOR, 'DEBT_CREATED', 'Debt', 'debt-sherzod', { debtorName: 'Sherzod Aliyev', amount: '95000', orderNumber: 'C29F05' }),
  row(daysAgo(1, 21, 0), AZIZA, 'DEBT_CREATED', 'Debt', 'debt-jasur', { debtorName: 'Jasur Yoqubov', amount: '128000', orderNumber: 'F63B17' }),
];

export let entries: AuditLogItem[] = [...orderRows, ...otherRows].sort(
  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
);

export const auditRoutes: RouteHandler = (path, method) => {
  const { base, query } = splitPath(path);
  if (method !== 'GET' || base !== '/api/audit') return null;

  const action = query.get('action');
  const userId = query.get('userId');
  const from = query.get('from');
  const to = query.get('to');
  const page = Number(query.get('page') ?? '1');
  const pageSize = Number(query.get('pageSize') ?? '25');

  let filtered = entries;
  if (action) filtered = filtered.filter((e) => e.action === action);
  if (userId) filtered = filtered.filter((e) => e.userId === userId);
  if (from) filtered = filtered.filter((e) => e.createdAt.slice(0, 10) >= from);
  if (to) filtered = filtered.filter((e) => e.createdAt.slice(0, 10) <= to);

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return json({ items, total, page, pageSize });
};
