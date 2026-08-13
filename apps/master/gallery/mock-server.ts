import type { Order, OrderLine } from '@/api/orders';
import type { StockEntry, StockItem } from '@/api/stock';

/**
 * A stand-in for the master's HTTP API, so the real pages can be looked at in
 * a browser on a machine that cannot run Electron.
 *
 * It stubs `window.fetch` rather than the api client, which means the pages,
 * their queries, their mutations and their cache invalidation all run exactly
 * as they do in the app — only the responses are invented. State is held in
 * memory and mutated by the same POSTs the real screens send, so saving a
 * count really does advance the queue.
 */

const now = Date.now();
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

function line(orderId: string, n: number, name: string, price: number, quantity: number, kind: 'FOOD' | 'SERVICE' = 'FOOD'): OrderLine {
  return {
    id: `${orderId}-l${n}`,
    orderId,
    menuItemId: `mi-${n}`,
    menuItemKind: kind,
    comboId: null,
    comboGroupId: null,
    comboNameSnapshot: null,
    name,
    nameSnapshot: name,
    price,
    quantity,
    notes: null,
    status: 'ACTIVE',
    isCanceled: false,
    createdAt: at(30),
  };
}

function order(
  id: string,
  tableName: string | null,
  waiter: string,
  minutesAgo: number,
  lines: OrderLine[],
): Order {
  const food = lines.filter((l) => l.menuItemKind === 'FOOD').reduce((s, l) => s + l.price * l.quantity, 0);
  const service = lines.filter((l) => l.menuItemKind === 'SERVICE').reduce((s, l) => s + l.price * l.quantity, 0);
  return {
    id,
    orderNumber: id.slice(-6).toUpperCase(),
    orderType: tableName ? 'DINE_IN' : 'TAKEAWAY',
    tableId: tableName ? `t-${id}` : null,
    tableName,
    waiterId: `w-${waiter}`,
    waiter: { id: `w-${waiter}`, fullName: waiter, role: 'WAITER', username: null, isActive: true },
    status: 'SENT',
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    totalAmount: food + service,
    subtotalSnapshot: food,
    discountAmountSnapshot: 0,
    serviceChargeSnapshot: service,
    totalSnapshot: food + service,
    discountId: null,
    serviceChargeWaived: false,
    createdAt: at(minutesAgo),
    updatedAt: at(minutesAgo),
    closedAt: null,
    canceledAt: null,
    cancelReason: null,
    lines,
  } as Order;
}

let orders: Order[] = [
  order('ord-a3f91c', 'Xona 3', 'Botir', 18, [
    line('ord-a3f91c', 1, 'Osh', 30000, 2),
    line('ord-a3f91c', 2, 'Somsa', 8000, 4),
    line('ord-a3f91c', 3, "Ko'k choy", 3000, 6),
    line('ord-a3f91c', 4, 'Xizmat haqi', 10000, 4, 'SERVICE'),
  ]),
  order('ord-b7c204', 'Stol 5', 'Aziza', 35, [
    line('ord-b7c204', 1, 'Mastava', 22000, 2),
    line('ord-b7c204', 2, 'Patir non', 5000, 4),
  ]),
  order('ord-c1d885', null, 'Botir', 59, [
    line('ord-c1d885', 1, 'Mol kabob', 45000, 12),
    line('ord-c1d885', 2, 'Achichuk', 12000, 6),
    line('ord-c1d885', 3, 'Qora choy', 3000, 10),
  ]),
  order('ord-d4e772', 'Stol 2', 'Aziza', 70, [
    line('ord-d4e772', 1, 'Lag\'mon', 28000, 3),
  ]),
];

let stock: StockItem[] = [
  { id: 's1', name: 'Osh', categoryId: 'c1', categoryName: 'Issiq taomlar', price: 30000, stockCount: null, costPrice: '20000', isAvailable: true, isActive: true, lastEntryAt: at(1500) },
  { id: 's2', name: 'Somsa', categoryId: 'c1', categoryName: 'Issiq taomlar', price: 8000, stockCount: null, costPrice: '4000', isAvailable: true, isActive: true, lastEntryAt: at(1500) },
  { id: 's3', name: "Lag'mon", categoryId: 'c1', categoryName: 'Issiq taomlar', price: 28000, stockCount: null, costPrice: '18000', isAvailable: true, isActive: true, lastEntryAt: at(2900) },
  { id: 's4', name: 'Mastava', categoryId: 'c2', categoryName: "Sho'rvalar", price: 22000, stockCount: 24, costPrice: '12000', isAvailable: true, isActive: true, lastEntryAt: at(200) },
  { id: 's5', name: 'Patir non', categoryId: 'c3', categoryName: 'Non', price: 5000, stockCount: 50, costPrice: '2500', isAvailable: true, isActive: true, lastEntryAt: at(180) },
  { id: 's6', name: 'Mol kabob', categoryId: 'c1', categoryName: 'Issiq taomlar', price: 45000, stockCount: 0, costPrice: '30000', isAvailable: true, isActive: true, lastEntryAt: at(300) },
  { id: 's7', name: 'Achichuk', categoryId: 'c4', categoryName: 'Salatlar', price: 12000, stockCount: 18, costPrice: '5000', isAvailable: true, isActive: true, lastEntryAt: at(240) },
];

