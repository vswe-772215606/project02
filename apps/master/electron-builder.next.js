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

  // What a person sees: window title, Apps & features, the shortcut, the
  // firewall rule name. Not the install directory — see executableName.
  productName: 'Chayxana Master (Yangi)',

  // The executable and, through it, the install directory and the uninstaller:
  //   C:\Program Files\Chayxana Master Yangi\Chayxana Master Yangi.exe
  //   C:\Program Files\Chayxana Master Yangi\Uninstall Chayxana Master Yangi.exe
  // electron-builder derives these from productName only when it matches
  // /^[-_+0-9a-zA-Z .]+$/ (app-builder-lib targetUtil.getWindowsInstallationDirName).
  // The parentheses in "(Yangi)" fail that test, and the fallback is package.json
  // `name` sanitised — "@chayxanamaster", a directory named after the ONE field
  // the two variants share. It stayed clear of production's
  // "C:\Program Files\Chayxana Master" only because production's name passes
  // the test. Name it on purpose instead. (A machine that already holds the
  // first trial build keeps its old directory until that build is uninstalled:
  // electron-builder reuses the registered InstallLocation on upgrade.)
  executableName: 'Chayxana Master Yangi',

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
    // Its own firewall rule on its own port, deliberately NO database-wipe
    // prompt — a trial install must never offer to delete a database, least
    // of all the production one — and an APP_PACKAGE_NAME override so the
    // trial's uninstaller cannot name the production data directory at all.
    include: 'installer.next.nsh',
  },
};

// ─── Build-time guards ──────────────────────────────────────────────────────
// Each of these is a way the trial could reach the live till. Failing the
// build is cheaper than finding out on the counter.
const fs = require('fs');
const path = require('path');
const next = module.exports;
const fail = (why) => {
  throw new Error(`electron-builder.next.js: ${why}`);
};

if (next.appId === base.appId) fail('appId must differ from production — same appId means the installer replaces the live app');
if (next.productName === base.productName) fail('productName must differ from production — shortcut, Apps & features and firewall rule would collide');
if (next.publish !== null) fail('publish must be null — the trial has no update feed (see app-identity.ts)');
if (next.nsis.deleteAppDataOnUninstall) {
  fail('nsis.deleteAppDataOnUninstall must stay false — the uninstaller derives app-data paths from package.json `name`, which both variants share');
}

// The trial's userData name is spelled in three places that must agree:
// app-identity.ts (what Electron uses), installer.next.nsh (what the
// uninstaller would delete on --delete-app-data), and here.
const trialAppName = 'chayxana-master-next';
const identity = fs.readFileSync(path.join(__dirname, 'src/main/app-identity.ts'), 'utf8');
if (!identity.includes(`appName: '${trialAppName}'`)) fail(`app-identity.ts no longer names the next variant '${trialAppName}'`);
const nsh = fs.readFileSync(path.join(__dirname, 'installer.next.nsh'), 'utf8');
if (!nsh.includes(`!define APP_PACKAGE_NAME "${trialAppName}"`)) fail(`installer.next.nsh must redefine APP_PACKAGE_NAME as "${trialAppName}"`);
