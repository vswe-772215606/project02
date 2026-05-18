import Constants from 'expo-constants';
import { useSettingsStore } from '../stores/settings.store';
import { scanLanForMaster } from './discovery';

let discoveredCache: string | null = null;

export function getMasterUrl(): string | null {
  const stored = useSettingsStore.getState().serverUrl;
  if (stored) {
    return stored;
  }

  if (discoveredCache) {
    return discoveredCache;
  }

  const metadata = Constants.expoConfig?.extra?.MASTER_URL;
  if (typeof metadata === 'string' && metadata.length > 0) {
    return metadata;
  }

  return null;
}

/**
 * Run a one-off LAN subnet scan to find the master and cache the result.
 * Subsequent calls to `getMasterUrl()` will return the cached URL if no
 * manual server URL has been saved. Call this from app startup or from
 * the settings screen when the user taps "Avtomatik topish".
 */
export async function discoverMasterUrl(opts?: {
  onProgress?: (probed: number, total: number) => void;
}): Promise<string | null> {
  const url = await scanLanForMaster({ onProgress: opts?.onProgress });
  if (url) {
    discoveredCache = url;
  }
  return url;
}

export function getDiscoveredMasterUrl(): string | null {
  return discoveredCache;
}

export function clearDiscoveredMasterUrl(): void {
  discoveredCache = null;
}
