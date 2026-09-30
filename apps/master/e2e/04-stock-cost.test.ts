/* eslint-disable @typescript-eslint/no-explicit-any */
// Stock and food cost (F1, F2, F4, F11, F22, C2, C3, C26, C27).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { boot, buildWorld, capturePrints, itemState, n, openOrder, sale, sendOrder, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

beforeAll(async () => {
  env = await boot('stock');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

const lineCost = async (orderId: string, itemId: string) => {
  const line = await env.prisma.orderLine.findFirstOrThrow({ where: { orderId, menuItemId: itemId } });
  return { qty: line.quantity, cogs: n(line.cogsSnapshot ?? 0), id: line.id };
};

describe('Stock and food cost', () => {
  it('control: selling a counted dish takes the portions and books tan narx × portions', async () => {
    const before = await itemState(env, w.items.osh);
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 3]]);
    const after = await itemState(env, w.items.osh);
    const line = await lineCost(id, w.items.osh);
    expect({ stockTaken: before.stock! - after.stock!, cogs: line.cogs }).toEqual({ stockTaken: 3, cogs: 75000 });
    await sendOrder(w.w1, id);
    // control: removing two portions from the sent order returns them, with their cost
    await w.w1.call('PATCH', `/api/orders/${id}/lines/${line.id}/quantity`, { quantity: 1 });
    const afterDecrease = await itemState(env, w.items.osh);
    const line2 = await lineCost(id, w.items.osh);
    expect({ stockBack: afterDecrease.stock! - after.stock!, cogs: line2.cogs }).toEqual({ stockBack: 2, cogs: 25000 });
    // control: cancelling the order returns the rest
    await w.w1.post(`/api/orders/${id}/cancel`, { reason: 'Mijoz ketdi' });
    expect((await itemState(env, w.items.osh)).stock).toBe(before.stock);
  });

  it('[issue 4] a food dish cannot be saved without a tan narx (decision D4)', async () => {
    const cat = (await w.admin.get('/api/menu/categories'))[0].id;
    const r = await w.admin.call('POST', '/api/menu/items', { categoryId: cat, name: 'Lagmon', price: 30000, mode: 'UNCOUNTED' });
    expect(r.status, `a FOOD dish with no tan narx was answered ${r.status}`).toBeGreaterThanOrEqual(400);
  });

  it("[PRD 14 G3] a dish's price must be whole so'm: a negative or fractional one is refused", async () => {
    // A fractional price makes a bill total that no whole-so'm payment can equal. Tan narx is not held
    // to this: it never feeds a bill total, and a Keldi stores it as paid / qty (see the test below).
    const cat = (await w.admin.get('/api/menu/categories'))[0].id;
    const before = await env.prisma.menuItem.count();
    const create = (over: Record<string, unknown>) =>
      w.admin.call('POST', '/api/menu/items', { categoryId: cat, name: 'Narx sinovi', price: 30000, mode: 'UNCOUNTED', costPrice: 12000, ...over });
    const edit = (over: Record<string, unknown>) => w.admin.call('PATCH', `/api/menu/items/${w.items.choy}`, over);
    const refused = {
      createNegativePrice: await create({ price: -5000 }),
      createFractionalPrice: await create({ price: 12500.5 }),
      editNegativePrice: await edit({ price: -5000 }),
      editFractionalPrice: await edit({ price: 4999.5 }),
    };
    const choy = await env.prisma.menuItem.findUniqueOrThrow({ where: { id: w.items.choy } });
    expect(
      {
        statuses: Object.fromEntries(Object.entries(refused).map(([what, r]) => [what, r.status])),
        code: refused.createNegativePrice.body?.error?.code,
        created: (await env.prisma.menuItem.count()) - before,
        choyPrice: n(choy.price),
      },
      JSON.stringify(Object.values(refused).map((r) => r.body?.error)),
    ).toEqual({
      statuses: {
        createNegativePrice: 400,
        createFractionalPrice: 400,
        editNegativePrice: 400,
        editFractionalPrice: 400,
      },
      code: 'VALIDATION',
      created: 0,
      choyPrice: 5000,
    });
  });

  it('control: what the Menyu forms send today is still accepted', async () => {
    const cat = (await w.admin.get('/api/menu/categories'))[0].id;
    // NewItemPanel with the price box left blank sends 0, and null for a tan narx box left blank.
    // A Xizmat haqi line, so the control stays true when a food dish must have a tan narx (D4).
    const created = await w.admin.call('POST', '/api/menu/items', {
      categoryId: cat, name: 'Forma sinovi', price: 0, mode: 'SERVICE', costPrice: null,
    });
    // ItemPanel sends the price as a number; MenuPage turns the tan narx into text before it goes out.
    const choy = await env.prisma.menuItem.findUniqueOrThrow({ where: { id: w.items.choy } });
    const edited = await w.admin.call('PATCH', `/api/menu/items/${w.items.choy}`, {
      name: choy.name,
      categoryId: choy.categoryId,
      price: n(choy.price),
      counted: choy.counted,
      costPrice: String(n(choy.costPrice)),
    });
    expect(
      { created: created.status, edited: edited.status },
      JSON.stringify([created.body?.error, edited.body?.error]),
    ).toEqual({ created: 201, edited: 200 });
  });

  it('[PRD 14 G3] a dish whose tan narx a Keldi left fractional can still be saved in Menyu', async () => {
    // Keldi stores paid / qty as it comes (10 000 for 3 portions is 3 333.33...), and the Menyu form sends
    // the stored tan narx back on every save, so refusing a fractional tan narx would block every edit of the dish.
    const cat = (await w.admin.get('/api/menu/categories'))[0].id;
    const dish = await w.admin.post('/api/menu/items', {
      categoryId: cat, name: 'Keldi sinovi', price: 12000, mode: 'COUNTED', costPrice: 4000, initialCount: 10,
    });
    await w.admin.post(`/api/stock/${dish.id}/restock`, { qty: 3, paidUzs: 10000, setCostFromPaid: true });
    const stored = (await w.admin.get('/api/menu/items')).find((i: any) => i.id === dish.id);
    expect(Number.isInteger(n(stored.costPrice)), `the Keldi should leave a fractional tan narx; it left ${stored.costPrice}`).toBe(false);
    // What ItemPanel sends on Saqlash: MenuPage turns the tan narx into text before it goes out.
    const saved = await w.admin.call('PATCH', `/api/menu/items/${dish.id}`, {
      name: 'Keldi sinovi (yangi nom)',
      categoryId: stored.categoryId,
      price: n(stored.price),
      counted: stored.counted,
      costPrice: String(n(stored.costPrice)),
    });
    const after = await env.prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } });
    expect(
      { status: saved.status, name: after.name },
      `saving with the stored tan narx ${stored.costPrice}: ${JSON.stringify(saved.body?.error ?? '')}`,
    ).toEqual({ status: 200, name: 'Keldi sinovi (yangi nom)' });
  });

  it('[issue 4] selling a dish with no tan narx books its food cost, not a 100% margin', async () => {
    await sale(w, w.w1, [[w.items.salat, 2]], { payments: [{ method: 'CASH', amount: 40000 }] });
    const ledger = await env.svc.reports.dailyLedger(env.svc.time.localDayKey());
    const row = ledger.lines.mealSales.find((r: any) => r.menuItemId === w.items.salat)!;
    expect(n(row.cogs), `Achichuk sold for ${row.grossRevenue}; food cost booked ${row.cogs}; margin counted ${row.profit}`).toBeGreaterThan(0);
  });

  it('[issue 7] the automatic cleanup cancels a stale draft and returns its portions to stock', async () => {
    const before = await itemState(env, w.items.somsa);
    const draftId = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 5]]); // never sent
    const taken = await itemState(env, w.items.somsa);
    expect(before.stock! - taken.stock!).toBe(5);

    setClock(new Date(Date.now() + 13 * 60 * 60 * 1000)); // 13 hours later
    await env.svc.scheduler.runDraftCleanup();

    const draft = await env.prisma.order.findUniqueOrThrow({ where: { id: draftId } });
    const after = await itemState(env, w.items.somsa);
    const audit = await env.prisma.auditLog.findFirst({ where: { entityId: draftId, action: 'ORDER_CANCELED' } });
    expect({
      status: draft.status,
      reason: draft.cancelReason,
      stock: after.stock,
      automatic: (audit?.metadata as { automatic?: boolean } | null)?.automatic ?? false,
    }).toEqual({
      status: 'CANCELED',
      reason: 'Avtomatik bekor qilindi: 12 soat yuborilmadi',
      stock: before.stock,
      automatic: true,
    });
  });

  it('[PRD 14 G4] a stale draft that cannot be cancelled stays a draft and does not stop the others', async () => {
    const before = await itemState(env, w.items.somsa);
    const first = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 2]]);
    const stuck = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 3]]);
    const last = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 4]]);
    const statuses = async () =>
      Object.fromEntries((await env.prisma.order.findMany({ where: { id: { in: [first, stuck, last] } } })).map((o) => [o.id, o.status]));
    const portionsTaken = async () => before.stock! - (await itemState(env, w.items.somsa)).stock!;

    // The audit row is a cancel's last write, so refusing it fails the cancel of that draft after its claim and
    // its stock restore: everything the cancel did to it has to roll back.
    await env.prisma.$executeRawUnsafe(
      `CREATE TRIGGER refuse_stuck_audit BEFORE INSERT ON "AuditLog" WHEN NEW."entityId" = '${stuck}' BEGIN SELECT RAISE(ABORT, 'audit refused'); END`,
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let logged: string[];
    try {
      setClock(new Date(Date.now() + 13 * 60 * 60 * 1000)); // 13 hours later
      await env.svc.scheduler.runDraftCleanup();
      logged = errors.mock.calls.map((call) => String(call[0]));
    } finally {
      errors.mockRestore();
      await env.prisma.$executeRawUnsafe('DROP TRIGGER refuse_stuck_audit');
    }
    expect({
      statuses: await statuses(),
      portionsTaken: await portionsTaken(),
      failureNamesTheDraft: logged.some((line) => line.includes(stuck)),
    }).toEqual({
      statuses: { [first]: 'CANCELED', [stuck]: 'DRAFT', [last]: 'CANCELED' },
      portionsTaken: 3, // only the stuck draft still holds its portions
      failureNamesTheDraft: true,
    });

    // With the fault gone, the next run cancels it as well.
    await env.svc.scheduler.runDraftCleanup();
    expect({ statuses: await statuses(), portionsTaken: await portionsTaken() }).toEqual({
      statuses: { [first]: 'CANCELED', [stuck]: 'CANCELED', [last]: 'CANCELED' },
      portionsTaken: 0,
    });
  });
});
