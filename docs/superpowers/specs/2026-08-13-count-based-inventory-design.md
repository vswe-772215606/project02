# Count-based inventory — design

**Date:** 2026-08-13 · **Status:** approved, awaiting implementation plan
**Branch:** `feat/count-based-inventory` (off `audit/pos-review-and-prd-foundation`)
**Supersedes:** the ingredient/FIFO inventory model (`REFACTOR_PLAN.md` Phases 0–2 as shipped) and `PRD_FOUNDATION.md` §1 (including §1.9 `S-1`…`S-6`, `O-1`…`O-4`, which are moot under this design). This consciously reopens two `PRD_FOUNDATION.md` §7 "do not reopen" items — "the FIFO engine stays" and ingredient-level tracking (`R2`/`R4`) — at the developer's explicit direction.

## 1. Intent

Dead-simple inventory. No ingredients, no recipes, no batches, no unit conversions. Every
menu item carries a number; a sale subtracts from the number; profit per item is
`price − tan narx`. The operator's whole job: type the count when food is ready or goods
arrive, glance at the numbers, correct them by recounting.

Decisions taken in the design session (2026-08-13):

| # | Question | Decision |
|---|---|---|
| D1 | What is counted | Everything, including cooked dishes (plov = portions typed when the kazan is ready). An **uncounted** escape hatch remains for never-runs-out items (choy). |
| D2 | Cost source | `costPrice` (tan narx) is a field on the item, typed at creation/edit. A restock **with money** derives `paid ÷ qty` and offers it as the new tan narx. |
| D3 | P&L shape | The two books stay exactly as they are. Restock money lands in the excluded `Mahsulot xaridi` expense category; `profit = netSales − COGS − operating` with `COGS = Σ cogsSnapshot`. No formula changes. |
| D4 | Zero stock | Blocks the sale (existing `OUT_OF_STOCK` contract). The count is instantly editable by admin; the edit is audited. |
| D5 | Switchover | Fresh start: all counts begin `NULL` ("sanoq kiritilmagan") and every counted item is blocked until admin types its number on day one. `costPrice` is seeded from old cost data where honest. Old inventory tables stay in the DB untouched; only code is removed. |

## 2. Data model

Three new fields on `MenuItem`, one new append-only table, three new audit actions.
Nothing else in the schema changes; old inventory models stay declared (tables untouched)
until a later cleanup migration after a backup mechanism exists.

```prisma
model MenuItem {
  counted    Boolean  @default(true)  // FOOD only; false = uncounted escape hatch
  stockCount Int?                     // NULL = sanoq kiritilmagan → blocked; 0..n otherwise
  costPrice  Decimal?                 // tan narx per portion/unit; NULL → books 0 COGS, UI shows "kiritilmagan"
}

model StockEntry {
  id          String   @id @default(cuid())
  menuItemId  String
  kind        StockEntryKind          // RESTOCK | COUNT
  qty         Int                     // RESTOCK: qty added (> 0); COUNT: the absolute number typed (>= 0)
  countBefore Int?                    // NULL when the count had not been entered yet
  countAfter  Int
  paidUzs     Decimal?                // RESTOCK only, optional, > 0 when present
  unitCost    Decimal?                // paidUzs ÷ qty, when money entered
  expenseId   String?  @unique        // auto-created excluded Expense (RESTOCK with money)
  note        String?
  actorUserId String
  occurredAt  DateTime
  createdAt   DateTime @default(now())

  menuItem MenuItem @relation(fields: [menuItemId], references: [id])
  expense  Expense? @relation(fields: [expenseId], references: [id])
  actor    User     @relation(fields: [actorUserId], references: [id])

  @@index([menuItemId, occurredAt])
  @@index([occurredAt])
}

enum StockEntryKind { RESTOCK COUNT }

enum AuditAction {
  // … existing values …
  STOCK_RESTOCKED
  STOCK_COUNT_SET
  ITEM_COST_CHANGED
}
```

Semantics:

- **Count and cost are independent.** `counted`/`stockCount` govern availability only;
  `costPrice` governs COGS only. An uncounted item with a cost books real COGS (fixes the
  old UNTRACKED "100% margin" problem, audit `M-64`). A counted item with `costPrice = NULL`
  sells but books 0 COGS and shows "tan narxi kiritilmagan" in admin.
- Counts are whole numbers. `OrderLine.quantity` is already `Int`; combos decrement each
  component's count by its component quantity.
- `SERVICE` items ignore all three fields.
- `Expense.purchaseId` is not reused; the link for restock money is `StockEntry.expenseId`.
- Sales are **not** journaled in `StockEntry` — per-sale movements are reconstructible from
  `OrderLine`s. Only the two admin verbs (restock, count) write entries; that plus their
  audit rows is the detective control on count edits.

## 3. Sale and restore flow

