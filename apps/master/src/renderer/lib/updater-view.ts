/**
 * Updater state → what the screen says. Pure: no React, no DOM, no bridge.
 *
 * Two surfaces, and the split between them is the point:
 *
 * - **The banner** in `AppShell` only ever carries work in progress or an
 *   action worth taking. It says nothing about `idle`, and — deliberately —
 *   nothing about `error`. A dead feed, an unplugged cable or a mistyped host
 *   is not the operator's problem while they are taking orders, and a red bar
 *   in front of a till reads as "something is broken with the sale". Failures
 *   go to `updater.log` and to Sozlamalar, where somebody is actually looking
 *   for them.
 * - **The Sozlamalar line** is the full state, including failure, in one
 *   sentence beside the buttons that act on it.
 *
 * All strings are Uzbek with ASCII apostrophes (U+0027), matching
 * `ConnectionBanner.tsx`. The en dash in "1–2" belongs to the main process's
 * prompt, not here.
 */

import type { UpdaterState, UpdaterStatus } from './updater';

/**
 * `info` is the raised fill — work happening, nothing to do about it.
 * `warn` is the live fill — the one bar that is also a button.
 */
export type UpdaterBannerTone = 'info' | 'warn';

export type UpdaterBannerModel = {
  tone: UpdaterBannerTone;
  text: string;
  /**
   * True only for `ready`. The bar is then the target itself: a separate
   * button inside it would push the bar past the 56px that a 623px panel can
   * spare, and Blocks C1's floor for a real target is 48px.
   */
  actionable: boolean;
};

const DOWNLOADING = 'Yangilanish yuklab olinmoqda…';

/**
 * What the banner shows, or null for "show nothing".
 *
 * Null in five of the eight states. That is the design, not an omission:
 * `disabled` has no updater, `idle` has no news, `checking` is a background
 * poll the operator never asked for, `error` is covered above, and
 * `installing` is owned by the full-bleed overlay.
 */
export function updaterBannerModel(state: UpdaterState): UpdaterBannerModel | null {
  switch (state.status) {
    case 'available':
      return { tone: 'info', text: DOWNLOADING, actionable: false };
    case 'downloading':
      return {
        tone: 'info',
        // `percent` is null until the first progress frame lands, and a bar
        // reading "… null%" would be worse than one reading nothing.
        text: state.percent === null ? DOWNLOADING : `${DOWNLOADING} ${state.percent}%`,
        actionable: false,
      };
    case 'ready':
      return {
        tone: 'warn',
        text: state.availableVersion
          ? `Yangi versiya ${state.availableVersion} tayyor. O'rnatish uchun bosing.`
          : "Yangi versiya tayyor. O'rnatish uchun bosing.",
        actionable: true,
      };
    default:
      return null;
  }
}

/** The one-line state shown in Sozlamalar, failures included. */
export function updaterSettingsLine(state: UpdaterState): string {
  const version = state.availableVersion ?? '';
  switch (state.status) {
    case 'disabled':
      return "Bu nusxa o'zini yangilamaydi.";
    case 'idle':
      return `Versiya ${state.currentVersion} — eng so'nggi versiya.`;
    case 'checking':
      return 'Tekshirilmoqda…';
    case 'available':
      return `Yangi versiya ${version} topildi. Yuklab olinmoqda…`;
    case 'downloading':
      return state.percent === null
        ? `Yangi versiya ${version} yuklab olinmoqda…`
        : `Yangi versiya ${version} yuklab olinmoqda… ${state.percent}%`;
    case 'ready':
      return `Yangi versiya ${version} tayyor.`;
    case 'installing':
      return "O'rnatilmoqda…";
    case 'error':
      return `Yangilanishni tekshirib bo'lmadi: ${state.errorMessage ?? "noma'lum xatolik"}`;
  }
}

export type UpdaterSettingsModel = {
  /** Render the whole group, or not at all. A build with no feed shows nothing. */
  visible: boolean;
  line: string;
  /**
   * Whether the line is worth the space. In `idle` and `checking` it only
   * restates the version number and the chip sitting directly above it, and a
   * 623px panel cannot afford a sentence that says nothing new.
   */
  showLine: boolean;
  /** Chip beside the version number: the state in one word. */
  stateWord: string;
  stateTone: 'live' | 'settled' | 'owed' | 'inert';
  checkLabel: string;
  checkDisabled: boolean;
  /** The install button appears only once the bits are on disk and verified. */
  canInstall: boolean;
};

const BUSY: UpdaterStatus[] = ['checking', 'available', 'downloading', 'installing'];

export function updaterSettingsModel(state: UpdaterState): UpdaterSettingsModel {
  const busy = BUSY.includes(state.status);
  return {
    visible: state.status !== 'disabled',
    line: updaterSettingsLine(state),
    showLine: state.availableVersion !== null || state.status === 'error',
    stateWord: settingsStateWord(state.status),
    stateTone: settingsStateTone(state.status),
    // `Qayta urinish` rather than `Tekshirish` after a failure, so the button
    // says what pressing it does about the sentence next to it.
    checkLabel: state.status === 'error' ? 'Qayta urinish' : 'Tekshirish',
    checkDisabled: busy,
    canInstall: state.status === 'ready',
  };
}

function settingsStateWord(status: UpdaterStatus): string {
  switch (status) {
    case 'idle':
      return 'Eng so\'nggi';
    case 'checking':
      return 'Tekshirilmoqda';
    case 'available':
    case 'downloading':
      return 'Yuklanmoqda';
    case 'ready':
      return 'Tayyor';
    case 'installing':
      return "O'rnatilmoqda";
    case 'error':
      return 'Xato';
    case 'disabled':
      return "O'chirilgan";
  }
}

function settingsStateTone(status: UpdaterStatus): 'live' | 'settled' | 'owed' | 'inert' {
  switch (status) {
    case 'idle':
      return 'settled';
    case 'ready':
      return 'live';
    case 'error':
      return 'owed';
    default:
      return 'inert';
  }
}

/**
 * The blocking screen shown while the server is torn down and the installer is
 * spawned.
 *
 * The ONLY copy. There was a second one in `src/main/updater/updater-messages.ts`
 * that nothing rendered, and the test pinning the recovery sentence guarded
 * that dead constant instead of this one — so the sentence the operator
 * actually reads was unprotected. Pinned here now, where it renders.
 *
 * The operator has to be told, before they lose the UI, that declining the
 * Windows permission dialog leaves the till closed and how to reopen it.
 */
export const INSTALLING_OVERLAY = {
  title: 'Yangilanmoqda',
  lines: [
    'Dasturni yopmang. Windows ruxsat so\'rasa, "Ha" ni bosing.',
    'Dastur o\'zi qayta ochiladi. Agar ochilmasa, ish stolidagi "Chayxana Master" yorlig\'ini ikki marta bosing.',
  ],
} as const;

/** How long `Keyinroq` holds the dialog back. The banner stays up throughout. */
export const SNOOZE_MS = 2 * 60 * 60 * 1000;
