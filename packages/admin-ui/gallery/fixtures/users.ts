import type { User } from '@/api/auth';
import type { WaiterTodayStat } from '@/api/users';
import { dayKey, errorJson, json, splitPath, uid, type RouteHandler } from './util';

// The preview's own session (seeded in main.tsx) is this exact row — picking
// yourself in Foydalanuvchilar correctly disables the deactivate toggle.
export const OWNER_ID = 'u-owner';

export let users: User[] = [
  { id: OWNER_ID, username: 'dilshod', fullName: 'Dilshod Yusupov', role: 'OWNER', isActive: true },
  { id: 'u-admin', username: 'kamola', fullName: 'Kamola Rashidova', role: 'ADMIN', isActive: true },
  { id: 'u-waiter-botir', username: null, fullName: 'Botir Nazarov', role: 'WAITER', isActive: true },
  { id: 'u-waiter-aziza', username: null, fullName: 'Aziza Karimova', role: 'WAITER', isActive: true },
  { id: 'u-waiter-sardor', username: null, fullName: 'Sardor Tishabayev', role: 'WAITER', isActive: true },
  // Awkward case: a deactivated waiter — still listed with "Nofaollarni
  // ko'rsatish" on, filtered out otherwise.
  { id: 'u-waiter-nodira', username: null, fullName: 'Nodira Ergasheva', role: 'WAITER', isActive: false },
];

export const todayStats: { date: string; items: WaiterTodayStat[] } = {
  date: dayKey(),
  items: [
    { waiterId: 'u-waiter-botir', waiterName: 'Botir Nazarov', orders: 9, revenue: '1940000', billedTotal: '2122000', serviceEarned: '182000' },
    { waiterId: 'u-waiter-aziza', waiterName: 'Aziza Karimova', orders: 7, revenue: '1650000', billedTotal: '1806000', serviceEarned: '156000' },
    { waiterId: 'u-waiter-sardor', waiterName: 'Sardor Tishabayev', orders: 6, revenue: '1465000', billedTotal: '1607000', serviceEarned: '142000' },
  ],
};

function sanitizePatch(body: Record<string, unknown>): Partial<User> {
  const patch: Partial<User> = {};
  if (typeof body.fullName === 'string') patch.fullName = body.fullName;
  if (typeof body.username === 'string' || body.username === null) patch.username = body.username as string | null;
  if (body.role === 'OWNER' || body.role === 'ADMIN' || body.role === 'WAITER') patch.role = body.role;
  if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
  // password / pin are accepted by the real endpoint but carry no visible
  // state here — the preview never re-authenticates.
  return patch;
}

export const usersRoutes: RouteHandler = (path, method, body) => {
  const { base, query } = splitPath(path);

  if (method === 'GET' && base === '/api/users') {
    const includeInactive = query.get('includeInactive') === 'true';
    return json(includeInactive ? users : users.filter((u) => u.isActive));
  }

  if (method === 'GET' && base === '/api/users/today-stats') {
    return json(todayStats);
  }

  if (method === 'POST' && base === '/api/users') {
    const created: User = {
      id: uid('u'),
      username: typeof body.username === 'string' && body.username ? body.username : null,
      fullName: typeof body.fullName === 'string' && body.fullName ? body.fullName : 'Yangi xodim',
      role: body.role === 'OWNER' || body.role === 'ADMIN' || body.role === 'WAITER' ? body.role : 'WAITER',
      isActive: true,
    };
    users = [...users, created];
    return json(created, 201);
  }

  const patchMatch = /^\/api\/users\/([^/]+)$/.exec(base);
  if (method === 'PATCH' && patchMatch) {
    const id = patchMatch[1] as string;
    if (!users.some((u) => u.id === id)) return errorJson('NOT_FOUND', 'Foydalanuvchi topilmadi', 404);
    users = users.map((u) => (u.id === id ? { ...u, ...sanitizePatch(body) } : u));
    return json(users.find((u) => u.id === id));
  }

  const deactivateMatch = /^\/api\/users\/([^/]+)\/deactivate$/.exec(base);
  if (method === 'POST' && deactivateMatch) {
    const id = deactivateMatch[1] as string;
    if (!users.some((u) => u.id === id)) return errorJson('NOT_FOUND', 'Foydalanuvchi topilmadi', 404);
    users = users.map((u) => (u.id === id ? { ...u, isActive: false } : u));
    return json(users.find((u) => u.id === id));
  }

  return null;
};
