import type { Discount } from '@/api/discounts';
import { errorJson, json, splitPath, uid, type RouteHandler } from './util';

export let discounts: Discount[] = [
  { id: 'disc-10k', name: "10 000 so'm chegirma", value: 10000, isActive: true },
  { id: 'disc-5k', name: "5 000 so'm chegirma", value: 5000, isActive: true },
  { id: 'disc-vip', name: "Doimiy mijoz chegirmasi", value: 15000, isActive: true },
  { id: 'disc-20k', name: "20 000 so'm chegirma", value: 20000, isActive: true },
  { id: 'disc-birthday', name: "Tug'ilgan kun chegirmasi", value: 20000, isActive: true },
  // Awkward cases: retired discounts, only visible with "Hammasi" selected.
  { id: 'disc-staff', name: "Xodimlar uchun chegirma", value: 50000, isActive: false },
  { id: 'disc-newyear', name: "Yangi yil aksiyasi", value: 30000, isActive: false },
];

export const discountsRoutes: RouteHandler = (path, method, body) => {
  const { base, query } = splitPath(path);

  if (method === 'GET' && base === '/api/discounts') {
    const includeInactive = query.get('includeInactive') === 'true';
    return json(includeInactive ? discounts : discounts.filter((d) => d.isActive));
  }

  if (method === 'POST' && base === '/api/discounts') {
    const created: Discount = {
      id: uid('disc'),
      name: typeof body.name === 'string' && body.name ? body.name : 'Yangi chegirma',
      value: Number(body.value ?? 0),
      isActive: true,
    };
    discounts = [...discounts, created];
    return json(created, 201);
  }

  const patchMatch = /^\/api\/discounts\/([^/]+)$/.exec(base);
  if (method === 'PATCH' && patchMatch) {
    const id = patchMatch[1] as string;
    if (!discounts.some((d) => d.id === id)) return errorJson('NOT_FOUND', 'Chegirma topilmadi', 404);
    discounts = discounts.map((d) => {
      if (d.id !== id) return d;
      const next = { ...d };
      if (typeof body.name === 'string') next.name = body.name;
      if (typeof body.value === 'number') next.value = body.value;
      if (typeof body.isActive === 'boolean') next.isActive = body.isActive;
      return next;
    });
    return json(discounts.find((d) => d.id === id));
  }

  if (method === 'DELETE' && patchMatch) {
    const id = patchMatch[1] as string;
    if (!discounts.some((d) => d.id === id)) return errorJson('NOT_FOUND', 'Chegirma topilmadi', 404);
    discounts = discounts.map((d) => (d.id === id ? { ...d, isActive: false } : d));
    return json({ ok: true });
  }

  return null;
};
