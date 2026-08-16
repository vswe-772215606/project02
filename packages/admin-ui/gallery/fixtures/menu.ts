import type { Category, Combo, ComboComponent, CreateItemPayload, MenuItem } from '@/api/menu';
import { errorJson, json, splitPath, uid, type RouteHandler } from './util';

const CAT = {
  hot: 'cat-hot',
  soup: 'cat-soup',
  salad: 'cat-salad',
  bread: 'cat-bread',
  drink: 'cat-drink',
  dessert: 'cat-dessert',
  service: 'cat-service',
} as const;

export let categories: Category[] = [
  { id: CAT.hot, name: 'Issiq taomlar', displayOrder: 0, isActive: true },
  { id: CAT.soup, name: "Sho'rvalar", displayOrder: 1, isActive: true },
  { id: CAT.salad, name: 'Salatlar', displayOrder: 2, isActive: true },
  { id: CAT.bread, name: 'Non va somsa', displayOrder: 3, isActive: true },
  { id: CAT.drink, name: 'Ichimliklar', displayOrder: 4, isActive: true },
  // Awkward case: a category nobody has put a dish in yet.
  { id: CAT.dessert, name: 'Shirinliklar', displayOrder: 5, isActive: true },
  { id: CAT.service, name: 'Xizmat', displayOrder: 6, isActive: true },
];