`consumption.service.ts` (FIFO peel/restore) is replaced by `stock.service.ts` exposing the
same two entry points, so `order.service.ts` call sites and every state-machine rule stay
identical: stock moves at line-add time; restore fires on quantity decrease, line cancel and
order cancel from DRAFT **and** SENT; WALKOUT consumes without restoring; `send`/`confirm`
touch nothing.

**consume(line, portions, tx):**

1. Load the item (`kind`, `counted`, `stockCount`, `costPrice`).
2. `kind = SERVICE` → no-op. `counted = false` → skip to step 4.
3. Atomic conditional decrement — one `updateMany` guarded by `stockCount >= portions`
   (same CAS shape as the old `peelAtomic`; SQL `NULL >= n` is not-true, so a
   never-counted item fails the guard for free). No row matched → `Errors.OutOfStock`
   → the surrounding line transaction rolls back. Waiters see one message ("tugadi");
   admin distinguishes "—" (not counted) from 0 in Ombor.
4. `cogsSnapshot += costPrice × portions` (0 when `costPrice` is NULL).
5. Emits (deferred through the existing post-commit machinery): `stock:changed
   { menuItemId }` to `admin` on every change; `menu:itemAvailability` to `all` when the
   count crosses to 0. Crossing to 0 also fires the existing owner stock-out Telegram alert.

**restore(line, portions, tx):**

1. `counted = true` → unconditional atomic increment of `stockCount`.
2. `cogsSnapshot` is recomputed **proportionally**: `new = old × newQty / oldQty`
   (full cancel keeps the snapshot; `isCanceled` filtering excludes it from every report,
   as today). Proportional math preserves the frozen at-add-time cost even if `costPrice`
   changed in between — no peel ledger needed, honest history kept.
3. Emits `stock:changed`; `menu:itemAvailability` when the count leaves 0.

The 30s transaction timeouts on line mutations stay as they are (harmless, out of scope).

## 4. Restock, count, and the Ombor page

Two verbs, two endpoints (ADMIN+OWNER), replacing `/api/ingredients` and `/api/purchases`:

- **`POST /api/stock/:menuItemId/restock`** `{ qty, paidUzs?, setCostFromPaid?, note? }`
  One transaction: `stockCount = (stockCount ?? 0) + qty` → `StockEntry(RESTOCK)` with
  before/after → if `paidUzs`: create the Expense (category `seed-cat-ingredients`, reason
  `Keldi: {name}`, `occurredAt` = entry date) and set `unitCost = paidUzs ÷ qty`; if also
  `setCostFromPaid`: `costPrice = unitCost` → `AuditLog(STOCK_RESTOCKED)`. Rejected with a
  validation error for `counted = false` items ("Bu taom sanalmaydi").
- **`POST /api/stock/:menuItemId/count`** `{ countedQty, note? }`
  Sets `stockCount` absolutely, records `StockEntry(COUNT)` with before/after,
  `AuditLog(STOCK_COUNT_SET)`. This **is** Sanoq.
- **`GET /api/stock`** — counted items with count, cost, last entry. **`GET
  /api/stock/:menuItemId/entries`** — history, newest first.
- `costPrice` and `counted` are editable through the existing item PATCH. Cost changes are
  audited (`ITEM_COST_CHANGED`, before/after). Toggling `counted` ON resets `stockCount`
  to NULL (must be counted before it sells); OFF clears the count. Items are no longer
  locked to their creation mode.

Zod: `qty` int > 0 · `countedQty` int ≥ 0 · `paidUzs` int > 0 when present.

**Ombor page** (renderer, replaces IngredientsPage + PurchasesPage + RecipesPage): one list
of counted items — name, category, count (red at 0, "—" for NULL), tan narx or
"kiritilmagan", last entry date — with row actions **+ Keldi** (qty, optional paid, checkbox
"tan narxni yangilash") and **Sanoq** (absolute number), plus an expandable per-item entry
history. Morning plov: Ombor → plov → Keldi → 40 → save.

**Menu create form** collapses to three choices: SERVICE / counted FOOD / uncounted FOOD,
with price, optional tan narx, optional initial count (absent → NULL → blocked until
counted; present → written as a `StockEntry(COUNT)` with `countBefore = NULL`, so history
starts at creation). No units, no conversion factors, no recipes, no per-ingredient rows.

## 5. Finance touchpoints

The formulas do not move (D3). `dailyLedger`'s canonical P&L, `cashOut`/same-day-reversal
drawer math, expense machinery, debts, `serviceChargeMatrix`, monthly/summary/Telegram money
math are all untouched. Past orders' `cogsSnapshot` values are frozen history and remain.

Three contained re-points:

1. `dailyLedger.outflow.ingredientPurchases(+Count)` aggregates
   `StockEntry` where `paidUzs != null` and linked `expense.status != 'REVERSED'`
   (replaces the ACTIVE-only `Purchase` aggregate).
2. `financeService.dailyForAdmin`'s Xaridlar drill-down lists money-restocks from
   `StockEntry` (item name via `menuItem`).
