/**
 * The renderer's half of the updater bridge.
 *
 * The types below are restated from `src/main/updater/updater-contract.ts`
 * rather than imported: `tsconfig.renderer.json` pins `rootDir` to
 * `src/renderer`, so nothing under `src/main` is reachable from here. This is
 * the same arrangement `save-pdf.ts` uses for `SavePdfResult`. **If the
 * contract changes, change this file in the same edit.**
 *
 * Every function here works when `window.chayxana` is absent. The gallery
 * (`pnpm gallery:page`) and the browser-run renderer have no preload at all,
 * and they must render no update UI whatsoever rather than crash — which is
 * what the `disabled` status is for.
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

type ChayxanaUpdaterBridge = {
  getState: () => Promise<UpdaterState>;
  checkNow: () => Promise<UpdaterState>;
  installNow: () => Promise<UpdaterInstallResult>;
  onState: (listener: (state: UpdaterState) => void) => () => void;
};

/**
 * What the renderer shows when there is no bridge: nothing at all. Frozen so a
 * consumer cannot mutate the shared instance into a visible state.
 */
export const DISABLED_STATE: UpdaterState = Object.freeze({
  status: 'disabled',
  currentVersion: '',
  availableVersion: null,
  percent: null,
  errorMessage: null,
  lastCheckedAt: null,
  prompt: null,
});

function getUpdaterBridge(): ChayxanaUpdaterBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { chayxana?: { updater?: ChayxanaUpdaterBridge } };
  return w.chayxana?.updater ?? null;
}

/**
 * A rejected invoke must degrade to `disabled`, not to an unhandled rejection.
 * The main process registers its handlers at module scope precisely so this
 * cannot normally happen, but an older shell running a newer renderer would
 * have no handler at all — and an updater that crashes the till it was meant
 * to maintain is worse than no updater.
 */
async function safely(call: () => Promise<UpdaterState>): Promise<UpdaterState> {
  try {
    return await call();
  } catch {
    return DISABLED_STATE;
  }
}

export async function fetchUpdaterState(): Promise<UpdaterState> {
  const bridge = getUpdaterBridge();
  if (!bridge) return DISABLED_STATE;
  return safely(() => bridge.getState());
}

export async function requestUpdaterCheck(): Promise<UpdaterState> {
  const bridge = getUpdaterBridge();
  if (!bridge) return DISABLED_STATE;
  return safely(() => bridge.checkNow());
}

export async function requestUpdaterInstall(): Promise<UpdaterInstallResult> {
  const bridge = getUpdaterBridge();
  if (!bridge) return { started: false, reason: 'disabled' };
  try {
    return await bridge.installNow();
  } catch {
    return { started: false, reason: 'disabled' };
  }
}

/**
 * Subscribe to pushed state. Returns an unsubscribe.
 *
 * Call this from exactly one place — `stores/updater.store.ts` — and never
 * from a component. `ipcRenderer.on` is the first main→renderer push channel
 * in this app, and a per-component subscription accumulates one listener per
 * mount until Electron starts warning at ten.
 */
export function subscribeUpdaterState(listener: (state: UpdaterState) => void): () => void {
  const bridge = getUpdaterBridge();
  if (!bridge) return () => {};
  return bridge.onState(listener);
}
