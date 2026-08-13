import type { Table } from '@/api/tables';
import { errorJson, json, splitPath, uid, type RouteHandler } from './util';

// Occupied tables point at SENT orders defined in orders.ts — the two
// fixtures agree on these ids by convention rather than importing each
// other, since an Order only ever carries its table's name, not a live
// reference back to it.
export let tables: Table[] = [
  { id: 't-xona1', name: 'Xona 1', type: 'ROOM', displayOrder: 0, isActive: true, activeOrderId: null },
  { id: 't-xona2', name: 'Xona 2', type: 'ROOM', displayOrder: 1, isActive: true, activeOrderId: null },
  { id: 't-xona3', name: 'Xona 3', type: 'ROOM', displayOrder: 2, isActive: true, activeOrderId: 'ord-xona3' },
  { id: 't-xona4', name: 'Xona 4', type: 'ROOM', displayOrder: 3, isActive: true, activeOrderId: null },
  { id: 't-stol1', name: 'Stol 1', type: 'TABLE', displayOrder: 4, isActive: true, activeOrderId: null },
  { id: 't-stol2', name: 'Stol 2', type: 'TABLE', displayOrder: 5, isActive: true, activeOrderId: 'ord-stol2' },
  { id: 't-stol3', name: 'Stol 3', type: 'TABLE', displayOrder: 6, isActive: true, activeOrderId: null },
  { id: 't-stol4', name: 'Stol 4', type: 'TABLE', displayOrder: 7, isActive: true, activeOrderId: null },
  { id: 't-stol5', name: 'Stol 5', type: 'TABLE', displayOrder: 8, isActive: true, activeOrderId: 'ord-stol5' },
  { id: 't-stol6', name: 'Stol 6', type: 'TABLE', displayOrder: 9, isActive: true, activeOrderId: null },
  // Awkward case: retired table, kept only for history — hidden unless
  // "Nofaollarni ko'rsatish" is on.
  { id: 't-stol7', name: 'Stol 7', type: 'TABLE', displayOrder: 10, isActive: false, activeOrderId: null },
];

export const tablesRoutes: RouteHandler = (path, method, body) => {
  const { base, query } = splitPath(path);

  if (method === 'GET' && base === '/api/tables') {
    const includeInactive = query.get('includeInactive') === 'true';
    return json(includeInactive ? tables : tables.filter((t) => t.isActive));
  }

  if (method === 'POST' && base === '/api/tables') {
    const created: Table = {
      id: uid('t'),
      name: typeof body.name === 'string' && body.name ? body.name : 'Yangi stol',
      type: body.type === 'ROOM' ? 'ROOM' : 'TABLE',
      displayOrder: typeof body.displayOrder === 'number' ? body.displayOrder : tables.length,
      isActive: true,
      activeOrderId: null,
    };
    tables = [...tables, created];
    return json(created, 201);
  }

  const patchMatch = /^\/api\/tables\/([^/]+)$/.exec(base);
  if (method === 'PATCH' && patchMatch) {
    const id = patchMatch[1] as string;
    if (!tables.some((t) => t.id === id)) return errorJson('NOT_FOUND', 'Stol topilmadi', 404);
    tables = tables.map((t) => {
      if (t.id !== id) return t;
      const next = { ...t };
      if (typeof body.name === 'string') next.name = body.name;
      if (body.type === 'ROOM' || body.type === 'TABLE') next.type = body.type;
      if (typeof body.isActive === 'boolean') next.isActive = body.isActive;
      if (typeof body.displayOrder === 'number') next.displayOrder = body.displayOrder;
      return next;
    });
    return json(tables.find((t) => t.id === id));
  }

  return null;
};
