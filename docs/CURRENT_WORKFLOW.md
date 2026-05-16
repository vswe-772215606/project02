# Chayxana POS — Current workflow (live state)

**Snapshot date:** 2026-05-15 (post Phase 0 + Phase 1 + service-charge/expense-lifecycle systematisation).
**Update when:** any phase from the refactor plan lands. Keep this doc honest about *what the system actually does today* — not what's planned.

This document maps the real business logic the chayxana operates under right now. It exists to make the **partial** state of the refactor visible: some flows use the new ingredient/recipe model, others still use the legacy `DailyStock` model. Knowing which is which prevents people from "fixing" things that are intentionally legacy.

## Recent changes (this snapshot)

- **Xizmat haqi is now a menu item** with `kind = SERVICE`. No system-wide setting. Admin creates one or more service items via Menyu ("Bu — xizmat haqi mahsuloti" checkbox). Waiter adds them to orders like any line, typically `qty = mijoz soni`. SERVICE lines do not go to the kitchen, have no recipe, no stock.
- **`service_charge_amount` setting is gone**. `Order.serviceChargeSnapshot` / `Order.serviceChargeWaived` columns remain for historical data; new orders compute service charge from SERVICE order lines via `billing.service.computeTotals`.
- **Expense lifecycle**: every `Expense` has a `repayable` flag (default false). Repayable expenses (avans, zalog, vaqtinchalik qarz) track returns via new `ExpenseReturn` table; admin can mark "Yo'qotish" when recovery is abandoned. P&L formula excludes pending-repayable rows and counts only the unrecovered portion of written-off ones.
- **Per-waiter today stats** on UsersPage: `/api/users/today-stats` returns orders + bill total + service-earned per waiter, refetched every 60s.
- **Expense cross-date search** `GET /api/expenses/search?q=...&openRepayable=true` finds repayable expenses regardless of date — needed when admin records a return against an avans given days ago.
- **Admin daily finance page** (`/finance` route, sidebar entry "Kunlik moliya"): admin-safe view at `GET /api/finance/daily` showing sales / cashflow / outflow / drawer movement / purchases / expenses. **No profit number** (owner-only via the legacy Hisobotlar). Built on the shadcn foundation.
- **Full-flow simulation script**: `apps/master/scripts/simulate-full-flow.sh` exercises every load-bearing surface end-to-end (service item, order with food+service, payment, regular + repayable expense, partial return, write-off, search, daily report, DB invariants).
- **Telegram daily report rewritten**: `telegramBotService.formatReportMessage` now sends a structured 5-section report (Savdo · Pul oqimi · Xarajatlar · Foyda · Ofitsiantlar + top mahsulotlar). Uses the new `operating` and `pendingRepayable` fields plus per-waiter aggregates and top expense categories. No stale references to `service_charge_amount`.
- **Amallar tarixi page rewritten** (`/audit`): migrated to shadcn `DataTable` + `PageHeader` + `Card`. Sidebar entry under "Tizim" (was hidden). Filters: text search, action type (grouped), user, date range. Audit endpoint role relaxed to `ADMIN+OWNER` per `decisions.md` (was OWNER-only). Friendly Uzbek action labels and color-toned action badges per category (`auditActionTone`).
- **Expense category select removed**: ExpensesPage form no longer shows a category dropdown. Admin types the reason freely; backend defaults `categoryId` to `seed-cat-operational` (Operatsion) for manual expenses. Ingredient purchases continue to auto-route to `seed-cat-ingredients` (Mahsulot xaridi). Backend `createExpenseSchema.categoryId` is now optional.
- **Telegram historical reports**: bot now responds to `/sana YYYY-MM-DD`, `/oldin N`, `/hafta` (week summary), `/yordam`. New inline keyboard rows: "3 kun oldin", "7 kun oldin", "Hafta yakuni", "Sana tanlash". `formatWeekSummary` renders a compact 7-day rollup (one row per day + totals). Master server's `FinancePage` already supports historical browsing via the date picker (admin-safe view; OWNER P&L via Telegram or legacy Hisobotlar).

---

## 1. Roles (who does what)

