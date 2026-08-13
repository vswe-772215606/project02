/**
 * Shared plumbing for the gallery's fixture modules.
 *
 * Each fixture module owns one domain's seed data and exports a route
 * handler with this signature; `mock-server.ts` tries each handler in turn
 * and takes the first non-null `Response`. State lives in module-level `let`
 * bindings and is mutated by the same requests the real screens send, so
 * (for example) a stock count really does move a dish out of "Sanoqsiz".
 */
export type RouteHandler = (path: string, method: string, body: Record<string, unknown>) => Response | null;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorJson(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status);
}

/**
 * Splits a request path into its route (for matching) and query string (for
 * reading params). `src/renderer/api/*.ts` only appends a `?` when at least
 * one param is actually set, so a plain `startsWith('/api/orders?')` style
 * match silently misses every zero-param call — this normalizes both forms.
 */
export function splitPath(path: string): { base: string; query: URLSearchParams } {
  const i = path.indexOf('?');
  if (i === -1) return { base: path, query: new URLSearchParams() };
  return { base: path.slice(0, i), query: new URLSearchParams(path.slice(i + 1)) };
}

const NOW = Date.now();

/** ISO timestamp `minutes` before module-load time. */
export function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

/** ISO timestamp `hours` before module-load time. */
export function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60);
}

/** ISO timestamp `days` before today, at a given local hour/minute. */
export function daysAgo(days: number, hour = 12, minute = 0): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// Every date-scoped page computes its "today" via the real `tashkentDayKey()`
// (src/renderer/lib/format.ts), which formats in Asia/Tashkent regardless of
// the host's own timezone. This mock has to agree on what string "today" is,
// or a same-day request looks like a different day and falls through to
// synthetic data instead of the real one — mixing `Date#getDate()` (host-local)
// with `toISOString()` (UTC) here previously did exactly that.
const TASHKENT_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tashkent',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * "YYYY-MM-DD" `days` before today, in Asia/Tashkent — matches the real
 * `tashkentDayKey()` exactly. Handlers below otherwise ignore the exact
 * value a page requests and serve the same canned day/month/range,
 * echoing the requested key back into the response either way.
 */
export function dayKey(days = 0): string {
  return TASHKENT_DAY_FORMATTER.format(new Date(NOW - days * 86_400_000));
}

export function monthKey(days = 0): string {
  return dayKey(days).slice(0, 7);
}

let seq = 1000;
/** Monotonic id generator for records created through the preview's forms. */
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/** Deterministic 0..1 "random" — stable across reloads instead of reshuffling
 * generated rows (a month of report data, say) every time the page loads. */
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 99991 + 1) * 10000;
  return x - Math.floor(x);
}

/** Deterministic integer in [min, max]. */
export function pseudoRange(seed: number, min: number, max: number): number {
  return min + Math.floor(pseudoRandom(seed) * (max - min + 1));
}

export function sum(values: Array<string | number>): number {
  return values.reduce((total: number, v) => total + Number(v), 0);
}
