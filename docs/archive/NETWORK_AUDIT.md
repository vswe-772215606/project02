# Network Audit

Date: 2026-05-05

Scope:
- Master HTTP and Socket.IO bind behavior
- Kitchen network configuration, packaging, and runtime storage
- Mobile network configuration and runtime storage
- Cross-device fragility for future Kitchen / Mobile / Order Desktop deployments

Environment note:
- I could not inspect a packaged Windows Kitchen `.exe` from this Linux workspace because no installed Windows artifact exists in the repo.
- I used the available built Kitchen renderer output in `apps/kitchen/out/renderer/` plus the live Electron user-data directory at `/home/wlw/.config/@chayxana/kitchen/` as the closest runtime evidence.

## Current State Per App

### Master

- Master listens on port `4000` from `apps/master/src/main/index.ts:45`.
- It binds the HTTP server to `0.0.0.0`, not `127.0.0.1`, in `apps/master/src/main/index.ts:76-79`.
- Express enables unrestricted CORS with `app.use(cors())` in `apps/master/src/main/server/app.ts:18-22`.
- Socket.IO also allows all origins with `cors: { origin: '*' }` in `apps/master/src/main/server/socket.ts:26-29`.
- Socket authentication is session-token based at handshake time in `apps/master/src/main/server/socket.ts:31-41`, matching `docs/agent-plans/00-shared/api-contract.md:162-189` and `docs/agent-plans/00-shared/decisions.md:143-156`.
- Runtime verification on this host succeeded on both loopback and LAN:
  - `curl -v http://localhost:4000/api/health` returned `200 OK` with `{"ok":true,...}`.
  - `curl -v http://192.168.1.50:4000/api/health` returned the same `200 OK` JSON.
- Conclusion: current Master bind/CORS behavior is correct for same-LAN clients. The server is not limited to localhost.

### Kitchen

- Kitchen resolves the master URL from persisted runtime state first, then from Vite build-time env, then falls back to `http://localhost:4000` in `apps/kitchen/src/renderer/lib/env.ts:3-5`.
- The persisted runtime setting is `serverUrl` inside Zustand `persist`, under the key `chayxana-kitchen-settings`, in `apps/kitchen/src/renderer/stores/settings.store.ts:9-16`.
- On boot, Kitchen reads `serverUrl` immediately in `apps/kitchen/src/renderer/App.tsx:25-30`.
- If a stored URL exists, Kitchen performs a startup health-check against that stored URL before showing login in `apps/kitchen/src/renderer/App.tsx:32-48`.
- If that startup health-check fails, Kitchen clears the stored URL and logs out in `apps/kitchen/src/renderer/App.tsx:40-43`.
- If no `serverUrl` is stored, Kitchen shows the setup screen instead of login in `apps/kitchen/src/renderer/App.tsx:64-72`.
- The setup screen lets the user enter an IP/URL, normalizes it, calls `/api/health`, and persists it only on success in `apps/kitchen/src/renderer/pages/ServerSetupPage.tsx:27-46`.
- The login screen shows the currently stored URL and has a settings button that clears it, forcing the setup flow again, in `apps/kitchen/src/renderer/pages/LoginPage.tsx:49-58`.
- Kitchen HTTP calls use `fetch(${getMasterUrl()}${path})` in `apps/kitchen/src/renderer/api/client.ts:13-16`.
- On HTTP `401`, Kitchen logs the user out and throws a generic `Unauthorized` error in `apps/kitchen/src/renderer/api/client.ts:18-20`.
- Kitchen Socket.IO connects to `io(getMasterUrl(), { auth: { token }, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 5000 })` in `apps/kitchen/src/renderer/hooks/useSocket.ts:49-54`.
- On socket failure, Kitchen only flips connection state offline via `connect_error`; it does not surface the actual error reason to the UI in `apps/kitchen/src/renderer/hooks/useSocket.ts:56-58`.
- The current source CSP allows arbitrary LAN HTTP and WS targets via `connect-src 'self' http://*:* ws://*:*` in `apps/kitchen/src/renderer/index.html:6-9`.
- Packaging includes only `out/**/*` and `node_modules/**/*`; it does not package `.env` files as runtime config in `apps/kitchen/package.json:23-28`.
- The renderer build is emitted to `out/renderer` by Vite in `apps/kitchen/electron.vite.config.ts:24-33`, which means `import.meta.env.VITE_MASTER_URL` is resolved at build time, not from disk at runtime.
- Current repo state confirms that:
  - `apps/kitchen/.env:1` is `VITE_MASTER_URL=http://localhost:4000`.
  - `apps/kitchen/.env.example:1` is `VITE_MASTER_URL=http://192.168.1.10:4000`.
  - The already-built renderer bundle contains `return stored || "http://localhost:4000";` in `apps/kitchen/out/renderer/assets/index-5BCwbZF1.js:18580-18582`.
