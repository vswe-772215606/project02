/* eslint-disable @typescript-eslint/no-explicit-any */
// Payment legs at Tasdiqlash (F5, F6, C10, C11).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, buildWorld, capturePrints, n, openOrder, sendOrder, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;

beforeAll(async () => {
  env = await boot('payments');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

async function sentOrder(lines: Array<[string, number]>) {
  const id = await openOrder(w.w1, w.nextTable(), lines);
  await sendOrder(w.w1, id);
  return id;
}

describe('Payment legs', () => {
  it('control: payments that do not add up to the bill are refused', async () => {
    const id = await sentOrder([[w.items.osh, 1]]); // 45 000
    const r = await w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 44000 }] });
    expect(r.status).toBeGreaterThanOrEqual(400);
    await w.admin.post(`/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 45000 }] });
  });

  it('[issue 27] a negative payment leg is refused', async () => {
    const id = await sentOrder([[w.items.osh, 2]]); // 90 000
    const r = await w.admin.call('POST', `/api/orders/${id}/confirm`, {
      payments: [{ method: 'CASH', amount: 120000 }, { method: 'CARD', amount: -30000 }],
    });
    const day = env.svc.time.localDayKey();
    const ledger = await env.svc.reports.dailyLedger(day);
    expect(
      r.status,
      `server answered ${r.status}; the day now shows Karta ${ledger.cashflow.orderCard} and Naqd ${ledger.cashflow.orderCash}`,
    ).toBe(400);
  });

  it('[issue 28] two Nasiya legs open debts for their full sum', async () => {
    const id = await sentOrder([[w.items.osh, 2]]); // 90 000
    await w.admin.post(`/api/orders/${id}/confirm`, {
      payments: [{ method: 'DEBT', amount: 50000 }, { method: 'DEBT', amount: 40000 }],
      debt: { debtorName: 'Ikki qism' },
    });
    const debts = await env.prisma.debt.findMany({ where: { orderId: id } });
    const opened = debts.reduce((s, d) => s + n(d.originalAmount), 0);
    const legs = await env.prisma.payment.findMany({ where: { orderId: id, method: 'DEBT' } });
    const legSum = legs.reduce((s, p) => s + n(p.amount), 0);
    expect(opened, `Nasiya legs recorded: ${legSum}; debt ledger opened: ${opened}`).toBe(legSum);
  });

  it('[issue 26] confirming the same bill twice at the same moment charges it once', async () => {
    const report: string[] = [];
    let duplicated = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = await sentOrder([[w.items.somsa, 2]]); // 16 000
      const body = { payments: [{ method: 'CASH', amount: 16000 }] };
      const [a, b] = await Promise.all([
        w.admin.call('POST', `/api/orders/${id}/confirm`, body),
        w.admin.call('POST', `/api/orders/${id}/confirm`, body),
      ]);
      const payments = await env.prisma.payment.count({ where: { orderId: id } });
      const prints = printer.prints.filter((p) => p.orderId === id).length;
      report.push(`attempt ${attempt + 1}: HTTP ${a.status}/${b.status}, payment rows ${payments}, bills printed ${prints}`);
      if (payments > 1) duplicated += 1;
    }
    expect(duplicated, report.join('\n')).toBe(0);
  });

  it('[PRD 14 G1] a cancel racing a confirm never cancels a paid bill', async () => {
    const report: string[] = [];
    let broken = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = await sentOrder([[w.items.somsa, 1]]); // 8 000
      const [confirm, cancel] = await Promise.all([
        w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 8000 }] }),
        w.admin.call('POST', `/api/orders/${id}/cancel`, { reason: 'Mehmon ketdi' }),
      ]);
      const order = await env.prisma.order.findUniqueOrThrow({ where: { id } });
      const payments = await env.prisma.payment.count({ where: { orderId: id } });
      report.push(`attempt ${attempt + 1}: confirm ${confirm.status}, cancel ${cancel.status}, order ${order.status}, payment rows ${payments}`);
      const bothWon = confirm.status < 300 && cancel.status < 300;
      const paidButCanceled = order.status === 'CANCELED' && payments > 0;
      if (bothWon || paidButCanceled) broken += 1;
    }
    expect(broken, report.join('\n')).toBe(0);
  });
});