export let items: MenuItem[] = [
  { id: 'mi-osh', categoryId: CAT.hot, name: 'Osh', price: 35000, description: "An'anaviy toshkent oshi", displayOrder: 0, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 42, costPrice: '20000' },
  // Awkward case: zero on hand — out of stock, not yet restocked.
  { id: 'mi-molkabob', categoryId: CAT.hot, name: 'Mol kabob', price: 45000, description: "Mol go'shtidan kabob", displayOrder: 1, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 0, costPrice: '28000' },
  { id: 'mi-tovuqkabob', categoryId: CAT.hot, name: 'Tovuq kabob', price: 36000, description: "Tovuq go'shtidan kabob", displayOrder: 2, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 27, costPrice: '18000' },
  { id: 'mi-manti', categoryId: CAT.hot, name: 'Manti', price: 32000, description: "Bug'da pishirilgan qiyma manti", displayOrder: 3, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 35, costPrice: '16000' },
  // Never counted since being added — the Ombor / Bugun "Sanoqsiz" case.
  { id: 'mi-norin', categoryId: CAT.hot, name: 'Norin', price: 38000, description: "Qo'lda tortilgan xamir va mol go'shti", displayOrder: 4, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: null, costPrice: '22000' },
  { id: 'mi-qovurmalagmon', categoryId: CAT.hot, name: "Qovurma lag'mon", price: 34000, description: 'Tovada qovurilgan lagʻmon', displayOrder: 5, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 19, costPrice: '17000' },
  { id: 'mi-dimlama', categoryId: CAT.hot, name: 'Dimlama', price: 40000, description: 'Sabzavotlar bilan dimlangan goʻsht', displayOrder: 6, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: null, costPrice: '24000' },
  // Awkward case: a very long dish name, to stress the item list / order ticket.
  { id: 'mi-qozonkabobkatta', categoryId: CAT.hot, name: "Qozon kabob — mol go'shti va mavsumiy sabzavotlar bilan (katta oilaviy portsiya)", price: 52000, description: "Katta guruh yoki oila uchun mo'ljallangan yopiq qozon kabob portsiyasi", displayOrder: 7, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 14, costPrice: '30000' },
  { id: 'mi-chuchvara', categoryId: CAT.hot, name: 'Chuchvara', price: 28000, description: "Mayda qiymali chuchvara, qatiq bilan", displayOrder: 8, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 12, costPrice: '14000' },
  // Awkward case: discontinued dish — inactive, so it drops out of Ombor
  // entirely even though it's still `counted`.
  { id: 'mi-tuxumbarak', categoryId: CAT.hot, name: 'Tuxum barak', price: 26000, description: "Tuxum va ko'katli barak", displayOrder: 9, kind: 'FOOD', isAvailable: true, isActive: false, counted: true, stockCount: 9, costPrice: '12000' },

  { id: 'mi-mastava', categoryId: CAT.soup, name: 'Mastava', price: 26000, description: "Mol go'shtli issiq sho'rva", displayOrder: 0, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 30, costPrice: '12000' },
  { id: 'mi-shorva', categoryId: CAT.soup, name: "Sho'rva", price: 24000, description: 'Sabzavotli qaynatma shorva', displayOrder: 1, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 22, costPrice: '11000' },
  { id: 'mi-moshxorda', categoryId: CAT.soup, name: "Moshxo'rda", price: 25000, description: "Mosh va guruch sho'rvasi", displayOrder: 2, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 16, costPrice: '12000' },
  { id: 'mi-lagmonshorva', categoryId: CAT.soup, name: "Lag'mon sho'rva", price: 30000, description: "Uy lag'monidan sho'rva", displayOrder: 3, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: null, costPrice: '14000' },

  { id: 'mi-achichuk', categoryId: CAT.salad, name: 'Achichuk salat', price: 18000, description: 'Pomidor va piyozli salat', displayOrder: 0, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 40, costPrice: '6000' },
  { id: 'mi-koksalat', categoryId: CAT.salad, name: "Ko'k salat", price: 16000, description: 'Mavsumiy ko’katlar', displayOrder: 1, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 33, costPrice: '5000' },
  // Awkward case: 86'd by hand (isAvailable false) even though counted stock remains.
  { id: 'mi-vinegret', categoryId: CAT.salad, name: 'Vinegret', price: 17000, description: "Lavlagi, kartoshka, no'xat salat", displayOrder: 2, kind: 'FOOD', isAvailable: false, isActive: true, counted: true, stockCount: 8, costPrice: '6000' },
  { id: 'mi-guruchlisalat', categoryId: CAT.salad, name: 'Guruchli salat', price: 20000, description: 'Mayin guruch va sabzavotlar', displayOrder: 3, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 25, costPrice: '7000' },

  { id: 'mi-somsa', categoryId: CAT.bread, name: 'Somsa', price: 12000, description: 'Tandir somsasi', displayOrder: 0, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 55, costPrice: '4000' },
  { id: 'mi-goshtsomsa', categoryId: CAT.bread, name: "Go'sht somsa", price: 14000, description: "Mol go'shtli tandir somsasi", displayOrder: 1, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 38, costPrice: '5000' },
  { id: 'mi-kartoshkasomsa', categoryId: CAT.bread, name: 'Kartoshka somsa', price: 10000, description: 'Kartoshkali tandir somsasi', displayOrder: 2, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 20, costPrice: '3000' },
  { id: 'mi-patirnon', categoryId: CAT.bread, name: 'Patir non', price: 6000, description: 'Yangi tandir non', displayOrder: 3, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 62, costPrice: '2500' },
  // Untracked (mode UNCOUNTED) — always available, never appears in Ombor.
  { id: 'mi-oddiynon', categoryId: CAT.bread, name: 'Oddiy non', price: 5000, description: 'Kundalik non', displayOrder: 4, kind: 'FOOD', isAvailable: true, isActive: true, counted: false, stockCount: null, costPrice: '2000' },

  { id: 'mi-qorachoy', categoryId: CAT.drink, name: 'Qora choy', price: 8000, description: 'Bir choynak qora choy', displayOrder: 0, kind: 'FOOD', isAvailable: true, isActive: true, counted: false, stockCount: null, costPrice: '500' },
  { id: 'mi-kokchoy', categoryId: CAT.drink, name: "Ko'k choy", price: 8000, description: "Bir choynak ko'k choy", displayOrder: 1, kind: 'FOOD', isAvailable: true, isActive: true, counted: false, stockCount: null, costPrice: '500' },
  { id: 'mi-kompot', categoryId: CAT.drink, name: 'Kompot', price: 10000, description: 'Uy kompoti', displayOrder: 2, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 45, costPrice: '3000' },
  { id: 'mi-suv', categoryId: CAT.drink, name: 'Suv (0.5l)', price: 5000, description: 'Gazsiz ichimlik suvi', displayOrder: 3, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 70, costPrice: '2000' },
  { id: 'mi-cola', categoryId: CAT.drink, name: 'Coca-Cola (0.5l)', price: 12000, description: 'Muzlatilgan', displayOrder: 4, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 24, costPrice: '6000' },
  { id: 'mi-limonad', categoryId: CAT.drink, name: 'Limonad (uy)', price: 9000, description: 'Uy sharoitida tayyorlangan limonad', displayOrder: 5, kind: 'FOOD', isAvailable: true, isActive: true, counted: true, stockCount: 31, costPrice: '3000' },

  { id: 'mi-xizmat', categoryId: CAT.service, name: 'Xizmat haqi', price: 10000, description: 'Har bir mehmon uchun xizmat haqi', displayOrder: 0, kind: 'SERVICE', isAvailable: true, isActive: true, counted: false, stockCount: null, costPrice: null },
];