- Live Kitchen runtime storage on this machine is Chromium local storage, not a human-readable config file:
  - Observed under `/home/wlw/.config/@chayxana/kitchen/Local Storage/leveldb/000003.log:2`.
  - That file currently contains `chayxana-kitchen-settings` with `{"state":{"serverUrl":"http://192.168.1.50:4000"},"version":0}`.

### Mobile

- Mobile resolves the master URL from persisted runtime state first, then falls back directly to `http://192.168.1.50:4000` in source code in `apps/mobile/src/lib/env.ts:3-5`.
- Mobile persists `serverUrl` in AsyncStorage-backed Zustand state under the key `chayxana-settings` in `apps/mobile/src/stores/settings.store.ts:21-33`.
- If no `serverUrl` is stored, the navigator forces the first-run setup screen in `apps/mobile/src/navigation/AppNavigator.tsx:24-42`.
- The mobile setup screen normalizes input, calls `/api/health`, and persists the URL only on success in `apps/mobile/src/screens/ServerSetupScreen.tsx:32-49`.
- Mobile also has a runtime settings screen that edits the stored URL and clears auth so the app reconnects cleanly in `apps/mobile/src/screens/SettingsScreen.tsx:54-70` and `apps/mobile/src/screens/SettingsScreen.tsx:85-110`.
- Mobile HTTP uses `fetch(${getMasterUrl()}${path})` in `apps/mobile/src/api/client.ts:22-25`.
- On HTTP `401`, Mobile calls its unauthorized handler and throws `UNAUTHORIZED` in `apps/mobile/src/api/client.ts:27-29`.
- Mobile Socket.IO connects to `io(getMasterUrl(), ...)` with the same reconnect timings as Kitchen in `apps/mobile/src/hooks/useSocket.ts:27-32`.
- On socket failure, Mobile only sets the connection state offline on `connect_error`; it does not surface the actual reason in `apps/mobile/src/hooks/useSocket.ts:34-36`.
- Android cleartext HTTP is explicitly allowed in `apps/mobile/android/app/src/main/AndroidManifest.xml:16`.
- Mobile defines `MASTER_URL` in Expo metadata:
  - `apps/mobile/app.json:31-35` sets `"MASTER_URL": "http://192.168.1.50:4000"`.
  - `apps/mobile/app.config.js:1-6` overrides that from `process.env.MASTER_URL` if present.
- But the app code never reads Expo `Constants`, `expoConfig`, or `extra`. A repo-wide search found `MASTER_URL` references only in `apps/mobile/app.json` and `apps/mobile/app.config.js`.
- Conclusion: Expo metadata currently does not drive runtime networking. The real mobile fallback is the hardcoded string in `apps/mobile/src/lib/env.ts:5`.

## Findings

1. Master is not the immediate LAN failure point.
   - It binds to `0.0.0.0` in `apps/master/src/main/index.ts:76-79`.
   - Express and Socket.IO both allow cross-origin access in `apps/master/src/main/server/app.ts:20` and `apps/master/src/main/server/socket.ts:27-29`.
   - Health-check succeeded on both `localhost` and `192.168.1.50`.

2. The codebase has no single source of truth for the master address.
   - Locked decisions say Master should live at `192.168.1.10:4000` in `docs/agent-plans/00-shared/decisions.md:228`.
   - API contract also documents `192.168.1.10:4000` in `docs/agent-plans/00-shared/api-contract.md:3`.
   - Kitchen `.env.example` points to `192.168.1.10:4000` in `apps/kitchen/.env.example:1`.
   - Mobile source and Expo metadata point to `192.168.1.50:4000` in `apps/mobile/src/lib/env.ts:5`, `apps/mobile/app.json:31-35`, and `apps/mobile/app.config.js:5`.
   - Current Kitchen development `.env` points to `localhost` in `apps/kitchen/.env:1`.

