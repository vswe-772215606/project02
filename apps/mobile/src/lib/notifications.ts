import * as Notifications from 'expo-notifications';
import { Vibration } from 'react-native';
import { useSettingsStore, VIBRATE_PATTERNS } from '../stores/settings.store';

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  try {
    await Notifications.requestPermissionsAsync();
  } catch { /* Expo Go logs a warning about remote notifications — local still works */ }

  try {
    await Notifications.setNotificationChannelAsync('kitchen-ready', {
      name: 'Oshxona tayyor',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 300, 150, 300],
      enableVibrate: true,
    });
  } catch { /* ignore */ }
}

export async function fireReadyNotification() {
  // Vibration is controlled in-app (settings)
  const pattern = VIBRATE_PATTERNS[useSettingsStore.getState().vibrateMode];
  if (pattern.length > 0) Vibration.vibrate(pattern);

  // Sound comes from the device's notification settings
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Buyurtma tayyor!',
        body: 'Taomlarni oshxonadan olib keling',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  } catch { /* ignore if notifications unavailable */ }
}
