import { create } from 'zustand';

import {
  DISABLED_STATE,
  fetchUpdaterState,
  requestUpdaterCheck,
  requestUpdaterInstall,
  subscribeUpdaterState,
  type UpdaterPrompt,
  type UpdaterState,
} from '@/lib/updater';
import { SNOOZE_MS } from '@/lib/updater-view';

type UpdaterStore = {
  state: UpdaterState;
  /**
   * The composed Uzbek prompt, including the open-order count. Only ever the
   * one that came back from the last `updater:get-state` — pushed frames never
   * carry it, because the count has to be true at the moment the operator
   * reads it, not at the moment the download finished.
   */
  prompt: UpdaterPrompt | null;
  promptOpen: boolean;
  /** Set by `Keyinroq`. In memory only — a restart re-asks, which is correct. */
  snoozedUntil: number | null;
  /**
   * The version the automatic dialog has already fired for, cleared by
   * `Keyinroq`. It exists only to stop repeated pushes reopening the dialog
   * inside one un-snoozed window — the delay itself is `snoozedUntil`. Leaving
   * it set across a dismissal turned "later" into a permanent "no".
   */
  autoPromptedFor: string | null;
  /** True between pressing confirm and the main process accepting. */
  installPending: boolean;
  /**
   * Set when the main process refuses an install the operator already agreed
   * to. Shown on the banner, because a dialog that simply vanishes reads as a
   * restart that is about to happen.
   */
  actionError: string | null;

  applyPushedState: (next: UpdaterState) => void;
  refresh: () => Promise<void>;
  check: () => Promise<void>;
  /** Manual route — the banner and the Sozlamalar button both land here. */
  openPrompt: () => Promise<void>;
  /** Automatic route — fires once per ready transition, honouring the snooze. */
  autoPrompt: () => Promise<void>;
  dismissPrompt: () => void;
  confirmInstall: () => Promise<void>;
};

/**
 * Why an install the operator agreed to did not start. Uzbek, and specific
 * enough to imply the next move without instructing.
 */
function installRefusalMessage(reason: string | undefined): string {
  if (reason === 'already-installing') return 'Yangilanish allaqachon boshlangan.';
  if (reason === 'disabled') return 'Bu build yangilanmaydi.';
  // 'not-ready' covers both a stale renderer and an installer that has been
  // deleted from the cache; in each case the download has to happen again.
  return "Yangilanish hozir tayyor emas. Fayl qaytadan yuklab olinadi.";
}

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  state: DISABLED_STATE,
  prompt: null,
  promptOpen: false,
  snoozedUntil: null,
  autoPromptedFor: null,
  installPending: false,
  actionError: null,

  applyPushedState: (next) =>
    set((prev) => ({
      state: next,
      // Nothing may leave `ready` except an accepted install, so this closes
      // the dialog exactly when the overlay is about to take the screen.
      promptOpen: next.status === 'ready' ? prev.promptOpen : false,
    })),

  refresh: async () => {
    const next = await fetchUpdaterState();
    set({ state: next, prompt: next.prompt });
  },

  check: async () => {
    const next = await requestUpdaterCheck();
    set({ state: next });
  },

  openPrompt: async () => {
    // Re-read rather than reuse: minutes can pass between the download
    // finishing and the operator noticing, and the whole value of the number
    // in the sentence is that it is true when they decide.
    const next = await fetchUpdaterState();
    set({
      state: next,
      prompt: next.prompt,
      promptOpen: next.status === 'ready' && next.prompt !== null,
    });
  },

  autoPrompt: async () => {
    const { state, snoozedUntil, promptOpen, autoPromptedFor } = get();
    if (state.status !== 'ready') return;
    if (promptOpen) return;
    if (snoozedUntil !== null && Date.now() < snoozedUntil) return;
    const key = state.availableVersion ?? 'ready';
    if (autoPromptedFor === key) return;
    set({ autoPromptedFor: key });
    await get().openPrompt();
  },

  dismissPrompt: () =>
    set({
      promptOpen: false,
      // The banner stays up throughout the snooze, so the route back is always
      // one tap and never depends on hover.
      snoozedUntil: Date.now() + SNOOZE_MS,
      // Cleared, or the snooze never ends: `autoPrompt` returns early forever
      // on a version it has already shown, and the timer that fires when the
      // snooze expires becomes dead code. `Keyinroq` means later, not no.
      autoPromptedFor: null,
    }),

  confirmInstall: async () => {
    if (get().installPending) return;
    set({ installPending: true });
    try {
      const result = await requestUpdaterInstall();
      if (!result.started) {
        // The main process refused — stale state on this side. Close the
        // dialog, take whatever it says now, and SAY SO: the operator has just
        // pressed the most consequential button the till offers, and a dialog
        // that disappears in silence reads as "the restart is coming".
        set({ promptOpen: false, actionError: installRefusalMessage(result.reason) });
        await get().refresh();
      } else {
        set({ actionError: null });
      }
    } finally {
      set({ installPending: false });
    }
  },
}));

/**
 * One subscription for the whole app, at module scope — the same shape as
 * `auth.store.ts`'s boot-time hydration.
 *
 * This is the app's first main→renderer push channel. Subscribing per
 * component would leak one `ipcRenderer` listener per mount, so no component
 * calls `subscribeUpdaterState` directly; a second call site is a bug.
 *
 * Both calls are inert without a preload: `subscribeUpdaterState` returns a
 * noop and `refresh` resolves to `DISABLED_STATE`, which is why the gallery
 * and the browser-run renderer show no update UI instead of crashing.
 */
subscribeUpdaterState((next) => {
  useUpdaterStore.getState().applyPushedState(next);
});

void useUpdaterStore.getState().refresh();
