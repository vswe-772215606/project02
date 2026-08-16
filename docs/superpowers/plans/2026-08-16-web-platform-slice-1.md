# Web platform slice 1 — extract and run on Postgres

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the master's server and admin UI out of Electron into shared workspace packages, run the whole system on PostgreSQL, and serve it from a plain Node process in Docker — with no change to any business behaviour.

**Architecture:** Three new packages (`db`, `server`, `admin-ui`) built by `git mv` so history follows, plus one new app (`web`) that boots the server and serves the SPA from the same origin. The server tree reaches outside itself exactly once today (`lib/prisma.ts` → `../../prisma-runtime`), and the renderer has zero preload call sites, so the extraction is mechanical. The database swap is a provider change plus explicit Decimal types — there is no raw SQL anywhere in the server tree.

**Tech Stack:** TypeScript strict, Prisma 6 + PostgreSQL 16, Express 4, Socket.io 4, React 19 + Vite 5, Vitest, pnpm workspaces, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-16-web-platform-design.md`. This is slice 1 of 5.

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any`; use `unknown` and narrow.
- 2-space indent, single quotes, semicolons, trailing commas.
- Files `kebab-case.ts`, React components `PascalCase.tsx`.
- All user-facing text is in **Uzbek**. No i18n library.
- `packages/server` stays **CommonJS**. Everywhere else is ES modules. Do not migrate the module system in this slice.
- All Prisma calls live in `repositories/`. Services orchestrate; controllers stay thin.
- **No AI fingerprints** in commit messages — no assistant self-attribution, no co-authorship trailers, no robot emoji. Author as the human, plainly.
- Never force-push, never rewrite history, never `git clean`.
- **No secrets in git.** The Postgres credentials in this plan are local-development-only and belong in `compose.dev.yaml`, never in an `.env` that gets committed.
- **Move files with `git mv`, never copy-then-delete.** History following the code is the point of the layout.
- **No behaviour changes.** If a task tempts you to fix a bug you can see, do not. `docs/TECHNICAL_REVIEW_2026-08-16.md` tracks them and slice 3 fixes the ones in scope.

## There is no test runner yet — this slice adds one

Verification today is `tsc`, HTTP smoke scripts, and the browser gallery. Task 6 adds Vitest to `packages/server`. Until then, every task below ends with concrete commands and their expected output.

### The typecheck floor, measured 2026-08-16

```bash
cd apps/master && npx tsc -b 2>&1 | grep -cE "error TS"
# → 49
```

All 49 are pre-existing. **Every one of them lands in `packages/server` after Task 4**, because the 41 inside `src/main/server` move with the tree and `pdf-report.ts`'s 8 move with it too:

| File | Pre-existing errors |
|---|---|
| `controllers/orders.controller.ts` | 14 |
| `pdf-report.ts` | 8 |
| `services/print.service.ts` | 4 |
| `controllers/menu.controller.ts` | 4 |
| `controllers/stock.controller.ts` | 3 |
| `controllers/expense.controller.ts` | 3 |
| `controllers/debt.controller.ts` | 3 |
| `controllers/users.controller.ts` | 2 |
| `controllers/discounts.controller.ts` | 2 |
| `services/printers.service.ts`, `services/discount.service.ts`, `services/debt.service.ts`, `services/auth.service.ts`, `repositories/audit.repo.ts`, `controllers/tables.controller.ts` | 1 each |

**Do not fix them in this slice.** Record the number in each commit body.

**Corrected 2026-08-16, measured after Task 3 ran.** Two claims that were in this section were wrong:

- **The total is 63, not 49.** Task 3 Step 1 puts `scripts/` under the typecheck include for the
  first time, which surfaces **14** strict-null errors that were always there and never compiled —
  8 in `smoke-e2e-flow.ts`, 6 in `smoke-finance-pnl.ts`. This section originally said the count
  "must never rise", which contradicted Step 1 doing exactly that deliberately. **The rule that
  actually matters: `src/` must stay at exactly 49, file-for-file against the table above. The
  `scripts/` errors are pre-existing bugs newly made visible — leave them alone and fix them in
  their own commit later.**
- **`print.service.ts` does not drop below 4.** The prediction assumed its four errors sat in the
  Electron platform branch. They do not — they are a `PrintableOrder` / `OrderForReceipt` mismatch
  and a `triggeredBy` undefined, all untouched by the executor change.

### The renderer gates stay clean, always

```bash
cd packages/admin-ui
pnpm run typecheck        # zero errors, always
pnpm run typecheck:gallery # zero errors, always
```

`tsconfig.json` does not cover `gallery/`. `tsconfig.gallery.json` covers both trees. A renderer type change that breaks a fixture only shows up in the second command — always run both.

### Docker is required from Task 1 onward

Postgres runs in Docker; nothing native. Start it once and leave it up:

```bash
docker compose -f compose.dev.yaml up -d db
```

If `docker info` fails, Docker Desktop is not running. Start it before beginning.

## File structure

**Created**

- `packages/db/package.json`, `packages/db/tsconfig.json`
- `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/vitest.config.ts`
- `packages/server/src/lib/printer-executor.ts`
- `packages/server/src/services/billing.service.test.ts`
- `packages/server/src/services/stock-math.test.ts`
- `packages/admin-ui/package.json`, `packages/admin-ui/tsconfig.json`, `packages/admin-ui/tsconfig.gallery.json`, `packages/admin-ui/vite.config.ts`, `packages/admin-ui/vite.gallery.config.ts`
- `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/src/index.ts`, `apps/web/src/static.ts`
- `apps/web/Dockerfile.dev`

**Moved with `git mv`**

- `apps/master/prisma/schema.prisma` → `packages/db/prisma/schema.prisma`
- `apps/master/prisma/seed.ts` → `packages/db/prisma/seed.ts`
- `apps/master/src/main/server/**` → `packages/server/src/**`
- `apps/master/src/main/pdf-report.ts` → `packages/server/src/pdf-report.ts`
- `apps/master/src/renderer/**` → `packages/admin-ui/src/**`
- `apps/master/gallery/**` → `packages/admin-ui/gallery/**`
- `apps/master/tailwind.config.cjs`, `postcss.config.js` → `packages/admin-ui/`
- `apps/master/scripts/build-gallery-page.mjs` → `packages/admin-ui/scripts/`
- `apps/master/scripts/smoke-*.ts` → `packages/server/scripts/`

**Deleted**

- `apps/master/prisma/migrations/**` (17 SQLite migrations — replaced by one Postgres initial migration)
- `apps/master/src/main/sqlite-bootstrap.ts`, `prisma-runtime.ts`, `mdns-advertise.ts`, `app-identity.ts`, `print-pdf.ts`
- `apps/master/installer.nsh`, `installer.next.nsh`, `scripts/package-win-next.mjs`, `scripts/prepare-prisma-package.mjs`
- `apps/master/src/main/server/printer/binary-resolver.ts`
- `apps/master/scripts/serve-headless.ts` (superseded by `apps/web/src/index.ts`)
- `apps/master/scripts/smoke-cashflow-reversal.ts` (destructive, unguarded, and already failing — see `docs/CURRENT_WORKFLOW.md` §13)
- `Dockerfile.dev` at the repo root (superseded by `apps/web/Dockerfile.dev`)

**`apps/master` after this slice:** `index.ts`, `preload.ts`, `startup-log.ts` and
`electron.vite.config.ts` remain in place and broken, with `typecheck` stubbed to an echo. That is
intended — slice 5 rewrites them as a kiosk shell. No task in this slice makes `apps/master` build.

**Modified**

- `compose.dev.yaml`, `pnpm-workspace.yaml` (no change needed — already globs `packages/*`), root `package.json`
- `packages/server/src/lib/prisma.ts`, `services/print.service.ts`
- `packages/admin-ui/src/api/client.ts`, `src/lib/socket-client.ts`
- `CLAUDE.md`, `docs/CURRENT_WORKFLOW.md`

**Deliberately untouched:** `apps/order`, `apps/mobile`, every service, every repository, every route, every renderer page and component.

---

### Task 1: Stand up Postgres and move the schema

