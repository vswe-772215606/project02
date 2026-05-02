# Phase 01-master / 01 — Schema, repositories, seed

**Goal:** add PostgreSQL + Prisma to the master backend. Apply the full schema. Build all repository files. Seed default data. The system has a populated database accessible through clean repository methods. No services, no HTTP routes, no business logic yet.

**Prerequisites:** `01-master/00-scaffolding.md` complete and verified.

**Estimated scope:** medium. Roughly 15-20 files (one repo per aggregate, the schema, the seed). Mostly mechanical.

---

## Read these files before starting

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md`
- `docs/agent-plans/00-shared/schema.md` ← copy schema from here verbatim
- `docs/agent-plans/00-shared/conventions.md`

## Context

This phase wires up persistence. After this phase:

- PostgreSQL is running locally (the human installed it manually before this phase — see "Human pre-requisites" below).
- `apps/master/prisma/schema.prisma` matches `00-shared/schema.md` exactly.
- All migrations are applied, including the partial unique index.
- Every model has a corresponding repository file with create/find/update/list methods.
- A seed script populates default users, settings, categories, and menu items.

No services or controllers are written. No new routes beyond `/api/health`. The agent must resist the urge to "make it do something useful" — that's the next phase.

## Human pre-requisites

The human must do these BEFORE running the agent on this phase:

1. Install PostgreSQL 16 on the dev machine (Windows installer from postgresql.org). Default Windows-service install.
2. Create a database named `chayxana` and a user `chayxana_app` with full privileges on it.
3. Tell the agent the connection string. Default to `postgresql://chayxana_app:chayxana_dev_pw@localhost:5432/chayxana`.

If the agent cannot connect to the database when running migrations, it must STOP and surface the error to the human, not improvise.

## Tasks

### 1. Install dependencies

```sh
cd apps/master
pnpm add @prisma/client bcryptjs
pnpm add -D prisma @types/bcryptjs tsx
cd ../..
```

### 2. Initialize Prisma

```sh
cd apps/master
pnpm prisma init
cd ../..
```

This creates `apps/master/prisma/schema.prisma` and `apps/master/.env`.

### 3. Set up .env

**`apps/master/.env`** (gitignored):

```
PORT=4000
NODE_ENV=development
DATABASE_URL="postgresql://chayxana_app:chayxana_dev_pw@localhost:5432/chayxana?schema=public"
```

**`apps/master/.env.example`** (committed; replace earlier version):

```
PORT=4000
NODE_ENV=development
DATABASE_URL="postgresql://chayxana_app:CHANGEME@localhost:5432/chayxana?schema=public"
```

### 4. Replace schema.prisma with the canonical schema

Open `docs/agent-plans/00-shared/schema.md`. Copy the Prisma block (between the triple backticks) **exactly** into `apps/master/prisma/schema.prisma`. Do not modify field names, types, indexes, or relations.

### 5. Run the initial migration

```sh
cd apps/master
pnpm prisma migrate dev --name init
cd ../..
```

This creates `apps/master/prisma/migrations/<timestamp>_init/migration.sql`. Verify it ran cleanly. If migration fails because of connection issues, STOP and surface to human.

### 6. Add the partial unique index migration

```sh
cd apps/master
pnpm prisma migrate dev --create-only --name one_active_order_per_table
```

This creates an empty migration folder. Find the `migration.sql` file inside it and replace its contents with:

```sql
CREATE UNIQUE INDEX "one_active_order_per_table"
  ON "Order" ("tableId")
  WHERE "status" NOT IN ('CLOSED', 'WALKOUT', 'CANCELED')
    AND "tableId" IS NOT NULL;
```

Apply it:

```sh
pnpm prisma migrate dev
cd ../..
```

### 7. Add the Prisma singleton

**`apps/master/src/main/server/lib/prisma.ts`**

```ts
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
```

### 8. Create repository files

Each repository lives in `apps/master/src/main/server/repositories/`. Each method takes an optional `tx?: Prisma.TransactionClient` so services can compose them in transactions later.

