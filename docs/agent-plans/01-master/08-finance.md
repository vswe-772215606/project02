# Phase 01-master / 08 — Finance: debt, expenses, owner reports

**Goal:** add a reliable finance module for debt sales, debt repayments, immutable expenses, owner-only financial reports, and daily Telegram summary.

**Prerequisites:** `01-master/07-reports-and-audit.md` complete. Read all files in `00-shared/`, plus `docs/FINANCE_PLAN.md` and `docs/FINANCE_IMPLEMENTATION_SPEC.md`.

## Scope

This phase adds:

1. `DEBT` payment support on order close
2. `Debt` and `DebtRepayment` data model
3. `ExpenseCategory` and immutable `Expense` model
4. expense reversal flow
5. owner-only daily/monthly finance report updates
6. admin debt/expense operational screens
7. owner Telegram daily report sending

This phase does **not** add:

1. ingredient cost accounting
2. payroll formulas
3. supplier ledger
4. CSV/PDF export

## Tasks

### 1. Prisma schema + migration

Update `apps/master/prisma/schema.prisma` to match `00-shared/schema.md`.

Add:

1. `PaymentMethod.DEBT`
2. `ExpenseStatus`
3. `DebtStatus`
4. `ExpenseCategory`
5. `Expense`
6. `Debt`
7. `DebtRepayment`
8. new `AuditAction` values
9. new `Setting` keys for Telegram report delivery

Run migration and ensure existing seed still works after updating it.

### 2. Repository layer

Add repositories:

1. `expense.repo.ts`
2. `debt.repo.ts`
3. optional `expenseCategory.repo.ts` if you prefer separate reads

Required methods:

1. expense create
2. expense reverse
3. expense list by date
4. debt create from closed order
5. debt list/details
6. debt repayment create
7. debt outstanding totals
8. debt snapshot by date

### 3. Service layer

Add services:

1. `expense.service.ts`
2. `debt.service.ts`

Update:

1. `order.service.ts`
2. `reports.service.ts`
3. `audit.service.ts`
4. scheduler/bootstrap code for daily Telegram send

Rules:

1. `mark-paid` must accept `DEBT`
2. debt metadata is mandatory when `DEBT` exists
3. overpayment rejected
4. expense edit/delete rejected
5. reversal only through dedicated flow

### 4. API layer

Add routes/controllers:

1. `expense.routes.ts`
2. `expense.controller.ts`
3. `debt.routes.ts`
4. `debt.controller.ts`

Update:

1. `orders.controller.ts` validation for `DEBT`
2. `app.ts` route registration
3. `errors.ts` with new stable error codes

### 5. Reports

Update reports so owner daily/monthly reports include:

1. debt sales
2. debt repayments
3. expense totals
4. expense category breakdown
5. sales-based profit
6. cashflow-based result
7. outstanding debt snapshot

Do not collapse these into one ambiguous number.

### 6. Renderer API layer

Add:

1. `apps/master/src/renderer/api/expenses.ts`
2. `apps/master/src/renderer/api/debts.ts`

Update:

1. `reports.ts`
2. shared format/types if needed

### 7. Admin UI

Add operational pages or sections:

1. `Chiqimlar`
2. `Qarzlar`

Admin can:

1. create expense
2. reverse expense
3. list expenses by day
4. list debts
5. record debt repayment

Admin must **not** see owner-only profit/report screens.

### 8. Owner report UI

Update `ReportsPage.tsx` so only owner sees it and it shows:

1. gross sales
2. discounts
3. net sales
4. debt sales
5. real cash-in
6. debt repaid that day
7. expenses
8. sales-based profit
9. cashflow-based result

### 9. Telegram sender

Add daily scheduled Telegram summary:

1. uses settings table
2. only sends when enabled
3. logs `REPORT_SENT` or `REPORT_SEND_FAILED`
4. retries on next schedule window if previous day failed is acceptable, but do not silently drop

No VPS is required. Master machine sends outbound HTTPS directly to Telegram.

## Verification

### V1. Debt sale creation

1. Create an order worth `200000`
2. Mark paid with `50000 CASH + 150000 DEBT`
3. Verify:
   - order closes
   - payment rows exist
   - one `Debt` row exists
   - remaining amount is `150000`

### V2. Debt repayment partial

1. Repay `50000`
2. Verify:
   - `DebtRepayment` row created
   - debt status becomes `PARTIAL`
   - remaining amount is `100000`

### V3. Debt repayment full

1. Repay final `100000`
2. Verify:
   - debt status becomes `PAID`
   - `closedAt` filled
   - overpay attempt fails with `DEBT_OVERPAY`

### V4. Expense create

1. Create expense under `Ishchilar oyligi`
2. Verify it appears in day list and audit log

### V5. Expense immutable

1. Try direct edit/delete if endpoint exists
2. Verify request is rejected

### V6. Expense reversal

1. Reverse an existing expense
2. Verify:
   - original becomes `REVERSED`
   - reversal row exists
   - net expense decreases correctly

### V7. Daily report correctness

Verify owner daily report separates:

1. net sales
2. debt sales
3. real cash-in
4. expense net
5. sales-based profit
6. cashflow-based result

### V8. Historical truthfulness

1. Create debt sale yesterday
2. Repay today
3. Verify:
   - yesterday report still shows debt sale on yesterday
   - today's report shows debt repayment in cashflow
   - repayment does not become today's new sale

### V9. Access control

1. Admin can open `Chiqimlar` and `Qarzlar`
2. Admin gets `403` on `/api/reports/daily`
3. Owner can open reports

### V10. Telegram send

1. Configure bot token/chat id
2. Trigger a report send
3. Verify:
   - Telegram message arrives
   - `REPORT_SENT` audit entry exists

## Definition of done

- [ ] Debt sale flow works
- [ ] Debt repayment flow works
- [ ] Expenses are immutable
- [ ] Expense reversal works
- [ ] Owner daily/monthly reports include finance metrics
- [ ] Admin can operate debt/expense screens without seeing owner report screens
- [ ] Telegram summary works
- [ ] Verification passed

When all are checked, stop and wait for human approval before any further finance expansion.
