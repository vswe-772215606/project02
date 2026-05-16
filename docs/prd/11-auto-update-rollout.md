# PRD 11 — Auto-update & multi-machine rollout

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Ops (deployment, software updates)
- **Related code:** `apps/master/package.json` (electron-builder config), `apps/kitchen/package.json` (same), `apps/mobile/eas.json`, `build.ps1`
- **Related docs:** PRD 04 (server/UI separation), PRD 10 (backup/DR), `docs/SESSION_HANDOFF_2026-05-05.md`

---

## 1. Context

Each Chayxana POS deployment has **multiple software artefacts** running on different machines:

- **Master** (Windows NSIS installer) — one per chayxana, on the central machine.
- **Kitchen** (Windows NSIS installer) — one per kitchen monoblock (typically one, possibly more in larger chayxanas).
- **Mobile waiter app** (Expo / EAS Build APK) — one APK installed on each waiter's phone.

Today, every update is **manual**:

1. Developer builds new installers / APK.
2. Sends them to the chayxana via WhatsApp / Telegram / USB stick.
3. Operator (or a friend who knows computers) uninstalls the old version, runs the new installer, hopes nothing broke.
4. Repeats for kitchen monoblock(s).
5. Each waiter's phone needs the APK manually sideloaded.

For ~3-5 waiter phones + 1 kitchen + 1 master, a routine update takes the operator ~30–60 minutes and is prone to "I forgot to update the kitchen machine, and now things are broken." There is **no version-skew protection** — a v1.4 mobile talking to a v1.2 master may produce subtle failures.

The risk grows monotonically with deployment count. Even within one chayxana, the multiplicity (1 master + 1-2 kitchen + 3-5 phones) means rollout is fragile.

The PRD is to specify a sane update story that:

- Doesn't require the operator to be a sysadmin.
- Doesn't require always-on cloud infrastructure.
- Prevents version skew across the apps within one chayxana.
- Survives the offline-once-per-week scenario (chayxana with patchy internet).

## 2. Goals / Non-goals

### Goals

- Specify how each of the three artefacts (Master, Kitchen, Mobile) is updated.
- Define **version compatibility**: how Master communicates to clients "you must upgrade before continuing."
- Specify the **rollout cadence**: how often we ship; what triggers a hot fix.
- Provide **rollback** for an update that turns out broken.
- Minimise operational burden — owner is not a sysadmin.

### Non-goals

- A/B testing or staged rollouts. Single chayxana = one population.
- Feature flags. Out of scope.
- Database schema rollbacks. (DB migrations are forward-only; this PRD assumes that and works around it.)
- Cross-chayxana coordinated rollouts (only matters if multi-tenant — not v1).

## 3. Current state (code-grounded)

| Artefact | Build | Update mechanism today |
|---|---|---|
| Master | `pnpm package:win` → electron-builder NSIS installer. Output: `apps/master/dist/Chayxana Master Setup X.X.X.exe`. | Manual: send installer, run it. Per-machine, perMachine NSIS config (`apps/master/package.json` build block). |
| Kitchen | `pnpm --filter @chayxana/kitchen package:win`. NSIS installer. | Manual sideload. |
| Mobile | EAS Build (`apps/mobile/eas.json`). Output: APK. | Manual sideload to phones. |
| Version pinning | No central version; each `package.json` has its own. | None. Drift is possible. |
| Compatibility check | None | Mobile can talk to a master of any version; behaviour is best-effort. |
| Telegram bot version | Tied to Master | Updates with Master. |

### Missing pieces

- No `electron-updater` config in either Electron app. There's a release feed concept in `electron-builder`'s docs but nothing here uses it.
- No version-compatibility handshake on login.
- No place that says "what versions of mobile/kitchen does master vX.Y require."
- No publishing pipeline. Builds are ad-hoc.

## 4. Options

### Option A — `electron-updater` from a self-hosted feed (LAN-local)

Master and Kitchen both bundle `electron-updater`. They check for updates against a **feed URL** that points to a folder hosted by Master itself (e.g., `http://192.168.1.50:4000/updates/`). When the developer wants to ship, they drop new installers into Master's update folder and bump a `latest.yml` manifest.

