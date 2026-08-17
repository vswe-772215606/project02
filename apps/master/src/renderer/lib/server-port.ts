/**
 * Where the renderer's own server is.
 *
 * The port is not a constant. A `next` build runs its API and Socket.io on
 * 4100 so it can sit beside a production till on 4000 — see
 * `src/main/app-identity.ts`, which is the single source of truth for both.
 * The renderer cannot import that module directly: `tsconfig.renderer.json`
 * pins `rootDir` to `src/renderer`. So `electron.vite.config.ts` reads the
 * same IDENTITIES map and bakes the resolved port in as `__CHAYXANA_PORT__`.
 *
 * Hardcoding 4000 here is what made the first `next` installer unusable. The
 * admin UI posted its login to the production port, so it either got a refused
 * connection — surfacing as "Tizimga kirishda xatolik yuz berdi", the generic
 * branch in `LoginPage.tsx`, because a rejected fetch carries no error code —
 * or, with the till running, silently authenticated against the LIVE database.
 */

/** Injected by `electron.vite.config.ts` at build time. */
declare const __CHAYXANA_PORT__: number;

/**
 * The baked-in port, or 4000 when nothing was injected (vitest, and any
 * consumer built without the define). Matching `production` is the safe
 * fallback: it is what every shipped v0.1.x build already used.
 */
export const SERVER_PORT: number =
  typeof __CHAYXANA_PORT__ === 'number' ? __CHAYXANA_PORT__ : 4000;

export const SERVER_ORIGIN = `http://localhost:${SERVER_PORT}`;
