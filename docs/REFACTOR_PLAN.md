# Chayxana POS — Business-model refactor plan

**Status:** Plan locked, ready to break into implementation phases.
**Author / date:** 2026-05-15
**Supersedes:** PRD 07 (stock model). Touches: PRD 01, 05, 06, 08, 10.
**Driven by:** Owner's request to see "real finance"; current inventory is untracked at the ingredient level; reports cannot be trusted because COGS does not exist.

---

## 1. The problem in one paragraph

The chayxana sells dishes (plov, manti, drinks). The system currently tracks **finished portions** ("8 plov left for today") via a daily-reset stock counter, with a binary `trackStock` flag on each menu item. The owner cannot answer the questions that matter to them: *how much did this plov cost me to make? where did my meat go? what is my profit today?* The answers are unreachable because the system does not know what's inside a plov.

At the same time, the people inputting the data are humans. The admin can mis-count, mis-record, or forget. The system cannot *make* the inputs honest. It can only:

1. Compute correctly from whatever inputs it receives.
2. Surface variance — where the system's expected state and the human-counted state disagree.
3. Force every change to be auditable.

This refactor accepts that bargain. The owner gets a system that is **truthful given truthful inputs**, with a clear surface for noticing when inputs are not truthful (variance + reason codes + audit log).

## 2. Locked decisions (chat round, 2026-05-15)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Ingredient ledger replaces `trackStock`/`DailyStock`** | The fundamental unit of inventory is the raw ingredient (rice, meat, bread, etc.), not the finished dish. |
| 2 | **Trust mechanism: dual COGS + variance loop** | Owner needs both "real profit" (COGS) and "stock actually matches" (variance). Each addresses one half of "I don't trust the numbers." |
| 3 | **Cost basis: weighted average** | New purchase updates running average: `(oldStock × oldCost + newQty × newCost) / total`. Simple, forgiving, matches small-restaurant practice. |
| 4 | **Granularity: major ingredients + monthly overhead expense** | Track rice/meat/oil/drinks/etc. precisely; skip salt/spices/herbs; owner records monthly "kitchen overhead" as a fixed expense. ~3-8 ingredient lines per recipe. |
| 5 | **Drinks/bread/packaged = 1:1 self-ingredient** | "Coca-Cola 0.5L" is both menu item and ingredient with a trivial recipe (1 bottle = 1 bottle). Unified code path. |
| 6 | **Daily morning stocktake** | Admin counts every ingredient each morning. Variance vs yesterday's expected is computed. Highest-signal cadence; matches the existing morning-prep UX surface. |
| 7 | **Deduction at order-line creation** | When waiter adds a line, ingredients deduct immediately (with insufficiency → reject). Cancel-before-cook restores. Matches current menu-item stock behaviour and PRD 01's cascade rules. |
| 8 | **Recipe versioning: snapshot at order time** | OrderLine snapshots the consumption rows it consumed. Recipe edits affect only future orders. Past reports never retroactively change. |
| 9 | **UoM: buy unit + recipe unit + conversion factor per ingredient** | Each ingredient declares e.g. `buyUnit=kg, recipeUnit=g, conversion=1000`. Restock in kg, recipe in g, system converts. Simple, supports most kitchen reality. |
| 10 | **Recipe authority: admin edits, owner sees audit trail** | Operational reality — admin knows the kitchen. Every edit logged with before/after, surfaced to owner. |
| 11 | **Variance response: admin enters reason code per variance** | Categories: `waste / theft / recipe-error / restock-not-recorded / count-error`. Owner sees aggregate per category. Real accountability without owner-gating every day. |
| 12 | **Purchase = unified event (stock + cost + expense)** | Single "bought 50kg meat for 1,200,000 UZS" event creates stock-in + cost-update + expense-row. No double-entry by admin. |
| 13 | **Rollout: big-bang** | Owner does a 1-2 day setup phase (ingredients + recipes for every menu item) before going live. No half-tracked transition period. Clean state from day one. |
| 14 | **SQLite stays** (per PRD 02) | Engineering target unchanged. All schema changes must remain SQLite-compatible. |
| 15 | **Day boundary: local time (Tashkent UTC+5)** | Fix the UTC-based `today()` bug from PRD 07. Stocktake date and consumption attribution use local date. |

