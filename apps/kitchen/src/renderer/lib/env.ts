import { useSettingsStore } from '../stores/settings.store';

export function getMasterUrl(): string {
  const stored = useSettingsStore.getState().serverUrl;
  return stored || (import.meta.env.VITE_MASTER_URL as string) || 'http://localhost:4000';
}
