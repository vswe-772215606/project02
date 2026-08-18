/**
 * Every operator-facing sentence the updater can produce, composed here so it
 * is testable and so no English ever reaches the screen.
 *
 * Pure by design — no `electron`, no `electron-updater`, no `fs`. The open
 * order count arrives as a number the caller has already read; this module
 * only decides how to say it.
 *
 * Apostrophes are ASCII U+0027 throughout, matching `ConnectionBanner.tsx` and
 * `installer.nsh`. The dash in "1–2 daqiqa" is an en dash; the dash before
 * "taxminan" is an em dash.
 */

import type { UpdaterPrompt } from './updater-contract';

/**
 * Hardcoded rather than read from `APP_IDENTITY.label` because only the
 * `production` variant has an updater at all (`updateFeedUrl` is null on
 * `next`), so the label can never be anything else here — and keeping this
 * module free of imports keeps it free of build-time globals.
 */
const PRODUCT_LABEL = 'Chayxana Master';

const PROMPT_TITLE = 'Yangi versiya tayyor';

/**
 * The RISK 1 mitigation, and not optional. Declining the Windows permission
 * dialog leaves the app quit and NOT relaunched — electron-updater calls
 * app.quit() as soon as the installer is spawned, and a refused elevation is
 * reported asynchronously, long after the app is gone. The operator has to
 * know that before they commit. Pinned by a test.
 */
const UAC_PARAGRAPH =
  'O\'rnatishdan oldin Windows ruxsat so\'raydi. "Ha" tugmasini bosing, aks holda dastur yopiladi va o\'zi ochilmaydi.';

const RESTART_TAIL =
  'O\'rnatish uchun dastur yopiladi va qayta ochiladi. Shu vaqtda ofitsiantlarning telefonlari va buyurtma kompyuteri master bilan aloqani yo\'qotadi — taxminan 1–2 daqiqa. Ochiq buyurtmalar o\'chmaydi, ular joyida qoladi.';

export function buildReadyPrompt(input: {
  version: string;
  /** null when the count could not be read — never rendered as zero. */
  openOrders: number | null;
}): UpdaterPrompt {
  const lead = `${PRODUCT_LABEL} ${input.version} yuklab olindi.`;

  let middle: string;
  if (input.openOrders === null) {
    // Never claim zero on a failed read. An operator who is told "no open
    // orders" and restarts into three live tables will not trust the prompt
    // again.
    middle = `Ochiq buyurtmalar soni aniqlanmadi. Ehtiyot bo'ling: hozir ochiq buyurtma bo'lishi mumkin. ${RESTART_TAIL}`;
  } else if (input.openOrders <= 0) {
    middle =
      "Hozir ochiq buyurtma yo'q. O'rnatish uchun dastur yopiladi va qayta ochiladi — taxminan 1–2 daqiqa.";
  } else {
    // Uzbek takes no plural suffix after a numeral: 1 ta, 3 ta and 17 ta all
    // read the same, so this is one branch and not three.
    middle = `Hozir ${input.openOrders} ta ochiq buyurtma bor. ${RESTART_TAIL}`;
  }

  return {
    title: PROMPT_TITLE,
    body: `${lead}\n\n${middle}\n\n${UAC_PARAGRAPH}`,
    confirmLabel: "Hozir o'rnatish",
    cancelLabel: 'Keyinroq',
  };
}


/**
 * Broadcast to every authenticated socket immediately before the server goes
 * down, so waiter devices show a reason instead of a silent dead connection.
 */
export const SHUTDOWN_NOTICE = 'Master yangilanmoqda. Aloqa 1–2 daqiqaga uziladi.';

function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}

function errorTextOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  return '';
}

/**
 * Map whatever electron-updater threw onto one short Uzbek sentence.
 *
 * Deliberately never interpolates the underlying message: those are English,
 * often a stack, and the operator can do nothing with them. The raw error goes
 * to `updater.log` instead.
 */
export function updaterErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  const text = errorTextOf(error);
  const haystack = `${code} ${text}`.toLowerCase();

  if (haystack.includes('err_updater_installer_missing')) {
    // Not a server fault and not the operator's: electron-updater deletes the
    // pending installer when a newer version starts downloading. Say what
    // happens next rather than naming the cause.
    return 'Yangilanish fayli topilmadi. Qaytadan yuklab olinmoqda.';
  }
  if (haystack.includes('err_updater_channel_file_not_found')) {
    return 'Yangilanish serveri javob bermadi.';
  }
  if (haystack.includes('enotfound') || haystack.includes('econnrefused')) {
    return "Internet aloqasi yo'q.";
  }
  if (haystack.includes('sha512')) {
    return 'Yuklab olingan fayl buzilgan.';
  }
  return "Noma'lum xatolik yuz berdi.";
}