## 3. Data model

### 3.1 Core tables (new)

```prisma
model Ingredient {
  id                String     @id @default(cuid())
  name              String     @unique          // "Go'sht" / "Guruch"
  buyUnit           String                       // "kg", "l", "dona" (piece)
  recipeUnit        String                       // "g",  "ml", "dona"
  conversionFactor  Decimal                      // 1 buyUnit = conversionFactor recipeUnit
                                                 // (1 for piece-to-piece; 1000 for kg-to-g)
  currentStock      Decimal    @default(0)       // in recipeUnit, recomputed from movements
  weightedAvgCost   Decimal    @default(0)       // UZS per recipeUnit; updated on PURCHASE
  isActive          Boolean    @default(true)
  isSelfMenuItem    Boolean    @default(false)   // True for 1:1 items (Coke, water, etc.)
  selfMenuItemId    String?    @unique           // back-link if isSelfMenuItem
  expenseCategoryId String?                      // default category for purchases of this ingredient
  varianceThreshold Decimal    @default(5)       // % above which a variance requires reason code
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  movements         IngredientMovement[]
  recipeIngredients RecipeIngredient[]
  selfMenuItem      MenuItem?  @relation("SelfIngredient", fields: [selfMenuItemId], references: [id])
  expenseCategory   ExpenseCategory? @relation(fields: [expenseCategoryId], references: [id])

  @@index([isActive])
  @@index([isSelfMenuItem])
}

enum IngredientMovementType {
  PURCHASE        // +stock, cost-update, expense-row (paired with Purchase row)
  CONSUME         // -stock, recipe-driven from OrderLine
  RESTORE         // +stock, reverses a prior CONSUME on cancel-before-cook
  STOCKTAKE       // record-only (not a delta); records the count snapshot
  ADJUST          // explicit signed delta after a categorized variance
  WASTE           // -stock, explicit admin event with reason
  COST_ADJUST     // record-only cost-basis change (rare; e.g., supplier credit)
}

model IngredientMovement {
  id               String     @id @default(cuid())
  ingredientId     String
  type             IngredientMovementType
  quantity         Decimal                     // signed, in recipeUnit; STOCKTAKE/COST_ADJUST: 0
  unitCostSnapshot Decimal?                    // cost-per-recipeUnit at time of event
  resultingStock   Decimal                     // running balance after this event (denormalized for audit)
  resultingAvgCost Decimal                     // running weighted-avg cost after this event

  // Source references (exactly one of these is set, depending on type)
  purchaseId       String?                     // PURCHASE
  orderLineId      String?                     // CONSUME or RESTORE
  stocktakeEntryId String?                     // STOCKTAKE or ADJUST (post-variance)
  wasteEventId     String?                     // WASTE

  reasonCode       String?                     // for ADJUST/WASTE: waste|theft|recipe-error|...
  note             String?
  actorUserId      String
  occurredAt       DateTime                    // local-time semantics
  createdAt        DateTime   @default(now())

  ingredient       Ingredient @relation(fields: [ingredientId], references: [id])
  actor            User       @relation(fields: [actorUserId], references: [id])
  purchase         Purchase?  @relation(fields: [purchaseId], references: [id])
  orderLine        OrderLine? @relation(fields: [orderLineId], references: [id])
  stocktakeEntry   StocktakeEntry? @relation(fields: [stocktakeEntryId], references: [id])
  wasteEvent       WasteEvent? @relation(fields: [wasteEventId], references: [id])

  @@index([ingredientId, occurredAt])
  @@index([type])
  @@index([occurredAt])
}

model Purchase {
  id                 String   @id @default(cuid())
  ingredientId       String
  quantityBuyUnit    Decimal                     // entered in ingredient's buy unit (e.g., 50)
  quantityRecipeUnit Decimal                     // computed: × conversionFactor (e.g., 50000g)
  totalCostUzs       Decimal                     // total spent
  unitCostPerRecipeUnit Decimal                  // derived for cost-basis update
  supplierNote       String?
  expenseId          String   @unique            // the Expense row this Purchase generated
  recordedById       String
  occurredAt         DateTime
  createdAt          DateTime @default(now())

  ingredient         Ingredient @relation(fields: [ingredientId], references: [id])
  expense            Expense    @relation(fields: [expenseId], references: [id])
  recordedBy         User       @relation(fields: [recordedById], references: [id])
  movement           IngredientMovement[]      // exactly one PURCHASE row

  @@index([ingredientId, occurredAt])
  @@index([occurredAt])
}

model Recipe {
  id          String   @id @default(cuid())
  menuItemId  String   @unique
  notes       String?
  isComplete  Boolean  @default(false)            // owner-toggle: ready for use in COGS
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  menuItem    MenuItem @relation(fields: [menuItemId], references: [id])
  ingredients RecipeIngredient[]
  edits       RecipeEdit[]
}

model RecipeIngredient {
  id           String  @id @default(cuid())
  recipeId     String
  ingredientId String
  quantity     Decimal                           // in ingredient.recipeUnit

  recipe       Recipe     @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id])

  @@unique([recipeId, ingredientId])
}

model RecipeEdit {
  id          String   @id @default(cuid())
  recipeId    String
  editedById  String
  beforeJson  Json                              // full recipe snapshot before
  afterJson   Json                              // full recipe snapshot after
  occurredAt  DateTime @default(now())

  recipe      Recipe @relation(fields: [recipeId], references: [id])
  editor      User   @relation(fields: [editedById], references: [id])

  @@index([recipeId, occurredAt])
}

model Stocktake {
  id            String          @id @default(cuid())
  date          DateTime                          // local-date (start-of-day in Asia/Tashkent)
  performedById String
  status        StocktakeStatus                   // OPEN | AWAITING_REASONS | COMPLETED
  notes         String?
  createdAt     DateTime        @default(now())
  completedAt   DateTime?

  entries       StocktakeEntry[]
  performer     User            @relation(fields: [performedById], references: [id])

  @@unique([date])                                // one stocktake per local-date
}

enum StocktakeStatus {
  OPEN                // admin is entering counts
  AWAITING_REASONS    // counts entered, variances categorised next
  COMPLETED           // all variances categorised, day is finalized
}

model StocktakeEntry {
  id            String  @id @default(cuid())
  stocktakeId   String
  ingredientId  String
  expectedQty   Decimal                           // system-computed from prior state + movements since last stocktake
  countedQty    Decimal                           // admin's entered count
  variance      Decimal                           // countedQty - expectedQty (signed)
  reasonCode    String?                           // required if |variance|/expectedQty > ingredient.varianceThreshold
  reasonNote    String?
  valuedAtCost  Decimal                           // |variance| × weightedAvgCost (UZS impact)

  stocktake     Stocktake  @relation(fields: [stocktakeId], references: [id])
  ingredient    Ingredient @relation(fields: [ingredientId], references: [id])
  movement      IngredientMovement[]             // exactly one STOCKTAKE + 0 or 1 ADJUST rows

  @@unique([stocktakeId, ingredientId])
}

model WasteEvent {
  id            String   @id @default(cuid())
  ingredientId  String
  quantity      Decimal                          // in recipeUnit, positive number
  reasonCode    String                           // spoilage|prep-error|dropped|...
  note          String?
  recordedById  String
  occurredAt    DateTime
  createdAt     DateTime @default(now())

  ingredient    Ingredient @relation(fields: [ingredientId], references: [id])
  recordedBy    User       @relation(fields: [recordedById], references: [id])
  movement      IngredientMovement[]            // exactly one WASTE row

  @@index([ingredientId, occurredAt])
}
```

