import * as Network from 'expo-network';

const DEFAULT_PORT = 4000;
const PROBE_TIMEOUT_MS = 600;
const SUBNET_CONCURRENCY = 32;

/**
 * Probe a single host:port for a Chayxana master by hitting its health
 * endpoint. Resolves to the URL on success, null on any other outcome.
 * Short timeout so an unanswered request doesn't stall the whole scan.
 */
async function probe(host: string, port: number, signal: AbortSignal): Promise<string | null> {
  const url = `http://${host}:${port}`;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort);
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (res.ok) return url;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Scan the device's local /24 subnet for a Chayxana master.
 * Returns the first http URL that responds 200 on /api/health, or null
 * if the scan finishes without finding one. Total wall time is bounded
 * to roughly 254 / SUBNET_CONCURRENCY * PROBE_TIMEOUT_MS (~5s).
 *
 * Used by the mobile app's env.ts as a fallback when the user has no
 * server URL configured. The discovery uses pure HTTP probes, so it
 * works in the Expo managed workflow with no native module.
 */
export async function scanLanForMaster(opts?: {
  port?: number;
  signal?: AbortSignal;
  onProgress?: (probed: number, total: number) => void;
}): Promise<string | null> {
  const port = opts?.port ?? DEFAULT_PORT;
  const externalSignal = opts?.signal;
  const ip = await Network.getIpAddressAsync();
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;

  const [a, b, c] = ip.split('.').map(Number);
  if (a === undefined || b === undefined || c === undefined) return null;
  // Build the candidate list — every host in the /24, skipping our own IP
  // and the .0/.255 endpoints.
  const ownLast = Number(ip.split('.')[3]);
  const candidates: string[] = [];
  for (let i = 1; i <= 254; i += 1) {
    if (i === ownLast) continue;
    candidates.push(`${a}.${b}.${c}.${i}`);
  }
  // Try the de-facto static master IP first (192.168.1.50 convention
  // from CLAUDE.md) so the common case finishes in a single probe.
  candidates.sort((x, y) => (x === '192.168.1.50' ? -1 : y === '192.168.1.50' ? 1 : 0));

  const controller = new AbortController();
  externalSignal?.addEventListener('abort', () => controller.abort());

  let found: string | null = null;
  let probed = 0;
  const total = candidates.length;
  let cursor = 0;

  async function worker() {
    while (!found && !controller.signal.aborted) {
      const idx = cursor;
      cursor += 1;
      if (idx >= candidates.length) return;
      const host = candidates[idx]!;
      const url = await probe(host, port, controller.signal);
      probed += 1;
      opts?.onProgress?.(probed, total);
      if (url) {
        found = url;
        controller.abort();
        return;
      }
    }
  }

  const workers = Array.from({ length: SUBNET_CONCURRENCY }, () => worker());
  await Promise.all(workers);
  return found;
}
