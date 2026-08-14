# Money model — design

**Date:** 2026-08-14 · **Status:** designed, not implemented
**Branch:** to be cut from `feat/c1-design-system`
**Scope:** discount, waiter pay, order-line editing, walkout removal, cost discipline. One
decisions document over the whole money loop; each section below becomes its own
implementation plan.

**Supersedes:** `PRD_FOUNDATION.md` §2 (finance) and §4 (UI/UX) where they conflict.
`PRD_FOUNDATION.md` §8's warning against unprompted finance changes stands — the changes
here are prompted and each is named explicitly. `AUDIT_FINDINGS.md` `M-1` (discount caps on
the ad-hoc path) is closed as **won't fix, by decision** — see `D3`.

## 1. Intent

The system had four cost concepts that never met — what someone typed as a dish's cost, what
was paid for stock, what left the drawer, and what a waiter earned — plus two controls that
were pure decoration, and one subsystem that was drawn but never built. This settles which
concepts survive and what each one means.

The guiding rule taken in session: **trust the operator, record what they did.** No caps, no
mandatory reasons, no approval gates. Every decision below follows from it.

| # | Question | Decision |
|---|---|---|
| D1 | What is the service charge, economically | The waiter's pay, in full. Collected on their behalf, not restaurant revenue. Keeping it out of `pnl.revenue` (current behaviour) is correct. |
| D2 | Who does Xodimlar maoshi cover | Waiters only. Service charge is 100% of a waiter's pay. Cooks and other staff stay as ordinary `Expense` rows and are out of scope. |
| D3 | How is discount controlled | Free-form, uncapped. A reason is mandatory. The preset table and both cap settings are deleted. |
| D4 | What if a dish has no tan narx | Required at creation. Enforced at create and edit, for every FOOD item; SERVICE never has one. |
| D5 | How is spoilage and loss tracked | It is not. `Sanoq` stays a plain absolute count correction — no money effect, no reason prompt, no new verb. |
| D6 | What happens to WALKOUT | Deleted outright. An unpaid customer is closed as nasiya or as a 100% discount with a reason. |
| D7 | Where does the admin edit order lines | On the confirm screen, with the same component `OrderPanel` uses. Removing a line stays free of prompts. |
| D8 | Does removing a line need a reason | No. But who did it, to what, and how much is recorded in the audit log. |

## 2. Data model

```prisma
model Order {
  discountAmountSnapshot Decimal?
  discountReason         String?   // NEW — required non-empty when discount > 0
  // REMOVED: appliedDiscountId, appliedDiscount relation
  // REMOVED: walkoutAt, walkoutById, walkoutBy relation, @@index([walkoutAt])
}

model OrderLine {
  canceledById String?   // NEW — who cancelled it
  canceledBy   User?     @relation("OrderLineCanceller", fields: [canceledById], references: [id])
}

model WaiterPayout {          // NEW — the only new table
  id           String   @id @default(cuid())
  waiterId     String
  amount       Decimal
  paidAt       DateTime
  note         String?
  createdById  String
  createdAt    DateTime @default(now())

  waiter       User     @relation("WaiterPayoutRecipient", fields: [waiterId], references: [id])
  createdBy    User     @relation("WaiterPayoutCreator",  fields: [createdById], references: [id])

  @@index([waiterId])
  @@index([paidAt])
}

model User {
  linesCanceled   OrderLine[]    @relation("OrderLineCanceller")
  payoutsReceived WaiterPayout[] @relation("WaiterPayoutRecipient")
  payoutsRecorded WaiterPayout[] @relation("WaiterPayoutCreator")
  // REMOVED: ordersWalkoutMarked, discountsCreated
}

model MenuItem {
  costPrice Decimal?   // stays nullable in the schema; enforced non-null in the service
}

// REMOVED: model Discount, enum DiscountType
// REMOVED: OrderStatus.WALKOUT
```

`AuditAction` gains `ORDER_LINE_CANCELED`, `ORDER_LINE_QUANTITY_CHANGED`,
`WAITER_PAYOUT_RECORDED`.

`AuditAction` **keeps** `WALKOUT_MARKED`, `DISCOUNT_CREATED`, `DISCOUNT_EDITED`,
`DISCOUNT_DELETED`, `DISCOUNT_APPLIED` even though nothing writes them again. `AuditLog` is
append-only; removing the vocabulary a historical row was written with would make the log
unreadable. This is the one place dead enum values are kept on purpose.

`MenuItem.costPrice` stays nullable in the schema because a migration cannot invent a cost
for existing rows. The **service** rejects create and edit without one; existing NULL rows
are surfaced for a human to fill (§6).

## 3. Discount

One path. `billing.service.computeTotals` keeps only the `discountAmount` branch:

```
discount = min(max(typed, 0), subtotal)     // subtotal is FOOD lines only
netFood  = subtotal − discount
total    = netFood + serviceCharge
```

