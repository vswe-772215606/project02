import type { User } from '@/api/auth';
import type { ConfirmBody, Order, OrderLine } from '@/api/orders';
import { items as menuItems } from './menu';
import { daysAgo, errorJson, hoursAgo, json, minutesAgo, splitPath, uid, type RouteHandler } from './util';

function waiterRef(id: string, fullName: string): User {
  return { id, username: null, fullName, role: 'WAITER', isActive: true };
}

const BOTIR = waiterRef('u-waiter-botir', 'Botir Nazarov');
const AZIZA = waiterRef('u-waiter-aziza', 'Aziza Karimova');
const SARDOR = waiterRef('u-waiter-sardor', 'Sardor Tishabayev');

type LineSpec = { itemId: string; qty: number; notes?: string; canceled?: boolean };

type OrderSpec = {
  id: string;
  tableId: string | null;
  tableName: string | null;
  waiter: User;
  status: Order['status'];
  when: string;
  closedAt?: string | null;
  canceledAt?: string | null;
  cancelReason?: string | null;
  debt?: Order['debt'];
  /** Manual so'm discount applied at confirm time (bill-level, not per-line). */
  discount?: number;
  lines: LineSpec[];
};

function itemOrThrow(id: string) {
  const item = menuItems.find((i) => i.id === id);
  if (!item) throw new Error(`fixtures/orders: unknown menu item "${id}"`);
  return item;
}

function buildOrder(spec: OrderSpec): Order {
  const lines: OrderLine[] = spec.lines.map((l, idx) => {
    const item = itemOrThrow(l.itemId);
    return {
      id: `${spec.id}-l${idx + 1}`,
      orderId: spec.id,
      menuItemId: item.id,
      menuItemKind: item.kind,
      comboId: null,
      comboGroupId: null,
      comboNameSnapshot: null,
      name: item.name,
      nameSnapshot: item.name,
      price: item.price,
      quantity: l.qty,
      notes: l.notes ?? null,
      status: 'ACTIVE',
      isCanceled: l.canceled ?? false,
      createdAt: spec.when,
    };
  });
  const activeLines = lines.filter((l) => !l.isCanceled);
  const food = activeLines.filter((l) => l.menuItemKind !== 'SERVICE').reduce((s, l) => s + l.price * l.quantity, 0);
  const service = activeLines.filter((l) => l.menuItemKind === 'SERVICE').reduce((s, l) => s + l.price * l.quantity, 0);
  const itemCount = activeLines.reduce((s, l) => s + l.quantity, 0);
  const discount = spec.discount ?? 0;

  return {
    id: spec.id,
    orderNumber: spec.id.slice(-6).toUpperCase(),
    orderType: spec.tableName ? 'DINE_IN' : 'TAKEAWAY',
    tableId: spec.tableId,
    tableName: spec.tableName,
    waiterId: spec.waiter.id,
    waiter: spec.waiter,
    status: spec.status,
    itemCount,
    totalAmount: food - discount + service,
    subtotalSnapshot: food,
    discountAmountSnapshot: discount,
    serviceChargeSnapshot: service,
    totalSnapshot: food - discount + service,
    discountId: null,
    serviceChargeWaived: false,
    createdAt: spec.when,
    updatedAt: spec.closedAt ?? spec.canceledAt ?? spec.when,
    closedAt: spec.closedAt ?? null,
    canceledAt: spec.canceledAt ?? null,
    cancelReason: spec.cancelReason ?? null,
    debt: spec.debt ?? null,
    lines,
  };
}