`packages/db` owns the schema, the migrations and the seed. Nothing else in the repo may own a Prisma schema after this task.

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Move: `apps/master/prisma/schema.prisma` → `packages/db/prisma/schema.prisma`
- Move: `apps/master/prisma/seed.ts` → `packages/db/prisma/seed.ts`
- Delete: `apps/master/prisma/migrations/**`
- Modify: `compose.dev.yaml`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running Postgres on `localhost:5432`, database `chayxana`. `DATABASE_URL=postgresql://chayxana:chayxana@localhost:5432/chayxana?schema=public` for host processes, and `@db:5432` for containers. `pnpm --filter @chayxana/db exec prisma generate` produces the client every other package imports as `@prisma/client`.

- [ ] **Step 1: Create the package manifest**

Create `packages/db/package.json`:

```json
{
  "name": "@chayxana/db",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "generate": "prisma generate",
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "seed": "tsx prisma/seed.ts",
    "studio": "prisma studio",
    "typecheck": "tsc --noEmit",
    "test": "echo 'no tests'",
    "lint": "echo 'no lint configured yet'"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.17.1"
  },
  "devDependencies": {
    "prisma": "^6.17.1",
    "tsx": "^4.21.0",
    "typescript": "^5.5.0"
  }
}
```

Create `packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "module": "CommonJS",
    "moduleResolution": "Node",
    "types": ["node"]
  },
  "include": ["prisma/**/*"]
}
```

- [ ] **Step 2: Move the schema and seed**

```bash
cd /Users/uzmacbook/dev/lab/project02
mkdir -p packages/db/prisma
git mv apps/master/prisma/schema.prisma packages/db/prisma/schema.prisma
git mv apps/master/prisma/seed.ts packages/db/prisma/seed.ts
git rm -r apps/master/prisma/migrations
```

The 17 SQLite migrations go because the fresh start means there is no database to migrate forward. This is the irreversible step in the whole slice — after it, the Windows till's `master.sqlite` can never be brought across.

- [ ] **Step 3: Switch the provider**

In `packages/db/prisma/schema.prisma`, change the datasource block:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

In the same file, the generator block drops the SQLite-era engine targets — Postgres in Docker needs only the two Linux ones plus native:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}
```

- [ ] **Step 4: Type the money columns**

Bare `Decimal` becomes `Decimal(65,30)` on Postgres. Every money column on a **live** model gets an explicit type. Add `@db.Decimal(14, 2)` to each of these 18 fields — 14 digits covers any so'm figure this business produces, and keeping `Decimal` rather than integer so'm means `Prisma.Decimal` arithmetic and the `.toFixed(0)` DTO boundary are untouched:

| Model | Fields |
|---|---|
| `MenuItem` | `price`, `unitCostSnapshot`, `costPrice` |
| `Order` | `subtotalSnapshot`, `discountAmountSnapshot`, `serviceChargeSnapshot`, `totalSnapshot` |
| `OrderLine` | `unitPriceSnapshot`, `cogsSnapshot` |
| `Discount` | `value` |
| `Payment` | `amount` |
| `Expense` | `amount` |
| `ExpenseReturn` | `amount` |
| `Debt` | `originalAmount`, `remainingAmount` |
| `DebtRepayment` | `amount` |
| `StockEntry` | `paidUzs`, `unitCost` |

The annotation goes after the type and before any attribute. Optional columns keep their `?`:

```prisma
  price            Decimal  @db.Decimal(14, 2)
  costPrice        Decimal? @db.Decimal(14, 2)
  currentStock     Decimal  @default(0) @db.Decimal(14, 2)
```

The remaining 21 `Decimal` columns belong to the dead inventory models (`Ingredient`, `RecipeIngredient`, `Purchase`, `OrderLineBatchConsumption`, `WasteEvent`, `StocktakeEntry`, `IngredientMovement`). **Leave them bare for now** — Task 2 deletes those models outright, and annotating a column you are about to delete is wasted work. If Task 2 is skipped, come back and annotate them the same way.

- [ ] **Step 5: Add Postgres to the dev compose file**

In `compose.dev.yaml`, add a `db` service above `master-dev` and a `pgdata` volume. Leave the existing `master-dev` service alone — Task 8 replaces it:

```yaml
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: chayxana
      POSTGRES_PASSWORD: chayxana
      POSTGRES_DB: chayxana
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chayxana -d chayxana"]
      interval: 5s
      timeout: 3s
      retries: 20
```

Add `pgdata:` to the `volumes:` block at the bottom of the file.

- [ ] **Step 6: Start Postgres and install**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml up -d db
pnpm install
```

Wait for health:

```bash
docker compose -f compose.dev.yaml exec db pg_isready -U chayxana -d chayxana
```
Expected: `accepting connections`.

- [ ] **Step 7: Generate the initial migration**

```bash
cd /Users/uzmacbook/dev/lab/project02/packages/db
DATABASE_URL="postgresql://chayxana:chayxana@localhost:5432/chayxana?schema=public" \
  pnpm exec prisma migrate dev --name init
```
Expected: one new directory under `packages/db/prisma/migrations/`, and `Your database is now in sync with your schema`.

If it fails on an enum or a default, read the error and fix the schema — do not hand-edit the generated SQL. Prisma owns this file.

- [ ] **Step 8: Prove the tables exist and money has the right type**

```bash
docker compose -f compose.dev.yaml exec -T db \
  psql -U chayxana -d chayxana -c "\dt" | head -30
docker compose -f compose.dev.yaml exec -T db \
  psql -U chayxana -d chayxana -c \
  "SELECT table_name, column_name, numeric_precision, numeric_scale
     FROM information_schema.columns
    WHERE column_name IN ('amount','price','totalSnapshot','remainingAmount')
    ORDER BY table_name;"
```
Expected: the tables list includes `Order`, `OrderLine`, `Payment`, `Debt`, `MenuItem`, `StockEntry`. Every row of the second query shows precision **14**, scale **2**. A row showing 65/30 means Step 4 missed that column — fix it, re-run `migrate dev`, and check again.

- [ ] **Step 9: Seed and confirm**

```bash
cd /Users/uzmacbook/dev/lab/project02/packages/db
DATABASE_URL="postgresql://chayxana:chayxana@localhost:5432/chayxana?schema=public" \
  pnpm exec tsx prisma/seed.ts
```
Expected: the seed runs to completion. If it fails on a SQLite-ism, fix the seed — it is the first real proof the data layer ported.

```bash
docker compose -f compose.dev.yaml exec -T db \
  psql -U chayxana -d chayxana -c 'SELECT COUNT(*) FROM "User";'
```
Expected: a non-zero count.

- [ ] **Step 10: Commit**

```bash
cd /Users/uzmacbook/dev/lab/project02
git add -A
git commit -m "feat(db): move the schema into packages/db and put it on Postgres

The schema, the seed and the migration history now live in one package that
owns them, and the provider is postgresql. The 17 SQLite migrations are dropped
rather than translated: the web system starts from an empty database by
decision, so there is nothing to migrate forward.

Eighteen money columns on live models gain @db.Decimal(14, 2). Bare Decimal
becomes Decimal(65,30) on Postgres, which is both wasteful and a silent change
to what the DTO boundary serialises. Keeping Decimal rather than moving to
integer so'm leaves Prisma.Decimal arithmetic and every .toFixed(0) untouched.

Postgres 16 runs in compose.dev.yaml with a healthcheck. Seed applies cleanly."
```

---

### Task 2: Drop the dead inventory models

Ten models have had no live code path since the count-based inventory refactor on 2026-08-13. `docs/CURRENT_WORKFLOW.md` §4 keeps them for one reason only: *"dropping the tables needs a backup mechanism that doesn't exist yet"* and *"inventory history predating 2026-08-13 is frozen in these tables"*. The fresh start removes both reasons — there are no historical rows in a database that starts empty.

**This task is separable.** If the owner wants the dead models preserved anyway, skip it and instead annotate the 21 remaining `Decimal` columns per Task 1 Step 4. Nothing downstream depends on this task.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: Task 1 — the Postgres schema and its initial migration.
- Produces: a schema with 10 fewer models, and **one** code change.

**Corrected 2026-08-16.** This block originally said "no code changes accompany this". That is wrong,
and Step 1's grep is too naive to catch why. Grepping for `ingredient|recipe|purchase|…` returns
**67 matches** in `packages/server/src` — but they are all surviving *vocabulary*, not model usage:
`seed-cat-ingredients` is an `ExpenseCategory` id string, `ingredientPurchases` is a finance DTO
field now sourced from `StockEntry`. The precise check is whether anything touches the Prisma model
accessors or types, and it returns nothing:

```bash
grep -rnE "\.(ingredient|recipe|purchase|stocktake|wasteEvent|ingredientMovement)\b" \
  packages/server/src --include="*.ts" | grep -iE "prisma|tx\.|client\."
grep -rnE "import .*\{[^}]*(Ingredient|Recipe|Purchase|Stocktake|WasteEvent)[^}]*\}.*@prisma/client" \
  packages/server/src packages/admin-ui/src
```

The one real consequence is `Expense.purchaseId`, a foreign key to the deleted `Purchase` model.
Dropping the column breaks `expense.service.ts:56`, which maps it into the Expense DTO — and the DTO
field is read by `finance.service.ts:168` and rendered as the "Xarid" chip in `ExpenseList.tsx:95`
and `ExpensePanel.tsx:133`. Fixing the service alone fixes all of them, because the others consume
the DTO rather than the model. Set it to a literal `null` with a comment; do **not** remove it from
the clients, which is UI surgery that does not belong in a port. Every gallery fixture already has
`purchaseId: null` and no row can ever set it again, so the chip was already unreachable.

- [ ] **Step 1: Prove they really are dead before deleting anything**

```bash
cd /Users/uzmacbook/dev/lab/project02
grep -rn "ingredient\|recipe\|purchase\|stocktake\|wasteEvent\|batchConsumption" \
  apps/master/src/main/server --include="*.ts" -i | grep -v "^.*//" | head -20
```
Expected: **no matches** outside comments. If anything real appears, stop — the model is not dead and this task's premise is wrong.

- [ ] **Step 2: Delete the models**

In `packages/db/prisma/schema.prisma`, delete these ten model blocks in full:

`Ingredient`, `Recipe`, `RecipeIngredient`, `RecipeEdit`, `Purchase`, `OrderLineBatchConsumption`, `WasteEvent`, `Stocktake`, `StocktakeEntry`, `IngredientMovement`.

Then delete every relation field on surviving models that points at them, and any enum used only by them. Prisma will name each one for you if you miss it — run `pnpm exec prisma validate` after each pass until it is clean.

Delete these two dead columns while you are here. Both are declared, never written and never read (`docs/CURRENT_WORKFLOW.md` §11, "Dead code worth knowing"):

- `MenuItem.unitCostSnapshot`
- `OrderLine.consumptionSnapshot`

- [ ] **Step 3: Validate**

```bash
cd /Users/uzmacbook/dev/lab/project02/packages/db
pnpm exec prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 4: Regenerate the initial migration**

The database is empty and unreleased, so amend the initial migration rather than stacking a drop on top of a create:

```bash
cd /Users/uzmacbook/dev/lab/project02/packages/db
rm -rf prisma/migrations
DATABASE_URL="postgresql://chayxana:chayxana@localhost:5432/chayxana?schema=public" \
  pnpm exec prisma migrate reset --force --skip-seed
DATABASE_URL="postgresql://chayxana:chayxana@localhost:5432/chayxana?schema=public" \
  pnpm exec prisma migrate dev --name init
```
Expected: a single migration directory, and a database with the dead tables absent.

- [ ] **Step 5: Confirm the tables are gone and the seed still applies**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml exec -T db \
  psql -U chayxana -d chayxana -c "\dt" | grep -iE "ingredient|recipe|purchase|stocktake|waste"
```
Expected: **no output**.

```bash
cd packages/db
DATABASE_URL="postgresql://chayxana:chayxana@localhost:5432/chayxana?schema=public" \
  pnpm exec tsx prisma/seed.ts
```
Expected: completes. If the seed writes an ingredient or a recipe, delete that section — it is seeding a subsystem that no longer exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): drop the ten dead inventory models

Ingredient, Recipe, RecipeIngredient, RecipeEdit, Purchase,
OrderLineBatchConsumption, WasteEvent, Stocktake, StocktakeEntry and
IngredientMovement have had no live code path since count-based inventory
landed on 2026-08-13. CURRENT_WORKFLOW kept them because their historical rows
were frozen and there was no backup mechanism to risk dropping them; a database
that starts empty has neither problem.

MenuItem.unitCostSnapshot and OrderLine.consumptionSnapshot go with them —
declared, never written, never read.

The initial migration is regenerated rather than stacked, because the database
is empty and nothing has shipped against it."
```

---

### Task 3: Extract packages/server

The whole server tree moves in one commit. It reaches outside itself exactly once — `lib/prisma.ts` imports `../../prisma-runtime`, which exists only to point Electron at a packaged query engine — so that import and the one Electron import in `printer/binary-resolver.ts` are the entire coupling to break.

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`
- Create: `packages/server/src/lib/printer-executor.ts`
- Create: `packages/server/src/index.ts`
- Modify: `apps/master/package.json` (typecheck script)
- Move: `apps/master/src/main/server/**` → `packages/server/src/**`
- Move: `apps/master/src/main/pdf-report.ts` → `packages/server/src/pdf-report.ts`
- Move: `apps/master/scripts/smoke-*.ts` → `packages/server/scripts/`
- Modify: `packages/server/src/lib/prisma.ts`
- Modify: `packages/server/src/services/print.service.ts`
- Delete: `packages/server/src/printer/binary-resolver.ts`
- Delete: `apps/master/scripts/smoke-cashflow-reversal.ts`

**Interfaces:**
- Consumes: Task 1 — `@prisma/client` generated from `packages/db`.
- Produces: `@chayxana/server` exporting exactly four symbols from its package root — `createApp()`, `attachSocket(httpServer)`, `settingsService`, and `setPrinterExecutor(fn)`. Consumers import `from '@chayxana/server'`, never a subpath.

- [ ] **Step 1: Create the package manifest**

Create `packages/server/package.json`. The dependency list is the server half of `apps/master`'s — no React, no Electron, no `sql.js`, no `bonjour-service`:

```json
{
  "name": "@chayxana/server",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "echo 'no lint configured yet'"
  },
  "dependencies": {
    "@chayxana/db": "workspace:*",
    "@prisma/client": "^6.17.1",
    "bcryptjs": "^3.0.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "exceljs": "^4.4.0",
    "express": "^4.19.0",
    "p-queue": "6.6.2",
    "pdfkit": "^0.18.0",
    "socket.io": "^4.8.3",
    "telegraf": "^4.16.3",
    "zod": "^4.4.2"
  },
  "devDependencies": {
    "@types/bcryptjs": "^3.0.0",
    "@types/cookie-parser": "^1.4.10",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.0",
    "@types/pdfkit": "^0.17.6",
    "tsx": "^4.21.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

Create `packages/server/tsconfig.json` — this is `tsconfig.main.json` minus Electron, minus the composite build output:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "module": "CommonJS",
    "moduleResolution": "Node",
    "types": ["node"]
  },
  "include": ["src/**/*", "scripts/**/*"]
}
```

Note that `include` covers `scripts/` deliberately. Today `tsc -b` compiles **nothing** under `apps/master/scripts` — proven with `npx tsc --listFiles -p tsconfig.main.json | grep -c "/scripts/"` returning `0` — so every smoke script is entirely untypechecked. Bringing them under the same config is a free fix.

- [ ] **Step 2: Move the tree**

```bash
cd /Users/uzmacbook/dev/lab/project02
mkdir -p packages/server/src packages/server/scripts
git mv apps/master/src/main/server/* packages/server/src/
git mv apps/master/src/main/pdf-report.ts packages/server/src/pdf-report.ts
git mv apps/master/scripts/smoke-e2e-flow.ts packages/server/scripts/
git mv apps/master/scripts/smoke-stock-count.ts packages/server/scripts/
git mv apps/master/scripts/smoke-finance-pnl.ts packages/server/scripts/
git mv apps/master/scripts/smoke-summary-report.ts packages/server/scripts/
git mv apps/master/scripts/smoke-prd13-boundary.ts packages/server/scripts/
git rm apps/master/scripts/smoke-cashflow-reversal.ts
```

