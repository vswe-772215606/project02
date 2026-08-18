/**
 * Everything impure about the updater: electron-updater itself, feed
 * resolution, the check schedule, the push channel and the install trigger.
 * The state machine and every Uzbek sentence live in the two pure modules
 * beside this one, so the parts worth testing are testable.
 *
 * Shape of the thing:
 *   - `index.ts` owns the three `ipcMain.handle` registrations and calls the
 *     four exported entry points below. They are safe to call before
 *     `initUpdater` has run (and before it has decided whether this build
 *     updates at all) — a renderer that mounts early gets `disabled`, not a
 *     rejected invoke.
 *   - `initUpdater` is fired with `void` from `app.whenReady`, never from
 *     `runStartup`: a failure there is fatal and would close the POS over a
 *     DNS blip.
 */

import { existsSync } from 'node:fs';
import { app, type BrowserWindow } from 'electron';
import type { AppUpdater } from 'electron-updater';
import { APP_IDENTITY } from '../app-identity';
import { formatErrorForLog, type StartupLogger } from '../startup-log';
import { delay, shutdownForUpdate } from '../shutdown';
import { buildReadyPrompt, updaterErrorMessage } from './updater-messages';
import { initialUpdaterState, reduce, type UpdaterEvent } from './updater-state';
import { UPDATER_CHANNELS, type UpdaterInstallResult, type UpdaterState } from './updater-contract';

const FIRST_CHECK_DELAY_MS = 90_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** One paint, so the blocking overlay is on screen before the server dies. */
const PRE_TEARDOWN_PAINT_MS = 250;
/**
 * How long to wait for `quitAndInstall` to actually end this process before
 * concluding it never will. `install()` returns false WITHOUT calling
 * app.quit() when the cached installer has gone (BaseUpdater.js:47-53), and it
 * reports that asynchronously, so the only reliable signal that the install
 * did not take is that we are still alive. Generous, because a slow machine
 * spawning an elevated installer is normal.
 */
const INSTALL_WATCHDOG_MS = 20_000;

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '::1', '[::1]'];

/**
 * Module scope on purpose, and `app.getVersion()` is the only Electron call in
 * this file that may run at import time. Imports are hoisted above
 * `app.setName()` in index.ts, so anything here that touched `userData` would
 * resolve against the wrong directory — which is the database. The version
 * comes from package.json and is independent of the app name.
 */
let state: UpdaterState = initialUpdaterState(app.getVersion(), false);
let logger: StartupLogger | null = null;
let getWindow: () => BrowserWindow | null = () => null;
let updater: AppUpdater | null = null;
let enabled = false;
let initCalled = false;
let installStarted = false;
/**
 * Absolute path of the installer `update-downloaded` handed us, or null if we
 * never saw one. Checked immediately before teardown — see `installerMissing`.
 */
let downloadedInstallerPath: string | null = null;
let firstCheckTimer: NodeJS.Timeout | null = null;
let checkInterval: NodeJS.Timeout | null = null;
/**
 * The count the operator actually read, remembered from the last
 * `updater:get-state` that composed a prompt. Logged on accept so the record
 * says what they were told, not what a second query happened to return.
 */
let lastPromptOpenOrders: number | null = null;

function log(level: 'info' | 'error', message: string): void {
  logger?.[level](message);
}

/** Pushed frames never carry a prompt — see the contract. */
function frame(): UpdaterState {
  return { ...state, prompt: null };
}

function sameFrame(a: UpdaterState, b: UpdaterState): boolean {
  return (
    a.status === b.status &&
    a.availableVersion === b.availableVersion &&
    a.percent === b.percent &&
    a.errorMessage === b.errorMessage &&
    a.lastCheckedAt === b.lastCheckedAt
  );
}

function pushFrame(): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(UPDATER_CHANNELS.state, frame());
}

function dispatch(event: UpdaterEvent): void {
  const next = reduce(state, event);
  const changed = !sameFrame(state, next);
  state = next;
  // download-progress fires many times a second; only a changed integer
  // percent is worth a frame across the bridge.
  if (!changed) return;
  pushFrame();
}

