# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chayxana POS — single-location Uzbek chayxana (teahouse). pnpm monorepo with three apps: a Windows Electron admin/server (`master`), an Electron desktop waiter app (`order`), and an Expo React Native waiter app (`mobile`). There is no separate kitchen app — the admin on the master desktop is the single point of order approval and payment. LAN-only; the master is the API + Socket.io server at a static IP (e.g. `192.168.1.50:4000`). All user-facing strings are in Uzbek.

Source-of-truth docs (read these before non-trivial changes):
- **`docs/CURRENT_WORKFLOW.md` — START HERE.** Code-verified snapshot of what the system actually does: the money path, order state machine, count-based inventory/COGS, finance formulas, API surface, socket wiring, ranked known defects, and an explicit list of which other docs to distrust. Where any doc disagrees with it, it wins.
- **`docs/AUDIT_FINDINGS.md` — 145 open findings (11 BLOCKER / 18 CRITICAL), audited 2026-08-03 against `docs/POS_STANDARDS.md`. §8 is a live remediation tracker — a fix pass is IN PROGRESS; read §8 before starting work so you don't redo or skip a step.** §1 explains the systemic issue (no detective controls) that ties the top findings together.
- `docs/POS_STANDARDS.md` — the audit rubric: 60 ID'd requirements from the Keurmerk POS reliability standard, Uzbek fiscal law (КМ РУз №943), and WCAG 2.2. Cite these IDs in any new finding.
- `docs/PRD_FOUNDATION.md` — scoping input for a forthcoming PRD over four areas: inventory, finance, calculations, UI/UX. Groups the audit findings by subsystem into numbered requirements (`INV-*`, `FIN-*`, `CALC-*`, `UX-*`). **§7 is the handoff — start there; its top note now says §1 (inventory, including §1.9/§1.10 and `O-1`…`O-4`) is superseded by the count-based inventory design (`docs/superpowers/specs/2026-08-13-count-based-inventory-design.md`)** — don't design inventory or costing from §1 anymore. §2–§4 (finance, calculations, UI/UX) remain live inputs. **§8 lists constraints that must not be "fixed"** — read it before changing any finance formula.
- `docs/agent-plans/00-shared/decisions.md` — product/domain intent (roles, order lifecycle, bill math) and v1 scope exclusions. Labelled "locked", but **several claims have drifted from the code** — see `CURRENT_WORKFLOW.md` §12 before relying on it. Don't change it without explicit instruction.
- **`docs/design/RENDERER_REBUILD.md` — START HERE for any work in `apps/master/src/renderer`.** Status and handoff for the Blocks C1 rebuild on branch `feat/c1-design-system`: what the renderer is now, how to view it without Windows, which typecheck commands are real and which pass vacuously, and the open items that need a decision rather than a fix.
- `docs/design/BLOCKS_C1.md` — the renderer design system and the authority on it. No borders, radius, shadows, accent bars or hover; separation is a 2px seam and state is the fill. Type floors: 12px labels / 13px text / 17px money. Target hardware is a **1366×768 touchscreen — no mouse, no hover, no keyboard in normal use**; any change assuming a pointer is wrong for this product.
- `docs/UI_UX_LAYOUT_AUDIT.md` — 158 findings against the **pre-rebuild** renderer. Rationale for the rebuild, not a live tracker; its counts are stale and it has not been re-run.
- `docs/agent-plans/00-shared/conventions.md` — code style and naming. Current.
- `docs/FINANCE_IMPLEMENTATION_SPEC.md` — finance module spec. Current.
- `docs/PROJECT_TECHNICAL_OVERVIEW.md` — system overview; partly historical, verify before relying.

## Commands

Run from repo root unless noted. Node ≥20, pnpm 9, packageManager pinned.

```bash
pnpm dev:master      # Electron-vite dev for master (admin UI + API server on :4000)
pnpm dev:order       # Electron-vite dev for the desktop waiter app
pnpm dev:mobile      # expo start (use tunnel mode — see "Mobile dev" below)
pnpm build:master    # production build (runs prepare-prisma-package first)
pnpm build:order
pnpm typecheck       # tsc -b — the ONLY command that checks apps/master/src/main.
                     # `tsc -p tsconfig.json` there compiles nothing (solution-style
                     # config: files:[] + references), so a green run from it is vacuous.
                     # Currently 49 errors, all in src/main, all pre-existing. (Was 51;
                     # feat/remove-walkout dropped it deleting markWalkout out of
                     # orders.controller.ts and the walkout table out of pdf-report.ts.)
pnpm lint            # noop in most packages today
```

