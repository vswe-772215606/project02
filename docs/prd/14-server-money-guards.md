# PRD 14 — Server money guards

- **Status:** Decided 2026-09-30 — G1–G6 as Option A; G7 as Option B after measuring (§6, §7)
- **Author / date:** 2026-09-30
- **Area:** Domain correctness (confirm, payments, debts, auth, SQLite writes)
- **Slice:** 1 of `docs/superpowers/specs/2026-09-30-money-rules-design.md` §7
- **Related:** PRD 03 (print pipeline — this supplies the measurement it waited for), PRD 06
  (debt reconciliation), PRD 09 (print throughput), PRD 10 (backup)

## 1. Context

The 2026-09-30 finance e2e suite drove the real server with truly simultaneous requests and
reproduced these on the build the customer runs (v0.1.4):

- The same bill confirmed twice at the same moment was charged twice and printed twice — 5 of 5
  attempts (Money Map issue 26).
- Two repayments at the same moment reduced the balance once — 5 of 5. Qarzlar then showed
  200 000 owed while the reports showed 150 000 (issue 29).
- A −30 000 card leg was accepted. Two Nasiya legs totalling 90 000 opened a 50 000 debt. An
  avans return of 99 999.5 left a balance that never clears (issues 27, 28).
- The stale-draft cleanup deleted a draft and kept its 5 somsa out of stock, with no record
  (issue 7).
- Five wrong PINs from one waiter locked every waiter out.
- While a bill printed for 8 s, another waiter's add failed with a 500 after 5.3 s. 78 writes
  back to back at machine speed produced a 500.

None of these needs a money-rule decision: they are guards the server never had (test report
causes 6 and 7). Two of the fixes change behaviour an operator will notice; Barkamol decided
both on 2026-09-30 (§6).

## 2. Goals / non-goals

**Goals**

- A bill is charged, printed and closed exactly once, whatever the timing.
- A debt balance never loses a concurrent repayment.
- The server refuses money it cannot account for: negative or fractional amounts, and a second
  Nasiya leg.
- Nothing automatic moves stock without a record.
- One waiter's typos never lock another waiter out.
- A slow or jammed printer never fails another station's write.

**Non-goals**

- The rest of money-rules §4 (late-discount rebalance, Keldi undo, alerts, labels) — later slices.
- The async print queue with an admin queue screen (PRD 03 Option A, phase 2).
- Sale reversal and refunds (FIN-3).
- Correcting data already damaged in production; the diagnostic (`e2e/prod-forensics.ts`,
  STATE item 1) measures it first.
- Line edits, found while planning: `addLine`, `addCombo`, `updateLineQuantity` and `cancelLine`
  check the order's status before their transaction (`order.service.ts:248, 325, 389, 466`), the
  same cause as G1. A dish added while the admin confirms can land on a closed bill — its stock
  taken, its price in no total. Not tested yet; it belongs to the next slice.

## 3. Current state

| # | Guard | Where | What happens |
|---|---|---|---|
| G1 | One confirm per bill | `order.service.ts:686-689`, `order.repo.ts:253-261` | `confirm` checks `status === SENT` before its transaction; `setClosed` updates by id only. Two confirms both pass the check; SQLite runs their transactions one after the other, and the second writes its payments, prints and closes again. `cancelOrder` (`order.service.ts:604-657`, `setCanceled`) has the same shape, so a cancel that passed its check while the order was SENT can cancel a bill a confirm has just closed — not yet tested, same cause. |
| G2 | Atomic repayment | `debt.service.ts:139-174` | The debt is read and the overpay limit checked outside the transaction; the write sets `remainingAmount = stale − amount`. The last writer wins. |
| G3 | Whole so'm, one Nasiya leg | `orders.controller.ts:52`, `expense.controller.ts:8, 20`, `debt.controller.ts:13`, `order.service.ts:691, 725` | Payment legs accept any integer (negative included) or any non-empty string; expense, avans-return and repayment amounts accept fractions or any string. Only the first DEBT leg becomes a debt, while every leg is stored as a payment. |
| G4 | Draft cleanup | `lib/scheduler.ts:7-22` | `order.deleteMany` on drafts older than 12 h. Lines cascade away; no `stockService.restore`, no StockEntry, no audit row. Runs at start-up and every 6 h. |
| G5 | PIN lockout | `auth.service.ts:30-46, 102-123`, `user.repo.ts:19-29` | `loginPin` loads every active waiter, runs `ensureNotLocked` on each before comparing the PIN, and charges a wrong PIN to the first waiter in the list. Once that waiter is locked, every PIN login throws LOCKED inside the loop. A PIN-only login cannot know who mistyped. |
| G6 | Print outside the write lock | `order.service.ts:708-790`, `print.service.ts:67-69` | The bill prints (`:744`) inside `$transaction`, after payments are written, so SQLite's single write lock is held for the whole print: up to 15 s (`execFile` timeout) within a 30 s transaction. Other writers wait about 5 s and fail with a 500 (P1008). The print sits inside so that a print failure rolls the sale back (`:667-668`, CLAUDE.md "Single confirm action"). PRD 03 already rejected holding a transaction across a print. |
| G7 | Write bursts | `e2e/13-contention.test.ts`, `middleware/requireAuth.ts:35`, `lib/prisma.ts` | 78 sequential menu creates produced a 500. Measured 2026-09-30: ten unhandled `P1008` rejections ("Socket timeout") in one burst. Every authenticated request fires `void sessionRepo.touchLastUsed(…)`; on a second connection that write deadlocks against the request's own transaction until Prisma's 5 s timeout. No `journal_mode`, busy timeout or connection limit is set; `DATABASE_URL` is a bare `file:` URL. |

