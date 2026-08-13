# Count-Based Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ingredient/recipe/FIFO inventory layer with per-menu-item counts and a typed cost, per `docs/superpowers/specs/2026-08-13-count-based-inventory-design.md`.

**Architecture:** `MenuItem` gains `counted`/`stockCount`/`costPrice`; an append-only `StockEntry` table records the two admin verbs (restock, count). A new `stock.service.ts` replaces the FIFO engine behind the same `consume`/`restore` entry points, so the order state machine is untouched. Finance formulas stay; three read-points re-bind from `Purchase` to `StockEntry`. All ingredient-shaped code (services, repos, routes, three admin pages) is deleted; one Ombor page replaces them.

**Tech Stack:** Electron main-process Express + Prisma/SQLite (CommonJS), React 19 + TanStack Query + react-hook-form/zod renderer, zod controllers, smoke scripts over HTTP + direct Prisma.

## Global Constraints

- Workdir: repo root is `/Users/uzmacbook/dev/lab/project02`; all master-app commands run in `apps/master/` unless the command starts with `pnpm --filter` or `pnpm typecheck`.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, no `any` (use `unknown` + narrowing).
- 2-space indent, single quotes, semicolons, trailing commas. Files `kebab-case.ts`, components `PascalCase.tsx`.
- All user-facing strings in Uzbek. No i18n library.
- All Prisma calls live in `src/main/server/repositories/`; services orchestrate; controllers stay thin and zod-parse every body.
- Errors: only `AppError` via `Errors.*` from `src/main/server/lib/errors.ts`.
- Do NOT touch: `billing.service.ts`, the confirm/payment/debt flow in `order.service.ts` (except the two import lines named in Task 2), `expense.service.ts` math, `lib/time.ts`, the `cashOut`/same-day-reversal logic, printer, auth.
- Old inventory tables (`Ingredient`, `Recipe`, `RecipeIngredient`, `RecipeEdit`, `Purchase`, `IngredientMovement`, `OrderLineBatchConsumption`, `Stocktake`, `StocktakeEntry`, `WasteEvent`) KEEP their Prisma models and data. Only code that reads/writes them is deleted.
- Commit messages: conventional (`feat:`/`refactor:`/`docs:`), imperative, no AI attribution of any kind, no emoji.
- Gate for every task: `pnpm typecheck` (repo root) passes before commit.
- Smoke scripts follow the house pattern: HTTP against a running `pnpm dev:master` (default `http://localhost:4000`, admin `admin`/`admin123`, waiter PIN `5678`) plus direct Prisma assertions against `apps/master/prisma/dev.db`. Reset dev DB when needed: `cd apps/master && rm -f prisma/dev.db && pnpm exec prisma migrate dev && pnpm exec tsx prisma/seed.ts`.

---

### Task 1: Schema — new fields, StockEntry, backfill

**Files:**
- Modify: `apps/master/prisma/schema.prisma`
- Create: `apps/master/prisma/migrations/<timestamp>_count_based_inventory/migration.sql` (generated, then backfill appended)

**Interfaces:**
- Produces: `MenuItem.counted: Boolean`, `MenuItem.stockCount: Int?`, `MenuItem.costPrice: Decimal?`; model `StockEntry`; enum `StockEntryKind { RESTOCK COUNT }`; `AuditAction` values `STOCK_RESTOCKED`, `STOCK_COUNT_SET`, `ITEM_COST_CHANGED`. Every later task relies on these exact names.

- [ ] **Step 1: Edit `schema.prisma`**

In `model MenuItem`, after the `unitCostSnapshot Decimal?` field block, add:

```prisma
  // Count-based inventory (2026-08 refactor). `counted` governs availability:
  // stockCount NULL = sanoq kiritilmagan (blocked), 0..n otherwise. costPrice
  // is the typed tan narx per portion; NULL books 0 COGS.
  counted      Boolean      @default(true)
  stockCount   Int?
  costPrice    Decimal?
```

In `model MenuItem` relations, after `ingredients Ingredient[] @relation("DishIngredients")`, add:

```prisma
  stockEntries    StockEntry[]
```

In `model User` relations, after `expenseReturnsReceived ExpenseReturn[] @relation("ExpenseReturnReceiver")`, add:

```prisma
  stockEntries          StockEntry[]         @relation("StockEntryActor")
```

In `model Expense` relations, after `returns ExpenseReturn[]`, add:

```prisma
  stockEntry        StockEntry?
```

In `enum AuditAction`, after `WASTE_RECORDED`, add:

```prisma
  STOCK_RESTOCKED
  STOCK_COUNT_SET
  ITEM_COST_CHANGED
```

At the end of the file, add:

```prisma
enum StockEntryKind {
  RESTOCK
  COUNT
}

// Count-based inventory journal: append-only record of the two admin verbs.
// Sales are NOT journaled here — they are reconstructible from OrderLines.
model StockEntry {
  id          String         @id @default(cuid())
  menuItemId  String
  kind        StockEntryKind
  qty         Int
  countBefore Int?
  countAfter  Int
  paidUzs     Decimal?
  unitCost    Decimal?
  expenseId   String?        @unique
  note        String?
  actorUserId String
  occurredAt  DateTime
  createdAt   DateTime       @default(now())

  menuItem MenuItem @relation(fields: [menuItemId], references: [id])
  expense  Expense? @relation(fields: [expenseId], references: [id])
  actor    User     @relation("StockEntryActor", fields: [actorUserId], references: [id])

  @@index([menuItemId, occurredAt])
  @@index([occurredAt])
}
```

- [ ] **Step 2: Generate the migration without applying**

Run (in `apps/master/`): `pnpm exec prisma migrate dev --name count_based_inventory --create-only`
Expected: a new folder `prisma/migrations/<ts>_count_based_inventory/` containing `migration.sql` with `ALTER TABLE "MenuItem" ADD COLUMN ...` ×3 and `CREATE TABLE "StockEntry" ...`.

- [ ] **Step 3: Append the backfill to `migration.sql`**

Append at the end of the generated `migration.sql`:

```sql
-- Backfill (design D5): counted=false for SERVICE and for FOOD with no
-- tracking relations (old UNTRACKED). stockCount stays NULL everywhere
-- (fresh start — admin types real counts on day one).
UPDATE "MenuItem" SET "counted" = false
WHERE "kind" = 'SERVICE'
   OR ("kind" = 'FOOD'
       AND NOT EXISTS (SELECT 1 FROM "Recipe" r JOIN "RecipeIngredient" ri ON ri."recipeId" = r."id" WHERE r."menuItemId" = "MenuItem"."id")
       AND NOT EXISTS (SELECT 1 FROM "Ingredient" i WHERE i."selfMenuItemId" = "MenuItem"."id"));

-- costPrice seed, only where honest: dona-based self-ingredient items get the
-- last purchase unit cost; recipe dishes get per-portion recipe cost at last
-- purchase prices. kg/l self-ingredient items stay NULL (their old numbers
-- were the F-11 1000x understatement).
UPDATE "MenuItem" SET "costPrice" = (
  SELECT i."weightedAvgCost" FROM "Ingredient" i
  WHERE i."selfMenuItemId" = "MenuItem"."id" AND i."recipeUnit" = 'dona'
)
WHERE EXISTS (SELECT 1 FROM "Ingredient" i WHERE i."selfMenuItemId" = "MenuItem"."id" AND i."recipeUnit" = 'dona');

UPDATE "MenuItem" SET "costPrice" = (
  SELECT SUM(ri."quantity" * i."weightedAvgCost")
  FROM "Recipe" r
  JOIN "RecipeIngredient" ri ON ri."recipeId" = r."id"
  JOIN "Ingredient" i ON i."id" = ri."ingredientId"
  WHERE r."menuItemId" = "MenuItem"."id"
)
WHERE EXISTS (SELECT 1 FROM "Recipe" r JOIN "RecipeIngredient" ri ON ri."recipeId" = r."id" WHERE r."menuItemId" = "MenuItem"."id");
```

- [ ] **Step 4: Apply and regenerate**

Run: `pnpm exec prisma migrate dev` then `pnpm prisma:generate`
Expected: migration applied, client regenerated, no errors.

- [ ] **Step 5: Verify backfill against the seeded dev DB**

Run: `pnpm exec tsx -e "import {PrismaClient} from '@prisma/client'; const p = new PrismaClient(); p.menuItem.findMany({select:{name:true,kind:true,counted:true,stockCount:true,costPrice:true}}).then(r=>{console.table(r.map(x=>({...x,costPrice:x.costPrice?.toString()??null})));return p.\$disconnect();});"`
Expected: choy items `counted=false`; dishes with recipes/self-ingredients `counted=true`; every `stockCount` is `null`; recipe dishes have non-null `costPrice`.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck` (repo root). Expected: PASS (new fields are additive).

```bash
git add apps/master/prisma
git commit -m "feat(inventory): schema for count-based stock — MenuItem counts, StockEntry journal"
```

---

### Task 2: stock.service core — consume/restore replaces FIFO

**Files:**
- Create: `apps/master/src/main/server/services/stock.service.ts`
- Create: `apps/master/src/main/server/repositories/stockEntry.repo.ts`
- Modify: `apps/master/src/main/server/repositories/menu.repo.ts` (add three stock helpers)
- Modify: `apps/master/src/main/server/services/order.service.ts` (import swap only)
- Modify: `apps/master/src/main/server/services/alert.service.ts:125-137` (`ingredientStockOut` → `itemStockOut`)
- Modify: `apps/master/src/main/server/socket.ts:51-52` (join `'all'`)
- Delete: `apps/master/src/main/server/services/consumption.service.ts`
- Test: `apps/master/scripts/smoke-stock-count.ts` (part 1)

**Interfaces:**
- Consumes: Task 1 schema; `menuRepo.findItemById(id, tx)`; `deferEmit/deferAfterCommit` from `lib/socket-events`.
- Produces: `stockService.consume(line: {id: string; menuItemId: string; actorUserId: string}, portions: number, tx: Prisma.TransactionClient): Promise<void>` and `stockService.restore(...same signature...)` — exact drop-in for `consumptionService.consume/restore`. `menuRepo.decrementStockAtomic(id, qty, tx)`, `menuRepo.incrementStockCounted(id, qty, tx)`, `menuRepo.setStock(id, count, tx)`. `alertService.itemStockOut({ itemName: string })`. Task 3 adds admin verbs to the same `stockService` object.

- [ ] **Step 1: Add stock helpers to `menu.repo.ts`**

Append inside the `menuRepo` object (after `setAvailability`):

```ts
  /**
   * Atomic sale-side decrement: matches only counted items with enough stock.
   * SQL `NULL >= n` is not-true, so a never-counted item (stockCount NULL)
   * fails the guard and the caller treats it as out of stock.
   */
  async decrementStockAtomic(id: string, qty: number, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.updateMany({
      where: { id, counted: true, stockCount: { gte: qty } },
      data: { stockCount: { decrement: qty } },
    });
  },

  /**
   * Restore-side increment. Guarded to counted items with a non-NULL count:
   * incrementing NULL would keep NULL (SQLite NULL + n = NULL), so a line
   * restored after `counted` was re-toggled simply leaves the item awaiting
   * its first count — the desired outcome.
   */
  async incrementStockCounted(id: string, qty: number, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.updateMany({
      where: { id, counted: true, stockCount: { not: null } },
      data: { stockCount: { increment: qty } },
    });
  },

  async setStock(id: string, count: number, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.update({
      where: { id },
      data: { stockCount: count },
    });
  },
