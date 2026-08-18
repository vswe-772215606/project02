/**
 * Side-by-side installer config: "Chayxana Master (Yangi)".
 *
 * Produces an installer that lands NEXT TO an existing production install
 * rather than upgrading over it. Used to trial a new version on the machine
 * that is already running the chayxana, without touching the till in service.
 *
 * Build it with `pnpm package:win:next`, which also sets
 * `CHAYXANA_VARIANT=next` so the app's runtime identity
 * (`src/main/app-identity.ts`) matches this packaging identity. The two must
 * be set together — this file alone moves the install directory but NOT the
 * database, because Electron derives userData from the app's `name`, which
 * electron-builder does not rewrite. See the comment block in
 * `app-identity.ts`.
 *
 * Everything not overridden here is inherited from the production `build`
 * block in package.json, so the file list, Prisma staging and extraResources
 * cannot drift between the two.
 */

const base = require('./package.json').build;

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,

  // Different appId ⇒ a different Uninstall registry key ⇒ Windows treats
  // this as a separate product and installs alongside. Sharing the appId is
  // what would make the installer replace the existing app.
  appId: 'com.chayxana.master.next',

  // Drives $INSTDIR (Program Files\...), the .exe name and the shortcut, so
  // none of them collide with the production install.
  productName: 'Chayxana Master (Yangi)',

  // Keeps the two installers apart in the artifacts list and in Downloads.
  artifactName: 'ChayxanaMaster-Yangi-Setup-${version}.${ext}',

  // The production feed must never reach this build: it installs beside a live
  // till and owns a different database. See src/main/app-identity.ts.
  // Literal null, NOT []: getPublishConfigs short-circuits only on null; an
  // empty array falls through to repository detection and can synthesise a
  // github config. With null, neither latest.yml nor app-update.yml is produced
  // and `next` simply has no updater.
  //
  // This is one of two independent guards. The other is
  // `updateFeedUrl: null` in app-identity.ts, which makes the runtime return
  // before it ever touches electron-updater. Both exist because
  // `updaterCacheDirName` is derived from package.json `name` — identical for
  // both variants, and `name` is the database path, so it cannot be changed.
  publish: null,

  nsis: {
    ...base.nsis,
    shortcutName: 'Chayxana Master (Yangi)',
    // Its own firewall rule on its own port, and deliberately NO
    // database-wipe prompt — a trial install must never offer to delete a
    // database, least of all the production one.
    include: 'installer.next.nsh',
  },
};
