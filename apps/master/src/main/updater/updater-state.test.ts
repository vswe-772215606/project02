import { describe, expect, it } from 'vitest';

import type { UpdaterState, UpdaterStatus } from './updater-contract';
import {
  initialUpdaterState,
  reduce,
  UPDATER_EVENT_KINDS,
  type UpdaterEvent,
  type UpdaterEventKind,
} from './updater-state';

function state(status: UpdaterStatus, overrides: Partial<UpdaterState> = {}): UpdaterState {
  return {
    status,
    currentVersion: '0.1.3',
    availableVersion: null,
    percent: null,
    errorMessage: null,
    lastCheckedAt: null,
    prompt: null,
    ...overrides,
  };
}

const SAMPLE_EVENTS: Record<UpdaterEventKind, UpdaterEvent> = {
  'check-started': { kind: 'check-started' },
  'update-available': { kind: 'update-available', version: '0.1.4' },
  'update-not-available': { kind: 'update-not-available', at: 1_700_000_000_000 },
  'download-progress': { kind: 'download-progress', percent: 50 },
  'update-downloaded': { kind: 'update-downloaded', version: '0.1.4' },
  'install-requested': { kind: 'install-requested' },
  error: { kind: 'error', message: "Internet aloqasi yo'q.", at: 1_700_000_000_000 },
};

describe('invariant 1 — disabled is absorbing', () => {
  it('ignores update-available and keeps availableVersion empty', () => {
    const next = reduce(state('disabled'), { kind: 'update-available', version: '0.1.4' });
    expect(next.status).toBe('disabled');
    expect(next.availableVersion).toBeNull();
  });

  it('ignores every event kind', () => {
    for (const kind of UPDATER_EVENT_KINDS) {
      const next = reduce(state('disabled'), SAMPLE_EVENTS[kind]);
      expect(next.status, `event ${kind} escaped disabled`).toBe('disabled');
    }
  });
});

describe('invariant 2 — installing is absorbing', () => {
  it('does not un-blank the overlay on a late error', () => {
    const next = reduce(state('installing', { availableVersion: '0.1.4' }), {
      kind: 'error',
      message: 'boom',
      at: 5,
    });
    expect(next.status).toBe('installing');
    expect(next.errorMessage).toBeNull();
  });

  it('ignores update-available', () => {
    const next = reduce(state('installing'), { kind: 'update-available', version: '0.1.5' });
    expect(next.status).toBe('installing');
  });
});

describe('invariant 3 — ready keeps the operator its button', () => {
  it('survives an error without losing the downloaded version', () => {
    const next = reduce(state('ready', { availableVersion: '0.1.4' }), {
      kind: 'error',
      message: 'boom',
      at: 5,
    });
    expect(next.status).toBe('ready');
    expect(next.availableVersion).toBe('0.1.4');
  });

  it('survives a later feed rollback reporting no update', () => {
    const next = reduce(state('ready', { availableVersion: '0.1.4' }), {
      kind: 'update-not-available',
      at: 9,
    });
    expect(next.status).toBe('ready');
    expect(next.availableVersion).toBe('0.1.4');
  });

  it('advances only on install-requested', () => {
    const next = reduce(state('ready', { availableVersion: '0.1.4', percent: 100 }), {
      kind: 'install-requested',
    });
    expect(next.status).toBe('installing');
    expect(next.percent).toBeNull();
  });
});