### 3.2 Changes to existing tables

**`MenuItem`** — remove `trackStock`; add relation to `Recipe`:

```prisma
model MenuItem {
  // ... existing fields except trackStock ...
  // trackStock      Boolean  @default(false)   // REMOVED
  recipe           Recipe?
  selfIngredient   Ingredient? @relation("SelfIngredient")
}
```

**`OrderLine`** — add COGS snapshot fields:

```prisma
model OrderLine {
  // ... existing fields ...
  cogsSnapshot          Decimal? // total ingredient cost at order time
  consumptionSnapshot   Json?    // [{ ingredientId, quantityRecipeUnit, unitCostSnapshot }, ...]
  // Consumption rows are also live in IngredientMovement; this is denormalized for fast reads.
}
```

**`Expense` / `ExpenseCategory`** — Purchase creates an Expense row, so the link is already implicit. Add `Expense.purchaseId String? @unique` for the back-reference; ensure `ExpenseCategory` has a "Ingredient purchase" default category.

**`DailyStock`** — keep table for historical data during migration; delete in Phase 6 (cleanup).

### 3.3 Invariants the schema enforces

1. **Conservation**: `Ingredient.currentStock == initialStock + sum(IngredientMovement.quantity)` for that ingredient. Verifiable at any moment.
2. **Causation**: every CONSUME has exactly one `orderLineId`; every RESTORE matches a prior CONSUME on the same orderLine; every PURCHASE has exactly one `purchaseId`; etc.
3. **Reversibility (FINANCE_PLAN §2.2)**: any movement can be reversed by an explicit counter-movement. We never mutate or delete existing movements.
4. **Weighted-avg cost**: changes only on PURCHASE (or rare COST_ADJUST). CONSUME, RESTORE, ADJUST, WASTE all read the current avg cost at time of event but don't update it.
5. **Recipe snapshot**: `OrderLine.consumptionSnapshot` is set at order-line creation and never modified — even if the recipe is later edited.
6. **One stocktake per local-date**: enforced by unique constraint.

