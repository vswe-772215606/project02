# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chayxana POS — single-location Uzbek chayxana (teahouse). pnpm monorepo, **mid-migration from an
Electron desktop app to a web application** (branch `feat/web-platform`, slice 1 of 5 done — see
`docs/superpowers/specs/2026-08-16-web-platform-design.md`).

```
packages/db/          Prisma schema (PostgreSQL), migrations, seed
packages/server/      Express + Socket.io API — routes, controllers, services, repositories
packages/admin-ui/    React 19 + Vite SPA, the admin screens (Blocks C1)

apps/web/             Node entry: boots the server, serves the SPA from the same origin
apps/order/           Electron desktop waiter app
apps/mobile/          Expo React Native waiter app
apps/master/          Electron — DOES NOT BUILD, rebuilt as a kiosk shell in slice 5
```

There is no separate kitchen app — the admin is the single point of order approval and payment. All
user-facing strings are in Uzbek. The database is **PostgreSQL**; the SQLite era ended with slice 1
and none of its migration history was carried over.

⚠ `apps/master` is deliberately broken. Its server and renderer moved into `packages/`, its
Electron-only files are deleted, and its `typecheck` is stubbed to an echo. Do not try to fix it —
slice 5 rebuilds it as a thin kiosk window onto the domain. For a working Windows installer, use
branch `feat/remove-walkout`.

Source-of-truth docs (read these before non-trivial changes):
- **`docs/CURRENT_WORKFLOW.md` — START HERE.** Code-verified snapshot of what the system actually does: the money path, order state machine, count-based inventory/COGS, finance formulas, API surface, socket wiring, ranked known defects, and an explicit list of which other docs to distrust. Where any doc disagrees with it, it wins.
- **`docs/AUDIT_FINDINGS.md` — 145 open findings (11 BLOCKER / 18 CRITICAL), audited 2026-08-03 against `docs/POS_STANDARDS.md`. §8 is a live remediation tracker — a fix pass is IN PROGRESS; read §8 before starting work so you don't redo or skip a step.** §1 explains the systemic issue (no detective controls) that ties the top findings together.
- `docs/POS_STANDARDS.md` — the audit rubric: 60 ID'd requirements from the Keurmerk POS reliability standard, Uzbek fiscal law (КМ РУз №943), and WCAG 2.2. Cite these IDs in any new finding.
- `docs/PRD_FOUNDATION.md` — scoping input for a forthcoming PRD over four areas: inventory, finance, calculations, UI/UX. Groups the audit findings by subsystem into numbered requirements (`INV-*`, `FIN-*`, `CALC-*`, `UX-*`). **§7 is the handoff — start there; its top note now says §1 (inventory, including §1.9/§1.10 and `O-1`…`O-4`) is superseded by the count-based inventory design (`docs/superpowers/specs/2026-08-13-count-based-inventory-design.md`)** — don't design inventory or costing from §1 anymore. §2–§4 (finance, calculations, UI/UX) remain live inputs. **§8 lists constraints that must not be "fixed"** — read it before changing any finance formula.
- `docs/agent-plans/00-shared/decisions.md` — product/domain intent (roles, order lifecycle, bill math) and v1 scope exclusions. Labelled "locked", but **several claims have drifted from the code** — see `CURRENT_WORKFLOW.md` §12 before relying on it. Don't change it without explicit instruction.
- **`docs/design/RENDERER_REBUILD.md` — START HERE for any work in `packages/admin-ui/src`.** Status and handoff for the Blocks C1 rebuild: what the renderer is now, how to view it, which typecheck commands are real and which pass vacuously, and the open items that need a decision rather than a fix. ⚠ Written when the renderer lived at `apps/master/src/renderer`; the paths in it predate slice 1, the substance does not.
- **`docs/TECHNICAL_REVIEW_2026-08-16.md` — 75 findings across schema, money path, finance, API, renderer and runtime, ranked by what they cost this business.** Read the verdict and the top-twelve table before touching anything money-related. Several findings are scheduled into the web migration's slice 3 rather than fixed ad hoc.
- **`docs/superpowers/specs/2026-08-16-web-platform-design.md` — the migration this repo is in the middle of.** Eight decisions, five slices, and an explicit list of risks accepted.
- `docs/design/BLOCKS_C1.md` — the renderer design system and the authority on it. No borders, radius, shadows, accent bars or hover; separation is a 2px seam and state is the fill. Type floors: 12px labels / 13px text / 17px money. Target hardware is a **1366×768 touchscreen — no mouse, no hover, no keyboard in normal use**; any change assuming a pointer is wrong for this product.
- `docs/UI_UX_LAYOUT_AUDIT.md` — 158 findings against the **pre-rebuild** renderer. Rationale for the rebuild, not a live tracker; its counts are stale and it has not been re-run.
- `docs/agent-plans/00-shared/conventions.md` — code style and naming. Current.
- `docs/FINANCE_IMPLEMENTATION_SPEC.md` — finance module spec. Current.
- `docs/PROJECT_TECHNICAL_OVERVIEW.md` — system overview; partly historical, verify before relying.