async function readOpenOrders(): Promise<number | null> {
  try {
    // Same module singleton the server uses (`getPrisma()`), same connection.
    // Precedent: pdf-report.ts and sqlite-bootstrap.ts both reach into the
    // server layer from the main process. Not over HTTP — every order route is
    // behind requireAuth and the main process holds no session token; minting
    // one for the updater would be a permanent back door.
    const { orderRepo } = await import('../server/repositories/order.repo');
    return await orderRepo.countOpen();
  } catch (error) {
    log('error', `[updater] open-order count failed: ${formatErrorForLog(error)}`);
    return null;
  }
}

function resolveFeedUrl(baked: string): { url: string; source: 'env' | 'identity' } {
  // Rule 1: the override is production-only. `next` never reaches this
  // function (its updateFeedUrl is null and initUpdater returns first), and
  // this check makes that structural rather than incidental.
  if (APP_IDENTITY.variant !== 'production') {
    return { url: baked, source: 'identity' };
  }

  const raw = process.env.CHAYXANA_UPDATE_FEED_URL;
  if (!raw) {
    return { url: baked, source: 'identity' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    log('error', `[updater] ignoring CHAYXANA_UPDATE_FEED_URL: not a URL (${raw})`);
    return { url: baked, source: 'identity' };
  }

  // Rule 2: https anywhere, plain http only on the loopback. A staging feed on
  // 127.0.0.1 is the only way to exercise electron-updater at all; a plain-http
  // feed on a real host is a way to install someone else's binary.
  const allowed =
    parsed.protocol === 'https:' ||
    (parsed.protocol === 'http:' && LOCAL_HOSTNAMES.includes(parsed.hostname));
  if (!allowed) {
    log('error', `[updater] ignoring CHAYXANA_UPDATE_FEED_URL: not https and not loopback (${raw})`);
    return { url: baked, source: 'identity' };
  }

  return { url: raw, source: 'env' };
}

function clearTimers(): void {
  if (firstCheckTimer) {
    clearTimeout(firstCheckTimer);
    firstCheckTimer = null;
  }
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

async function runCheck(reason: string): Promise<void> {
  if (!enabled || !updater) return;
  log('info', `[updater] check start reason=${reason}`);
  try {
    // Idempotent: checkForUpdates() hands back the in-flight promise when one
    // exists, so a manual check during the scheduled one is free.
    const result = await updater.checkForUpdates();
    const version = result?.updateInfo?.version;
    if (version && version !== state.currentVersion) {
      log('info', `[updater] available v=${version}`);
    } else {
      log('info', `[updater] up to date current=${state.currentVersion}`);
    }
  } catch (error) {
    // No retry loop — a failure waits for the next tick. GenericProvider
    // already retries three times on a refused connection.
    log('error', `[updater] check failed: ${formatErrorForLog(error)}`);
  }
}

const noopLogger: StartupLogger = {
  path: '',
  info() {},
  error() {},
};

/**
 * True when we know the installer is gone. A null path means we never got one
 * from `update-downloaded`, which is itself a reason not to tear the server
 * down: nothing has been verified as installable.
 */
function installerMissing(): boolean {
  if (downloadedInstallerPath === null) return true;
  try {
    return !existsSync(downloadedInstallerPath);
  } catch {
    // A stat that throws is not proof the file is gone; do not strand the till
    // on a permissions blip.
    return false;
  }
}

async function performInstall(): Promise<void> {
  clearTimers();
  await delay(PRE_TEARDOWN_PAINT_MS);

  try {
    await shutdownForUpdate(logger ?? noopLogger);
  } catch (error) {
    log('error', `[updater] teardown threw: ${formatErrorForLog(error)}`);
  }
  log('info', '[updater] teardown complete');

  // Armed BEFORE the call, because the failure we are guarding against is
  // `install()` returning false without ever calling app.quit(): there is no
  // callback and no throw, so being alive later is the only signal. The server
  // is already down by this point, so the safe landing is a relaunch — the
  // till comes back on the version it was already running, with a working
  // server, instead of sitting behind a "do not close" overlay that no longer
  // means anything. Recovery otherwise needs Task Manager: the single-instance
  // lock is still held, so the shortcut only refocuses the dead window.
  const watchdog = setTimeout(() => {
    log('error', '[updater] quitAndInstall did not quit; relaunching to restore service');
    try {
      app.relaunch();
    } catch (error) {
      log('error', `[updater] relaunch failed: ${formatErrorForLog(error)}`);
    }
    app.exit(0);
  }, INSTALL_WATCHDOG_MS);
  watchdog.unref?.();

  try {
    // (isSilent, isForceRunAfter). isForceRunAfter is honoured ONLY together
    // with isSilent — non-silent leaves a Finish page with a pre-checked run
    // box that somebody has to click, i.e. a till that never comes back during
    // service.
    updater?.quitAndInstall(true, true);
  } catch (error) {
    log('error', `[updater] quitAndInstall failed: ${formatErrorForLog(error)}`);
    clearTimeout(watchdog);
    log('error', '[updater] relaunching to restore service');
    try {
      app.relaunch();
    } catch (relaunchError) {
      log('error', `[updater] relaunch failed: ${formatErrorForLog(relaunchError)}`);
    }
    app.exit(0);
  }
}

/* ── entry points called by index.ts's ipcMain.handle registrations ──────── */

/**
 * The only channel that ever returns a non-null prompt, and it recomputes the
 * open-order count on every call: minutes can pass between "downloaded" and
 * the operator noticing, and the whole point of the number is that it is true
 * when they read it.
 */
export async function getUpdaterState(): Promise<UpdaterState> {
  if (state.status !== 'ready') {
    return frame();
  }

  const openOrders = await readOpenOrders();
  lastPromptOpenOrders = openOrders;
  return {
    ...state,
    prompt: buildReadyPrompt({
      version: state.availableVersion ?? state.currentVersion,
      openOrders,
    }),
  };
}

/** Kicks a check off and returns immediately; progress arrives on the push channel. */
export function requestUpdaterCheck(): UpdaterState {
  if (!enabled) return frame();
  dispatch({ kind: 'check-started' });
  void runCheck('manual');
  return frame();
}

export async function requestUpdaterInstall(): Promise<UpdaterInstallResult> {
  if (!enabled || !updater) {
    return { started: false, reason: 'disabled' };
  }
  if (state.status === 'installing' || installStarted) {
    return { started: false, reason: 'already-installing' };
  }
  if (state.status !== 'ready') {
    return { started: false, reason: 'not-ready' };
  }
  // The install is refused here, BEFORE anything is torn down, when the
  // installer is not on disk any more. electron-updater wipes the pending
  // cache the moment a newer version starts downloading
  // (DownloadedUpdateHelper.js:110-115), so a till that sat on 'ready' while
  // 0.1.5 was published and then lost its connection mid-download is left
  // advertising an installer that no longer exists. Tearing the LAN server
  // down for that would strand the chayxana with no route back.
  if (installerMissing()) {
    log('error', `[updater] install refused: installer gone path=${downloadedInstallerPath ?? 'unknown'}`);
    downloadedInstallerPath = null;
    dispatch({
      kind: 'error',
      message: updaterErrorMessage({ code: 'ERR_UPDATER_INSTALLER_MISSING' }),
      at: Date.now(),
    });
    void runCheck('installer-missing');
    return { started: false, reason: 'not-ready' };
  }

  const version = state.availableVersion ?? state.currentVersion;
  installStarted = true;
  dispatch({ kind: 'install-requested' });
  log(
    'info',
    `[updater] install accepted version=${version} openOrdersAtPrompt=${
      lastPromptOpenOrders === null ? 'unknown' : String(lastPromptOpenOrders)
    }`,
  );

  // Return first, tear down after: the renderer needs the frame that raises
  // the blocking overlay before the server it is talking to goes away.
  setImmediate(() => {
    void performInstall();
  });

  return { started: true };
}

/* ── init ───────────────────────────────────────────────────────────────── */

export async function initUpdater(options: {
  logger: StartupLogger;
  getWindow: () => BrowserWindow | null;
}): Promise<void> {
  if (initCalled) return;
  initCalled = true;

  logger = options.logger;
  // A closure, not the window itself: `mainWindow` is module scope in index.ts
  // and is replaced when the window is recreated on `activate`.
  getWindow = options.getWindow;

  // `app.isPackaged` is the reliable signal here — electron-vite does not
  // always inject NODE_ENV, and index.ts uses the same idiom. An unpackaged run
  // stays fully disabled; `forceDevUpdateConfig` is deliberately never set,
  // because the only thing it could point a dev run at is the production feed.
  if (!app.isPackaged) {
    log('info', '[updater] disabled: not packaged');
    return;
  }
  if (APP_IDENTITY.updateFeedUrl === null) {
    log('info', `[updater] disabled: variant=${APP_IDENTITY.variant} has no feed`);
    return;
  }

  const { url, source } = resolveFeedUrl(APP_IDENTITY.updateFeedUrl);
  log('info', `[updater] feed=${url} source=${source} variant=${APP_IDENTITY.variant}`);

  const { autoUpdater } = await import('electron-updater');
  updater = autoUpdater;

  autoUpdater.logger = {
    info: (message?: unknown) => log('info', `[electron-updater] ${formatErrorForLog(message)}`),
    warn: (message?: unknown) => log('error', `[electron-updater] ${formatErrorForLog(message)}`),
    error: (message?: unknown) => log('error', `[electron-updater] ${formatErrorForLog(message)}`),
    debug: (message: string) => log('info', `[electron-updater] ${message}`),
  };

  // Not hygiene: AppUpdater extends EventEmitter, and Node throws on an
  // 'error' emission with no listener. This process is the LAN server every
  // waiter device talks to.
  autoUpdater.on('error', (error) => {
    log('error', `[updater] error: ${formatErrorForLog(error)}`);
    dispatch({ kind: 'error', message: updaterErrorMessage(error), at: Date.now() });
  });

  autoUpdater.on('checking-for-update', () => {
    dispatch({ kind: 'check-started' });
  });
  autoUpdater.on('update-available', (info) => {
    dispatch({ kind: 'update-available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    dispatch({ kind: 'update-not-available', at: Date.now() });
  });
  autoUpdater.on('download-progress', (progress) => {
    dispatch({ kind: 'download-progress', percent: progress.percent });
  });
  autoUpdater.on('update-downloaded', (info) => {
    // Keep the path: it is the only way to tell later whether the installer we
    // are about to restart for still exists. electron-updater deletes it
    // without telling us when a NEWER version starts downloading.
    downloadedInstallerPath = info.downloadedFile ?? null;
    log('info', `[updater] downloaded v=${info.version} file=${downloadedInstallerPath ?? 'unknown'}`);
    dispatch({ kind: 'update-downloaded', version: info.version });
  });

  // The operator's decision is "may the till go down for two minutes", not
  // "may we use bandwidth" — so download in the background and ask only about
  // restarting.
  autoUpdater.autoDownload = true;
  // Default is TRUE. Left alone, a downloaded update installs on the next
  // ordinary quit — which is exactly the "silent, whenever" behaviour this
  // design rejected, and it would install with orders open.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  // NEVER assign `autoUpdater.channel` or `allowDowngrade` here. The channel
  // setter also sets allowDowngrade = true, so the harmless-looking
  // `channel = 'latest'` would let a rolled-back feed downgrade a till onto an
  // older schema. The channel belongs in build.publish, where it already
  // defaults to latest.
  autoUpdater.setFeedURL({ provider: 'generic', url });

  enabled = true;
  state = initialUpdaterState(state.currentVersion, true);
  // A renderer that mounted while this was still deciding asked once and was
  // told `disabled`; tell it the truth now rather than waiting for a check.
  pushFrame();

  // Not at startup: the first check must not compete with the port bind and
  // the first paint.
  firstCheckTimer = setTimeout(() => {
    firstCheckTimer = null;
    void runCheck('startup');
  }, FIRST_CHECK_DELAY_MS);
  checkInterval = setInterval(() => {
    void runCheck('interval');
  }, CHECK_INTERVAL_MS);

  log('info', `[updater] enabled currentVersion=${state.currentVersion}`);
}