## 4. Lifecycle (how events flow)

### 4.1 A waiter adds a line to an order

```
Waiter taps "Plov +1"
  →  POST /api/orders/:id/lines
  →  orderService.addLine()
       1. Load recipe for menuItem. If recipe is missing or !isComplete → error "Bu taom uchun retsept yo'q".
       2. For each RecipeIngredient: check ingredient.currentStock >= quantity × lineQty.
          If any insufficient: throw OutOfStock("Yetishmaydi: <ingredient>") — no partial deduction.
       3. In a single $transaction:
          a. Create OrderLine row.
          b. For each ingredient: write IngredientMovement(CONSUME) with quantity = -recipeQty × lineQty, unitCostSnapshot = ingredient.weightedAvgCost, resultingStock = currentStock - delta.
          c. Update ingredient.currentStock atomically.
          d. Compute lineCogs = sum(consume.quantity × consume.unitCostSnapshot).
          e. Write OrderLine.cogsSnapshot = lineCogs, consumptionSnapshot = [...].
       4. Emit socket events as today.
```

**Note**: weighted-avg cost is a snapshot at the moment of consumption. A subsequent restock that raises the avg cost does not re-cost the in-flight order.

### 4.2 Waiter or admin cancels (before cook)

Per PRD 01's cascade: lines whose kitchen ticket is `PENDING` (or null) restore. Restoration:

```
  orderService.cancelOrder / cancelLine
  →  for each line being cancelled with ticket-status ∈ {null, PENDING}:
       1. For each row in OrderLine.consumptionSnapshot:
          write IngredientMovement(RESTORE) with quantity = +abs(consumed), unitCostSnapshot = (same as the original CONSUME — for traceability), update currentStock.
       2. OrderLine.isCanceled = true.
```

Cancelling a line whose ticket is `IN_PROGRESS` or beyond does **not** restore. The cooked ingredients are gone; their cost becomes "cooked-waste cancel loss" per PRD 05.

### 4.3 Admin records a purchase