| Role | Surface | Daily actions |
|---|---|---|
| **OWNER** | Master admin UI | Reviews reports, audit log, recipe edits. Sets variance thresholds, monthly overhead, Telegram bot. Receives daily summary. |
| **ADMIN** | Master admin UI | Manages menu/tables/users/discounts. Records purchases. Creates/edits recipes. Approves bills. Marks paid / walkout / cancel. Records expenses. Manages debts. |
| **KITCHEN** | Kitchen Display | Login on monoblock. Marks tickets PENDING → IN_PROGRESS → READY. Toggles item availability. |
| **WAITER** | Mobile waiter app | PIN login. Creates orders, adds items, sends to kitchen, requests bill. Cannot cancel after cooking starts. |

---

## 2. Setup phase (rare — once per ingredient / once per recipe)

This is the **new** flow (post Phase 1) for setting up the inventory side. It does not yet drive order behaviour — that's Phase 2.

```
ADMIN creates Ingredient ───► /api/ingredients POST
   { name, buyUnit, recipeUnit, conversionFactor }
   currentStock = 0, weightedAvgCost = 0 initially

ADMIN records Purchase ───► /api/purchases POST
   ONE transactional event with 5 effects:
     1. Expense row created in "Mahsulot xaridi" category
     2. Purchase row created (linked to Expense)
     3. Ingredient.currentStock += quantityRecipeUnit
     4. Ingredient.weightedAvgCost recomputed
     5. IngredientMovement(PURCHASE) appended to ledger
   ONE audit row written: PURCHASE_RECORDED (metadata has expenseId, ingredientId)

ADMIN creates Recipe ───► /api/menu/items/:id/recipe PUT
   Binds menu item to ingredient list with quantities (in recipeUnit)
   isComplete = false initially
   RecipeEdit row written (before/after snapshot)
   AuditLog: RECIPE_CREATED or RECIPE_UPDATED

ADMIN activates Recipe ───► /api/menu/items/:id/recipe/complete POST
   Gate (server-side): every referenced ingredient must be
     - isActive = true AND
     - weightedAvgCost > 0 (i.e. at least one Purchase recorded)
   On fail: 400 VALIDATION with details.ingredientIds = [blocked ones]
```

---

## 3. Order lifecycle (still LEGACY — Phase 2 not yet shipped)

```
WAITER (mobile)
├── Open menu, tap an item ───────────────► orderService.addLine
│       ❶ ❗ stockService.decrement(menuItemId, qty)     ← LEGACY DailyStock
│            (Ingredient.currentStock NOT touched)
│       ❷ OrderLine row written
│            cogsSnapshot column EXISTS but stays NULL  ← Phase 2 will fill
│       ❸ If order is past DRAFT, create new KitchenTicket
│       ❹ Print kitchen ticket if kitchen_printer_enabled
│
├── Send to kitchen ─────────────────────► orderService.send
│       Status DRAFT → SENT; KitchenTicket created
│
├── Add more items ──────────────────────► addLine (each creates a new ticket)
│
├── Request bill ────────────────────────► orderService.requestBill
│       Status SENT → BILL_REQUESTED
│       Emits order:billRequested
│
└── (can NOT cancel once any ticket is IN_PROGRESS)

ADMIN
├── Open Approval Queue ──────────────► sees BILL_REQUESTED orders
│
├── Apply discount + waive service charge ──► billing.service.computeTotals
│       subtotal, discount (capped by settings), service charge → total
│
├── Approve ───────────────────────────► orderService.approve
│       Status BILL_REQUESTED → PENDING_PAYMENT
│       Totals snapshotted on Order
│       deferAfterCommit prints the bill
│       ❗ If print fails: NOT rolled back today (drift from decisions.md, see PRD 03)
│
├── Mark Paid ─────────────────────────► orderService.markPaid
│       Status PENDING_PAYMENT → CLOSED
│       Payment rows created (CASH / CARD / DEBT, can be mixed)
│       If any DEBT payment: Debt row created
│       Verification: sum(payments) == totalSnapshot
│
├── Mark Walkout ──────────────────────► orderService.markWalkout
│       Status PENDING_PAYMENT → WALKOUT
│       NO Payment row created
│       ❗ Service-charge clawback NOT YET WIRED (PRD 08; waiter still credited)
│
└── Cancel ──────────────────────────► orderService.cancelOrder
        Status to CANCELED (from DRAFT/SENT/BILL_REQUESTED only)
        Cascade: PENDING tickets → CANCELED in same tx
        ❗ IN_PROGRESS tickets left as-is (PRD 01 not yet wired)
        Stock RESTORE: only for lines whose ticket was PENDING/null
        Restore goes to DailyStock (legacy), not Ingredient.currentStock

KITCHEN
├── Receives socket event 'ticket:new' ────► refetches active tickets list
├── Tap "Boshlash" ─────► PENDING → IN_PROGRESS
└── Tap "Tayyor"   ─────► IN_PROGRESS → READY (disappears from active list)
```