`confirm` rejects the order when `discountAmount > 0` and `discountReason` is empty or
whitespace. The reason is stored on the order, shown in reports next to the discount, and
carried in the `ORDER_CONFIRMED` audit metadata. It is **not** printed on the customer
receipt.

The `largeDiscount` Telegram alert stays exactly as it is — under D3 it becomes the only
discount control, so it must keep working.

**Deleted** (~21 files): `model Discount`, `enum DiscountType`, `Order.appliedDiscountId`,
`discount.service.ts`, `discount.repo.ts`, `discounts.routes.ts`, `discounts.controller.ts`,
`api/discounts.ts`, `DiscountsPage.tsx`, `components/discounts/DiscountPanel.tsx`, the
NavRail entry, `Errors.DiscountCapExceeded`, the `max_discount_percent` /
`max_discount_amount` settings (schema default, `sqlite-bootstrap.ts`, `seed.ts`,
`settings.service.ts` allowlist, the two `SettingsPage` fields), the `discountId` branch of
`computeTotals`, and the gallery fixtures for all of it.

## 4. Waiter pay

Under D1 a payout settles a liability. It must therefore **never** reach `operatingExpense`,
which is why it gets its own table instead of being an `Expense` row.

No balance column is stored. As with `Debt`, the number is derived on read:

```
earned(waiter, range) = Σ Order.serviceChargeSnapshot   WHERE status = CLOSED, waiterId = w
paid(waiter, range)   = Σ WaiterPayout.amount           WHERE waiterId = w
owed(waiter)          = earned(all time) − paid(all time)
```

`earned` already exists — `finance.service.serviceChargeMatrix` computes exactly this. The
Xodimlar maoshi page keeps its day-by-day matrix and gains three columns per waiter:
**Ishlagan · Berilgan · Qoldiq**, plus a payout action.

**Ishlagan and Berilgan follow the selected date range; Qoldiq is always all-time.** A debt
does not shrink because the operator narrowed the date filter, and the number they act on
when handing over cash must be the real one. The column header says so.

**Cash drawer.** A payout is real cash leaving the till, so `finance.service.dailyForAdmin`
changes in one place:

```
totalOut = cashOut + waiterPayoutsToday
```

**P&L is untouched.** Neither the accrual nor the payout appears in `pnl`. Service charge
stays out of `revenue`; the payout stays out of `operatingExpense`. That is the whole point
of D1 and it is what makes the two books agree.

New surface: `POST /api/finance/waiter-payouts` (ADMIN, OWNER), extension of
`GET /api/finance/service-charge` to carry `paid` and `owed`, `WAITER_PAYOUT_RECORDED` audit
rows. No reversal path in v1 — a mistaken payout is corrected by recording the opposite,
which is why `amount` is not constrained to positive.

## 5. Order-line editing

**Correctness is already right and must not regress.** Verified across all four paths
(`order.service.ts:378-397`, `:475-483`, `stock.service.ts:106-137`): add consumes, quantity
increase consumes the delta, quantity decrease restores the delta against the *old* quantity
so the proportional COGS is correct, cancel restores the full quantity. Cancelled lines keep
`cogsSnapshot` and reports filter `isCanceled: false` (`reports.service.ts:472`). Nothing in
this section changes any of that.

**What is missing is the trail.** Neither `updateLineQuantity` nor `cancelLine` writes an
`AuditLog` row today, `OrderLine.canceledReason` is plumbed but the renderer never sends one,
and there is no `canceledById`. Both verbs gain an audit row carrying actor, item name, and
before/after quantity. Under D8 no reason is prompted, so `canceledReason` stays nullable and
unused by the UI.

**What is missing is the place.** `OrderTicket` renders the lines read-only, so changing an
order at the moment of payment means leaving the confirm screen entirely. A shared
`OrderLineEditor` component replaces the line list in both `OrderTicket` and `OrderPanel`:

- per row: `−` · quantity · `+`, where `−` at 1 removes the line. No separate trash button and
  no confirmation step — the action is one tap and it is reversible by re-adding.
- `+ Mahsulot qo'shish` keeps the order visible while picking. The exact split is settled at
  implementation against the real 1366×768 frame; the requirement is that the operator can
  see what is already on the order while adding to it.
- cancelled lines leave the list and collapse into one row ("2 ta pozitsiya olib tashlandi")
  that expands on tap.

`editLineNote` is opened to ADMIN, matching the other three line verbs.

## 6. Cost price

`menu.service.create` and `menu.service.update` reject a FOOD item without a positive
`costPrice`. SERVICE items must not carry one.

Existing rows with `costPrice = NULL` keep selling and keep booking zero COGS — blocking a
sale over an admin's data-entry gap is the wrong trade on a till. Instead the Ombor page
gains a "tan narx kiritilmagan" marker and a filter for them, so the list can be cleared by
hand once. The daily finance screen names the count of such items while any remain.

