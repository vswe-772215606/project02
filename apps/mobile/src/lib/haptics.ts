import * as Haptics from 'expo-haptics';

/**
 * Thin wrapper around expo-haptics. Centralizes the few feedback "moods" we
 * use so call sites read like intent ("success", "warning") rather than the
 * raw Haptics enum values.
 *
 * All exports are sync — fire-and-forget. Errors are swallowed because haptics
 * are non-essential UX flavour.
 */

function safe(fn: () => Promise<unknown>) {
  try {
    void fn().catch(() => {});
  } catch {
    // ignore
  }
}

export const haptics = {
  /** Lightest tap — e.g. number keypad. */
  tap() {
    safe(() => Haptics.selectionAsync());
  },
  /** Soft confirm — e.g. add item to order, qty change. */
  tapLight() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Stronger thump — e.g. table select. */
  tapMedium() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** Positive outcome — order sent, payment accepted. */
  success() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** Caution — cancel-order confirm. */
  warning() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** Negative outcome — wrong PIN, send failed. */
  error() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};