Create the following files. Each gets the methods listed; do not add extra methods unless explicitly noted.

**`user.repo.ts`**

Methods: `create(data)`, `findById(id)`, `findByUsername(username)`, `findActiveByPin(pinHash)` — note: takes hash because PINs are hashed; helper to find candidates is to fetch all WAITER users and compare via bcrypt at the service layer (this method just lists waiters with `pinHash != null`), `findByRole(role)`, `findAll()`, `update(id, data)`, `setLockedUntil(id, until)`, `incrementFailedLogins(id)`, `resetFailedLogins(id)`, `deactivate(id)`.

**`session.repo.ts`**

Methods: `create(data)`, `findActiveByToken(token)` — eagerly include `user`; null-out if expired, `deleteByUserId(userId)`, `deleteByToken(token)`, `touchLastUsed(id)`, `deleteExpired()`.

**`menu.repo.ts`** — handles Category, MenuItem, Combo, ComboComponent

Methods (Category): `createCategory(data)`, `findCategoryById(id)`, `listCategories(includeInactive=false)`, `updateCategory(id, data)`.

Methods (MenuItem): `createItem(data)`, `findItemById(id)`, `listItems(includeInactive=false)`, `listItemsByCategory(categoryId)`, `updateItem(id, data)`, `setAvailability(id, isAvailable)`, `listTrackedItems()`.

Methods (Combo): `createCombo(data)` — accepts components in same call, `findComboById(id)` — eagerly include components and their menuItems, `listCombos(includeInactive=false)`, `updateCombo(id, data)`, `replaceComponents(comboId, components)`.

**`table.repo.ts`**

Methods: `create(data)`, `findById(id)`, `findByName(name)`, `listAll(includeInactive=false)`, `update(id, data)`, `findActiveOrderId(tableId)` — returns the ID of any non-terminal order on this table or null. Use `findFirst` with the appropriate `where` clause matching the partial-unique-index conditions.

**`order.repo.ts`**

Methods: `create(data)`, `findById(id)`, `findByIdWithDetails(id)` — include lines (with menuItem), kitchenTickets, payments, table, waiter (id, fullName), appliedDiscount, approvedBy (id, fullName), `listActive()`, `listByWaiter(waiterId)`, `listByStatus(status)`, `listByDateRange(from, to)`, `setStatus(id, status, expectedFrom?)` — uses `updateMany` with status-guard if `expectedFrom` is provided, `applyTotals(id, totals)` — sets all snapshot fields, `setApproval(id, approverId, discountId, serviceChargeWaived)`, `setClosed(id)`, `setCanceled(id, reason)`, `setTransfer(id, newTableId)`.

**`orderLine.repo.ts`**

Methods: `create(data, tx?)`, `findById(id)`, `findByOrderId(orderId)`, `findByTicketId(ticketId)`, `attachToTicket(lineIds, ticketId, tx?)`, `updateNote(id, notes)`, `cancel(id, reason)`, `findUnsentByOrderId(orderId)` — lines where `kitchenTicketId is null` and not canceled.

**`kitchen.repo.ts`** — handles KitchenTicket

Methods: `create(data)`, `findById(id)`, `findByIdWithLines(id)` — include lines (with menuItem) and order (with table, waiter), `listActive()` — status PENDING or IN_PROGRESS, ordered by createdAt asc, eagerly include lines and order, `setStatus(id, status, expectedFrom?)` — guard with `expectedFrom` when provided, `setStarted(id)`, `setReady(id)`, `setCanceled(id)`.

**`discount.repo.ts`**

Methods: `create(data)`, `findById(id)`, `listActive()`, `listAll()`, `update(id, data)`, `softDelete(id)` — sets `isActive: false`.

**`payment.repo.ts`**

Methods: `createMany(orderId, payments, tx?)` — bulk insert in one call, `findByOrderId(orderId)`, `sumByOrderId(orderId)` — returns total decimal, `aggregateByMethodForDate(date)` — returns `{ CASH: total, CARD: total }`.

