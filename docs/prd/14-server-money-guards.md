# PRD 14 — Server money guards

- **Status:** Implemented on `fix/server-money-guards` (pushed as its own branch, not merged) —
  G1–G6 as Option A, G7 as Option B; not released. Decided 2026-09-30 (§6, §7); built 2026-09-30
  and 2026-10-01 (§9)
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
  STATE item 2) measures it first.
- Line edits, found while planning: `addLine`, `addCombo`, `updateLineQuantity` and `cancelLine`
  check the order's status before their transaction (`order.service.ts:250, 327, 391, 468`), the
  same cause as G1. A dish added while the admin confirms can land on a closed bill — its stock
  taken, its price in no total. Not tested yet; it belongs to the next slice.

## 3. Current state

*As found on `feat/auto-update` at `e4082df`, before this slice. The line numbers point at that
code; §9 says what was built.*

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
  DRAFT→CANCELED, every live line restored through `stockService.restore`, the
  reason "Avtomatik bekor qilindi: 12 soat yuborilmadi", and an `ORDER_CANCELED` audit row with
  `automatic: true`. `AuditLog.userId` is required, so the actor is the draft's own waiter; the
  metadata says it was automatic.
- **B. Delete as today, but restore stock first** and write StockEntry and audit rows. The order
  itself leaves no trace.
- **C. Add a system actor** (nullable actor or a seeded system user). The most honest
  attribution; a migration on two tables and every reader of them.

### G5 — PIN lockout

- **A. Compare the PIN first; lock the device.** Only the matched waiter's own lock applies to
  them. A PIN that matches nobody counts against the device (the client's address; `deviceLabel`
  is not part of the key, because the client supplies it, so address-only is stricter), held in
  memory: 5 misses lock that device for 5 minutes. Server only; the apps already show LOCKED.
- **B. Name, then PIN.** The waiter picks their name and types the PIN; misses count against that
  waiter. Changes the login screen of both waiter apps; stronger against guessing, since a PIN is
  tried against one waiter instead of all of them.

### G6 — print outside the write lock

- **A. Print after commit.** The transaction claims CLOSED first, then writes totals, payments,
  debt and the audit row, and commits; the print runs after and writes its own PrintJob (none when
  no printer is chosen: the print stops before any row exists). A failure marks that PrintJob
  FAILED and the ticket shows "Chek chiqmadi" with "Qayta chop etish" (`reprintBill` exists). A
  printer fault never loses or blocks a sale. Retires the "print failure rolls back" rule.
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
  2 already copies with the app closed).
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
  unit tests in `pnpm test`. The e2e suite is versioned first (plan Task 1, `c04cbfe`).
- **Verify:** the guards' e2e tests green with none of the 39 controls regressing, `pnpm test`,
  and `pnpm typecheck` no higher than the floor of 48 (47 as built).
- **Docs:** done with the build — CLAUDE.md "Single confirm action" and `docs/CURRENT_WORKFLOW.md`'s
  confirm section describe G6 A. `decisions.md` still carries the old print rule; it changes only on
  Barkamol's instruction.
- **Data:** nothing is migrated. Drafts already deleted stay deleted; their missing portions show
  at the next Sanoq, and the diagnostic's `count-shrinkage` check sizes them. Balances already hit
  by a lost repayment are found by its `repayment-race` check and corrected by hand.
- **Release:** through the update feed (STATE items 4–5). Stop at "ready to deploy" and hand over
  the commands.
- **Rollback:** by the commits in §9, in these groups only. Later commits touch the same
  functions, so a revert may need a manual merge.
  - The final review's fixes (`67455a1`) touch G3–G7: revert them first.
  - G1 (`b827140`) does not revert alone: G4 and G6 use its claim methods (`cancelIfIn`,
    `closeIfSent`).
  - G2: `d48fa36` reverts only with `4d6e50b`. G3: `3891499` reverts only with `c45fe9b`.
  - G6 (`d0e4d9b`, `ddcb5fb` and `c5377eb` together) reverts only together with G7 (`83fc724`).
    G7 gives the process one connection; reverting G6 without it puts the print back inside the
    confirm transaction, which would then hold that only connection: every other request waits
    for the print, and a reprint during a confirm deadlocks until the confirm's 30 s timeout
    (measured between plan Tasks 3 and 4). G7 can revert alone.
  - G4 (`e020b94`) and G5 (`3bd7b84`, `d04a2a8`) revert on their own.

## 9. As built

