import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The real modules reach Prisma and Telegram; an alert only needs their answers.
vi.mock('./settings.service', () => ({
  settingsService: {
    get: () => undefined,
    getInt: (_key: string, fallback: number) => fallback,
  },
}));

const telegram = vi.hoisted(() => ({ sendMessage: vi.fn<(text: string) => Promise<void>>() }));
vi.mock('./telegram-bot.service', () => ({ telegramBotService: telegram }));

import { alertService } from './alert.service';

/** A Telegram send that answers only when the test says so. */
function heldSend() {
  let reached!: () => void;
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let fail!: (error: Error) => void;
  telegram.sendMessage.mockImplementation(() => {
    reached();
    return new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
  });
  return { started, fail: (error: Error) => fail(error) };
}

const sale = { orderNumber: 'K3J9AB', debtorName: 'Karim aka', amount: 45000 };

describe('alertService: waiting for Telegram', () => {
  beforeAll(async () => {
    // Loaded once here, so the alert's own lazy import resolves from the cache.
    await import('./telegram-bot.service');
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    telegram.sendMessage.mockReset();
  });

  it('stops waiting after 5 seconds when Telegram does not answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = heldSend();
    let returned = false;
    const alert = alertService.debtSale(sale).then(() => {
      returned = true;
    });
    await send.started;

    await vi.advanceTimersByTimeAsync(4_999);
    expect(returned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await alert; // still waiting here would hang until the test times out
    expect(returned).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not answer in 5 s'));
  });

  it('keeps an error that arrives after the wait caught', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = heldSend();
    const alert = alertService.debtWriteOff({ debtorName: 'Karim aka', amount: 45000, reason: 'Ketib qoldi' });
    await send.started;
    await vi.advanceTimersByTimeAsync(5_000);
    await alert;

    send.fail(new Error('ETIMEDOUT'));
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveBeenCalledWith('[alert] send failed:', expect.objectContaining({ message: 'ETIMEDOUT' }));
  });

  it('returns as soon as Telegram answers and leaves no timer behind', async () => {
    telegram.sendMessage.mockResolvedValue(undefined);
    await alertService.debtSale(sale);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