---

## 4. Money flow

```
INFLOWS                                      OUTFLOWS                          NEITHER
─────────                                    ──────────                        ─────────
CLOSED order:                                Manual expense                    WALKOUT
  Payment row (CASH/CARD/DEBT)                 admin enters in Chiqimlar          food cooked, no payment
  + Debt row if DEBT method                    salary, rent, utilities,           service charge UN-clawed
                                               transport, etc.                    (PRD 08 plans clawback)
DebtRepayment
  CASH or CARD only                          Purchase
  Decreases Debt.remainingAmount               admin enters in Xaridlar          CANCEL (before cook)
  When zero → Debt.status = PAID               Auto-creates Expense in            stock restored
                                               "Mahsulot xaridi" category         no cash effect
                                               + IngredientMovement(PURCHASE)
                                               + ingredient stock + cost          Recipe edit
                                                                                  audit log only
```

### Xaridlar ↔ Chiqimlar — same event, two views

This is the question owners ask most often. **One purchase action produces ONE financial event** that appears on both pages by design:

```
                        ┌──────────────────────────────┐
                        │  Admin: "Xarid kiritish:     │
                        │   10 kg meat, 1,200,000 UZS" │
                        └──────────────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────┐
                    │   purchaseService.record(…)      │
                    │   ONE Prisma transaction         │
                    └──────────────────────────────────┘
                          │                      │
                          ▼                      ▼
                ┌─────────────────┐    ┌────────────────────┐
                │  Purchase row   │    │  Expense row       │
                │  + ingredient   │    │  category =        │
                │    stock-up     │    │  "Mahsulot xaridi" │
                │  + avg-cost     │    │  purchaseId set    │
                │  + movement     │    │                    │
                └─────────────────┘    └────────────────────┘
                          │                      │
                          ▼                      ▼
                ┌─────────────────┐    ┌────────────────────┐
                │ Xaridlar page   │    │ Chiqimlar page     │
                │ inventory view  │    │ cash view          │
                │ of the spend    │    │ rows from a        │
                │                 │    │ purchase show a    │
                │                 │    │ "Xarid" badge      │
                └─────────────────┘    └────────────────────┘
```

**Why both?** FINANCE_PLAN §2.1 ("rost hisob") requires tracking inventory and cash as separate concepts. Same money, two truths:

- Xaridlar = "where did our ingredients come from"
- Chiqimlar = "where did our money go today"

The amber `Xarid` chip on Chiqimlar rows that came from a purchase makes the link visible. Anything without the chip is a manually-entered expense (salary, rent, utilities).

---

## 5. Reports today (`/reports`, hidden from sidebar)

Reads from: `Order`, `Payment`, `Debt`, `DebtRepayment`, `Expense`.

Shows: revenue, payment breakdown (cash/card/debt), expense totals (manual + purchase-driven combined), debt opened/repaid/outstanding.

**Does NOT yet read** `IngredientMovement`, `OrderLine.cogsSnapshot`, `WasteEvent`, `StocktakeEntry`. So today's reports do not show:

- **COGS** — cost of goods sold per closed order
- **Real gross margin** = revenue − COGS
- **Real net profit** = gross margin − operating expenses − monthly overhead
- **Variance loss** — drift caught by stocktake (waste/theft/recipe-error/...)
- **Waste loss** — explicit waste events

These all land in REFACTOR_PLAN Phase 4. Until then, the daily Telegram summary and the Hisobotlar page give *cash truth* (what came in, what went out) but not *profit truth*.

---

## 6. The two stock systems running side by side

The biggest piece of "still messy" state. Phase 6 of the refactor plan retires the legacy system entirely.