3. Telegram `/omborxona` becomes the counted-items list (count, tan narx, zeros in red);
   the low-stock report keys on `stockCount`.

Corrections under the new model: count mistakes → Sanoq; money mistakes → the existing
expense reverse (same-day) machinery. The Purchase reverse/delete flows die with the
Purchase writes — the only producer of cross-day reversals is gone, but the cash-drawer
special-case stays (historical rows still exist, and expense reversal remains reachable).

## 6. Availability and live updates

- `listMenuForClients.effectivelyAvailable` becomes
  `isAvailable && (kind === 'SERVICE' || !counted || stockCount > 0)` — `yield.service.ts`
  is deleted. NULL count ⇒ unavailable. Waiter DTO field names unchanged.
- **Included one-liner:** `socket.join('all')` for every authenticated socket
  (`socket.ts` — audit `C-8`, fix #5 of the paused queue). Count-based selling depends on
  waiters seeing items grey out live; today `menu:*` events emit into a room nobody joins.
  The already-emitted `menu:itemAvailability` / `menu:changed` events start arriving;
  client listeners already exist.

## 7. What is deleted vs untouched

**Deleted (code only — DB tables stay untouched until a post-backup cleanup):**
`consumption.service`, `purchase.service/.repo`, `ingredient.service/.repo`,
`recipe.service/.repo`, `stocktake.service/.repo`, `waste.service`/`wasteEvent.repo`,
`yield.service`, `ingredientMovement.repo`, `orderLineBatchConsumption.repo`; routes,
controllers and zod schemas for ingredients/purchases/recipes and the menu `/yield`
endpoint; renderer pages IngredientsPage, PurchasesPage, RecipesPage and their queries;
`smoke-fifo.ts`; dev seed's ingredient/recipe fixtures.

**Untouched:** billing/`computeTotals`, confirm/payments/debts, expense + repayable
machinery, dailyLedger/monthly/summary formulas, printer pipeline, auth, order state
machine, socket deferred-emit architecture, mobile/order app contracts (they already handle
`OUT_OF_STOCK` and `effectivelyAvailable`).

## 8. Migration and switchover day

One schema migration (fields + table + enum values) and one idempotent data migration
through both pipelines (Prisma CLI for dev, packaged sql.js ledger for production):

- `counted = true` for FOOD items that today have a recipe-with-ingredients or a
  self-ingredient; `counted = false` for FOOD items with neither (today's UNTRACKED) and
  for SERVICE.
- `stockCount = NULL` everywhere (D5 fresh start).
- `costPrice` seeding, only where honest:
  - self-ingredient items with `recipeUnit = 'dona'` → `weightedAvgCost` (per-dona cost);
  - recipe dishes → `Σ (RecipeIngredient.quantity × ingredient.weightedAvgCost)`
    (per-portion cost at last-purchase prices);
  - kg/l self-ingredient items → NULL (their old per-portion numbers were the `F-11`
    1000× understatement — seeding them would freeze the lie);
  - everything else → NULL.

Day one: admin opens Ombor, every counted item shows "—" and is blocked; they type real
counts (10–20 items, minutes) and sanity-check the seeded tan narx values. Service resumes
item-by-item as counts land.

Docs updated in the same commit as the behavior change (per `CURRENT_WORKFLOW.md` §13):
rewrite `CURRENT_WORKFLOW.md` §4 (and touch §2/§11 where they reference FIFO), update
`CLAUDE.md`'s inventory/domain sections, add a supersession note to `PRD_FOUNDATION.md` §7.

## 9. Verification

House convention (no test runner; self-contained smoke scripts against throwaway SQLite):

- **New `smoke-stock-count.ts`:** restock with money creates the excluded expense and
  refreshes cost when asked → sale decrements and books `cost × qty` → merge-line second
  add accumulates COGS at the then-current cost → quantity decrease/cancel restores count
  and recomputes COGS proportionally → 0 and NULL both block with `OUT_OF_STOCK` →
  count-set writes StockEntry + audit with before/after → uncounted item sells without a
  count and books its cost → P&L identity: `profit = netSales − Σ(cost×qty) − operating`
  and drawer math unchanged.
- **Updated:** `smoke-e2e-flow.ts` (counted item instead of ingredient fixtures),
  `smoke-finance-pnl.ts` (COGS source is `costPrice`).
- `pnpm typecheck` across all workspaces proves no dead imports survive the deletion.

## 10. Out of scope

Fiscalization (`F-1`…`F-3`), backups (`F-9`), the rest of the paused audit fix queue
(`F-4`, `F-7`, `F-6`, `C-3`), settlement corrections (`C-7`), shift/cash-count (`C-4`,
`C-17`), per-line discounts, and dropping the old inventory tables (needs a backup first).
Findings that die with the old model rather than being fixed: `F-11`, `C-18`, `C-11`,
`C-15`'s inventory half, `M-64`…`M-74` (inventory-admin block), `M-1`'s Chegirmalar caps
question is unaffected.
