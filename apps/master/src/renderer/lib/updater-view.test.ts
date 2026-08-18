import { describe, expect, it } from 'vitest';

import { DISABLED_STATE, type UpdaterState, type UpdaterStatus } from './updater';
import {
  INSTALLING_OVERLAY,
  updaterBannerModel,
  updaterSettingsLine,
  updaterSettingsModel,
} from './updater-view';

function state(status: UpdaterStatus, overrides: Partial<UpdaterState> = {}): UpdaterState {
  return {
    ...DISABLED_STATE,
    currentVersion: '0.1.3',
    status,
    ...overrides,
  };
}

describe('the banner shows work and an action, and nothing else', () => {
  it('shows nothing when the build has no updater', () => {
    expect(updaterBannerModel(state('disabled'))).toBeNull();
  });

  it('shows nothing when there is no news', () => {
    expect(updaterBannerModel(state('idle'))).toBeNull();
  });

  it('shows nothing while a background check runs', () => {
    expect(updaterBannerModel(state('checking'))).toBeNull();
  });

  // The rule this test exists for: a dead feed must never put a bar in front
  // of an operator taking orders. Failures belong in updater.log and in
  // Sozlamalar.
  it('shows nothing on an error', () => {
    expect(updaterBannerModel(state('error', { errorMessage: "Internet aloqasi yo'q." }))).toBeNull();
  });

  it('shows nothing while installing — the overlay owns the screen', () => {
    expect(updaterBannerModel(state('installing'))).toBeNull();
  });

  it('reports download progress on the raised fill', () => {
    const model = updaterBannerModel(state('downloading', { availableVersion: '0.1.4', percent: 42 }));
    expect(model).not.toBeNull();
    expect(model?.tone).toBe('info');
    expect(model?.actionable).toBe(false);
    expect(model?.text.endsWith('42%')).toBe(true);
  });

  it('omits the percentage before the first progress frame', () => {
    const model = updaterBannerModel(state('downloading', { availableVersion: '0.1.4', percent: null }));
    expect(model).not.toBeNull();
    expect(model?.text).not.toContain('%');
    expect(model?.text).not.toContain('null');
  });

  it('names the version and becomes the button when the update is ready', () => {
    const model = updaterBannerModel(state('ready', { availableVersion: '0.1.4' }));
    expect(model).not.toBeNull();
    expect(model?.tone).toBe('warn');
    expect(model?.actionable).toBe(true);
    expect(model?.text).toContain('0.1.4');
  });

  it('still offers the action if the feed never named a version', () => {
    const model = updaterBannerModel(state('ready', { availableVersion: null }));
    expect(model?.actionable).toBe(true);
    expect(model?.text).not.toContain('null');
  });

  it('announces the download the moment an update is found', () => {
    const model = updaterBannerModel(state('available', { availableVersion: '0.1.4' }));
    expect(model?.tone).toBe('info');
    expect(model?.text).not.toContain('%');
  });
});

describe('the Sozlamalar line carries the whole state', () => {
  it('names the running version when there is nothing to install', () => {
    expect(updaterSettingsLine(state('idle', { currentVersion: '0.1.3' }))).toContain('0.1.3');
  });

  it('repeats the failure verbatim so it can be read out over the phone', () => {
    expect(updaterSettingsLine(state('error', { errorMessage: 'X' }))).toContain('X');
  });

  it('never prints "null" for a version it does not have', () => {
    for (const status of ['idle', 'checking', 'available', 'downloading', 'ready'] as const) {
      expect(updaterSettingsLine(state(status))).not.toContain('null');
    }
  });
});

describe('the Sozlamalar group', () => {
  it('is not rendered at all on a build with no feed', () => {
    expect(updaterSettingsModel(DISABLED_STATE).visible).toBe(false);
  });

  it('offers a retry, not a check, after a failure', () => {
    const model = updaterSettingsModel(state('error', { errorMessage: 'X' }));
    expect(model.checkLabel).toBe('Qayta urinish');
    expect(model.checkDisabled).toBe(false);
    expect(model.canInstall).toBe(false);
  });

  it('disables the check button while anything is already in flight', () => {
    for (const status of ['checking', 'available', 'downloading', 'installing'] as const) {
      expect(updaterSettingsModel(state(status)).checkDisabled).toBe(true);
    }
  });

  it('offers the install only once the bits are on disk', () => {
    expect(updaterSettingsModel(state('ready', { availableVersion: '0.1.4' })).canInstall).toBe(true);
    expect(updaterSettingsModel(state('downloading', { percent: 99 })).canInstall).toBe(false);
  });

  it('drops the status line when it would only restate the version row', () => {
    expect(updaterSettingsModel(state('idle')).showLine).toBe(false);
    expect(updaterSettingsModel(state('checking')).showLine).toBe(false);
    expect(updaterSettingsModel(state('ready', { availableVersion: '0.1.4' })).showLine).toBe(true);
    expect(updaterSettingsModel(state('error', { errorMessage: 'X' })).showLine).toBe(true);
  });

  it('carries a word beside every colour', () => {
    const statuses: UpdaterStatus[] = [
      'disabled',
      'idle',
      'checking',
      'available',
      'downloading',
      'ready',
      'installing',
      'error',
    ];
    for (const status of statuses) {
      expect(updaterSettingsModel(state(status)).stateWord.length).toBeGreaterThan(0);
    }
  });
});

describe('the installing overlay', () => {
  // These sentences are the operator's only instructions once the UI is gone:
  // the server is down, the installer is elevating, and if they answer the
  // Windows prompt with "No" the till stays closed. Pinned here rather than in
  // main, where an identical constant was pinned but never rendered.
  it('tells the operator not to close the app, and to accept the Windows prompt', () => {
    expect(INSTALLING_OVERLAY.title).toBe('Yangilanmoqda');
    expect(INSTALLING_OVERLAY.lines.join(' ')).toContain('Dasturni yopmang');
    expect(INSTALLING_OVERLAY.lines.join(' ')).toContain("Windows ruxsat so'rasa");
  });

  it('says how to reopen the till when it does not come back on its own', () => {
    expect(INSTALLING_OVERLAY.lines.join(' ')).toContain('Chayxana Master');
    expect(INSTALLING_OVERLAY.lines.join(' ')).toContain('ikki marta bosing');
  });
});