Built on `fix/server-money-guards` (off `feat/auto-update` at `e4082df`): 14 commits,
`e4082df..d04a2a8`, a docs commit (`fc0e169`), then the final review's fixes (`67455a1`) and their
docs commit. At `67455a1`, in the Docker harness: e2e 68 pass / 38 fail (106), `pnpm test` 142
tests in 14 files, `pnpm typecheck` 47 (the `loginPin` rewrite removed one of the 48),
`typecheck:renderer` and `typecheck:gallery` 0. The 38 failures are defects later slices own; none
is a test §5 lists, and none was added by this slice. Against the baseline of 87 tests (39 pass,
48 fail): 7 flipped to pass, 3 rewritten tests pass, 19 new tests pass, and none that passed now
fails.

| Guard | Commits |
|---|---|
| e2e suite, versioned outside `pnpm test` | `c04cbfe`, `d4a7157` |
| G1 one confirm per bill | `b827140` |
| G7 one SQLite connection | `83fc724` |
| G6 print after commit | `d0e4d9b`, `ddcb5fb`, `c5377eb` |
| G2 atomic repayment | `4d6e50b`, `d48fa36` |
| G3 whole so'm, one Nasiya leg | `c45fe9b`, `3891499` |
| G4 draft cleanup | `e020b94` |
| G5 PIN lockout | `3bd7b84`, `d04a2a8` |
| Final review: toast placement, PIN guard test, session touch, alert timeout | `67455a1` |

Where the build differs from §4 or the plan. Each point was ruled while Barkamol was away, and none
reverses a decision in §5–§6. The plan's "Deviations during execution" has the full list.

- **G1:** cancel claims from the status its checks ran against, and restores stock from lines
  re-read inside its transaction.
- **G2:** a written-off debt stays repayable (money rules D14); the write-off is race-safe too.
- **G3:** `somAmount` (> 0) and `somAmountOrZero` (≥ 0); a Nasiya leg of 0 is refused; menu `price`
  and discount `value` are whole so'm, tan narx (`costPrice`) is not — Keldi stores paid ÷ qty
  unrounded and the Menyu form re-sends it on every save; a body that fails its schema answers 400,
  not 500.
- **G4:** a restore writes no StockEntry row; the `automatic: true` audit row is the record.
- **G5:** the device key is the client address only, and a device runs one PIN attempt at a time —
  an overlapping one answers 409 "Oldingi urinish hali tugamadi, biroz kuting". The existing
  30-per-minute `ipRateLimit` on `POST /api/auth/login-pin` also applies, and also answers 409. An
  e2e test pins the one-attempt rule: 30 wrong PINs at once from one address are judged at most 5
  times and leave it locked (7 judged without the rule).
- **G6:** the print writes its own PrintJob after the commit, not a PENDING one inside it (§4 now
  says so). After the commit: socket emits, then the print, then the owner alerts, each of which
  waits at most 5 s for Telegram. The failure notice names its bill, has a "Yopish" button and
  48 px buttons, and sits bottom-centre with every other toast of the confirm loop, clear of the
  next bill's TASDIQLASH and of the queue's first rows. `printBill` takes no transaction.
- **G7:** `transactionOptions.maxWait` is 10 s, because a `$transaction` now waits for the one
  connection. The session touch writes `lastUsedAt` at most once a minute, so most requests add no
  write, and the client logs once that it opens one connection.

## 10. Left for later

**Before a till gets this build.** A fractional total can no longer be paid: payment legs must be
whole, so a bill whose total has a fraction has no legal set of legs. A legacy fractional remainder
shows rounded (`toFixed(0)`), so it fails as an overpay when rounded up and leaves a residue nobody
can pay when rounded down. Run this read-only on a copy of the till's database (STATE item 2) and
fix every non-zero row by hand first. Tan narx (`costPrice`) is not on the list: it never feeds a
bill total.

```sql
-- sqlite3 -readonly master.sqlite < fractional-amounts.sql
SELECT 'MenuItem.price' AS field, COUNT(*) AS fractional FROM MenuItem
  WHERE price <> CAST(price AS INTEGER)
UNION ALL SELECT 'Discount.value', COUNT(*) FROM Discount
  WHERE value <> CAST(value AS INTEGER)
UNION ALL SELECT 'OrderLine.unitPriceSnapshot, open orders', COUNT(*)
  FROM OrderLine l JOIN "Order" o ON o.id = l.orderId
  WHERE o.status IN ('DRAFT', 'SENT') AND l.isCanceled = 0
    AND l.unitPriceSnapshot <> CAST(l.unitPriceSnapshot AS INTEGER)
UNION ALL SELECT 'Debt.remainingAmount, not PAID', COUNT(*) FROM Debt
  WHERE status <> 'PAID' AND remainingAmount <> CAST(remainingAmount AS INTEGER)
UNION ALL SELECT 'Expense.amount, avans included', COUNT(*) FROM Expense
  WHERE amount <> CAST(amount AS INTEGER)
UNION ALL SELECT 'ExpenseReturn.amount', COUNT(*) FROM ExpenseReturn
  WHERE amount <> CAST(amount AS INTEGER);
```

