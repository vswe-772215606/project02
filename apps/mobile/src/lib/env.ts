import { useSettingsStore } from '../stores/settings.store';

export function getMasterUrl(): string {
  const stored = useSettingsStore.getState().serverUrl;
  return stored || 'http://192.168.1.50:4000';
}