```

- [ ] **Step 2: Create `repositories/stockEntry.repo.ts`**

```ts
import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const entryInclude = {
  menuItem: { select: { id: true, name: true } },
  actor: { select: { id: true, fullName: true } },
  expense: { select: { id: true, status: true } },
} satisfies Prisma.StockEntryInclude;

export const stockEntryRepo = {
  async create(data: Prisma.StockEntryCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).stockEntry.create({ data, include: entryInclude });
  },

  async listForItem(menuItemId: string, limit = 50, tx?: Tx) {
    return (tx ?? getPrisma()).stockEntry.findMany({
      where: { menuItemId },
      include: entryInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  },

  /**
   * Money-restocks in a half-open window, excluding entries whose linked
   * expense was reversed (their cash was unwound). Drives the "Xaridlar"
   * finance block after the Purchase model stops being written.
   */
  async listMoneyForRange(start: Date, end: Date, tx?: Tx) {
    return (tx ?? getPrisma()).stockEntry.findMany({
      where: {
        occurredAt: { gte: start, lt: end },
        paidUzs: { not: null },
        expense: { status: { not: 'REVERSED' } },
      },
      include: entryInclude,
      orderBy: [{ occurredAt: 'asc' }],
    });
  },

  async aggregateMoneyForRange(start: Date, end: Date, tx?: Tx) {
    const client = tx ?? getPrisma();
    const where = {
      occurredAt: { gte: start, lt: end },
      paidUzs: { not: null },
      expense: { status: { not: 'REVERSED' as const } },
    };
    const [sum, count] = await Promise.all([
      client.stockEntry.aggregate({ where, _sum: { paidUzs: true } }),
      client.stockEntry.count({ where }),
    ]);
    return { total: sum._sum.paidUzs ?? new Prisma.Decimal(0), count };
  },
};
```

- [ ] **Step 3: Create `services/stock.service.ts` (core half)**

```ts
import { MenuItemKind, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferAfterCommit, deferEmit } from '../lib/socket-events';
import { alertService } from './alert.service';
import { menuRepo } from '../repositories/menu.repo';

type Tx = Prisma.TransactionClient;

type LineRef = {
  id: string;
  menuItemId: string;
  actorUserId: string;
};

async function adjustLineCogs(orderLineId: string, delta: Prisma.Decimal, tx: Tx) {
  if (delta.eq(0)) return;
  const line = await tx.orderLine.findUnique({
    where: { id: orderLineId },
    select: { cogsSnapshot: true },
  });
  const before = line?.cogsSnapshot ?? new Prisma.Decimal(0);
  await tx.orderLine.update({
    where: { id: orderLineId },
    data: { cogsSnapshot: before.plus(delta) },
  });
}

export const stockService = {
  /**
   * Sale-side consumption for N portions of an order line. Same contract the
   * old FIFO consumptionService had: throws OutOfStock inside the caller's
   * transaction so a failed add rolls back atomically. Counted items get one
   * atomic conditional decrement; cost is booked as costPrice × portions.
   */
  async consume(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const item = await menuRepo.findItemById(line.menuItemId, tx);
    if (!item) throw Errors.NotFound('Menu item');
    if (item.kind === MenuItemKind.SERVICE) return;

    if (item.counted) {
      const res = await menuRepo.decrementStockAtomic(item.id, portions, tx);
      if (res.count === 0) {
        // Covers both "0 left" and "stockCount NULL (sanoq kiritilmagan)".
        throw Errors.OutOfStock(item.name);
      }
      const fresh = await tx.menuItem.findUnique({
        where: { id: item.id },
        select: { stockCount: true },
      });
      const after = fresh?.stockCount ?? 0;
      deferEmit('admin', 'stock:changed', { menuItemId: item.id });
      if (after <= 0) {
        deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: false });
        const itemName = item.name;
        deferAfterCommit(() => alertService.itemStockOut({ itemName }));
      }
    }

    if (item.costPrice) {
      await adjustLineCogs(line.id, new Prisma.Decimal(item.costPrice).mul(portions), tx);
    }
  },

  /**
   * Restore for N portions (quantity decrease, line cancel, order cancel from
   * DRAFT and SENT — same rules as before; WALKOUT never calls this).
   * cogsSnapshot is recomputed proportionally from the line's own snapshot,
   * which preserves the frozen at-add-time cost even if costPrice changed.
   * A line already marked isCanceled keeps its snapshot (reports filter it).
   */
  async restore(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const item = await menuRepo.findItemById(line.menuItemId, tx);
    if (!item) throw Errors.NotFound('Menu item');
    if (item.kind === MenuItemKind.SERVICE) return;

    if (item.counted) {
      const before = await tx.menuItem.findUnique({
        where: { id: item.id },
        select: { stockCount: true },
      });
      await menuRepo.incrementStockCounted(item.id, portions, tx);
      deferEmit('admin', 'stock:changed', { menuItemId: item.id });
      if ((before?.stockCount ?? 0) <= 0) {
        deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: true });
      }
    }

    const fresh = await tx.orderLine.findUnique({
      where: { id: line.id },
      select: { quantity: true, cogsSnapshot: true, isCanceled: true },
    });
    if (!fresh || fresh.isCanceled) return;
    const cogs = fresh.cogsSnapshot ?? new Prisma.Decimal(0);
    if (cogs.eq(0) || fresh.quantity <= 0) return;
    const remainingQty = Math.max(fresh.quantity - portions, 0);
    const newCogs = cogs.mul(remainingQty).div(fresh.quantity);
    await tx.orderLine.update({
      where: { id: line.id },
      data: { cogsSnapshot: newCogs },
    });
  },
};
```

- [ ] **Step 4: Swap `order.service.ts` onto the new service**

In `apps/master/src/main/server/services/order.service.ts`, replace the import line

```ts
import { consumptionService } from './consumption.service';
```

with

```ts
import { stockService } from './stock.service';
```

then replace every `consumptionService.` with `stockService.` (five call sites: `maybeRestoreLineStock`, `addLine`, `addCombo`, `updateLineQuantity` ×2). Verify with: `grep -n 'consumptionService' src/main/server/services/order.service.ts` → no matches.

- [ ] **Step 5: Replace the stock-out alert**

In `services/alert.service.ts`, replace the whole `ingredientStockOut` method (lines 125-137) with:

```ts
  async itemStockOut(p: { itemName: string }): Promise<void> {
    if (!boolSetting('alert_low_stock_enabled', true)) return;
    await send(
      `📦 <b>Taom tugadi</b>\n` +
        `<b>${p.itemName}</b> — qoldiq 0`,
    );
  },
```

- [ ] **Step 6: Join the `'all'` room (audit C-8 one-liner)**

In `socket.ts`, after line 52 (`if (user.role === 'WAITER') socket.join(...)`), add:

```ts
    socket.join('all');
```

- [ ] **Step 7: Delete the FIFO engine**

```bash
git rm src/main/server/services/consumption.service.ts
```

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck` (repo root).
Expected: PASS — nothing else imported `consumption.service` (verify: `grep -rn 'consumption.service' apps/master/src` → no matches).

- [ ] **Step 9: Start smoke script (part 1) — `scripts/smoke-stock-count.ts`**

Create with the house HTTP harness and the sale-path assertions. Copy the helper block verbatim from `scripts/smoke-fifo.ts` lines 16-56 (`PrismaClient` import, `BASE_URL`, `ADMIN_USER`, `WAITER_PIN`, `c`, `step`, `ok`, `note`, `fail`, `assertEq`, `http`), then:

```ts
async function loginAdmin() {
  return (await http<{ token: string }>('POST', '/api/auth/login', { body: ADMIN_USER })).body.token;
}
async function loginWaiter() {
  return (await http<{ token: string }>('POST', '/api/auth/login-pin', { body: { pin: WAITER_PIN } })).body.token;
}

async function main() {
  const admin = await loginAdmin();
  const waiter = await loginWaiter();
  const cat = await prisma.category.findFirst({ where: { isActive: true } });
  if (!cat) return fail('No active category — seed the dev DB first');
  const suffix = Date.now().toString().slice(-6);

  step('1', 'Counted item with no count is blocked');
  const item = (await http<{ id: string }>('POST', '/api/menu/items', {
    token: admin,
    body: { categoryId: cat.id, name: `Smoke plov ${suffix}`, price: 30000, mode: 'COUNTED', costPrice: 20000 },
  })).body;
  const draft = (await http<{ id: string }>('POST', '/api/orders', {
    token: waiter,
    body: { orderType: 'TAKEAWAY' },
  })).body;
  await http('POST', `/api/orders/${draft.id}/items`, {
    token: waiter,
    body: { menuItemId: item.id, quantity: 1 },
    expectStatus: 409,
  });
  ok('addLine on NULL count → 409 OUT_OF_STOCK');

  step('2', 'Count-set unblocks; sale decrements and books cost × qty');
  await http('POST', `/api/stock/${item.id}/count`, { token: admin, body: { countedQty: 10 } });
  await http('POST', `/api/orders/${draft.id}/items`, {
    token: waiter,
    body: { menuItemId: item.id, quantity: 3 },
  });
  const afterSale = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
  assertEq('stockCount after selling 3 of 10', afterSale.stockCount, 7);
  const line = await prisma.orderLine.findFirstOrThrow({ where: { orderId: draft.id, menuItemId: item.id } });
  assertEq('line cogsSnapshot (20000 × 3)', line.cogsSnapshot?.toFixed(0), '60000');

  step('3', 'Quantity decrease restores count and recomputes COGS proportionally');
  await http('PATCH', `/api/orders/${draft.id}/lines/${line.id}/quantity`, {
    token: waiter,
    body: { quantity: 1 },
  });
  const afterDecrease = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
  assertEq('stockCount after decrease to 1', afterDecrease.stockCount, 9);
  const lineAfter = await prisma.orderLine.findUniqueOrThrow({ where: { id: line.id } });
  assertEq('cogsSnapshot after decrease', lineAfter.cogsSnapshot?.toFixed(0), '20000');

  step('4', 'Zero blocks the sale');
  await http('POST', `/api/stock/${item.id}/count`, { token: admin, body: { countedQty: 0, note: 'smoke: zero' } });
  await http('POST', `/api/orders/${draft.id}/items`, {
    token: waiter,
    body: { menuItemId: item.id, quantity: 1 },
    expectStatus: 409,
  });
  ok('addLine at count 0 → 409');

  console.log(`\n${c(32, 'SMOKE STOCK-COUNT (part 1) PASSED')}`);
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
```

