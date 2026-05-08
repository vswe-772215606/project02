# Financial Reporting Audit — Chayxana Master POS
**Date:** 2026-05-08  
**Auditor:** System Review  
**Scope:** Full financial reporting pipeline — data model, service layer, API, and UI

---

## Executive Summary

The financial reporting system contains **3 critical calculation errors**, **6 structural/performance defects**, and **8 missing business-logic features** that together prevent the owner from getting a truthful, complete picture of the business. The most urgent issues are:

1. `canceledBy` is hardcoded to `'system'` — management cannot tell who voided an order
2. Monthly report runs 28–31 sequential full DB reads (N+1) — will time out on any reasonable month
3. The debt query fetches the entire lifetime debt ledger for every daily report — no lower-bound filter
4. Waiter performance exists only inside the daily revenue section — no historical per-waiter view, not linked from the Users page
5. Expenses have no creator attribution in the report view, no date-manipulation safeguard, and their monthly trend is invisible

---

## Category 1 — Critical: Wrong Numbers Reaching the Owner

These issues produce **incorrect or fabricated data** in the reports that are already visible today.

---

### C1-1 · `canceledBy` Hardcoded to `'system'`
**File:** `reports.service.ts:476`  
**Severity:** Critical — accountability gap

```typescript
// CURRENT (wrong)
cancellations: canceledOrders.map((order) => ({
  canceledBy: 'system',   // ← always 'system', never the real user
  reason: order.cancelReason ?? '',
}))
```

The `Order` schema has no `canceledById` column. The audit log (`AuditAction.ORDER_CANCELED`) contains the real actor but is never queried in reports. The owner cannot determine whether a staff member is systematically voiding orders — a common revenue-leakage vector.

**Fix required:** Add `canceledById String?` to the `Order` model, populate it in `order.service.ts` during the cancel operation, and expose it in the report.

---

### C1-2 · `walkout.markedBy` Uses the Bill-Approver's ID
**File:** `reports.service.ts:482`  
**Severity:** Critical — fabricated attribution

```typescript
// CURRENT (wrong)
walkouts: walkoutOrders.map((order) => ({
  markedBy: order.approvedById ?? 'unknown',  // ← who approved the bill, not who marked walkout
}))
```

`approvedById` is the person who printed the bill. The person who later pressed "Walkout" is a different action. These can be different staff members. Reporting the approver as the walkout marker is factually incorrect.

**Fix required:** Add `walkoutMarkedById String?` to `Order`, populate it in the walkout operation, surface it in the report.

---

### C1-3 · `mealSales.grossSales` Can Diverge from `orders.grossSales`
**File:** `reports.service.ts:153` vs `reports.service.ts:334`  
**Severity:** High — reconciliation failure

```typescript
// mealSales path: line-by-line multiplication
existing.grossSales = existing.grossSales.plus(line.unitPriceSnapshot.mul(line.quantity));

// orders path: stored snapshot
grossSales = grossSales.plus(dec(order.subtotalSnapshot));
```

`subtotalSnapshot` is computed once at approval time and stored. `mealSales.grossSales` recomputes from individual lines. If any lines were added after snapshot capture, or if integer rounding differs across Decimal operations, the two totals will not match. The "Tekshiruv" (reconciliation) section does not compare these two numbers, so the discrepancy is invisible.

**Fix required:** Add a reconciliation check comparing `mealSalesGross` vs `ordersGross`. Flag non-zero difference as a data-integrity warning.

---

### C1-4 · Service Charge Is a Flat Per-Order Fixed Amount
**File:** `billing.service.ts:76–78`, `settings`  
**Severity:** High — wrong business model implementation

```typescript
const serviceCharge = opts.serviceChargeWaived
  ? 0
  : settingsService.getInt('service_charge_amount');  // ← fixed integer, same for every order
```

A 50,000 UZS order and a 2,000,000 UZS order pay exactly the same service charge. Industry standard is a **percentage** (e.g., 10% of `netFood`). The current flat amount either over-charges small orders or under-charges large ones, and the profit report treats service charge as a separate line excluded from restaurant revenue — which means **large-table margins are being systematically understated**.

