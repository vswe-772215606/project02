# SESSION HANDOFF 2026-05-05

This document is for a fresh AI assistant to take over the Chayxana POS project. It contains the full context, current state, and next steps required to continue development without re-explanation.

---

## 1. Project Overview
**Chayxana POS** is a specialized Point-of-Sale system for a large Uzbek restaurant (chayxana).
- **Domain**: 50 rooms + 20 tables. Casual dining with frequent add-ons. 70% dine-in, 30% takeaway.
- **Scale**: ~500 orders/day.
- **Tenancy**: Single-tenant, local network (LAN) only.
- **Apps**:
    - **Master**: Electron + Express + SQLite (Prisma) + React. Serves as the central server and Admin UI.
    - **Kitchen**: Electron + React on touchscreen monoblocks. Real-time ticket display.
    - **Mobile**: React Native (Expo) for waiters. Order entry and bill requests.
- **Hardware**: C++ printer binary (`receipt.exe`) on Windows for 80mm thermal receipts.
- **L10n**: UI in **Uzbek (Latin)**. Currency is **UZS** (no decimals, space as thousands separator). Dates: `DD.MM.YYYY HH:MM`.

---

## 2. Architecture Summary
- **Monorepo**: Managed via `pnpm` workspaces.
- **Communication**: REST API + Socket.IO for real-time notifications (notification-only pattern).
- **Auth**: Custom middleware with `bcryptjs`. DB-backed sessions with a single-device rule (new login kicks old). Waiters use 4-digit PINs; others use passwords.
- **State**: TanStack Query (server state) + Zustand (local UI state).
- **Order Lifecycle**: `DRAFT → SENT → BILL_REQUESTED → PENDING_PAYMENT → CLOSED` (or `WALKOUT`).
- **Logic**:
    - **Cancellations**: Waiters can only cancel if no kitchen tickets are `IN_PROGRESS`.
    - **Billing**: Two-step closing: Admin approves (prints bill) → Admin marks paid.
    - **Discounts**: Bill-level only, capped by settings.
    - **Service Charge**: Fixed UZS amount, after discount, pass-through to waiters.
    - **Stock**: Dailyprep model. Atomic decrements on item add. Restore on cancel only if ticket was `PENDING`.

---

## 3. Network Architecture (Current State)
As of the latest **Network Audit (Phase 1 & 2 complete)**:
- **Master**: Binds to `0.0.0.0:4000`. CORS is permissive for LAN clients.
- **Kitchen**: Resolves Master URL from a JSON config file in Electron's `userData` path. No longer uses hardcoded `.env` fallbacks in production.
- **Mobile**: Resolves Master URL from `AsyncStorage`. Supports Expo metadata fallback for development.
- **Setup UX**: Both apps have a first-run "Server Setup" screen and a dedicated "Server Settings" screen for testing/changing/resetting the connection.
- **States**: UI uses a 5-state vocabulary: `connecting`, `online`, `reconnecting`, `auth-failed`, `unreachable`.

---

## 4. What's Complete

### Master (Backend + Admin UI)
- **Phases 0-7 Complete**: Full scaffolding, schema, services, REST API, Auth, and Printer integration.
- **Admin Pages**: Dashboard (with active order stats), Approval Queue, Orders (with tabs), Menu (Items/Categories/Combos), Tables, Stock (Morning prep + adjustments), Users, Discounts, Settings, Reports (Daily/Monthly), and Audit Log.
- **Bugs Fixed**: Discount caps, OWNER role route access, settings key alignment, and 403/401 handling.
- **Socket.IO**: Real-time emission of `ticket:new`, `order:billRequested`, and `stock:changed` events.

### Kitchen App
- **Phases 0-1 Complete**: Scaffolding and real-time display.
- **Features**: Active tickets grouped by status, add-on item support (new tickets for new items), sound alerts, and "Boshlash" (Start) / "Tayyor" (Ready) actions.
- **Fixes**: Terminal orders excluded from display, combo grouping logic corrected.

### Mobile App (Waiter)
- **Phase 10 (Scaffolding) Complete**:
    - Expo monorepo works via `node-linker=hoisted`.
    - Custom `index.js` entry point.
    - Boots in Expo Go.
    - Server Setup, Settings, and Login screens implemented.
    - React duplicate-instance issues resolved via `metro.config.js`.

### Windows Packaging
- **Electron Builder**: Configured for Master and Kitchen.
- **Prisma Packaging**: Multi-target `binaryTargets` ("windows") with `asarUnpack` + `extraResources` to ensure engines are accessible.
- **Installer**: Successfully tested cross-PC on Wi-Fi. Master auto-boots and runs SQLite migrations in-process via `sql.js` (for migrations only) then hands off to Prisma.

---

## 5. What's NOT Done (Pending or Deferred)

### Planned Next (Priority)
- **Mobile Phase 11**: PIN login polish (UX improvements).
- **Mobile Phase 12**: Order flow (Creating orders, adding items, sending to kitchen).
- **Mobile Phase 13**: Bill flow (Requesting bill, viewing status, bill history).
- **EAS Build**: Generating the final APK for waiter phones.

### Deferred to v2 / Out of Scope
- **Discovery**: Phase 3 of Network Audit (mDNS, QR discovery) is deferred.
- **Features**: No split/merge bills, no per-line discounts, no mobile payments (Click/Payme), no table map UI, no CSV/PDF exports.
- **Hardware**: Real-world stress testing with actual thermal printer in the chayxana environment (pending physical access).