Note: steps 2-4 exercise `/api/stock/*` which lands in Task 3 — the script is committed complete here and its first full run is Task 3 Step 7.

- [ ] **Step 10: Verify part 1 behavior manually (server paths that exist now)**

With `pnpm dev:master` running and a fresh seeded DB: seeded dishes have `stockCount NULL`, so adding any counted dish to an order must 409. Run: `pnpm exec tsx -e` one-liner or check via the running app. Expected: `OUT_OF_STOCK` error surfaces; uncounted (choy) items still sell.

- [ ] **Step 11: Commit**

```bash
git add src/main/server scripts/smoke-stock-count.ts
git commit -m "feat(inventory): count-based consume/restore replaces FIFO engine"
```

---

### Task 3: stock admin verbs — restock, count, list, entries + routes

**Files:**
- Modify: `apps/master/src/main/server/services/stock.service.ts` (add admin half)
- Create: `apps/master/src/main/server/controllers/stock.controller.ts`
- Create: `apps/master/src/main/server/routes/stock.routes.ts`
- Modify: `apps/master/src/main/server/app.ts` (mount `/api/stock`)
- Test: `apps/master/scripts/smoke-stock-count.ts` (part 2 appended)

**Interfaces:**
- Consumes: Task 2 `stockService`/`stockEntryRepo`/`menuRepo.setStock`; `expenseRepo.create`; `auditService.log`; `withEmitContext/flushDeferredEmits` from `lib/socket-events`.
- Produces: `stockService.restock(input: { menuItemId: string; qty: number; paidUzs?: number | string | null; setCostFromPaid?: boolean; note?: string; occurredAt: Date; actorUserId: string })`; `stockService.setCount(input: { menuItemId: string; countedQty: number; note?: string; occurredAt: Date; actorUserId: string })`; `stockService.listCounted()`; `stockService.listEntries(menuItemId: string)`. REST: `GET /api/stock`, `GET /api/stock/:menuItemId/entries`, `POST /api/stock/:menuItemId/restock`, `POST /api/stock/:menuItemId/count` (all ADMIN+OWNER). Entry DTO shape (Task 7 renderer relies on it): `{ id, kind, qty, countBefore, countAfter, paidUzs, unitCost, note, occurredAt, actorName, expenseId }`; item DTO: `{ id, name, categoryId, categoryName, price, stockCount, costPrice, isAvailable, isActive, lastEntryAt }`.

- [ ] **Step 1: Add imports and admin verbs to `stock.service.ts`**

Extend the import block:

```ts
import { flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { stockEntryRepo } from '../repositories/stockEntry.repo';
import { expenseRepo } from '../repositories/expense.repo';
import { auditService } from './audit.service';
import { StockEntryKind } from '@prisma/client';
```

Add above `export const stockService`:

```ts
const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

type EntryRow = Awaited<ReturnType<typeof stockEntryRepo.create>>;

function mapEntry(e: EntryRow) {
  return {
    id: e.id,
    menuItemId: e.menuItemId,
    kind: e.kind,
    qty: e.qty,
    countBefore: e.countBefore,
    countAfter: e.countAfter,
    paidUzs: e.paidUzs ? e.paidUzs.toFixed(0) : null,
    unitCost: e.unitCost ? e.unitCost.toFixed(0) : null,
    note: e.note,
    occurredAt: e.occurredAt.toISOString(),
    actorName: e.actor.fullName,
    expenseId: e.expense?.id ?? null,
  };
}

async function getCountedItemOrThrow(menuItemId: string) {
  const item = await menuRepo.findItemById(menuItemId);
  if (!item || !item.isActive) throw Errors.NotFound('Taom');
  if (item.kind === MenuItemKind.SERVICE || !item.counted) {
    throw Errors.Validation('Bu taom sanalmaydi');
  }
  return item;
}
```

Add inside the `stockService` object, after `restore`:

```ts
  /** "+ Keldi": additive restock, optional money → excluded Expense + derived cost. */
  async restock(input: {
    menuItemId: string;
    qty: number;
    paidUzs?: number | string | null;
    setCostFromPaid?: boolean;
    note?: string;
    occurredAt: Date;
    actorUserId: string;
  }) {
    return withEmitContext(async () => {
      const item = await getCountedItemOrThrow(input.menuItemId);
      if (!Number.isInteger(input.qty) || input.qty <= 0) {
        throw Errors.Validation("Miqdor 0 dan katta butun son bo'lishi kerak");
      }
      const paid = input.paidUzs !== undefined && input.paidUzs !== null
        ? new Prisma.Decimal(input.paidUzs)
        : null;
      if (paid && paid.lte(0)) {
        throw Errors.Validation("To'langan summa 0 dan katta bo'lishi kerak");
      }
      const unitCost = paid ? paid.div(input.qty) : null;

      const entry = await getPrisma().$transaction(async (tx) => {
        const fresh = await tx.menuItem.findUniqueOrThrow({
          where: { id: item.id },
          select: { stockCount: true },
        });
        const before = fresh.stockCount;
        const after = (before ?? 0) + input.qty;
        await menuRepo.setStock(item.id, after, tx);

        let expenseId: string | null = null;
        if (paid) {
          const expense = await expenseRepo.create({
            category: { connect: { id: INGREDIENT_EXPENSE_CATEGORY_ID } },
            amount: paid,
            reason: `Keldi: ${item.name}`,
            note: input.note?.trim() || null,
            occurredAt: input.occurredAt,
            createdBy: { connect: { id: input.actorUserId } },
          }, tx);
          expenseId = expense.id;
        }
        if (paid && unitCost && input.setCostFromPaid) {
          await menuRepo.updateItem(item.id, { costPrice: unitCost }, tx);
        }

        const created = await stockEntryRepo.create({
          menuItem: { connect: { id: item.id } },
          kind: StockEntryKind.RESTOCK,
          qty: input.qty,
          countBefore: before,
          countAfter: after,
          paidUzs: paid,
          unitCost,
          expense: expenseId ? { connect: { id: expenseId } } : undefined,
          note: input.note?.trim() || null,
          actor: { connect: { id: input.actorUserId } },
          occurredAt: input.occurredAt,
        }, tx);

        await auditService.log({
          userId: input.actorUserId,
          action: 'STOCK_RESTOCKED',
          entityType: 'MenuItem',
          entityId: item.id,
          metadata: {
            itemName: item.name,
            qty: input.qty,
            countBefore: before,
            countAfter: after,
            paidUzs: paid ? paid.toFixed(0) : null,
            unitCost: unitCost ? unitCost.toFixed(0) : null,
            costUpdated: Boolean(paid && input.setCostFromPaid),
            expenseId,
          },
        }, tx);

        deferEmit('admin', 'stock:changed', { menuItemId: item.id });
        if ((before ?? 0) <= 0 && after > 0) {
          deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: true });
        }
        return created;
      });

      await flushDeferredEmits();
      return mapEntry(entry);
    });
  },

  /** "Sanoq": absolute count set — the only stock correction mechanism. */
  async setCount(input: {
    menuItemId: string;
    countedQty: number;
    note?: string;
    occurredAt: Date;
    actorUserId: string;
  }) {
    return withEmitContext(async () => {
      const item = await getCountedItemOrThrow(input.menuItemId);
      if (!Number.isInteger(input.countedQty) || input.countedQty < 0) {
        throw Errors.Validation("Sanoq manfiy bo'lmagan butun son bo'lishi kerak");
      }

      const entry = await getPrisma().$transaction(async (tx) => {
        const fresh = await tx.menuItem.findUniqueOrThrow({
          where: { id: item.id },
          select: { stockCount: true },
        });
        const before = fresh.stockCount;
        await menuRepo.setStock(item.id, input.countedQty, tx);

        const created = await stockEntryRepo.create({
          menuItem: { connect: { id: item.id } },
          kind: StockEntryKind.COUNT,
          qty: input.countedQty,
          countBefore: before,
          countAfter: input.countedQty,
          note: input.note?.trim() || null,
          actor: { connect: { id: input.actorUserId } },
          occurredAt: input.occurredAt,
        }, tx);

        await auditService.log({
          userId: input.actorUserId,
          action: 'STOCK_COUNT_SET',
          entityType: 'MenuItem',
          entityId: item.id,
          metadata: {
            itemName: item.name,
            countBefore: before,
            countAfter: input.countedQty,
            note: input.note?.trim() || null,
          },
        }, tx);

        deferEmit('admin', 'stock:changed', { menuItemId: item.id });
        if ((before ?? 0) <= 0 && input.countedQty > 0) {
          deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: true });
        }
        if ((before ?? 0) > 0 && input.countedQty <= 0) {
          deferEmit('all', 'menu:itemAvailability', { menuItemId: item.id, isAvailable: false });
        }
        return created;
      });

      await flushDeferredEmits();
      return mapEntry(entry);
    });
  },

  /** Ombor page data: every counted FOOD item + its latest entry timestamp. */
  async listCounted() {
    const prisma = getPrisma();
    const items = await prisma.menuItem.findMany({
      where: { kind: MenuItemKind.FOOD, counted: true, isActive: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ category: { displayOrder: 'asc' } }, { displayOrder: 'asc' }, { name: 'asc' }],
    });
    const ids = items.map((i) => i.id);
    const latest = await prisma.stockEntry.findMany({
      where: { menuItemId: { in: ids } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { menuItemId: true, occurredAt: true },
    });
    const lastByItem = new Map<string, Date>();
    for (const row of latest) {
      if (!lastByItem.has(row.menuItemId)) lastByItem.set(row.menuItemId, row.occurredAt);
    }
    return items.map((i) => ({
      id: i.id,
      name: i.name,
      categoryId: i.categoryId,
      categoryName: i.category.name,
      price: Number(i.price),
      stockCount: i.stockCount,
      costPrice: i.costPrice ? i.costPrice.toFixed(0) : null,
      isAvailable: i.isAvailable,
      isActive: i.isActive,
      lastEntryAt: lastByItem.get(i.id)?.toISOString() ?? null,
    }));
  },

  async listEntries(menuItemId: string) {
    const rows = await stockEntryRepo.listForItem(menuItemId);
    return rows.map(mapEntry);
  },
```