Master-specific (run inside `apps/master/`):
```bash
pnpm prisma:generate                       # regenerate Prisma client
pnpm exec prisma migrate dev --name <name> # create + apply a migration
pnpm exec tsx prisma/seed.ts               # seed dev.db
pnpm exec tsx scripts/smoke-e2e-flow.ts    # end-to-end flow — HTTP against a running server
pnpm exec tsx scripts/smoke-stock-count.ts # count-based stock invariants — same (HTTP)
pnpm exec tsx scripts/smoke-finance-pnl.ts # P&L + cash-drawer math — same (HTTP)
pnpm run typecheck:renderer                # renderer only
pnpm run typecheck:gallery                 # gallery fixtures vs the real API types
pnpm gallery:page                          # browser preview of all 15 screens at 1366×768
pnpm exec electron-vite build              # production renderer + main build
pnpm package:win                           # NSIS installer (Windows) — UPGRADES an existing install
pnpm package:win:next                      # side-by-side installer — installs BESIDE one (see below)
pnpm build:printer                         # cross-build receipt.exe via mingw (Linux)
pnpm build:printer:win                     # build receipt.exe via MSVC (Windows)
```

Single-file typecheck: `pnpm --filter @chayxana/<app> typecheck`. There is no test runner configured — verification is via the `scripts/smoke-*.ts` family (some run in-process against a throwaway SQLite; the three above, plus `smoke-summary-report.ts`, drive a **running** server over HTTP instead — see the Docker harness below) plus manual flows. Note: `tsc -b` does not typecheck anything under `scripts/` (`npx tsc --listFiles -p tsconfig.main.json | grep -c "/scripts/"` → `0`) — every script here is entirely untypechecked; running it is the only check it gets.

⚠ Not all scripts are live. Several `simulate-*.ts` scripts carry pre-v0.1.3 expectations and fail against current behaviour. **`scripts/smoke-cashflow-reversal.ts` is destructive and unguarded** — it runs in-process against whatever `DATABASE_URL` points at (not HTTP, despite sitting next to the HTTP-driven smokes above), and its cleanup step is `deleteMany({})` with no `where` clause against `Payment`, `Expense`, `Order`, `ExpenseCategory` and `User` — every row in each. Its header comment assumes a dedicated throwaway SQLite file; nothing in the code enforces that. Never run it against `dev.db` or the Docker harness's shared database. It also currently fails outright against the live schema, independent of this hazard — see `docs/CURRENT_WORKFLOW.md` §13. Read a script before trusting a green run.

### Build variants — where the database lives

`src/main/app-identity.ts` is the single place that decides what a build calls itself. It matters
because **Electron derives `userData` from `app.getName()`, and the SQLite database is
`<userData>/data/master.sqlite`** — so the app's name *is* the database path.

That name is **`@chayxana/master`**, the `name` field of `package.json`. It is **not**
`build.productName` ("Chayxana Master"): `productName` under `build` is electron-builder config,
read only when packaging, and Electron never sees it (there is no top-level `productName`).
Verified against `app-builder-lib/out/appInfo.js` — electron-builder does not rewrite the packaged
`package.json`. So the live database is at `%APPDATA%\@chayxana\master\data\master.sqlite`.

⚠ Two consequences. First, **renaming `build.productName` alone does not separate two installs** —
it moves the install directory and the Start Menu entry while leaving both builds on the same
database. Second, **`installer.nsh`'s database-wipe prompt cannot fire**: it tests
`$APPDATA\${PRODUCT_NAME}\data\master.sqlite`, i.e. `%APPDATA%\Chayxana Master\...`, which no build
has ever written. `AUDIT_FINDINGS.md` `C-2` overstates the risk on that basis; the prompt is dead
code, not a live hazard.

| | `production` (default) | `next` (`pnpm package:win:next`) |
|---|---|---|
| app name → userData | untouched (`@chayxana/master`) | `chayxana-master-next` |
| appId | `com.chayxana.master` | `com.chayxana.master.next` |
| productName / install dir / shortcut | Chayxana Master | Chayxana Master (Yangi) |
| port | 4000 | 4100 |
| firewall rule | `Chayxana Master (TCP 4000)` | `Chayxana Master (Yangi) (TCP 4100)` |
| NSIS hooks | `installer.nsh` | `installer.next.nsh` (no wipe prompt) |

