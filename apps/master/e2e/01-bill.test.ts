/* eslint-disable @typescript-eslint/no-explicit-any */
// The bill: what is charged, what is printed, what the waiter sees.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, buildWorld, capturePrints, sale, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
let order: { id: string; closed: any };

beforeAll(async () => {
  env = await boot('bill');
  w = await buildWorld(env.base);
  // Osh ×2 (90 000) + Xizmat haqi ×3 (15 000), Chegirma 10 000 → Umumiy 95 000
  order = await sale(w, w.w1, [[w.items.osh, 2], [w.items.xizmat, 3]], {
    discountAmount: 10000,
    payments: [{ method: 'CASH', amount: 95000 }],
  });
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('Bill at Tasdiqlash (C5–C9)', () => {
  it('control: food 90 000, Xizmat haqi 15 000, Chegirma 10 000 → total 95 000, frozen on the order', () => {
    const o = order.closed;
    expect({
      food: o.subtotalSnapshot,
      discount: o.discountAmountSnapshot,
      service: o.serviceChargeSnapshot,
      total: o.totalSnapshot,
    }).toEqual({ food: 90000, discount: 10000, service: 15000, total: 95000 });
  });
});

describe('Printed bill (F9)', () => {
  it('[issue 1] "Jami" equals the sum of the item lines printed above it', () => {
    const bill = printer.billFor(order.id);
    const itemsSum = bill.lines.reduce((s, l) => s + l.amount, 0);
    const printed = bill.lines.map((l) => `${l.name} ${l.qty}×${l.unit}=${l.amount}`).join(', ');
    expect(bill.jami, `items printed: ${printed}; Jami printed: ${bill.jami}`).toBe(itemsSum);
  });

  it('[issue 1] "Jami" − "Chegirma" equals "Umumiy"', () => {
    const bill = printer.billFor(order.id);
    expect(bill.jami - bill.chegirma, `Jami ${bill.jami} − Chegirma ${bill.chegirma} vs Umumiy ${bill.umumiy}`).toBe(bill.umumiy);
  });

  it('control: "Umumiy" equals what was charged', () => {
    expect(printer.billFor(order.id).umumiy).toBe(order.closed.totalSnapshot);
  });

  it('[issue 1] a bill closed on nasiya says it was not paid (payment method or debtor on the slip)', async () => {
    const debtSale = await sale(w, w.w2, [[w.items.osh, 1]], {
      payments: [{ method: 'DEBT', amount: 45000 }],
      debt: { debtorName: 'Karim aka' },
    });
    const text = printer.billFor(debtSale.id).raw.join('\n');
    expect(text, `printed bill:\n${text}`).toMatch(/Nasiya|Qarz|Karim|Naqd|Karta/);
  });
});

describe("Waiter's view of the money (F50)", () => {
  it("[issue 17] after the bill closes, the waiter's total (sum of lines, as both waiter apps show it) equals what was charged", async () => {
    const o = await w.w1.get(`/api/orders/${order.id}`);
    const waiterJami = o.lines
      .filter((l: any) => !l.isCanceled)
      .reduce((s: number, l: any) => s + l.price * l.quantity, 0);
    expect(waiterJami, `waiter apps show ${waiterJami}; charged ${o.totalSnapshot}`).toBe(o.totalSnapshot);
  });

  it('[issue 32] order data sent to the waiter carries no tan narx and no food cost', async () => {
    const o = await w.w1.get(`/api/orders/${order.id}`);
    const leaked = o.lines.flatMap((l: any) => [
      l.cogsSnapshot != null ? `line cogsSnapshot=${l.cogsSnapshot}` : null,
      l.menuItem?.costPrice != null ? `menuItem.costPrice=${l.menuItem.costPrice}` : null,
    ]).filter(Boolean);
    expect(leaked).toEqual([]);
  });
});
