# PRD 04 — Master server / admin UI separation

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Architecture (process model, deployment)
- **Related code:** `apps/master/src/main/index.ts`, `apps/master/src/main/server/`, `apps/master/package.json` (electron-builder), `build.ps1`
- **Related docs:** `docs/PROJECT_TECHNICAL_OVERVIEW.md` (§1 "System Architecture"), `docs/NETWORK_AUDIT.md`

---

## 1. Context

The Master app today is **a single Electron process that hosts the HTTP+Socket.io server in the main process and the admin UI in the renderer**. They share a lifetime: the API is up exactly when the BrowserWindow is up. From `apps/master/src/main/index.ts`:

- Startup sequence (`runStartup`, lines 180-205): bootstrap SQLite → start HTTP/Socket.io server on `0.0.0.0:4000` → create main BrowserWindow.
- `window-all-closed` handler (lines 243-247): on Windows/Linux, when the admin closes the last window, **the entire app process quits**. That kills the server, which kills every client (kitchen + waiter mobiles).

This was a defensible v1 decision: simplest possible deployment, one icon to double-click. But it has now collided with reality in several ways:

1. **Closing the admin window stops the kitchen.** Owners frequently want to minimise or close the admin UI on the central machine without realising it's also "the server." Reports from the audit period (cf. SESSION_HANDOFF) suggest this has caused outages where kitchen displays simply went dead and nobody knew why.
2. **Admin UI crashes take down the server.** Renderer-process crashes are logged (`render-process-gone` handler, lines 138-142), but a sufficiently broken renderer can cause the user to force-quit the app and lose all in-flight requests.
3. **Updates require quitting the admin UI.** Any installer-based update path (PRD 11) cannot replace the server binary while the BrowserWindow is open. Operational downtime is non-trivial.
4. **There's no headless deployment.** The Telegram bot (`telegram-bot.service.ts`, started at `index.ts:79`) runs inside the Electron process. If the chayxana wants the bot up 24/7 but the admin UI only used during business hours, they can't separate the two without architectural change.
5. **Multi-machine future.** Any future where admin UI runs on the owner's laptop while the server runs on a dedicated mini-PC in the kitchen requires this separation. NETWORK_AUDIT phase 1/2 already added remote-master URL config to all clients — but never extracted the admin UI as a client.

The fundamental question: **should the API server be a long-lived process independent of the admin UI?**

## 2. Goals / Non-goals

### Goals

- Decouple **server uptime** from **admin UI uptime**.
- Make it operationally safe for the owner to close/minimise/reopen the admin UI without disrupting kitchen or waiter clients.
- Keep deployment simple — ideally still "one installer, double-click."
- Preserve the current Telegram bot, scheduler, and socket pipeline lifecycle.

### Non-goals

- Splitting the server into microservices. The server stays monolithic.
- Multi-machine server deployment (one server, multiple admin UIs on different boxes). Adjacent topic; this PRD lays the groundwork but does not solve it.
- Changing the protocol or schema. REST + Socket.io stay as-is.
- Cross-platform daemonisation (macOS / Linux). Production target is Windows; other platforms remain "runs from CLI."

## 3. Current state (code-grounded)

| Concern | File / lines | Behaviour |
|---|---|---|
| Single-instance lock | `index.ts:31` | Acquires `app.requestSingleInstanceLock()`. Duplicate launches focus existing window. |
| Server bootstrap | `index.ts:51-99` | Imports + starts Express, attaches Socket.io, listens on `0.0.0.0:4000`, starts scheduler + Telegram bot. |
| Window creation | `index.ts:101-164` | Creates BrowserWindow after server is up. |
| Process lifetime | `index.ts:243-247` | `app.quit()` when all windows closed (non-darwin). |
| Server hosted in | Electron main process | Same V8 isolate as the rest of main. Prisma client lives here. |
| Renderer-to-server transport | HTTP + WebSocket over loopback | Renderer fetches `http://localhost:4000/api/...` like any other client. So the admin UI is **already a network client** of the server. |
| Build artefact | NSIS installer (`apps/master/package.json` `build` section) | Single `.exe`. No service-install hook. |
| Background jobs | `startScheduler` (called in `startServer:87`) | In-process. Examples: daily cleanup of stale drafts, finance report scheduling. |
| Telegram bot lifetime | Spawned at server start (`index.ts:79-81`) | Runs while Electron process runs. |