- **Mechanism:**
  - On Master boot: read updates from a local folder; serve `/updates/` as static files via Express.
  - Kitchen on boot: check `http://<master>/updates/latest.yml` via electron-updater. If newer, download + verify + install on next restart.
  - Mobile: out of scope for this option (Mobile doesn't talk electron-updater).
- **Pros:**
  - No internet required for the chayxana machines — updates flow over the LAN.
  - Operator's only job: copy the new installer file into Master's `updates` folder (or, more user-friendly: drag it onto a "Yangilash" / Update screen in admin UI).
  - Kitchen monoblocks update themselves.
- **Cons:**
  - Master itself still has to be updated manually (it can't update itself while running if it's the file server). Workaround: Master runs the installer as detached process and exits.
  - Mobile is not solved — separate path needed.

### Option B — Cloud-hosted feed

Same as A but the feed lives on the public internet (GitHub Releases, an S3 bucket, etc.). Each chayxana's Master and Kitchen check directly.

- **Pros:**
  - Single source of truth; we can see which chayxanas are on which version.
  - No need to manually drop installers per location.
- **Cons:**
  - Requires internet at each chayxana. Tashkent SMB internet is fine but not always reliable.
  - Public release infrastructure to maintain. CDN, signing, etc.
  - Multiple chayxanas pulling simultaneously is a non-issue at this scale but is a thing to monitor.

### Option C — Hybrid: cloud feed with LAN cache

Master fetches updates from a cloud feed when it has internet, caches them locally, and serves the cache to Kitchen monoblocks over LAN. Kitchen never needs to reach the internet directly.

- **Pros:** combines A's offline-tolerance with B's central control.
- **Cons:** most moving parts.

### Option D — In-app update prompt + sideload (no auto-install)

Each app, on boot, queries a `version_info` URL (could be on Master, could be a cloud URL) and displays an in-app banner "Yangi versiya mavjud — bu yerga bosing va yangilang." Tapping the banner downloads the installer to the user's Downloads folder and tells the operator to run it.

- **Pros:** minimal infrastructure; no risky background install.
- **Cons:** still requires operator action per machine. Doesn't solve "I forgot to update the kitchen monoblock."

### Option E — Status quo + version-skew detection

Don't auto-update. But add a version handshake: every client (Mobile, Kitchen) sends its version on login; Master compares to its own `compatibility.minClientVersion` and rejects (or warns) if too old.

- **Pros:** smallest change. Eliminates the worst class of bug ("waiter on v1.2 talks to master on v1.4").
- **Cons:** doesn't solve actual rollout. Operator still does everything manually.

### Mobile-specific options

Mobile is separate because Expo / EAS gives us:

- **F1.** EAS Update OTA: instant JavaScript-only updates without an app-store visit. APK shell stays the same; JS bundle is hot-swapped.
- **F2.** EAS Submit to Play Store: full app-store distribution. Requires Play Console account; serious deployment.
- **F3.** Sideload APKs via Telegram (current).

For a sideloaded fleet without Play Store, F1 (OTA) is the killer feature. The APK is rare; the JS bundle is the actual code.

## 5. Decision matrix

| Dimension | A (LAN feed) | B (cloud feed) | C (hybrid) | D (in-app prompt) | E (handshake only) | F1 (mobile OTA) |
|---|---|---|---|---|---|---|
| Operator burden | One drop per release | None | None | Per-machine sideload | None | None |
| Internet required at chayxana | No | Yes | Helpful | Yes (for download) | No | Yes (one-time per update) |
| Solves version skew | Yes | Yes | Yes | Partial | Yes | Yes (mobile) |
| Infra to maintain | Master serves files | Cloud feed | Both | Cloud URL | None | EAS account |
| Risk of bad update bricking system | Medium (auto-install) | Medium | Medium | Low (manual install) | None | Medium (OTA can ship broken JS) |
| Effort | M | M | L | S | XS | XS (already on EAS) |

## 6. Open questions

1. **Update cadence:** do we ship monthly, on-demand, or both? Frequent updates favour auto-update; rare big releases favour manual.
2. **Code signing on Windows:** without a code-signing certificate, NSIS installers trigger SmartScreen warnings. Operator must click "More info → Run anyway." Painful. Worth investing in a cert? (~$200/yr).
3. **Schema migration safety:** what's the worst case if Master v1.4's migration partially applies and we have to roll back? PRD 10's backup is the safety net; rollback procedure should restore the pre-update DB.
4. **Telegram bot config drift:** the bot token is a setting. Updates shouldn't reset it.
5. **Connectivity assumptions:** does every chayxana have stable internet to reach a cloud feed? If half don't, A or D are forced.
6. **Multi-master future:** if PRD 04 splits Master into a service + admin UI, each has its own update channel. Manageable but worth noting.

## 7. Recommendation

**For Master and Kitchen: Option A (LAN feed served by Master) + Option E (version handshake) + automatic backup before update (PRD 10).**

**For Mobile: Option F1 (EAS Update OTA).**

Phased recommendation:

1. **Phase 1 — Option E (handshake)** as the floor. Even if no auto-update is built, version skew is the most embarrassing class of bug and is trivial to detect.
2. **Phase 2 — F1 (Mobile OTA)** because mobile has the most update friction today (per-phone sideload) and EAS Update is already a button we can press.
3. **Phase 3 — Option A (LAN feed)** for Master and Kitchen. Operator drags the new installer onto the admin UI; Kitchen updates itself.
4. **(Optional, much later) Phase 4 — Option B/C** if a multi-chayxana future warrants central rollout management.

This sequence delivers value at every step: handshake prevents skew without any infra; OTA solves the noisiest pain point; LAN feed eliminates the kitchen-monoblock-forgotten problem. We stop short of cloud infrastructure that adds little value at single-chayxana scale.

Single-machine-operator weighting (per the answer to "what should I weight"): Option A's "drag installer into admin UI" is the lowest-skill operator workflow that actually works.

## 8. Rollout

### Phase 1 — version handshake (Option E)

1. **Common version constant** (already in each `package.json`). Add a build-time include so each artefact ships its version string at runtime.
2. **`/api/version` endpoint** on Master returns `{ server: '1.4.0', minClient: '1.4.0' }` from a constant in code. No DB write.
3. **On client login** (mobile, kitchen): send `X-Client-Version: 1.4.0` header. Master middleware compares to `minClient`. If client < minClient: return 426 `UPGRADE_REQUIRED` with message body. Client renders a full-screen "Iltimos yangilang" (Please upgrade) screen with a contact-developer hint.
4. **Acceptable client < server:** master should still accept newer clients (`client > server` is rare during a rollout; allow with a console warning).
5. Time to ship: ~1 day.

### Phase 2 — Mobile OTA (F1)

1. **Configure EAS Update** in `apps/mobile/eas.json`. Channel: `production`.
2. **Wire `expo-updates`** to check on app launch. Update on background, prompt on next launch.
3. **Release flow**: `eas update --channel production --message "..."`.
4. **Safety**: ship a kill switch (a config flag in master that disables OTA temporarily if a bad update slipped out — `force_native_apk_only: true`).
5. **Compatibility**: combine with Phase 1 handshake — newer JS over old APK is fine as long as RN/Expo binaries are unchanged.
6. Time to ship: ~2 days (EAS account already set up).

### Phase 3 — Master + Kitchen LAN feed (Option A)

1. **Master**:
   - Serve `GET /updates/latest.yml` (electron-updater format) from a folder configured by setting `update_feed_path` (default `userData/updates`).
   - Admin UI: "Yangilash boshqaruvi" (Update management) page. Owner-only. Allows uploading new installer files via drag-and-drop. The server writes them into `update_feed_path` and regenerates `latest.yml`.
   - Master is itself the file server; it can advertise an update *for itself* but the install requires Master to exit first. Workflow:
     1. Owner uploads new master installer to "yangilash" page.
     2. Admin UI shows "Master uchun yangilanish tayyor — boshlash uchun bosing."
     3. Owner clicks. Master takes a backup (call into PRD 10's `backupService.takeSnapshot`), spawns the installer detached, then `app.quit()`. Installer runs, replaces files, launches the new master.
2. **Kitchen**:
   - Embed `electron-updater`. Feed URL = `http://<master>/updates/`.
   - On Kitchen boot: check feed. If newer version available, download in background, install on next quit.
   - "Yangilanish mavjud" indicator in the kitchen UI; cook can defer to end-of-shift.
3. **Code signing**: invest in a Windows code-signing certificate. Without it, SmartScreen will warn on every install. ~$200/yr.
4. **Backup-before-update**: pre-update hook always calls `backupService.takeSnapshot('pre-update')`. This is the rollback path.
5. Time to ship: ~1-2 weeks including signing and testing on a real Windows VM.

### Phase 4 — observability

- After every successful update, log to AuditLog (`APP_UPDATED`) with `{ artefact, fromVersion, toVersion }`.
- Daily Telegram summary surfaces each connected client's version. Owner sees "5 ta telefon, 4 tasi v1.4, 1 tasi v1.3" — clear inventory.

### Rollback

- **Phase 1 (handshake):** revert the middleware; clients continue with no compatibility check.
- **Phase 2 (OTA):** EAS supports rollback to a previous update. If a bad JS bundle ships, `eas update --channel production --republish` to the prior commit. ~5 minutes to push.
- **Phase 3 (LAN feed):** the auto-backup pre-update means restoration is "stop master, copy backup over, start prior installer." Document in operator README.
- **Phase 3 botched Master update:** the prior installer's NSIS leaves an uninstaller. Operator runs the uninstaller, then runs the prior version's installer. With PRD 10 in place, no data loss.

### Cross-references

- **PRD 04 (server/UI separation):** if Master becomes a Windows service, the update flow needs `sc stop` / `sc start` around the installer. Phase 3 should anticipate this.
- **PRD 10 (backup):** every update path triggers a backup first. They share the backup service.
- **PRD 02 (DB):** if migration to Postgres happens, the update flow must handle the schema migration of Postgres data, not just SQLite. Defer until PRD 02 chooses.

### Operational decisions to lock when this PRD is approved

- Update channel name(s).
- Code-signing cert: yes/no.
- EAS plan: free tier or paid.
- Default OTA-check-on-launch frequency (every boot is fine).
- Whether to publish version-info publicly (probably not; LAN-only).