| Concern | Legacy (live, still wired) | New (built but not wired into orders) |
|---|---|---|
| Schema | `DailyStock`, `MenuItem.trackStock` | `Ingredient`, `IngredientMovement`, `Recipe`, `Purchase`, `WasteEvent`, `Stocktake`, `StocktakeEntry` |
| Reset cadence | Daily at midnight (UTC, see PRD 07) | Continuous; stocktake event recalibrates |
| Decrement trigger | `orderService.addLine` → `stockService.decrement(menuItemId)` | (none yet — Phase 2 will replace the legacy call) |
| Restore trigger | `cancelOrder` if ticket is PENDING | (Phase 2) |
| UI surface | `/stock` page (hidden from sidebar, deprecation banner) | `/ingredients`, `/purchases`, `/recipes` |
| COGS support | None | `Ingredient.weightedAvgCost` ready; `OrderLine.cogsSnapshot` schema ready |

**While both coexist**:
- Orders still depend on the legacy system. Don't remove `DailyStock` or `MenuItem.trackStock` until Phase 2 ships.
- Owner can configure ingredients + purchases + recipes today, but they don't affect order availability yet.
- Setting up the new system early gives the owner a chance to populate the ledger before Phase 2 activates it.

---

## 7. Known friction points

These are documented, not surprises. Each has a planned fix.

1. **Two stock systems coexisting** — Phase 2 wires recipes into `orderService.addLine`, retires DailyStock in Phase 6.
2. **Same purchase appears on Xaridlar + Chiqimlar** — Now visually linked via the `Xarid` chip on Chiqimlar rows. Not duplication; complementary views.
3. **Walkout still credits waiter's service charge** — PRD 08 (Phase 4) implements clawback.
4. **Print failure does not roll back bill approval** — drift from `decisions.md`; PRD 03 covers redesign.
5. **`IN_PROGRESS` tickets left in legacy state on order cancel** — PRD 01 cascade-on-cancel not yet implemented.
6. **`stockService.today()` uses UTC, not Tashkent local** — PRD 07; new code uses `lib/time.localToday()`. Legacy method left alone until Phase 6.
7. **Hisobotlar / Audit jurnali hidden from sidebar but routes still mounted** — intentional; reachable by URL for owner / debugging.

---

## 8. Phases ahead (from `REFACTOR_PLAN.md`)

| Phase | What it adds | Removes |
|---|---|---|
| **2** (next) | `orderService.addLine` deducts from `Ingredient.currentStock` via recipe; rejects on insufficient; restores symmetrically on cancel. `OrderLine.cogsSnapshot` filled. | Stops calling `stockService.decrement`. |
| **3** | Daily stocktake UI + variance categorisation + `IngredientMovement(STOCKTAKE/ADJUST)`. | — |
| **4** | Waste events, monthly overhead expense, **owner P&L dashboard with real COGS**. New reports replace Hisobotlar. | — |
| **5** | Big-bang setup wizard for new installs / migrations. | — |
| **6** | Drop `MenuItem.trackStock`, `DailyStock` table, `stockService` methods, the old `/stock` page. | All legacy stock code. |

---

## 9. Where to look when something breaks

| Symptom | Likely file |
|---|---|
| Order created but stock didn't change | `apps/master/src/main/server/services/order.service.ts` → `addLine` (legacy path) |
| Purchase didn't update ingredient cost | `apps/master/src/main/server/services/purchase.service.ts` |
| Recipe activation rejected | `apps/master/src/main/server/services/recipe.service.ts` → `setComplete` gate |
| Bill totals look wrong | `apps/master/src/main/server/services/billing.service.ts` |
| Daily Telegram report missing | `apps/master/src/main/server/services/finance-report.service.ts` + scheduler |
| Print didn't fire | `apps/master/src/main/server/services/print.service.ts` (and check `kitchen_printer_enabled`) |
| Walkout marked but cash doesn't reconcile | Expected — no Payment row on walkout; this is by design |
| Same money on Xaridlar AND Chiqimlar | By design — one event, two views, look for the `Xarid` chip on the Chiqimlar row |

---

## 10. How to keep this doc honest

- Update this file whenever a phase from `REFACTOR_PLAN.md` lands.
- Section 6 (legacy vs new) shrinks as Phase 2 + Phase 6 ship.
- Section 7 (friction points) gets crossed off as their PRDs land.
- If a flow described here ever differs from code, the *code* is the truth — update the doc immediately so future readers don't trust a stale diagram.
