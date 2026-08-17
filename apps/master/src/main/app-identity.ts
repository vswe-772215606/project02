/**
 * Who this build is, as far as Windows and the operator are concerned.
 *
 * Two builds of this app can sit on one machine at the same time: the till
 * that is actually running the chayxana, and a trial of a newer version.
 * Everything that would otherwise collide between them is derived from here,
 * so there is one place to look when asking "can these two coexist?".
 *
 * The variant is chosen at BUILD time (`CHAYXANA_VARIANT=next pnpm ...`) and
 * baked in by `electron.vite.config.ts`. It is not a runtime switch: the
 * database location depends on it, and a setting that can move the database
 * is a setting that can lose it.
 *
 * ── Why `appName` is the dangerous field ──────────────────────────────────
 *
 * Electron derives `app.getPath('userData')` from `app.getName()`, and the
 * SQLite database lives at `<userData>/data/master.sqlite`
 * (`sqlite-bootstrap.ts`). So `appName` *is* the database path.
 *
 * `production` must therefore keep the exact name the shipped v0.1.x builds
 * resolved to, or an upgrade would silently point the app at an empty
 * directory and "lose" every order, expense and debt on the machine.
 *
 * That name is `@chayxana/master` — the `name` field of `package.json`. Note
 * it is NOT `build.productName` ("Chayxana Master"): `productName` under
 * `build` is electron-builder configuration, read when packaging, and Electron
 * never sees it. This package has no top-level `productName`, so Electron
 * falls back to `name`, scope and all. Confirmed against
 * `app-builder-lib/out/appInfo.js` — electron-builder does not rewrite the
 * packaged `package.json`'s `name`.
 *
 * The practical consequence, and the reason this file exists: renaming
 * `build.productName` alone would move the install directory and the Start
 * Menu entry while leaving both builds pointed at the SAME database. It would
 * look separated and not be.
 */

/** Injected by `electron.vite.config.ts` at build time. */
declare const __CHAYXANA_VARIANT__: string;

export type AppVariant = 'production' | 'next';

export type AppIdentity = {
  variant: AppVariant;
  /**
   * Passed to `app.setName()`, and therefore the userData directory and the
   * database. `null` means "leave Electron's default alone", which is how
   * `production` guarantees byte-identical behaviour to the shipped builds.
   */
  appName: string | null;
  /** What a human sees — window title, mDNS advert, firewall rule. */
  label: string;
  /** Default HTTP + Socket.io port. Two variants must never share one. */
  port: number;
};

/**
 * Exported so `electron.vite.config.ts` can bake the port into the renderer
 * bundle without restating it. The renderer cannot import this module (its
 * `rootDir` is `src/renderer`), and a second copy of the port is a second
 * thing to forget — see `src/renderer/lib/server-port.ts`.
 */
export const IDENTITIES: Record<AppVariant, AppIdentity> = {
  // Do not touch. `appName: null` preserves `@chayxana/master`, which is where
  // every existing install's database already is.
  production: {
    variant: 'production',
    appName: null,
    label: 'Chayxana Master',
    port: 4000,
  },
  // Installs beside production and shares nothing with it: its own userData
  // (own database), its own appId, install directory, shortcut, port and
  // firewall rule. See `electron-builder.next.js` and `installer.next.nsh`.
  next: {
    variant: 'next',
    appName: 'chayxana-master-next',
    label: 'Chayxana Master (Yangi)',
    port: 4100,
  },
};

function resolveVariant(): AppVariant {
  const raw = typeof __CHAYXANA_VARIANT__ === 'string' ? __CHAYXANA_VARIANT__ : 'production';
  return raw === 'next' ? 'next' : 'production';
}

export const APP_IDENTITY: AppIdentity = IDENTITIES[resolveVariant()];