```
Admin opens "Xarid kiritish" / Record purchase form.
  Selects ingredient, enters quantityBuyUnit, totalCostUzs, optional note.
  →  POST /api/purchases
  →  purchaseService.create():
       1. Compute quantityRecipeUnit = quantityBuyUnit × ingredient.conversionFactor.
       2. Compute unitCostPerRecipeUnit = totalCostUzs / quantityRecipeUnit.
       3. In a single $transaction:
          a. Create Expense row in the configured category (or "Ingredient purchase" default).
          b. Create Purchase row, linked to Expense.
          c. Update ingredient.weightedAvgCost = (oldStock × oldCost + qtyRec × unitCostRec) / (oldStock + qtyRec).
          d. Update ingredient.currentStock += qtyRec.
          e. Write IngredientMovement(PURCHASE) referencing the Purchase row.
       4. Emit `ingredient:changed` on socket.
```

### 4.4 Morning stocktake

```
Admin opens "Bugungi sanoq" / Today's count (anytime after midnight; system clocks local-date).
  System creates Stocktake row in OPEN status (idempotent — at most one per local-date).
  For each active ingredient:
    System pre-fills expectedQty = ingredient.currentStock as of right now.
    Admin enters countedQty.
    System computes variance = countedQty - expectedQty.
    If |variance| / expectedQty > ingredient.varianceThreshold → reason code required.
  Admin submits.
  →  POST /api/stocktakes/:id/complete
  →  stocktakeService.complete():
       For each StocktakeEntry:
         1. Write IngredientMovement(STOCKTAKE) with quantity = 0 (record-only).
         2. If variance ≠ 0:
              Write IngredientMovement(ADJUST) with quantity = variance, reasonCode, valuedAtCost = |variance| × weightedAvgCost.
              Update ingredient.currentStock = countedQty (snap to physical reality).
         3. Audit log.
       Stocktake.status = COMPLETED.
       Emit owner Telegram alert if total variance value > settings.variance_alert_threshold.
```

The variance event is **named, categorized, audited, and visible**. It's the trust-loop surface.

### 4.5 Owner reads daily P&L

```
Daily report (reports.service.ts):
  Revenue        = sum(Order.totalSnapshot WHERE status=CLOSED AND closedAt in day)
  COGS           = sum(OrderLine.cogsSnapshot WHERE order.closedAt in day AND line.isCanceled=false)
                  + sum(OrderLine.cogsSnapshot WHERE order.status=WALKOUT AND walkoutAt in day)
                  + sum(StocktakeEntry.valuedAtCost WHERE reasonCode='recipe-error' in day) // recipe correction loss
                  + sum(WasteEvent.quantity × ingredient.weightedAvgCost in day)            // explicit waste
  GrossMargin    = Revenue - COGS
  OperatingExp   = sum(Expense WHERE category != 'Ingredient purchase' AND date in day)
                                                                                                // Purchases are
                                                                                                // capitalized into stock,
                                                                                                // not expensed at buy time.
                                                                                                // They expense as COGS
                                                                                                // when consumed.
  NetProfitDay   = GrossMargin - OperatingExp - (DailyOverheadAllocation = MonthlyOverhead / DaysInMonth)
  VarianceLoss   = sum(StocktakeEntry.valuedAtCost WHERE reasonCode ∈ {theft, count-error, restock-not-recorded} in day)
                                                                                                // Surfaces unexplained drift
                                                                                                // separately. Theft etc.
                                                                                                // is informational, not COGS.
  
  Owner sees: Revenue / COGS / GrossMargin / OpEx / Overhead / Net / Variance-loss-by-category.
```

This is the "real finance" the owner asked for. Every number derives from immutable events.

## 5. Roles & responsibilities

The user explicitly named "who is responsible" as a core problem. Locking it:

