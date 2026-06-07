# PRD 13 — Finance time-anchor fix + daily-report unification

**Status:** in progress
**Owner:** backend
**Trigger:** `finance-audit.md` §9.2 + Opus 4.7 follow-up read of `reports.service.ts`, `finance.service.ts`, `finance-report.service.ts`, `expense.service.ts`, all date-handling controllers and repositories.
**Out of scope:** business semantics (what a "day" means, which P&L formula is right, what the bill should look like). Those are locked in `decisions.md`. This PRD is engineering-only.

## 1. Problem

### 1.1 Time-zone anchor is system-wide and inconsistent

A correct local-day helper exists at `apps/master/src/main/server/lib/time.ts` (Asia/Tashkent via `Intl.DateTimeFormat`). It's used in exactly one place — `stocktake.service.ts`.

Every finance and reporting code path has its own ad-hoc "what is today" implementation. They use either `setHours(0,0,0,0)` (server-local) or `now.getHours()`/`now.getDate()` (server-local) or `now.toISOString().slice(0,10)` (UTC). On a Tashkent-locale Windows machine they look right. On any other timezone (CI runner, Docker, cloud host, dev laptop in another zone) numbers shift by hours and orders leak across days.

Concrete sites (line refs are at the time of writing):

| File | Symptom |
|---|---|
| `services/reports.service.ts:61-67` `dayBounds` | Z-report bucketed server-local |
| `services/reports.service.ts:476-488` `monthly` | Day cursor walks server-local |
| `services/reports.service.ts:562-564` `summary` | Range parsed server-local |
| `services/finance.service.ts:12-18` `dayRange` | Admin finance bucketed server-local |
| `services/finance.service.ts:390-425` `serviceChargeMatrix` | Day keys from `closedAt.getDate()` server-local |
| `services/expense.service.ts:20-28` `isSameLocalDay` | Same-day reversal check off-locale |
| `services/purchase.service.ts:11-15` `isSameLocalDay` | Same-day purchase reversal check off-locale |
| `services/finance-report.service.ts:47-50,131,141-143` | Scheduler clock + day-of-month check server-local |
| `services/finance-report.service.ts:92,99,110` | Idempotency key uses UTC slice while content uses server-local |
| `repositories/expense.repo.ts:6-14` | `dayRange` server-local |
| `repositories/debt.repo.ts:6-14,132-136` | Same |
| `repositories/payment.repo.ts:6-14` | Same |
| `controllers/finance.controller.ts:17-32,39,53-54` | Date query parsed server-local |
| `controllers/reports.controller.ts:13-15,33` | Same |
| `controllers/orders.controller.ts:94`, `controllers/users.controller.ts:82-84`, `controllers/me.controller.ts:20-26` | Three more "today" helpers, all server-local |

### 1.2 Three parallel "daily" report implementations

| Endpoint | Service | LOC | Audience |
|---|---|---|---|
| `GET /api/reports/daily` | `reportsService.daily` | ~470 | Owner Z-report |
| `GET /api/finance/daily` | `financeService.dailyForAdmin` | ~370 | Admin operational |
| `GET /api/reports/summary` | `reportsService.summary` | ~240 | Owner range view |

They duplicate: payment-method bucketing, expense `gross/reversal/operating/pendingRepayable` math, COGS aggregation, debt-today rollup, per-waiter rollup. Field names diverge (`netFood` vs `netSales`, `cashIn` vs `orderCash`, `outflow.totalOut` vs `expensesNet`). The Telegram formatter and two React pages each bind to a different shape; one shape edit doesn't propagate.

### 1.3 Three incompatible "profit" definitions

| Surface | Formula | Issue |
|---|---|---|
| `reports.daily.results.salesBasedProfit` | `netSales − operatingExpense` | **Excludes COGS** |
| `finance.dailyForAdmin.pnl.profit` | `mealsRevenue − mealsCogs − operatingExpense` | `mealsRevenue` is gross of discount |
| `reports.summary.pnl.profit` | `totalRevenue − totalCogs − operatingForPnl` | Excludes ingredient-purchase opex (correct) |

Owner reads three different "foyda" numbers for the same day depending on which page they open. We must pick one canonical formula and emit it once.

### 1.4 Walkout has no dedicated timestamp

`reports.service.ts:275` and `finance.service.ts:52` filter walkouts by `updatedAt`. Any later mutation (reprint, edit, audit-driven update) shifts the row. `walkouts[].markedBy = order.approvedById ?? 'unknown'` (`reports.service.ts:464`) — walkout never goes through approval, so **always `'unknown'`**.

### 1.5 Monthly = N × daily, sequentially

`reports.service.monthly` (`:485-487`) issues 28-31 calls to `daily()` back-to-back. Each `daily()` issues 5 parallel queries + `expense.listByDate` + all-time `debt.findMany`. SQLite is single-writer; user-facing monthly endpoint takes seconds.

### 1.6 Outstanding-debt-as-of-day is wrong on historical days

