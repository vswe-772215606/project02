/**
 * The master is the only process that opens its SQLite file, so it needs one
 * connection. With several, a write the app does not await — the session touch
 * in requireAuth — can deadlock against a request's own transaction until
 * Prisma's 5 s socket timeout (P1008). Measured 2026-09-30 (PRD 14 G7).
 */
export function singleConnectionUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const at = url.indexOf('?');
  const base = at === -1 ? url : url.slice(0, at);
  const params = new URLSearchParams(at === -1 ? '' : url.slice(at + 1));
  params.set('connection_limit', '1');
  return `${base}?${params.toString()}`;
}