- [ ] **Step 2: Create `controllers/stock.controller.ts`**

```ts
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { stockService } from '../services/stock.service';

const restockSchema = z.object({
  qty: z.number().int().positive(),
  paidUzs: z.number().int().positive().optional().nullable(),
  setCostFromPaid: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

const countSchema = z.object({
  countedQty: z.number().int().nonnegative(),
  note: z.string().max(500).optional(),
});

export const stockController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await stockService.listCounted());
    } catch (error) {
      next(error);
    }
  },

  async entries(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await stockService.listEntries(req.params.menuItemId));
    } catch (error) {
      next(error);
    }
  },

  async restock(req: Request, res: Response, next: NextFunction) {
    try {
      const body = restockSchema.parse(req.body);
      const entry = await stockService.restock({
        menuItemId: req.params.menuItemId,
        qty: body.qty,
        paidUzs: body.paidUzs ?? null,
        setCostFromPaid: body.setCostFromPaid ?? false,
        note: body.note,
        occurredAt: new Date(),
        actorUserId: req.user!.id,
      });
      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  },

  async count(req: Request, res: Response, next: NextFunction) {
    try {
      const body = countSchema.parse(req.body);
      const entry = await stockService.setCount({
        menuItemId: req.params.menuItemId,
        countedQty: body.countedQty,
        note: body.note,
        occurredAt: new Date(),
        actorUserId: req.user!.id,
      });
      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  },
};
```

- [ ] **Step 3: Create `routes/stock.routes.ts`**

```ts
import { Router } from 'express';
import { stockController } from '../controllers/stock.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const stockRouter = Router();

stockRouter.use(requireAuth);
stockRouter.use(requireRole(['ADMIN', 'OWNER']));

stockRouter.get('/', stockController.list);
stockRouter.get('/:menuItemId/entries', stockController.entries);
stockRouter.post('/:menuItemId/restock', stockController.restock);
stockRouter.post('/:menuItemId/count', stockController.count);
```

- [ ] **Step 4: Mount in `app.ts`**

Add import `import { stockRouter } from './routes/stock.routes';` and, after the `/api/expenses` line, `app.use('/api/stock', stockRouter);`.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`. Expected: PASS.

- [ ] **Step 6: Append smoke part 2 (restock + expense + cost refresh + audit)**

In `scripts/smoke-stock-count.ts`, before the final `console.log`, add:

```ts
  step('5', 'Restock with money: expense created, cost refreshed, entry journaled');
  await http('POST', `/api/stock/${item.id}/count`, { token: admin, body: { countedQty: 9 } });
  await http('POST', `/api/stock/${item.id}/restock`, {
    token: admin,
    body: { qty: 24, paidUzs: 240000, setCostFromPaid: true, note: 'smoke restock' },
  });
  const afterRestock = await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } });
  assertEq('stockCount 9 + 24', afterRestock.stockCount, 33);
  assertEq('costPrice refreshed to 240000/24', afterRestock.costPrice?.toFixed(0), '10000');
  const entry = await prisma.stockEntry.findFirstOrThrow({
    where: { menuItemId: item.id, kind: 'RESTOCK' },
    orderBy: { createdAt: 'desc' },
    include: { expense: true },
  });
  assertEq('entry unitCost', entry.unitCost?.toFixed(0), '10000');
  if (!entry.expense) return fail('restock expense missing');
  assertEq('expense category', entry.expense.categoryId, 'seed-cat-ingredients');
  assertEq('expense amount', entry.expense.amount.toFixed(0), '240000');
  const auditRows = await prisma.auditLog.count({
    where: { action: { in: ['STOCK_RESTOCKED', 'STOCK_COUNT_SET'] }, entityId: item.id },
  });
  if (auditRows < 4) return fail(`expected >= 4 stock audit rows, got ${auditRows}`);
  ok(`audit rows for stock verbs: ${auditRows}`);

  step('6', 'Uncounted item books cost without a count');
  const choy = (await http<{ id: string }>('POST', '/api/menu/items', {
    token: admin,
    body: { categoryId: cat.id, name: `Smoke choy ${suffix}`, price: 3000, mode: 'UNCOUNTED', costPrice: 500 },
  })).body;
  await http('POST', `/api/orders/${draft.id}/items`, {
    token: waiter,
    body: { menuItemId: choy.id, quantity: 2 },
  });
  const choyLine = await prisma.orderLine.findFirstOrThrow({ where: { orderId: draft.id, menuItemId: choy.id } });
  assertEq('uncounted line cogs (500 × 2)', choyLine.cogsSnapshot?.toFixed(0), '1000');
  await http('POST', `/api/stock/${choy.id}/restock`, {
    token: admin,
    body: { qty: 5 },
    expectStatus: 400,
  });
  ok('restock on uncounted item → 400');
