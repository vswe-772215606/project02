import Constants from 'expo-constants';
import { useSettingsStore } from '../stores/settings.store';

export function getMasterUrl(): string | null {
  const stored = useSettingsStore.getState().serverUrl;
  if (stored) {
    return stored;
  }

  const metadata = Constants.expoConfig?.extra?.MASTER_URL;
  if (typeof metadata === 'string' && metadata.length > 0) {
    return metadata;
  }

  return null;
}