---

## 6. Environment Specifics
- **Dev Box**: Linux (Ubuntu), user `wlw`, path `~/projects/chayxana`.
- **LAN IP**: `192.168.1.50` (Dev server).
- **Database**: PostgreSQL 16 on Linux (`chayxana_app` / `chayxana_dev_pw`). Note: Packaged Windows app uses SQLite.
- **Tools**: `pnpm` 9.0.0 (corepack), Node 20+, `mingw-w64` (for C++ cross-compilation).
- **Test Users**:
    - Owner: `owner` / `owner123`
    - Admin: `admin` / `admin123`
    - Kitchen: `kitchen1` / `kitchen123`
    - Waiters: PIN `5678` (Botir), `2468` (Aziza)

---

## 7. Recent Git History (Last 30 Commits)
```text
ba0a342 (HEAD -> main, origin/main) docs: add technical overview and specification
3aa2105 feat: kitchen + mobile settings UX (test connection, change server, granular connection states, diagnostics)
b169287 feat: unify runtime master URL config (kitchen userData file, mobile expo metadata, remove hardcoded fallbacks)
237bbcd docs: add network audit report
5422812 Handle unreachable kitchen server and refresh receipt binary
d4c321e Allow cleartext HTTP for Android mobile builds
9a28d42 Commit remaining kitchen and Android project changes
f53a7c5 Fix mobile APK build assets and setup flow
c23e335 Fix packaged master routing and add diagnostics logs
bc4822d feat: auto-seed owner and default settings on first install
291e27a fix: replace better-sqlite3 with sql.js for zero-native-compilation SQLite
7acfb1a feat: replace Prisma CLI spawn with in-process SQLite migration runner
090ac95 fix: correct SQLite URL format for Windows paths
053a80d Stop recursive Electron startup in packaged app
d40df6b Switch packaged master app to SQLite startup
f32cc12 Fix Prisma packaging for Windows Electron build
5980585 fix: bundle server module into main entry for production builds
635497b fix: force Prisma client + engines to app.asar.unpacked via extraResources
5941e2c fix: copy .prisma/client via extraResources (asarUnpack misses dot-prefixed dirs)
81eaf9a fix: package master for Windows deployment (multi-target Prisma + asarUnpack)
51eb027 feat: kitchen server setup screen + master shows LAN IP in header
34b49b8 fix: remove buildResources dir reference causing missing icon.ico error
808ec32 fix: remove missing icon.ico references from electron-builder nsis config
aa70d7d fix: pin electron to 31.7.7 so electron-builder can resolve version
8f29beb feat: server URL setup screen on first launch, editable in settings
d015bfb feat: add eas.json for Expo cloud APK builds
50bbb6c fix: update pnpm lockfile after adding electron-builder to kitchen
6fcf80d fix: rewrite build.ps1 with ASCII-only chars and clean PS syntax
331e5fd menu group fixed
6e9ad5e feat: waiter mobile app + build pipeline
```

---

## 8. Known Traps / Gotchas
1. **PNPM + Expo**: MUST use `node-linker=hoisted` in `.npmrc`. Strict symlinks break React Native.
2. **Duplicate React**: `metro.config.js` must alias `react` and `react-native` to the root `node_modules` to prevent "Multiple instances of React" hooks errors.
3. **Prisma Packaging**: Dot-prefixed folders like `.prisma` are skipped by many glob patterns. Use explicit `asarUnpack` and `extraResources` for `.prisma/client`.
4. **Kitchen Config**: Do NOT use `.env` fallbacks in the Kitchen app; use the `userData` JSON pattern established in `b169287`.
5. **Typecheck != Runtime**: Electron's `main` vs `renderer` separation and Asar packaging often break things that pass TypeScript. Always test the packaged app if you touch startup or Prisma logic.

---

## 9. Methodology & Rules
1. **Reproduce First**: Before fixing a bug, script a reproduction (curl or unit test).
2. **Verification**: Show the output of your test/check in the chat. Don't just say "it works."
3. **Surgical Changes**: One commit per unit of work. No unrelated refactoring.
4. **Locked Decisions**: Do not improvise on the core logic (e.g., how stock is decremented) without checking `00-shared/decisions.md`.

---

## 10. Next Priority Tasks
1. **Complete Mobile Phase 11**: Polish PIN login (hiding PIN digits, error animations).
   - *Plan*: `docs/agent-plans/03-mobile/01-pin-login.md`
2. **Implement Mobile Phase 12**: Order entry flow.
   - *Plan*: `docs/agent-plans/03-mobile/02-order-flow.md`
3. **Implement Mobile Phase 13**: Bill requests and status.
   - *Plan*: `docs/agent-plans/03-mobile/03-bill-and-status.md`

---

## 11. Files to Always Read First
- `docs/SESSION_HANDOFF_2026-05-05.md` (This file)
- `docs/agent-plans/00-shared/decisions.md`
- `docs/agent-plans/00-shared/api-contract.md`
- `docs/agent-plans/00-shared/schema.md`
- `docs/NETWORK_AUDIT.md`

---

## 12. Environment Verification
```bash
cd ~/projects/chayxana
git status             # Ensure clean tree
pnpm install           # Ensure hoisted layout
pnpm dev:master        # Master should boot on port 4000
# In a new tab:
curl http://localhost:4000/api/health
```