## 4. Options

### G1 — one confirm per bill

- **A. Claim the order first.** The transaction's first write is
  `updateMany({ where: { id, status: SENT }, data: { status: CLOSED, closedAt } })`; a count of
  0 throws `IllegalStateTransition` and rolls back. Payments, debt, audit and print follow.
  Every transition takes the same shape: send (DRAFT→SENT), cancel (DRAFT|SENT→CANCELED),
  confirm (SENT→CLOSED). No schema change.
- **B. Idempotency key from the ticket** (PRD 03 Option E). Also makes a retried request return
  the first result, but needs a client change and does nothing for two stations.

### G2 — atomic repayment

- **A. Conditional decrement inside the transaction.**
  `updateMany({ where: { id, status: { in: [OPEN, PARTIAL] }, remainingAmount: { gte: amount } }, data: { remainingAmount: { decrement: amount } } })`;
  a count of 0 answers `DebtOverpay` or `DebtNotOpen`; then read back to set status and
  `closedAt`. No schema change.
- **B. Drop the stored balance** and derive it from repayments (PRD 06 Option B). Cleaner and
  larger; PRD 06 lists the regressions.

### G3 — whole so'm, one Nasiya leg

- **A. One money schema, and one Nasiya leg.** A shared zod type for so'm: an integer, or a
  string of digits. Positive for expenses, avans returns, repayments and Keldi payments;
  zero allowed for payment legs, because the ticket sends zero legs and a fully discounted bill
  can pay 0. More than one DEBT leg is refused with an Uzbek validation message.
- **B. Sum several Nasiya legs into one debt.** No new error, but two nasiya legs for one bill
  is never what an operator means, and the ticket offers one.

### G4 — draft cleanup

- **A. Cancel instead of delete.** Each stale draft goes through the cancel path: a conditional
  DRAFT→CANCELED, every live line restored through `stockService.restore` (StockEntry rows), the
  reason "Avtomatik bekor qilindi: 12 soat yuborilmadi", and an `ORDER_CANCELED` audit row with
  `automatic: true`. `AuditLog.userId` and `StockEntry.actorUserId` are required, so the actor
  is the draft's own waiter; the metadata says it was automatic.
- **B. Delete as today, but restore stock first** and write StockEntry and audit rows. The order
  itself leaves no trace.
- **C. Add a system actor** (nullable actor or a seeded system user). The most honest
  attribution; a migration on two tables and every reader of them.

### G5 — PIN lockout

- **A. Compare the PIN first; lock the device.** Only the matched waiter's own lock applies to
  them. A PIN that matches nobody counts against the device (client IP plus `deviceLabel`),
  held in memory: 5 misses lock that device for 5 minutes. Server only; the apps already show
  LOCKED.
- **B. Name, then PIN.** The waiter picks their name and types the PIN; misses count against that
  waiter. Changes the login screen of both waiter apps; stronger against guessing, since a PIN is
  tried against one waiter instead of all of them.

### G6 — print outside the write lock

- **A. Print after commit.** The transaction writes totals, payments, debt, a PENDING PrintJob and
  CLOSED, and commits; the print runs after. A failure marks the PrintJob FAILED and the ticket
  shows "Chek chiqmadi" with "Qayta chop etish" (`reprintBill` exists). A printer fault never
  loses or blocks a sale. Retires the "print failure rolls back" rule.