A key fact: the admin UI **already talks to the API over HTTP+WS like any other client**. The renderer was designed against the same REST contract used by Kitchen and Mobile. So "splitting" doesn't require rewriting the admin UI's data layer — only changing how the server starts and stops relative to the UI window.

## 4. Options

### Option A — Status quo (rejected baseline)

Server lifetime == window lifetime. Document it loudly and call it correct.

- **Pros:** zero work, simplest mental model.
- **Cons:** every concern in §1 remains. Listed only as the reference baseline.

### Option B — Detach the window from the process

Keep one Electron process, but stop quitting when the window closes. Minimising / closing the window only hides the UI; the server keeps running. Quitting requires a tray menu action or `app.quit()` from a "Quit Chayxana" menu item.

- **Mechanism:**
  - Remove the `app.quit()` from `window-all-closed`.
  - Add an Electron tray icon (`Tray` API). Right-click menu: "Show admin UI", "Quit Chayxana", "Server status", "Open logs folder".
  - Closing the BrowserWindow calls `mainWindow.hide()` instead of letting Electron quit.
  - "Start with Windows" toggle in settings.
- **Pros:**
  - Minimal change: one process, one installer, one mental model. Just stop killing the server when the window goes away.
  - Solves the "closed the admin UI by mistake" problem completely.
  - Tray icon is a clear affordance ("the server is running").
  - Renderer crashes: the renderer can be re-created without restarting the server (Electron can `BrowserWindow` again from scratch).
- **Cons:**
  - The server still dies if the Electron main process dies (e.g., GPU crash, OS update reboot). No supervised restart.
  - Server updates still require the user to "Quit Chayxana" from the tray. Not service-grade.
  - One process = one V8 heap. If admin UI memory leaks, it affects the server's RAM too.
  - Owners who genuinely want the admin app *off* might be confused that the server is still running.

### Option C — Server as a Windows service, admin UI as a separate Electron app

Split into two artefacts:

- `chayxana-master-service.exe`: a Node.js entry point that starts the Express + Socket.io server, Prisma, Telegram bot, scheduler. Installed and managed by Windows Service Manager. Auto-starts at boot.
- `chayxana-admin.exe`: a thin Electron app that *only* hosts the renderer and talks to the local service over `http://localhost:4000` like any other client.

- **Mechanism:**
  - Build the service binary with `pkg` or `electron-builder` (extracting the Node runtime).
  - Use `node-windows` or NSSM (Non-Sucking Service Manager) to install/manage as a Windows service. NSIS installer registers the service on first install and starts it.
  - Admin UI installer creates a desktop shortcut to `chayxana-admin.exe`.
  - On admin UI launch: probe the service URL, if unreachable show "Service not running — start it?" with an action that uses `sc start ChayxanaMasterService`.
- **Pros:**
  - True separation. Service can restart independently. Auto-start at boot. Survives admin UI crashes and OS reboots.
  - Updates: stop service, replace binary, start service. Admin UI can update independently. No coupled deployment.
  - Future-ready for "admin UI on owner's laptop, server on kitchen mini-PC." Same architecture, just network instead of loopback.
  - Telegram bot runs 24/7 regardless of admin UI state.
- **Cons:**
  - Significantly more deployment complexity. Service install requires admin elevation. Service-recovery rules need tuning.
  - Two installers (or one installer that runs two phases). Owners need to understand "Chayxana Service" vs "Chayxana Admin."
  - Logs are now in two places (service log + admin renderer log).
  - Windows service troubleshooting is hostile to non-technical users.
  - The sql.js bootstrap (PRD 02) was written assuming `app.getPath('userData')`. Services run as `SYSTEM` (or a service account) with a different userData path — need to relocate the DB or run the service as the user.

