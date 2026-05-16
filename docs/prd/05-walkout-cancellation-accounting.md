# PRD 05 — Walkout & cancellation accounting

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Domain (finance reporting, owner visibility, audit)
- **Related code:** `apps/master/src/main/server/services/order.service.ts` (markWalkout, cancelOrder), `…/services/reports.service.ts` (buildOrdersTable, buildKitchenProduction), `…/services/finance-report.service.ts`, `apps/master/prisma/schema.prisma` (Order, AuditLog)
- **Related docs:** `docs/FINANCE_PLAN.md`, `docs/FINANCE_IMPLEMENTATION_SPEC.md`, `docs/agent-plans/00-shared/decisions.md`

---

## 1. Context

Two order outcomes consume real resources but produce zero revenue:

- **WALKOUT** — customer left without paying. Food was cooked and served. Stock was consumed. (`order.service.ts:790-827`)
- **CANCELED-after-cooking** — order was cancelled while one or more kitchen tickets were `IN_PROGRESS` or `READY`. Food was prepared (some of it) but never billed. Stock was *not* restored for cooked lines (`order.service.ts:153-161`). PRD 01 proposes formalising this with an `ABANDONED` ticket status.

Today the daily and monthly reports treat these as terminal events but the **financial visibility is shallow**:

- Walkouts flow through `buildOrdersTable(walkoutOrders, 'WALKOUT')` in `reports.service.ts:105-127`, which produces a per-order row with gross/discount/net/service. Aggregated as "walkout loss" in the daily summary. So the owner can see "today we lost X UZS to walkouts."
- Cancellations flow through the same builder. So a cancelled order appears in `buildOrdersTable(canceledOrders, 'CANCELED')`, but with a critical accounting hole: **the gross/net shown is the gross of all lines (including ones the cook never started)**, not the gross of "what was actually cooked." That number is misleading for resource-loss accounting.
- `buildKitchenProduction` (lines 173+) does already track `qtyCanceledBeforeCooking` vs `qtyCanceledAfterStart`. The data is there. It's just not joined into the financial picture.
- Per-waiter stats: the daily report has a per-waiter breakdown but **walkout rate by waiter is not surfaced**. Walkout is an admin action, not a waiter action, but the waiter is the one who failed to pre-collect (in a chayxana the waiter is responsible for the cheque).

So the owner today sees revenue and a "walkouts: 2" line, but cannot answer:

- "Which waiter has had three walkouts this month?"
- "Of cancelled orders, how much food was actually cooked and wasted?"
- "What is my food-cost loss to walkouts + post-cook cancellations?"

These are the questions any restaurant owner asks. Today the data exists but the reporting model doesn't join it.

**Doc-vs-code contradiction:** `FINANCE_PLAN.md` §2.1 ("rost hisob" / true accounting) lists five separate concepts that must be tracked distinctly: *savdo bo'ldi* (sale happened), *pul tushdi* (money received), *qarz ochildi* (debt opened), *qarz qaytdi* (debt repaid), *chiqim qilindi* (expense incurred). Walkout and cooked-waste cancellations are conceptually "*pul tushmadi*" with consumed COGS — neither sale nor expense, but a loss event. The plan does not name this category explicitly, and the code follows suit: walkouts are aggregated as "negative revenue" rather than "loss with attributable cause."

## 2. Goals / Non-goals

### Goals

- Surface walkouts and cooked-cancel-waste as **distinct named loss categories** in the daily and monthly owner report — not folded into "revenue minus zero."
- Provide a **per-waiter walkout count and rate** in the per-waiter breakdown.
- For cancellations, separate "before-cook" (no loss) from "after-cook" (food-cost loss).
- Ensure the audit log captures enough context to reconstruct the loss event later (today: walkout reason is captured; cancellation reason is captured; *which lines were already cooked* is not directly recorded).
- Specify whether these loss categories are **owner-only** or visible to admin.

### Non-goals

- Implementing a full COGS module. We don't have menu-item cost prices yet; the loss is measured at *sell price* not *cost price*. Adding a cost-price field is a separate PRD.
- Changing the order state machine. (PRD 01 covers ticket-state composition.)
- Changing who can mark walkout / cancel. Authorisation rules are locked in `decisions.md`.
- Multi-day loss-trend reporting (sparklines, charts). The monthly report is enough for v1.

## 3. Current state (code-grounded)

