# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chayxana POS — single-location Uzbek chayxana (teahouse). pnpm monorepo with three apps: a Windows Electron admin/server (`master`), an Electron desktop waiter app (`order`), and an Expo React Native waiter app (`mobile`). There is no separate kitchen app — the admin on the master desktop is the single point of order approval and payment. LAN-only; the master is the API + Socket.io server at a static IP (e.g. `192.168.1.50:4000`). All user-facing strings are in Uzbek.

Source-of-truth docs (read these before non-trivial changes):
- `docs/PROJECT_TECHNICAL_OVERVIEW.md` — system overview.
- `docs/agent-plans/00-shared/decisions.md` — **locked** product/domain decisions (roles, order lifecycle, bill math). Do not change these without explicit instruction.
- `docs/agent-plans/00-shared/conventions.md` — code style and naming.
- `docs/FINANCE_IMPLEMENTATION_SPEC.md` — finance module spec.

## Commands

Run from repo root unless noted. Node ≥20, pnpm 9, packageManager pinned.

```bash
pnpm dev:master      # Electron-vite dev for master (admin UI + API server on :4000)
pnpm dev:order       # Electron-vite dev for the desktop waiter app
pnpm dev:mobile      # expo start (use tunnel mode — see "Mobile dev" below)
pnpm build:master    # production build (runs prepare-prisma-package first)
pnpm build:order
pnpm typecheck       # tsc --noEmit across all workspaces
pnpm lint            # noop in most packages today
```

Master-specific (run inside `apps/master/`):
```bash
pnpm prisma:generate                       # regenerate Prisma client
pnpm exec prisma migrate dev --name <name> # create + apply a migration
pnpm exec tsx prisma/seed.ts               # seed dev.db
pnpm exec tsx scripts/simulate-flow.ts     # end-to-end flow against running server
bash scripts/api-smoke.sh                  # curl-based smoke test, BASE_URL=http://localhost:4000
pnpm package:win                           # NSIS installer (Windows)
pnpm build:printer                         # cross-build receipt.exe via mingw (Linux)
pnpm build:printer:win                     # build receipt.exe via MSVC (Windows)
```

Single-file typecheck: `pnpm --filter @chayxana/<app> typecheck`. There is no test runner configured — verification is via the smoke scripts above and manual flows.

## Architecture

### Master (`apps/master/`)
Electron app where the **main process hosts the Express + Socket.io server**, and the renderer is the admin desktop UI. The same binary serves API clients from the order desktop app and mobile.

- `src/main/index.ts` — Electron bootstrap. Acquires single-instance lock, sets up Prisma runtime (`prisma-runtime.ts`), bootstraps packaged SQLite (`sqlite-bootstrap.ts`), then starts the HTTP server before opening the BrowserWindow. Heavy startup logging into `userData/`.
- `src/main/server/` — backend in layered style:
  - `routes/*.routes.ts` → `controllers/` → `services/*.service.ts` → `repositories/` (only place that touches Prisma).
  - `socket.ts` — Socket.io rooms `admin` and `waiter:{userId}`. There is no `kitchen` room. Notification-only pattern: server emits minimal IDs; clients re-fetch via REST and use the event to invalidate TanStack Query caches.
  - `middleware/` — auth (Bearer token, single-device sessions), error handler that maps `AppError` (see `lib/errors.ts`) to `{ error: { code, message, details } }`.
  - `printer/` + `print.service.ts` — spawns `resources/bin/receipt.exe` (C++/Win32 ESC/POS) via `execFile`, serialized through a `p-queue` mutex so concurrent jobs don't collide on the physical printer. Only `BILL` / `BILL_REPRINT` types remain.
- `prisma/schema.prisma` — SQLite-backed schema. Core models: `User`, `Session`, `Category`, `MenuItem`, `Combo`, `Table`, `Order`, `OrderLine`, `Ingredient`, `Recipe`, `IngredientMovement`, `Discount`, `Payment`, `Expense`, `Debt`, `AuditLog`, `PrintJob`. A partial unique index enforces "one active order per table".
- `src/renderer/` — React 18 + Vite + Tailwind, React Router, TanStack Query for server state, Zustand for local UI state.

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

- **Order state machine** is enforced server-side; do not bypass it from the renderer. The graph is `DRAFT → SENT → CLOSED`, with `SENT → WALKOUT` and `DRAFT|SENT → CANCELED` as terminal branches. There is no `BILL_REQUESTED` and no `PENDING_PAYMENT`. See `decisions.md`.
- **Single confirm action**: `POST /api/orders/:id/confirm` is the only path from `SENT` to `CLOSED`. It atomically validates payments, snapshots totals, inserts `Payment`/`Debt` rows, prints the bill (blocking — failure rolls the whole transaction back), and flips the order to `CLOSED`.
- **Stock**: orders containing tracked items are rejected atomically if any `Ingredient.currentStock` is insufficient. Cancelling from `DRAFT` restores stock; cancelling from `SENT` does not.
- **Roles**: OWNER sees finance/profit; ADMIN does not. WAITER is mobile/order-app only. Don't expose owner-only data to lower roles.
- **v1 scope explicitly excludes**: split/merge bills, per-line discounts, Click/Payme, structured modifiers, multi-tenant. Don't add them speculatively.

## Printer

`apps/master/cpp/receipt.cpp` is a Win32 RAW ESC/POS spooler. Build artifact lands at `apps/master/resources/bin/receipt.exe` and is bundled via `extraResources` in electron-builder. On Linux dev hosts, `scripts/build-printer.sh` uses `x86_64-w64-mingw32-g++` to cross-compile.