`smoke-cashflow-reversal.ts` is deleted rather than moved. It runs five unfiltered `deleteMany({})` calls against `Payment`, `Expense`, `Order`, `ExpenseCategory` and `User`, it already fails against the live schema, and pointing that at a shared Postgres instead of a throwaway SQLite file makes it strictly more dangerous. If its coverage is wanted back, it gets rewritten in a later slice with scoped cleanup.

The remaining `simulate-*.ts` and `smoke-prd13-*.ts` scripts stay in `apps/master/scripts` for now — several carry pre-v0.1.3 expectations and fail today, and triaging them is not this slice's job.

- [ ] **Step 3: Cut the Prisma runtime dependency**

`packages/server/src/lib/prisma.ts` currently calls `setupPrismaRuntime()`, which resolves a packaged query-engine path for Electron. A plain Node process resolves it normally. Replace the whole file with:

```ts
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  return prisma;
}

export async function connectPrisma(): Promise<PrismaClient> {
  const client = getPrisma();
  await client.$connect();
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
```

- [ ] **Step 4: Replace the binary resolver with an injectable executor**

`printer/binary-resolver.ts` is the only file in the server tree that imports Electron. Delete it:

```bash
git rm packages/server/src/printer/binary-resolver.ts
```

Create `packages/server/src/lib/printer-executor.ts`:

```ts
/**
 * How a rendered receipt reaches a printer.
 *
 * The server no longer runs on the machine the printer is attached to, so it
 * cannot spawn receipt.exe itself. Slice 2 registers an executor that hands the
 * job to the print agent at the chayxana. Until then the default records the
 * attempt and succeeds, which is exactly what the old non-Windows path did.
 */
export type PrinterExecutor = (input: {
  printerName: string;
  args: string[];
  label: string;
}) => Promise<void>;

const noopExecutor: PrinterExecutor = async (input) => {
  console.log('[printer-executor] no executor registered', {
    printerName: input.printerName,
    label: input.label,
  });
};

let executor: PrinterExecutor = noopExecutor;

export function setPrinterExecutor(next: PrinterExecutor): void {
  executor = next;
}

export function getPrinterExecutor(): PrinterExecutor {
  return executor;
}
```

In `packages/server/src/services/print.service.ts`, delete the `resolveBinaryPath` import and replace the body of `executeBinary` — the function that currently branches on `process.platform` and calls `execFile` — so it delegates:

```ts
import { getPrinterExecutor } from '../lib/printer-executor';

async function executeBinary(input: PrintExecutionInput): Promise<void> {
  await getPrinterExecutor()({
    printerName: input.printerName,
    args: input.args,
    label: input.linuxLabel,
  });
}
```

Delete the now-unused `execFile` / `execFileAsync` imports and the `resolveBinaryPath` call site that threw when the binary was missing. **Do not** change where `printBill` is called from — moving the print out of the confirm transaction is slice 2's job and doing it here would make this slice unreviewable.

- [ ] **Step 5: Add the package barrel**

Consumers must not reach into this package by file path — a subpath import like
`@chayxana/server/src/app` depends on there being no `exports` field and on the consumer's loader
resolving a bare `.ts`, and it breaks the moment either changes.

Create `packages/server/src/index.ts`:

```ts
export { createApp } from './app';
export { attachSocket } from './socket';
export { settingsService } from './services/settings.service';
export { setPrinterExecutor, type PrinterExecutor } from './lib/printer-executor';
```

- [ ] **Step 6: Stop apps/master claiming it typechecks**

`apps/master` has just lost `src/main/server`, and loses `src/renderer` in Task 5. It does not build
again until slice 5 rebuilds it as a kiosk shell, and that is intended — but `pnpm -r typecheck` runs
its `tsc -b` and would drown the real 49-error signal in hundreds of missing-module errors.

In `apps/master/package.json`, replace the `typecheck` script:

```json
    "typecheck": "echo 'apps/master is being rebuilt as a kiosk shell in slice 5 — see docs/superpowers/specs/2026-08-16-web-platform-design.md'",
```

Leave every other script alone. Slice 5 owns the rest of this package.

- [ ] **Step 7: Install and typecheck**

```bash
cd /Users/uzmacbook/dev/lab/project02
pnpm install
cd packages/server
pnpm exec tsc --noEmit 2>&1 | grep -E "error TS" | sed 's/(.*//' \
  | sed 's|^src/|SRC  src/|; s|^scripts/|SCR  scripts/|' | sort | uniq -c | sort -rn
```
Expected: **49 under `SRC`, matching the floor table file-for-file, and 14 under `SCR`** (8 in
`smoke-e2e-flow.ts`, 6 in `smoke-finance-pnl.ts`) — 63 total. The `SCR` errors are pre-existing bugs
that Step 1 made visible for the first time; leave them.

Any file not in the floor table showing a new error under `SRC` means the move broke an import — fix
the import, not the pre-existing error. **Expect at least three of these**: dynamic imports carry the
old layout and TypeScript does not always flag them where you would expect. `src/pdf-report.ts`
imports `'./server/services/reports.service'`, `src/services/telegram-bot.service.ts` imports
`'../../pdf-report'`, and `scripts/smoke-prd13-boundary.ts` imports `'../src/main/server/...'`. The
first one alone inflates `pdf-report.ts` from 8 errors to 30 through cascading implicit-`any`, so if
that file looks catastrophic, fix its import before assuming anything else is wrong.

```bash
pnpm exec tsc --noEmit 2>&1 | sed 's/(.*//' | sort | uniq -c | sort -rn
```
Compare against the floor table. Judge the per-file breakdown, not just the total.

- [ ] **Step 8: Prove the Prisma client resolves from here**

The root `.npmrc` sets `node-linker=hoisted` and `shamefully-hoist=true`, so the client generated by `packages/db` lands where every package can see it. Prove it rather than assuming:

```bash
cd /Users/uzmacbook/dev/lab/project02/packages/server
node -e "console.log(Object.keys(require('@prisma/client')).slice(0,5))"
```
Expected: an array including `PrismaClient`. If it throws, run `pnpm --filter @chayxana/db exec prisma generate` and try again.

- [ ] **Step 9: Confirm no Electron reference survives**

```bash
cd /Users/uzmacbook/dev/lab/project02
grep -rn "from 'electron'\|require('electron')" packages/server
```
Expected: **no matches.**

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(server): extract the API into packages/server

The server tree moves out of the Electron main process whole. It reached
outside itself exactly once — lib/prisma.ts imported prisma-runtime to point
Electron at a packaged query engine — and a plain Node process resolves the
engine on its own, so that file loses the call and nothing else changes.

printer/binary-resolver.ts was the only Electron import left in the tree. It is
replaced by an injectable executor: the server no longer runs on the machine the
printer is attached to, so it cannot spawn receipt.exe, and slice 2 registers an
executor that hands the job to the agent. The default logs and succeeds, which
is what the non-Windows path already did.

scripts/ is inside the typecheck include for the first time — tsc -b compiled
nothing under apps/master/scripts, so every smoke script has been entirely
untypechecked until now.

smoke-cashflow-reversal.ts is deleted rather than moved: five unfiltered
deleteMany calls including User, already failing, and strictly more dangerous
pointed at a shared Postgres.

tsc: 49 pre-existing errors, none new."
```

---

### Task 4: Add Vitest and cover the money math

`docs/TECHNICAL_REVIEW_2026-08-16.md` found there is no gate anywhere in this project. This is the first test in the repo, and it goes where money is decided.

`billingService.computeTotals` is the right first target: on the `discountAmount` path it touches no database at all — the only I/O is `discountRepo.findById`, reached solely through the legacy `discountId` branch — so it is directly testable with a plain object.

**Files:**
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/src/services/billing.service.test.ts`

**Interfaces:**
- Consumes: Task 3 — `packages/server` compiles and `@prisma/client` resolves.
- Produces: `pnpm --filter @chayxana/server test` runs the suite. Later slices add to it.

- [ ] **Step 1: Configure Vitest**

