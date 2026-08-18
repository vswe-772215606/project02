/**
 * The updater's wire contract. Types only — imported by preload.ts, by the
 * service, and by the pure reducer. The renderer restates these in
 * `src/renderer/lib/updater.ts` because tsconfig.renderer.json pins rootDir to
 * src/renderer (same reason `save-pdf.ts` restates SavePdfResult). If you
 * change anything here, change that file in the same edit.
 */

export type UpdaterStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

/**
 * Composed in the main process from a freshly-read open-order count, so the
 * count itself never crosses the bridge. Non-null ONLY on a reply to
 * `updater:get-state`, and ONLY when status === 'ready'.
 */
export type UpdaterPrompt = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
};

export type UpdaterState = {
  status: UpdaterStatus;
  /** app.getVersion(). Always present, never changes within a session. */
  currentVersion: string;
  /** From the feed. Non-null from 'available' onward; null in idle/checking/disabled. */
  availableVersion: string | null;
  /** Integer 0..100. Non-null only while status === 'downloading'. */
  percent: number | null;
  /** Uzbek, operator-facing. Non-null only when status === 'error'. */
  errorMessage: string | null;
  /** epoch ms of the last COMPLETED check (success or failure). Never decreases. */
  lastCheckedAt: number | null;
  /** See UpdaterPrompt. Always null on pushed frames. */
  prompt: UpdaterPrompt | null;
};

export type UpdaterInstallResult =
  | { started: true }
  | { started: false; reason: 'not-ready' | 'already-installing' | 'disabled' };

/** Channel names, so main and preload cannot drift. */
export const UPDATER_CHANNELS = {
  getState: 'updater:get-state',
  checkNow: 'updater:check-now',
  installNow: 'updater:install-now',
  /** main → renderer push. */
  state: 'updater:state',
} as const;