const SPECS: OrderSpec[] = [
  // ── SENT — the approval queue ────────────────────────────────────────
  {
    id: 'ord-xona3', tableId: 't-xona3', tableName: 'Xona 3', waiter: BOTIR, status: 'SENT', when: minutesAgo(18),
    lines: [
      { itemId: 'mi-osh', qty: 2 },
      { itemId: 'mi-somsa', qty: 4 },
      { itemId: 'mi-kokchoy', qty: 6 },
      { itemId: 'mi-xizmat', qty: 4 },
    ],
  },
  {
    id: 'ord-stol2', tableId: 't-stol2', tableName: 'Stol 2', waiter: AZIZA, status: 'SENT', when: minutesAgo(9),
    lines: [
      { itemId: 'mi-qovurmalagmon', qty: 3 },
      { itemId: 'mi-patirnon', qty: 3 },
      { itemId: 'mi-qorachoy', qty: 3 },
      { itemId: 'mi-xizmat', qty: 3 },
    ],
  },
  {
    id: 'ord-stol5', tableId: 't-stol5', tableName: 'Stol 5', waiter: SARDOR, status: 'SENT', when: minutesAgo(5),
    lines: [
      { itemId: 'mi-qozonkabobkatta', qty: 1 },
      { itemId: 'mi-mastava', qty: 6 },
      { itemId: 'mi-achichuk', qty: 6 },
      { itemId: 'mi-guruchlisalat', qty: 4 },
      { itemId: 'mi-patirnon', qty: 8 },
      { itemId: 'mi-qorachoy', qty: 4, notes: "Shakarsiz, ko'proq qaynoq" },
      // A line the waiter added by mistake and pulled back before send.
      { itemId: 'mi-cola', qty: 2, canceled: true },
      { itemId: 'mi-xizmat', qty: 8 },
    ],
  },
  {
    id: 'ord-takeaway-1', tableId: null, tableName: null, waiter: BOTIR, status: 'SENT', when: minutesAgo(27),
    lines: [
      { itemId: 'mi-chuchvara', qty: 2 },
      { itemId: 'mi-qorachoy', qty: 2 },
    ],
  },
  {
    id: 'ord-takeaway-2', tableId: null, tableName: null, waiter: AZIZA, status: 'SENT', when: minutesAgo(41),
    lines: [
      { itemId: 'mi-somsa', qty: 6 },
      { itemId: 'mi-goshtsomsa', qty: 4 },
    ],
  },
  {
    id: 'ord-takeaway-3', tableId: null, tableName: null, waiter: SARDOR, status: 'SENT', when: minutesAgo(3),
    lines: [
      { itemId: 'mi-tovuqkabob', qty: 2 },
      { itemId: 'mi-suv', qty: 2 },
    ],
  },

  // ── CLOSED — today's settled bills ───────────────────────────────────
  {
    id: 'ord-closed-01', tableId: 't-xona1', tableName: 'Xona 1', waiter: BOTIR, status: 'CLOSED', when: hoursAgo(11), closedAt: hoursAgo(11),
    lines: [
      { itemId: 'mi-osh', qty: 3 }, { itemId: 'mi-achichuk', qty: 3 }, { itemId: 'mi-patirnon', qty: 3 },
      { itemId: 'mi-kokchoy', qty: 4 }, { itemId: 'mi-xizmat', qty: 3 },
    ],
  },
  {
    id: 'ord-closed-02', tableId: 't-stol1', tableName: 'Stol 1', waiter: AZIZA, status: 'CLOSED', when: hoursAgo(10), closedAt: hoursAgo(10),
    discount: 8000,
    lines: [{ itemId: 'mi-mastava', qty: 2 }, { itemId: 'mi-somsa', qty: 2 }, { itemId: 'mi-qorachoy', qty: 2 }],
  },
  {
    id: 'ord-closed-03', tableId: null, tableName: null, waiter: SARDOR, status: 'CLOSED', when: hoursAgo(9), closedAt: hoursAgo(9),
    lines: [{ itemId: 'mi-goshtsomsa', qty: 8 }, { itemId: 'mi-cola', qty: 4 }],
  },
  {
    id: 'ord-closed-04', tableId: 't-xona2', tableName: 'Xona 2', waiter: BOTIR, status: 'CLOSED', when: hoursAgo(8), closedAt: hoursAgo(8),
    lines: [
      { itemId: 'mi-molkabob', qty: 4 }, { itemId: 'mi-shorva', qty: 4 }, { itemId: 'mi-koksalat', qty: 4 },
      { itemId: 'mi-oddiynon', qty: 6 }, { itemId: 'mi-xizmat', qty: 4 },
    ],
    // A nasiya sale — settled at confirm as a debt still on the books.
    debt: { id: 'debt-rustam', debtorName: 'Rustam Qodirov', originalAmount: 214000, remainingAmount: 214000, status: 'OPEN' },
  },
  {
    id: 'ord-closed-05', tableId: 't-stol3', tableName: 'Stol 3', waiter: AZIZA, status: 'CLOSED', when: hoursAgo(7), closedAt: hoursAgo(7),
    lines: [{ itemId: 'mi-norin', qty: 2 }, { itemId: 'mi-koksalat', qty: 2 }, { itemId: 'mi-limonad', qty: 2 }],
  },
  {
    id: 'ord-closed-06', tableId: 't-stol4', tableName: 'Stol 4', waiter: SARDOR, status: 'CLOSED', when: hoursAgo(7), closedAt: hoursAgo(7),
    lines: [
      { itemId: 'mi-tovuqkabob', qty: 2 }, { itemId: 'mi-moshxorda', qty: 2 }, { itemId: 'mi-patirnon', qty: 2 },
      { itemId: 'mi-kompot', qty: 2 }, { itemId: 'mi-xizmat', qty: 2 },
    ],
  },
  {
    id: 'ord-closed-07', tableId: null, tableName: null, waiter: BOTIR, status: 'CLOSED', when: hoursAgo(6), closedAt: hoursAgo(6),
    lines: [{ itemId: 'mi-kartoshkasomsa', qty: 5 }, { itemId: 'mi-suv', qty: 3 }],
  },
  {
    id: 'ord-closed-08', tableId: 't-xona3', tableName: 'Xona 3', waiter: AZIZA, status: 'CLOSED', when: hoursAgo(6), closedAt: hoursAgo(6),
    lines: [
      { itemId: 'mi-dimlama', qty: 3 }, { itemId: 'mi-guruchlisalat', qty: 3 }, { itemId: 'mi-oddiynon', qty: 4 },
      { itemId: 'mi-qorachoy', qty: 5 }, { itemId: 'mi-xizmat', qty: 3 },
    ],
  },
  {
    id: 'ord-closed-09', tableId: 't-stol6', tableName: 'Stol 6', waiter: SARDOR, status: 'CLOSED', when: hoursAgo(5), closedAt: hoursAgo(5),
    lines: [{ itemId: 'mi-lagmonshorva', qty: 2 }, { itemId: 'mi-achichuk', qty: 2 }, { itemId: 'mi-kokchoy', qty: 2 }],
  },
  {
    id: 'ord-closed-10', tableId: 't-stol1', tableName: 'Stol 1', waiter: BOTIR, status: 'CLOSED', when: hoursAgo(4), closedAt: hoursAgo(4),
    lines: [
      { itemId: 'mi-osh', qty: 4 }, { itemId: 'mi-vinegret', qty: 2 }, { itemId: 'mi-patirnon', qty: 4 },
      { itemId: 'mi-cola', qty: 4 }, { itemId: 'mi-xizmat', qty: 4 },
    ],
    debt: { id: 'debt-zarina', debtorName: 'Zarina Yusupova', originalAmount: 176000, remainingAmount: 0, status: 'PAID' },
  },
  {
    id: 'ord-closed-11', tableId: null, tableName: null, waiter: AZIZA, status: 'CLOSED', when: hoursAgo(4), closedAt: hoursAgo(4),
    lines: [{ itemId: 'mi-somsa', qty: 10 }],
  },
  {
    id: 'ord-closed-12', tableId: 't-xona4', tableName: 'Xona 4', waiter: SARDOR, status: 'CLOSED', when: hoursAgo(3), closedAt: hoursAgo(3),
    discount: 15000,
    lines: [
      { itemId: 'mi-manti', qty: 3 }, { itemId: 'mi-shorva', qty: 3 }, { itemId: 'mi-koksalat', qty: 3 },
      { itemId: 'mi-kompot', qty: 3 }, { itemId: 'mi-xizmat', qty: 3 },
    ],
  },
  {
    id: 'ord-closed-13', tableId: 't-stol3', tableName: 'Stol 3', waiter: BOTIR, status: 'CLOSED', when: hoursAgo(2), closedAt: hoursAgo(2),
    lines: [{ itemId: 'mi-chuchvara', qty: 4 }, { itemId: 'mi-achichuk', qty: 2 }, { itemId: 'mi-suv', qty: 2 }],
  },
  {
    id: 'ord-closed-14', tableId: 't-stol4', tableName: 'Stol 4', waiter: AZIZA, status: 'CLOSED', when: hoursAgo(1), closedAt: hoursAgo(1),
    lines: [
      { itemId: 'mi-tovuqkabob', qty: 2 }, { itemId: 'mi-mastava', qty: 2 }, { itemId: 'mi-patirnon', qty: 3 },
      { itemId: 'mi-limonad', qty: 2 }, { itemId: 'mi-xizmat', qty: 2 },
    ],
  },

  // ── WALKOUT — left without paying ────────────────────────────────────
  {
    id: 'ord-walkout-01', tableId: 't-stol2', tableName: 'Stol 2', waiter: BOTIR, status: 'WALKOUT', when: hoursAgo(8), closedAt: hoursAgo(8),
    cancelReason: "Mijoz kutmay chiqib ketdi, to'lovsiz",
    lines: [{ itemId: 'mi-osh', qty: 2 }, { itemId: 'mi-kokchoy', qty: 2 }],
  },
  {
    id: 'ord-walkout-02', tableId: null, tableName: null, waiter: SARDOR, status: 'WALKOUT', when: hoursAgo(5), closedAt: hoursAgo(5),
    cancelReason: 'Olib ketish buyurtmasi olinmadi',
    lines: [{ itemId: 'mi-goshtsomsa', qty: 3 }],
  },
  {
    id: 'ord-walkout-03', tableId: 't-xona2', tableName: 'Xona 2', waiter: AZIZA, status: 'WALKOUT', when: hoursAgo(2), closedAt: hoursAgo(2),
    cancelReason: "Pul yetishmadi, hujjat qoldirib ketishga rozi bo'lmadi",
    lines: [{ itemId: 'mi-tovuqkabob', qty: 2 }, { itemId: 'mi-shorva', qty: 2 }, { itemId: 'mi-xizmat', qty: 2 }],
  },

  // ── CANCELED — never sent to the kitchen, or pulled after ─────────────
  {
    id: 'ord-canceled-01', tableId: 't-stol6', tableName: 'Stol 6', waiter: SARDOR, status: 'CANCELED', when: hoursAgo(6),
    canceledAt: hoursAgo(6), cancelReason: 'Mijoz fikridan qaytdi',
    lines: [{ itemId: 'mi-manti', qty: 2 }],
  },
  {
    id: 'ord-canceled-02', tableId: null, tableName: null, waiter: BOTIR, status: 'CANCELED', when: hoursAgo(3),
    canceledAt: hoursAgo(3), cancelReason: 'Adashib ochilgan buyurtma',
    lines: [{ itemId: 'mi-somsa', qty: 4 }],
  },
  {
    id: 'ord-canceled-03', tableId: 't-xona1', tableName: 'Xona 1', waiter: AZIZA, status: 'CANCELED', when: daysAgo(1, 20, 10),
    canceledAt: daysAgo(1, 20, 15), cancelReason: "Noto'g'ri stolga kiritilgan, qaytadan ochildi",
    lines: [{ itemId: 'mi-osh', qty: 1 }, { itemId: 'mi-qorachoy', qty: 1 }],
  },
];