**For slice 2** (money rules §7).

- Confirm computes its totals from a read taken before its transaction. A line edit landing between
  that read and the claim leaves a CLOSED bill whose total misses the dish, and the line-edit fix
  of §2 does not close it (the order is legitimately SENT then). Compute the totals and check the
  payments from a re-read after the claim, inside the transaction; `computeTotals`'
  `discountRepo.findById` then needs `tx`.
- `addLine`, `addCombo`, `updateLineQuantity` and `cancelLine` still check the status before their
  own transaction (§2), so a dish can land on a bill that has just closed.
- D14 must define how a written-off debt shows after a later payment. Today it becomes PARTIAL or
  PAID with `writtenOffAt` still set: Qarzlar counts what is left of it, Hisobot does not. Stamp
  `writtenOffAt` inside the write-off transaction (`debt.service.ts` takes it before), so "comes
  back into profit" never classifies by `paidAt > writtenOffAt`. No screen calls the write-off
  route yet.
- In the same slice (D14): a written-off debt that a late payment revived to PARTIAL can be written
  off a second time, which overwrites `writtenOffAt` and writes a second audit row and owner
  alert.

**Questions for Barkamol** — answered 2026-10-02: the Sanoq over-count is fixed (money rules D26),
auto-cancelled drafts are not counted as cancelled (D27). The PIN reset-on-success question is open.

- A Sanoq taken while an open order holds portions over-counts when that order is cancelled later.
  At 22:00 the owner counts 10 somsa; a draft still holds 5 of them (taken when the line was
  added, never cooked); the 12-hour cleanup cancels it the next morning and adds 5 back, so the
  count says 15. A cancel by hand after a Sanoq does the same. Skip the restore for lines older
  than the item's latest Sanoq, or accept it until the next Sanoq?
- Auto-cancelled drafts count wherever cancelled orders do: the waiter's `ordersCanceled`, the day
  report of the cleanup day, Buyurtmalar's "Bekor qilingan" tab, the audit page. A waiter who
  leaves 3 drafts overnight shows 3 cancelled orders in the morning. Keep, or hide automatic ones?
- The PIN lock resets on a successful login: a phone with one valid PIN can guess 4 times, log in
  with its own PIN and repeat without ever locking — 24 guesses and 6 logins of its own a minute
  under the 30-per-minute limit. Keep misses across a success and let them expire some minutes
  after the last miss? G5 B (name, then PIN) is the stronger option and changes both waiter apps.

**Checks owed on the till.**

- Time the session touch on the till's own disk: one write a minute per session is measured only
  in Docker on a Mac, which hides the disk's sync speed.
- Open the packaged build once: the notice colours differ between dev and a production build (CSS
  order against sonner's runtime style), and the toast positions were checked only in a browser
  at 1236 × 623.

**Known, not caused by this slice.**

- The confirm response still waits for its owner alerts on nasiya and large-discount sales, now at
  most 5 s each (10 s for a nasiya sale with a large discount); an added dish that empties a
  counted item waits for its stock-out alert the same way. The slip and the other screens never
  wait.
- A Windows profile path with a space fails at `$connect`: `toSqliteUrl` (`sqlite-bootstrap.ts`)
  percent-encodes the path and Prisma does not decode it. The same on the build the customer runs.
- G5 locks per client address, so a shared till would lock everyone at it (§6.2).

**Porting to `feat/web-platform`** (PostgreSQL, read committed; `apps/master` does not build
there). Re-apply by hand, not by cherry-pick: the paths differ.

- The debt write-off reads the debt, then claims it, relying on SQLite's `BEGIN IMMEDIATE` for the
  balance it records. On PostgreSQL, claim first, then read the balance.
- `connection_limit=1` and `lib/sqlite-url.ts` are SQLite-only.
- The PIN device key is the socket address, because the server binds `0.0.0.0` and sets no
  `trust proxy`. If a reverse proxy or a `::` bind is ever added, set `trust proxy` deliberately, or
  every client shares one key and a floor-wide lock returns.

**Release.** Nothing reaches a till until the update feed is restored and a version is cut (STATE
items 4–5); this slice needs v0.1.5. The smaller review follow-ups are in the plan's "Deferred
review findings".