| Role | What they do | What they see |
|---|---|---|
| **OWNER** | Sets variance thresholds; reviews audit log of recipe edits, big variances, write-offs; receives daily Telegram P&L; defines monthly overhead; activates ingredients/recipes for use in COGS via `isComplete` flag. | Full P&L (revenue, COGS, margin, expenses, net, variance categorised). All audit logs. All recipe edits with diffs. |
| **ADMIN** | Records purchases (one event → stock + cost + expense). Performs daily morning stocktake. Categorises variances. Records waste events. Edits recipes (audited). Daily ops: morning prep is now stocktake; restocking is purchase. | Operational: ingredient list with current stock, low-stock indicators, recipe editor, variance entry form, recent purchases, recent waste. No P&L numbers. |
| **KITCHEN** | Unchanged — sees tickets only. No ingredient awareness. | Tickets. |
| **WAITER** | Unchanged — sees menu items only. Adding a line implicitly consumes ingredients, but the waiter sees only "out of stock" if ingredients are insufficient. | Menu, orders, bill. |

### 5.1 Accountability surfaces (explicit)

- **Recipe edits** → `RecipeEdit` log → owner audit page → daily summary if recipe changed today.
- **Variance** → categorised by admin → daily summary with breakdown → owner Telegram includes top-3 ingredients by variance loss.
- **Purchases** → standard expense surface + ingredient activity feed → owner can spot "we suddenly bought 10x as much rice this week."
- **Waste events** → admin-recorded → daily summary surfaces total wasted value.
- **Stocktake completion** → required before admin can proceed with the day; missed stocktakes show as "kun ochilmagan" (day not opened) on owner dashboard.

The system records; the human decides what to do with the signal.

## 6. Phases

### Phase 0 — Schema + ledger core (no UI yet)

- Add new tables: Ingredient, IngredientMovement, Purchase, Recipe, RecipeIngredient, RecipeEdit, Stocktake, StocktakeEntry, WasteEvent.
- Add columns: `OrderLine.cogsSnapshot`, `OrderLine.consumptionSnapshot`, `MenuItem.recipe` relation, `MenuItem.selfIngredient` relation, `Expense.purchaseId`.
- Migrations: new tables + new columns. **Keep** `DailyStock` and `MenuItem.trackStock` for now (Phase 6 removes).
- Repository layer for each new table.
- Service stubs (compile but no-op or simple CRUD).
- Verification: typecheck passes; old code still works because nothing reads the new tables yet.

### Phase 1 — Purchase + Recipe CRUD + Ingredient management

- `purchaseService.create()`: full path (Expense + Purchase + IngredientMovement(PURCHASE) + ingredient cost update).
- `ingredientService`: CRUD + listing with computed current-stock from movements (cross-check).
- `recipeService`: CRUD with full audit (`RecipeEdit` row on every change).
- REST endpoints: `/api/ingredients`, `/api/purchases`, `/api/menu/items/:id/recipe`.
- Admin UI:
  - "Mahsulotlar" / Ingredients page (list, create, edit).
  - "Xaridlar" / Purchases page (record purchase form, history list).
  - Recipe editor inline on the menu item edit page.
- Verification: admin can set up the chayxana's ingredient list and record purchases; weighted-avg cost updates correctly; auditable.

### Phase 2 — Order-line consumption + COGS snapshot

- `orderService.addLine()` rewritten to:
  - Require `MenuItem.recipe` to exist AND `recipe.isComplete == true`. If not → error.
  - Check insufficiency across all recipe ingredients atomically.
  - Write CONSUME movements; snapshot consumption + cogs on the OrderLine.
- `orderService.cancelLine` / `cancelOrder` updated to write RESTORE movements per the cascade rules (PRD 01).
- Drop the old `stockService.decrement` / `stockService.restore` calls. (Deprecate the methods; remove in Phase 6.)
- Verification: a closed order has `cogsSnapshot` populated; cancellation before cook restores the consumed ingredients; cancellation after cook leaves them consumed (cooked-waste).

### Phase 3 — Daily stocktake + variance loop