| Concern | File / lines | Behaviour |
|---|---|---|
| Mark walkout | `order.service.ts:790-827` | Transitions PENDING_PAYMENT → WALKOUT; logs `WALKOUT_MARKED` audit event with `{ orderId, amount, reason }`. |
| Mark cancel | `order.service.ts:612-668` | Transitions to CANCELED; logs `ORDER_CANCELED` with reason; cascades PENDING tickets to CANCELED; restores stock only for PENDING/null-ticket lines. |
| Walkout in reports | `reports.service.ts:298-303, 359` | Walkout orders listed via `buildOrdersTable(..., 'WALKOUT')`; the row's "gross" is `subtotalSnapshot` (the bill total). |
| Cancellation in reports | `reports.service.ts:295-300, 358` | Cancel orders listed via `buildOrdersTable(..., 'CANCELED')`. **Same row shape as walkout: gross is the full subtotal even though only some lines were cooked.** |
| Kitchen production stats | `reports.service.ts:173-220` | `qtyCanceledBeforeCooking` vs `qtyCanceledAfterStart` per meal — **not joined to order-level totals.** |
| Per-waiter view | `reports.service.ts` (in daily report aggregation) | Counts orders, revenue. **Walkout per waiter not surfaced.** |
| Owner Telegram summary | `finance-report.service.ts:45-95` | Calls `reportsService.daily(date)`, formats via `telegramBotService.formatReportMessage`. Walkouts visible; cooked-waste cancellation losses not split out. |
| Owner-only gate | Reports endpoint, role check | Owner sees full numbers; admin sees operational subset. (Per `decisions.md` and audit fix). |
| Audit on cancel | `order.service.ts:650-659` | Captures `reason`. Does **not** snapshot which lines had `kitchenTicket.status` at cancel time — that info is derivable from kitchen-ticket history but not denormalised on the cancel event. |

### Key gap

`buildOrdersTable` for `CANCELED` orders presents the *full pre-cancel subtotal* as the gross. For an order with five lines where the cook cooked one of them before the cancel, this overstates the actual food-cost loss by 4×. The owner reading the report concludes "we cancelled 200,000 UZS today" when the real cooked-waste is 40,000.

## 4. Options

### Option A — Three named loss columns, computed per order

Extend `buildOrdersTable` (and the underlying ReportOrder shape) to compute three new fields:

- `cookedValueLost` — sum of `unitPriceSnapshot * quantity` for lines where the parent ticket reached `IN_PROGRESS` or `READY` before order termination. Always 0 for CLOSED orders.
- `uncookedValueAvoided` — sum for lines that never started cooking (stock was restored). 0 for WALKOUT.
- `lossCategory` — enum: `WALKOUT`, `CANCEL_AFTER_COOK`, `CANCEL_BEFORE_COOK`, derived from the order status + whether any line has `cookedValueLost > 0`.

Daily report aggregations:

- Walkout total = sum of total (cooked + service).
- Cancel-waste total = sum of `cookedValueLost` for cancellations.
- Cancel-avoided total = informational only (this is the "we recovered the stock" number).

Per-waiter view gains a "walkout count / walkout amount" pair.

- **Pros:** clean separation, matches the FINANCE_PLAN §2.1 principle. Owner sees the real food-cost loss, not a misleading subtotal. Per-waiter visibility surfaces operational issues without naming-and-shaming (numbers, not stories).
- **Cons:** requires reading kitchen-ticket status at report time. Already done in `buildKitchenProduction`. Performance impact is small.
- **Schema impact:** none required if we compute live. Optional: denormalise `cookedValueAtCancelSnapshot` onto `Order` for query speed if monthly reports get slow.

### Option B — Snapshot the loss at cancel time

When an order is cancelled or marked walkout, compute the cooked-line value **once** and write it to a new `Order.lossAmountSnapshot` column. Reports just read that column.

- **Pros:** O(1) read at report time. Snapshot is stable even if line data is later edited.
- **Cons:** schema migration. Tightly couples the cancellation flow to a financial metric — every future change to "what counts as cooked" requires a migration. Cannot retroactively compute for already-cancelled orders without backfill.

### Option C — Loss is a separate `LossLedger` entry per termination event

A more aggressive FINANCE_PLAN-aligned design. On every termination (CLOSED, CANCELED, WALKOUT), write a `LossLedger` row capturing:

```
LossLedger {
  id, orderId, eventType (WALKOUT | CANCEL_WITH_COOK | CANCEL_NO_COOK),
  amountSellPrice, occurredAt, occurredByUserId, reason
}
```

Reports read `LossLedger`. The `Order` table stays purely operational.

- **Pros:** matches the FINANCE_PLAN "immutable counter-entry" model (§2.2). A correction creates a *reversal* row, not an edit. Easiest to extend later with cost-price columns. Sharpest reporting story.
- **Cons:** highest implementation cost. New table, repo, service, audit-on-write logic. Reports must be re-pointed to read from LossLedger rather than from Order joins.

### Option D — Status quo + per-waiter walkout count only

Minimal-change variant: just add walkout count per waiter in the per-waiter section. Don't fix the cancelled-order overstatement.

- **Pros:** tiny code change. Solves the most-asked owner question ("who keeps letting them walk?").
- **Cons:** leaves the bigger food-cost-loss overstatement unfixed. Owner continues to see misleading cancel-loss numbers.

## 5. Decision matrix

