/**
 * The updater's state machine, as a pure reducer.
 *
 * Deliberately free of `electron`, `electron-updater` and `fs` so it can be
 * unit-tested without a packaged app — everything impure lives in
 * `updater-service.ts`, which owns the only calls into electron-updater and
 * feeds this module plain events.
 *
 * Four invariants hold for every input, and each is pinned by a test in
 * `updater-state.test.ts`:
 *
 *   1. `disabled` is absorbing. A build with no feed can never start talking
 *      to a feed, whatever arrives.
 *   2. `installing` is absorbing. Once the teardown is scheduled there is no
 *      way back — a late network error must not un-blank the blocking overlay
 *      while sockets are already closing.
 *   3. `ready` only advances on `install-requested`. The bits are on disk and
 *      already SHA-512 verified; nothing that happens on the network
 *      afterwards may take the "O'rnatish" button away from the operator.
 *   4. `prompt` is always null here. It is attached exclusively by the
 *      `updater:get-state` handler, which re-reads the open-order count so the
 *      sentence is true at the moment the operator reads it.
 */

import type { UpdaterState, UpdaterStatus } from './updater-contract';

export type UpdaterEvent =
  | { kind: 'check-started' }
  | { kind: 'update-available'; version: string }
  | { kind: 'update-not-available'; at: number }
  | { kind: 'download-progress'; percent: number }
  | { kind: 'update-downloaded'; version: string }
  | { kind: 'install-requested' }
  | { kind: 'error'; message: string; at: number };

export type UpdaterEventKind = UpdaterEvent['kind'];

export const UPDATER_EVENT_KINDS: readonly UpdaterEventKind[] = [
  'check-started',
  'update-available',
  'update-not-available',
  'download-progress',
  'update-downloaded',
  'install-requested',
  'error',
];

/**
 * The transition table from the spec, written out per source state rather than
 * collapsed into a default, because the interesting rows are the ones that
 * refuse to move.
 */
const TRANSITIONS: Record<UpdaterStatus, Record<UpdaterEventKind, UpdaterStatus>> = {
  disabled: {
    'check-started': 'disabled',
    'update-available': 'disabled',
    'update-not-available': 'disabled',
    'download-progress': 'disabled',
    'update-downloaded': 'disabled',
    'install-requested': 'disabled',
    error: 'disabled',
  },
  idle: {
    'check-started': 'checking',
    'update-available': 'available',
    'update-not-available': 'idle',
    'download-progress': 'downloading',
    'update-downloaded': 'ready',
    'install-requested': 'idle',
    error: 'error',
  },
  checking: {
    'check-started': 'checking',
    'update-available': 'available',
    'update-not-available': 'idle',
    'download-progress': 'downloading',
    'update-downloaded': 'ready',
    'install-requested': 'checking',
    error: 'error',
  },
  available: {
    'check-started': 'available',
    'update-available': 'available',
    'update-not-available': 'available',
    'download-progress': 'downloading',
    'update-downloaded': 'ready',
    'install-requested': 'available',
    error: 'error',
  },
  downloading: {
    'check-started': 'downloading',
    'update-available': 'downloading',
    'update-not-available': 'downloading',
    'download-progress': 'downloading',
    'update-downloaded': 'ready',
    'install-requested': 'downloading',
    error: 'error',
  },
  ready: {
    'check-started': 'ready',
    'update-available': 'ready',
    'update-not-available': 'ready',
    // NOT 'ready'. A progress event while an installer is already downloaded
    // means a NEWER version has started downloading, and electron-updater
    // wipes the pending cache the moment it does
    // (DownloadedUpdateHelper.js:110-115). Staying 'ready' would leave the
    // banner offering an installer that has just been deleted.
    'download-progress': 'downloading',
    'update-downloaded': 'ready',
    'install-requested': 'installing',
    error: 'ready',
  },
  installing: {
    'check-started': 'installing',
    'update-available': 'installing',
    'update-not-available': 'installing',
    'download-progress': 'installing',
    'update-downloaded': 'installing',
    'install-requested': 'installing',
    error: 'installing',
  },
  error: {
    'check-started': 'checking',
    'update-available': 'available',
    'update-not-available': 'idle',
    'download-progress': 'downloading',
    'update-downloaded': 'ready',
    'install-requested': 'error',
    error: 'error',
  },
};

/** States in which the feed's version is meaningless and must be forgotten. */
const VERSIONLESS: readonly UpdaterStatus[] = ['disabled', 'idle', 'checking'];

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function initialUpdaterState(currentVersion: string, enabled: boolean): UpdaterState {
  return {
    status: enabled ? 'idle' : 'disabled',
    currentVersion,
    availableVersion: null,
    percent: null,
    errorMessage: null,
    lastCheckedAt: null,
    prompt: null,
  };
}

export function reduce(state: UpdaterState, event: UpdaterEvent): UpdaterState {
  // Invariants 1 and 2: both absorbing states are identity, not merely
  // status-preserving — nothing about them may drift either.
  if (state.status === 'disabled' || state.status === 'installing') {
    return state;
  }

  const status = TRANSITIONS[state.status][event.kind];

  const availableVersion = VERSIONLESS.includes(status)
    ? null
    : // Learning that a newer version EXISTS does not make it installable, and
      // only 'update-downloaded' proves an installer is on disk. Adopting the
      // number here would make the banner advertise a version that cannot be
      // installed for as long as it takes to fetch — ten minutes or more on a
      // chayxana connection.
      state.status === 'ready' && event.kind === 'update-available'
      ? state.availableVersion
      : event.kind === 'update-available' || event.kind === 'update-downloaded'
        ? event.version
        : state.availableVersion;

  const percent =
    status === 'downloading'
      ? event.kind === 'download-progress'
        ? clampPercent(event.percent)
        : state.percent
      : null;

  const errorMessage =
    status === 'error' ? (event.kind === 'error' ? event.message : state.errorMessage) : null;

  // A check that finished — either way — stamps the clock, and the clock only
  // ever moves forward, so an out-of-order callback cannot rewind it.
  const completedAt =
    event.kind === 'update-not-available' || event.kind === 'error' ? event.at : null;
  const lastCheckedAt =
    completedAt === null ? state.lastCheckedAt : Math.max(state.lastCheckedAt ?? 0, completedAt);

  return {
    status,
    currentVersion: state.currentVersion,
    availableVersion,
    percent,
    errorMessage,
    lastCheckedAt,
    // Invariant 4.
    prompt: null,
  };
}
