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
 *  - Fire-and-forget. Every method self-guards and NEVER throws into business
 *    logic. Callers invoke as `void alertService.xxx(...)` right AFTER the DB
 *    transaction commits, or via `deferAfterCommit(() => alertService.xxx(...))`
 *    inside a `completeEmitContext` block (which only flushes on commit).
 *  - Gated by `alerts_telegram_enabled` (default ON). Amount-based alerts have
 *    their own owner-tunable thresholds in Settings.
 *  - `telegramBotService` is imported lazily to avoid a require cycle
 *    (telegram-bot → expense/debt service → alert.service → telegram-bot).
 *    Telegram delivery itself no-ops safely when the bot isn't configured.
 */

function money(value: string | number): string {
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(Number(value));
}

/** Boolean setting that defaults to `fallback` when the key is missing/blank. */
function boolSetting(key: string, fallback: boolean): boolean {
  const raw = settingsService.get(key);
  if (raw === undefined || raw === null || raw === '') return fallback;
  return raw === 'true';
}

async function send(text: string): Promise<void> {
  try {
    if (!boolSetting('alerts_telegram_enabled', true)) return;
    const { telegramBotService } = await import('./telegram-bot.service');
    await telegramBotService.sendMessage(text);
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