| Dimension | A (live compute, 3 columns) | B (snapshot column) | C (LossLedger) | D (per-waiter only) |
|---|---|---|---|---|
| Owner sees real cooked-waste | Yes | Yes | Yes | No |
| Per-waiter walkout visibility | Yes | Yes | Yes | Yes |
| Aligns with FINANCE_PLAN §2.1/2.2 | Mostly | Partially | Fully | Partially |
| Schema change | No | Yes (one col) | Yes (one table) | No |
| Retro-applicable | Yes | No (needs backfill) | Yes (backfill possible) | Yes |
| Report query cost | Medium (joins kitchen tickets) | Low | Low | Low |
| Effort | M | M | L | S |
| Reversibility / correction model | Edit code | Edit + backfill | Counter-entry | N/A |

## 6. Open questions

1. **Should "service charge on walkout" be counted as loss or as never-earned?** Walkout has `serviceChargeSnapshot` from the bill. Did the waiter "earn" the service charge on food they failed to collect for? Linked to PRD 08.
2. **Is cooked-waste a number the owner wants daily, or is monthly enough?** Daily-Telegram could surface walkouts (high salience) and roll up cooked-waste monthly. Or both daily.
3. **How is "cooked" defined exactly?** Today the proxy is "ticket reached IN_PROGRESS or READY." But cook might have started preparing without flipping the ticket status. Should we trust the timestamp or accept the model?
4. **Loss correction workflow:** if an admin marks something WALKOUT and the customer comes back the next day to pay, how is that reversed? Today there's no explicit reversal path — they'd have to re-create the order. Option C handles this cleanly; A and B don't.
5. **Admin vs owner gate:** should the admin see cooked-waste numbers? `decisions.md` says admin doesn't see profit, but cooked-waste is an operational signal admin acts on. Probably visible.

## 7. Recommendation

**Option A** as the immediate move; **promote to Option C** during the next finance-module rewrite (~6 months) when COGS / cost-price is added.

Rationale:

- The data exists. `buildKitchenProduction` already computes per-line cook-state. Joining that into `buildOrdersTable` is a tractable, in-place change.
- Option A is reversible and doesn't pre-commit to a schema. If we discover monthly reports need denormalised values for speed, Option B's snapshot column is an additive follow-up.
- Option C is the right *eventual* model but it's a real rewrite of the reports module. Bundling it with COGS / menu-cost-price work makes it worth the cost; doing it standalone right now is premature.
- Option D is a half-fix and leaves the overstated-cancel-loss visible; rejected.

## 8. Rollout

### Phase 1 — Option A implementation

1. Extend `ReportOrder` type / include shape to ensure `lines.kitchenTicket.status` and `lines.kitchenTicket.startedAt` are loaded for cancelled and walkout orders (already loaded for kitchen-production builder; verify and reuse).
2. Add `computeOrderLoss(order)` helper in `reports.service.ts` returning `{ cookedValueLost, uncookedValueAvoided, lossCategory }`. Pure function over already-loaded data.
3. Update `buildOrdersTable` to include the three new fields on CANCELED and WALKOUT rows. For CLOSED orders, the fields are all zero.
4. Add aggregate roll-ups to the daily report: `dailyWalkoutLoss`, `dailyCancelCookedWaste`, `dailyCancelStockSaved`. Surface in owner Telegram summary.
5. Per-waiter section: add `walkoutCount`, `walkoutAmount`, `cancelCookedWasteAmount`.
6. UI: extend the Reports page (`apps/master/src/renderer/pages/ReportsPage.tsx`) to render the new columns. Owner-only.
7. Add a one-paragraph note in the daily Telegram template explaining the three categories so the owner builds the mental model.

### Phase 2 — observability and sanity checks

- Log a daily sanity assertion: `sum(closed.totalSnapshot) + sum(walkout.totalSnapshot) + sum(cancel.cookedValueLost) + sum(cancel.uncookedValueAvoided)` reconciles against `sum(all order subtotals where status is terminal today)`. Off-by-one issues should fail loudly.
- Surface unreconciled days in the owner's morning summary.

### Phase 3 (later, with COGS PRD) — promote to Option C

- Add `MenuItem.costPriceSnapshot` (the cost when the line was created — currency at the time).
- Introduce `LossLedger` and migrate `Order.lossAmountSnapshot` (if Phase 2 added one) into ledger entries.
- Allow corrections by issuing counter-entries with `eventType: REVERSAL` referencing the original ledger row.
- Reports re-pointed to read the ledger.

### Audit changes

- On cancel: include in the audit `metadata` a denormalised `linesCookedAtCancel: [{ lineId, quantity, unitPriceSnapshot, ticketStatus }]` array. Pure data, derivable from the line/ticket state at cancel time. This is the recovery trail for future audits and for the LossLedger backfill if/when Phase 3 happens.
- On walkout: existing `amount` field is sufficient; consider adding `paymentDueAt` (the time PENDING_PAYMENT was entered) so we can compute how long the customer was at the table before walking out.

### Rollback

- Phase 1 is fully reversible — drop the new computed columns from the report response and the UI.
- Phase 3 is the only one with schema impact; if it ever needs to be rolled back, the ledger remains as historical data and the computed fields fall back to live computation.
