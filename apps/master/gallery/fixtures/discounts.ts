import type { Discount } from '@/api/discounts';
import { errorJson, json, splitPath, uid, type RouteHandler } from './util';

export let discounts: Discount[] = [
  { id: 'disc-10pct', name: "10% chegirma", type: 'PERCENT', value: 10, isActive: true },
  { id: 'disc-5k', name: "5 000 so'm chegirma", type: 'FIXED', value: 5000, isActive: true },
  { id: 'disc-15pct-vip', name: "15% chegirma (doimiy mijoz)", type: 'PERCENT', value: 15, isActive: true },
  { id: 'disc-20k', name: "20 000 so'm chegirma", type: 'FIXED', value: 20000, isActive: true },
  { id: 'disc-birthday', name: "Tug'ilgan kun chegirmasi", type: 'PERCENT', value: 20, isActive: true },
  // Awkward cases: retired discounts, only visible with "Hammasi" selected.
  { id: 'disc-staff', name: "Xodimlar uchun chegirma", type: 'PERCENT', value: 50, isActive: false },
  { id: 'disc-newyear', name: "Yangi yil aksiyasi", type: 'FIXED', value: 30000, isActive: false },
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
      type: body.type === 'FIXED' ? 'FIXED' : 'PERCENT',
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
      if (body.type === 'PERCENT' || body.type === 'FIXED') next.type = body.type;
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