```

Note: `mode: 'COUNTED' | 'UNCOUNTED'` lands in Task 4 — the item-create calls in this script stay red until then; that is the failing-test state.

- [ ] **Step 7: Run the smoke — expect controlled failure**

Prereq: `pnpm dev:master` running against a freshly seeded DB.
Run: `pnpm exec tsx scripts/smoke-stock-count.ts`
Expected now: FAILS at step 1 with 400 from `/api/menu/items` (mode `COUNTED` not yet accepted). The `/api/stock/*` endpoints themselves work — verify directly: `curl -s -X POST http://localhost:4000/api/stock/<seed-item-id>/count -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' -d '{"countedQty":5}'` returns 201.

- [ ] **Step 8: Commit**

```bash
git add src/main/server scripts/smoke-stock-count.ts
git commit -m "feat(inventory): stock admin verbs — restock and count endpoints with journal"
```

---

### Task 4: menu.service rewrite — three modes, count-based availability

**Files:**
- Modify: `apps/master/src/main/server/services/menu.service.ts` (full rewrite, shrinks ~480 → ~200 lines)
- Modify: `apps/master/src/main/server/controllers/menu.controller.ts` (schemas + drop recipe/yield handlers)
- Modify: `apps/master/src/main/server/routes/menu.routes.ts` (drop `/yield` + recipe endpoints)
- Test: run `scripts/smoke-stock-count.ts` fully green

**Interfaces:**
- Consumes: Task 2/3 `stockService.setCount` semantics (initial count writes `StockEntry(COUNT)` via `menuRepo.setStock` + `stockEntryRepo.create` inline), `auditService`, `menuRepo`.
- Produces: `menuService.createItem(data: CreateItemInput, actorUserId: string)` with `CreateItemInput = { categoryId: string; name: string; price: Prisma.Decimal | string | number; description?: string; displayOrder?: number; mode: 'SERVICE' | 'COUNTED' | 'UNCOUNTED'; costPrice?: string | number | null; initialCount?: number | null }`; `menuService.updateItem(id, data, actorUserId)` accepting `costPrice?: number | string | null` and `counted?: boolean`; `listMenuForClients()` computing `effectivelyAvailable` from counts. Wire modes `SERVICE | COUNTED | UNCOUNTED` (Task 8 renderer uses these).

- [ ] **Step 1: Rewrite `menu.service.ts`**

Replace the entire file with:

```ts
import { MenuItemKind, Prisma, StockEntryKind } from '@prisma/client';
import { Errors } from '../lib/errors';
import { deferEmit, flushDeferredEmits, withEmitContext } from '../lib/socket-events';
import { getPrisma } from '../lib/prisma';
import { menuRepo } from '../repositories/menu.repo';
import { stockEntryRepo } from '../repositories/stockEntry.repo';
import { auditService } from './audit.service';

export type CreateItemMode = 'SERVICE' | 'COUNTED' | 'UNCOUNTED';

export type CreateItemInput = {
  categoryId: string;
  name: string;
  price: Prisma.Decimal | string | number;
  description?: string;
  displayOrder?: number;
  mode: CreateItemMode;
  // COUNTED / UNCOUNTED only. Cost is optional everywhere — NULL books 0 COGS
  // and the admin UI shows "tan narxi kiritilmagan".
  costPrice?: string | number | null;
  // COUNTED only. Absent → stockCount NULL → blocked until the first Sanoq.
  initialCount?: number | null;
};

type UpdateItemInput = {
  categoryId?: string;
  name?: string;
  price?: number | string;
  description?: string;
  displayOrder?: number;
  kind?: MenuItemKind;
  isActive?: boolean;
  costPrice?: number | string | null;
  counted?: boolean;
};

export const menuService = {
  async listCategories(includeInactive = false) {
    return menuRepo.listCategories(includeInactive);
  },

  async listItems(includeInactive = false) {
    return menuRepo.listItems(includeInactive);
  },

  async listCombos(includeInactive = false) {
    return menuRepo.listCombos(includeInactive);
  },

  /**
   * Client-facing menu. Availability is count-based now:
   * SERVICE and uncounted FOOD are always available; counted FOOD needs a
   * positive stockCount (NULL = not yet counted = unavailable).
   */
  async listMenuForClients() {
    const [categories, items] = await Promise.all([
      menuRepo.listCategories(),
      menuRepo.listItems(),
    ]);

    return categories.map((category) => ({
      ...category,
      items: items
        .filter((item) => item.categoryId === category.id)
        .map((item) => ({
          ...item,
          effectivelyAvailable:
            item.isAvailable &&
            (item.kind === MenuItemKind.SERVICE || !item.counted || (item.stockCount ?? 0) > 0),
        })),
    }));
  },

  async createCategory(data: { name: string; displayOrder?: number }, _actorUserId: string) {
    return withEmitContext(async () => {
      const cat = await menuRepo.createCategory({
        name: data.name,
        displayOrder: data.displayOrder ?? 0,
      });
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return cat;
    });
  },

  async updateCategory(id: string, data: Prisma.CategoryUpdateInput, _actorUserId: string) {
    return withEmitContext(async () => {
      const cat = await menuRepo.updateCategory(id, data);
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return cat;
    });
  },

  /**
   * Create a menu item. Three modes:
   * - SERVICE:   xizmat haqi line (kind=SERVICE), never counted, no cost.
   * - COUNTED:   FOOD with a stock number. Optional tan narx and initial
   *              count; an initial count is journaled as StockEntry(COUNT)
   *              with countBefore NULL so history starts at creation.
   * - UNCOUNTED: FOOD that never runs out (choy). Optional tan narx.
   */
  async createItem(data: CreateItemInput, actorUserId: string) {
    return withEmitContext(async () => {
      const name = data.name.trim();
      if (!name) throw Errors.Validation("Mahsulot nomi bo'sh bo'lmasin");

      const kind = data.mode === 'SERVICE' ? MenuItemKind.SERVICE : MenuItemKind.FOOD;
      const counted = data.mode === 'COUNTED';
      const price = new Prisma.Decimal(data.price);
      const costPrice = data.mode !== 'SERVICE' && data.costPrice !== undefined && data.costPrice !== null
        ? new Prisma.Decimal(data.costPrice)
        : null;
      if (costPrice && costPrice.lte(0)) {
        throw Errors.Validation("Tan narx 0 dan katta bo'lishi kerak");
      }
      const initialCount = counted && data.initialCount !== undefined && data.initialCount !== null
        ? data.initialCount
        : null;
      if (initialCount !== null && (!Number.isInteger(initialCount) || initialCount < 0)) {
        throw Errors.Validation("Boshlang'ich sanoq manfiy bo'lmagan butun son bo'lishi kerak");
      }

      const item = await getPrisma().$transaction(async (tx) => {
        const created = await menuRepo.createItem({
          category: { connect: { id: data.categoryId } },
          name,
          price,
          description: data.description?.trim() || null,
          displayOrder: data.displayOrder ?? 0,
          kind,
          counted,
          costPrice,
          stockCount: initialCount,
        }, tx);

        if (initialCount !== null) {
          await stockEntryRepo.create({
            menuItem: { connect: { id: created.id } },
            kind: StockEntryKind.COUNT,
            qty: initialCount,
            countBefore: null,
            countAfter: initialCount,
            actor: { connect: { id: actorUserId } },
            occurredAt: new Date(),
          }, tx);

          await auditService.log({
            userId: actorUserId,
            action: 'STOCK_COUNT_SET',
            entityType: 'MenuItem',
            entityId: created.id,
            metadata: { itemName: name, countBefore: null, countAfter: initialCount, origin: 'menu-create' },
          }, tx);
        }

        return created;
      });

      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return item;
    });
  },

  async updateItem(id: string, data: UpdateItemInput, actorUserId: string) {
    return withEmitContext(async () => {
      const existing = await menuRepo.findItemById(id);
      if (!existing) throw Errors.NotFound('Menu item');

      const patch: Prisma.MenuItemUpdateInput = {};
      if (data.categoryId !== undefined) patch.category = { connect: { id: data.categoryId } };
      if (data.name !== undefined) patch.name = data.name.trim();
      if (data.price !== undefined) patch.price = new Prisma.Decimal(data.price);
      if (data.description !== undefined) patch.description = data.description.trim() || null;
      if (data.displayOrder !== undefined) patch.displayOrder = data.displayOrder;
      if (data.kind !== undefined) patch.kind = data.kind;
      if (data.isActive !== undefined) patch.isActive = data.isActive;

      const costChanged = data.costPrice !== undefined;
      if (costChanged) {
        const next = data.costPrice === null ? null : new Prisma.Decimal(data.costPrice as number | string);
        if (next && next.lte(0)) throw Errors.Validation("Tan narx 0 dan katta bo'lishi kerak");
        patch.costPrice = next;
      }

      const countedChanged = data.counted !== undefined && data.counted !== existing.counted;
      if (countedChanged) {
        patch.counted = data.counted;
        // ON: must be counted before it sells again. OFF: count is meaningless.
        patch.stockCount = null;
      }

      const item = await getPrisma().$transaction(async (tx) => {
        const updated = await menuRepo.updateItem(id, patch, tx);

        if (costChanged) {
          await auditService.log({
            userId: actorUserId,
            action: 'ITEM_COST_CHANGED',
            entityType: 'MenuItem',
            entityId: id,
            metadata: {
              itemName: existing.name,
              before: existing.costPrice ? existing.costPrice.toFixed(0) : null,
              after: updated.costPrice ? updated.costPrice.toFixed(0) : null,
            },
          }, tx);
        }
        if (countedChanged) {
          await auditService.log({
            userId: actorUserId,
            action: 'STOCK_COUNT_SET',
            entityType: 'MenuItem',
            entityId: id,
            metadata: {
              itemName: existing.name,
              countBefore: existing.stockCount,
              countAfter: null,
              origin: data.counted ? 'counted-enabled' : 'counted-disabled',
            },
          }, tx);
        }

        return updated;
      });

      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return item;
    });
  },

  async setItemAvailability(id: string, isAvailable: boolean, _actorUserId: string) {
    return withEmitContext(async () => {
      const item = await menuRepo.setAvailability(id, isAvailable);
      deferEmit('all', 'menu:itemAvailability', { menuItemId: id, isAvailable });
      await flushDeferredEmits();
      return item;
    });
  },

  async createCombo(
    data: { name: string; components: Array<{ menuItemId: string; quantity: number }> },
    _actorUserId: string,
  ) {
    return withEmitContext(async () => {
      const combo = await menuRepo.createCombo({
        name: data.name,
        components: {
          create: data.components.map((component) => ({
            quantity: component.quantity,
            menuItem: { connect: { id: component.menuItemId } },
          })),
        },
      });
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return combo;
    });
  },

  async updateCombo(
    id: string,
    data: { name?: string; isActive?: boolean; components?: Array<{ menuItemId: string; quantity: number }> },
    _actorUserId: string,
  ) {
    return withEmitContext(async () => {
      if (data.components) {
        await menuRepo.replaceComponents(id, data.components);
      }
      const combo = await menuRepo.updateCombo(id, {
        name: data.name,
        isActive: data.isActive,
      });
      deferEmit('all', 'menu:changed', {});
      await flushDeferredEmits();
      return combo;
    });
  },
};
```

- [ ] **Step 2: Update `menu.controller.ts`**

Remove the imports of `recipeService`, `recipeRepo`, `yieldService`, and `Errors` (Errors was only used by recipe handlers). Remove `recipeUpsertSchema`, `recipeCompleteSchema`, `simpleModeSchema`, `compositeIngredientSchema`, `compositeModeSchema`, and the `getItemRecipe`, `updateItemRecipe`, `getYield`, `setRecipeComplete`, `deleteItemRecipe` handlers. Replace `itemCreateSchema` and `itemUpdateSchema` with:

```ts
const itemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  price: z.union([z.number().int(), z.string().min(1)]),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  mode: z.enum(['SERVICE', 'COUNTED', 'UNCOUNTED']).default('SERVICE'),
  costPrice: z.union([z.number().int().positive(), z.string().min(1)]).optional().nullable(),
  initialCount: z.number().int().nonnegative().optional().nullable(),
});

const itemUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  price: z.union([z.number().int(), z.string().min(1)]).optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  kind: z.enum(['FOOD', 'SERVICE']).optional(),
  isActive: z.boolean().optional(),
  costPrice: z.union([z.number().int().positive(), z.string().min(1)]).optional().nullable(),
  counted: z.boolean().optional(),
});
```

`createItem`/`updateItem` handlers stay as they are (they just pass the parsed body through).

- [ ] **Step 3: Trim `menu.routes.ts`**

Delete lines 11 (`/yield`) and 23-26 (the four recipe endpoints). Nothing else changes.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`. Expected: PASS. (`yield.service.ts` and `recipe.service.ts` still exist but are now unreferenced by menu code — they die in Task 6.)

- [ ] **Step 5: Run the full smoke green**

Prereq: restart `pnpm dev:master` (fresh code), seeded DB.
Run: `pnpm exec tsx scripts/smoke-stock-count.ts`
Expected: ALL steps 1-6 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/server
git commit -m "feat(menu): three-mode item create and count-based availability"
```

---

### Task 5: finance re-points — ledger, admin drill-down, Telegram

**Files:**
- Modify: `apps/master/src/main/server/services/reports.service.ts:1179-1188` (purchase aggregates → stockEntry)
- Modify: `apps/master/src/main/server/services/finance.service.ts:55-66,173-181,277-285` (purchases list → money-restocks)
- Modify: `apps/master/src/main/server/services/telegram-bot.service.ts` (`sendLowStock` + `formatStockMessage`)
- Test: `scripts/smoke-stock-count.ts` (part 3: P&L identity), plus existing `scripts/smoke-finance-pnl.ts` re-run

**Interfaces:**
- Consumes: `stockEntryRepo.listMoneyForRange`, `stockEntryRepo.aggregateMoneyForRange`, `stockService.listCounted` (Task 3).
- Produces: `ledger.outflow.ingredientPurchases` / `ingredientPurchasesCount` sourced from StockEntry; `dailyForAdmin` keeps its legacy `purchases` / `ingredientPurchases` DTO field names so FinancePage renders unchanged.

- [ ] **Step 1: `reports.service.ts` — swap the two purchase aggregates in `dailyLedger`**

Add import at top: `import { stockEntryRepo } from '../repositories/stockEntry.repo';`

In the `Promise.all` of `dailyLedger` (lines 1179-1188), replace the `prisma.purchase.aggregate({...})` and `prisma.purchase.count({...})` entries with a single combined entry:

```ts
      stockEntryRepo.aggregateMoneyForRange(dayStart, dayEnd),
```

Rename the destructured variables `purchasesTotalAgg, purchasesCountAgg` to `moneyRestocks`, and where the DTO is built replace:

```ts
    const ingredientPurchases = purchasesTotalAgg._sum.totalCostUzs ?? new Prisma.Decimal(0);
```

with

```ts
    const ingredientPurchases = moneyRestocks.total;
```

and in `outflow`: `ingredientPurchasesCount: moneyRestocks.count,`.

- [ ] **Step 2: `finance.service.ts` — swap the drill-down list**

In `dailyForAdmin`'s `Promise.all`, replace the `prisma.purchase.findMany({...})` block (lines 55-66) with:

```ts
      stockEntryRepo.listMoneyForRange(dayStart, dayEnd),
```

(add the import `import { stockEntryRepo } from '../repositories/stockEntry.repo';`). Keep the destructured name `purchases`. Then replace BOTH mapping sites (the `purchases:` list at lines 173-181 and the `ingredientPurchases:` list at lines 277-285) with this mapper (same shape both times — legacy field names preserved for FinancePage):

```ts
      purchases: purchases.map((p) => ({
        id: p.id,
        occurredAt: p.occurredAt.toISOString(),
        ingredientName: p.menuItem.name,
        quantityBuyUnit: String(p.qty),
        buyUnit: 'dona',
        totalCostUzs: decStr(p.paidUzs),
        supplierNote: p.note,
      })),
```

- [ ] **Step 3: Telegram — `sendLowStock` reads counted items**

In `telegram-bot.service.ts`, replace the import of `ingredientService` with `import { stockService } from './stock.service';`. Replace the `sendLowStock` body's data line:

```ts
          const ingredients = await ingredientService.list({ isActive: true });
          const message = this.formatStockMessage(ingredients);
```

with

```ts
          const items = await stockService.listCounted();
          const message = this.formatStockMessage(items);
