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

  nsis: {
    ...base.nsis,
    shortcutName: 'Chayxana Master (Yangi)',
    // Its own firewall rule on its own port, and deliberately NO
    // database-wipe prompt — a trial install must never offer to delete a
    // database, least of all the production one.
    include: 'installer.next.nsh',
  },
};
