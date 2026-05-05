let cachedUrl: string | null | undefined;

function getDevFallbackUrl(): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }

  const candidate = import.meta.env.VITE_MASTER_URL;
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate;
  }

  return null;
}

export async function getMasterUrl(): Promise<string | null> {
  if (cachedUrl !== undefined) {
    return cachedUrl;
  }

  const stored = await window.serverConfig.getMasterUrl();
  if (stored) {
    cachedUrl = stored;
    return cachedUrl;
  }

  cachedUrl = getDevFallbackUrl();
  return cachedUrl;
}

export function getCachedMasterUrl(): string | null {
  return cachedUrl ?? null;
}

export function requireMasterUrl(): string {
  const url = getCachedMasterUrl();
  if (!url) {
    throw new Error('MASTER_URL_NOT_CONFIGURED');
  }

  return url;
}

export async function setMasterUrl(url: string): Promise<void> {
  await window.serverConfig.setMasterUrl(url);
  cachedUrl = url;
}

export async function clearMasterUrl(): Promise<void> {
  await window.serverConfig.clearMasterUrl();
  cachedUrl = null;
}