```

Replace the whole `formatStockMessage` method with:

```ts
  private formatStockMessage(
    items: Array<{ name: string; categoryName: string; stockCount: number | null; costPrice: string | null }>,
  ): string {
    if (items.length === 0) {
      return '📦 <b>Omborxona</b>\n\nSanaladigan taom yo\'q.';
    }
    const sorted = [...items].sort((a, b) => (a.stockCount ?? -1) - (b.stockCount ?? -1));
    const lines = sorted.map((i) => {
      const count = i.stockCount === null ? '— (sanoq kiritilmagan)' : `${i.stockCount} porsiya`;
      const flag = i.stockCount !== null && i.stockCount <= 0 ? '⚠️ ' : '';
      const cost = i.costPrice ? ` · tan narx ${Number(i.costPrice).toLocaleString('ru-RU')} so'm` : '';
      return `${flag}<b>${i.name}</b> (${i.categoryName}) — ${count}${cost}`;
    });
    return `📦 <b>Omborxona qoldig'i</b>\n\n${lines.join('\n')}`;
  }
```

(Keep the surrounding method syntax consistent with the class — if the existing `formatStockMessage` is a class method, replace it in place with the same visibility.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Append smoke part 3 — P&L identity**

In `scripts/smoke-stock-count.ts`, before the final `console.log`, add:

```ts
  step('7', 'Confirm the order; daily ledger books COGS from costPrice and Xaridlar from restock money');
  await http('POST', `/api/orders/${draft.id}/send`, { token: waiter });
  const totals = (await http<{ order: { id: string } }>('GET', `/api/orders/${draft.id}`, { token: waiter })).body;
  void totals;
  const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: draft.id }, include: { lines: { where: { isCanceled: false } } } });
  const due = orderRow.lines.reduce((sum, l) => sum + Number(l.unitPriceSnapshot) * l.quantity, 0);
  await http('POST', `/api/orders/${draft.id}/confirm`, {
    token: admin,
    body: { payments: [{ method: 'CASH', amount: due }] },
  });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  const daily = (await http<{
    pnl: { cogs: string };
    outflow: { purchasesTotal: string; purchasesCount: number };
    ledger: { outflow: { ingredientPurchases: string; ingredientPurchasesCount: number } };
  }>('GET', `/api/finance/daily?date=${today}`, { token: admin })).body;
  const expectedLineCogs = 20000 * 1 + 500 * 2; // plov line (qty 1 after decrease) + choy line
  if (Number(daily.pnl.cogs) < expectedLineCogs) {
    return fail(`daily cogs ${daily.pnl.cogs} < expected contribution ${expectedLineCogs}`);
  }
  ok(`daily pnl.cogs (${daily.pnl.cogs}) includes this order's ${expectedLineCogs}`);
  if (Number(daily.ledger.outflow.ingredientPurchases) < 240000) {
    return fail(`ingredientPurchases ${daily.ledger.outflow.ingredientPurchases} missing the 240000 restock`);
  }
  ok(`ledger ingredientPurchases (${daily.ledger.outflow.ingredientPurchases}) includes 240000`);
```

- [ ] **Step 6: Run both smokes**

Prereq: restart `pnpm dev:master`, seeded DB.
Run: `pnpm exec tsx scripts/smoke-stock-count.ts` — Expected: PASS end-to-end (steps 1-7).
Run: `pnpm exec tsx scripts/smoke-finance-pnl.ts` — Expected: read the script first; if it seeds via ingredient/purchase endpoints it will fail for that reason only — in that case update its fixture setup to create a `COUNTED` item (`mode: 'COUNTED'`, `costPrice`, then `POST /api/stock/:id/count`) and a money-restock instead of purchase calls, keeping its assertions intact. If its P&L assertions then pass, done; report any assertion that had to change (there should be none — formulas are untouched).

- [ ] **Step 7: Commit**

```bash
git add src/main/server scripts
git commit -m "refactor(finance): source Xaridlar block and stock report from StockEntry"
```

---

### Task 6: delete the ingredient layer (server) + script cleanup

**Files:**
- Delete: `src/main/server/services/{purchase,ingredient,recipe,stocktake,waste,yield}.service.ts`
- Delete: `src/main/server/repositories/{purchase,ingredient,recipe,stocktake,wasteEvent,ingredientMovement,orderLineBatchConsumption}.repo.ts`
- Delete: `src/main/server/routes/{ingredient,purchase}.routes.ts`, `src/main/server/controllers/{ingredient,purchase}.controller.ts`
- Modify: `src/main/server/app.ts` (unmount)
- Delete: `scripts/{smoke-fifo.ts,seed-ingredients-recipes.ts,smoke-test-repos.ts,backfill-fifo-remaining-qty.ts}`
- Audit-and-fix: remaining `scripts/simulate-*.ts` and `scripts/smoke-*.ts`

**Interfaces:**
- Consumes: nothing new. Produces: a tree where `grep -rn "ingredient\.\(service\|repo\)\|purchase\.\(service\|repo\)\|recipe\.\(service\|repo\)\|yield\.service\|stocktake\|wasteEvent\|ingredientMovement\|orderLineBatchConsumption" apps/master/src` returns zero matches.

- [ ] **Step 1: Unmount routes in `app.ts`**

Remove the two imports (`ingredientRouter`, `purchaseRouter`) and the two `app.use('/api/ingredients', ...)` / `app.use('/api/purchases', ...)` lines.

- [ ] **Step 2: Delete server files**

```bash
git rm src/main/server/services/purchase.service.ts \
       src/main/server/services/ingredient.service.ts \
       src/main/server/services/recipe.service.ts \
       src/main/server/services/stocktake.service.ts \
       src/main/server/services/waste.service.ts \
       src/main/server/services/yield.service.ts \
       src/main/server/repositories/purchase.repo.ts \
       src/main/server/repositories/ingredient.repo.ts \
       src/main/server/repositories/recipe.repo.ts \
       src/main/server/repositories/stocktake.repo.ts \
       src/main/server/repositories/wasteEvent.repo.ts \
       src/main/server/repositories/ingredientMovement.repo.ts \
       src/main/server/repositories/orderLineBatchConsumption.repo.ts \
       src/main/server/routes/ingredient.routes.ts \
       src/main/server/routes/purchase.routes.ts \
       src/main/server/controllers/ingredient.controller.ts \
       src/main/server/controllers/purchase.controller.ts
```

- [ ] **Step 3: Delete dead scripts**

```bash
git rm scripts/smoke-fifo.ts scripts/seed-ingredients-recipes.ts scripts/smoke-test-repos.ts scripts/backfill-fifo-remaining-qty.ts scripts/api-smoke.sh
```

- [ ] **Step 4: Sweep the remaining scripts**

Run: `grep -rln 'api/ingredients\|api/purchases\|consumption\|purchaseRepo\|ingredientRepo\|recipeRepo\|yieldService\|/yield\|recipe' scripts/ | sort`
For each hit, open it: if it merely *mentions* the old world in comments, leave it; if it calls removed endpoints/services (`simulate-*.ts` are already flagged stale in `CLAUDE.md`), `git rm` it. Expected survivors: the `smoke-prd13-*.ts` family, `smoke-cashflow-reversal.ts`, `smoke-summary-report.ts`, `smoke-telegram-files.ts`, `smoke-e2e-flow.ts` (rewritten in Task 9), `smoke-menu-create.ts` (rewrite or delete: it exercises SIMPLE/COMPOSITE creates — `git rm` it; Task 9's e2e covers creation), `seed-waiter-stats.ts`, `smoke-stock-count.ts`, `smoke-finance-pnl.ts`.

- [ ] **Step 5: Typecheck — the real deletion gate**

Run: `pnpm typecheck`
Expected: PASS. If anything still imports a deleted module, the error names it; fix by deleting the importer's dead code path, never by resurrecting the module.

- [ ] **Step 6: Grep-verify zero references**

Run: `grep -rn "from '.*\(purchase\|ingredient\|recipe\|stocktake\|waste\|yield\|ingredientMovement\|orderLineBatchConsumption\)\.\(service\|repo\)'" apps/master/src`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(inventory): remove ingredient/recipe/FIFO layer — code only, tables kept"
```

---

### Task 7: renderer — Ombor page replaces Ingredients/Purchases/Recipes

**Files:**
- Create: `apps/master/src/renderer/api/stock.ts`
- Create: `apps/master/src/renderer/pages/OmborPage.tsx`
- Modify: `apps/master/src/renderer/App.tsx` (routes), `apps/master/src/renderer/components/layout/Sidebar.tsx:61-68` (nav), `apps/master/src/renderer/hooks/useSocket.ts:72-79` (events)
- Delete: `src/renderer/pages/{IngredientsPage,PurchasesPage,RecipesPage}.tsx`, `src/renderer/api/{ingredients,purchases,recipes,yield}.ts`
- Test: `pnpm typecheck` + manual `pnpm dev:master` walkthrough

**Interfaces:**
- Consumes: Task 3 REST endpoints and DTO shapes.
- Produces: route `/ombor`; query keys `['stock']` and `['stock', id, 'entries']` (invalidated by the `stock:changed` socket event).

- [ ] **Step 1: Create `api/stock.ts`**

```ts
import { api } from './client';

export type StockItem = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  stockCount: number | null;
  costPrice: string | null;
  isAvailable: boolean;
  isActive: boolean;
  lastEntryAt: string | null;
};

export type StockEntry = {
  id: string;
  menuItemId: string;
  kind: 'RESTOCK' | 'COUNT';
  qty: number;
  countBefore: number | null;
  countAfter: number;
  paidUzs: string | null;
  unitCost: string | null;
  note: string | null;
  occurredAt: string;
  actorName: string;
  expenseId: string | null;
};

export const stockApi = {
  list: () => api.get<StockItem[]>('/api/stock'),
  entries: (menuItemId: string) => api.get<StockEntry[]>(`/api/stock/${menuItemId}/entries`),
  restock: (menuItemId: string, body: { qty: number; paidUzs?: number | null; setCostFromPaid?: boolean; note?: string }) =>
    api.post<StockEntry>(`/api/stock/${menuItemId}/restock`, body),
  count: (menuItemId: string, body: { countedQty: number; note?: string }) =>
    api.post<StockEntry>(`/api/stock/${menuItemId}/count`, body),
};
```

- [ ] **Step 2: Create `pages/OmborPage.tsx`**

Follow the IngredientsPage structure exactly (PageContent/PageHeader/search box/DataTable/Sheet/ConfirmDialog conventions):