`production` deliberately does **not** call `app.setName()` at all — the call is dead-code
eliminated from that bundle, so its behaviour is byte-identical to the shipped v0.1.x builds and an
upgrade cannot lose the existing database. Only `next` renames itself.

The variant is a **build-time** choice (`CHAYXANA_VARIANT=next`, baked in by
`electron.vite.config.ts`), never a runtime setting — a toggle that can move the database is a
toggle that can lose it. The CI workflow takes it as a `workflow_dispatch` input; tag pushes always
build `production`.

Waiter clients default to `:4000`, so a `next` master needs the order app and mobile pointed at
`:4100` by hand.

### Headless dev server (Docker)

Non-Windows dev hosts don't run Electron, so `dev:master` can't provide the server the HTTP smokes
above need. `compose.dev.yaml` builds a container that installs, migrates, and runs
`scripts/serve-headless.ts` — the same Express + Socket.io server `main/index.ts` starts, minus the
Electron shell, Telegram bot, mDNS, scheduler, and printer init — on `localhost:4000`.

```bash
docker compose -f compose.dev.yaml up -d
# fresh seed:
docker compose -f compose.dev.yaml exec master-dev bash -lc \
  "rm -f apps/master/prisma/dev.db && pnpm --filter @chayxana/master exec prisma migrate deploy && pnpm --filter @chayxana/master exec tsx prisma/seed.ts"
docker compose -f compose.dev.yaml restart master-dev
docker compose -f compose.dev.yaml exec master-dev pnpm --filter @chayxana/master exec tsx scripts/smoke-stock-count.ts
docker compose -f compose.dev.yaml down
```

## Architecture

### Master (`apps/master/`)
Electron app where the **main process hosts the Express + Socket.io server**, and the renderer is the admin desktop UI. The same binary serves API clients from the order desktop app and mobile.

- `src/main/index.ts` — Electron bootstrap. Acquires single-instance lock, sets up Prisma runtime (`prisma-runtime.ts`), bootstraps packaged SQLite (`sqlite-bootstrap.ts`), then starts the HTTP server before opening the BrowserWindow. Heavy startup logging into `userData/`.
- `src/main/server/` — backend in layered style:
  - `routes/*.routes.ts` → `controllers/` → `services/*.service.ts` → `repositories/` (only place that touches Prisma).
  - `socket.ts` — Socket.io rooms `admin`, `waiter:{userId}`, and `all` (every authenticated socket joins `all`, for menu/availability broadcasts). There is no `kitchen` room. Notification-only pattern: server emits minimal IDs; clients re-fetch via REST and use the event to invalidate TanStack Query caches.
  - `middleware/` — auth (Bearer token, single-device sessions), error handler that maps `AppError` (see `lib/errors.ts`) to `{ error: { code, message, details } }`.
  - `printer/` + `print.service.ts` — spawns `resources/bin/receipt.exe` (C++/Win32 ESC/POS) via `execFile`, serialized through a `p-queue` mutex so concurrent jobs don't collide on the physical printer. Only `BILL` / `BILL_REPRINT` types remain.
- `prisma/schema.prisma` — SQLite-backed schema. Core models: `User`, `Session`, `Category`, `MenuItem`, `Combo`, `Table`, `Order`, `OrderLine`, `StockEntry`, `Discount`, `Payment`, `Expense`, `Debt`, `AuditLog`, `PrintJob`. `Ingredient`/`Recipe`/`Purchase`/`Stocktake`/`Waste` models remain in the schema for historical data but have no live code paths — inventory is count-based on `MenuItem` (see `docs/superpowers/specs/2026-08-13-count-based-inventory-design.md`). ⚠ "One active order per table" is **currently unenforced** — migration `20260607041034` rebuilt the `Order` table and did not recreate the partial unique index, so the `P2002` catch in `createDraft` can no longer fire.
- `src/renderer/` — React 19 + Vite + Tailwind, React Router, TanStack Query for server state, Zustand for local UI state. (Root `pnpm.overrides` pins react/react-dom to 19.1.0 workspace-wide; `apps/order/package.json` still *declares* ^18.3.0 but the override wins.) Rebuilt on the **Blocks C1** design system — `components/blocks/` holds the primitives, `components/layout/` the `Screen` + `Panel` + `NavRail` shell. Every app page composes `Screen`; a `Panel`'s `foot` sits outside the scroll so a primary action can never fall below the fold. See `docs/design/RENDERER_REBUILD.md`.
- `gallery/` — browser preview of the real renderer against a stubbed `window.fetch`, since the app itself only runs in Electron on Windows. Fixtures are one module per domain under `gallery/fixtures/`; `mock-server.ts` only composes them.