`reports.daily.debtSnapshot.outstandingTotal` sums a filtered ledger that excludes debts with `remainingAmount === '0'`. For a past day, a debt opened then but repaid 6 months later is shown as 0 outstanding instead of `originalAmount`. The right primitive — `debtRepo.sumOutstandingAsOf(date)` — exists at `debt.repo.ts:132` and is not called from the report.

### 1.7 Smaller items

- Duplicated expense reduction math in `expense.service.listByDate` (`:103-141`) and `reports.summary` (`:679-715`).
- `finance.dailyForAdmin.outflow.totalOut` reduces to `expensesNet`; two fields, one value.
- `dayBounds` (exclusive end) vs `dayRange` (`.999` inclusive end) coexist.
- `finance.controller` accepts three input modes (`?date`, `?from/to`, `?month`) for one underlying report.
- `mealsRevenue` is documented as gross-of-discount in code comments but rendered to UI as "revenue" with no qualifier.

## 2. Non-goals

- No change to the order lifecycle, billing math, discount rules, payment validation, or `confirm` transaction.
- No new business surfaces. Admin still doesn't see profit. Owner still does.
- No `DailyClose` snapshot table (the `fix/finance-soft-close-and-recipes` branch is a separate, larger effort).
- No change to the renderer chart libraries, Tailwind, shadcn pieces.

## 3. Solution

### 3.1 `lib/time.ts` becomes the single source of truth

Extend it with the missing primitives, then sweep every other call site to use them.

```ts
// existing
localToday(now?): Date
localDayRange(at?): { start: Date; end: Date }

// add
parseLocalDay(yyyyMmDd: string): Date          // start of that Tashkent calendar day, as UTC instant
localDayRangeFor(yyyyMmDd: string): { start, end }
localMonthRangeFor(yyyyMm: string): { start, end }
localDayKey(at?: Date): string                 // "YYYY-MM-DD" in Tashkent
localClockMinutes(at?: Date): number           // 0..1439 in Tashkent
isSameLocalDay(a: Date, b: Date): boolean
```

All semantics: bounds are `[start, end)` (half-open). End = start + 1 calendar day in Tashkent.

### 3.2 Schema additions

```prisma
model Order {
  // ...existing...
  sentAt        DateTime?
  walkoutAt     DateTime?
  walkoutById   String?
}
```

- `sentAt` set in `orderService.send` alongside the status flip.
- `walkoutAt` / `walkoutById` set in `orderService.markWalkout`.
- Backfill: old SENT/CLOSED → `sentAt = createdAt` (best effort, no historical truth available); old WALKOUT → `walkoutAt = updatedAt`, `walkoutById = approvedById` if present else null.

### 3.3 Unified daily ledger DTO

One primitive in `reports.service.ts`:

```ts
dailyLedger(localDay: string): Promise<DailyLedger>
```

```ts
type DailyLedger = {
  date: string;                 // YYYY-MM-DD (Tashkent)
  sales: {
    closedCount: number;
    canceledCount: number;
    walkoutCount: number;
    gross: string;              // Σ subtotalSnapshot
    discount: string;
    netSales: string;           // gross − discount
    serviceCharge: string;
    debtSales: string;          // Σ Payment.amount where method=DEBT on day-closed orders
  };
  cashflow: {
    orderCash: string;
    orderCard: string;
    debtRepaidCash: string;
    debtRepaidCard: string;
    expenseReturns: string;
    realCashIn: string;
  };
  outflow: {
    expenseGross: string;       // ACTIVE+REVERSED
    expenseReversal: string;    // REVERSAL
    expenseNet: string;         // gross − reversal
    operatingExpense: string;   // P&L opex (excludes pending-repayable + ingredient-purchase category)
    pendingRepayable: string;
    ingredientPurchases: string;
  };
  pnl: {
    revenue: string;            // = sales.netSales
    cogs: string;               // Σ OrderLine.cogsSnapshot of day-closed non-canceled lines
    operatingExpense: string;   // = outflow.operatingExpense (mirror for readability)
    profit: string;             // revenue − cogs − operatingExpense   ← CANONICAL
  };
  debt: {
    openedTodayCount: number;
    openedTodayAmount: string;
    repaidTodayAmount: string;
    outstandingAsOfEod: string; // debtRepo.sumOutstandingAsOf(eod)
  };
  perWaiter: Array<{ waiterId; waiterName; orders; revenue; serviceEarned }>;
  incidents: {
    walkouts: Array<{ orderId; walkoutAt; walkoutById; walkoutByName; amount; reason }>;
    cancellations: Array<{ orderId; canceledAt; canceledById; reason; fromStatus }>;
  };
  lines: {
    closedOrders: Array<{ orderId; closedAt; waiterName; tableName; gross; discount; service; cash; card; debt; total }>;
    mealSales: Array<{ menuItemId; menuItemName; categoryId; categoryName; isService; qty; revenue; cogs; profit }>;
  };
};
```

Three thin role-views project to this:
- **Owner Z-report** = whole payload.
- **Admin daily finance** = mask `pnl.profit` only.
- **Telegram daily summary** = formatter over the same payload.