function resolveComponents(comboId: string, input: Array<{ menuItemId: string; quantity: number }>): ComboComponent[] {
  return input.map((c) => ({
    id: uid('cc'),
    comboId,
    menuItemId: c.menuItemId,
    quantity: c.quantity,
    menuItem: items.find((i) => i.id === c.menuItemId),
  }));
}

export let combos: Combo[] = [
  {
    id: 'combo-lunch',
    name: 'Tushlik to\'plami',
    price: 55000,
    isActive: true,
    components: resolveComponents('combo-lunch', [
      { menuItemId: 'mi-mastava', quantity: 1 },
      { menuItemId: 'mi-tovuqkabob', quantity: 1 },
      { menuItemId: 'mi-qorachoy', quantity: 1 },
    ]),
  },
  {
    id: 'combo-family',
    name: 'Oilaviy dasturxon',
    price: 120000,
    isActive: true,
    components: resolveComponents('combo-family', [
      { menuItemId: 'mi-osh', quantity: 2 },
      { menuItemId: 'mi-achichuk', quantity: 2 },
      { menuItemId: 'mi-oddiynon', quantity: 2 },
      { menuItemId: 'mi-qorachoy', quantity: 2 },
    ]),
  },
  // Awkward case: a seasonal combo nobody sells anymore.
  {
    id: 'combo-summer',
    name: "Yozgi to'plam",
    price: null,
    isActive: false,
    components: resolveComponents('combo-summer', [
      { menuItemId: 'mi-suv', quantity: 1 },
      { menuItemId: 'mi-kompot', quantity: 1 },
      { menuItemId: 'mi-koksalat', quantity: 1 },
    ]),
  },
];

export function getItemById(id: string): MenuItem | undefined {
  return items.find((i) => i.id === id);
}

export function categoryName(categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.name ?? categoryId;
}

/** Same rule `menuService` applies on the wire: available AND (untracked or in stock). */
function effectivelyAvailable(item: MenuItem): boolean {
  if (!item.isAvailable) return false;
  if (!item.counted) return true;
  return (item.stockCount ?? 0) > 0;
}

function buildMenuTree(includeInactive: boolean): { categories: Category[] } {
  const cats = includeInactive ? categories : categories.filter((c) => c.isActive);
  return {
    categories: cats.map((c) => ({
      ...c,
      items: items
        .filter((i) => i.categoryId === c.id && (includeInactive || i.isActive))
        .map((i) => ({ ...i, effectivelyAvailable: effectivelyAvailable(i) })),
    })),
  };
}

/** Used by stock.ts to fold a count/restock mutation back into the shared catalog. */
export function patchItemStock(id: string, patch: Partial<Pick<MenuItem, 'stockCount' | 'costPrice'>>): MenuItem | null {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  return items.find((i) => i.id === id) ?? null;
}