Create `packages/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: false,
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `packages/server/src/services/billing.service.test.ts`:

```ts
import { MenuItemKind, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { billingService } from './billing.service';

type Line = {
  quantity: number;
  isCanceled: boolean;
  unitPriceSnapshot: Prisma.Decimal;
  menuItem: { kind: MenuItemKind };
};

function food(price: number, quantity = 1, isCanceled = false): Line {
  return {
    quantity,
    isCanceled,
    unitPriceSnapshot: new Prisma.Decimal(price),
    menuItem: { kind: MenuItemKind.FOOD },
  };
}

function service(price: number, quantity = 1): Line {
  return {
    quantity,
    isCanceled: false,
    unitPriceSnapshot: new Prisma.Decimal(price),
    menuItem: { kind: MenuItemKind.SERVICE },
  };
}

const noDiscount = { serviceChargeWaived: false };

describe('billingService.computeTotals', () => {
  it('sums food lines into the subtotal and excludes service lines', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(20_000, 2), food(15_000), service(10_000, 3)] },
      noDiscount,
    );

    expect(totals.subtotal.toFixed(0)).toBe('55000');
    expect(totals.serviceCharge.toFixed(0)).toBe('30000');
    expect(totals.total.toFixed(0)).toBe('85000');
  });

  it('ignores canceled lines on both sides', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(20_000), food(50_000, 1, true)] },
      noDiscount,
    );

    expect(totals.subtotal.toFixed(0)).toBe('20000');
    expect(totals.total.toFixed(0)).toBe('20000');
  });

  it('applies an ad-hoc discount to food only, leaving the service charge owed', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(100_000), service(14_000)] },
      { discountAmount: 100_000, serviceChargeWaived: false },
    );

    expect(totals.discountAmount.toFixed(0)).toBe('100000');
    expect(totals.total.toFixed(0)).toBe('14000');
  });

  it('clamps a discount larger than the food subtotal instead of going negative', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(30_000)] },
      { discountAmount: 500_000, serviceChargeWaived: false },
    );

    expect(totals.discountAmount.toFixed(0)).toBe('30000');
    expect(totals.total.toFixed(0)).toBe('0');
  });

  it('rejects a negative discount', async () => {
    await expect(
      billingService.computeTotals(
        { lines: [food(30_000)] },
        { discountAmount: -1, serviceChargeWaived: false },
      ),
    ).rejects.toThrow();
  });

  it('waives the service charge when asked, without touching food', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(40_000), service(12_000)] },
      { serviceChargeWaived: true },
    );

    expect(totals.subtotal.toFixed(0)).toBe('40000');
    expect(totals.serviceCharge.toFixed(0)).toBe('0');
    expect(totals.total.toFixed(0)).toBe('40000');
  });
});
```

The third case is the one that matters most: a fully comped meal still owes the service charge, because that charge is the waiter's pay. If a later change ever makes that test fail, the change is wrong.

- [ ] **Step 3: Run it and watch it fail for the right reason**

```bash
cd /Users/uzmacbook/dev/lab/project02/packages/server
pnpm exec vitest run
```
Expected: fails with `Cannot find package 'vitest'` until `pnpm install` has been run for the new devDependency. Run `pnpm install` from the repo root, then run it again.

Expected on the second run: **all six pass.** These assert behaviour that already exists and was verified correct in the technical review — a red test here means the move in Task 3 broke something, and you should find out what before writing any more of this slice.

- [ ] **Step 4: Wire it into the root scripts**

In the root `package.json`, add a `test` script beside `typecheck`:

```json
    "test": "pnpm -r test",
```

`packages/db` (Task 1), `packages/admin-ui` (Task 5) and `apps/web` (Task 6) already declare
`"test": "echo 'no tests'"` in the manifests this plan gives you. Add the same line to
`apps/order/package.json`, `apps/mobile/package.json` and `apps/master/package.json` now, so
`pnpm -r test` does not fail on a package that has no test script.

- [ ] **Step 5: Run the whole suite from the root**

```bash
cd /Users/uzmacbook/dev/lab/project02
pnpm test
```
Expected: `packages/server` reports 6 passing; every other package reports its `no tests` echo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(server): cover the bill math with the repo's first tests

Vitest lands in packages/server and the first six tests go where money is
decided. computeTotals is the right first target: on the ad-hoc discount path it
touches no database, so it tests as a plain function.

The case worth naming is the fully comped meal — a 100% food discount still
leaves the service charge owed, because that charge is the waiter's pay. If that
test ever goes red, the change that did it is wrong.

pnpm test runs the suite from the root."
```

---

### Task 5: Extract packages/admin-ui

The renderer becomes a standalone Vite SPA. It already speaks nothing but HTTP and has zero `window.chayxana` call sites, so the only real change is where it points.

**Files:**
- Create: `packages/admin-ui/package.json`, `tsconfig.json`, `tsconfig.gallery.json`, `vite.config.ts`, `vite.gallery.config.ts`
- Move: `apps/master/src/renderer/**` → `packages/admin-ui/src/**`
- Move: `apps/master/gallery/**` → `packages/admin-ui/gallery/**`
- Move: `apps/master/tailwind.config.cjs`, `apps/master/postcss.config.js` → `packages/admin-ui/`
- Move: `apps/master/scripts/build-gallery-page.mjs` → `packages/admin-ui/scripts/`
- Modify: `packages/admin-ui/src/api/client.ts:4`
- Modify: `packages/admin-ui/src/lib/socket-client.ts:21`
- Delete: `apps/master/src/main/{sqlite-bootstrap,prisma-runtime,mdns-advertise,app-identity,print-pdf}.ts`
- Delete: `apps/master/installer.nsh`, `installer.next.nsh`, `scripts/package-win-next.mjs`, `scripts/prepare-prisma-package.mjs`

**Interfaces:**
- Consumes: nothing from Tasks 1-4 at runtime; it is a static bundle.
- Produces: `pnpm --filter @chayxana/admin-ui build` writes `packages/admin-ui/dist/` containing `index.html` and hashed assets. `apps/web` serves that directory.

- [ ] **Step 1: Move the trees**

```bash
cd /Users/uzmacbook/dev/lab/project02
mkdir -p packages/admin-ui/scripts
git mv apps/master/src/renderer packages/admin-ui/src
git mv apps/master/gallery packages/admin-ui/gallery
git mv apps/master/tailwind.config.cjs packages/admin-ui/tailwind.config.cjs
git mv apps/master/postcss.config.js packages/admin-ui/postcss.config.js
git mv apps/master/scripts/build-gallery-page.mjs packages/admin-ui/scripts/build-gallery-page.mjs
```

- [ ] **Step 2: Create the manifest**

Create `packages/admin-ui/package.json`:

```json
{
  "name": "@chayxana/admin-ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "gallery": "pnpm run typecheck:gallery && vite build --config vite.gallery.config.ts",
    "gallery:page": "pnpm run gallery && node ./scripts/build-gallery-page.mjs",
    "typecheck": "tsc --noEmit",
    "typecheck:gallery": "tsc --noEmit -p tsconfig.gallery.json",
    "test": "echo 'no tests'",
    "lint": "echo 'no lint configured yet'"
  },
  "dependencies": {
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-slot": "^1.2.4",
    "@tanstack/react-query": "^5.100.8",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.14.0",
    "next-themes": "^0.4.6",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-router-dom": "^7.14.2",
    "socket.io-client": "^4.8.3",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.6.0",
    "tailwindcss-animate": "^1.0.7",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@types/react": "~19.1.10",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.5.0",
    "postcss": "^8.5.13",
    "tailwindcss": "3.4.17",
    "typescript": "^5.5.0",
    "vite": "^5.3.0"
  }
}
```

React is pinned to `19.1.0` directly here rather than relying on the root `pnpm.overrides`. The overrides block still works — `pnpm-lock.yaml` carries it and the only react entries are 19.1.0 — but `apps/master` declared `^18.3.0` and got 19 only because of the override, which is a trap worth not reproducing in a new package.

- [ ] **Step 3: Create the tsconfigs**

Create `packages/admin-ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src/**/*"]
}
```

Create `packages/admin-ui/tsconfig.gallery.json`:

```json
{
  // The gallery mounts the real pages against a stubbed API, so its fixtures
  // must satisfy the same response types the server returns. Checked separately
  // from tsconfig.json, over both trees, so a fixture that has drifted from the
  // API contract fails here.
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["gallery/**/*", "src/**/*"]
}
```

- [ ] **Step 4: Create the app Vite config**

