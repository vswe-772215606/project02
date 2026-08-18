import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DISABLED_STATE, type UpdaterInstallResult, type UpdaterState } from '@/lib/updater';

const READY: UpdaterState = {
  ...DISABLED_STATE,
  status: 'ready',
  currentVersion: '0.1.3',
  availableVersion: '0.1.4',
  prompt: {
    title: 'Yangi versiya tayyor',
    body: 'Chayxana Master 0.1.4 yuklab olindi.',
    confirmLabel: "Hozir o'rnatish",
    cancelLabel: 'Keyinroq',
  },
};

// The bridge is the OS edge — there is no `window.chayxana` under vitest, so it
// is mocked rather than feature-detected here.
//
// Both stubs carry a default from the moment they are created, not from
// `beforeEach`: the store subscribes and calls `refresh()` at module scope, so
// the first call happens during the dynamic import below. A bare `vi.fn()`
// resolves undefined there and the rejection surfaces after the suite has
// already reported green.
const fetchUpdaterState = vi.fn(async (): Promise<UpdaterState> => READY);
const requestUpdaterInstall = vi.fn(async (): Promise<UpdaterInstallResult> => ({ started: true }));

vi.mock('@/lib/updater', async () => {
  const actual = await vi.importActual<typeof import('@/lib/updater')>('@/lib/updater');
  return {
    ...actual,
    fetchUpdaterState: () => fetchUpdaterState(),
    requestUpdaterCheck: () => Promise.resolve(actual.DISABLED_STATE),
    requestUpdaterInstall: () => requestUpdaterInstall(),
    subscribeUpdaterState: () => () => {},
  };
});

const { useUpdaterStore } = await import('./updater.store');
const { SNOOZE_MS } = await import('@/lib/updater-view');

const initial = useUpdaterStore.getState();

beforeEach(() => {
  useUpdaterStore.setState({
    ...initial,
    state: READY,
    prompt: READY.prompt,
    promptOpen: false,
    snoozedUntil: null,
    autoPromptedFor: null,
    installPending: false,
    actionError: null,
  });
  fetchUpdaterState.mockResolvedValue(READY);
  requestUpdaterInstall.mockResolvedValue({ started: true });
});

afterEach(() => {
  vi.useRealTimers();
  // Only the call log. NOT `clearAllMocks`, which strips the resolved values
  // too — a promise still in flight from a fake-timer test then lands on an
  // undefined state and throws after the suite has finished.
  fetchUpdaterState.mockClear();
  requestUpdaterInstall.mockClear();
});

describe('Keyinroq means later, not no', () => {
  it('re-asks once the snooze has run out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T14:00:00Z'));

    await useUpdaterStore.getState().autoPrompt();
    expect(useUpdaterStore.getState().promptOpen).toBe(true);

    useUpdaterStore.getState().dismissPrompt();
    expect(useUpdaterStore.getState().promptOpen).toBe(false);

    // Still inside the snooze: silence is correct here.
    vi.setSystemTime(new Date('2026-08-18T15:00:00Z'));
    await useUpdaterStore.getState().autoPrompt();
    expect(useUpdaterStore.getState().promptOpen).toBe(false);

    // Past it. This is the assertion that failed before `dismissPrompt`
    // cleared `autoPromptedFor`: the guard was keyed on the version and never
    // reset, so the dialog never returned and the timer that fires here was
    // dead code.
    vi.setSystemTime(Date.now() + SNOOZE_MS + 1);
    await useUpdaterStore.getState().autoPrompt();
    expect(useUpdaterStore.getState().promptOpen).toBe(true);
  });

  it('does not reopen on every pushed frame inside one un-snoozed window', async () => {
    await useUpdaterStore.getState().autoPrompt();
    useUpdaterStore.setState({ promptOpen: false });

    // No dismissal, so no snooze — only `autoPromptedFor` stands between the
    // operator and a dialog that reappears on each push.
    await useUpdaterStore.getState().autoPrompt();
    expect(useUpdaterStore.getState().promptOpen).toBe(false);
  });
});

describe('a refused install is said out loud', () => {
  it('reports why when the main process will not start it', async () => {
    requestUpdaterInstall.mockResolvedValue({ started: false, reason: 'not-ready' });

    await useUpdaterStore.getState().confirmInstall();

    const { promptOpen, actionError } = useUpdaterStore.getState();
    expect(promptOpen).toBe(false);
    // The operator pressed the button that closes the till for two minutes.
    // A dialog that vanishes in silence reads as "the restart is coming".
    expect(actionError).not.toBeNull();
    expect(actionError).toContain('tayyor emas');
  });

  it('clears the message once an install is accepted', async () => {
    useUpdaterStore.setState({ actionError: 'eski xabar' });
    requestUpdaterInstall.mockResolvedValue({ started: true });

    await useUpdaterStore.getState().confirmInstall();

    expect(useUpdaterStore.getState().actionError).toBeNull();
  });
});