let entries: StockEntry[] = [
  { id: 'e1', menuItemId: 's1', kind: 'COUNT', qty: 38, countBefore: null, countAfter: 38, paidUzs: null, unitCost: null, note: null, occurredAt: at(1500), actorName: 'Dilshod', expenseId: null },
  { id: 'e2', menuItemId: 's1', kind: 'RESTOCK', qty: 40, countBefore: 0, countAfter: 40, paidUzs: '800000', unitCost: '20000', note: 'Bozor', occurredAt: at(2900), actorName: 'Dilshod', expenseId: 'x1' },
  { id: 'e3', menuItemId: 's4', kind: 'COUNT', qty: 24, countBefore: 30, countAfter: 24, paidUzs: null, unitCost: null, note: null, occurredAt: at(200), actorName: 'Dilshod', expenseId: null },
];

let seq = 100;
const uid = () => `g${seq++}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Replaces `window.fetch` for the preview only. */
export function installMockServer() {
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace('http://localhost:4000', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    // A touch of latency so loading states are visible rather than skipped.
    await new Promise((resolve) => setTimeout(resolve, 120));

    if (method === 'GET' && path.startsWith('/api/orders?')) {
      return json(orders.map(({ lines: _lines, ...rest }) => rest));
    }
    if (method === 'GET' && /^\/api\/orders\/[^/]+$/.test(path)) {
      const id = path.split('/').pop();
      const found = orders.find((o) => o.id === id);
      return found ? json(found) : json({ error: { code: 'NOT_FOUND', message: 'Topilmadi' } }, 404);
    }
    if (method === 'POST' && /\/confirm$/.test(path)) {
      const id = path.split('/')[3];
      orders = orders.filter((o) => o.id !== id);
      return json({ ok: true });
    }
    if (method === 'POST' && /\/mark-walkout$/.test(path)) {
      const id = path.split('/')[3];
      orders = orders.filter((o) => o.id !== id);
      return json({ ok: true });
    }

    if (method === 'GET' && path === '/api/stock') {
      return json(stock);
    }
    if (method === 'GET' && /^\/api\/stock\/[^/]+\/entries$/.test(path)) {
      const id = path.split('/')[3];
      return json(entries.filter((e) => e.menuItemId === id));
    }
    if (method === 'POST' && /\/count$/.test(path)) {
      const id = path.split('/')[3] as string;
      const countedQty = Number(body.countedQty ?? 0);
      const before = stock.find((s) => s.id === id)?.stockCount ?? null;
      stock = stock.map((s) => (s.id === id ? { ...s, stockCount: countedQty, lastEntryAt: new Date().toISOString() } : s));
      entries = [
        { id: uid(), menuItemId: id, kind: 'COUNT', qty: countedQty, countBefore: before, countAfter: countedQty, paidUzs: null, unitCost: null, note: null, occurredAt: new Date().toISOString(), actorName: 'Dilshod', expenseId: null },
        ...entries,
      ];
      return json({ ok: true });
    }
    if (method === 'POST' && /\/restock$/.test(path)) {
      const id = path.split('/')[3] as string;
      const qty = Number(body.qty ?? 0);
      const paidUzs = body.paidUzs == null ? null : Number(body.paidUzs);
      const setCost = body.setCostFromPaid === true;
      const before = stock.find((s) => s.id === id)?.stockCount ?? null;
      const after = (before ?? 0) + qty;
      stock = stock.map((s) =>
        s.id === id
          ? {
              ...s,
              stockCount: after,
              costPrice: setCost && paidUzs && qty > 0 ? String(Math.round(paidUzs / qty)) : s.costPrice,
              lastEntryAt: new Date().toISOString(),
            }
          : s,
      );
      entries = [
        { id: uid(), menuItemId: id, kind: 'RESTOCK', qty, countBefore: before, countAfter: after, paidUzs: paidUzs === null ? null : String(paidUzs), unitCost: paidUzs && qty ? String(Math.round(paidUzs / qty)) : null, note: null, occurredAt: new Date().toISOString(), actorName: 'Dilshod', expenseId: 'x' },
        ...entries,
      ];
      return json({ ok: true });
    }

    // Anything this preview doesn't model falls through to the real network,
    // which in a browser simply fails — loudly, rather than silently.
    return original(input as RequestInfo, init);
  };
}