Create `packages/admin-ui/vite.config.ts`. The dev proxy is what lets `pnpm dev` work while the API runs separately; in production the SPA and the API share an origin and the proxy is irrelevant:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
});
```

Create `packages/admin-ui/vite.gallery.config.ts` — the same file that exists today, with `src/renderer` rewritten to `src`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Builds the design-system gallery as a standalone browser page.
 *
 * Deliberately separate from vite.config.ts: this one produces a single JS
 * bundle so the result can be inlined into one shareable HTML file (see
 * scripts/build-gallery-page.mjs).
 */
export default defineConfig({
  root: resolve(__dirname, 'gallery'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'gallery-dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'gallery.js',
        assetFileNames: 'gallery.[ext]',
      },
    },
  },
});
```

- [ ] **Step 5: Point the client at its own origin**

This is the change that retires the hardcoded port, and with it finding 1 of `docs/TECHNICAL_REVIEW_2026-08-16.md` — the SPA is served by the same process that serves the API, so a relative path is always correct.

In `packages/admin-ui/src/api/client.ts`, change line 4:

```ts
const BASE = 'http://localhost:4000';
```
to:
```ts
// Served from the same origin as the API, so every path is relative. Never
// hardcode a host or port here: a build that names one drives whichever server
// is on that port, not its own.
const BASE = '';
```

In `packages/admin-ui/src/lib/socket-client.ts`, change:

```ts
  socket = io('http://localhost:4000', {
```
to:
```ts
  socket = io({
```

`io()` with no URL connects to the page's own origin, which is what the proxy handles in dev and what is simply true in production.

- [ ] **Step 6: Fix the gallery's path assumptions**

`packages/admin-ui/scripts/build-gallery-page.mjs` and `gallery/mock-server.ts` may reference `src/renderer` or `../src/renderer`. Find and correct them:

```bash
cd /Users/uzmacbook/dev/lab/project02
grep -rn "src/renderer" packages/admin-ui
```
Expected after fixing: **no matches.**

- [ ] **Step 7: Delete the Electron-only main-process files**

With both trees out, everything left in `apps/master/src/main` exists to serve an architecture that
is gone. Delete the files the spec names, so slice 5 builds the kiosk shell from a clean slate rather
than excavating:

```bash
cd /Users/uzmacbook/dev/lab/project02
git rm apps/master/src/main/sqlite-bootstrap.ts
git rm apps/master/src/main/prisma-runtime.ts
git rm apps/master/src/main/mdns-advertise.ts
git rm apps/master/src/main/app-identity.ts
git rm apps/master/src/main/print-pdf.ts
git rm apps/master/installer.nsh apps/master/installer.next.nsh
git rm apps/master/scripts/package-win-next.mjs
git rm apps/master/scripts/prepare-prisma-package.mjs
```

`sqlite-bootstrap.ts` is the one worth naming: it held the seeded `owner/owner123` and
`admin/admin123` credentials and wrote them into `startup.log` — finding 11 of
`docs/TECHNICAL_REVIEW_2026-08-16.md`. Deleting it does not by itself fix the problem, because
`prisma/seed.ts` still seeds development users; slice 3's first-run setup is what closes it. But the
packaged path that shipped known credentials to a machine is gone here.

Leave `apps/master/src/main/index.ts`, `preload.ts`, `startup-log.ts` and `electron.vite.config.ts`
in place, broken. Slice 5 rewrites them and deleting them now would leave the package with no entry
point at all.

- [ ] **Step 8: Install, typecheck, build**

```bash
cd /Users/uzmacbook/dev/lab/project02
pnpm install
cd packages/admin-ui
pnpm run typecheck && pnpm run typecheck:gallery
```
Expected: **both clean, zero errors.**

```bash
pnpm run build
ls dist/index.html
```
Expected: the file exists.

- [ ] **Step 9: Look at every screen**

```bash
cd /Users/uzmacbook/dev/lab/project02/packages/admin-ui
pnpm run gallery:page
```
Open `gallery-dist/blocks-c1-gallery.html` at 1366×768 and confirm all 15 screens still render: **Bugun**, **Tasdiqlash**, **Buyurtmalar**, **Ombor**, **Stollar**, **Kunlik moliya**, **Menyu**, **Moliyaviy hisobot**, **Qarzlar**, **Chiqimlar**, **Xodimlar maoshi**, **Chegirmalar**, **Foydalanuvchilar**, **Amallar tarixi**, **Sozlamalar**.

Nothing about the design changes in this task. If a screen looks different, the move broke a path — find it.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(admin-ui): extract the renderer into a standalone Vite SPA

The renderer already spoke nothing but HTTP and had zero window.chayxana call
sites, so the move is the whole change — plus the one line that mattered.

api/client.ts hardcoded http://localhost:4000 and socket-client.ts hardcoded it
again. Both now use the page's own origin: the SPA is served by the process that
serves the API, so a relative path is correct by construction. That is also the
bug that would have had the next variant's admin window driving the production
till, and it cannot recur in a same-origin deployment.

React is pinned at 19.1.0 in this package rather than inherited from the root
overrides block. apps/master declared ^18.3.0 and got 19 only because of the
override; a new package should not reproduce that trap.

typecheck and typecheck:gallery both clean. All 15 screens checked at 1366x768."
```

---

### Task 6: Create apps/web

The Node process that boots the server and serves the SPA. This replaces `scripts/serve-headless.ts`, which proved the pattern but skipped the scheduler and the Telegram bot.

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`
- Create: `apps/web/src/index.ts`
- Create: `apps/web/src/static.ts`
- Delete: `apps/master/scripts/serve-headless.ts`

**Interfaces:**
- Consumes: Task 3 — `createApp()`, `attachSocket()`, `settingsService` from `@chayxana/server`. Task 5 — the built SPA at `packages/admin-ui/dist`.
- Produces: a process listening on `PORT` (default 4000) serving `/api/*`, `/socket.io`, and the SPA on everything else.

- [ ] **Step 1: Create the manifest and tsconfig**

Create `apps/web/package.json`:

```json
{
  "name": "@chayxana/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "echo 'no tests'",
    "lint": "echo 'no lint configured yet'"
  },
  "dependencies": {
    "@chayxana/server": "workspace:*",
    "express": "^4.19.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.0",
    "tsx": "^4.21.0",
    "typescript": "^5.5.0"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "module": "CommonJS",
    "moduleResolution": "Node",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write the static-serving module**

Create `apps/web/src/static.ts`. It is its own file because the ordering rule it encodes is easy to break and worth stating once:

```ts
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import express, { type Express } from 'express';

/**
 * Serve the admin SPA from the same origin as the API.
 *
 * Mount order matters and is the whole point of this module: the catch-all that
 * returns index.html must run AFTER every API router, or it swallows unmatched
 * /api paths and turns a 404 into an HTML page. Socket.io attaches to the HTTP
 * server rather than to Express, so it is unaffected either way.
 */
export function serveAdminUi(app: Express, distDir: string): void {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.warn(`[web] admin UI not built at ${distDir} — API only`);
    return;
  }

  app.use(express.static(distDir, { index: false }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(join(distDir, 'index.html'));
  });
}

