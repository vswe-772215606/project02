/* eslint-disable @typescript-eslint/no-explicit-any */
// The scheduled Telegram report (F43, F44) on a production-seeded install.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { at, boot, buildWorld, capturePrints, sale, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D = '2026-09-29';
const D_NEXT = '2026-09-30';

beforeAll(async () => {
  setClock(at(`${D}T09:00`));
  env = await boot('nightly');
  w = await buildWorld(env.base);
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

async function setSetting(key: string, value: string) {
  await env.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  await env.svc.settings.loadAll();
}

describe('Nightly report', () => {
  it('[issue 22] a fresh install sends the owner the nightly report', () => {
    expect(env.svc.financeReport.shouldSendDailyTelegram(at(`${D}T23:31`)), 'daily_report_telegram_enabled is not seeded on a packaged install').toBe(true);
  });

  it('[issue 22] a nightly report that was not delivered is not recorded as sent', async () => {
    // Configured, but the bot is not running — e.g. getMe() failed at start-up because the internet was down.
    await setSetting('daily_report_telegram_enabled', 'true');
    await setSetting('telegram_bot_token', '000000:placeholder');
    await setSetting('owner_telegram_chat_id', '42');
    setClock(at(`${D}T20:00`));
    await w.relogin(); // admin sessions last 8 hours
    await sale(w, w.w1, [[w.items.osh, 1]], { payments: [{ method: 'CASH', amount: 45000 }] });

    setClock(at(`${D}T23:31`));
    await env.svc.financeReport.runScheduledDailyTelegram();
    const sent = await env.prisma.auditLog.count({ where: { action: 'REPORT_SENT' } });
    const lastSent = env.svc.settings.get('daily_report_last_sent_date');
    expect({ auditRowsSayingSent: sent, markedSentFor: lastSent ?? null }, 'nothing reached Telegram').toEqual({ auditRowsSayingSent: 0, markedSentFor: null });
  });

  it('[issue 22] bills closed after the send time reach the owner in some scheduled report', async () => {
    const spy = vi.spyOn(env.svc.telegram, 'sendMessage');
    await setSetting('daily_report_last_sent_date', '');
    setClock(at(`${D}T23:31`));
    await env.svc.financeReport.runScheduledDailyTelegram(); // tonight's report: 1 bill so far
    setClock(at(`${D}T23:45`));
    await w.relogin();
    await sale(w, w.w2, [[w.items.osh, 2]], { payments: [{ method: 'CASH', amount: 90000 }] });
    setClock(at(`${D}T23:55`));
    await env.svc.financeReport.runScheduledDailyTelegram(); // already sent today — nothing
    setClock(at(`${D_NEXT}T23:31`));
    await env.svc.financeReport.runScheduledDailyTelegram(); // tomorrow's report covers tomorrow only
    const reports = spy.mock.calls.map((c) => String(c[0]));
    spy.mockRestore();
    const billsReported = reports.map((m) => Number(m.match(/Yopilgan buyurtmalar: <b>(\d+)<\/b>/)?.[1] ?? 0));
    expect(
      billsReported.reduce((s, v) => s + v, 0),
      `scheduled messages sent: ${reports.length}, bills in them: ${billsReported.join(' + ')}; bills actually closed on ${D}: 2`,
    ).toBe(2);
  });
});