3. Kitchen has a split configuration model: build-time fallback plus runtime local storage.
   - Build-time fallback is `import.meta.env.VITE_MASTER_URL` in `apps/kitchen/src/renderer/lib/env.ts:5`.
   - Runtime override is a persisted `serverUrl` in browser local storage via `apps/kitchen/src/renderer/stores/settings.store.ts:9-16`.
   - This is operationally fragile because the effective URL depends on both how the app was built and what was previously stored on that specific machine.

4. The checked-in Kitchen build artifact still has `localhost` baked into the bundle.
   - The built renderer contains `return stored || "http://localhost:4000";` in `apps/kitchen/out/renderer/assets/index-5BCwbZF1.js:18580-18582`.
   - This proves the Kitchen renderer currently in the repo was built while `VITE_MASTER_URL` resolved to localhost.

5. Kitchen packaging does not ship a runtime-editable config file.
   - `apps/kitchen/package.json:23-28` packages only `out/**/*` and `node_modules/**/*`.
   - `.env` is not part of the packaged file list.
   - After packaging, the only user-editable master address is the hidden persisted `serverUrl` inside Chromium local storage.

6. Kitchen’s live config is hidden in Chromium storage, not a supportable settings file.
   - Runtime storage path observed on this machine: `/home/wlw/.config/@chayxana/kitchen/Local Storage/leveldb/000003.log:2`.
   - That storage currently contains `chayxana-kitchen-settings` and the value `http://192.168.1.50:4000`.
   - This is hard to inspect or support remotely compared with a real config file under Electron `userData`.

7. Mobile’s declared `MASTER_URL` metadata is dead configuration today.
   - `apps/mobile/app.json:31-35` and `apps/mobile/app.config.js:5` define `MASTER_URL`.
   - `apps/mobile/src/lib/env.ts:3-5` ignores Expo config entirely and hardcodes `http://192.168.1.50:4000`.
   - So changing Expo metadata alone does not change runtime networking behavior.

8. Mobile is more operationally robust than Kitchen only because it has explicit runtime setup and a settings screen.
   - First-run setup is enforced by `apps/mobile/src/navigation/AppNavigator.tsx:31-41`.
   - Runtime editing exists in `apps/mobile/src/screens/SettingsScreen.tsx:54-70` and `apps/mobile/src/screens/SettingsScreen.tsx:85-110`.
   - But the fallback architecture is still tied to one dev LAN IP.

9. Connection diagnostics are weak in both Kitchen and Mobile.
   - Kitchen `connect_error` only sets offline in `apps/kitchen/src/renderer/hooks/useSocket.ts:56-58`.
   - Mobile `connect_error` only sets offline in `apps/mobile/src/hooks/useSocket.ts:34-36`.
   - Neither client surfaces the attempted URL, socket error message, or retry state in the UI.

10. Kitchen does perform a health-check before login, but only against the persisted URL.
    - Startup health-check uses `serverUrl` from the store in `apps/kitchen/src/renderer/App.tsx:32-48`.
    - If that stored value is wrong, stale, or points to a previous deployment, the app resets to setup.
    - If the setup screen is bypassed by stale state, the build-time fallback does not help recover.

11. The current source CSP is not blocking arbitrary LAN connections.
    - `apps/kitchen/src/renderer/index.html:6-9` and `apps/kitchen/out/renderer/index.html:6-9` both allow `http://*:*` and `ws://*:*`.
    - But a previously packaged Kitchen build from before this CSP change would still be a valid explanation for “browser works, app fails.”

12. There is no installer or launcher logic for Windows Firewall.
    - I found no firewall automation in the app packages or scripts.
    - This is still a deployment risk for Master on Windows.
    - In the specific reported repro, firewall is probably not the root cause because the Kitchen PC browser can already reach `/api/health` on Master.

## Root Causes

1. There is no unified network configuration authority.
   - Documentation, source defaults, build-time env, and runtime state all disagree on where Master lives.
   - A deployed client can be “correct” in one layer and wrong in another.

2. Kitchen deployment depends on opaque per-machine state.
   - Effective target selection comes from a hidden persisted `serverUrl`, or if that is missing, from a build-time-inlined Vite env value.
   - That makes packaged Kitchen sensitive to who built it, what `.env` existed at build time, and what was last stored on that machine.

3. The likely explanation for “Kitchen browser can hit Master, app cannot” is client-side misconfiguration or stale packaging, not raw network reachability.
   - Current Master bind/CORS are correct.
   - The Kitchen app can still fail if:
     - it was packaged from a build that baked in `localhost`,
     - it was packaged before the CSP was widened for arbitrary LAN IPs,
     - or its stored `serverUrl` on that PC points somewhere else.