describe('the ordinary path', () => {
  it('idle → checking on check-started', () => {
    expect(reduce(state('idle'), { kind: 'check-started' }).status).toBe('checking');
  });

  it('checking → idle on update-not-available, clearing the version and stamping the clock', () => {
    const next = reduce(state('checking', { availableVersion: '0.1.4' }), {
      kind: 'update-not-available',
      at: 4_242,
    });
    expect(next.status).toBe('idle');
    expect(next.availableVersion).toBeNull();
    expect(next.lastCheckedAt).toBe(4_242);
  });

  it('checking → available on update-available', () => {
    const next = reduce(state('checking'), { kind: 'update-available', version: '0.1.4' });
    expect(next.status).toBe('available');
    expect(next.availableVersion).toBe('0.1.4');
    expect(next.percent).toBeNull();
  });

  it('available → downloading, rounding the percent to an integer', () => {
    const next = reduce(state('available', { availableVersion: '0.1.4' }), {
      kind: 'download-progress',
      percent: 42.6,
    });
    expect(next.status).toBe('downloading');
    expect(next.percent).toBe(43);
  });

  it('clamps the percent at both ends', () => {
    const high = reduce(state('downloading', { percent: 90 }), {
      kind: 'download-progress',
      percent: 130,
    });
    const low = reduce(state('downloading', { percent: 90 }), {
      kind: 'download-progress',
      percent: -5,
    });
    expect(high.percent).toBe(100);
    expect(low.percent).toBe(0);
  });

  it('downloading → ready on update-downloaded', () => {
    const next = reduce(state('downloading', { percent: 99, availableVersion: '0.1.4' }), {
      kind: 'update-downloaded',
      version: '0.1.4',
    });
    expect(next.status).toBe('ready');
    expect(next.percent).toBeNull();
    expect(next.availableVersion).toBe('0.1.4');
  });

  it('error → checking on a retry, clearing the message', () => {
    const next = reduce(state('error', { errorMessage: "Internet aloqasi yo'q." }), {
      kind: 'check-started',
    });
    expect(next.status).toBe('checking');
    expect(next.errorMessage).toBeNull();
  });

  it('never lets lastCheckedAt go backwards', () => {
    const next = reduce(state('idle', { lastCheckedAt: 1_000 }), {
      kind: 'update-not-available',
      at: 500,
    });
    expect(next.lastCheckedAt).toBe(1_000);
  });
});

describe('invariant 4 — the reducer never composes a prompt', () => {
  it('keeps prompt null and currentVersion fixed across a full happy path', () => {
    const sequence: UpdaterEvent[] = [
      { kind: 'check-started' },
      { kind: 'update-available', version: '0.1.4' },
      { kind: 'download-progress', percent: 10 },
      { kind: 'download-progress', percent: 55 },
      { kind: 'download-progress', percent: 99 },
      { kind: 'update-downloaded', version: '0.1.4' },
      { kind: 'install-requested' },
    ];

    let current = state('idle');
    for (const event of sequence) {
      current = reduce(current, event);
      expect(current.prompt, `prompt leaked after ${event.kind}`).toBeNull();
      expect(current.currentVersion, `currentVersion moved after ${event.kind}`).toBe('0.1.3');
    }
    expect(current.status).toBe('installing');
  });
});

describe('a newer version appearing while one is already downloaded', () => {
  // The critical review's scenario. electron-updater deletes the pending
  // installer the moment a newer version starts downloading, so 'ready' must
  // not keep claiming a version it can no longer install.
  function readyAt(version: string): UpdaterState {
    return reduce(
      reduce(initialUpdaterState('0.1.3', true), { kind: 'update-available', version }),
      { kind: 'update-downloaded', version },
    );
  }

  it('keeps advertising the version that is actually on disk, not the newer one', () => {
    const ready = readyAt('0.1.4');
    const next = reduce(ready, { kind: 'update-available', version: '0.1.5' });

    expect(next.status).toBe('ready');
    // 0.1.5 is not downloaded. Adopting its number here is what made the
    // banner offer an installer that had already been deleted.
    expect(next.availableVersion).toBe('0.1.4');
  });

  it('leaves ready as soon as the newer version actually starts downloading', () => {
    const ready = readyAt('0.1.4');
    const downloading = reduce(
      reduce(ready, { kind: 'update-available', version: '0.1.5' }),
      { kind: 'download-progress', percent: 3 },
    );

    // A progress event proves the cache has been wiped: nothing is installable
    // until the new download finishes.
    expect(downloading.status).toBe('downloading');
    expect(downloading.percent).toBe(3);
  });

  it('returns to ready on the newer version once it is downloaded', () => {
    const ready = readyAt('0.1.4');
    const next = reduce(
      reduce(
        reduce(ready, { kind: 'update-available', version: '0.1.5' }),
        { kind: 'download-progress', percent: 100 },
      ),
      { kind: 'update-downloaded', version: '0.1.5' },
    );

    expect(next.status).toBe('ready');
    expect(next.availableVersion).toBe('0.1.5');
  });
});