**Fix required:** Add `service_charge_type` setting (`PERCENT` / `FIXED`) and recalculate accordingly.

---

### C1-5 · Reversed Expense Counted in "Kiritilgan chiqim" (Gross Recorded)
**File:** `expense.service.ts:64–66`  
**Severity:** Medium — misleading label

```typescript
if (item.status === ExpenseStatus.ACTIVE || item.status === ExpenseStatus.REVERSED) {
  gross = gross.plus(item.amount);   // REVERSED expense added to gross
}
```

An expense with status `REVERSED` was already undone. Including it in "Kiritilgan chiqim" (Gross Recorded Expense) double-counts it — the label implies this is money that actually left the business, but a `REVERSED` expense was cancelled. The math is ultimately correct (gross − reversal = net), but the gross figure shown in the UI is **not** the total money spent. An owner looking at "Kiritilgan chiqim = 500,000" when actual spend is 200,000 will be confused.

**Fix required:** Compute `gross` from `ACTIVE` expenses only. The `REVERSED` records should appear only in the detail list, not in the gross total.

---

### C1-6 · Monthly `salesBasedProfit` Excludes Service Charge from Revenue
**File:** `reports.service.ts:402`, `ReportsPage.tsx:487`  
**Severity:** Medium — unclear policy enforced silently

The UI explicitly states "Xizmat haqi restoran foydasiga qo'shilmaydi" (service charge not added to restaurant profit). However, this is a hardcoded policy with no configuration. If the restaurant keeps service charge income (common), **every monthly profit figure is understated** by the total service charge collected. The monthly view shows service charge separately but never adds it to the profit column.

**Fix required:** Add `include_service_charge_in_profit` setting (default `false`). When enabled, `salesBasedProfit = netSales + serviceCharge − expenseNet`.

---

## Category 2 — Structural: Architecture & Performance Defects

These do not necessarily show wrong numbers today but will cause **timeouts, stale data, or hidden failures** as data grows.

---

### S2-1 · Monthly Report Runs 28–31 Sequential DB Reads (N+1)
**File:** `reports.service.ts:501–506`  
**Severity:** Critical — will time out

```typescript
// CURRENT (sequential — blocks for every day)
while (cursor < monthEnd) {
  daily.push(await this.daily(new Date(cursor)));  // ← each awaited one by one
  cursor.setDate(cursor.getDate() + 1);
}
```

Each `daily()` call fires 5 parallel Prisma queries (closed orders, canceled, walkout, expenses, debts). With 31 days that is **155 sequential database operations**. On a moderately busy restaurant database this will exceed HTTP timeout. Already the debt sub-query within each day has no lower-bound filter (see S2-2), multiplying the cost.

**Fix required:** Replace sequential loop with `Promise.all` over all day cursors.

---

### S2-2 · Debt Query Has No Lower-Bound — Fetches Full Lifetime Ledger
**File:** `reports.service.ts:305–313`  
**Severity:** High — unbounded growth

```typescript
prisma.debt.findMany({
  where: {
    openedAt: { lt: dayEnd },   // ← no lower bound: fetches ALL debts ever created
  },
  include: reportDebtInclude,
})
```

On day 1: 0 rows. After 1 year of operations: potentially thousands of rows with full repayment history, fetched and loaded into memory for every single daily report. The in-memory filter happens later in `buildDebtLedger`. This will eventually OOM the Electron process.

**Fix required:** Add a meaningful lower bound. For daily reports: `openedAt: { gte: threeYearsAgo, lt: dayEnd }`. Additionally, scope to only debts with `status !== 'PAID' OR openedAt within 30 days`.

---

### S2-3 · `Debt.remainingAmount` Is a Stale Denormalized Field
**File:** `schema.prisma:415`, `reports.service.ts:235`  
**Severity:** Medium — source of truth ambiguity

The `Debt` model stores `remainingAmount` as a column that is updated on each repayment. The `buildDebtLedger` function **ignores this field** and recomputes remaining from the repayment list. This means:

- Two different values exist for "remaining debt" depending on which code path runs
- If a bug in repayment processing leaves `remainingAmount` stale, the report shows correct data but the live debt screen shows wrong data (or vice versa)

