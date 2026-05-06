# Finance Reporting Clarity Plan

## Purpose

This document defines a focused reporting upgrade for Chayxana POS so the owner can see:

1. how many orders were completed
2. which meals were ordered
3. which meals were actually cooked
4. how debts were opened and repaid
5. how daily finance numbers were calculated

The goal is clarity, not visual noise. Each number must have a visible source table behind it.

## Current State

After reading the docs and recent git history, the repo already has:

1. daily and monthly owner reports
2. expense tracking with reversal logic
3. debt creation and debt repayment flows
4. debt operations screen
5. owner finance Telegram summary

Current implementation references:

1. `apps/master/src/main/server/services/reports.service.ts`
2. `apps/master/src/main/server/services/finance-report.service.ts`
3. `apps/master/src/main/server/services/debt.service.ts`
4. `apps/master/src/renderer/pages/ReportsPage.tsx`
5. `apps/master/src/renderer/pages/DebtsPage.tsx`

Recent git confirmation:

1. `0b3eae1 Implement finance module and settlement flow`

## Gap Analysis

The current system is already good on debt, expenses, and owner totals, but it still has three clarity gaps:

1. there is no proper meal-level report showing `which item`, `how many ordered`, and `sum`
2. there is no proper kitchen production report showing `which item`, `how many cooked`, and `how many canceled before cooking`
3. the owner report mixes summary cards and audit tables, but does not yet present a strict finance ledger layout with one clean table per question

## Reporting Structure To Build

The reporting screen should be restructured into 6 clear daily sections.

### 1. Daily Summary Table

This is the top-level owner summary for one date.

| Metric | Formula | Why it exists |
|---|---|---|
| Closed orders | count of `Order.status = CLOSED` for the day | Operational volume |
| Canceled orders | count of `Order.status = CANCELED` for the day | Loss / control |
| Walkout orders | count of `Order.status = WALKOUT` for the day | Risk / abuse |
| Gross sales | sum of `Order.subtotalSnapshot` for closed orders | Before discount |
| Discounts | sum of `Order.discountAmountSnapshot` for closed orders | Discount control |
| Net sales | `gross sales - discounts` | True sales base |
| Debt sales | sum of `Payment.amount` where `method = DEBT` on closed orders that day | Sold but not yet collected |
| Cash from orders | sum of `Payment.amount` where `method = CASH` on closed orders that day | Real same-day cash |
| Card from orders | sum of `Payment.amount` where `method = CARD` on closed orders that day | Real same-day card |
| Debt repaid today | sum of `DebtRepayment.amount` for the day | Old money collected today |
| Expenses net | `expense gross - expense reversal` | Real day expense |
| Sales-based profit | `net sales - expenses net` | Sales view |
| Cashflow-based result | `(cash from orders + card from orders + debt repaid today) - expenses net` | Money movement view |
| Outstanding debt end of day | all unpaid debt remaining as of day end | Exposure snapshot |

### 2. Orders Register Table

This table answers: `How many orders were there and what happened to them?`

| Column | Source |
|---|---|
| Time | `Order.closedAt` / `Order.canceledAt` / walkout time |
| Order no | order short id or stable bill number |
| Table / room | `Order.table.name` |
| Waiter | `Order.waiter.fullName` |
| Status | `CLOSED / CANCELED / WALKOUT` |
| Gross | `subtotalSnapshot` |
| Discount | `discountAmountSnapshot` |
| Net | `subtotalSnapshot - discountAmountSnapshot` |
| Service | `serviceChargeSnapshot` |
| Cash | payment sum by `CASH` |
| Card | payment sum by `CARD` |
| Debt | payment sum by `DEBT` |

Rules:

1. only one row per order
2. closed, canceled, and walkout rows must be visually distinct
3. totals row must be shown at bottom

### 3. Meal Sales Table

This table answers: `What exactly was ordered?`

Aggregation base:

1. use `OrderLine`
2. include only lines belonging to orders closed on the selected day
3. exclude canceled lines

| Column | Meaning |
|---|---|
| Meal | `OrderLine.nameSnapshot` |
| Category | `MenuItem -> Category.name` or stored category snapshot if later added |
| Orders count | number of distinct orders containing this meal |
| Qty ordered | sum of `OrderLine.quantity` |
| Gross sales | `sum(quantity * unitPriceSnapshot)` |
| Avg per order | `qty ordered / orders count` |

Sort order:

1. `Qty ordered DESC`
2. `Gross sales DESC`

This should be the main table for the question: `How many of each meal were ordered?`

### 4. Kitchen Production Table

This table answers: `What was actually cooked?`

Aggregation base:

1. use `OrderLine` joined with `KitchenTicket`
2. group by `OrderLine.nameSnapshot`

Definitions:

1. `Sent to kitchen`: line has `kitchenTicketId != null`
2. `Started`: linked `KitchenTicket.status IN (IN_PROGRESS, READY)`
3. `Cooked / ready`: linked `KitchenTicket.status = READY`
4. `Canceled before cooking`: line canceled while ticket null or ticket status still `PENDING`
5. `Kitchen canceled / waste risk`: line canceled after kitchen had already started

| Column | Meaning |
|---|---|
| Meal | `OrderLine.nameSnapshot` |
| Qty ordered | total ordered lines |
| Sent to kitchen | total quantity sent |
| Started cooking | total quantity on tickets with `IN_PROGRESS or READY` |
| Ready | total quantity on tickets with `READY` |
| Canceled before cooking | total quantity canceled before production |
| Canceled after kitchen start | total quantity canceled after production began |

