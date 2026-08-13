# Chayxana POS — PRD foundation: inventory · finance · calculations · UI/UX

**Status:** input document. A complete PRD is to be generated from this — this file is not itself the PRD.
**Baseline:** commit `e8af3bf` (tag `v0.1.3`), plus the uncommitted F-5 fix in `audit.repo.ts`.
**Sources:** `CURRENT_WORKFLOW.md` (verified behaviour), `AUDIT_FINDINGS.md` (145 findings),
`POS_STANDARDS.md` (rubric IDs). Claims marked ✓ were re-read from source while writing this file.
**§1 additionally reflects the operator model confirmed with the owner on 2026-08-04** — how this
chayxana actually cooks and sells. Where the audit and the operator model disagree, the operator
model wins: this is a small countryside chayxana, not a chain.

**How to use this.** Each area below has the same shape: **how it really works / baseline**, **defects**
(finding ID + file:line), **requirements** (numbered `INV-*`, `FIN-*`, `CALC-*`, `UX-*` — the PRD should
expand each into scope, acceptance criteria and UI), and **open decisions** (business calls a PRD
cannot make on its own).

§5 lists cross-area sequencing. **§7 is the session status — start there if you are picking this up
cold.** **§8 lists what must not change** — read it before the PRD proposes any "cleanup" of the
finance formulas.

---

## 0. The frame

These four areas are one problem seen from four sides. A single number — the cost of a plate of plov —
is computed in inventory, consumed by finance, displayed by calculations, and read by a human through
the UI. Today it is wrong at step one (`F-11`), invisible at step two for walkouts (`C-6`), rendered
under two different labels at step three (`M-14`), and printed at 10px in a 2.56:1 grey at step four
(`M-44`, `M-45`). Fixing any one alone leaves the owner with the same wrong answer.

The audit's §1 finding sits underneath all four: **there are no detective controls.** Nothing can tell
you that inventory, cash and the ledger disagree — because there is no cash count (`C-4`), no stocktake
(`C-11`), no shift boundary (`C-17`) and no invariant checker. Every requirement that adds a
*reconciliation point* is worth more than one that fixes a formula, because a formula fix is invisible
the next time it drifts.

**The operating constraint for this business:** the admin is not an inventory professional and will
not sustain a workflow that costs them daily effort with no visible return. Anything that demands
discipline must give something back on the same screen. Anything the system cannot know, it must say
it cannot know — a confident wrong number is what makes an operator stop trusting the product.

---

## 1. Inventory

### 1.0 Governing rules

**Set with the owner, 2026-08-04. These outrank everything else in §1.** Any requirement, screen or
audit finding below that conflicts with a rule loses. They exist because the current system has too
many units, too many half-built features and too many layers for one admin to operate correctly —
and an admin who operates it incorrectly blames the product.

