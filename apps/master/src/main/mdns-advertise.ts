import { app } from 'electron';
import { hostname } from 'os';
import type { Bonjour, Service } from 'bonjour-service';

let bonjour: Bonjour | null = null;
let publishedService: Service | null = null;

/**
 * Advertise the master server on the local network via mDNS (Bonjour /
 * DNS-SD) so order desktops and mobile clients can find it without manual
 * IP configuration.
 *
 * Service type: `_chayxana._tcp.local`
 * Name:        `Chayxana Master @ <hostname>` (unique per machine)
 * Port:        whatever the HTTP+WS server is bound to (default 4000)
 * TXT records: { role: "master", version }
 *
 * Idempotent — calling more than once will unpublish the previous record
 * before re-advertising. Silent no-op on failure (mDNS is a convenience,
 * not a hard requirement; the app keeps working on a known IP).
 */
export async function advertiseMasterMdns(opts: {
  port: number;
  logger: { info: (m: string) => void; error: (m: string) => void };
}): Promise<void> {
  try {
    if (publishedService) {
      await stopAdvertising();
    }

    const mod = await import('bonjour-service');
    const BonjourCtor = mod.default ?? (mod as unknown as { Bonjour: typeof Bonjour }).Bonjour;
    bonjour = new BonjourCtor();

    const name = `Chayxana Master @ ${hostname()}`;
    publishedService = bonjour.publish({
      name,
      type: 'chayxana',
      port: opts.port,
      txt: {
        role: 'master',
        version: app.getVersion(),
      },
    });

    opts.logger.info(`[mdns] advertising "${name}" as _chayxana._tcp on port ${opts.port}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    opts.logger.error(`[mdns] advertise failed: ${msg}`);
  }
}

export async function stopAdvertising(): Promise<void> {
  if (publishedService) {
    await new Promise<void>((resolve) => {
      publishedService?.stop?.(() => resolve());
      // Belt-and-suspenders: resolve after 1s if stop callback never fires.
      setTimeout(resolve, 1000);
    });
    publishedService = null;
  }
  if (bonjour) {
    bonjour.destroy();
    bonjour = null;
  }
}