- `stocktakeService.open(date)`, `enterCount(entryId, countedQty)`, `categoriseVariance(entryId, reasonCode, note)`, `complete()`.
- Admin UI: "Bugungi sanoq" / Daily count page. Walks through every active ingredient with expected + count fields. Variance row appears red if over threshold, requires reason code.
- Variance affects `ingredient.currentStock` only after stocktake completion (snap-to-physical via ADJUST).
- Verification: a full day cycle (purchases + orders + stocktake) reconciles; variance breakdown by reason code is queryable.

### Phase 4 — Waste events + monthly overhead + owner P&L dashboard

- `wasteEventService.record({ ingredientId, quantity, reasonCode, note })`.
- Admin UI: "Yo'qotish kiritish" / Record waste form.
- Owner settings: `monthly_kitchen_overhead_uzs`.
- Reports: extend `reports.service.ts` daily report with COGS, GrossMargin, NetProfitDay, VarianceLoss, WastageLoss.
- Telegram daily summary expanded.
- Owner UI: "Foyda" / Profit page (owner-only) with daily/monthly P&L.

### Phase 5 — Setup wizard for big-bang rollout

A guided one-time flow for the chayxana to go live with the new model:

1. Owner enters all ingredients with their initial stock + cost + units. (For self-menu-item ingredients, system auto-creates from the menu side or vice versa.)
2. Admin builds recipes for every active menu item. Recipe editor shows progress: "12 ta taom 30 tadan retseptga ega" (12 of 30 dishes have recipes).
3. Owner reviews recipes, toggles `isComplete = true` on each as approved.
4. Once all active menu items have complete recipes, "Tizimni ishga tushirish" / Activate button enables the new flow.
5. The "go live" event sets a `system_costing_active_since` setting. Until set, the system runs in old-mode.

### Phase 6 — Cleanup

- Drop `MenuItem.trackStock` column.
- Drop `DailyStock` table (or archive to `DailyStock_legacy`).
- Remove `stockService` deprecated methods.
- Remove old "Zaxiralar" / Stock UI page (replaced by "Mahsulotlar" + "Bugungi sanoq").
- Update `decisions.md` with the new model as the locked v2 source of truth.
- Mark PRD 07 as Superseded.

### Phase 7 — Iteration + observability

- Variance trend dashboard (week-over-week by ingredient and by reason code).
- Recipe-drift report (when admin keeps adjusting a recipe, surface "X edited 5 times this month").
- Top-cost-leakage view (which ingredient × reason combination is bleeding the most).
- Auto-PR for the `_app_migrations` integrity check (boot-time): for every ingredient, validate `currentStock == sum(movements.quantity)`. Warn on drift.

## 7. Open implementation questions (to resolve during build)

These are *not* business decisions — they're tactical questions answerable as we hit them:

1. **Decimal precision** for ingredient quantities. SQLite stores Decimal as text; Prisma converts to Decimal.js. Pick a sensible default (e.g., 3 decimal places for recipeUnit) and ensure rounding is consistent across consume/restore.
2. **Migration data**: zero historical orders need to be re-costed (we said snapshot-at-order-time). But the inventory state before "go live" needs an initial Stocktake-equivalent. Phase 5 setup wizard handles this with explicit "starting count" entry.
3. **Combo orders**: each combo expansion creates N lines per `addCombo`. Each line consumes its recipe ingredients. The implementation just iterates — combo doesn't have its own recipe.
4. **Performance**: a popular dish with 6 ingredients × 100 orders/day = 600 IngredientMovement rows/day = ~18k/month. Over a year ~220k. SQLite handles this fine but ensure the indexes are present.
5. **What if admin forgets to record a purchase?** The next morning's stocktake will show positive variance ("we have more meat than expected"). Reason code: `restock-not-recorded`. Admin adds a backdated purchase. The system supports this via `Purchase.occurredAt` being independent of `createdAt`.
6. **What if recipe is wrong and the system rejects orders during peak?** Admin can edit the recipe live (audited). The next order uses the new recipe; in-flight orders keep their snapshot.
7. **Owner-overridden weighted-avg cost** (rare, but useful for corrections): allowed via `COST_ADJUST` movement (no quantity change, only cost). Audited.
8. **Negative stock** (after a stocktake says "you only have 0.2kg" but the system thought 1kg): allowed transiently inside a stocktake completion (the ADJUST clamps to physical), but normal CONSUME path rejects.