4. Mobile works today by user override, not by a stable architecture.
   - Its runtime setup screen hides the fact that `MASTER_URL` metadata is not actually wired into runtime behavior.
   - The same design would become fragile again when adding another desktop client unless configuration is centralized.

5. Troubleshooting signals are too weak.
   - The apps mostly collapse distinct failures into “offline” or generic login errors.
   - That makes operational debugging much harder in the field and increases the chance that “network is broken” gets blamed on the wrong layer.

## Proposed Architecture

1. Use one explicit runtime master endpoint per client, not mixed build-time and runtime fallbacks.
   - Treat build-time defaults as development convenience only.
   - Production clients should resolve the master endpoint from persisted runtime config first and only.

2. Standardize first-run setup across Kitchen, Mobile, and the future Order Desktop app.
   - Offer three entry points:
     - manual IP entry,
     - QR scan from Master,
     - optional auto-discovery if available.

3. Add Master-generated connection info as the canonical bootstrap.
   - Master should show its current LAN URL in the UI.
   - Master should generate a QR code that encodes the full base URL, such as `http://192.168.1.10:4000`.

4. Use runtime persistence that is explicit and supportable.
   - Electron clients: store the endpoint in a small config file under `app.getPath('userData')`, not hidden Chromium local storage.
   - Expo mobile: store the endpoint in AsyncStorage.
   - Future Order Desktop: use the same Electron `userData` config-file pattern as Kitchen.

5. Support runtime change without reinstall.
   - Every client should expose a visible “Server” settings screen.
   - Include “Change server”, “Reset connection”, and “Test connection” actions.

6. Add lightweight discovery as an enhancement, not the only mechanism.
   - Base layer: static IP or QR/manual entry always works.
   - Optional improvement: Master advertises itself over mDNS/Bonjour on the LAN, and clients can list discovered servers.
   - This is useful, but should not replace explicit manual override.

7. Make outage handling explicit.
   - Clients should health-check Master periodically when offline.
   - Show states such as `connecting`, `connected`, `reconnecting`, `auth failed`, and `server unreachable`.
   - After 30 seconds of failure, show a full-screen degraded-state banner with the current target URL and reset/change options.

8. Keep Socket.IO reconnect, but surface its state.
   - Keep built-in backoff.
   - Show last socket error and last successful contact time in the UI.
   - Re-fetch active data after reconnect, which already matches the current contract in `docs/agent-plans/00-shared/decisions.md:145-149`.

9. Keep server-side LAN defaults permissive and documented.
   - Master should continue binding `0.0.0.0`.
   - CORS should explicitly allow the expected Electron/Expo origins or remain permissive if the deployment model requires it.
   - Windows packaging should document or automate a firewall rule for inbound TCP `4000`.

10. Create one shared “network config” contract for all clients.
    - Same base URL shape
    - Same setup flow
    - Same health-check endpoint
    - Same reconnection semantics
    - Same error-state UX vocabulary

## Implementation Phases

### Phase 1 — Unify Runtime Configuration

- Introduce a single per-client runtime config module for `masterBaseUrl`.
- Remove hardcoded production IP fallbacks from source code paths.
- For Electron, move Kitchen config out of Chromium local storage into an explicit config file under `userData`.
- For Mobile, make runtime resolution use stored URL first and Expo metadata only as a development fallback.
- Add a small diagnostics payload to expose “current target URL” in each client UI.

### Phase 2 — Add Stable Setup and Reset UX

- Build a shared first-run setup pattern for Kitchen, Mobile, and future Order Desktop.
- Add a visible “Server settings” screen in Kitchen, not only the login-page reset icon.
- Add “Test connection”, “Change server”, and “Reset connection” actions.
- Add clearer error states for health-check failure, auth failure, and socket failure.
- Make the current target URL always visible in a diagnostics panel.

### Phase 3 — Add Discovery and Deployment Hardening

- Add Master-side QR generation for the current LAN URL.
- Optionally add mDNS/Bonjour advertisement and client-side discovery UI.
- Add Windows deployment guidance or installer support for opening inbound TCP `4000`.
- Add a documented deployment checklist for static IP, same-SSID requirement, and guest-network isolation.
- Reuse the same network bootstrap contract for the future Order Desktop app.
