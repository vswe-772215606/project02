import type { Bonjour, Service } from 'bonjour-service';

let bonjour: Bonjour | null = null;
let activeBrowser: ReturnType<Bonjour['find']> | null = null;
let lastDiscoveredUrl: string | null = null;
let discoveryStartedAt = 0;

/**
 * Browse the LAN for a master server advertised as `_chayxana._tcp.local`
 * (see apps/master/src/main/mdns-advertise.ts). Discovery runs continuously
 * in the background once started; the renderer can call
 * `getDiscoveredMasterUrl()` (synchronous, returns the last seen URL) or
 * `waitForDiscoveredMasterUrl(timeoutMs)` to await the first hit.
 *
 * Returns the first non-loopback IPv4 host from the service record. The
 * service may report multiple addresses; we prefer 192.168.x.x and
 * 10.x.x.x style private addresses.
 */
export async function startDiscovery(logger: {
  info: (m: string) => void;
  error: (m: string) => void;
}): Promise<void> {
  if (activeBrowser) {
    return;
  }
  try {
    const mod = await import('bonjour-service');
    const BonjourCtor = mod.default ?? (mod as unknown as { Bonjour: typeof Bonjour }).Bonjour;
    bonjour = new BonjourCtor();

    discoveryStartedAt = Date.now();
    activeBrowser = bonjour.find({ type: 'chayxana' }, (service: Service) => {
      const url = serviceToUrl(service);
      if (!url) return;
      lastDiscoveredUrl = url;
      logger.info(`[mdns] discovered master at ${url} (name="${service.name}")`);
    });
    logger.info('[mdns] browsing for _chayxana._tcp on LAN');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[mdns] discovery start failed: ${msg}`);
  }
}

export function stopDiscovery(): void {
  if (activeBrowser) {
    activeBrowser.stop?.();
    activeBrowser = null;
  }
  if (bonjour) {
    bonjour.destroy();
    bonjour = null;
  }
}

export function getDiscoveredMasterUrl(): string | null {
  return lastDiscoveredUrl;
}

/**
 * Resolves with the first discovered URL, or null if `timeoutMs` elapses
 * without one. Re-uses an already-running browser (does not restart).
 */
export function waitForDiscoveredMasterUrl(timeoutMs = 5000): Promise<string | null> {
  if (lastDiscoveredUrl) return Promise.resolve(lastDiscoveredUrl);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (lastDiscoveredUrl) {
        clearInterval(interval);
        resolve(lastDiscoveredUrl);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });
}

function serviceToUrl(service: Service): string | null {
  if (!service.port) return null;

  const addrs = (service.addresses ?? []) as string[];
  // Prefer IPv4 (we strip IPv6 because http://[::ffff:1.2.3.4] etc. is fiddly).
  const ipv4 = addrs.filter((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
  if (ipv4.length === 0) return null;

  // Prefer private LAN ranges first; fall back to anything else.
  const prefer = (a: string) =>
    a.startsWith('192.168.') ? 0
      : a.startsWith('10.') ? 1
      : a.startsWith('172.') ? 2
      : 3;
  ipv4.sort((a, b) => prefer(a) - prefer(b));

  return `http://${ipv4[0]}:${service.port}`;
}

export function discoveryStatus(): {
  running: boolean;
  startedAt: number;
  url: string | null;
} {
  return {
    running: activeBrowser !== null,
    startedAt: discoveryStartedAt,
    url: lastDiscoveredUrl,
  };
}