export function defaultDistDir(): string {
  return resolve(__dirname, '..', '..', '..', 'packages', 'admin-ui', 'dist');
}
```

- [ ] **Step 3: Write the entry point**

Create `apps/web/src/index.ts`:

```ts
import { createServer } from 'http';
import { defaultDistDir, serveAdminUi } from './static';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const { createApp, attachSocket, settingsService } = await import('@chayxana/server');

  await settingsService.loadAll();

  const app = createApp();
  serveAdminUi(app, process.env.ADMIN_UI_DIST ?? defaultDistDir());

  const httpServer = createServer(app);
  attachSocket(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[web] listening on :${PORT}`);
      resolve();
    });
  });
}

main().catch((error: unknown) => {
  console.error('[web] FAILED:', error);
  process.exit(1);
});
```

Two things this does that `serve-headless.ts` did not, both deliberate: it **requires** `DATABASE_URL` instead of defaulting to a file path, because a web server silently pointing at the wrong database is worse than one that refuses to start; and it registers an `error` handler on `listen` so a taken port rejects rather than hanging forever — the same fix that closed audit `C-3` on the Electron side.

The scheduler and the Telegram bot are **not** started here. They are single-instance concerns and starting them belongs with deployment in slice 4, not with a process you will run several of locally.

- [ ] **Step 4: Delete the superseded script**

```bash
cd /Users/uzmacbook/dev/lab/project02
git rm apps/master/scripts/serve-headless.ts
```

- [ ] **Step 5: Typecheck and run it**

```bash
cd /Users/uzmacbook/dev/lab/project02
pnpm install
pnpm --filter @chayxana/web exec tsc --noEmit 2>&1 | grep -cE "^src/"
```

**Corrected 2026-08-16.** This step originally expected "clean", which is not achievable and was not
understood when the plan was written. `apps/web` consumes `@chayxana/server`, whose `main` points at
a `.ts` file, so TypeScript follows into the server's sources and re-reports all **49** of its
pre-existing errors under this config. The count above filters to `apps/web`'s **own** files, which
is the number that must be **0**.

Two consequences worth knowing:

- `apps/web/tsconfig.json` must include `../../packages/server/src/types/express.d.ts`. Without it
  the server's `Request.user` / `Request.session` augmentation is out of scope here and you get a
  further ~20 errors that exist nowhere else. The manifest in Step 1 already has this.
- The obvious fix — project references with `composite: true` on `packages/server` — **cannot work
  until the 49 are cleared**, because composite requires declaration emit and declaration emit fails
  on type errors. This is one more thing the 49 are costing, and it is an argument for the CI cleanup
  in slice 4 rather than a reason to stall here.

The meaningful server gate stays `pnpm --filter @chayxana/server exec tsc --noEmit`.

```bash
cd /Users/uzmacbook/dev/lab/project02
DATABASE_URL="postgresql://chayxana:chayxana@localhost:5432/chayxana?schema=public" \
  pnpm --filter @chayxana/web start
```
Expected: `[web] listening on :4000`. Leave it running for the next step.

- [ ] **Step 6: Prove the API and the SPA share an origin**

In a second terminal:

```bash
curl -s http://localhost:4000/api/health | head -5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/orders
curl -s http://localhost:4000/api/nope | head -3
```
Expected, in order: a health payload; `200` for the SPA root; `200` for a deep SPA route (the
catch-all, not a real file); and a `404` for the unknown API path.

**Corrected 2026-08-16.** This step originally expected a **JSON** error on `/api/nope` and said HTML
there proves the catch-all is mounted too early. That diagnostic is wrong and would send you chasing
a bug that does not exist. The app has **no JSON 404 handler at all** — unmatched routes never throw,
so `errorHandler` never sees them and Express's default HTML error page answers. That was equally
true before this slice, when the server served no static files.

Judge the ordering by the **body**, not the content type:

- `Cannot GET /api/nope` (Express's default) → the catch-all passed it through. **Correct.**
- The SPA's `index.html`, starting `<!doctype html><html lang="uz">` → the catch-all swallowed it and
  Step 2's ordering rule is broken.

Adding a JSON 404 is a behaviour change and belongs with slice 3's error work, next to the missing
`ZodError` branch — both are the same defect wearing different clothes: the API answers a client in
a format it cannot parse.

Stop the server when done.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): serve the API and the admin UI from one Node process

apps/web replaces scripts/serve-headless.ts, which proved the server runs
without Electron but was a dev harness rather than a deployment target.

Two differences from the script it replaces, both deliberate. DATABASE_URL is
required rather than defaulted to a file path — a web server silently pointing
at the wrong database is worse than one that refuses to start. And listen gets
an error handler, so a taken port rejects instead of leaving the promise pending
forever, which is the same failure that closed audit C-3 on the Electron side.

Mount order is the one thing to get right and it lives in its own module with
the reason written down: the SPA catch-all runs after every API router, or an
unmatched /api path returns HTML instead of JSON.

The scheduler and the Telegram bot are not started here. They are
single-instance concerns and belong with deployment in slice 4."
```

---

### Task 7: Run the whole stack in Docker and re-point the smokes

The compose harness stops being a special case for tests and becomes the thing that ships.

**Files:**
- Create: `apps/web/Dockerfile.dev`
- Modify: `compose.dev.yaml`
- Modify: `packages/server/scripts/smoke-e2e-flow.ts`, `smoke-stock-count.ts`, `smoke-finance-pnl.ts`, `smoke-summary-report.ts`, `smoke-prd13-boundary.ts` (base URL only, if they hardcode one)
- Delete: `Dockerfile.dev` (root, superseded)

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: `docker compose -f compose.dev.yaml up -d` brings up Postgres and the web app together, with the SPA served at `http://localhost:4000`.

- [ ] **Step 1: Write the app Dockerfile**

Create `apps/web/Dockerfile.dev`. It is a dev image — source is bind-mounted, dependencies are installed in the container:

```dockerfile
FROM node:22-bookworm
ENV CI=1
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
```

The root `Dockerfile.dev` carried `ELECTRON_SKIP_BINARY_DOWNLOAD` and `ELECTRON_OVERRIDE_DIST_PATH` because a plain-Node `require('electron')` threw inside a container with no binary. `packages/server` no longer imports Electron at all, so both go.

- [ ] **Step 2: Replace the app service in compose**

In `compose.dev.yaml`, replace the whole `master-dev` service with `web`, keeping the `db` service from Task 1:

```yaml
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile.dev
    working_dir: /app
    depends_on:
      db:
        condition: service_healthy
    command: >
      bash -lc "pnpm install --frozen-lockfile
      && pnpm --filter @chayxana/db exec prisma generate
      && pnpm --filter @chayxana/db exec prisma migrate deploy
      && pnpm --filter @chayxana/admin-ui build
      && pnpm --filter @chayxana/web start"
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://chayxana:chayxana@db:5432/chayxana?schema=public
      - PORT=4000
      - TZ=Asia/Tashkent
      - NODE_ENV=development
    volumes:
      - .:/app
      - node_modules:/app/node_modules
      - server_modules:/app/packages/server/node_modules
      - db_modules:/app/packages/db/node_modules
      - admin_ui_modules:/app/packages/admin-ui/node_modules
      - web_modules:/app/apps/web/node_modules
```

Replace the old `master_modules` / `order_modules` / `mobile_modules` volume entries with the five above plus `pgdata`.

`TZ=Asia/Tashkent` is belt and braces: every finance window is anchored at literal `+05:00` in `lib/time.ts` and does not depend on the process zone, but a container running in UTC while the code assumes otherwise is exactly the kind of thing that is invisible until a month-end report is wrong.

- [ ] **Step 3: Delete the superseded root Dockerfile**

```bash
cd /Users/uzmacbook/dev/lab/project02
git rm Dockerfile.dev
```

- [ ] **Step 4: Bring the stack up**

```bash
docker compose -f compose.dev.yaml down
docker compose -f compose.dev.yaml up -d --build
docker compose -f compose.dev.yaml logs -f web
```
Expected: install, generate, migrate, build, then `[web] listening on :4000`. Ctrl-C out of the logs once you see it.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/
```
Expected: `200` twice.

- [ ] **Step 5: Seed and re-point the smokes**

```bash
docker compose -f compose.dev.yaml exec -T web bash -lc \
  "pnpm --filter @chayxana/db exec tsx prisma/seed.ts"
```
Expected: completes.

Check whether the smokes hardcode a base URL:

```bash
cd /Users/uzmacbook/dev/lab/project02
grep -rn "localhost:4000\|127.0.0.1:4000" packages/server/scripts
```
If any do, replace the literal with `process.env.API_BASE ?? 'http://localhost:4000'` so the same script works inside and outside the container.

- [ ] **Step 6: Run the smokes against the real stack**

Run them in this order and never `smoke-summary-report.ts` alone — a bare seed has no closed orders, so on its own it passes with every figure at zero and its identity assertions hold trivially. `smoke-finance-pnl.ts` creates the closed orders it needs:

```bash
docker compose -f compose.dev.yaml exec -T web bash -lc \
  "pnpm --filter @chayxana/server exec tsx scripts/smoke-e2e-flow.ts"
docker compose -f compose.dev.yaml exec -T web bash -lc \
  "pnpm --filter @chayxana/server exec tsx scripts/smoke-stock-count.ts"
docker compose -f compose.dev.yaml exec -T web bash -lc \
  "pnpm --filter @chayxana/server exec tsx scripts/smoke-finance-pnl.ts"
docker compose -f compose.dev.yaml exec -T web bash -lc \
  "pnpm --filter @chayxana/server exec tsx scripts/smoke-summary-report.ts"
```
Expected: all four pass. **This is the real acceptance test for the whole slice** — it is the same business logic, on a different database, in a different process, reached over the same HTTP contract.

The smokes seed their own fixtures on every run and do not clean up, so a second run doubles every figure. That is a known property, not a regression: only compare absolute numbers against a freshly reset database.

To reset:

```bash
docker compose -f compose.dev.yaml exec -T web bash -lc \
  "pnpm --filter @chayxana/db exec prisma migrate reset --force"
```

- [ ] **Step 7: Open it in a browser**

Visit `http://localhost:4000` and log in with the seeded credentials. Click through Bugun, Tasdiqlash, Ombor and Kunlik moliya. This is the first time the real UI has run against the real server outside Electron — anything broken here is worth more than any typecheck.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(web): run the whole stack in compose against Postgres

compose.dev.yaml stops being a test harness and becomes the shape that ships:
Postgres with a healthcheck, the web app waiting on it, migrate deploy, the SPA
built and served from the same origin.

The Electron environment variables go with the root Dockerfile. packages/server
no longer imports electron, so a plain-Node require can no longer throw in a
container without the binary.

TZ is pinned to Asia/Tashkent. Every finance window is anchored at literal
+05:00 in lib/time.ts and does not depend on the process zone, but a container
in UTC while the code assumes otherwise is invisible until a month-end report is
wrong.

smoke-e2e-flow, smoke-stock-count, smoke-finance-pnl and smoke-summary-report
all pass against the stack — the same business logic, a different database, a
different process, the same HTTP contract."
```

---

### Task 8: Update the documentation

Four documents describe a system that no longer exists. Leaving them is worse than having no documentation, because they read as current.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/CURRENT_WORKFLOW.md`
- Modify: root `package.json`
- Modify: `docs/superpowers/specs/2026-08-16-web-platform-design.md`

**Interfaces:**
- Consumes: Tasks 1-7.
- Produces: documentation that matches the tree.

- [ ] **Step 1: Rewrite the root scripts**

In the root `package.json`, replace the `dev:master` / `build:master` scripts with the web ones. Keep the order and mobile entries:

```json
  "scripts": {
    "dev": "pnpm --filter @chayxana/web dev",
    "dev:ui": "pnpm --filter @chayxana/admin-ui dev",
    "dev:order": "pnpm --filter @chayxana/order dev",
    "dev:mobile": "pnpm --filter @chayxana/mobile start",
    "build:ui": "pnpm --filter @chayxana/admin-ui build",
    "build:order": "pnpm --filter @chayxana/order build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
```

- [ ] **Step 2: Update CLAUDE.md**

Rewrite these sections to match the tree:

- **Project** — three apps becomes three packages plus three apps. Name `packages/db`, `packages/server`, `packages/admin-ui`, `apps/web`, `apps/agent` (slice 2), `apps/master` (slice 5).
- **Commands** — every `pnpm dev:master` / `build:master` / `package:win` line is stale. Replace with the compose flow from Task 7 Step 4, the Vitest commands from Task 4, and the two admin-ui typecheck commands.
- **Build variants** — delete the whole section. `app-identity.ts`, the `next` variant, the two installer scripts and the port-4100 machinery are gone with Electron's server.
- **Headless dev server (Docker)** — replace with the real compose stack; it is no longer a special case.
- **Architecture** — Master becomes `packages/server` + `apps/web`; note that the renderer is now a same-origin SPA.
- Add a line to the typecheck note: `packages/server` sits at **49 pre-existing errors**, and `pnpm -r typecheck` is the command that sees them.

Add a warning that survives from the old text, since it still applies to the scripts that remain in `apps/master/scripts`: several `simulate-*.ts` scripts carry pre-v0.1.3 expectations and fail today.

- [ ] **Step 3: Update docs/CURRENT_WORKFLOW.md**

This file's rule is that it changes in the same commit as the behaviour it describes. Sections needing edits:

- Header snapshot line — branch and date.
- **§1** — "A single Windows machine runs apps/master" is wrong. The server runs on a Node process; the admin is a browser.
- **§9 Runtime** — the cold-start sequence, the packaged sql.js migration path, the build-identity and database-path discussion, and mDNS are all gone. Replace with the compose stack, `prisma migrate deploy`, and the required `DATABASE_URL`.
- **§4** — if Task 2 ran, the "What's still in the schema but dead" subsection is now false. Delete it and note the models were dropped with the fresh Postgres start.
- **§13** — add an entry recording that the SQLite migration history was dropped and why, so the next reader does not go looking for it.

Do **not** change §2 (the money path), §3 (roles), §5 (finance vocabulary) or §7 (real-time). None of them changed, and editing them would imply otherwise.

- [ ] **Step 4: Mark the slice done in the spec**

In `docs/superpowers/specs/2026-08-16-web-platform-design.md` §11, change slice 1's line to record the date and the commit range, matching how `2026-08-14-money-model-design.md` §11 records its own slice 1.

- [ ] **Step 5: Full verification sweep**

```bash
cd /Users/uzmacbook/dev/lab/project02
pnpm -r typecheck 2>&1 | grep -cE "error TS"
pnpm test
docker compose -f compose.dev.yaml up -d
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/health
```
Expected: 63 errors, all in `packages/server`, all pre-existing — 49 in `src/` matching the floor
table file-for-file, and 14 in `scripts/` that Task 3 Step 1 made visible for the first time. 6 tests
passing; `200`.

**One number may surprise you here.** Until this slice, `pnpm -r typecheck` bailed on `apps/master`
before ever reaching `apps/order` and `apps/mobile`, so neither has been typechecked in this
command's memory. With master's script stubbed they now run for the first time. If either surfaces
errors, **record the count in the commit body as a new pre-existing floor and do not fix them** —
they are untouched by this slice and belong to whoever next works in those apps.

```bash
grep -rn "sqlite\|SQLite" CLAUDE.md docs/CURRENT_WORKFLOW.md | grep -v "history\|dropped\|was "
```
Expected: **no matches** describing the live system in the present tense.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: describe the web system rather than the Electron one

CLAUDE.md's Commands, Build variants and Headless dev server sections all
described a system that no longer exists, and CURRENT_WORKFLOW §1 and §9 named
a Windows machine hosting its own server. Stale documentation that reads as
current is worse than none.

The money path, roles, finance vocabulary and real-time sections are
deliberately untouched: none of them changed in this slice, and editing them
would imply otherwise.

CURRENT_WORKFLOW §13 records that the SQLite migration history was dropped and
why, so the next reader does not go looking for it."
```

---

## Verification summary

The slice is done when all of these hold:

| Check | Command | Expected |
|---|---|---|
| Schema on Postgres | `psql -c "\dt"` in the `db` container | Live tables present, dead inventory tables absent |
| Money columns typed | the `information_schema` query in Task 1 Step 8 | precision 14, scale 2 |
| Server compiles | `pnpm --filter @chayxana/server exec tsc --noEmit` | 63 errors: 49 in `src/` matching the floor table, 14 pre-existing in `scripts/` newly surfaced |
| No Electron in the server | `grep -rn "from 'electron'" packages/server` | no matches |
| Tests pass | `pnpm test` | 6 passing in `packages/server` |
| UI compiles | `pnpm --filter @chayxana/admin-ui run typecheck` and `typecheck:gallery` | both clean |
| UI renders | `pnpm --filter @chayxana/admin-ui run gallery:page` | all 15 screens at 1366×768 |
| Same origin | `curl localhost:4000/api/health` and `curl localhost:4000/orders` | JSON, then the SPA |
| Business logic intact | the four smokes in Task 7 Step 6 | all pass |
| Browser | log in at `http://localhost:4000` | Bugun, Tasdiqlash, Ombor, Kunlik moliya all work |

## Out of scope

Everything in slices 2 to 5: the print agent and the confirm change, first-run setup, rate limits, CORS, the role and lockout fixes, TLS, VPS deployment, `pg_dump` backups, CI, the Electron kiosk shell, and re-pointing the waiter apps.

Also out of scope, and deliberately so: the 49 pre-existing type errors, every money-path bug in `docs/TECHNICAL_REVIEW_2026-08-16.md` not named in the spec's §7, and the stale `simulate-*.ts` scripts. Fixing behaviour inside a port is how a port becomes unreviewable.