**Fix required:** Remove `remainingAmount` from the schema and always derive it from `originalAmount − Σrepayments`. Or keep it but add a nightly reconciliation assertion.

---

### S2-4 · No `canceledById` / `walkoutMarkedById` on Order Schema
**File:** `schema.prisma:247–284`  
**Severity:** High — missing audit trail in data model

(Companion to C1-1 and C1-2.) The Order model has `approvedById` but no equivalent fields for cancel or walkout actors. The audit log tracks these actions but the report service never joins audit logs, requiring a separate N+1 query to recover actor names. The fix is a schema column.

---

### S2-5 · Expense `occurredAt` Accepts Any Past/Future Date — No Safeguard
**File:** `expense.controller.ts:10`, `expense.service.ts:102–148`  
**Severity:** Medium — historical manipulation risk

```typescript
occurredAt: z.string().datetime(),   // accepts any valid ISO datetime
```

An admin can record an expense for yesterday, last week, or last month. The same-day reversal check (`isSameLocalDay(original.occurredAt, new Date())`) operates on `occurredAt`, so a backdated expense can never be reversed. This means:

- Expenses can silently inflate costs for closed days
- Reports that were already reviewed become retroactively different
- There is no audit of who entered which backdated expense (the `createdAt` field shows actual entry time but isn't compared to `occurredAt`)

**Fix required:** Validate that `occurredAt` is within the current calendar day (allow ±1 day tolerance for timezone). Log a warning or require OWNER confirmation for backdated entries.

---

### S2-6 · Monthly Debt Outstanding Uses Last Day's Snapshot
**File:** `reports.service.ts:534`  
**Severity:** Medium — incomplete for partial-month queries

```typescript
const monthDebtRows = daily.at(-1)?.debtLedger ?? [];  // last day of the month only
```

If the user views a month that is not yet complete (current month), `daily.at(-1)` is today's report. Any debt opened after today but before month-end is invisible. More importantly, the "end of month outstanding" metric is only meaningful for completed months but no distinction is made in the UI.

**Fix required:** Label the figure as "as-of {last available date}" and note when the month is incomplete.

---

## Category 3 — Missing Features: Incomplete Business Picture

These are gaps that prevent the owner from making informed decisions.

---

### M3-1 · No Per-Waiter Historical Report — Not Linked from Users Page
**File:** `UsersPage.tsx`, `ReportsPage.tsx:296–333`  
**Severity:** High — explicitly requested by owner

The daily report has a waiter breakdown table but it is:
- Scoped to one day only
- Buried inside the "revenue" detail section of the daily view
- Not clickable — no drill-down
- Not accessible from the Users management page at all

The owner cannot answer: "How much revenue did Azizbek generate this month? How many cancellations?" without manually summing 31 daily reports.

**Fix required:**
1. New API endpoint: `GET /api/reports/waiter/:waiterId?from=YYYY-MM-DD&to=YYYY-MM-DD`
2. New `WaiterReportModal` component in UsersPage for WAITER users
3. Metrics: total orders, gross revenue, net revenue (after discounts), service charge earned, cancellation count (for orders they took), avg order value, active days

---

### M3-2 · Monthly Report Has No Per-Waiter Aggregation
**File:** `reports.service.ts:540–558`  
**Severity:** High — missing business intelligence

The monthly totals object has no `perWaiter` breakdown. The daily sub-reports contain waiter data but the monthly summary doesn't aggregate it. Viewing a waiter's monthly performance requires opening 31 daily modals.

**Fix required:** Aggregate `perWaiter` in `monthly()` by summing across all daily `perWaiter` arrays.

---

### M3-3 · Expenses Show No Creator in Report View
**File:** `ReportsPage.tsx:353–368`  
**Severity:** High — accountability gap

The expense detail table in the report shows: time, category, reason, signed amount. It does **not** show who entered the expense (`createdByName` is already in the data but not rendered in the reports table). The owner cannot tell if a large expense was entered by themselves or a staff member.

**Fix required:** Add "Kim tomonidan" (entered by) column to the expense detail table in the daily report view.

---

### M3-4 · No "Revenue Lost to Cancellations" Metric
**File:** `reports.service.ts`  
**Severity:** Medium — missing risk indicator

Canceled orders exist in the report register but there is no summary metric: "X orders canceled, potential revenue lost: Y UZS." The owner sees the count but not the financial impact.

**Fix required:** Add `canceledOrdersGross` and `walkoutOrdersGross` to the daily summary metrics, computed from `subtotalSnapshot` of those orders.

---

### M3-5 · Expenses Not Linked to Any Operational Context
**File:** `schema.prisma:385–406`  
**Severity:** Medium — structural gap

Every expense is recorded against a category + date. There is no connection to:
- Which shift/period it belongs to
- Whether it is a recurring operational cost vs one-off
- Any supplier or vendor

This means the profit calculation (`netSales − expenseNet`) mixes all expense types equally. The owner cannot distinguish "cost of goods purchased today" from "a one-time equipment repair" in the profit figure.

**Fix required (phased):**
- Phase 1: Add `expenseType` enum (`OPERATIONAL` / `COGS` / `ONE_TIME`) to Expense model
- Phase 2: Show expense breakdown by type in the profit section

---

### M3-6 · No Cancellation Rate or Waste Metric per Waiter
**File:** `reports.service.ts:323–353`  
**Severity:** Medium — missing staff performance signal

The per-waiter table shows: orders, revenue, service earned. It does not show:
- How many lines that waiter canceled after sending to kitchen (post-cooking waste)
- How many full-order cancellations they presided over

A waiter with 20 orders but 8 post-start line cancellations is a different story from one with 20 orders and 0.

**Fix required:** Add `lineCanceledAfterStart` and `ordersCanceled` to the `perWaiter` aggregation in `daily()`.

---

### M3-7 · No Daily Expense Budget / Target — No Variance Reporting
**File:** entire expense module  
**Severity:** Low–Medium — planning gap

Expenses are recorded but there is no concept of a daily or monthly budget. The owner cannot know whether 500,000 UZS in expenses today is normal, high, or critical without comparing mentally to memory.

**Fix required:** Add optional `dailyBudget` or `monthlyBudget` to `ExpenseCategory`. Show budget vs actual in the expense breakdown table.

---

### M3-8 · Monthly View Calendar Shows Only `realCashIn` per Day
**File:** `ReportsPage.tsx:797–803`  
**Severity:** Low — surface-level but misleading

The calendar cell shows order count and `realCashIn`. A day with zero orders but 300,000 UZS of debt repayments shows a positive cash figure. An owner glancing at the calendar would think it was a normal sales day.

**Fix required:** Show `netSales` (from orders) and `realCashIn` (total cash including repayments) separately in the calendar cell, or at minimum label the figure.

---

## Implementation Tasks

Tasks are ordered by urgency and dependency.

### Sprint 1 — Critical Fixes (no schema migration needed)

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| T1 | Replace sequential monthly loop with `Promise.all` | `reports.service.ts` | P0 |
| T2 | Add lower-bound to debt query (90-day lookback for closed debts) | `reports.service.ts` | P0 |
| T3 | Fix expense gross: count only `ACTIVE` in gross (not `REVERSED`) | `expense.service.ts` | P1 |
| T4 | Add `canceledOrdersGross` + `walkoutOrdersGross` to daily summary | `reports.service.ts` | P1 |
| T5 | Add `createdByName` column to expense detail table in report view | `ReportsPage.tsx` | P1 |
| T6 | Add per-waiter aggregation to monthly totals | `reports.service.ts` | P1 |
| T7 | Add waiter report endpoint + service method (date range) | `reports.service.ts`, new route | P1 |
| T8 | Add waiter report button + modal to UsersPage (WAITER role only) | `UsersPage.tsx` | P1 |
| T9 | Add line-canceled and orders-canceled counts to perWaiter metrics | `reports.service.ts` | P2 |
| T10 | Add mealSalesGross vs ordersGross reconciliation check | `reports.service.ts` | P2 |
| T11 | Label monthly outstanding debt as "as-of {date}" with incomplete-month note | `ReportsPage.tsx` | P2 |
| T12 | Add `canceledOrdersGross` / `walkoutOrdersGross` to monthly totals | `reports.service.ts` | P2 |

### Sprint 2 — Schema Changes (require migration)

| # | Task | Schema change | Priority |
|---|------|--------------|----------|
| T13 | Add `canceledById String?` to Order, populate on cancel | `schema.prisma`, `order.service.ts` | P1 |
| T14 | Add `walkoutMarkedById String?` to Order, populate on walkout | `schema.prisma`, `order.service.ts` | P1 |
| T15 | Remove `Debt.remainingAmount` — derive from repayments only | `schema.prisma`, debt service | P2 |
| T16 | Add `expenseType` enum to Expense (`OPERATIONAL`, `COGS`, `ONE_TIME`) | `schema.prisma` | P2 |
| T17 | Add `service_charge_type` setting, update billing to support PERCENT mode | settings, `billing.service.ts` | P2 |

### Sprint 3 — Business Intelligence Gaps

| # | Task | Notes | Priority |
|---|------|-------|----------|
| T18 | Add `occurredAt` date validation (current day ± tolerance) in expense controller | Guard against backdating | P2 |
| T19 | Add `include_service_charge_in_profit` configurable setting | Owner decision | P3 |
| T20 | Add `dailyBudget` to ExpenseCategory, show variance in expense report | Budget vs actual | P3 |
| T21 | Separate `netSales` and `realCashIn` labels in monthly calendar cells | Clarity | P3 |
| T22 | Add `canceledOrdersGross` / `walkoutOrdersGross` to per-waiter breakdown | Revenue-leakage monitoring | P3 |

---

## Formulas Reference (Corrected)

```
subtotalSnapshot     = Σ(unitPrice × qty) for non-canceled lines
discountAmount       = computed at approval, capped by settings
netFood              = subtotalSnapshot − discountAmount
serviceCharge        = fixed amount OR netFood × serviceChargePercent (T17)
totalSnapshot        = netFood + serviceCharge

-- Daily Sales --
grossSales           = Σ subtotalSnapshot (closed orders)
discounts            = Σ discountAmountSnapshot (closed orders)
netSales             = grossSales − discounts
serviceChargeTotal   = Σ serviceChargeSnapshot (closed orders)
billedTotal          = netSales + serviceChargeTotal
paymentTotal         = orderCash + orderCard + debtSales  [must = billedTotal, difference = 0]

-- Cashflow --
realCashIn           = orderCash + orderCard + debtRepaymentsCash + debtRepaymentsCard
  (note: debtSales excluded — not real cash, it is a receivable)

-- Expenses --
expenseGross         = Σ amount where status = ACTIVE          [only actually-spent money]
expenseReversal      = Σ amount where status = REVERSAL
expenseNet           = expenseGross − expenseReversal

-- Profit --
salesBasedProfit     = netSales [+ serviceCharge if configured] − expenseNet
cashflowBasedNet     = realCashIn − expenseNet

-- Waiter --
waiterRevenue        = Σ (subtotalSnapshot − discountAmountSnapshot) per waiter
waiterServiceEarned  = Σ serviceChargeSnapshot per waiter
waiterCancelRate     = ordersCanceled / (ordersClosed + ordersCanceled)
```

---

## Data Verified Against Code

| Claim | Verified in | Result |
|-------|-------------|--------|
| `canceledBy` hardcoded | `reports.service.ts:476` | ✓ Confirmed bug |
| `markedBy` uses approver | `reports.service.ts:482` | ✓ Confirmed bug |
| N+1 monthly loop | `reports.service.ts:501–506` | ✓ Confirmed |
| Debt no lower bound | `reports.service.ts:305–313` | ✓ Confirmed |
| REVERSED in gross calc | `expense.service.ts:64–66` | ✓ Confirmed |
| Service charge flat amount | `billing.service.ts:76–78` | ✓ Confirmed |
| No `canceledById` in schema | `schema.prisma:247–284` | ✓ Confirmed missing |
| `createdByName` exists but not shown | `expense.service.ts:47`, `ReportsPage.tsx:353` | ✓ Confirmed |
| Monthly no waiter aggregation | `reports.service.ts:540–558` | ✓ Confirmed missing |
| No waiter drill-down from Users page | `UsersPage.tsx` | ✓ Confirmed missing |
