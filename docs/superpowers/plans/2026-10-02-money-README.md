# Money rules — build order for the 2026-10-02 plans

Seven plans implement the money rules after slice 1 (`docs/superpowers/specs/2026-09-30-money-rules-design.md`).
Each package is built on its own branch and worktree off `feat/money-rules`, then merged back in the order below.

## Waves and merge order

1. P7 discount-qaytim (merge 1st) · P1 guards-2 (merge 2nd, rebases confirm onto P7) · P2 trading-day (merge 3rd, re-runs its T3/T7 greps over P1 and P7)
2. P3 ledger
3. P4 expenses (T3 commit handed to P6 early; merges first) · P6 payouts-writeoffs (T7 only after P4 is merged)
4. P5 day-close

| Package | Plan |
|---|---|
| P1 guards-2 | `2026-10-02-money-guards-2.md` |
| P2 trading-day | `2026-10-02-money-trading-day.md` |
| P7 discount-qaytim | `2026-10-02-money-discount-qaytim.md` |
| P3 ledger | `2026-10-02-money-ledger.md` |
| P4 expenses | `2026-10-02-money-expenses.md` |
| P6 payouts-writeoffs | `2026-10-02-money-payouts-writeoffs.md` |
| P5 day-close | `2026-10-02-money-day-close.md` |

## Cross-package conflicts and how they are resolved

- **P1 guards-2, P7 discount-qaytim.** Both rewrite order.service.ts confirm() in W1. P1 T3/T4 add OrderNotOpen and PaymentMismatch and recompute totals inside the transaction after closeIfSent, threading tx into computeTotals for discountRepo.findById (guards-2.md:589, 604-606). P7 T2/T4/T7/T8 add discountReason, re-read the order inside the transaction for approvedBy (discount-qaytim.md:796-807), drop waiveServiceCharge and discountId, and change setApproval. billing.service.ts: P1 adds a tx parameter, while P7 T8 deletes the repo read so that computeTotals(order, { discountAmount }) needs no tx. Both packages also edit order.repo.ts (P1 holdIfOpen and the CANCELED lists; P7 applyTotals, setApproval and the findByIdWithDetails include), lib/errors.ts (P1 adds 3 errors; P7 removes DiscountCapExceeded) and schema.prisma (P1 AuditAction values and OrderLine.countedQty; P7 Order.discountReason and the Discount model drop).
  Resolution: Merge W1 in this order: P7, then P1, then P2. P7 owns billing.service.ts and the confirm input, reason and audit code, and P1 owns the confirm transaction structure. When P1 rebases onto P7, take P7's billing.service.ts whole and drop P1's tx argument. Keep P1's one in-transaction re-read and recompute, and do not add a second: P7's approvedBy re-read becomes that same read. Run discountReasonFor against the in-transaction totals, plus the fast path for an early 400.
- **P1 guards-2, P2 trading-day, P7 discount-qaytim.** Shared W1 files. reports.service.ts: P1 T10 (D27 where-clauses at :281, :442, :1100), P2 T3 (every day range) and P7 T5 (buildOrdersTable :114-135). me.controller.ts: P1 T10 and P2 T3. telegram-bot.service.ts: P1 T12 (/omborxona) and P2 T3/T4. orders.controller.ts: P2 T3 and P7 T2/T7/T8. e2e files: 01-bill (P1 T11, P7 T2), 11-extras (P1 T7/T12, P7 T7), 07-day (P2 T3, P7 T2), and 02-payments, 04-stock-cost and 08-staff-access (P1 adds tests, P2 renames). Every package also edits docs/CURRENT_WORKFLOW.md and money-rules §5.
  Resolution: Merge P2 last in W1. Before merging, rebase P2 onto P7 and P1, re-run its T3 mapping grep and its T7 retired-helper grep over src, e2e and scripts, and rename P1's env.svc.time.localDayKey() (guards-2.md:1353) to tradingDayOf(). Edit the docs sections without renumbering §11 inside W1, and renumber once in P2's T8.
- **P4 expenses, P6 payouts-writeoffs.** Shared W3 files: expense.service.ts (P4 create, reverse and mapExpense; P6 writeOff and the listByDate operating loop), expense.repo.ts (P4 reverseIfActive; P6 listForDate include and markWrittenOff), lib/errors.ts, alert.service.ts (both add methods), schema.prisma with one migration each (P4 StockEntry columns and DAY_CORRECTED; P6 WaiterPayout, Debt.writtenOffAmount and WAITER_PAYOUT_RECORDED; different tables, no rebuild), renderer/lib/audit-labels.ts, FinanceWorkArea.tsx (P4 T13, P6 T10), api/finance.ts, and gallery/fixtures/finance.ts. P6 T7 calls P4 T3's dayCorrectionService.
  Resolution: P4 owns expense.service create and reverse; P6 owns writeOff and listByDate. Hand P4's T3 commit to P6 as soon as it lands. Merge P4 before P6's T7. Pin migration names so P4's sorts before P6's. After both merge, run prisma migrate dev on a fresh database and confirm no drift.