export let orders: Order[] = SPECS.map(buildOrder);

export const ordersRoutes: RouteHandler = (path, method, body) => {
  const { base, query } = splitPath(path);

  if (method === 'GET' && base === '/api/orders') {
    const status = query.get('status');
    const filtered = status ? orders.filter((o) => o.status === status) : orders;
    // The list payload never carries lines — pages that need them re-fetch
    // the single order, same as the real API.
    return json(filtered.map(({ lines: _lines, ...rest }) => rest));
  }

  const getMatch = /^\/api\/orders\/([^/]+)$/.exec(base);
  if (method === 'GET' && getMatch) {
    const found = orders.find((o) => o.id === getMatch[1]);
    return found ? json(found) : errorJson('NOT_FOUND', 'Buyurtma topilmadi', 404);
  }

  const confirmMatch = /^\/api\/orders\/([^/]+)\/confirm$/.exec(base);
  if (method === 'POST' && confirmMatch) {
    const id = confirmMatch[1] as string;
    const order = orders.find((o) => o.id === id);
    if (!order) return errorJson('NOT_FOUND', 'Buyurtma topilmadi', 404);
    const confirmBody = body as unknown as ConfirmBody;
    const closed: Order = {
      ...order,
      status: 'CLOSED',
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      discountAmountSnapshot: confirmBody.discountAmount ?? 0,
      serviceChargeSnapshot: confirmBody.waiveServiceCharge ? 0 : order.serviceChargeSnapshot,
    };
    orders = orders.map((o) => (o.id === id ? closed : o));
    return json(closed);
  }

  const walkoutMatch = /^\/api\/orders\/([^/]+)\/mark-walkout$/.exec(base);
  if (method === 'POST' && walkoutMatch) {
    const id = walkoutMatch[1] as string;
    const order = orders.find((o) => o.id === id);
    if (!order) return errorJson('NOT_FOUND', 'Buyurtma topilmadi', 404);
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const walked: Order = { ...order, status: 'WALKOUT', closedAt: new Date().toISOString(), cancelReason: reason };
    orders = orders.map((o) => (o.id === id ? walked : o));
    return json(walked);
  }

  const cancelMatch = /^\/api\/orders\/([^/]+)\/cancel$/.exec(base);
  if (method === 'POST' && cancelMatch) {
    const id = cancelMatch[1] as string;
    const order = orders.find((o) => o.id === id);
    if (!order) return errorJson('NOT_FOUND', 'Buyurtma topilmadi', 404);
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const canceled: Order = { ...order, status: 'CANCELED', canceledAt: new Date().toISOString(), cancelReason: reason };
    orders = orders.map((o) => (o.id === id ? canceled : o));
    return json(canceled);
  }

  const reprintMatch = /^\/api\/orders\/([^/]+)\/reprint-bill$/.exec(base);
  if (method === 'POST' && reprintMatch) {
    return json({ id: uid('print') });
  }

  const quantityMatch = /^\/api\/orders\/([^/]+)\/lines\/([^/]+)\/quantity$/.exec(base);
  if (method === 'PATCH' && quantityMatch) {
    const [, orderId, lineId] = quantityMatch;
    const order = orders.find((o) => o.id === orderId);
    const line = order?.lines?.find((l) => l.id === lineId);
    if (!order || !line) return errorJson('NOT_FOUND', 'Pozitsiya topilmadi', 404);
    const quantity = Number(body.quantity ?? line.quantity);
    const updatedLine: OrderLine = { ...line, quantity };
    orders = orders.map((o) =>
      o.id === orderId ? { ...o, lines: (o.lines ?? []).map((l) => (l.id === lineId ? updatedLine : l)) } : o,
    );
    return json(updatedLine);
  }

  const cancelLineMatch = /^\/api\/orders\/([^/]+)\/lines\/([^/]+)\/cancel$/.exec(base);
  if (method === 'POST' && cancelLineMatch) {
    const [, orderId, lineId] = cancelLineMatch;
    const order = orders.find((o) => o.id === orderId);
    const line = order?.lines?.find((l) => l.id === lineId);
    if (!order || !line) return errorJson('NOT_FOUND', 'Pozitsiya topilmadi', 404);
    const updatedLine: OrderLine = { ...line, isCanceled: true };
    orders = orders.map((o) =>
      o.id === orderId ? { ...o, lines: (o.lines ?? []).map((l) => (l.id === lineId ? updatedLine : l)) } : o,
    );
    return json(updatedLine);
  }

  const addItemMatch = /^\/api\/orders\/([^/]+)\/items$/.exec(base);
  if (method === 'POST' && addItemMatch) {
    const orderId = addItemMatch[1] as string;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return errorJson('NOT_FOUND', 'Buyurtma topilmadi', 404);
    const menuItemId = String(body.menuItemId ?? '');
    const item = itemOrThrow(menuItemId);
    const quantity = Number(body.quantity ?? 1);
    const newLine: OrderLine = {
      id: uid(`${orderId}-l`),
      orderId,
      menuItemId: item.id,
      menuItemKind: item.kind,
      comboId: null,
      comboGroupId: null,
      comboNameSnapshot: null,
      name: item.name,
      nameSnapshot: item.name,
      price: item.price,
      quantity,
      notes: typeof body.notes === 'string' ? body.notes : null,
      status: 'ACTIVE',
      isCanceled: false,
      createdAt: new Date().toISOString(),
    };
    orders = orders.map((o) => (o.id === orderId ? { ...o, lines: [...(o.lines ?? []), newLine] } : o));
    return json(newLine, 201);
  }

  const addComboMatch = /^\/api\/orders\/([^/]+)\/combos$/.exec(base);
  if (method === 'POST' && addComboMatch) {
    // The preview's ItemPicker only needs the round-trip to succeed and the
    // order to be re-fetched; it doesn't inspect the created lines' shape.
    return json([], 201);
  }

  return null;
};
