/* eslint-disable @typescript-eslint/no-explicit-any */
// SQLite write contention on the live till (real clock, no fake timers).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { boot, buildWorld, capturePrints, openOrder, sendOrder, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const rejections: string[] = [];
const onRejection = (reason: unknown) => rejections.push(String((reason as any)?.code ?? reason));

beforeAll(async () => {
  process.on('unhandledRejection', onRejection);
  env = await boot('contention');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  process.off('unhandledRejection', onRejection);
  printer.restore();
  await env?.close();
});

describe('Write contention', () => {
  it('[new] 78 writes back to back (machine speed) raise no database errors', async () => {
    const before = rejections.length;
    // requireAuth touches the session without awaiting it and logs a failed touch
    // instead of letting it escape as an unhandled rejection (PRD 14 G7), so the
    // rejection check alone cannot see it: watch the log as well.
    const errorLog = vi.spyOn(console, 'error');
    let failedTouches: string[];
    try {
      const cat = (await w.admin.get('/api/menu/categories'))[0].id;
      for (let i = 1; i <= 78; i += 1) {
        await w.admin.post('/api/menu/items', { categoryId: cat, name: `Taom ${i}`, price: 30000, mode: 'COUNTED', costPrice: 12000, initialCount: 20 });
      }
      await new Promise((r) => setTimeout(r, 500));
      failedTouches = errorLog.mock.calls
        .filter(([message]) => typeof message === 'string' && message.includes('[requireAuth] session touch failed'))
        .map(([, error]) => String((error as any)?.code ?? error));
    } finally {
      errorLog.mockRestore();
    }
    expect(rejections.slice(before), 'unhandled rejections during the burst').toEqual([]);
    expect(failedTouches, 'session touches that failed during the burst').toEqual([]);
  });

  it('[new] while a bill prints slowly (8 s), a waiter can still add a dish to another table', async () => {
    const busy = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1]]);
    await sendOrder(w.w1, busy);
    const other = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 1]]);

    const { printService } = await import('../src/main/server/services/print.service');
    const realPrint = printService.printBill.bind(printService);
    const spy = vi.spyOn(printService, 'printBill').mockImplementation(async (order: any, tx: any) => {
      await new Promise((r) => setTimeout(r, 8000)); // a slow or jammed thermal printer
      return realPrint(order, tx);
    });

    const confirming = w.admin.call('POST', `/api/orders/${busy}/confirm`, { payments: [{ method: 'CASH', amount: 45000 }] });
    await new Promise((r) => setTimeout(r, 500)); // the sale has committed and the bill is now printing
    const t0 = Date.now();
    const add = await w.w2.call('POST', `/api/orders/${other}/items`, { menuItemId: w.items.choy, quantity: 1 });
    const waited = Date.now() - t0;
    const confirm = await confirming;
    spy.mockRestore();

    expect(
      { addStatus: add.status, waitedUnder2s: waited < 2000 },
      `waiter's add answered ${add.status} ${JSON.stringify(add.body?.error ?? '')} after ${waited} ms; the confirm answered ${confirm.status}`,
    ).toEqual({ addStatus: 201, waitedUnder2s: true });
  });

  it('[PRD 14 G6] a failed bill print leaves the sale closed, paid and reprintable', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1]]);
    await sendOrder(w.w1, id);

    const { printService } = await import('../src/main/server/services/print.service');
    const spy = vi.spyOn(printService, 'printBill').mockRejectedValueOnce(new Error('Printer offline'));
    const confirm = await w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 45000 }] });
    spy.mockRestore();

    const order = await env.prisma.order.findUniqueOrThrow({ where: { id } });
    const payments = await env.prisma.payment.count({ where: { orderId: id } });
    expect(
      { status: confirm.status, billPrinted: confirm.body?.billPrinted, order: order.status, payments },
      JSON.stringify(confirm.body?.error ?? ''),
    ).toEqual({ status: 200, billPrinted: false, order: 'CLOSED', payments: 1 });

    const reprint = await w.admin.call('POST', `/api/orders/${id}/reprint-bill`, { reason: 'Tasdiqlashda chop etilmadi' });
    expect(reprint.status).toBeLessThan(300);
  });

  it('[PRD 14 G6] a slow reprint never fails a confirm of another bill', async () => {
    // One bill is paid and closed; its reprint will sit at the printer for 8 s.
    const printed = await openOrder(w.w1, w.nextTable(), [[w.items.somsa, 1]]);
    await sendOrder(w.w1, printed);
    await w.admin.post(`/api/orders/${printed}/confirm`, { payments: [{ method: 'CASH', amount: 8000 }] });
    // Another bill waits for Tasdiqlash, and a waiter has an open order.
    const waiting = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1]]);
    await sendOrder(w.w1, waiting);
    const other = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 1]]);

    // The printer takes 8 s to finish the job it is on. The wait has to sit
    // inside the queued print task (between its start and its last write) — a
    // delay before the job is queued would not hold the printer, and the
    // confirm would print straight through.
    const { printJobRepo } = await import('../src/main/server/repositories/printJob.repo');
    const realMarkSuccess = printJobRepo.markSuccess.bind(printJobRepo);
    let atPrinter!: () => void;
    const reachedPrinter = new Promise<void>((resolve) => {
      atPrinter = resolve;
    });
    const spy = vi.spyOn(printJobRepo, 'markSuccess').mockImplementationOnce(async (jobId: string, tx?: any) => {
      atPrinter();
      await new Promise((r) => setTimeout(r, 8000));
      return realMarkSuccess(jobId, tx);
    });

    const reprinting = w.admin.call('POST', `/api/orders/${printed}/reprint-bill`, { reason: 'Chek yirtilgan' });
    await Promise.race([reachedPrinter, reprinting]); // the reprint now holds the printer
    const confirming = w.admin.call('POST', `/api/orders/${waiting}/confirm`, { payments: [{ method: 'CASH', amount: 45000 }] });
    await new Promise((r) => setTimeout(r, 500)); // the confirm is past its checks and into its transaction
    const t0 = Date.now();
    const add = await w.w2.call('POST', `/api/orders/${other}/items`, { menuItemId: w.items.choy, quantity: 1 });
    const waited = Date.now() - t0;
    const confirm = await confirming; // its own response waits for its turn at the printer, by design
    const reprint = await reprinting;
    spy.mockRestore();

    const order = await env.prisma.order.findUniqueOrThrow({ where: { id: waiting } });
    const payments = await env.prisma.payment.count({ where: { orderId: waiting } });
    expect(
      {
        confirm: confirm.status,
        billPrinted: confirm.body?.billPrinted,
        order: order.status,
        payments,
        addStatus: add.status,
        addWaitedUnder2s: waited < 2000,
      },
      `the confirm answered ${confirm.status} ${JSON.stringify(confirm.body?.error ?? '')}; the waiter's add answered ${add.status} after ${waited} ms; the reprint answered ${reprint.status}`,
    ).toEqual({ confirm: 200, billPrinted: true, order: 'CLOSED', payments: 1, addStatus: 201, addWaitedUnder2s: true });
  }, 60_000);

  it('[PRD 14 G6] the owner alerts fire after the bill prints, and a hung alert never holds the slip', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1]]);
    await sendOrder(w.w1, id);

    // Every owner alert awaits a Telegram call that has no timeout. Here that
    // call never answers: the alert hangs until the test lets it go.
    const { alertService } = await import('../src/main/server/services/alert.service');
    let reached!: () => void;
    const alertReached = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let letGo!: () => void;
    const hung = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    const spy = vi.spyOn(alertService, 'debtSale').mockImplementation(async () => {
      reached();
      await hung;
    });

    const confirming = w.admin.call('POST', `/api/orders/${id}/confirm`, {
      payments: [{ method: 'DEBT', amount: 45000 }],
      debt: { debtorName: 'Karim aka' },
    });
    await Promise.race([alertReached, confirming]); // the alert is hanging now, or the confirm answered without one
    const printedWhileAlertHung = printer.prints.some((p) => p.orderId === id);
    letGo();
    const confirm = await confirming;
    const alerted = spy.mock.calls.map(([call]) => call.debtorName);
    spy.mockRestore();

    expect(
      { printedWhileAlertHung, status: confirm.status, billPrinted: confirm.body?.billPrinted, alerted },
      `the slip ${printedWhileAlertHung ? 'had printed' : 'was still waiting'} while the owner alert hung; the confirm answered ${confirm.status} ${JSON.stringify(confirm.body?.error ?? '')}`,
    ).toEqual({ printedWhileAlertHung: true, status: 200, billPrinted: true, alerted: ['Karim aka'] });
  });
});