- **P1 guards-2, P7 discount-qaytim, P3 ledger, P4 expenses, P5 day-close, P6 payouts-writeoffs.** Migration order. P1 hard-codes 20261002120000 and 20261002130000. P7, P3, P4, P6 and P5 use <ts> from build time, so a later wave could sort before an earlier one. P7's 16-discount-history test builds the pre-migration database by migration-name order. P7's drop_discount_presets is the only table rebuild in the programme (Order); OrderLine, Expense, StockEntry, Debt and DayClose are all ADD COLUMN or CREATE.
  Resolution: Pin migration names: P7 20261002140000_order_discount_reason and 20261002150000_drop_discount_presets; P3 20261003100000_expense_payment_method; P4 20261004100000_stock_entry_cost_before; P6 20261004110000_waiter_payouts_and_write_offs; P5 20261005100000_day_close. After each wave merges, run prisma migrate diff --exit-code against a fresh database.
- **P2 trading-day, P7 discount-qaytim, P4 expenses, P5 day-close.** Four new e2e files share the prefix 16-: 16-trading-day (P2), 16-discount-history (P7), 16-day-correction (P4) and 16-day-close (P5). Two of them land in the same wave (W1).
  Resolution: Keep 16-trading-day (P2) and 17-kassa-karta (P3). Rename P7's file to 18-discount-history, P4's to 19-day-correction and P5's to 22-day-close. P6 keeps 20- and 21-.
- **P2 trading-day, P5 day-close.** P2 T4 moves the 23:30 daily trigger onto the trading clock, with a catch-up before 05:00, and adds 2 daily-trigger e2e tests to 16-trading-day (trading-day.md:1004-1011). P5 T10 then deletes shouldSendDailyTelegram and the 23:30 path. P5 knows only about 09-nightly, so P2's 2 daily tests would fail at run time, and e2e is not typechecked.
  Resolution: Daily report: P5 owns it. P2 T4 keeps only the monthly trading-clock trigger and the /yordam line. Leave the daily trigger at 23:30 on the trading day, and do not add the 00:30 and 05:30/23:31 tests. If P2 has already built them, P5 T10 deletes them from 16-trading-day.

## Coverage gaps the cross-check assigned