## 7. WALKOUT removal

Order states become `DRAFT → SENT → CLOSED`, with `DRAFT|SENT → CANCELED` as the only
terminal branch.

43 files across all three apps. Server: `OrderStatus.WALKOUT`, `Order.walkoutAt`,
`walkoutById`, the `User.ordersWalkoutMarked` relation, `@@index([walkoutAt])`,
`orderService.markWalkout`, `orderRepo.setWalkout`, the controller action, the route, and
every walkout branch in `reports.service.ts` (34 references), `finance.service.ts`,
`alert.service.ts`, `telegram-bot.service.ts`, `pdf-report.ts`, `me.controller.ts`,
`table.repo.ts`. Renderer: `WalkoutOrderDialog.tsx` deleted, plus `ApprovalQueuePage`,
`OrderTicket` ("To'lamay ketdi" button), `OrdersPage`, `OrderPanel`, `CancelOrderDialog`,
`RecentOrdersList`, `IncidentsSection`, `SalesSummary`, `GrandSummarySection`,
`report-helpers`, `ReportsPage`, `audit-labels`, `api/orders`, `api/reports`, `api/finance`,
`useSocket`. Order and mobile apps: their status unions and socket handlers. Gallery fixtures
for orders, finance, reports and audit.

This deletes known defect #3 in `CURRENT_WORKFLOW.md` §11 (walkout loss structurally always
zero) rather than fixing it.

**Migration:** convert any existing `WALKOUT` order to `CANCELED` with
`cancelReason = "Hisob to'lanmagan (eski yozuv)"`, then drop the enum value and the columns.
`dev.db` is reseeded routinely and this system is not deployed, so no production data is at
risk; the conversion exists so a stale local database does not break the migration.

**Closing an unpaid order** works today and needs no change: `OrderTicket`'s gate is
`paid === due` (`:56-58`), so a 100% discount with the payment leg zeroed submits, and the
server accepts `totalPaid === totalDue === 0`. `CURRENT_WORKFLOW.md` §11 defect #12 is stale
— it cites the deleted `ConfirmModal`.

## 8. What is untouched

Verified correct in this session and deliberately not changed:

- **Ingredient purchases excluded from operating expense.** Counting both the purchase and
  the COGS would count the same money twice. The guard is right.
- **`cashOut` ≠ `expenseNet`.** Same-day reversals only. This is the fix for a real
  production incident (`MOLIYA_KASSA_HISOBLASH_XATOSI.md`).
- **Stock moves at line-add**, restores from both DRAFT and SENT. An earlier proposal in this
  session to stop restoring from SENT was withdrawn: food removed from a bill comes back, and
  the count must come back with it.
- **`Sanoq` corrects the count and nothing else** (D5).
- **Expense repayable / return / write-off / reversal machinery** — out of scope entirely.

## 9. Adjacent, flagged — needs a separate call

Not part of this design; listed because the work lands in the same files.

- **`serviceChargeWaived` / `waiveServiceCharge`** — 19 references across schema, service,
  controller and the `SERVICE_CHARGE_WAIVED` audit action. `billing.service.ts:119-121`
  documents it as inert: with no SERVICE lines the charge is naturally zero. It is dead
  weight in the confirm path this design already rewrites.
- **ADMIN reads `pnl.profit`** over `/api/finance/daily` (`RENDERER_REBUILD.md` §4). Untouched
  here; §4 of this document changes what feeds the drawer, not who may read profit.

## 10. Verification

No test runner exists. Each slice is verified by:

- `pnpm typecheck` (`tsc -b` — the only command that checks `src/main`; 51 pre-existing errors
  there, all unrelated), `pnpm run typecheck:renderer`, `pnpm run typecheck:gallery`
- the Docker headless harness (`compose.dev.yaml`) plus the HTTP smokes
- new smoke coverage: `smoke-waiter-payout.ts` (earned/paid/owed reconcile, payout absent from
  `pnl`, present in `totalOut`), and extension of `smoke-e2e-flow.ts` for the discount-reason
  gate and the removal of walkout
- `pnpm gallery:page` for every screen this touches

## 11. Slices

Each is independently shippable, in this order. The first two clear surface the rest sits on.

1. **WALKOUT removal.** Pure deletion, no new behaviour, largest file count. Doing it first
   stops every later slice from having to carry walkout branches.
2. **Discount simplification.** Deletion plus one column and one validation.
3. **Order-line editing.** The shared `OrderLineEditor`, plus the audit rows and
   `canceledById`.
4. **Cost price discipline.** Service validation, Ombor marker and filter.
5. **Waiter pay.** The only new table and the only new screen behaviour.

## 12. Out of scope

Split and merge bills, per-line discounts, discount approval workflow, spoilage and waste
tracking, payroll for non-waiter staff, wage rates and periods, payout reversal, Click and
Payme, per-dish discount allocation in reports.