export const menuRoutes: RouteHandler = (path, method, body) => {
  const { base, query } = splitPath(path);
  const includeInactive = query.get('includeInactive') === 'true';

  if (method === 'GET' && base === '/api/menu') return json(buildMenuTree(includeInactive));

  if (method === 'GET' && base === '/api/menu/categories') {
    return json(includeInactive ? categories : categories.filter((c) => c.isActive));
  }
  if (method === 'POST' && base === '/api/menu/categories') {
    const created: Category = {
      id: uid('cat'),
      name: typeof body.name === 'string' && body.name ? body.name : 'Yangi kategoriya',
      displayOrder: typeof body.displayOrder === 'number' ? body.displayOrder : categories.length,
      isActive: true,
    };
    categories = [...categories, created];
    return json(created, 201);
  }
  const catPatch = /^\/api\/menu\/categories\/([^/]+)$/.exec(base);
  if (method === 'PATCH' && catPatch) {
    const id = catPatch[1] as string;
    if (!categories.some((c) => c.id === id)) return errorJson('NOT_FOUND', 'Kategoriya topilmadi', 404);
    categories = categories.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c };
      if (typeof body.name === 'string') next.name = body.name;
      if (typeof body.displayOrder === 'number') next.displayOrder = body.displayOrder;
      if (typeof body.isActive === 'boolean') next.isActive = body.isActive;
      return next;
    });
    return json(categories.find((c) => c.id === id));
  }

  if (method === 'GET' && base === '/api/menu/items') {
    return json(includeInactive ? items : items.filter((i) => i.isActive));
  }
  if (method === 'POST' && base === '/api/menu/items') {
    const payload = body as unknown as CreateItemPayload;
    const created: MenuItem = {
      id: uid('mi'),
      categoryId: payload.categoryId,
      name: payload.name,
      price: Number(payload.price),
      description: payload.description ?? null,
      displayOrder: payload.displayOrder ?? items.filter((i) => i.categoryId === payload.categoryId).length,
      kind: payload.mode === 'SERVICE' ? 'SERVICE' : 'FOOD',
      isAvailable: true,
      isActive: true,
      counted: payload.mode === 'COUNTED',
      stockCount: payload.mode === 'COUNTED' ? (payload.initialCount ?? null) : null,
      costPrice: payload.costPrice != null ? String(payload.costPrice) : null,
    };
    items = [...items, created];
    return json(created, 201);
  }
  const itemAvailability = /^\/api\/menu\/items\/([^/]+)\/availability$/.exec(base);
  if (method === 'PATCH' && itemAvailability) {
    const id = itemAvailability[1] as string;
    if (!items.some((i) => i.id === id)) return errorJson('NOT_FOUND', 'Mahsulot topilmadi', 404);
    items = items.map((i) => (i.id === id ? { ...i, isAvailable: body.isAvailable === true } : i));
    return json(items.find((i) => i.id === id));
  }
  const itemPatch = /^\/api\/menu\/items\/([^/]+)$/.exec(base);
  if (method === 'PATCH' && itemPatch) {
    const id = itemPatch[1] as string;
    if (!items.some((i) => i.id === id)) return errorJson('NOT_FOUND', 'Mahsulot topilmadi', 404);
    items = items.map((i) => {
      if (i.id !== id) return i;
      const next = { ...i };
      if (typeof body.name === 'string') next.name = body.name;
      if (typeof body.categoryId === 'string') next.categoryId = body.categoryId;
      if (typeof body.price === 'number') next.price = body.price;
      if (typeof body.description === 'string' || body.description === null) next.description = body.description as string | null;
      if (typeof body.isActive === 'boolean') next.isActive = body.isActive;
      if (typeof body.isAvailable === 'boolean') next.isAvailable = body.isAvailable;
      if (typeof body.counted === 'boolean') next.counted = body.counted;
      if (body.costPrice === null || typeof body.costPrice === 'string') next.costPrice = body.costPrice;
      return next;
    });
    return json(items.find((i) => i.id === id));
  }

  if (method === 'GET' && base === '/api/menu/combos') {
    return json(includeInactive ? combos : combos.filter((c) => c.isActive));
  }
  if (method === 'POST' && base === '/api/menu/combos') {
    const id = uid('combo');
    const rawComponents = Array.isArray(body.components) ? (body.components as Array<{ menuItemId: string; quantity: number }>) : [];
    const created: Combo = {
      id,
      name: typeof body.name === 'string' && body.name ? body.name : 'Yangi kombo',
      price: null,
      isActive: true,
      components: resolveComponents(id, rawComponents),
    };
    combos = [...combos, created];
    return json(created, 201);
  }
  const comboPatch = /^\/api\/menu\/combos\/([^/]+)$/.exec(base);
  if (method === 'PATCH' && comboPatch) {
    const id = comboPatch[1] as string;
    if (!combos.some((c) => c.id === id)) return errorJson('NOT_FOUND', 'Kombo topilmadi', 404);
    combos = combos.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c };
      if (typeof body.name === 'string') next.name = body.name;
      if (typeof body.isActive === 'boolean') next.isActive = body.isActive;
      if (typeof body.price === 'number' || body.price === null) next.price = body.price;
      return next;
    });
    return json(combos.find((c) => c.id === id));
  }

  return null;
};