- Slice 1 deferred finding: printFailureNotice tells 'no printer chosen' apart by matching the English 'not configured' text → **P1 guards-2**. P1 T3 already edits renderer/lib/confirm-result.ts. Add a distinct error code, for example PRINTER_NOT_CONFIGURED, and match on it.
- Slice 1 deferred finding: the sqlite-url tests lack an empty string, a trailing '?' and a '%20' path → **P1 guards-2**. 3 unit cases. No other plan covers them.
- Slice 1 deferred finding: stopScheduler does not interrupt a cleanup in progress → **P1 guards-2**. P1 T2 already edits scheduler.ts. Record it as accepted (each cancel is atomic), or check a stop flag between cancels.
- Slice 1 deferred finding: CLAUDE.md 'Work in flight' (2026-08-18) still names feat/remove-walkout as the build the customer runs → **P1 guards-2**. P1 T16 already edits CLAUDE.md. Barkamol's uncommitted top block lives in the main checkout, so stash it at merge.
- Slice 1 deferred finding: apps/master/e2e is outside every tsconfig → **P2 trading-day**. P2 T7 deletes 8 helpers that P1 (guards-2.md:1353) and P3 (ledger.md:1113, 1120, 1129, 1239, 1240, 1376, 1416) still call from e2e, and those calls fail only at run time. Make T7's grep a reusable gate command that P3, P4, P5 and P6 run in their final verify step. A full e2e typecheck stays out of scope.
- Duplicate: /omborxona tan narx through formatUZS (§4 33) → **P1 guards-2**. Both P1 T12 and P3 T8 (ledger.md:93) change telegram-bot.service.ts:979. P3 T8 drops the /omborxona part.
- Duplicate: day-key formatter → **P2 trading-day**. P2 T2 provides formatDayKeyUZ('2026-09-29') → '29.09.2026' (trading-day.md:641). P4 T2 creates formatTradingDay with the same output (expenses.md:287), and P6 T7 wants one too. P4 and P6 use formatDayKeyUZ.
- Duplicate: day arithmetic → **P2 trading-day**. P5 T1's addDays (day-close.md:252) duplicates P2's shiftTradingDay(dayKey, days). P5 uses shiftTradingDay.
- Duplicate: the confirm re-read inside the transaction → **P1 guards-2**. P1 T4 re-reads after closeIfSent, and P7 T4 adds a second re-read for approvedBy (discount-qaytim.md:796). Keep one.
- Duplicate: Kutilgan/Farq in the owner's correction message → **P4 expenses**. P4 T2/T3 already provide the hook: DaySnapshot { profit; expected?; difference? }, and formatDayCorrection prints Kutilgan/Farq when both snapshots carry them. P5 T6 instead appends closeChangeLines to the message (day-close.md:1216). P5 fills P4's snapshot instead and does not build a second message path.
- Duplicate: deleting isSameLocalDay → **P2 trading-day**. P2 T3 maps it to isSameTradingDay and T7 deletes it. P4 T5 (expenses.md:1069, 1199-1200) removes only the expense.service import and EXPENSE_REVERSAL_SAME_DAY_ONLY. It keeps isSameTradingDay, which P2's unit tests cover.
- 'Qaytim' used for avans returns (ExpenseReturnDialog, ExpensePanel actions, the 'Qaytim yozildi' toast) collides with D20 → **P3 ledger**. P3 (ledger.md:2366-2367) defers the dialogs to P4, but P4's plan has no such step. P3 owns the vocabulary (D17), so P3 renames every occurrence.
- D17: on a payout day the Chiqimlar page's Chiqim differs from the ledger's Chiqim → **P6 payouts-writeoffs**. After P6, the ledger's money.chiqim includes waiter payouts, but the Chiqimlar tile reads expense listByDate totals.cashOut (P3 T15) and P6 lists no payouts there (payouts-writeoffs.md:1275). A Chiqim that changes meaning between screens breaks D17.
- PRD 14 §10 pre-release check: the fractional-amounts SQL on a copy of the till's database → **P5 day-close**. Release item. Add it to P5 T13's handover 'checks owed', alongside P1's countedQty backfill check, P7's Order rebuild through sql.js and P3's till print.
- PRD 14 §10 open question: the PIN lock resets on a successful login → **none (Barkamol)**. P1 lists it as out of scope (guards-2.md:40, 155) and no plan owns it. It stays open.

## Questions for Barkamol (defaults in use until answered)

- Counting the drawer in the morning (P5): a count made at 09:00 is labelled with that morning's trading day, so at 05:00 the previous evening is reported as 'kun yopilmadi'. Is that right, or should a close made before noon count for the trading day before?
- Waiter Xizmat haqi in the drawer (money rules §6, still open): with waiters paid monthly, does the month's Xizmat haqi stay in the drawer until payday? P5 shows unpaid Qoldiq beside 'Ertaga qoladi' with a one-tap 'Shuncha qoldirish' and enforces nothing.
- Days with no activity (P5 versus the letter of D21): D21 says a day not closed by 05:00 is reported at 05:00. P5 sends nothing for a day with no bill and no money movement, so a day the chayxana was shut produces no 'kun yopilmadi' message. Is that acceptable?
- Correcting a count (P5 versus D23): D23 lets OWNER and ADMIN correct any closed day, and expense corrections still move any day's Kutilgan and Farq. Retyping the counted cash (Sanaldi and Ertaga qoladi) is allowed on the latest close only, because each close's carry-over is the next day's opening cash. Is latest-only acceptable?
- Where waiter Qoldiq starts (P6): the migration sets waiter_pay_since to the first day of the month the build first runs, so earlier months count as fully paid. Waiter avans already entered in Chiqimlar as repayable expenses stay there and do not reduce Qoldiq; new ones go through Maoshlar. Is that right for the till's history?
- Naqd or Karta for Keldi payments and avans returns (P3 and P4): only the expense form gets the Naqd/Karta choice (D10). Keldi deliveries paid from Ombor and returned avans are always booked as Naqd. If either is ever paid by card, Kassa stops matching the drawer (the governing constraint). Do they need the same choice?
- PIN lock reset on success (PRD 14 §10, no package owns it): a phone with one valid PIN can guess 4 times, log in and repeat without ever locking. Should misses be kept across a successful login, or should the app move to G5 B (name, then PIN)?