### Order (`apps/order/`)
Electron desktop waiter app — the keyboard/touchscreen equivalent of the mobile app. PIN login, create/edit drafts, send orders. Connects to master via REST + Socket.io using a `MasterUrlProvider` that persists the server URL in `userData`. Same renderer style as master (sidebar shell, shadcn primitives, TanStack Query).

### Mobile (`apps/mobile/`)
Expo React Native (SDK 54, RN 0.81, React 19). Waiter app: PIN login, take/send orders. Talks to master over REST + Socket.io at `extra.MASTER_URL` (set by `app.config.js`, defaults to `http://192.168.1.50:4000`).

## Mobile dev (pnpm + Expo + monorepo)

This setup is fragile — three invariants must hold (kept in [[project_mobile_setup]] memory):

1. **`.npmrc` at repo root** must contain `node-linker=hoisted` + `shamefully-hoist=true` (already set). Required for Metro to resolve hoisted RN packages.
2. **`apps/mobile/index.js`** is the entry (`registerRootComponent(App)`). Do not rename — `package.json` `"main": "./index.js"` and `app.json` rely on it.
3. **`apps/mobile/metro.config.js`** pins `react`, `react-native`, `react-dom` via `extraNodeModules` to the workspace-root copies. Two RN copies → invariant-violation crash. Do not edit without verifying.

Use **Expo tunnel mode** (`npx expo start --tunnel`) when developing — direct LAN tends to fail on the dev box.

## Conventions (from `docs/agent-plans/00-shared/conventions.md`)

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any`; use `unknown` and narrow.
- 2-space indent, single quotes, semicolons, trailing commas.
- Files: `kebab-case.ts`, `PascalCase.tsx` for React components.
- Master backend uses **CommonJS** in main process; everywhere else is ES modules.
- All Prisma calls live in `repositories/`. Services orchestrate; controllers stay thin.
- Errors: throw `AppError` / `Errors.*` from `src/main/server/lib/errors.ts`. The central error middleware serializes it.
- All user-facing text is in **Uzbek**. No i18n library.

## Domain rules to respect

- **Order state machine** is enforced server-side; do not bypass it from the renderer. The graph is `DRAFT → SENT → CLOSED`, with `DRAFT|SENT → CANCELED` as the only terminal branch. There is no `WALKOUT` — an unpaid bill closes as nasiya, with the admin picking the debtor from the debt ledger on the confirm ticket (`OrderTicket.tsx`; see `docs/CURRENT_WORKFLOW.md` §2 "Closing an unpaid order"), or as a full discount. A 100% food discount still leaves the service charge owed — that is the waiter's pay and is meant to survive a comped meal; nasiya settles the remainder. There is no `BILL_REQUESTED` and no `PENDING_PAYMENT`. See `decisions.md`.
- **Single confirm action**: `POST /api/orders/:id/confirm` is the only path from `SENT` to `CLOSED`. It atomically validates payments, snapshots totals, inserts `Payment`/`Debt` rows, prints the bill (blocking — failure rolls the whole transaction back), and flips the order to `CLOSED`.
- **Stock moves at line-add time, not at any status transition.** `send` and `confirm` touch no inventory. Adding a line atomically decrements the item's `stockCount` and is rejected (`OUT_OF_STOCK`) if the count is 0 or `NULL` ("sanoq kiritilmagan" — never counted). Cancelling or decreasing a line restores stock from **both `DRAFT` and `SENT`** (deliberate — commit `000e540`); every cancellation restores; nothing consumes without restoring. `decisions.md` still says "SENT does not restore" and is stale on this point. See `docs/CURRENT_WORKFLOW.md` §4 for the full count/cost model.
- **Roles**: OWNER sees finance/profit; ADMIN does not. WAITER is mobile/order-app only. Don't expose owner-only data to lower roles. ⚠ This is currently enforced client-side only for profit — `/api/finance/daily` is ADMIN+OWNER and still returns `pnl.profit` on the wire.
- **v1 scope explicitly excludes**: split/merge bills, per-line discounts, Click/Payme, structured modifiers, multi-tenant. Don't add them speculatively.

## Printer

`apps/master/cpp/receipt.cpp` is a Win32 RAW ESC/POS spooler. Build artifact lands at `apps/master/resources/bin/receipt.exe` and is bundled via `extraResources` in electron-builder. On Linux dev hosts, `scripts/build-printer.sh` uses `x86_64-w64-mingw32-g++` to cross-compile.