### Option D — Headless mode for the server inside Electron + tray

A middle path. Keep Electron for the server, but make the BrowserWindow truly optional. Server starts at OS boot via "Start with Windows" registry entry pointing to `chayxana-master.exe --headless`. Admin UI is launched by clicking the desktop icon, which sends a `second-instance` message that opens the BrowserWindow against the already-running headless server.

- **Mechanism:**
  - `--headless` flag: `index.ts` skips `createWindow()`, just tray icon.
  - Normal launch (no flag): if single-instance lock acquired, run headless + create window; if not, fire `second-instance` event which the running headless process handles by opening a window.
  - Already partially supported: `second-instance` handler at `index.ts:210-212`.
- **Pros:**
  - One artefact, one installer (vs Option C's two).
  - Server is up at boot, independent of when the admin UI is opened.
  - Reuses Electron's existing tray + window plumbing.
  - Less invasive than Option C: no Windows service, no NSSM.
- **Cons:**
  - Still an Electron process. ~150MB resident even when no UI is shown. Acceptable on a dedicated chayxana machine; wasteful in principle.
  - Boot-time auto-start via Registry Run key isn't as robust as a Windows service (no service-recovery, no `Automatic (Delayed Start)`).
  - GPU/render-process crashes in the renderer still surface in the main process logs even when running headless mode.

### Option E — Stay in one process, but add "supervised restart"

Don't split. Add a tiny watchdog process that re-launches the main app if it dies.

- **Mechanism:**
  - A small `chayxana-watchdog.exe` (Win32 / .NET / Go binary, ~5MB) that spawns `chayxana-master.exe` and re-spawns it on exit.
  - Watchdog is the thing installed as a Windows service.
- **Pros:**
  - Cheapest path to "server stays up across crashes."
  - No architectural change to the main app.
- **Cons:**
  - Doesn't solve the "closing the window kills the server" problem unless combined with Option B.
  - Adds a third process to reason about.
  - Watchdog itself needs ownership.

## 5. Decision matrix

| Dimension | A (status quo) | B (tray, no service) | C (real service) | D (headless flag) | E (watchdog) |
|---|---|---|---|---|---|
| Server survives window close | No | Yes | Yes | Yes | Only if combined w/ B |
| Server survives app crash | No | No | Yes (auto-restart) | No | Yes |
| Server auto-starts at boot | No | Optional (Run key) | Yes | Optional (Run key) | Yes |
| Decoupled updates | No | No | Yes | No | No |
| Operational complexity | None | Low | High | Low | Medium |
| Install complexity | Single .exe | Single .exe | Two artefacts + service install | Single .exe | Service install for watchdog |
| Footprint | 1 process | 1 process | 2 processes | 1 process | 2 processes |
| Future remote-admin-UI | Hard | Hard | Native | Possible | Hard |
| Effort | 0 | S | L | M | S |

## 6. Open questions

1. **Where does the chayxana actually want the server to run?** If "on the same machine as the admin UI, always," Option B is enough. If "on a dedicated mini-PC in the kitchen, never touched," Option C is the right shape.
2. **Who runs install?** If a technician sets it up once per chayxana, service-install (Option C) is fine. If the owner does it themselves, single-installer (B/D) is much safer.
3. **How important is 24/7 Telegram bot uptime?** If the owner depends on the bot when they're not on-site, the server must be independent of the admin UI session — pushes us toward C or D.
4. **Update cadence?** If we update monthly, decoupled updates (Option C) save real time. If updates are rare, the gain is small.
5. **Is there really a renderer-crash problem?** If `render-process-gone` events in logs are rare, the "renderer crash kills server" risk is theoretical.
6. **Does the chayxana machine reboot regularly?** If Windows Update reboots it overnight, auto-start at boot (Option C/E with Run key) is critical. Otherwise less so.

## 7. Recommendation

**Option B (tray + no quit-on-close) as Phase 1, leaving the door open for Option C as Phase 2 if/when multi-machine becomes real.**

Rationale:

- The biggest, most common, lowest-effort win is to **stop quitting the server when the admin closes the window**. That's a 30-line change plus a tray icon plus some testing. It removes the single most operationally-disruptive failure mode reported anecdotally.
- A real Windows service (Option C) is the architecturally cleanest answer but the **install / support cost is real** on Windows. The chayxana operator is not a sysadmin. Until there's a concrete reason (multi-machine, decoupled updates, regulatory uptime), the cost outweighs the benefit.
- Option D (headless flag) is appealing but adds boot-time complexity (Run key vs service) without giving us the supervised-restart benefit. If we're going to invest, jump to C.
- Option E adds processes without solving the closing-the-window problem on its own.
- The recommendation in plain language: **make the server keep running when the window closes, give it a tray icon so the owner can tell it's there, and revisit "Windows service" if 24/7 Telegram uptime or remote admin UI ever becomes a hard requirement.**

## 8. Rollout

### Phase 1 — Option B

1. **Remove `app.quit()` from `window-all-closed`.** Replace with a no-op (or with `mainWindow?.hide()` on the actual close intercept).
2. **Add tray icon.** `Tray` API with menu:
   - "Boshqaruvni ochish" (Show admin UI) — calls `createWindow()` if hidden/destroyed.
   - "Serverni qayta ishga tushirish" (Restart server) — restarts the HTTP server without killing the process (useful for support).
   - "Loglarni ochish" (Open logs) — `shell.openPath(logger.path)`.
   - "Server holati: ishlamoqda" (Status: running) — passive display.
   - "Chiqish" (Quit Chayxana) — actually calls `app.quit()`.
3. **Add "Start with Windows" setting.** Toggle in admin UI settings. Implemented via `app.setLoginItemSettings({ openAtLogin: true })`.
4. **Test:** close the admin window, verify a kitchen client can still hit `/api/health`, verify Telegram bot still responds. Reopen admin from tray. Quit from tray, verify clean shutdown.
5. **Update docs:** add a small "the server stays running in the system tray" note in the install/operator README. Single screenshot of the tray menu.

### Phase 2 — Option C (only if triggered)

Triggers that warrant escalation to Option C:

- **24/7 Telegram bot becomes a hard requirement.** Today the Electron-main-as-server model works as long as the machine is on. If the machine reboots overnight (Windows Update), bot is down until someone logs in and double-clicks the app. Auto-start at boot via Run key (Phase 1 setting) helps, but a service is still more reliable.
- **Admin UI runs on a different machine from the server** (owner's laptop). Requires actual service deployment.
- **Decoupled updates** — admin UI updated weekly, server quarterly. Same install would be awkward.

If triggered:

1. Extract server into a Node entry point that does not depend on Electron's `app` module. The only Electron API touched today is `app.getPath('userData')` — replace with an env-driven path resolver (`MASTER_DATA_DIR` falling back to platform-specific defaults).
2. Bundle with `pkg --target node20-win-x64` into `chayxana-master-service.exe`.
3. Use NSSM or `node-windows` to install as a Windows service. NSIS installer runs the service-install step.
4. Admin UI becomes a thin Electron client. Still talks to `http://localhost:4000`.
5. Update bootstrap to use service-friendly paths (DB lives under `%ProgramData%\Chayxana` rather than user-scoped `%AppData%`).
6. Independent installers and update channels.

### Observability

- Phase 1: tray-icon status reflects server-listening state. Add a simple health-poll inside main that flips the tray icon to red when the HTTP server stops listening.
- Boot-time log line: "started in headless-capable mode, server listening, window will follow."

### Rollback

- Phase 1 is reversible by restoring the `app.quit()` line. Cost: zero.
- Phase 2 is more invasive — keep the Phase-1 binary buildable on a feature flag (`SPLIT_SERVICE=false` falls back to the Electron-hosted server).