## Commands

Run from repo root unless noted. Node ≥20, pnpm 9, packageManager pinned.

**The whole stack, in Docker — this is the normal way to run it:**

```bash
docker compose -f compose.dev.yaml up -d          # Postgres + the web app on :4000
docker compose -f compose.dev.yaml logs -f web    # wait for "[web] listening on :4000"
docker compose -f compose.dev.yaml down
```

Open `http://localhost:4000` — the SPA and the API are the **same origin**. Never hardcode a host or
port in the renderer; every request is relative.

```bash
pnpm dev             # apps/web with watch (needs DATABASE_URL and a running Postgres)
pnpm dev:ui          # admin-ui alone on :5173, proxying /api and /socket.io to :4000
pnpm dev:order       # Electron-vite dev for the desktop waiter app
pnpm dev:mobile      # expo start (use tunnel mode — see "Mobile dev" below)
pnpm build:ui        # SPA production build → packages/admin-ui/dist
pnpm typecheck       # every package
pnpm test            # every package — only packages/server has real tests today
```

Database (inside `packages/db/`, needs `DATABASE_URL`):
```bash
pnpm exec prisma migrate dev --name <name>   # create + apply a migration
pnpm exec prisma migrate deploy              # apply pending migrations
pnpm exec prisma generate                    # regenerate the client
pnpm exec tsx prisma/seed.ts                 # seed
```

⚠ `prisma.config.ts` replaced the `prisma` block in `package.json`. A config file means Prisma
**no longer auto-loads `.env`** — `DATABASE_URL` must be in the environment. Local dev value:
`postgresql://chayxana:chayxana@localhost:5432/chayxana?schema=public` (`@db:5432` inside a container).

UI (inside `packages/admin-ui/`):
```bash
pnpm run typecheck          # renderer — must be clean, always
pnpm run typecheck:gallery  # gallery fixtures vs the real API types — must be clean, always
pnpm gallery:page           # browser preview of all 15 screens at 1366×768
```

`tsconfig.json` does not cover `gallery/`; `tsconfig.gallery.json` covers both trees. A renderer type
change that breaks a fixture only shows up in the second command — run both.

Smokes (HTTP against a running server, from `packages/server/`):
```bash
pnpm exec tsx scripts/smoke-e2e-flow.ts       # order → send → confirm, stock and COGS
pnpm exec tsx scripts/smoke-stock-count.ts    # count-based stock invariants
pnpm exec tsx scripts/smoke-finance-pnl.ts    # P&L + cash-drawer math
pnpm exec tsx scripts/smoke-summary-report.ts # range report identities
```

All four read `BASE_URL` (default `http://localhost:4000`). **Run them in that order and never
`smoke-summary-report.ts` alone** — a bare seed has no closed orders, so on its own it passes with
every figure at zero. They seed their own fixtures and do not clean up, so absolute numbers only mean
something against a freshly reset database.

### The typecheck floor

`packages/server` sits at **49 pre-existing errors in `src/`**, all inherited from before the port,
concentrated in `orders.controller.ts` (14) and `pdf-report.ts` (8). Plus **14 in `scripts/`**, which
were invisible for the life of the repo because the old `tsc -b` compiled nothing under `scripts/`.
63 total. The rule: `src/` must stay at exactly 49, file-for-file.

`apps/web` re-reports those same 49 because it consumes `@chayxana/server` as TypeScript source. The
number that matters there is errors in its **own** files, which must be 0:
`pnpm --filter @chayxana/web exec tsc --noEmit 2>&1 | grep -cE "^src/"`.

