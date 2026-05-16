# PRD 07 — Stock model: daily-reset vs. perpetual

- **Status:** **Superseded — replaced by `docs/REFACTOR_PLAN.md` (2026-05-15)**
- **Reason:** The user chose a deeper refactor: shift from menu-item-level stock to ingredient-level inventory with recipes and a COGS engine. The `StockMode` enum proposed here is no longer the right shape; ingredients themselves are the stock unit. Keep this document as the reasoning record.
- **Author / date:** auto-generated 2026-05-15
- **Area:** Domain (inventory, availability, day-boundary semantics)
- **Related code:** `apps/master/src/main/server/services/stock.service.ts`, `…/repositories/dailyStock.repo.ts`, `apps/master/prisma/schema.prisma` (`MenuItem.trackStock`, `DailyStock`), `apps/master/src/main/server/services/order.service.ts` (decrement/restore)
- **Related docs:** `docs/agent-plans/00-shared/decisions.md` (§ "Menu", § "Stock"), `docs/AUDIT_REPORT.md` (§8 "Zaxiralar")

---

## 1. Context

Stock tracking in Chayxana is **daily-prep**: every morning the admin enters how many portions of each tracked item are available, the system decrements on order, restores on cancel (if cooking didn't start), and the count resets the next day. This works perfectly for items the kitchen actually prepares fresh each day — soups, plov, kebabs, stews — and was correctly identified in `decisions.md` as the v1 model.

It breaks down for **everything else the chayxana sells**:

- **Bottled drinks** (Coca-Cola, water, Pepsi). Shelf-stable. The chayxana buys a box of 24 bottles; consumes them over multiple days; restocks weekly. Counting 24 bottles every morning is a UX irritant and an error source.
- **Packaged snacks** (chocolate bars, sweets). Same.
- **Bread / non** (purchased from a bakery in the morning). Daily-prep fits, but the supplier-side accounting is per-batch, not per-day.
- **Tea leaves, sugar, condiments**. Not portion-counted at all today. Effectively unlimited; the chayxana just notices "we're out" and complains. No tracking surface.

Today the schema models this with a single boolean `MenuItem.trackStock` (`schema.prisma:181`):

- `trackStock = true` → must have a `DailyStock` row for today, otherwise `OUT_OF_STOCK` rejects the order line (`stock.service.ts:117-121`).
- `trackStock = false` → never checked. Order line goes through; no count anywhere.

There is no in-between, no "shelf-stable, multi-day" mode, and no "infinite, but I want a soft warning when it runs out." So the operator is forced into one of two bad workflows:

1. **Mark drinks `trackStock=true`** → admin counts 18 Cokes every morning. Tedious. The count drifts because batches are restocked irregularly. The "daily reset" wipes yesterday's tail, so a half-empty box of 7 bottles at end-of-day becomes "untracked" again the next morning until the admin re-enters it.
2. **Mark drinks `trackStock=false`** → ordering "Coke" succeeds even when the fridge is empty. Waiter and customer find out at delivery time. The waiter then walks back to the bar, returns to the table to apologise, and chooses another drink. Two extra round trips, customer is annoyed.

This came up implicitly in the audit (`AUDIT_REPORT.md` §8 marked everything in stock as "Works as expected" because the test path used a daily-prep item) but is a known operational complaint, surfaced in PROJECT_TECHNICAL_OVERVIEW remarks and Telegram-bot feature discussions.

The PRD is to decide whether v1's daily-only model stays (and we accept the workflow cost), or whether we add a second tracking mode for shelf-stable items.

## 2. Goals / Non-goals

### Goals

- Decide the right stock model for **multi-day shelf-stable items**: bottled drinks, packaged snacks.
- Specify the **day-boundary semantics** for orders that span midnight (a customer arrives at 23:55, orders at 00:05 — what date does this attribute to?).
- Specify whether **infinite-but-warn** items should exist (tea, sugar, condiments).
- Keep the existing daily-prep mode unchanged where it works (cooked dishes).
- Keep the schema migration cost bounded; SQLite (per PRD 02) limits some options.

### Non-goals

- Full inventory / ingredients tracking. We don't decompose menu items into ingredients (no "1 plov = 200g rice + 80g lamb"). Out of scope.
- Supplier orders / purchase-order workflow. Out of scope.
- Multi-warehouse / multi-location stock. Single-location v1.
- Wastage tracking beyond what's already in PRD 05 (cooked-but-cancelled losses).

## 3. Current state (code-grounded)

| Concern | File / lines | Behaviour |
|---|---|---|
| Track-stock flag | `schema.prisma:181` | Boolean on MenuItem. Per-item opt-in. |
| Today's stock row | `DailyStock` model `schema.prisma:455-471` | Unique `(menuItemId, date)`. Stores `initialCount` (morning input) and `currentCount` (running). |
| "Today" definition | `stock.service.ts:12-15` | `new Date(Date.UTC(...))` at start-of-day. **UTC** — not local timezone-aware. Master runs in Tashkent (UTC+5). At 00:00–05:00 local time, this differs from local midnight by 5 hours. |
| Out-of-stock rejection | `stock.service.ts:117-126` | Requires today's row to exist, then atomic decrement; if `count == 0` after decrement-where-clause, throws `OutOfStock`. |
| Restore | `stock.service.ts:135-148` | Increments today's row. **Same date used for restore as for decrement.** Day-boundary issue: if an order is decremented on day X and cancelled on day X+1, the restore lands on day X+1, leaving day X under-counted. |
| Morning prep | `stock.service.setOrUpdate` | Sets `initialCount` and `currentCount` to the entered number. Idempotent. |
| Batch add/remove | `addBatch`, `removeBatch` | Marked `@deprecated` in favour of `setOrUpdate`. Operationally, "add a batch" today means "set count = current + delta," which works but loses the batch-event history. |
| Availability | `MenuItem.isAvailable + count > 0` | `stock.service.listToday:34` derives the displayed availability. Kitchen-app respects this in real time. |
| History | `historyForItem:150-152` | Per-item daily history is queryable. |

### Behaviour gaps

- **Multi-day items**: there is no shelf-stable representation. Either daily-prep or untracked.
- **Day-boundary**: an order added at 23:55 and a restore at 00:05 the next day debit/credit *different* `DailyStock` rows. The Tashkent-vs-UTC offset makes this even more confusing — by 23:55 local time it's already 18:55 UTC, so "today" might roll over at 05:00 local time, not at local midnight.
- **Soft-warn items**: not modelled. Either you count exactly or you don't count at all.
- **Restock event history**: deprecated `addBatch` removed the audit trail of "we got a delivery of 24 bottles on the 12th." Only the resulting count is recorded.

## 4. Options

### Option A — Add a `StockMode` enum to MenuItem

Replace the `trackStock: Boolean` with `stockMode: StockMode` enum:

```
enum StockMode {
  UNTRACKED      // status quo when trackStock = false
  DAILY_PREP     // status quo when trackStock = true
  SHELF_STABLE   // new: count carries across days, restocked event-driven
  SOFT_WARN      // new: count is informational; orders never rejected, but availability indicator shows red below threshold
}
```

- **DAILY_PREP**: unchanged. `DailyStock(menuItemId, date)` row per day. Resets at start-of-day.
- **SHELF_STABLE**: a single running count in a new `ItemStock(menuItemId)` row (or reuse `DailyStock` with `date = null`, but enforcing that uniqueness in SQLite is awkward — easier to add a new table). Restock is an explicit `StockRestock(menuItemId, qtyAdded, addedById, occurredAt, supplierNote?)` event. Decrement on order. Restore on cancel-before-cook. Out-of-stock rejection uses the running count.
- **SOFT_WARN**: count tracked but not enforcing. Threshold `warnBelow: Int?` triggers a visual indicator in waiter/admin UI. Order is never rejected by stock.
- **Pros:** explicit, future-extensible. Each mode is a distinct code path with clear behaviour. The owner picks per item.
- **Cons:** schema migration (new enum, new table for shelf-stable, deprecation of `trackStock`). Code paths in `order.service.ts` / `stock.service.ts` triple.

### Option B — Keep daily model, add a "rollover" rule

Don't change the schema. Add a setting: at start-of-day, for items where the rule fires, **carry over yesterday's `currentCount` to today's `initialCount`**. So drinks that were 18 at end-of-day yesterday start as 18 today, no morning input required. Items where the rule doesn't fire still need morning input.

- **Pros:** minimal change. Just a startup-of-day job and one flag per item ("auto-rollover: yes/no").
- **Cons:** still uses `DailyStock` per day. Restock event is still implicit ("the count went from 18 to 42 because someone clicked addBatch"). The model is right for daily-prep items but bent into shape for shelf-stable; it doesn't make the schema more honest.

### Option C — Full inventory model

Introduce a real inventory layer: every item has a perpetual count, batches with cost prices, FIFO consumption. Daily-prep items have a daily-reset rule on top.

- **Pros:** "real" answer. Supports COGS and supplier tracking.
- **Cons:** huge scope. Out of scope per goals.

### Option D — Status quo + UX cleanup

Don't change the model. Document the limitations. Add a small tooltip in the morning-prep UI: "drinks: enter end-of-day count from yesterday."

- **Pros:** zero engineering. Defers the decision.
- **Cons:** doesn't fix the real workflow pain. Drift continues.

## 5. Decision matrix

| Dimension | A (StockMode enum) | B (rollover flag) | C (full inventory) | D (status quo) |
|---|---|---|---|---|
| Solves drinks workflow | Yes | Mostly | Yes | No |
| Solves restock event history | Yes | No | Yes | No |
| Soft-warn category | Yes | No | Possible | No |
| Schema change | Yes (enum + table) | Tiny (one field) | Major | No |
| Migration cost | M | XS | L | 0 |
| Future-extensible | Yes | No | Yes | No |
| Risk of behavioural regression | Low (modes are explicit per-item) | Low | High | None |
| Effort | M | XS | L | 0 |

## 6. Open questions

1. **What's the actual mix of items?** If 90% of the menu is daily-prep and only 10% is drinks, Option B (rollover) might be sufficient — the irritant is small. If 30%+ is shelf-stable, Option A is justified.
2. **Day-boundary policy:** should "today" be local-time (Tashkent) or UTC? Local time is more intuitive for the operator (the chayxana's "today" is until they close at ~midnight). UTC is what the code does. Need to decide and document — this is a small but real bug.
3. **What does "available" mean for SOFT_WARN items?** If tea is at 5 packs and the threshold is 10, do waiters see a red "low" indicator or just nothing? Today there's no warning UI.
4. **Restock event semantics:** when a delivery comes in, who records it (admin? owner? a new STOCK_KEEPER role)? Audit trail desired?
5. **Year-old half-bottles:** if a shelf-stable item is restocked twice and we want to know "do we still have any from the December batch," that's FIFO batch tracking — outside this PRD. Acceptable?
6. **What happens to existing data on migration?** If we adopt Option A, all current `trackStock = true` items become `DAILY_PREP`; all `trackStock = false` become `UNTRACKED`. Drinks need a manual one-time conversion to `SHELF_STABLE`. Owner UX.

## 7. Recommendation

**Option A**, sized as a single PR with a backfill script.

Rationale:

- The schema honestly reflects what the operator does. The current single boolean is an over-simplification that has been audibly painful.
- Option B (rollover) papers over the symptom without making the model truthful. The next request after rollover will be "track when the delivery came in" — at which point we'd add Option A anyway, having done the rollover work for nothing.
- Option C is the right destination eventually but premature without a cost-price / supplier story (out of scope here).
- Day-boundary: switch to local-time (Tashkent, UTC+5) for `today()`. This is a small but important fix even if Option D is selected. Quasi-orthogonal to the main decision but recommended in any case.

## 8. Rollout

### Phase 1 — schema + service

1. **Add `StockMode` enum** to Prisma. Migration: add column `MenuItem.stockMode StockMode` with default `UNTRACKED`, backfill: `stockMode = trackStock ? DAILY_PREP : UNTRACKED`. Keep `trackStock` column for one release for safety; remove in Phase 3.
2. **New table** `ItemStock(menuItemId @id, currentCount Int, warnBelow Int?, updatedAt)`. One row per shelf-stable item. CRUD via `stockService`.
3. **New table** `StockRestock(id, menuItemId, qtyAdded, addedById, occurredAt, supplierNote, createdAt)`. Appendable event log of restock events for shelf-stable items.
4. **Service paths** in `stock.service.ts`:
   - `decrement` and `restore` branch on `stockMode`: `DAILY_PREP` uses `DailyStock`, `SHELF_STABLE` uses `ItemStock`, `SOFT_WARN` warns but does not reject, `UNTRACKED` no-op.
   - Add `recordRestock(menuItemId, qty, actorUserId, note?)` for shelf-stable.
   - Add `setSoftWarnThreshold(menuItemId, warnBelow)`.
5. **Day boundary:** introduce `stockService.localToday()` using `process.env.TZ || 'Asia/Tashkent'` and Intl APIs. Migrate `DailyStock.date` semantics. Existing rows: leave as-is; document the shift in `decisions.md`.

### Phase 2 — UI

- Admin stock page: split into three tabs ("Bugungi tayyorlash" / today's prep, "Doimiy" / shelf-stable, "Ogohlantirish" / soft-warn). Each tab has the appropriate input affordances.
- Add "Restok kiritish" (record restock) action on shelf-stable items — modal with quantity + note.
- Waiter/admin order screen: show a yellow low-stock indicator on SOFT_WARN items.

### Phase 3 — cleanup

- Drop `MenuItem.trackStock`. Update `@@index([trackStock])` to `@@index([stockMode])` if reports need it.
- Remove the deprecated `addBatch` / `removeBatch` / `setInitialForToday` methods (`stock.service.ts:83-106`).
- Update `decisions.md` "Stock" section.

### Reporting tie-in (PRD 05 / 06)

- Add per-mode rollups to the daily report: how many shelf-stable items dropped below threshold today, how many restocks happened.
- Owner Telegram summary gains a "Bugungi qoldiq" (today's leftovers) line for shelf-stable items if any dropped below threshold.

### Backfill script

```ts
// One-off boot-time migration (idempotent)
for (const item of menuItems) {
  if (item.stockMode == null) {
    item.stockMode = item.trackStock ? 'DAILY_PREP' : 'UNTRACKED';
  }
}
```

Items the owner wants to convert to `SHELF_STABLE` are reclassified by hand in the admin UI after rollout.

### Observability

- Boot-time integrity check: for every `DAILY_PREP` item, today's `DailyStock` row exists (warn if missing during operating hours).
- Daily Telegram alert if a `SHELF_STABLE` item hits zero.

### Rollback

- Phase 1 is reversible by dropping the `stockMode` column and the new tables. Existing data stays in the daily-prep rows.
- Phase 2 UI changes are cosmetic and revertable.
- Phase 3 removes the `trackStock` column. Reversible only by re-adding and backfilling from `stockMode`. So Phase 3 is the point of no return.