```tsx
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Loader2, Search, X, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { stockApi, type StockItem, type StockEntry } from '@/api/stock';
import { PageHeader } from '@/components/feedback/PageHeader';
import { PageContent } from '@/components/feedback/PageContent';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Verb = 'restock' | 'count';

export function OmborPage() {
  usePageTitle('Ombor');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<{ item: StockItem; verb: Verb } | null>(null);
  const [qty, setQty] = useState('');
  const [paid, setPaid] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['stock'], queryFn: stockApi.list });

  const { data: entries } = useQuery({
    queryKey: ['stock', active?.item.id, 'entries'],
    queryFn: () => stockApi.entries(active!.item.id),
    enabled: !!active,
  });

  const filtered = useMemo(() => {
    if (!data) return data;
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => row.name.toLowerCase().includes(q) || row.categoryName.toLowerCase().includes(q));
  }, [data, search]);

  const open = (item: StockItem, verb: Verb) => {
    setActive({ item, verb });
    setQty('');
    setPaid('');
    setUpdateCost(true);
    setNote('');
  };

  const done = (msg: string) => {
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    queryClient.invalidateQueries({ queryKey: ['menu'] });
    toast.success(msg);
    setActive(null);
  };

  const restockMutation = useMutation({
    mutationFn: () => {
      const paidNum = paid.trim() ? Number(paid) : null;
      return stockApi.restock(active!.item.id, {
        qty: Number(qty),
        paidUzs: paidNum,
        setCostFromPaid: paidNum !== null && updateCost,
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => done('Kirim saqlandi'),
    onError: (err: Error) => toast.error(err.message),
  });

  const countMutation = useMutation({
    mutationFn: () => stockApi.count(active!.item.id, {
      countedQty: Number(qty),
      note: note.trim() || undefined,
    }),
    onSuccess: () => done('Sanoq saqlandi'),
    onError: (err: Error) => toast.error(err.message),
  });

  const submitting = restockMutation.isPending || countMutation.isPending;
  const qtyNum = Number(qty);
  const qtyValid = qty.trim() !== '' && Number.isInteger(qtyNum) && (active?.verb === 'count' ? qtyNum >= 0 : qtyNum > 0);
  const derivedUnitCost = active?.verb === 'restock' && paid.trim() && qtyValid && qtyNum > 0
    ? Math.round(Number(paid) / qtyNum)
    : null;

  const columns: DataTableColumn<StockItem>[] = [
    {
      key: 'name',
      header: 'Taom',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <span className="text-muted-foreground text-xs">{row.categoryName}</span>
        </div>
      ),
    },
    {
      key: 'count',
      header: 'Qoldiq',
      align: 'right',
      cell: (row) =>
        row.stockCount === null ? (
          <Badge variant="outline">Sanoq kiritilmagan</Badge>
        ) : row.stockCount <= 0 ? (
          <Badge variant="default" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">0</Badge>
        ) : (
          <span className="font-medium tabular-nums">{row.stockCount}</span>
        ),
    },
    {
      key: 'cost',
      header: 'Tan narx',
      align: 'right',
      cell: (row) =>
        row.costPrice ? <MoneyCell value={row.costPrice} /> : (
          <span className="text-muted-foreground">kiritilmagan</span>
        ),
    },
    {
      key: 'last',
      header: 'Oxirgi kirim/sanoq',
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.lastEntryAt ? new Date(row.lastEntryAt).toLocaleString('uz-UZ') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); open(row, 'restock'); }}>
            <Plus className="h-4 w-4" />
            Keldi
          </Button>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); open(row, 'count'); }}>
            <ClipboardList className="h-4 w-4" />
            Sanoq
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Ombor"
        description="Sanaladigan taomlar qoldig'i — kirim (+ Keldi) va sanoq shu yerda"
      />

      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Taom yoki bo'lim bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-muted-foreground hover:text-foreground"
            title="Tozalash"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        emptyState={
          <EmptyState
            icon={Package}
            title="Sanaladigan taom yo'q"
            hint="Menyu sahifasida taom yaratishda 'Sanaladigan' turini tanlang."
          />
        }
      />

      <Sheet open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <SheetContent className="sm:max-w-md">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {active.verb === 'restock' ? `Keldi: ${active.item.name}` : `Sanoq: ${active.item.name}`}
                </SheetTitle>
                <SheetDescription>
                  {active.verb === 'restock'
                    ? "Nechta keldi va (ixtiyoriy) qancha to'landi."
                    : 'Hozir omborda nechta borligini yozing — raqam shu qiymatga o\'rnatiladi.'}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="stock-qty">
                    {active.verb === 'restock' ? 'Nechta keldi' : 'Sanalgan miqdor'}
                  </Label>
                  <Input
                    id="stock-qty"
                    autoFocus
                    type="number"
                    step="1"
                    min={active.verb === 'count' ? 0 : 1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Hozirgi qoldiq: {active.item.stockCount === null ? 'kiritilmagan' : active.item.stockCount}
                  </p>
                </div>

                {active.verb === 'restock' && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="stock-paid">To'landi (so'm, ixtiyoriy)</Label>
                      <Input
                        id="stock-paid"
                        type="number"
                        step="1"
                        min={0}
                        value={paid}
                        onChange={(e) => setPaid(e.target.value)}
                      />
                      {derivedUnitCost !== null && (
                        <p className="text-xs text-muted-foreground">
                          Birlik narxi: {derivedUnitCost.toLocaleString('ru-RU')} so'm
                        </p>
                      )}
                    </div>
                    {paid.trim() !== '' && (
                      <div className="flex items-start gap-3 rounded-md border border-input bg-muted/30 p-3">
                        <Checkbox
                          id="stock-update-cost"
                          checked={updateCost}
                          onCheckedChange={(checked) => setUpdateCost(checked === true)}
                        />
                        <div className="space-y-0.5">
                          <Label htmlFor="stock-update-cost" className="cursor-pointer">Tan narxni yangilash</Label>
                          <p className="text-xs text-muted-foreground">
                            Taomning tan narxi {derivedUnitCost !== null ? `${derivedUnitCost.toLocaleString('ru-RU')} so'mga` : 'hisoblangan narxga'} o'zgartiriladi.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="stock-note">Izoh (ixtiyoriy)</Label>
                  <Input id="stock-note" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>

                {(restockMutation.isError || countMutation.isError) && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {(restockMutation.error ?? countMutation.error)?.message}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setActive(null)} disabled={submitting}>
                    Bekor qilish
                  </Button>
                  <Button
                    type="button"
                    disabled={!qtyValid || submitting}
                    onClick={() => (active.verb === 'restock' ? restockMutation.mutate() : countMutation.mutate())}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Saqlash
                  </Button>
                </div>

                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">Tarix</p>
                  {(entries ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">Hozircha yozuv yo'q.</p>
                  )}
                  {(entries ?? []).slice(0, 15).map((e: StockEntry) => (
                    <div key={e.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {new Date(e.occurredAt).toLocaleString('uz-UZ')} · {e.actorName}
                      </span>
                      <span className="tabular-nums">
                        {e.kind === 'RESTOCK'
                          ? `+${e.qty}${e.paidUzs ? ` (${Number(e.paidUzs).toLocaleString('ru-RU')} so'm)` : ''} → ${e.countAfter}`
                          : `sanoq: ${e.countBefore ?? '—'} → ${e.countAfter}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageContent>
  );
}
```

- [ ] **Step 3: Swap routes and nav**

`App.tsx`: remove the three imports and routes for `IngredientsPage` (`/ingredients`), `PurchasesPage` (`/purchases`), `RecipesPage` (`/recipes`); add `import { OmborPage } from './pages/OmborPage';` and `<Route path="/ombor" element={<OmborPage />} />`.

`Sidebar.tsx` — replace the 'Mahsulot va retsept' section items (lines 62-68) with:

```ts
    heading: 'Menyu va ombor',
    items: [
      { to: '/ombor', label: 'Ombor', icon: Package, roles: ['OWNER', 'ADMIN'] },
      { to: '/menu', label: 'Menyu', icon: UtensilsCrossed, roles: ['OWNER', 'ADMIN'] },
    ],
```

(Remove the now-unused `ShoppingCart`/`BookOpen` icon imports.)

- [ ] **Step 4: Socket events in `useSocket.ts`**

Replace the three old listeners (lines 73-79: `ingredient:stockChanged`, `ingredient:changed`, `recipe:changed`) with:

```ts
    nextSocket.on('stock:changed', () => {
      queryClientRef.current.invalidateQueries({ queryKey: ['stock'] });
      queryClientRef.current.invalidateQueries({ queryKey: ['menu'] });
    });
    nextSocket.on('menu:changed', () => queryClientRef.current.invalidateQueries({ queryKey: ['menu'] }));
```

(Keep the existing `menu:itemAvailability` listener at line 72.)

- [ ] **Step 5: Delete renderer dead files**

```bash
git rm src/renderer/pages/IngredientsPage.tsx src/renderer/pages/PurchasesPage.tsx src/renderer/pages/RecipesPage.tsx \
       src/renderer/api/ingredients.ts src/renderer/api/purchases.ts src/renderer/api/recipes.ts src/renderer/api/yield.ts
```

- [ ] **Step 6: Typecheck; chase renderer stragglers**

Run: `pnpm typecheck`
Expected: errors ONLY in `MenuPage.tsx` (it imports `api/yield` and uses SIMPLE/COMPOSITE payloads — Task 8's job). Any other file importing the deleted APIs: remove that usage now (check `DashboardPage.tsx` and `FinancePage.tsx` with `grep -rn "api/yield\|api/ingredients\|api/purchases\|api/recipes" src/renderer`). If MenuPage is the only blocker, proceed to Task 8 before committing, and make this commit and Task 8's commit together as one — otherwise commit here:

```bash
git add -A
git commit -m "feat(renderer): Ombor page replaces ingredients/purchases/recipes pages"
```

---

### Task 8: renderer — MenuPage three-mode create + cost/count edit

**Files:**
- Modify: `apps/master/src/renderer/api/menu.ts` (types)
- Modify: `apps/master/src/renderer/pages/MenuPage.tsx` (mode form :581-1010, edit form :493-519, yield usages :340-360)
- Test: `pnpm typecheck` + manual create/edit walkthrough

**Interfaces:**
- Consumes: Task 4 wire contract (`mode: 'SERVICE' | 'COUNTED' | 'UNCOUNTED'`, `costPrice`, `initialCount`, PATCH `counted`).
- Produces: `CreateItemPayload` type used by MenuPage only.

- [ ] **Step 1: Update `api/menu.ts`**

In `MenuItem`, after `isActive: boolean;`, add:

```ts
  counted: boolean;
  stockCount: number | null;
  costPrice: string | null;
```

Replace the whole `CreateItemUnit`/`CreateItemPayload` block with:

```ts
export type CreateItemPayload = {
  categoryId: string;
  name: string;
  price: number;
  description?: string;
  displayOrder?: number;
  mode: 'SERVICE' | 'COUNTED' | 'UNCOUNTED';
  costPrice?: number | null;
  initialCount?: number | null;
};
```

`updateItem`'s `Partial<MenuItem>` already carries `costPrice`/`counted` via the interface additions — extend its parameter type to `Partial<MenuItem> & { costPrice?: string | number | null; counted?: boolean }`.

- [ ] **Step 2: Rework the create form in `MenuPage.tsx`**

At line 582: `type Mode = 'COUNTED' | 'UNCOUNTED' | 'SERVICE';` and default `useState<Mode>('COUNTED')`.

Replace the four-entry mode options array (lines 742-745) with:

```ts
            { id: 'COUNTED', label: 'Sanaladigan', hint: "Qoldiq soni yuritiladi (plov, Pepsi, somsa)" },
            { id: 'UNCOUNTED', label: 'Sanoqsiz (doim mavjud)', hint: 'Qoldiq sanalmaydi, doim sotuvda (choy)' },
            { id: 'SERVICE', label: 'Xizmat haqi', hint: "Ovqat emas — hisobga xizmat qatori" },
```

Delete the `mode === 'SIMPLE'` block (lines 806-854) and the `mode === 'COMPOSITE'` block (lines 855-955) wholesale, along with their local state (ingredient row arrays, unit selects, `UNIT_PRESETS`-mirroring constants). Add in their place one block for both food modes:

```tsx
        {mode !== 'SERVICE' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="item-cost">Tan narx (so'm, ixtiyoriy)</Label>
              <Input
                id="item-cost"
                type="number"
                step="1"
                min={1}
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Kiritilmasa foyda hisobotida bu taom uchun xarajat 0 bo'ladi.
              </p>
            </div>
            {mode === 'COUNTED' && (
              <div className="space-y-1.5">
                <Label htmlFor="item-initial-count">Boshlang'ich sanoq (ixtiyoriy)</Label>
                <Input
                  id="item-initial-count"
                  type="number"
                  step="1"
                  min={0}
                  value={initialCount}
                  onChange={(e) => setInitialCount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Kiritilmasa taom sanoq kiritilguncha sotilmaydi.
                </p>
              </div>
            )}
          </div>
        )}
```

with two `useState('')` hooks `costPrice`/`initialCount` next to the existing form state. Replace the `onSave` dispatch (lines 668-720) with:

```ts
    const base = { categoryId, name: name.trim(), price: Number(price), description: description.trim() || undefined };
    if (mode === 'SERVICE') {
      onSave({ ...base, mode: 'SERVICE' });
      return;
    }
    onSave({
      ...base,
      mode,
      costPrice: costPrice.trim() ? Number(costPrice) : null,
      initialCount: mode === 'COUNTED' && initialCount.trim() ? Number(initialCount) : null,
    });
```

(Adapt `base` construction to whatever the existing local variable names are — the file defines them immediately above line 668.)

- [ ] **Step 3: Edit form — cost + counted toggle**

In the edit dialog (component starting ~line 493), extend the local form state with `costPrice` (string, initialised from `item.costPrice ?? ''`) and `counted` (boolean, initialised from `item.counted`), render:

```tsx
        {!isService && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="edit-cost">Tan narx (so'm)</Label>
              <Input id="edit-cost" type="number" step="1" min={1} value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <div className="flex items-start gap-3 rounded-md border border-input bg-muted/30 p-3">
              <Checkbox id="edit-counted" checked={counted} onCheckedChange={(v) => setCounted(v === true)} />
              <div className="space-y-0.5">
                <Label htmlFor="edit-counted" className="cursor-pointer">Sanaladigan</Label>
                <p className="text-xs text-muted-foreground">
                  Yoqilsa qoldiq NULL bo'ladi — Ombor sahifasida sanoq kiritilguncha sotilmaydi.
                </p>
              </div>
            </div>
          </>
        )}
```

and include in the save payload: `costPrice: costPrice.trim() ? Number(costPrice) : null, counted`.

- [ ] **Step 4: Replace yield usages**

Remove the `api/yield` import and its `useQuery`. The availability badge at ~line 348 becomes count-based:

```tsx
  {item.kind === 'SERVICE' || !item.counted ? (
    <Badge variant="outline">Doim mavjud</Badge>
  ) : item.stockCount === null ? (
    <Badge variant="outline">Sanoq kiritilmagan</Badge>
  ) : (
    <span className="tabular-nums">{item.stockCount} dona</span>
  )}
```

- [ ] **Step 5: Typecheck + manual walkthrough**

Run: `pnpm typecheck` — Expected: PASS across all workspaces.
Manual (with `pnpm dev:master`): create a Sanaladigan item with initial count 5 and cost 10 000 → appears in Ombor with count 5; sell it in the order app until 0 → greys out on the waiter menu without a reload (socket join fix); Keldi 10 with 100 000 paid → count 10, cost 10 000, Chiqimlar shows the `Keldi:` expense.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat(renderer): three-mode menu create, cost and counted editing"
```

---

### Task 9: seed + e2e smoke rewrite

**Files:**
- Modify: `apps/master/prisma/seed.ts` (counts + costs on items)
- Modify: `apps/master/scripts/smoke-e2e-flow.ts` (count-based scenario)

**Interfaces:**
- Consumes: everything above. Produces: a dev DB where counted seeded dishes are sellable out of the box.

- [ ] **Step 1: Seed counts and costs**

In `seed.ts`, wherever menu items are upserted, add the three fields. Choy items (`qoraChoy`, `kokChoy`) get `counted: false, costPrice: 500`; every other FOOD item gets `counted: true, stockCount: 50` and a plausible `costPrice` (e.g. osh `20000`, somsa `4000`, patirNon `2500`, salads `5000`, soups `12000`, kabobs `15000`); SERVICE items (if seeded) get `counted: false, costPrice: null`. Seeding non-NULL `stockCount` here is deliberate: dev DBs must be sellable immediately (the production fresh-start rule is enforced by the migration backfill, not the dev seed).

- [ ] **Step 2: Verify seed runs**

Run: `rm -f prisma/dev.db && pnpm exec prisma migrate dev && pnpm exec tsx prisma/seed.ts`
Expected: completes; spot-check via the Task 1 Step 5 one-liner: choy `counted=false`, others `counted=true, stockCount=50`.

- [ ] **Step 3: Rewrite `smoke-e2e-flow.ts`**

Keep the harness helpers (lines 20-70) and rewrite the scenario body to the count model:

1. Admin creates a COUNTED dish (`mode: 'COUNTED'`, price 30 000, `costPrice` 18 000, `initialCount` 10) via `POST /api/menu/items`.
2. Waiter creates a TAKEAWAY draft, adds 4 — assert `stockCount` 6 and line `cogsSnapshot` 72 000.
3. Admin restocks 20 with 300 000 paid + `setCostFromPaid` — assert count 26, `costPrice` 15 000, linked expense exists.
4. Waiter adds 2 more (merge path) — assert count 24 and line cogs 72 000 + 30 000 = 102 000.
5. Waiter sends; admin confirms with exact CASH; assert order CLOSED and `GET /api/finance/daily` `pnl.cogs` includes 102 000.
6. Count-set to 3 (`Sanoq`) — assert `StockEntry(COUNT)` `countBefore` 24, `countAfter` 3.

Update the file header comment to describe this lifecycle and remove the FIFO wording.

- [ ] **Step 4: Run it**

Prereq: restart `pnpm dev:master` on the reseeded DB.
Run: `pnpm exec tsx scripts/smoke-e2e-flow.ts` — Expected: PASS.
Also re-run: `pnpm exec tsx scripts/smoke-stock-count.ts` — Expected: still PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts scripts/smoke-e2e-flow.ts
git commit -m "chore(seed): count-based fixtures; rewrite e2e smoke for count model"
```

---

### Task 10: docs — same-repo truth updated

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md` (§2 star note, §4 full rewrite, §7 socket table, §9 mobile note unchanged, §11 prune, §12 CLAUDE claims)
- Modify: `CLAUDE.md` (project root — architecture, domain rules, commands)
- Modify: `docs/PRD_FOUNDATION.md` §7 (supersession note)

**Interfaces:** none — prose only, but it gates the merge (CURRENT_WORKFLOW.md §13: update in the same branch as the behavior change).

- [ ] **Step 1: `CURRENT_WORKFLOW.md`**

- §2: the `★ STOCK LEAVES HERE` note now reads: "Adding a line decrements the item's `stockCount` atomically and books `costPrice × qty` into `cogsSnapshot`. `send`/`confirm` still touch no inventory."
- §4: replace the whole section with a "Count-based inventory" section (~40 lines) covering: `counted`/`stockCount`/`costPrice` semantics, NULL = blocked, the two verbs and `StockEntry`, restock money → excluded expense, proportional restore, uncounted items with cost, availability = `stockCount > 0`, the kept-but-dead old tables, corrections = Sanoq + expense reverse.
- §7: socket table — `menu:changed` / `menu:itemAvailability` now reach all clients (`join('all')` shipped); add `stock:changed` → admin; delete the `ingredient:stockChanged` row.
- §11: delete defects 6 (restoreToBatch) and the dead-code paragraph's inventory entries; re-verify each remaining entry still holds and re-number.
- §12: update the "claims in CLAUDE.md that are wrong" list per the new CLAUDE.md.
- Update the header snapshot line to the new commit hash once known.

- [ ] **Step 2: `CLAUDE.md` (project)**

- Architecture bullet for `prisma/schema.prisma`: core models list gains `StockEntry`, and a sentence: "Ingredient/Recipe/Purchase/Stocktake/Waste models remain in the schema for historical data but have no live code paths — inventory is count-based on `MenuItem` (see `docs/superpowers/specs/2026-08-13-count-based-inventory-design.md`)."
- Domain rules: replace the "Stock moves at line-add time" paragraph's FIFO/restore-ledger wording with count semantics (same rules, new mechanism), and delete the per-dish-ingredient scoping sentence.
- Commands: remove `smoke-fifo.ts` from the list; add `smoke-stock-count.ts`.

- [ ] **Step 3: `PRD_FOUNDATION.md` §7**

Insert at the top of §7:

```markdown
> **Superseded (2026-08-13):** §1 (inventory) including §1.9/§1.10 and open
> questions `O-1`…`O-4` is superseded by the count-based inventory design —
> `docs/superpowers/specs/2026-08-13-count-based-inventory-design.md`,
> implemented on `feat/count-based-inventory`. §2–§4 (finance, calculations,
> UI/UX) remain live inputs.
```

- [ ] **Step 4: Final gate**

Run from repo root: `pnpm typecheck` — PASS.
With dev:master running: `pnpm exec tsx scripts/smoke-stock-count.ts && pnpm exec tsx scripts/smoke-e2e-flow.ts && pnpm exec tsx scripts/smoke-finance-pnl.ts` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs: rewrite inventory sections for count-based model"
```