## 8. What this refactor explicitly *does not* solve

To prevent scope creep:

- **Multi-supplier purchase tracking** — Purchase has a free-text supplier note. Structured suppliers are out of scope.
- **Recipe-level cost projection** — "what will plov cost if I switch suppliers" requires a what-if engine. Out of scope.
- **Yield variations** — "this batch of plov made 30 portions but should have made 32" requires batch-level production tracking. Out of scope; variance loop catches systemic drift instead.
- **Multiple units of measure beyond buy+recipe** — out of scope (PRD-recommended buy+recipe is the chosen model).
- **Cross-location ingredient transfer** — single-location v1.
- **Tax / accounting export** — the immutable ledger supports this *eventually*, but no exporter is built here.
- **Per-shift variance attribution** — the day's variance is the day's variance, not per-shift. If owners want shift accountability, that's a follow-up.

## 9. Effect on existing PRDs

| PRD | Effect |
|---|---|
| 01 — Order/ticket terminal-state | **Still valid.** Cascade rule applies to ingredient RESTORE: only PENDING-or-null tickets restore consumption. |
| 02 — DB strategy | **Confirmed.** SQLite stays. All new schema is SQLite-compatible. |
| 03 — Print pipeline | **Independent.** No effect. |
| 04 — Server/UI separation | **Independent.** No effect. |
| 05 — Walkout & cancel accounting | **Subsumed in part.** Cooked-waste loss is now valued at real COGS via the snapshot, not at subtotal proxy. The PRD's "three loss columns" still apply; the inputs become exact. |
| 06 — Debt reconciliation | **Independent.** Accrual basis unchanged. |
| 07 — Stock model refinement | **Superseded.** This refactor is the replacement. Mark PRD 07 status: `Rejected — superseded by REFACTOR_PLAN`. |
| 08 — Service charge clawback | **Independent.** No effect. |
| 09 — Print throughput | **Independent.** No effect. |
| 10 — Backup & DR | **More important.** Ingredient ledger is the audit-critical data. Backup cadence and verification are unchanged but the loss-of-data cost grows. |
| 11 — Auto-update | **Independent.** No effect. |
| 12 — Network partition | **Independent.** The ingredient-availability rejection on `addLine` is one of the actions queued in PRD 12 Phase 2. |

## 10. What to confirm before Phase 0 begins

These are the last items to lock with the human before schema migrations land. Defaults proposed; confirm or override:

1. **Variance threshold default** for ingredients: 5% suggested; per-ingredient override available. Confirm 5%.
2. **`varianceLoss` vs `cogs`** in the daily P&L: currently the recipe-error variance is added to COGS; theft/count-error/restock-not-recorded variance is reported separately as `VarianceLoss`. Confirm this mapping.
3. **Initial cost for self-menu-item ingredients (Coke etc.)**: weighted-avg cost initialised from the first Purchase. Until the first purchase is recorded, cost is 0 — and any orders during that window have `cogsSnapshot = 0`. Either: (a) accept this and force Phase 5 to require at least one purchase per ingredient before activation; or (b) allow owner to seed an initial cost manually at ingredient creation. Recommend (a).
4. **Reason codes set** for variance: `waste / theft / recipe-error / restock-not-recorded / count-error` — confirm exact list and Uzbek labels.
5. **Daily Telegram payload** for owner: confirm fields and order (Revenue, COGS, Margin, OpEx, Overhead, Net, Variance loss, Waste loss, Top-3 variance ingredients).
6. **Recipe-completeness gate**: once a recipe is `isComplete = true`, admin edits write `RecipeEdit` rows but the recipe stays active. Should owner need to re-approve on edit? Recommend no for v1 (operational reality), revisit if drift becomes a problem.