Important note:

1. this is a kitchen operations table, not a revenue table
2. the owner should be able to compare `qty ordered` vs `ready`

### 5. Debt Ledger Table

This table answers: `Which debts were opened, how much came back, and what still remains?`

One row per debt.

| Column | Meaning |
|---|---|
| Debt opened at | `Debt.openedAt` |
| Order no | debt source order |
| Debtor | `Debt.debtorName` |
| Phone | `Debt.debtorPhone` |
| Order total | source order total |
| Debt opened | `Debt.originalAmount` |
| Repaid today | sum of repayments for selected day for this debt |
| Total repaid | `originalAmount - remainingAmount` |
| Remaining | `remainingAmount` |
| Status | `OPEN / PARTIAL / PAID` |
| Last repayment at | latest `DebtRepayment.paidAt` |

Required footer totals:

1. new debt opened today
2. debt repaid today
3. open debt remaining at end of day

### 6. Expense Breakdown Table

This already exists partly, but it should stay in a strict ledger layout.

| Column | Meaning |
|---|---|
| Time | `Expense.occurredAt` |
| Category | expense category |
| Reason | `Expense.reason` |
| Note | `Expense.note` |
| Entered by | user name |
| Status | `ACTIVE / REVERSED / REVERSAL` |
| Signed amount | positive for active, negative for reversal |

Below it, keep a category totals table:

| Category | Net amount |
|---|---|
| Go'sht | ... |
| Sabzavot | ... |
| Ichimlik | ... |
| ... | ... |

## Monthly View To Build

Monthly view should stay summary-first, but every day must be one row.

### Monthly Daily Rollup Table

| Date | Closed orders | Net sales | Debt sales | Real cash in | Expenses net | Sales-based profit | Cashflow-based result | End-of-day debt |
|---|---:|---:|---:|---:|---:|---:|---:|---:|

Clicking a day should open the same 6 daily tables for that date.

## Backend Work Required

### 1. Expand daily report DTO

Current `DailyReport` is missing meal-level and order-register detail.

Add:

1. `ordersTable`
2. `mealSales`
3. `kitchenProduction`
4. `debtLedger`

Suggested DTO shape:

```ts
{
  ordersTable: Array<{
    orderId: string;
    orderNumber: string;
    at: string;
    tableName: string | null;
    waiterName: string;
    status: 'CLOSED' | 'CANCELED' | 'WALKOUT';
    gross: string;
    discount: string;
    net: string;
    service: string;
    cash: string;
    card: string;
    debt: string;
  }>;
  mealSales: Array<{
    mealName: string;
    categoryName: string | null;
    ordersCount: number;
    qtyOrdered: number;
    grossSales: string;
    avgPerOrder: string;
  }>;
  kitchenProduction: Array<{
    mealName: string;
    qtyOrdered: number;
    qtySent: number;
    qtyStarted: number;
    qtyReady: number;
    qtyCanceledBeforeCooking: number;
    qtyCanceledAfterStart: number;
  }>;
  debtLedger: Array<{
    debtId: string;
    openedAt: string;
    orderNumber: string;
    debtorName: string;
    debtorPhone: string | null;
    orderTotal: string;
    originalAmount: string;
    repaidToday: string;
    totalRepaid: string;
    remainingAmount: string;
    status: 'OPEN' | 'PARTIAL' | 'PAID';
    lastRepaymentAt: string | null;
  }>;
}
```

### 2. Add report queries

`reports.service.ts` should add:

1. closed orders with `lines`, `payments`, `table`, `waiter`
2. canceled and walkout orders for register rows
3. line-level aggregation for meal sales
4. line + ticket-level aggregation for kitchen production
5. per-debt ledger rows with same-day repayment sum

### 3. Preserve accounting separation

Do not break the current finance rule:

1. sales date and repayment date must remain separate
2. debt repayment must not become new sales
3. service charge must remain outside restaurant profit

## Frontend Work Required

`ReportsPage.tsx` should be reorganized into:

1. summary cards at top
2. one summary table
3. one orders table
4. one meal sales table
5. one kitchen production table
6. one debt ledger table
7. one expense ledger table

UI rules:

1. no hidden math
2. each headline number must be traceable to a row table
3. default sort should help the owner immediately see the biggest items
4. money columns always right-aligned
5. quantity columns always centered or right-aligned
6. table footers must show totals where relevant

## Implementation Order

1. extend backend `DailyReport` DTO
2. build `ordersTable`
3. build `mealSales`
4. build `kitchenProduction`
5. build `debtLedger`
6. simplify and restructure `ReportsPage`
7. add monthly drill-down behavior

## Definition Of Done

This reporting upgrade is done only when the owner can answer all of these without opening another screen:

1. How many orders were closed today?
2. Which meals sold the most today?
3. Which meals were actually cooked today?
4. How much was sold on debt today?
5. Which debtor repaid today and how much?
6. How much debt is still open tonight?
7. How were today’s profit and cashflow numbers calculated?

## Recommended Next Task

Implement the backend DTO expansion in `apps/master/src/main/server/services/reports.service.ts` first. The current finance logic is already in place; the main missing piece is report structure and meal-level production aggregation.
