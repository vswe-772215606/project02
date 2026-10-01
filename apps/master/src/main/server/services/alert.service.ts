import { formatUZS } from '../lib/format';
import { settingsService } from './settings.service';

/**
 * Owner-facing Telegram alerts for notable business events: large
 * discount, large expense, nasiya (debt) sale, debt write-off, and ingredient
 * stock-out.
 *
 * These are PROACTIVE pushes — distinct from the pull commands and the
 * scheduled nightly digest. The owner learns about exceptions the moment they
 * happen instead of at 23:30.
 *
 * Contract:
 *  - Every method self-guards and NEVER throws into business logic, and none
 *    waits more than 5 s for Telegram (`send`). Callers run them only after
 *    their transaction commits: `void alertService.xxx(...)` right after it, or
 *    `deferAfterCommit(() => alertService.xxx(...))` inside an emit context,
 *    whose `flushAfterCommit()` runs only on commit — and awaits each alert, so
 *    that request's answer waits for it. Confirm flushes its alerts last, after
 *    the bill prints (`orderService.confirm`).
 *  - Gated by `alerts_telegram_enabled` (default ON). Amount-based alerts have
 *    their own owner-tunable thresholds in Settings.
 *  - `telegramBotService` is imported lazily to avoid a require cycle
 *    (telegram-bot → expense/debt service → alert.service → telegram-bot).
 *    Telegram delivery itself no-ops safely when the bot isn't configured.
 */

// Shared with the receipt path. `Intl.NumberFormat('uz-UZ')` used to be called
// here directly, which grouped with commas — so every owner alert disagreed
// with the bill the same money was printed on.
const money = formatUZS;

/** Boolean setting that defaults to `fallback` when the key is missing/blank. */
function boolSetting(key: string, fallback: boolean): boolean {
  const raw = settingsService.get(key);
  if (raw === undefined || raw === null || raw === '') return fallback;
  return raw === 'true';
}

/** How long a caller waits for one Telegram send. */
const SEND_WAIT_MS = 5_000;

/** True when `promise` settles within `ms`, false when the wait runs out first. */
function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const settled = () => {
      clearTimeout(timer);
      resolve(true);
    };
    promise.then(settled, settled);
  });
}

/**
 * Sends one alert, waiting at most 5 s. A confirm or an added dish waits for
 * its alerts, and the Telegram call has no timeout of its own: with Telegram
 * unreachable the till would wait until the network gave up. A send still
 * running after 5 s finishes in the background, and its error stays caught.
 */
async function send(text: string): Promise<void> {
  try {
    if (!boolSetting('alerts_telegram_enabled', true)) return;
    const { telegramBotService } = await import('./telegram-bot.service');
    const delivery = telegramBotService.sendMessage(text).catch((error: unknown) => {
      console.error('[alert] send failed:', error);
    });
    if (!(await settlesWithin(delivery, SEND_WAIT_MS))) {
      console.warn(`[alert] Telegram did not answer in ${SEND_WAIT_MS / 1000} s; the alert goes on in the background`);
    }
  } catch (error) {
    console.error('[alert] send failed:', error);
  }
}

export const alertService = {
  /** Discount applied at confirm, alerts only when >= alert_discount_threshold. */
  async largeDiscount(p: {
    orderNumber: string;
    discount: number;
    total: number;
    waiterName: string | null;
  }): Promise<void> {
    const threshold = settingsService.getInt('alert_discount_threshold', 50_000);
    if (p.discount <= 0 || p.discount < threshold) return;
    const who = p.waiterName ? `\nOfitsiant: ${p.waiterName}` : '';
    await send(
      `🏷 <b>Katta chegirma qo'llanildi</b>\n` +
        `Buyurtma #${p.orderNumber}\n` +
        `Chegirma: <b>${money(p.discount)}</b> so'm  (jami: ${money(p.total)} so'm)${who}`,
    );
  },

  /** A bill was closed with a DEBT (nasiya) payment. Always alerts. */
  async debtSale(p: {
    orderNumber: string;
    debtorName: string;
    amount: string | number;
  }): Promise<void> {
    await send(
      `📝 <b>Nasiyaga sotildi</b>\n` +
        `Buyurtma #${p.orderNumber}\n` +
        `Qarzdor: <b>${p.debtorName}</b>\n` +
        `Summa: <b>${money(p.amount)}</b> so'm`,
    );
  },

  /** An open debt was written off (forgiven / lost). Always alerts. */
  async debtWriteOff(p: {
    debtorName: string;
    amount: string | number;
    reason: string;
  }): Promise<void> {
    await send(
      `❌ <b>Qarz yo'qotildi (hisobdan chiqarildi)</b>\n` +
        `Qarzdor: <b>${p.debtorName}</b>\n` +
        `Summa: <b>${money(p.amount)}</b> so'm\n` +
        `Sabab: ${p.reason}`,
    );
  },

  /** A manual expense was recorded, alerts only when >= alert_expense_threshold. */
  async largeExpense(p: {
    reason: string;
    amount: string | number;
    categoryName: string | null;
  }): Promise<void> {
    const threshold = settingsService.getInt('alert_expense_threshold', 500_000);
    if (Number(p.amount) < threshold) return;
    const cat = p.categoryName ? `\nTurkum: ${p.categoryName}` : '';
    await send(
      `💸 <b>Katta chiqim kiritildi</b>\n` +
        `${p.reason} — <b>${money(p.amount)}</b> so'm${cat}`,
    );
  },

  /** A sale drove an item's counted stock to zero. Gated by alert_low_stock_enabled. */
  async itemStockOut(p: { itemName: string }): Promise<void> {
    if (!boolSetting('alert_low_stock_enabled', true)) return;
    await send(
      `📦 <b>Taom tugadi</b>\n` +
        `<b>${p.itemName}</b> — qoldiq 0`,
    );
  },
};