| # | Rule | What it removes |
|---|---|---|
| **R1** | **Three units, only ever three: `kg` · `litr` · `dona`.** Nothing else is offered anywhere, and nobody ever types a conversion factor. A 5-litre oil bottle is *5 litr*; a sack of rice is *50 kg* | The two-unit model (`buyUnit` + `recipeUnit` + `conversionFactor`) as anything a human has to think about |
| **R2** | **Track only the expensive few. Not-tracked is the default.** Go'sht, guruch, yog', un — bulk items that cost real money. **Target: under 15 tracked ingredients in the whole system.** Tuz, murch, ziravor, choy are never created as ingredients at all | Endless ingredient lists and a 40-line bazaar screen. **Also most of the unit problem** — awkward units (bog', packet, bottle) belong to cheap things R2 excludes, so what remains is naturally kg and litr |
| **R3** | **Money going out has exactly two kinds, and they never share a screen or a total.** **Xarid** becomes food and is consumed as COGS; **Xarajat** (ijara, oylik, gaz, svet) is expensed immediately | Mixed expense lists, and the two cards both labelled "Jami chiqim" showing different numbers (`M-14`, `M-21`) |
| **R4** | **One ingredient, one name, one row.** "Go'sht" is a single thing used by every dish that needs it | Per-dish scoping, which makes the storeroom impossible to count |
| **R5** | **The bazaar is one screen, one save, always itemised.** Quantity + total paid per line; unit price is derived, never typed. Never one form per item, never a lump sum | 8 form submissions per trip, and the unverifiable "bozor: 1 200 000" |
| **R6** | **Every menu item has a tan narx. No exceptions, no zeros.** From a recipe, a batch, or typed. If unknown, the screen says *"tan narxi kiritilmagan"* — never 0, never 100% margin, never "10000 porsiya" | Every silently-wrong profit number in the product |
| **R7** | **A feature appears in the UI only if it works.** Stocktake stubs that throw, a Chegirmalar page that enforces nothing, combos with no price, no-op reorder arrows, a "Farq chegarasi" setting for a screen that does not exist — each is built or removed | The unorganised-features problem. **This is a deletion task, not a build task** |

**Explicitly rejected: a per-dish "qolgan mahsulotlar" top-up.** It was considered as a way to make
partial recipes add up and was struck — it is another number to maintain. **Consequence, to be stated
in the UI rather than hidden:** recipe-derived tan narx covers only the tracked ingredients and
therefore runs slightly low, so foyda runs slightly high, consistently and in one direction. Under R2
the omitted items are cheap by construction, so the gap is small. Label it — *"tan narx — asosiy
mahsulotlar"* — and do not reintroduce a field to close it.

**What R1–R7 leave.** The entire inventory surface becomes four screens over roughly twelve rows:

| Screen | Contents | Frequency |
|---|---|---|
| **Ombor** | ~12 ingredients: stock + last price | rarely edited |
| **Bozor** | those same ~12 lines, price pre-filled, type quantities, one save | daily, ~30 seconds |
| **Sanoq** | those same ~12 lines, type what was counted | weekly; replaces the notebook column |
| **Menyu** | dish + sotuv narx + tan narx; a recipe on only the few dishes that need one | when the menu changes |

**Open check on R2:** the design holds comfortably at 10–20 tracked ingredients. At 40+ the Bozor and
Sanoq screens need a different shape, so the real count should be confirmed before building them.

### 1.1 How the business actually works

Confirmed with the owner. **There are four menu item types: three kinds of food, plus service.** The
difference between the food kinds is **what the operator wants back**, not what the software can
compute:

| # | Type | What the operator wants | Examples | Today's mode |
|---|---|---|---|---|
| **1** | **Ingredient-tracked meal** | **How much is left, and when to buy.** Cost is a by-product, *not* the goal | plov, lagmon, qiyma | `COMPOSITE` |
| **2** | **Counted meal** — a pot cooked in the morning, counted down through the day | **How many portions remain**, at a known tan narx | shurpa, manti, somsa | `SIMPLE` |
| **3** | **Product** — bought ready, sold as-is, never counted | Nothing but **tan narx and sotuv narx** | non, suv, Pepsi | `UNTRACKED` |
| **4** | **Service** — not food. The xizmat haqi line the waiter adds like an item | Nothing tracked. Waiter income | xizmat haqi | `SERVICE` |

`MenuItemKind` in the database has only two values, `FOOD | SERVICE`. Types 1–3 all live under `FOOD`;
type 4 never consumes stock, is excluded from the subtotal, is added as the service charge, and is
never discounted. Everything in this section concerns types 1–3 — **type 4 has no inventory dimension
at all** and is documented here only so the type model is complete.

**Combo is not a fifth type.** `Combo` has no price and no cost — it is a named bundle that expands
into ordinary order lines when the waiter taps it, and every component is still one of types 1–3. It
sits on top of this model without changing it. *(Separately, the audit notes combos have no price and
the builder shows no money at all — a UI problem, not a costing-model problem.)*

The existing three FOOD create-modes already match this model. **Nothing structural is wrong.** Each
mode is missing the one thing that makes it worth using.

#### Operating facts

Confirmed with the owner. Each one constrains the design more than any audit finding does:

| Fact | Consequence |
|---|---|
| **Ingredients are bought daily at the bazaar, in cash, usually with no receipt** | Purchase entry is a **daily** task, not an occasional one. If it takes more than ~30 seconds it will not happen — and every downstream number depends on it. Prices also move daily, so a typed cost goes stale in weeks, not months |
| **The buyer takes "what's needed" and reports the spend afterwards** | Bazaar spending is **self-reported with no independent record**. This is the single largest cash outflow in the business and the least verifiable thing in it |
| **One admin/manager does all data entry** | Screens must be simple, forgiving and reversible — and the person entering the data is the same person the shrinkage check has to cover |
| **A paper notebook already holds: daily sales/cash · bazaar spend · qarzlar · stock counts** | Three of the four already have a software equivalent. **Stock count is the missing one** — so Sanoq (`INV-14`) is not new behaviour being imposed, it is the last quarter of a process they already run |
| **Nothing is batch-prepared across dishes** | **No sub-recipes.** Every dish lists raw ingredients directly. Settled — do not build semi-finished products |
| **What they want: catch shrinkage · know real profit · stop running out mid-service** | Three different goals served by three different features. The PRD must not collapse them into one |
| **Where they think shrinkage is: bazaar money, and "the numbers just don't add up"** | **Not** the waiter/void path the audit's §1 leads with. The suspicion is on the *purchase* side and on reconciliation generally |

#### The loop the owner is actually asking for

Their three goals resolve into one closed loop. Every piece of it exists in the schema today except
the last step — which is the column they already keep on paper:

```
   Money out (bazaar, cash, self-reported)
        ↓
   Goods in          ← Purchase, itemised: quantity AND unit price
        ↓
   Goods consumed    ← recipes × sales (FIFO peel, already correct)
        ↓
   Goods expected to remain
        ↓
   Goods actually counted   ← Sanoq — the missing step
        ↓
      FARQ
```

**A lump-sum bazaar entry breaks this loop at step one.** "Bozor: 1 200 000 so'm" can never be
verified by anything. Itemised entry — go'sht 10 kg @ 90 000 — makes the spend checkable three
separate ways: against price history, against what physically arrived, and against what the recipes
say should have been consumed. **Itemisation is not bookkeeping neatness here; it is the entire
control.**

#### Who watches the buyer

The admin enters the purchases *and* would perform the count. A control they operate alone cannot
reassure the owner about them. Three things close that gap cheaply, and none requires the owner to
learn the system:

1. **Last price is pre-filled** on the bazaar screen, so a price increase is a deliberate overwrite
   rather than a blank field — visible, and cheap to flag.
2. **Price history per ingredient** — `go'sht: 88 · 90 · 89 · 91 · 120 ←` reads at a glance and needs
   no accounting knowledge.
3. **Same-day Telegram to the owner** with the itemised trip. The admin enters it; the owner sees it
   without having to ask, from anywhere. The alert channel already exists.

**The single most important correction to the previous framing:** for kind 1 the operator tracks
ingredients **to know the amount, not the money**. COGS is a welcome side-effect. This inverts the
priority — portions-remaining and low-stock are the product; costing accuracy is secondary and only
needs to be roughly right, because the cook eyeballs quantities anyway.

### 1.2 Why kind 1 is not kept up to date

The owner's report is that ingredient tracking "leads so much todo" and is not used properly. That is
not a discipline problem. **The payoff was never built:**

- `yieldService.computeAll` computes portions-remaining for every dish — and it is **shown on no admin
  screen** ✓ (`yield.service.ts:21`).
- `yieldService.effectivelyAvailable`, the one helper that would gate a sale on stock, has **zero
  callers** ✓ (`yield.service.ts:93`).
- There is **no low-stock view anywhere in the admin UI** — no threshold, highlight, sort or filter on
  any stock number (`M-73`). The Telegram bot has a proper sorted low-stock report; no screen does.
- `isAvailable` is **never enforced server-side**; `Errors.ItemUnavailable` has zero throw sites (`#7`).

So the operator does the work — defines ingredients, enters recipes, records purchases — and gets back
nothing, **not even a block on selling plov when there is no meat**, which is the entire purpose of
tracking amounts. Effort in, nothing out.

**This is the root cause for kind 1, and most of the fix is wiring up code that already exists.**

### 1.3 Baseline mechanics

A batch is one `Purchase` row, created with `remainingQty = quantityRecipeUnit`. Peel is oldest-active
-first (FIFO) and is the sole COGS authority; restore is LIFO over the peel ledger at frozen original
prices, so past COGS is never restated. **Stock moves at line-add time**, not at `send` or `confirm`.
Everything downstream of purchase is denominated in `recipeUnit`:

```
quantityRecipeUnit    = quantityBuyUnit × conversionFactor
unitCostPerRecipeUnit = totalCostUzs / quantityRecipeUnit
```

`UNIT_PRESETS` offers exactly three: `dona`(×1), `kg`→gramm(×1000), `l`→ml(×1000) ✓
(`menu.service.ts:99-103`).

**Core invariant:** `Ingredient.currentStock == Σ Purchase.remainingQty WHERE status='ACTIVE'`.
Nothing checks it.

**Already in the schema, never wired up** — this materially lowers the cost of the work below:

| Asset | State |
|---|---|
| `Stocktake` / `StocktakeEntry` / `WasteEvent` models | ✓ Complete, with `expectedQty`, `countedQty`, `variance`, `reasonCode`, `valuedAtCost`. **Services throw; no migration needed to build counting** |
| `IngredientMovementType` | ✓ Already has `STOCKTAKE`, `WASTE`, `ADJUST`, `COST_ADJUST` — all currently unwritten |
| `MenuItem.unitCostSnapshot` | ✓ Exists, commented *"per-portion cost used to populate cogsSnapshot at sale time"* — **exactly kind 3's missing feature.** Never written, never read |
| Ingredient sharing across dishes | ✓ Permitted by the schema and by the FIFO peel. Blocked **only** by a 12-line application guard at `recipe.service.ts:79-91`. **No migration needed to pool** |

### 1.4 Defects, by kind

**Kind 1 — ingredient-tracked meal**

| ID | What | Evidence |
|---|---|---|
| `M-73`, `#7` | **The payoff is missing** — no portions-remaining, no low-stock view, no server-side availability enforcement. See §1.2 | `yield.service.ts:21,93` ✓ · `IngredientsPage.tsx:174-179` |
| — | **One ingredient per dish.** `Ingredient.parentMenuItemId` is required and `recipe.service.ts:79-91` rejects any ingredient belonging to another item ✓, so "piyoz for plov" and "piyoz for qiyma" are separate stock. A 50kg sack cannot be entered sensibly and **the storeroom cannot be counted** | `recipe.service.ts:79-91` ✓ · `schema.prisma` `@@unique([parentMenuItemId, name])` |
| `C-18` | **Recipe activation governs nothing.** ✓ `planConsumption` keys only on `recipe.ingredients.length > 0` and never reads `isComplete`. A recipe saved with placeholder quantities peels real stock at the next sale | `consumption.service.ts:40-48` ✓ |
| `C-11` | **No recount.** Stocktake and waste are stubs whose every method throws; no routes; `setCurrentStock` has zero call sites. Kind 1 drifts by nature — the cook eyeballs quantities — and there is no way to correct it. **The UI advertises the missing feature twice** | `stocktake.service.ts:14-36` · `waste.service.ts:19-23` · `IngredientsPage.tsx:315-319` |
| `M-74` | `conversionFactor` / `recipeUnit` stay editable after batches exist. Changing kg→g to 1 makes every later purchase add 1/1000th of the stock it should | `ingredient.service.ts:158-161` |

**Kind 2 — counted meal**

| ID | What | Evidence |
|---|---|---|
| `F-11` | **kg/litr in this mode understates COGS ~1000× and makes the count meaningless.** Kind 2 means "1 sale = 1 portion", which is coherent **only for `dona`**. There is no field anywhere asking how many grams a portion is. Stock enters as `qty × 1000` (10 kg → 10 000 gramm) but the peel asks for a bare portion count ✓ `needed: new Prisma.Decimal(portions)` — so one sale removes 1 gramm. The pot never empties, `OUT_OF_STOCK` never fires, the yield badge reads "10000 porsiya", and the dish books ~100% margin forever | `consumption.service.ts:56` ✓ · `menu.service.ts:101` ✓ · `yield.service.ts:66-72` ✓ |
| — | **No daily-batch entry point.** The morning pot is recorded through a generic purchase form, not "bugun nechta qildim, qanchaga tushdi" | `PurchasesPage.tsx` |
| — | **No leftover write-off.** Unsold portions at end of day stay in stock and are silently sold as tomorrow's first FIFO batch, or quietly vanish. `WasteEvent` exists for exactly this and is unbuilt | `waste.service.ts:19-23` |

**Kind 3 — product**

| ID | What | Evidence |
|---|---|---|
| `M-64` | **Books zero COGS.** The dish consumes real goods and reports 100% margin, quietly inflating daily foyda. The mode picker never says so — and it is the only mode requiring no extra fields, so it is the path of least resistance | `menu.service.ts:212-214` · `MenuPage.tsx:957-960` |

**All kinds**

| ID | What | Evidence |
|---|---|---|
| — | **The type is never stored, so a dish can silently change type.** ✓ `CreateItemMode` is a create-time-only discriminator that is never saved; at sale time the type is re-derived — *recipe with ingredients?* → 1, *else self-ingredient?* → 2, *else nothing consumed, zero cost* → 3. Empty a type-1 recipe, or deactivate its last ingredient, and that plov becomes a **zero-cost type-3 item** with no warning, no audit row and no visible change on the menu. It books 100% margin from that moment. Nothing in the system can distinguish "deliberately untracked" from "lost its recipe" | `consumption.service.ts:40-58` ✓ · `menu.service.ts:113` ✓ |
| `#6` | **`restoreToBatch` has no status check** (its own docstring admits it) while `peelAtomic` correctly guards on ACTIVE. Restoring into a soft-deleted batch permanently inflates `currentStock` above `Σ ACTIVE remainingQty` → phantom sellable stock, then spurious `OUT_OF_STOCK`. **Breaks the core invariant with no repair path** | `purchase.repo.ts:128-133` |
| `C-5` | Scheduler **hard-deletes** stale DRAFTs every 6h, cascading order lines *and* the FIFO consumption ledger, without restoring stock or writing an audit row | `scheduler.ts:7-22` |
| `C-15` | A line-cancel on a **SENT** order restores stock as though the food was never made — the inventory half of the fraud gap. Deliberate (commit `000e540`), but it is what makes a void invisible | `order.service.ts:477` |
| `M-65` | Create-mode is unchangeable, there is no DELETE route for menu items, and → kind 2 is impossible because no UI creates a self-ingredient. Only fix is deactivate-and-recreate; no unique name constraint, so both rows coexist | `MenuPage.tsx:491-493` |

### 1.5 Requirements

**Costing — no dish without a cost basis**

- **INV-1 · Every menu item must have a cost basis, and no creation path may produce one without.**
  Kind 1 from its recipe, kind 2 from its batch, kind 3 from a typed tan narx. Kind 3 writes
  `MenuItem.unitCostSnapshot` (field exists; no migration). **This single rule is what makes foyda
  trustworthy again and is the cheapest item in this document.** *(fixes `M-64`; removes the
  confident-wrong-margin symptom of `F-11`)*
- **INV-2 · Where the system cannot know a cost, it must say so** — "tan narxi kiritilmagan", never a
  silent zero and never an implied 100% margin.

**The three kinds, named in the operator's language**

- **INV-3 · The create picker asks a question the operator can answer** — "Mahsulotlardan pishiraman" /
  "Pishiraman, porsiyasini sanayman" / "Tayyor sotaman, sanamayman" — not `COMPOSITE` / `SIMPLE` /
  `UNTRACKED`.
- **INV-4 · Type is changeable after creation.** Today create-mode is permanent and the only workaround
  is deactivate-and-recreate, which leaves two rows with the same name. **Requires INV-20.**
  *(fixes `M-65`)*
- **INV-5 · Types 2 and 3 are one mechanism with counting on or off.** Both are "one dish, one tan
  narx"; the only difference is whether a number is tracked. Build once, present as two choices, so
  "start counting Pepsi" is a toggle rather than a rebuild.
- **INV-20 · The type must be stored on `MenuItem`, not inferred at sale time.** The system must know
  what a dish is *supposed* to be, so that losing a recipe raises "bu taom retseptsiz qoldi" instead of
  silently deciding the food is free. This is the precondition for INV-4 (you cannot change a type that
  was never recorded) and the fix for the silent-drift defect in §1.4. **This is the first inventory
  requirement that needs a schema migration** — one column plus a backfill inferring the current type
  for existing rows. Everything else in §1.5 up to this point is application-level only.

**Kind 2 — the morning pot**

- **INV-6 · Kind 2 counts in portions only.** Remove `kg` and `l` from this mode; weight-sold food is
  kind 1, which has a per-portion quantity field. This deletes `F-11` rather than patching its
  arithmetic. *(fixes `F-11`)*
- **INV-7 · The pot is the batch.** One entry per dish per day — "Bugun nechta qildingiz? Qanchaga
  tushdi?" — which counts down as portions sell, shows portions remaining, and blocks the dish at zero.
  Tan narx per portion falls out of the batch. The existing batch model already does this; the entry
  point must be reframed from a generic purchase form.
- **INV-8 · Leftovers are written off, not carried silently.** An end-of-day "nechta qoldi" write-off
  posts a `WasteEvent` (model exists) and values the loss. Without this the pot never closes honestly
  and yesterday's food becomes tomorrow's invisible FIFO batch.

**Kind 1 — make the effort pay back**

- **INV-9 · Portions-remaining must be visible on the admin menu screen.** `yieldService.computeAll`
  already computes it. *(fixes half of `M-73`)*
- **INV-10 · Low stock must warn before it runs out**, per ingredient, against a threshold set once.
  Parity with what the Telegram bot already does. *(fixes `M-73`)*
- **INV-11 · Availability must be enforced server-side** — ingredients gone means the dish cannot be
  sold, not merely greyed out on one client. *(fixes `#7`)*
- **INV-12 · One ingredient row, shared across every dish that uses it.** Remove the guard at
  `recipe.service.ts:79-91` and let the recipe builder attach an existing ingredient;
  `parentMenuItemId` degrades to "where it was first created". **No migration.** This is the
  prerequisite for INV-13 — a storeroom sliced up by dish cannot be counted.
- **INV-13 · Consumption is gated on recipe completeness**, and an incomplete recipe blocks the sale
  rather than shipping food at zero cost. *(fixes `C-18`)*

**Correction and integrity**

- **INV-14 · "Sanoq" — a per-ingredient recount, in under ten seconds.** Open the ingredient, type
  what is actually in the storeroom, pick a reason from a short list (*Buzildi · To'kildi · Xato
  hisoblangan · Bilmayman*), done. Writes `StocktakeEntry` + `STOCKTAKE` movement + audit row; models
  exist, **no migration**. Not a formal open/count/close session — that will never be finished.
  Two rules make it trustworthy rather than a loophole: **the variance is valued in so'm and lands in
  the P&L**, and **"Bilmayman" is an allowed reason** (a forced reason produces false data).
  *(fixes `C-11`; the only repair path for `#6` and `M-74`)*
- **INV-15 · Restores must respect batch status** — `restoreToBatch` guards on ACTIVE like
  `peelAtomic`; a restore into a dead batch needs a defined destination, not a silent inflation.
  *(fixes `#6`)*
- **INV-16 · The core invariant must be checked on a schedule** and reported to the admin — every
  `Ingredient` where `currentStock ≠ Σ ACTIVE remainingQty`. Only actionable once INV-14 exists.
  *(detective control — see §0)*
- **INV-17 · Nothing may hard-delete a row carrying stock history.** Stale drafts get cancelled +
  restored + audited. *(fixes `C-5`)*
- **INV-18 · Unit-defining fields lock once batches exist**, or changing them migrates existing stock.
  `countUsages` already exists and already backs this kind of gate elsewhere. *(fixes `M-74`)*

**The bazaar trip — the daily workflow everything else depends on**

- **INV-21 · One entry per trip, not one per ingredient.** ✓ `purchaseService.record` takes a single
  `ingredientId`, so an 8-item bazaar trip is 8 separate form submissions today. Replace with one
  screen listing the regular ingredients, **last price pre-filled** (`weightedAvgCost` already holds
  the most recent purchase cost — no new data needed), where the admin types quantities and saves
  once. Each line still writes a normal `Purchase` + `Expense` underneath, so nothing downstream
  changes. **This is the highest-frequency screen in the product and currently the slowest.**
  *(`purchase.service.ts:73` ✓)*
- **INV-22 · Itemised, never lump-sum.** A bazaar entry records quantity and unit price per
  ingredient. A single "bozor: 1 200 000" figure is unverifiable by any downstream check and must not
  be an available option — see the loop in §1.1.
- **INV-23 · Price history and an anomaly flag per ingredient.** Show the recent unit prices inline;
  flag a purchase that deviates materially from them. With INV-21's pre-fill this is nearly free, and
  it is the most legible control available to an owner who does not read reports.
- **INV-24 · Bazaar spend reaches the owner independently of the admin** — same-day Telegram with the
  itemised trip and total. The existing large-expense alert is the channel.
- **INV-25 · Sanoq variance is reported to the owner, not merely recorded.** The admin both enters
  purchases and performs the count; a count that silently reconciles a discrepancy defeats the purpose
  of counting. Counts are append-only, carry the actor, and the valued variance goes to the owner.

**Existing bad data**

- **INV-19 · Find and fix what was already created wrong.** A one-time report of every kind-2 dish
  created in kg/litr — each has been booking ~100% margin since creation — with a guided path to
  re-create it as kind 1 or as a portion-counted dish. Shipping INV-6 alone stops new damage but
  leaves the existing dishes lying.

### 1.6 Deliberately out of scope

Each of these adds daily data entry the operator will not sustain, and half-entered data is worse than
none: supplier management, purchase orders, par levels and auto-reorder, formal stocktake sessions with
approval workflow, expiry-date tracking, per-plate weight precision on cooked food, multi-location.

### 1.7 The accepted trade-off

Pooled ingredients plus typed tan narx means **COGS is approximate**. The profit number becomes "about
right and always the same shape" instead of "precise and silently wrong". For this business that is the
correct trade, and the PRD should state it as a deliberate decision rather than let it look like an
accuracy regression.

### 1.8 Open decisions

1. **Tan narx staleness (kind 3).** A typed cost goes stale when supplier prices rise. Nudge after N
   months, or derive from purchases where they exist? Recommend the nudge — deriving reintroduces the
   data entry the mode exists to avoid.
2. **Kind 2 leftovers.** Does yesterday's remaining pot get sold today (FIFO handles it correctly), or
   is it always binned? If usually binned, INV-8's write-off should default to the full remainder.
3. **Sanoq variance in the P&L** — a separate expense line, or folded into COGS? A separate line makes
   shrinkage visible, which is the point of counting at all.
4. **Existing miscreated dishes (INV-19)** — restate history or fix forward only? FIFO's "honest
   history" principle argues for forward only.

### 1.9 Schema decisions — working session, 2026-08-04

Worked through in conversation with the developer. **Settled** items are confirmed and should be
treated like `R1–R7`. **Open** items are the ones a PRD cannot be written without.

#### Settled

**S-1 · Units belong to the ingredient, never to the dish.** A menu item has no unit — food is sold
per **porsiya**, always. Price and tan narx are per portion. Only `Ingredient` carries a unit.

**S-2 · `IngredientUnit` is a closed, immutable enum of exactly three values.**

```prisma
enum IngredientUnit { KG  LITR  DONA }

model Ingredient {
  unit  IngredientUnit   // set at creation, never updatable
  // buyUnit, recipeUnit, conversionFactor — all removed
}
```

Three string columns plus a human-typed number collapse into one enum. The ledger scale lives in
code as a constant, not as data:

| `unit` | operator types | ledger stores | factor |
|---|---|---|---|
| `KG` | kg | gramm | ×1000 |
| `LITR` | litr | ml | ×1000 |
| `DONA` | dona | dona | ×1 |

Enforcement must hold at **four** points or it is not a constraint: the enum column itself; `unit`
absent from every update schema; `z.nativeEnum` on `POST /api/ingredients` — today it accepts
free-text `buyUnit`/`recipeUnit` and any positive `conversionFactor` (`ingredient.controller.ts:15-18`);
and IngredientsPage's free-text `<Input>`s replaced by the three-option picker MenuPage already uses
(`IngredientsPage.tsx:294,298,308`). Those two paths have already drifted — `UNIT_PRESETS` writes
`gramm`, IngredientsPage defaults to `g`.

*This deletes `M-74` outright* — no editable conversion factor is left to corrupt — and `INV-18`
collapses from "lock once batches exist" to "never editable".

**S-3 · Quantities are decimal; the ledger stays integral.** Every quantity is already
`Prisma.Decimal` end to end (`step="0.001"` on purchases and recipes, `step="any"` on menu-create),
so decimals need no work. Keep the internal ×1000: the operator types `1.5 kg`, the ledger holds
`1500` gramm — exact. Storing kg directly would make every peel a float subtraction (Prisma `Decimal`
maps to a SQLite NUMERIC column, stored as REAL when fractional), so 100 sales of 0.2 kg can settle
at `1.7e-15` rather than `0`; `findActiveBatchesForIngredient` filters `remainingQty > 0`, so that
batch would linger forever holding dust and `INV-16`'s invariant check would report drift that isn't
real. **`R1` is satisfied literally** — its wording is that the two-unit model stops being "anything
a human has to think about", not that it leaves the ledger.

**S-4 · Recipes are typed in the ledger unit.** Buy in kg, cook in gramm — `200 gramm guruch`, not
`0.2 kg guruch`. The code already works this way (`MenuPage.tsx:587-588`). Each row states its own
unit: `Guruch — [200] gramm/porsiya`.

**S-5 · Cost is typed exactly once, at creation, then always derived.** The create form takes an
initial purchase (quantity + total paid); after that the unit price comes only from real purchases.
A dish with no purchase shows *"tan narxi kiritilmagan"*, never a zero (`R6`, `INV-2`). **Stock is
never edited directly** — `setCurrentStock` has zero callers and must keep them; a wrong number is
corrected through Sanoq, which records the actor and values the variance. Direct editing would be
the loophole that makes counting pointless.

**S-6 · The four verbs map to four screens.** This is the answer to "how do they add, edit or renew
a quantity after creating the dish":

| Verb | Screen | Frequency |
|---|---|---|
| **Add** an ingredient to a dish | the dish's own screen — type a new row | when the recipe changes |
| **Edit** per-portion quantity | same screen — 150 → 170 gramm | rarely |
| **Renew the quantity** (bought more) | **Bozor** — every ingredient listed, last price pre-filled, one save | **daily, ~30 s** |
| **Fix a wrong stock number** | **Sanoq** — type what was counted | weekly |
| **Change the cost** | never typed — derived from the next purchase | — |

#### Proposed, not yet confirmed

**P-1 · `MenuItem.tracking` enum.** `RECIPE | BATCH | PRODUCT | SERVICE`, stored not inferred
(`INV-20`), backfilled from the existing sale-time inference. `MenuItemKind` stays untouched —
`billing.service.ts` keys the whole subtotal/service-charge split on it and that split is correct.

#### Open — a PRD cannot be written without these

**O-1 · Pooled storeroom vs per-dish ingredients. ⚠ CONFLICTS WITH `R4`.**
The developer stated a preference on 2026-08-04 for **separated ingredients, one set per food item**
— i.e. the current model — on user-friendliness grounds: the operator types name + quantity + cost
inline while creating the dish, and a shared storeroom reads as a second concept to manage.
**Not resolved.** The counter-argument, recorded so nobody rediscovers it:

- **The authoring flow is identical under both models.** Recognition-on-type — *"Go'sht — omborda
  bor: 9.5 kg, oxirgi narx 100 000/kg. Shuni ishlatamizmi?"* — gives inline typing with one row
  underneath. The operator never sees the word "storeroom".
- **They diverge at the two daily screens, not at creation.** One 10 kg bag of meat has to be split
  across `Go'sht (plov)` / `Go'sht (shurpa)` / `Go'sht (somsa)` by hand, every day, with no correct
  answer — and the 9.1 kg later weighed at Sanoq must be divided the same invented way, so the farq
  is arithmetic rather than a measurement.
- **Mid-service failure:** plov's go'sht row hits zero and blocks plov sales while 6 kg sits on the
  shelf under shurpa's row.
- `R4` was set with the owner and is the prerequisite for `INV-12 → INV-14 → INV-16 → FIN-12`, the
  chain that answers "raqamlar to'g'ri kelmayapti".

**If separation is chosen, `INV-14` (Sanoq), `INV-16` (invariant check) and `FIN-12` (the daily farq
line) leave scope, and the PRD must say so explicitly.** If the real driver is that plov's meat is a
different *thing* from shurpa's, the answer is distinct names (`Mol go'shti` / `Qo'y go'shti`), not
per-dish scoping — one row per thing you buy and store, not one per dish that mentions it.

**O-2 · Where does a `PRODUCT` purchase land?** Buying 24 Pepsi for 240 000: as **Xarajat** it hits
the P&L today and booking COGS at sale double-counts it; as **Xarid** with the dish booking zero COGS
it is `M-64`'s 100%-margin lie. *Recommendation:* **Xarid** — cash out, excluded from operating —
with the dish booking `COGS = unitCostSnapshot × qty` at sale, so the unsold remainder is correctly
deferred cost. To stop the typed tan narx going stale, **the purchase form offers its own derived
unit price as the new tan narx**: 240 000 ÷ 24 → *"tan narxni 10 000 ga yangilaymi?"*. That also
answers §1.8 decision 1 better than a nudge — derive-with-confirmation, neither blind nor late.

**O-3 · Does stock leave at cook time or at sale time?** Surfaced by the plov walkthrough (§1.10) and
**the most consequential open item.** Plov is cooked in a kazan at 08:00, but the ledger peels only
when a waiter taps a line at 13:00 — so between those hours the storeroom is wrong by whatever is in
the kazan. Any count taken during service compares against a knowingly false number, and every farq
gets blamed on shrinkage.

| | Model | Cost |
|---|---|---|
| **B1** | `BATCH` inputs are never tracked ingredients; cost is typed | Simplest, but contradicts `R2` — shurpa's go'sht goes untracked |
| **B2** | The **morning production entry peels the ingredients** and creates the portion count; cost per portion = peeled COGS ÷ N | Storeroom is truthful at every hour; "qanchaga tushdi" becomes derived rather than self-reported. **One genuinely new concept: a production event** |
| **B3** | `BATCH` is portion-counting layered on a normal recipe; stock still peels per sale | Cheapest, but the storeroom shows go'sht on the shelf after the pot is already cooked |

*Recommendation: **B2**.* It is the only option where the storeroom is true at the moment somebody
would physically count it, and it collapses types 1 and 2 into one mechanism — both are pots, and
they differ only in whether the cost is derived from a recipe or typed. Note this contradicts §1.1's
filing of plov as type 1 and shurpa as type 2: **both are pots**, and the type distinction is about
cost basis, not about cooking.

**O-4 · Whole numbers for `DONA`?** `step="1"` on `DONA`, decimals only on `KG` / `LITR`. One line;
stops "2.5 dona non" at entry rather than in a report three weeks later. *Recommendation: yes.*

### 1.10 Worked example — plov, end to end

Built during the 2026-08-04 session to make the money flow concrete. Every number reconciles; keep it
that way if the model changes. Pure food chain — no ijara/oylik/gaz, per `R3`.

**Setup.** Tracked ingredients: Go'sht `KG`, Guruch `KG`, Sabzi `KG`, Yog' `LITR`. **Not** created as
ingredients at all (`R2`): piyoz, tuz, zira, ziravor. Recipe per porsiya: guruch 200 g · go'sht 150 g ·
sabzi 100 g · yog' 30 ml. `MenuItem` plov, `tracking = RECIPE`, price 35 000, no unit.

**1 — Bazaar (money out).** Type quantity + total paid; unit price derived.

| | qty | total paid | → ledger |
|---|---|---|---|
| Go'sht | 10 kg | 900 000 | 10 000 gramm @ **90**/g |
| Guruch | 20 kg | 300 000 | 20 000 gramm @ **15**/g |
| Sabzi | 10 kg | 60 000 | 10 000 gramm @ **6**/g |
| Yog' | 5 l | 120 000 | 5 000 ml @ **24**/ml |
| | | **1 380 000** | |

Per line: `Expense` (cat. `Mahsulot xaridi`) + `Purchase` batch (`remainingQty = quantityRecipeUnit`)
+ `currentStock +=` + `IngredientMovement(PURCHASE)` + `AuditLog`. **1 380 000 left the drawer; zero
hit the P&L.** An asset was bought, not a cost incurred.

**2 — What the system now knows for free.**
Tan narx `= 3 000 + 13 500 + 600 + 720 = ` **17 820** ("asosiy mahsulotlar" — piyoz and ziravor are
not in it, so it runs low in one direction, per §1.0).
Yield: guruch 100 · **go'sht 66 ← bottleneck** · sabzi 100 · yog' 166 → **"66 porsiya, go'sht tugaydi
birinchi."** `yieldService.computeAll` computes this today and shows it on no screen (`INV-9`).

**3 — The sale.** Stock moves at line-add, not at send or confirm. FIFO peels oldest-first, writing
`OrderLineBatchConsumption` (so a cancel restores to the *same* batch at the *same* price) +
`IngredientMovement(CONSUME)`, accumulating `OrderLine.cogsSnapshot = 17 820`.
40 portions → COGS **712 800**, revenue **1 400 000**.

**4 — The day's two books, and why they disagree.**

```
CASH                          P&L
in    1 400 000               netSales   1 400 000
out   1 380 000               COGS         712 800
─────────────────             operating          0   ← bazaar excluded (already in COGS)
drawer  +20 000               foyda        687 200
```

Both correct. The gap is food on the shelf: guruch 180 000 + go'sht 360 000 + sabzi 36 000 + yog'
91 200 = **667 200**, and it closes exactly:

```
1 380 000 − 712 800 = 667 200      (spent − consumed = still in store)
  687 200 −  20 000 = 667 200      (profit − drawer  = inventory added)
```

**This identity is almost certainly the owner's "raqamlar to'g'ri kelmayapti".** Buy a sack on Monday
and the till looks terrible while profit looks great; sell it down on Friday with no bazaar trip and
the reverse. Nothing is wrong, and nothing on any screen says so — `FIN-12` is exactly this line made
visible.

**5 — Day 2, price moves.** Go'sht now 100/g. Batches: A = 4 000 g @ 90, B = 10 000 g @ 100. Sell 30:

| portions | go'sht source | tan narx each |
|---|---|---|
| 1 – 26 | all from A @ 90 | 17 820 |
| 27 | 100 g from A + 50 g from B | 18 320 |
| 28 – 30 | all from B @ 100 | 19 320 |

Three tan narx values in one day, all correct; Monday's plov stays 17 820 forever. For a `RECIPE`
dish the tan narx is **not stored** — the menu screen shows an estimate at today's prices, the ledger
holds the truth per sale. `R6` is satisfied by *derivable*, not by *stored*.

**6 — Sanoq.** Ledger says 9 500 g of go'sht; the scale says 9 100 g. Farq −400 g, valued by peeling
FIFO (same engine, no new costing path) @ 100 = **40 000 so'm**. Reason codes *Buzildi · To'kildi ·
Xato hisoblangan · Bilmayman*; writes `StocktakeEntry` + `IngredientMovement(STOCKTAKE)` + audit;
visible in the P&L; sent to the owner.

---

## 2. Finance

### 2.1 Baseline

Canonical formulas live in `reports.service.ts → dailyLedger` — 13 parallel queries, all half-open
`Asia/Tashkent` windows:

```
netSales       = Σ subtotalSnapshot − Σ discountAmountSnapshot   (CLOSED orders, by closedAt)
cogs           = Σ OrderLine.cogsSnapshot                        (CLOSED orders only)
operating      = expenses EXCLUDING seed-cat-ingredients         (already counted via COGS)
profit         = netSales − cogs − operating
realCashIn     = orderCash + orderCard + debtRepaidCash + debtRepaidCard + expenseReturns
cashOut        = expenseGross − sameDayReversal                  ← NOT expenseNet
drawerMovement = realCashIn − cashOut
```

P&L and cash flow are **separate and both correct at the source**. Expenses are `ACTIVE → REVERSED`
plus a mirror `REVERSAL` row. Purchases are one event in two views (Xaridlar + Chiqimlar), linked by
`Expense.purchaseId`. Debts are created only from a CLOSED order with a DEBT leg; repayments are
append-only. Reports are OWNER-only; `/api/finance/daily` is the ADMIN-safe view.

### 2.2 Defects

**Missing reconciliation (the structural gap)**

| ID | What | Evidence |
|---|---|---|
| `C-4` | **No daily cashing-up.** Counted cash cannot be entered anywhere, so a till difference of any size is undetectable. No field, no route, no model | `schema.prisma:151-818` · `finance.routes.ts:11-12` |
| `C-17` | **No shift/smena concept** — no open, no close, no float, no point at which a day's takings become immutable. 30 models, none | `schema.prisma` |
| `C-7` | **Once CLOSED there is no correction mechanism** — no refund, void-sale, reopen or payment-method fix. Wrong tender is permanently wrong short of editing the DB by hand | `orders.routes.ts:10-24` |
| `M-26` | No retention policy defined or enforced; the only automated lifecycle rule is a hard delete | — |
| `M-25` | The only structured export is an aggregate XLSX reachable **only** through the owner's Telegram. No transaction-level export, nothing in the admin UI | `telegram-bot.service.ts:414-542` |

**Money that goes missing**

| ID | What | Evidence |
|---|---|---|
| `C-6` | **Walkout COGS is never recognised** — ✓ every COGS query filters `order: { status: CLOSED }`. Food cooked, served, eaten, and free | `reports.service.ts:473,1150` ✓ |
| `#3` | **Walkout loss is structurally always zero.** `applyTotals` has exactly one call site — inside `confirm` — so WALKOUT orders never get `totalSnapshot`; finance sums `?? 0`. The audit `amount` and the Telegram alert are `'0'` too. With `C-6`, a walkout is invisible on **both** sides of the P&L | `order.service.ts:804` · `finance.service.ts:119-122` |
| `F-6` | **Second DEBT leg is silently uncollectable.** `.find()` takes only the first DEBT payment and passes that to the debt ledger while `createMany` writes all legs. Revenue recognised in full, receivable recorded for one; nothing errors | `order.service.ts:673,707,711` |
| `F-7` | **Negative payment legs are accepted end to end** — no `.nonnegative()` on the amount schema, though the adjacent `discountAmount` has it. CASH +200 000 / CARD −100 000 on a 100 000 bill passes. A working mechanism to move money between tender types | `orders.controller.ts:52` |
| `M-1` | **Discount caps enforce nothing.** ✓ Only the preset-`discountId` path reads `max_discount_percent` / `max_discount_amount`; the ad-hoc path clamps at subtotal and never consults them. Any admin can comp 100% of food, and the whole Chegirmalar page is dead weight | `billing.service.ts:82-115` ✓ |
| `M-19` | Every cancelled order is attributed to the literal string `'system'`; `Order` has no `canceledById` | `reports.service.ts:408-415` |
| `M-20` | The range/Umumiy report — used for a month, quarter or tax period — omits walkouts and cancellations entirely | `reports.service.ts:824-1093` |

**Day-boundary and linkage**

| ID | What | Evidence |
|---|---|---|
| `M-66` | Purchase date defaults to **UTC**, 5h behind Tashkent. Any purchase saved 00:00–05:00 lands on the previous day — restating a closed day and expiring its own same-day reverse window instantly. Correct offset math sits four lines below | `PurchasesPage.tsx:57-59` |
| `M-67` | Editing a purchase date moves the Purchase but **not** its linked Expense, so Xaridlar and Chiqimlar permanently disagree about which day the money left | `purchase.service.ts:213-218` |
| `M-62` | Four call sites do day arithmetic in host time instead of Tashkent, incl. the expense-reverse button and every PDF timestamp | — |
| `M-6` | `/api/finance/daily` returns `pnl.profit` and per-dish cogs/profit to ADMIN; `FinancePage` has no role check at all. Owner-only data, client-side-only enforcement | `finance.service.ts:34,306` |

### 2.3 Requirements

- **FIN-1 · A shift must exist.** Open with a float, close with a count, and after close the shift's
  takings are immutable. This is the container `C-4` needs and the immutability point `C-7` needs.
  **Highest-leverage item in this area** — most other finance requirements attach to it.
  *(fixes `C-17`; enables `FIN-2`, `FIN-3`)*
- **FIN-2 · Counted cash must be enterable, and variance recorded** with a mandatory reason above a
  configurable threshold. Expected = float + `realCashIn` − `cashOut`. *(fixes `C-4`)*
- **FIN-3 · A closed sale must be correctable** by an append-only reversal, never by mutation — refund
  / void-sale / tender correction, each with reason, actor and audit row. The expense and purchase
  modules already do this correctly and are the template. *(fixes `C-7`)*
- **FIN-4 · Walkouts must appear on both sides of the P&L** — snapshot totals at walkout, and count
  walkout COGS. A walkout is a loss with a known cost, not a zero. *(fixes `C-6`, `#3`)*
- **FIN-5 · Every payment leg must be validated**: non-negative, and the debt ledger must receive the
  sum of all DEBT legs (or reject more than one). *(fixes `F-7`, `F-6`)*
- **FIN-6 · Discount caps must bind on every path that can discount.** A live, editable setting the
  owner believes is enforced must be enforced. *(fixes `M-1`)*
- **FIN-7 · Owner-only figures must be enforced server-side.** Profit must not be on the wire for
  ADMIN. *(fixes `M-6`)*
- **FIN-8 · Every date is a Tashkent date.** Defaults, edits and linked-row moves alike; a purchase and
  its expense can never sit on different days. *(fixes `M-66`, `M-67`, `M-62`)*
- **FIN-9 · Cancellations and walkouts must carry an actor** and must appear in the range report.
  *(fixes `M-19`, `M-20`)*
- **FIN-10 · Transaction-level export from the admin UI**, not only aggregate-over-Telegram.
  *(fixes `M-25`)*
- **FIN-11 · A stated retention period**, enforced by something other than a hard delete.
  *(fixes `M-26`)*
- **FIN-12 · One daily reconciliation line the owner can read in five seconds** — "ombordan ketgan X ·
  sotilgan taomlar tan narxi Y · farq Z". For a single-location owner who is physically present this
  is the whole anti-theft system; it replaces the control framework a chain would need. Depends on
  `INV-12` and `INV-14` — there is nothing to compare against until the storeroom can be counted.

### 2.4 Open decisions

1. **Fiscal compliance (`F-1`/`F-2`/`F-3`) — a business decision before a technical one.** Uzbek law
   (КМ РУз №943) requires settlement through a registered onlayn-NKM with a real-time fiscal module;
   this codebase has none, and `receipt.cpp` cannot emit `GS ( k` so it is *physically incapable* of
   printing a QR without a code change. **Is a certified device already in use at the counter?** If
   yes the requirement is reconciliation (`F-2`); if no it is a fiscal integration, and it dwarfs
   everything else in this document. Not knowable from the repo.
2. **Shift granularity:** one shift per day, or per cashier? Does a shift close block the next order?
3. **Correction policy:** who may refund — ADMIN or OWNER only? Any time limit? Does a refund reprint?
4. **Walkout costing:** book at COGS (loss = food cost) or at menu price (loss = lost revenue)? They
   answer different questions and the PRD must say which one "Walkout" means.
5. **Discount authority:** if caps bind, who can exceed them, and by what mechanism? A cap with no
   override path will be worked around with a fake 0-price line.
6. **Retention window** — driven by Uzbek bookkeeping requirements, not by disk space.

---

## 3. Calculations

This area exists separately because its defects are not arithmetic errors. **The formulas at the source
are right; the problem is that no number has a single definition.** Each consumer recomputes, rebinds or
reformats, and the results disagree on screen.

### 3.1 Defects

**One number, two answers**

| ID | What | Evidence |
|---|---|---|
| `M-14` | **Two cards labelled "Jami chiqim" on one page show different numbers** (`net` vs `cashOut`), and the category rows beneath don't sum to the total above them | `ExpensesSection.tsx:63,73-75` vs `GrandSummarySection.tsx:44` |
| `M-21` | Xarajatlar headline binds `net` where FinancePage and the owner report use `cashOut` — three surfaces, two answers, **on the exact figure that caused a prior production incident** (see `MOLIYA_KASSA_HISOBLASH_XATOSI.md`) | `ExpensesPage.tsx:317-322` |
| `M-15` | Monthly mixes `expensesNet` with `cashOut`-derived drawer figures, so "kelgan − ketgan ≠ kassa o'zgarishi" | `MonthlyTable.tsx:91` |
| `M-16` | `summary()` offsets **any** in-range reversal while daily/monthly offset **same-day only**, so Umumiy and Oylik disagree for the same month | `reports.service.ts:976-977` vs `:630-641` |
| `M-17` | Monthly "Foyda" cannot be derived from any visible column — COGS is never shown. The owner sees a profit number they cannot check | `MonthlyTable.tsx:33-121` |

**The printed and typed number**

| ID | What | Evidence |
|---|---|---|
| `#12` | **Customer receipts don't add up** on any order with a service charge — the item list prints SERVICE lines but the printed subtotal is FOOD-only, and there is no service-charge line | `printer/receipt-builder.ts:44,56-77` |
| `#14` | Decimal payment amounts show a green ✓ then fail: client tolerance is `< 1`, server requires exact `!==`, and the Zod failure surfaces as a 500 with no field detail | `ConfirmModal.tsx:129` |
| `#13` | **A fully-comped order can never be closed** — `canSubmit` requires `previewTotal > 0` though the server accepts a zero total. The order sticks at SENT, and cancelling it restores stock for eaten food | `ConfirmModal.tsx:131` |
| `#10` | Zod validation failures return 500 `INTERNAL` rather than 400 — no `ZodError` branch in the error handler, so every malformed number is an opaque failure | `errorHandler.ts` |

**Presentation of number**

| ID | What | Evidence |
|---|---|---|
| `M-24` | **Six independent money formatters** exist; one renders a genuine 0 so'm as an em-dash on a payroll table | `SalariesPage.tsx:20-24` |
| `M-18` | Positive money renders as unseparated digits (`12450000`) on the owner's headline card while negatives render formatted — broken `isMoney` heuristic | `GrandSummarySection.tsx:139` |
| `M-22` | `--warning` measures **1.98:1** and `--success` **3.30:1** on white, and both are used as the text colour for money throughout reporting | `styles.css:35-40` |

### 3.2 Requirements

- **CALC-1 · One definition per number, owned by the server.** Every displayed figure names a single
  `dailyLedger` field. No renderer recomputes a total, and no two labels with the same text bind to
  different fields. *(fixes `M-14`, `M-15`, `M-21`)*
- **CALC-2 · Reversal-offset semantics must be identical across daily, monthly and summary.** Pick
  same-day or in-range, apply everywhere, document why. *(fixes `M-16`)*
- **CALC-3 · Any derived figure must be derivable on screen.** If "Foyda" is shown, its inputs are
  shown. A number the owner cannot check is a number they cannot trust. *(fixes `M-17`)*
- **CALC-4 · Totals must decompose.** Category rows sum to their header; parts sum to wholes.
  *(fixes `M-14`)*
- **CALC-5 · One money formatter**, one rounding rule, one zero representation, applied everywhere
  including the receipt and the ConfirmModal. Zero renders as zero. *(fixes `M-24`, `M-18`)*
- **CALC-6 · The printed bill must add up** — SERVICE lines must be reflected in the printed totals, or
  excluded from the printed item list. Today the customer holds a document whose lines do not sum to
  its total. *(fixes `#12`)*
- **CALC-7 · Client and server validation must agree exactly.** No control may show a valid state the
  server will reject; validation failures return 400 with the offending field. *(fixes `#14`, `#10`)*
- **CALC-8 · Every legal total must be closeable, including zero.** *(fixes `#13`)*
- **CALC-9 · Money must never be rendered in a colour below 4.5:1.** *(fixes `M-22`; see `UX-2`)*

### 3.3 Open decisions

1. **`cashOut` vs `expenseNet` — this is settled and must stay settled.** The cash drawer uses
   `cashOut`; a prior-day purchase deleted today writes a REVERSAL stamped today whose cash left on an
   earlier day. **See §8.** The PRD must state this as a constraint, not re-open it.
2. **Reversal offsets:** same-day (daily/monthly) or in-range (summary) as the unified rule? Same-day
   is more defensible for a drawer; in-range is more intuitive for a period P&L. They may legitimately
   differ *if each is labelled* — but today they are not.
3. **Rounding:** UZS has no decimals. State one rule (round-half-up at the line? at the total?) and
   apply it identically client and server, or `CALC-7` cannot hold.
4. **Does the customer receipt show the service charge as a line?** A customer-facing pricing decision,
   not a formatting one.

---

## 4. UI/UX

### 4.1 Baseline

**The design system is correct — adoption is the problem.** Tokens match the house spec exactly, and
`DataTable`, `MoneyCell`, `EmptyState`, `PageHeader` and `Sidebar` are faithful implementations. Colour
is never the sole carrier of meaning (`G7` clean across the whole renderer). Roughly **40% of the
renderer predates the system and never migrated** (`UISYS-10`). This is a migration problem, not a
redesign — the PRD should not propose a new design language.

### 4.2 Defects

**Root cause**

| ID | What |
|---|---|
| `M-52` | **59 raw `<button>` vs 83 `<Button>` — a 42% bypass rate.** This single fact feeds `M-42`, `M-43`, `M-47` and `M-50` |
| `M-51` | Login, Settings and Users adopt **zero** primitives; they hold 40 of the 115 blues and 19 of the 56 failing greys |
| `M-72` | MenuPage and UsersPage read as a different product: 36 blue classes, raw `<table>`, 11 raw blue `<button>`s, a `purple` OWNER badge from no palette. MenuPage *imports* `EmptyState` and never uses it |

**Legibility — the operator cannot read the screen**

| ID | What |
|---|---|
| `M-44` | **96 text elements below the 12px floor** (62×10px, 30×11px, 3×9px, 1×8px) across 25 files; 61 pair sub-12px with a muted colour |
| `M-45` | `text-slate-400` (**2.56:1**) used 56× and `text-slate-300` (**1.48:1**) 4× as body text — the equivalent token passes at 4.83:1, so the failure is the bypass, not the system |
| `M-23` | 8–9px column headers on the **salary matrix used to pay staff** |
| `M-33` | Occupied-table label is **1.42:1** — the waiter cannot read which table is taken |
| `M-71` | The **1.48:1 "—"** is the sole indicator that a dish is untracked, explained only in a `title` tooltip |
| `M-46` | ConfirmModal's dark header renders table/waiter labels at 10px, 3.75:1 |

**Touch targets — this is a touchscreen POS**

| ID | What |
|---|---|
| `M-47` | 19 controls below 24×24px, incl. nine 12px clear-search ✕ and a 22px MenuPage cluster where reorder / edit / **deactivate** sit 4px apart |
| `M-53` | All four MenuPage category actions, including destructive deactivate, are `opacity-0` until **hover** — on a touch device they are undiscoverable |
| `M-39` | Neither shared Button primitive sets a min height; live instances land at 26–36px |
| `M-40` | Mobile note/cancel row actions are ~16px with no hitSlop, 16px apart — one is destructive and unconfirmed |

**Destructive actions**

| ID | What |
|---|---|
| `M-55` | The live ConfirmDialog registers a **document-level Enter handler firing `onConfirm` regardless of focus** — Enter on "Yo'q" deletes. Its backdrop is `onCancel ?? onConfirm`, so **clicking outside a single-button dialog executes the action** |
| `M-54` | Two ConfirmDialogs exist and the wrong one won: the spec-compliant `feedback/` version has **zero** importers; all 7 consumers use a hand-rolled portal with no loading state |
| `M-31` `M-41` | Three of four line-removal paths delete with no confirmation; desktop cancels a DRAFT on one unconfirmed tap while mobile confirms the same action |
| `M-69` | **Eleven admin mutations have no `onError` and no error UI** — a failed save is completely invisible and the dialog just sits open |

**Keyboard and focus**

| ID | What |
|---|---|
| `M-34` | Desktop floor map and menu grid are click-only `<div>`s — neither creating an order nor adding an item is keyboard-reachable, **in the app CLAUDE.md calls the keyboard equivalent of mobile** |
| `M-49` | `DataTable` rows have `onClick` with no `tabIndex`/key handler, so six pages have no keyboard route to a record |
| `M-48` `M-50` | Nine search inputs set `outline-none` with no replacement; the global focus ring measures **2.32:1 at 1px** |
| `M-42` `M-43` | Blue is an established second accent — **115 uses / 7 files** — incl. the submit button on Login, Settings and the payment modal, in an amber-only app; 39 are `ring-blue-500` focus rings |

### 4.3 Requirements

- **UX-1 · Migrate to the primitives; do not redesign.** The system is correct — close the 42% bypass
  and `M-42`/`M-43`/`M-47`/`M-50` largely resolve as a consequence. Highest-leverage order is
  `UISYS-10 → 11 → 3`. *(fixes `M-52`, `M-51`, `M-72`)*
- **UX-2 · Enforce a legibility floor: 12px minimum, 4.5:1 minimum**, no exceptions for money, table
  status or payroll. *(fixes `M-44`, `M-45`, `M-23`, `M-33`, `M-46`, `M-22`)*
- **UX-3 · Enforce a touch-target floor of 44×44px** for any control on an operator path, and no action
  may be hover-only. *(fixes `M-47`, `M-53`, `M-39`, `M-40`)*
- **UX-4 · One confirmation component, and destructive actions cannot fire by accident.** No
  document-level key handler; a backdrop click never executes; destructive confirms are visually
  distinct from routine ones. *(fixes `M-55`, `M-54`, `M-31`, `M-41`)*
- **UX-5 · Every mutation reports its failure** in Uzbek, at the point of action. *(fixes `M-69`, and
  `M-27`/`M-28` on the waiter clients)*
- **UX-6 · Every record reachable by mouse is reachable by keyboard**, and focus is always visible.
  *(fixes `M-34`, `M-49`, `M-48`, `M-50`)*
- **UX-7 · Status must never be inferable only from a tooltip or a colour.** *(fixes `M-71`)*
- **UX-8 · The inventory screens must show the payback, not just the data entry.** Portions remaining
  and low-stock warnings belong on the screens the admin already opens — this is the UI half of
  `INV-9`/`INV-10`, and the reason ingredient tracking is abandoned today.

### 4.4 Open decisions

1. **Migration strategy:** page-by-page, or primitive-by-primitive across all pages? Recommend
   primitive-by-primitive for `Button` specifically (it alone carries `M-42`/`43`/`47`/`50`), then
   page-by-page for the rest.
2. **Is blue being *promoted* to a second accent, or removed?** 115 uses is past the point where
   "remove" is free. Decide deliberately rather than by attrition.
3. **Touch target 44px vs 24px.** WCAG 2.2 AA is 24px; 44px is the practical floor for a busy
   touchscreen. The higher bar will force layout changes on MenuPage.
4. **Does the admin UI need to be keyboard-operable at all**, or only the order desktop app? `M-34` is
   scoped very differently depending on the answer.

---

## 5. Sequencing

Dependencies, not priorities — some of this work is blocked by other parts of it.

```
INV-1 (cost basis on every dish)  ──►  trustworthy foyda
   └─ no dependencies, no migration, cheapest item in the document

INV-20 (store the type) ──► INV-4 (change a dish's type later)
   └─ also stops a dish silently BECOMING free when its recipe is emptied.
      The only schema migration in §1.5.

INV-6 (portions only in kind 2) ──► INV-19 (fix dishes already created wrong)
   ▲ stop new damage first, then repair the old

INV-9/10/11 (the payback: portions left, low stock, enforced availability)
   └─ mostly wiring existing code — and the precondition for the operator
      sustaining kind 1 at all, which everything else about kind 1 depends on

INV-12 (shared ingredients) ──► INV-14 (Sanoq) ──► INV-16 (invariant check)
   ▲ can't count a storeroom sliced by dish   ▲ a checker with no repair path
                                                 reports drift forever
INV-12 + INV-14 ──► FIN-12 (the daily "farq" line)

INV-1 (costing) ──► FIN-4 (walkout COGS) ──► CALC-3 (derivable profit)
   ▲ costing must be right before it is reported, or the report is
     confidently wrong

FIN-1 (shift) ──► FIN-2 (cash count) ──► detective control over cash
      └────────► FIN-3 (correction after close: needs an immutability point)

CALC-1 (one definition) ──► CALC-3, CALC-4

UX-1 (primitives) ──► UX-2, UX-3, UX-6
UX-4 (confirmations) — independent, and the cheapest real safety win
```

**Suggested phases.** Ordered against the owner's three stated goals — catch shrinkage, know real
profit, stop running out — not against audit severity:

1. **The daily loop** — `INV-21`, `INV-22`, `INV-23`, `INV-24`. Fast itemised bazaar entry, price
   history, owner visibility. This is the highest-frequency workflow in the business, it is where the
   owner suspects the loss, and **every other number depends on it being entered at all.** No schema
   change; `weightedAvgCost` already holds the pre-fill.
2. **Stop the lying** — `INV-1`, `INV-2`, `INV-6`, then `INV-20`. The first three need no database
   change and no new screens; together they end the 100%-margin fiction that makes the profit number
   unusable. `INV-20` (store the type) needs one migration and closes the same hole from the other
   side — a dish that *becomes* free by accident rather than by choice.
3. **Close the loop** — `INV-12` (pool the storeroom), then `INV-14` + `INV-25` (Sanoq, variance to
   the owner), then `FIN-12` (the daily farq line). This is the answer to "the numbers don't add up",
   and Sanoq digitises a notebook column they already keep — the least new behaviour of anything in
   this document.
4. **Integrity floor** — `FIN-5`, `FIN-6`, `FIN-7`, `INV-15`, `UX-4`. Small, high-consequence, no
   dependencies. Most are already the queue in `AUDIT_FINDINGS.md` §8.
5. **Make tracking worth doing** — `INV-9`, `INV-10`, `INV-11`, `UX-8`, `INV-13`. Mostly wiring code
   that already exists, and the answer to "running out mid-service".
6. **Correction and reconciliation** — `INV-16`, `INV-19`, `INV-17`, `INV-18`, `FIN-1`, `FIN-2`.
7. **Reporting truth** — `FIN-3`, `FIN-4`, `FIN-8`, `FIN-9`, `CALC-1` … `CALC-8`.
8. **UI migration** — `UX-1` … `UX-7`, continuous alongside the rest.

**Note on the audit's own priority.** `AUDIT_FINDINGS.md` §1 leads with the waiter/void fraud gap —
serve the food, void the line, pocket the cash. The owner's suspicion is **not** there; it is on
bazaar money. Those findings remain real and should still be fixed, but they are not what this owner
is asking for, and the PRD should not open with them.

**Not in this document but sequenced ahead of all of it:** `F-9` (no backup of any kind) and `C-1`/`C-2`
(packaged migration overwrites the live DB non-atomically; installer offers to delete it). The audit
calls this the highest-expected-value work in the list, and it is a precondition for safely shipping
anything above.

---

## 6. What a PRD generated from this must also answer

Beyond the per-area decisions:

- **Scope boundary.** `decisions.md` excludes split/merge bills, per-line discounts, Click/Payme,
  structured modifiers and multi-tenant from v1. Does that still hold? `FIN-3` (corrections) sits close
  to the split-bill boundary.
- **Migration and backfill.** Several requirements change the meaning of existing rows (`INV-19`,
  `FIN-4`). State for each: restate history, or fix forward.
- **Who verifies.** There is no test runner in this repo; verification today is
  `pnpm --filter @chayxana/master typecheck` plus `scripts/smoke-*.ts` and manual flows. Anything in
  phase 4 or 5 changes money math — the PRD should say what proves it correct.
- **Rollout.** One Windows machine, no staging, a live chayxana. Every change ships straight to
  production during service hours unless the PRD says otherwise.
- **Who is the user of each screen.** The operator model in §1.1 came from the owner, not from the
  code. Any requirement that adds a daily task should name who does it and what they get back.

---

## 7. Status — READ THIS FIRST IF YOU ARE A NEW SESSION

> **Superseded (2026-08-13):** §1 (inventory) including §1.9/§1.10 and open
> questions `O-1`…`O-4` is superseded by the count-based inventory design —
> `docs/superpowers/specs/2026-08-13-count-based-inventory-design.md`,
> implemented on `feat/count-based-inventory`. §2–§4 (finance, calculations,
> UI/UX) remain live inputs.

**Last worked: 2026-08-04 (second session).** Branch `audit/pos-review-and-prd-foundation`, clean
tree, two commits ahead of `main` and unpushed: `13e44dd` (the `F-5` fix) and `b50115c` (this file,
`AUDIT_FINDINGS.md`, `POS_STANDARDS.md`, rewritten `CURRENT_WORKFLOW.md`, `CLAUDE.md`).
`pnpm typecheck` passes across all three apps.

**What the second session did:** worked the inventory *schema* — the piece §7 had left as "next".
Settled the unit model (`S-1`…`S-6`), proposed the stored type enum (`P-1`), and surfaced four open
questions (`O-1`…`O-4`), one of which conflicts with `R4`. All in **§1.9**. A full worked example
of plov — purchase → cost → sale → the two books → count, with numbers that reconcile — is **§1.10**;
read it before touching costing.

### Where this stands

| Area | State |
|---|---|
| **§1 Inventory** | **Designed and settled with the owner** (rules `R1–R7`, four types, operating facts, reconciliation loop, 25 requirements). **Schema now half-settled** — §1.9 `S-1`…`S-6` are confirmed, `O-1`…`O-4` block PRD generation |
| §2 Finance · §3 Calculations · §4 UI/UX | **Drafted from the audit only.** Requirements are sound but have **not** been through the same owner conversation §1 got, and several now need to answer to `R1–R7` |
| Sequencing (§5) | Reordered against the owner's three stated goals, not audit severity |

### The two open threads

1. **This document — active.** Inventory design done; inventory *schema* half-settled (§1.9);
   finance/calculations/UI untouched by an owner conversation.
2. **`AUDIT_FINDINGS.md` §8 fix queue — paused, not abandoned.** Fix 1 of 6 (`F-5`, the audit-query
   password-hash leak) is **done and committed** (`13e44dd`). Fix 2 (`F-4`, ADMIN can PATCH
   themselves to OWNER, unaudited) is next and was re-verified still open at `user.service.ts:61-112`
   — `update()` checks `existing.role` but passes `input.role` straight to the repo, and audits only
   reactivation. That queue is six small high-consequence fixes, independent of this document, and
   can resume at any time.

### Next steps, in order

1. **Answer `O-1`…`O-4` in §1.9.** These block PRD generation, and `O-1` (pooled vs per-dish
   ingredients) and `O-3` (cook-time vs sale-time stock) are load-bearing — `O-3` in particular
   changes what §1.1's type model even means. *This is the first thing to do.*
2. **Re-pass §1.4 and §1.5 against `R1–R7` and against §1.9.** Several requirements predate both —
   `INV-3`'s picker wording, `INV-6`'s unit handling (now largely deleted by `S-2`), `INV-18`
   (collapsed by `S-2` into "never editable"), and `M-74` (deleted outright). `R7` also turns some
   findings from "fix this page" into "delete this page" — that deletion list is itself an open call:
   candidates confirmed in code are the Chegirmalar page (no reachable path reads its caps), combos
   (no price, builder shows no money), the category reorder arrows (every UI-created category has
   `displayOrder: 0`, so the swap writes 0 over 0), and the "Farq chegarasi (%)" setting for a Sanoq
   screen that does not exist.
3. **Confirm the `R2` ingredient count** (§1.0 open check). Holds at 10–20; needs a different Bozor
   and Sanoq design at 40+. Note this question is moot under `O-1` separation — per-dish scoping
   multiplies the row count by the number of dishes that use each ingredient.
4. **Generate the inventory PRD** from §1 — still the only section ready for it.
5. **Give §2/§3/§4 the same owner treatment §1 got** before turning them into a PRD. The audit's
   priorities are demonstrably not the owner's — see the note at the end of §5.

### Settled — do not reopen

- Four menu item types: three food kinds + SERVICE. Combo is not a type. The type must be **stored**,
  not inferred (`INV-20`).
- **No sub-recipes.** Nothing is batch-prepared across dishes.
- **No per-dish "qolgan mahsulotlar" top-up** — rejected by the owner; see §1.0 for the accepted
  consequence.
- **Bazaar entry takes quantity + total paid**, unit price derived — matches how they buy and matches
  `purchaseService.record`'s existing signature.
- ~~The FIFO costing engine itself is correct and stays. `R1–R7` change what feeds it and what reads
  it, never the peel.~~ **Reopened 2026-08-13** — see the supersession note above; the FIFO engine
  was removed and replaced by the count-based design, at the developer's explicit direction.
- **Units are a property of the ingredient, not the dish** — a dish is sold per porsiya and has no
  unit (§1.9 `S-1`).
- **Exactly three units, as an immutable enum**: `KG` · `LITR` · `DONA`. No `conversionFactor`
  column, no free text, never editable after creation. Ledger scale (gramm/ml/dona) is a code
  constant (§1.9 `S-2`, `S-3`).
- **Cost is typed once at creation, then always derived from purchases**; stock is never edited
  directly — only Sanoq corrects it (§1.9 `S-5`).

---

## 8. Constraints — do not "fix" these

A PRD generated from an audit will be tempted to tidy these. Each is correct and load-bearing.

- **`cashOut`, not `expenseNet`, for the cash drawer.** `cashOut = expenseGross − sameDayReversal`. A
  prior-day purchase deleted today writes a REVERSAL stamped today, but its cash left the drawer on an
  earlier day; subtracting it from today inflates the drawer. **This was a real production incident** —
  `docs/MOLIYA_KASSA_HISOBLASH_XATOSI.md`. Every `D3` finding in §3 is a *consumer* binding the wrong
  field — one-line rebindings, not math changes.
- **P&L and cash flow are separate.** Do not derive one from the other.
- **FIFO restore at frozen original prices.** Past COGS is never restated — "honest history" is
  deliberate.
- **Stock moves at line-add time.** Not at `send`, not at `confirm`. Counter-intuitive, and correct.
- **The FIFO engine itself is well built** — atomic conditional peels, LIFO unwind at frozen prices.
  §1's requirements change what feeds it and what reads it, **not** the peel.
- **Printer failure rolls the confirm transaction back.** The rollback is right; only the absence of a
  recovery path is wrong (`F-10`). Do not make the print non-blocking without replacing the guarantee.
- **Deferred socket emits.** A rolled-back transaction never emits and never fires a Telegram alert.
- **Expense and purchase corrections are exemplary** — original preserved, reversal appended, mandatory
  reason, movement row, audit row, one transaction. `FIN-3`, `INV-8` and `INV-14` should copy this
  shape rather than invent one.
- **`lib/time.ts` is exemplary** and every backend service routes through it. `FIN-8` means routing the
  remaining four call sites through it, not replacing it.
- **Auth fundamentals are sound** — bcrypt, 32-byte tokens, single-device sessions, per-account
  lockout, server-side `requireRole` on every route, socket rooms derived from the session.
- **AuditLog is append-only at the application layer.** No update or delete path exists anywhere. Keep
  it that way.
