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

  // Try mDNS discovery on a short budget so first launch has a chance to
  // auto-pick the master without the user opening the setup screen.
  // Falls back to the dev env var if no service is found.
  try {
    const discovered = await window.discovery?.waitForMasterUrl?.(3000);
    if (discovered) {
      cachedUrl = discovered;
      return cachedUrl;
    }
  } catch {
    // discovery may not exist on older builds — fall through
  }

  cachedUrl = getDevFallbackUrl();
  return cachedUrl;
}

/**
 * Returns the most-recently-seen mDNS-discovered master URL, or null if
 * nothing has been found yet. Synchronous helper for the setup screen so
 * we can render a "Avtomatik topildi: …" suggestion without blocking UI.
 */
export async function peekDiscoveredMasterUrl(): Promise<string | null> {
  try {
    return (await window.discovery?.getMasterUrl?.()) ?? null;
  } catch {
    return null;
  }
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