**`audit.repo.ts`**

Methods: `create(data, tx?)` — single audit log row, `list({ action?, userId?, from?, to?, page, pageSize })` — paginated, returns `{ items, total, page, pageSize }`.

**`setting.repo.ts`**

Methods: `findByKey(key)`, `findAll()`, `upsert(key, value, tx?)`, `upsertMany(entries, tx?)`.

**`printJob.repo.ts`**

Methods: `create(data, tx?)`, `findById(id)`, `markSuccess(id)`, `markFailed(id, errorMessage)`, `incrementAttempts(id)`, `listFailedSinceDate(date)`.

**`dailyStock.repo.ts`**

Methods: `findByItemAndDate(menuItemId, date)`, `listForDate(date)` — joined with menuItem (id, name, trackStock), `upsertForDate(menuItemId, date, initialCount, currentCount, setById, tx?)`, `decrementAtomic(menuItemId, date, quantity, tx?)` — uses `updateMany` with `where: { menuItemId, date, currentCount: { gte: quantity } }` so the decrement fails (returns count 0) if not enough stock; service translates to `OUT_OF_STOCK` error, `incrementAtomic(menuItemId, date, quantity, tx?)`, `setCurrentCount(menuItemId, date, count, tx?)`, `historyForItem(menuItemId, from, to)`.

#### Repo file template

Each repo file follows this exact shape. Example for `order.repo.ts`:

```ts
import { Prisma, OrderStatus } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const orderRepo = {
  async create(data: Prisma.OrderCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).order.create({ data });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).order.findUnique({ where: { id } });
  },

  // ... all other methods
};
```

Use named export `xxxRepo`. Do not export the methods individually.

### 9. Implement the seed script

**`apps/master/prisma/seed.ts`**

This file:

1. Creates default users (idempotent via `upsert`):
   - Owner: username `owner`, password `owner123`, role `OWNER`.
   - Admin: username `admin`, password `admin123`, role `ADMIN`.
   - Kitchen: username `kitchen1`, password `kitchen123`, role `KITCHEN`.
   - Waiter: full name `Waiter Botir`, PIN `5678`, role `WAITER`.
   - Waiter: full name `Waiter Aziza`, PIN `2468` (NOT `1234` — that's blacklisted as trivial — and NOT `1234`), role `WAITER`.

   PINs and passwords are bcryptjs-hashed (cost 10).

2. Creates default settings via `upsertMany`:
   - `service_charge_amount` = `"10000"`
   - `max_discount_percent` = `"15"`
   - `max_discount_amount` = `"100000"`
   - `kitchen_printer_enabled` = `"false"`
   - `admin_printer_name` = `"POS-80"`
   - `kitchen_printer_name` = `""`
   - `store_heading` = `"Chayxana"`

3. Creates 5 categories: `Salatlar`, `Sho'rvalar`, `Osh va kabob`, `Choy`, `Non` (each with `displayOrder` 0..4).

4. Creates ~10-12 menu items spread across these categories with realistic UZS prices. A few should have `trackStock: true` (e.g., kebab, somsa, salads). Drinks and plov should have `trackStock: false`.

5. Creates 6 tables: 3 of type `ROOM` (Xona 1, Xona 2, Xona 3), 3 of type `TABLE` (Stol 1, Stol 2, Stol 3).

6. Creates 1 sample combo "Lunch Set" composed of 3 menu items (e.g., a soup + a main + a tea).

Use `upsert` with `where: { name: ... }` (or another natural unique key) so re-running seed doesn't create duplicates.

Wire the seed in `apps/master/package.json`:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

Run it:

```sh
cd apps/master
pnpm prisma db seed
cd ../..
```

### 10. Implement smoke test script

**`apps/master/scripts/smoke-test-repos.ts`**

A short script that exercises every repo at least once. Example shape:

```ts
import { getPrisma, disconnectPrisma } from '../src/main/server/lib/prisma';
import { userRepo } from '../src/main/server/repositories/user.repo';
import { menuRepo } from '../src/main/server/repositories/menu.repo';
// ... import all repos

async function main() {
  console.log('--- users ---');
  const allUsers = await userRepo.findAll();
  console.log('Total users:', allUsers.length);

  console.log('--- categories ---');
  const cats = await menuRepo.listCategories();
  console.log('Total categories:', cats.length);

  // ... at least one read per repo

  console.log('--- partial unique index ---');
  // try to create two active orders on same table; second should throw P2002
  // (commented out since seed doesn't create orders; just describe the test)

  await disconnectPrisma();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run it:

```sh
cd apps/master
pnpm tsx scripts/smoke-test-repos.ts
cd ../..
```

It must complete without errors. Output should show non-zero counts for users, categories, menu items, tables.

## Constraints

- The schema in `apps/master/prisma/schema.prisma` MUST match `00-shared/schema.md` exactly. No additions, no removals, no renames.
- Repos have ONLY the methods listed. Do not add `delete()` (use soft-delete via `update`), do not add `count()` unless explicitly listed.
- Prisma queries live ONLY in repos. Do not write Prisma queries in `seed.ts` directly — go through `getPrisma()` is fine for seed since it's a one-off script outside the runtime layers.
- Do not modify the express server, the renderer, or the Electron main beyond adding the prisma singleton.
- Do not create any service or controller file.
- bcryptjs cost factor is **10**. Not higher, not lower.
- Re-running the seed script must not create duplicates. Use `upsert`.
- Do not run `prisma migrate reset` even if migrations get tangled. Surface to human.

## Verification gate

The agent must run all of these and show the output.

### V1. Migrations applied

```sh
cd apps/master
pnpm prisma migrate status
cd ../..
```

Output must show all migrations as applied (including `init` and `one_active_order_per_table`).

### V2. Schema in DB matches Prisma

```sh
cd apps/master
pnpm prisma db pull --print
cd ../..
```

The pulled schema (printed to stdout) must reflect the same tables and columns as the schema file. (It won't be byte-for-byte identical due to formatting; just verify the tables and key fields exist.)

### V3. Partial unique index exists

Connect to PG via psql or another client and run:

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'Order' AND indexname = 'one_active_order_per_table';
```

Must return one row.

### V4. Seed succeeded

```sh
cd apps/master
pnpm prisma db seed
cd ../..
```

Output must complete without errors. Run it twice — second run must also complete without errors (idempotent).

Then verify counts via psql:

```sql
SELECT COUNT(*) FROM "User";       -- expect 5
SELECT COUNT(*) FROM "Category";   -- expect 5
SELECT COUNT(*) FROM "MenuItem";   -- expect ~10-12
SELECT COUNT(*) FROM "Table";      -- expect 6
SELECT COUNT(*) FROM "Combo";      -- expect 1
SELECT COUNT(*) FROM "Setting";    -- expect 7
```

### V5. Smoke test passes

```sh
cd apps/master
pnpm tsx scripts/smoke-test-repos.ts
cd ../..
```

Must complete without throwing. Output must show non-zero counts.

### V6. Typecheck still passes

```sh
pnpm typecheck
```

Must succeed.

### V7. Master still boots

```sh
pnpm dev:master
```

Electron window opens. Renderer still shows the success message from phase 0. (The health endpoint hasn't changed.)

## Definition of done

- [ ] `apps/master/prisma/schema.prisma` matches the canonical schema.
- [ ] All migrations applied including the partial unique index.
- [ ] `getPrisma()` singleton exists at `apps/master/src/main/server/lib/prisma.ts`.
- [ ] All 11 repository files exist with the listed methods.
- [ ] Seed script runs idempotently (twice without error).
- [ ] Smoke test script passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm dev:master` still boots.
- [ ] V3 confirms the partial unique index is live in PG.

When all are checked, stop. Wait for human approval before moving to phase `01-master/02-services.md`.