- **B. Keep the print inside, shorten the hold.** A 3 s print timeout instead of 15 s, and a busy
  timeout on other writers longer than that, so they wait instead of failing. Keeps the rule; a
  jammed printer still blocks closing that bill, and every write can stall about 3 s.
- **C. Print before the transaction.** A crash between print and commit leaves a printed bill
  with no sale. Rejected.

### G7 — write bursts

- **A. Measure, then set SQLite for one writer and many readers.** Reproduce with the e2e test
  and log the Prisma error code. If it is lock contention, turn on WAL
  (`PRAGMA journal_mode=WAL`, persisted in the file) and a busy timeout, so readers stop
  blocking the writer and a writer waits instead of failing. WAL adds `-wal` and `-shm` files
  beside `master.sqlite`: a copy taken while the app runs must include them (PRD 10; STATE item
  1 already copies with the app closed).
- **B. A single connection** (`connection_limit=1`), so the process never contends with itself.
  Simple, but every read queues behind every write; tolerable only once G6 keeps transactions
  short. **Chosen after measuring:** a copy of the whole suite run with `connection_limit=1`
  passed the burst and failed nothing new. WAL was not tried: by SQLite's documented behaviour it
  would turn the deadlock into an immediate `SQLITE_BUSY_SNAPSHOT` for a transaction that reads
  before it writes (Prisma's nested `connect` does), rather than remove it.

## 5. Decision matrix

| Guard | Chosen | Decided by | Schema | App change | Test that must turn green |
|---|---|---|---|---|---|
| G1 | A | no decision needed | no | no | `02-payments` issue 26; new: cancel racing confirm |
| G2 | A | no decision needed | no | no | `06-debts` issue 29 (both tests) |
| G3 | A | no decision needed | no | no | `02-payments` issues 27, 28; `05-expenses` avans whole so'm |
| G4 | A | no decision needed | no | no | `04-stock-cost` issue 7 |
| G5 | A | Barkamol, 2026-09-30 | no | no | `08-staff-access` PIN lockout; new: a locked device does not block another |
| G6 | A | Barkamol, 2026-09-30 | no | ticket: print-failure state | `13-contention` slow print; new: failed print leaves the bill CLOSED and reprintable |
| G7 | B | measured 2026-09-30 | no | no | `13-contention` 78 writes |

## 6. Open questions

1. **Decided, Barkamol 2026-09-30 — the printer fails at Tasdiqlash:** the sale closes anyway and
   the ticket offers "Qayta chop etish" (G6 A).
2. **Decided, Barkamol 2026-09-30 — PIN login:** one-step PIN stays; five misses lock the device,
   not the floor (G5 A). This assumes each waiter logs in from their own phone; a shared terminal
   would lock for everyone on it, and would call for G5 B instead.
3. **Decided, measured 2026-09-30 — G7's cause** is the unawaited session touch deadlocking on a
   second connection (§3); Option B.

## 7. Recommendation

G1–G6 as Option A, G7 as Option B. G1–G4 needed no decision, need no schema change, and each
closes a way money is lost or miscounted today; G5 and G6 are Barkamol's choices; G7 follows the
measurement.

Order, by money at risk: G1, G2, G6, G3, G4, G7, G5. The implementation plan
(`docs/superpowers/plans/2026-09-30-server-money-guards.md`) moves G7 up to just before G6: until
one connection is in place, the session-touch deadlock can stall any request for 5 s and makes
G6's timing test flaky.

## 8. Rollout

- **Branch:** `fix/server-money-guards` off `feat/auto-update`, the build the customer runs.
- **Test-first:** each guard's e2e test fails before its fix and passes after; the new tests in
  §5 are written first. The pure pieces — the so'm schema, the per-device miss counter — get
  unit tests in `pnpm test`. The e2e suite is versioned first (STATE item 2).
- **Verify:** the guards' e2e tests green with none of the 39 controls regressing, `pnpm test`,
  and `pnpm typecheck` at the floor of 48.
- **Docs, when shipped:** CLAUDE.md "Single confirm action" and `docs/CURRENT_WORKFLOW.md`'s
  confirm section if G6 A is chosen. `decisions.md` still carries the old print rule; it changes
  only on Barkamol's instruction.
- **Data:** nothing is migrated. Drafts already deleted stay deleted; their missing portions show
  at the next Sanoq, and the diagnostic's `count-shrinkage` check sizes them. Balances already hit
  by a lost repayment are found by its `repayment-race` check and corrected by hand.
- **Release:** through the update feed (STATE items 4–5). Stop at "ready to deploy" and hand over
  the commands.
- **Rollback:** each guard is its own commit and reverts on its own.