`reports.summary(from, to)` keeps its public contract but is reimplemented as one range query that aggregates in TS using the same primitives.

`reports.monthly(month)` is reimplemented as one range query + day-key grouping (no N×daily loop).

### 3.4 Canonical P&L formula

```
revenue           = sales.netSales                       (gross − discount)
cogs              = Σ OrderLine.cogsSnapshot
operatingExpense  = expense.operating
                    excluding seed-cat-ingredients (already in COGS)
profit            = revenue − cogs − operatingExpense
```

The two other formulas are removed. The admin view does not return `pnl.profit` at all (renderer can't accidentally show it).

### 3.5 Debt-as-of-day

`outstandingAsOfEod` calls `debtRepo.sumOutstandingAsOf(endOfLocalDay)`. The string-compare filter in `buildDebtLedger` is removed; the ledger remains as a display list, totals come from the SQL aggregate.

### 3.6 Scheduler

`shouldSendDailyTelegram`, `runScheduledDailyTelegram`, `shouldSendMonthlyTelegram`, `runScheduledMonthlyTelegram` use `localClockMinutes` and `localDayKey`. Idempotency key = local-day slice, never UTC slice.

## 4. Tasks

Numbered in execution order. Each task is independently shippable and verifiable.

| # | Task | Files |
|---|---|---|
| **T1** | Extend `lib/time.ts` with the new primitives. Pure unit, no other code touched. | `lib/time.ts` |
| **T2** | Sweep controllers to use `parseLocalDay` / `localDayRangeFor` / `localMonthRangeFor`. No service-layer change. Verifies via API smoke. | `controllers/{finance,reports,orders,users,me,debt,expense}.controller.ts` |
| **T3** | Sweep repositories' `dayRange` helpers to take pre-computed `{ start, end }` and stop calling `setHours`. | `repositories/{expense,debt,payment}.repo.ts` |
| **T4** | Sweep services' `dayRange/dayBounds/isSameLocalDay` to delegate to `lib/time`. | `services/{reports,finance,expense,purchase,finance-report,order}.service.ts` |
| **T5** | Schema migration: add `Order.sentAt`, `Order.walkoutAt`, `Order.walkoutById`. Backfill in same migration. | `prisma/schema.prisma`, new migration, `services/order.service.ts` |
| **T6** | Use `walkoutAt` in reports/finance instead of `updatedAt`. Fix `markedBy` to read `walkoutById`. Use `sentAt` to gate post-send stock restore (consolation: while we're here, no scope creep). | `services/{reports,finance}.service.ts` |
| **T7** | Implement `reportsService.dailyLedger(localDay)` returning the unified DTO. Pure addition; existing endpoints not yet rewired. | `services/reports.service.ts` |
| **T8** | Re-implement `reportsService.daily`, `financeService.dailyForAdmin`, `reportsService.summary`, `reportsService.monthly` on top of `dailyLedger` / single range query. Keep public DTO shape compatible for renderer; add new canonical fields, remove the dead duplicates. | `services/{reports,finance}.service.ts` |
| **T9** | Telegram formatter consumes the unified DTO. | `services/telegram-bot.service.ts` |
| **T10** | Renderer: switch `FinancePage` and `ReportsPage` to the canonical field names; drop dead state. | `apps/master/src/renderer/{pages,api,components/reports}/*` |
| **T11** | Smoke verification: run `scripts/api-smoke.sh` against a non-Tashkent server (TZ=UTC), confirm same numbers on a fresh dataset. | `scripts/api-smoke.sh` |

Dependencies: T1→T2, T1→T3, T1→T4, T1→T7, T5→T6, T7→T8, T8→T9, T8→T10, all→T11.

## 5. Verification

- TypeScript `pnpm typecheck` passes.
- `apps/master/scripts/api-smoke.sh` green.
- New manual check: seed a `closedAt` at 23:30 Tashkent, query `?date=YYYY-MM-DD` (that Tashkent date), confirm the order is in the report. Re-run with `TZ=UTC` on the server. Both must match.
- Cross-surface check: same date, the three endpoints emit the same `sales.gross`, `cashflow.realCashIn`, `outflow.expenseNet` — byte-identical strings.
- Monthly endpoint: time it before and after; expect ≥ 3× speedup on a month with ~150 closed orders.

## 6. Migration / rollout

- SQLite migration is additive (nullable columns + idempotent backfill). No downtime.
- API DTO is additive on the renderer side: new canonical fields land, old field names stay through T8 + T10 to allow the renderer PR to land separately. Old fields removed in a follow-up commit after the renderer is on canonical names. Track in this PRD's checklist.

## 7. Open questions

- (Resolved) Half-open `[start, end)` vs inclusive `.999` end — picking half-open everywhere.
- (Resolved) `mealSales.revenue` — keeping gross-of-discount but renaming to `grossRevenue` in the unified DTO to avoid ambiguity.
- (Open) Per-line discount distribution — out of scope here; v1 has no per-line discount, so we leave `cogs/revenue` unallocated at the line level and let the bill-level `pnl` block be the truth.