Those 49 are also blocking a structural fix: project references would separate the two packages'
errors, but they need declaration emit, which fails while any type error exists.

⚠ Several `simulate-*.ts` scripts left in `apps/master/scripts/` carry pre-v0.1.3 expectations and
fail against current behaviour. `smoke-cashflow-reversal.ts` — five unfiltered `deleteMany({})` calls
including `User` — was **deleted** in slice 1 rather than carried across; pointing it at a shared
Postgres would have been strictly more dangerous than the SQLite file it already threatened.

## Architecture

### Server (`packages/server/`) and web entry (`apps/web/`)
A plain Node process. `apps/web/src/index.ts` requires `DATABASE_URL`, loads settings, builds the
Express app, mounts the SPA, attaches Socket.io and listens. `apps/web/src/static.ts` holds the one
rule that is easy to break: **the SPA catch-all mounts after every API router**, or an unmatched
`/api` path returns HTML instead of JSON.

The scheduler and the Telegram bot are **not** started by `apps/web` — they are single-instance
concerns and belong with deployment in slice 4.

Printing no longer spawns a binary. `lib/printer-executor.ts` is an injectable seam whose default
logs and succeeds; slice 2 registers an executor that hands jobs to a print agent at the chayxana.

- `packages/server/src/` — backend in layered style:
  - `routes/*.routes.ts` → `controllers/` → `services/*.service.ts` → `repositories/` (only place that touches Prisma).
  - `socket.ts` — Socket.io rooms `admin`, `waiter:{userId}`, and `all` (every authenticated socket joins `all`, for menu/availability broadcasts). There is no `kitchen` room. Notification-only pattern: server emits minimal IDs; clients re-fetch via REST and use the event to invalidate TanStack Query caches.
  - `middleware/` — auth (Bearer token, single-device sessions), error handler that maps `AppError` (see `lib/errors.ts`) to `{ error: { code, message, details } }`.
  - `printer/receipt-builder.ts` + `print.service.ts` — builds the ESC/POS payload and hands it to
    the injectable executor, serialized through a `p-queue` mutex. Only `BILL` / `BILL_REPRINT` remain.

### Database (`packages/db/`)
`prisma/schema.prisma` — **PostgreSQL**. 20 tables: `User`, `Session`, `Category`, `MenuItem`,
`Combo`, `ComboComponent`, `Table`, `Order`, `OrderLine`, `StockEntry`, `Discount`, `Payment`,
`Expense`, `ExpenseCategory`, `ExpenseReturn`, `Debt`, `DebtRepayment`, `AuditLog`, `PrintJob`,
`Setting`. Every money column is `@db.Decimal(14, 2)` — a bare `Decimal` becomes `Decimal(65,30)` on
Postgres, so always annotate a new one.

The ten dead ingredient/recipe/FIFO models were **dropped** in slice 1; the fresh start removed the
only reason to keep them. `Expense.purchaseId` survives on the DTO as a literal `null` because
`ExpenseList`'s "Xarid" chip still reads it — removing it from the clients is later cleanup.

⚠ "One active order per table" is **still unenforced**. The partial unique index Prisma cannot
express was never recreated, so the `P2002` catch in `createDraft` cannot fire.

### Admin UI (`packages/admin-ui/`)
React 19 + Vite + Tailwind, React Router, TanStack Query for server state, Zustand for local UI
state. Built on the **Blocks C1** design system — `components/blocks/` holds the primitives,
`components/layout/` the `Screen` + `Panel` + `NavRail` shell. Every page composes `Screen`; a
`Panel`'s `foot` sits outside the scroll so a primary action can never fall below the fold. See
`docs/design/RENDERER_REBUILD.md`.

**Same-origin, always.** `api/client.ts` uses `BASE = ''` and `socket-client.ts` calls `io()` with no
URL. A build that names a host or port drives whichever server is on that port rather than its own —
that was a real defect before the port (`docs/TECHNICAL_REVIEW_2026-08-16.md` finding 1).

- `gallery/` — browser preview of the real pages against a stubbed `window.fetch`. Fixtures are one
  module per domain under `gallery/fixtures/`; `mock-server.ts` only composes them.

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
