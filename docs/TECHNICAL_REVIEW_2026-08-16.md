# Chayxana POS — technical review

**Date:** 2026-08-16 · **Branch:** `feat/remove-walkout` (81 commits ahead of `main`, unmerged)
**Method:** seven parallel layer reviews (schema, money path, finance, API, renderer, runtime,
verification), each adversarially re-checked, then synthesised. Everything below was read from
code. Findings marked **[verified]** were additionally opened and confirmed by hand after the
review, listed with the exact line.
**Coverage limit:** static analysis only. Docker was not running, so nothing was driven against a
live server. That is the same gap `AUDIT_FINDINGS.md` §7 declares, and it is not closed here.

---

## Verdict

The arithmetic core of this till is correct, and that deserves to be said first. Bill math is right
on every path — FOOD-only subtotal, xizmat haqi from SERVICE lines, service surviving a 100% food
comp. No discount path can drive a total negative. Oversell is genuinely impossible:
`decrementStockAtomic` is a real conditional update. Tashkent day-bucketing is centralised and
correct. The `cashOut` ≠ `expenseNet` drawer rule from the production incident is applied on every
cash surface. Decimal discipline holds end to end, so no so'm is lost to floating point. All 17
migrations replay clean, and the walkout removal was sequenced correctly.

What is wrong sits almost entirely *around* that core, in five clusters:

1. **The `next` build talks to the production till.** The renderer hardcodes `localhost:4000`; the
   port lives only in the main process. The isolation the last commit built is defeated in the one
   file nobody checked.
2. **Concurrency.** Every order mutation except `send` checks status outside the transaction it
   writes in, and the two terminal writes have no compare-and-swap.
3. **The confirm ticket.** A nasiya leg is added at 0 so'm while the cash leg still holds the full
   bill, and TASDIQLASH is lit in that state.
4. **Durability.** No backup exists anywhere, and the upgrade path rewrites the live database in a
   single non-atomic `writeFileSync`.
5. **The real hardware.** The window is created at 1280×800 on a 1366×768 screen with no maximize,
   so the bottom strip — where every primary action lives by design — is off the display, on a
   device with no mouse to drag it back.

75 findings survived verification, 53 of them new. The twelve below are the ones that cost money or
lose data.

## Top findings

| # | What breaks | Where | Cost | Known? |
|---|---|---|---|---|
| 1 | `next` build's renderer hardcodes `:4000` — trial UI drives the **live** database | `renderer/api/client.ts:4`, `lib/socket-client.ts:21` | Every isolation guarantee in `app-identity.ts` defeated | New (this branch) **[verified]** |
| 2 | Nasiya leg is added at 0 while cash holds the full bill; TASDIQLASH lit | `OrderTicket.tsx:114,166` | Drawer short by the bill, receivable lost | New (this branch) **[verified]** |
| 3 | Stale-draft cleanup hard-deletes orders, never restores `stockCount` | `lib/scheduler.ts:10` | Silent permanent inventory drift, no trail | `C-5` **[verified]** |
| 4 | `setClosed`/`setCanceled` have no CAS — confirm and cancel both commit | `order.repo.ts:204,214` | Paid order recorded CANCELED: cash off books, stock re-added | §11 #1 (half) **[verified]** |
| 5 | No backup anywhere, plus non-atomic DB rewrite on upgrade | `sqlite-bootstrap.ts:117` | Total loss of all history on one bad write | `F-9` / `C-1` |
| 6 | One mistyped PIN locks every waiter, and it latches | `auth.service.ts:103`, `user.repo.ts:19` | Floor cannot take orders; no admin unlock exists | `C-14` **[verified]** |
| 7 | Window is 1280×800 on a 1366×768 till, no maximize | `main/index.ts:191` | TASDIQLASH / SAQLA below the screen edge | New **[verified]** |
| 8 | Nav rail overflows a non-scrolling box when "Boshqa" is open | `NavRail.tsx:75` | Sozlamalar, Amallar tarixi, Chiqish unreachable | New |
| 9 | Line add/edit/cancel check status outside their transaction | `order.service.ts:216` vs `:246` | Line lands on a CLOSED order: free food, stock short | §11 #2 (half) |
| 10 | Spoilage and uncosted purchases hit neither opex nor COGS | `stock.service.ts:244`, `StockPanel.tsx:87` | Sof foyda overstated, unbounded, invisible | New |
| 11 | Every install seeds `owner/owner123`, `admin/admin123`, and logs them | `sqlite-bootstrap.ts:145,187` | Any device on the wifi can take OWNER | New **[verified]** |
| 12 | ADMIN can PATCH itself to OWNER, unaudited | `user.service.ts:79` | Full owner access, no trace | `F-4` **[verified]** |

---

## Detail

### 1. The `next` build drives the production database — new, this branch **[verified]**

`renderer/api/client.ts:4` is `const BASE = 'http://localhost:4000'`, and `lib/socket-client.ts`
calls `io('http://localhost:4000')`. Both are literals. The variant port exists only at
`app-identity.ts:73` (`port: 4100`), and `electron.vite.config.ts:13`'s `define` block —
`__CHAYXANA_VARIANT__` — is inside the **`main`** config. The `renderer` block has no `define` at
all.

So the `next` build starts its server on 4100 and its admin window then connects to 4000. Beside a
live till that is the production server, and therefore the production database — the exact outcome
`25b4741` was written to prevent, arriving through the one file that commit did not touch. On a
machine with no production install, nothing is listening on 4000 and the trial build simply cannot
reach its own server.

`package:win:next` should not be run beside a live till until the renderer reads the port.

### 2. Nasiya leg is added at zero — new, this branch **[verified]**

`OrderTicket.tsx:114` seeds `legs` with a single CASH leg holding `order.totalAmount`. `addLeg`
(`:166`) computes `remaining = Math.max(due - paid, 0)`, and on a SENT order `paid` already equals
`due` — the confirm snapshots are written inside the confirm transaction, so `subtotalSnapshot` and
`serviceChargeSnapshot` are null and `due` collapses to `totalAmount`. Every leg added afterwards
therefore starts at **0**. `balanced` (`:122`) is already true, and TASDIQLASH unblocks the moment a
debtor is picked (`:227`).

Two aggravating facts, both verified: nothing reduces the CASH leg automatically, and **there is no
remove action for a leg** — `:370-377` only offers `+ CARD` / `+ DEBT`, and there is no
`removeLeg` anywhere in the file. An accidental DEBT tap is unrecoverable without abandoning the
ticket, and because `hasDebtLeg` ignores the amount, it also forces the operator to name a debtor
before a pure cash sale will confirm.

Scope note, because the review overstated this: the operator *can* do it correctly — tap the cash
leg, keypad it to 0, tap the debt leg, key in the amount. That is exactly what the 2026-08-15
gallery run did. The defect is that the wrong state is the **default** and is confirmable in one
tap, on the screen this branch added, with no undo. The server does not catch it either:
`order.service.ts:685` only checks `totalPaid !== totalDue`, and `orders.controller.ts:52` puts no
positivity bound on `amount`, so a 0 so'm Debt row is written happily.

### 3. Stale-draft cleanup destroys stock **[verified]**

`scheduler.ts:10` is a bare `order.deleteMany({ status: 'DRAFT', createdAt: { lt: now-12h } })`.
`OrderLine.orderId` is `onDelete: Cascade` (`schema.prisma:379`), so the lines go with it. Stock was
decremented at line-add; nothing here calls `stockService.restore`, writes an `AuditLog`, or writes
a `StockEntry`. It runs once on boot and every 6 hours (`scheduler.ts:26-27`).

`schema.prisma` documents that sales are not journaled to `StockEntry` because they are
"reconstructible from OrderLines" — this delete removes the only reconstruction source. The count
goes permanently short with no forensic trace, and the next Sanoq launders it as shrinkage. It is
the only hard delete of business data in the server.

No P&L effect: every COGS query filters `status: CLOSED`. The review's "profit overstated" claim on
this item is wrong.

### 4. No compare-and-swap on the terminal writes **[verified]**

`order.repo.ts:194` `setSent` is a correct CAS — `updateMany` with `status: DRAFT` in the `where`,
returning null on a lost race. `setClosed` (`:204`) and `setCanceled` (`:214`) are plain `update`
with no status predicate, and both callers check status outside their transaction
(`order.service.ts:668`, `:601`). The `if (!updated) throw` at `:728` is dead code.

Failure: a waiter taps Bekor qilish on mobile while the admin taps TASDIQLASH. Confirm commits —
payment recorded, bill printed, CLOSED. Cancel then flips the same row to CANCELED and restores
every line's stock. Reports scope to CLOSED, so collected cash drops out of takings while sitting in
the drawer, and eaten food goes back on the shelf. Confirm-vs-confirm (duplicate payments, second
bill) is the documented half of §11 #1; this interleave is not.

### 5. No backup, and the upgrade rewrites the live file in place

No `VACUUM INTO`, `copyFileSync`, or `integrity_check` exists anywhere in `apps/master/src` or
`scripts`. `startScheduler` runs exactly two jobs, neither of them a backup.
`sqlite-bootstrap.ts:117` loads the whole database into sql.js and `writeFileSync`s it straight over
the live file — no temp+rename, no fsync, no prior copy.

The write window is sub-second and only on an upgrade boot, so this is not a daily risk. It is that
one unreplicated file holds every order, payment, expense and the open nasiya ledger, and the boot
where it is rewritten is the boot the operator is least prepared for. There is nothing to restore
from.

### 6. PIN login takes the whole floor down, and latches **[verified]**

`user.repo.ts:19` — `findActiveByPin(_pinHash)` never touches its argument; it returns *every*
active waiter with a PIN. `auth.service.ts:103` then calls `ensureNotLocked(waiter)` inside the loop
**before** any bcrypt compare, so one locked waiter throws for everyone, including a waiter typing a
correct PIN. On failure, `:117` charges the attempt to `waiters[0]` regardless of who typed.

`failedLogins` clears only when that user logs in successfully, and no admin endpoint resets it.
Five wrong PINs from anywhere on the LAN lock the floor for five minutes; when the lock expires
`waiters[0]` is still at five failures, so the next single mistype re-locks everyone. The only exits
are `waiters[0]` logging in or being deactivated — and reactivating them re-arms it.

### 7. The window is bigger than the screen — new **[verified]**

`main/index.ts:191-192` creates the BrowserWindow at `width: 1280, height: 800`. Grep across
`src/main` for `maximize|fullscreen|kiosk|setBounds` returns nothing, and there is no
`Menu.setApplicationMenu(null)` either.

On a 1366×768 finger-operated screen the window is taller than the display before frame, title bar
and the default Electron menu bar. The clipped region is exactly the `Panel` foot — the structural
guarantee that a primary action can never fall below the fold. TASDIQLASH, SAQLA VA KEYINGISI and
KIRIMNI SAQLA are the controls at risk, and there is no mouse to resize the window. Every
measurement taken during the C1 rebuild was against a 768px frame the product never renders into.

### 8. Nav rail clips the last destinations — new

`NavRail.tsx:75` is a `w-[168px] shrink-0 content-start` column with no `overflow` and no
`min-h-0`, inside `AppShell.tsx:19`'s `h-full overflow-hidden`. There are 6 primary destinations
plus 9 behind "Boshqa" — 15 in one column at touch-floor row heights. Expanding "Boshqa" pushes past
768px with no scroll, no wheel and no keyboard. Sozlamalar (printer selection, receipt heading,
Telegram config), Amallar tarixi (the only detective control) and Chiqish are the ones past the cut,
in both OWNER and ADMIN layouts. Compounded by finding 7.

### 9. Line mutations land on already-terminal orders

`addLine` reads the order at `order.service.ts:216`, asserts DRAFT|SENT at `:229`, then opens an
unrelated `$transaction` at `:246` whose body re-checks nothing. `addCombo`, `updateLineQuantity`
and `cancelLine` have the identical shape. `send` (`:488-506`) shows the correct pattern in the same
file and is the only place it is used.

Failure: confirm is blocked inside its print (finding 11 below) while a waiter taps "+ Somsa". The
add passes its stale check, commits after CLOSED, and a line lands on a closed order with its stock
consumed. The bill was printed from `totalSnapshot`, so that portion appears in no total, no revenue
and no COGS — it left the kitchen and came off the shelf for free. `cancelLine` on a just-closed
order is the mirror: stock restored for food that was sold and paid for.

Two relatives: `updateLineQuantity` computes its delta from an unlocked read at `:366` then writes
an *absolute* quantity at `:398`; `cancelOrder` reads its line list outside the transaction (`:591`
vs `:612`), so two cancels of one order double-restore the whole order's stock.

### 10. Stock loss and uncosted purchases never reach the P&L — new

Purchases are deliberately excluded from `operatingExpense` on the promise that COGS recognises them
at sale. Two holes in that promise:

- `setCount` (`stock.service.ts:244`) writes only a `StockEntry(kind=COUNT)` — no Expense, no COGS
  adjustment — and `stockEntry.repo.ts:56` filters `paidUzs: { not: null }`, so COUNT rows are
  invisible to every finance query. Buy 100 for 1 000 000, sell 60, Sanoq the rest to zero: 400 000
  of real cost vanishes from Sof foyda.
- Cheaper to hit: `StockPanel.tsx:87` sends `setCostFromPaid = paid > 0 && updateCost`. Unticking
  "narxni yangilash" on a paid Keldi writes the money into the excluded category while leaving
  `costPrice` NULL, so `stock.service.ts:94` books **0 COGS** on every subsequent sale. One
  checkbox, no spoilage required.

The cash side is intact — `cashOut` uses the unfiltered expense summary — so this distorts profit,
not the drawer.

### 11. Confirm holds the write lock across a blocking print

`order.service.ts:725` awaits `printService.printBill` **inside** the `$transaction` opened at
`:689` (timeout 30 s), after four writes have taken the SQLite write lock. That awaits a
`concurrency: 1` queue and `execFileAsync(receipt.exe, …, { timeout: 15000 })`. There is no
`journal_mode`, `busy_timeout` or `connection_limit` set anywhere.

A jammed printer therefore freezes every other write — add line, cancel, restock, expense — for up
to 15 s per bill during service, surfacing as an English "Internal server error" because no Prisma
busy/pool code maps to an `AppError`. If queue wait plus print exceeds 30 s, `markSuccess` throws,
the catch's `markFailed` throws again from inside the catch, and a bare 500 escapes with the paper
already out.

Two related facts: `receipt.cpp:159` reports success when the **spooler accepts** the bytes, not
when paper emerges — an order can close correctly with no receipt. And a blank
`admin_printer_name` makes `printBill` throw inside the transaction, so **no order can be closed at
all** until the setting is fixed.

The rollback-on-print-failure design is deliberate and correct; this is about where the print sits
relative to the lock, not about the guarantee.

### 12. ADMIN can promote itself to OWNER **[verified]**

`user.service.ts:79` guards only the *existing* role of the target: `existing.role === OWNER` and
actor not OWNER → forbidden. `input.role` is never inspected and is passed straight into
`userRepo.update`. `PATCH /api/users/:id` is open to ADMIN with no self-check. The sibling
`create()` gets this right. `requireAuth` re-reads the user row per request, so the escalation takes
effect immediately, and nothing is audited. Reachable only from curl or devtools — the UI hides
OWNER in the role picker.

---

## Second tier

Real, verified, lower expected cost.

| Finding | Where | Failure | Known? |
|---|---|---|---|
| Confirm ticket clamps discount to food+service, server to food | `OrderTicket.tsx:112,155` vs `billing.service.ts:89` | Comping a meal dead-ends with an English PAYMENT_MISMATCH; gallery fixtures hide it by populating snapshots the server never sends on SENT | New |
| ZodError → 500 "Internal server error" in English | `errorHandler.ts:12` | A two-letter expense reason shows the owner English and silently drops the expense | §11 #8 |
| Second DEBT leg is silently uncollectable | `order.service.ts:672` | Two legs → full amount counted as credit sales, only the first booked as a debt | `F-6` |
| Telegram digest marked sent when nothing was delivered | `telegram-bot.service.ts:698` | Owner's only remote view dies silently; audit says `REPORT_SENT`; idempotency blocks retry | New |
| Cash-in entries are uncorrectable | `debt.routes.ts:10`, `expense.service.ts:420` | A mistyped repayment permanently falsifies the drawer on every past-day report | New |
| Waiters read `costPrice`, `stockCount`, `cogsSnapshot` | `order.repo.ts:35` | Whole cost sheet via `GET /api/orders/:id`, defeating the menu whitelist | New |
| Ombor count panel opens at a savable 0 | `StockPanel.tsx:59,83` | One mis-tap marks a dish sold out | New |
| Buyurtmalar CLOSED tab: count always 0, list unbounded | `OrdersPage.tsx:44`, `order.service.ts:147` | Reads "Yopilgan 0" above a full list; `date` discarded server-side | New |
| Cancel / settings save / reprint fail silently | `CancelOrderDialog.tsx:39`, `SettingsPage.tsx:50` | No `onError`, no MutationCache default; settings save is a `for` loop that half-applies | `M-69` |
| Two rows labelled "Jami chiqim" disagree | `ExpensesSection.tsx:60`, `GrandSummarySection.tsx:55` | Diverge on the cross-day-reversal day that caused the original incident. **Label them; do not reconcile them** | `M-14` |
| Two active orders on one table | `20260814120000_drop_walkout/migration.sql:34` | The partial unique index was dropped by a table rebuild and again on this branch; both P2002 catches are dead | §11 #6 |
| Closing the admin window kills the LAN server | `main/index.ts:410` | No tray, no close guard; one tap takes every waiter offline | New |
| `isAvailable` never enforced server-side | `order.service.ts:233` | `Errors.ItemUnavailable` has zero throw sites; the "tugadi" toggle is advisory | §11 #5 |
| `/api/finance/daily` ships the owner ledger to ADMIN | `finance.service.ts:288` | `pnl.profit`, `pnl.cogs`, per-dish margin on the wire | §11 #7 |
| `order:canceled` reaches no waiter client | `useSocket.ts` (order, mobile) | Stale ticket until the 10 s poll | §11 #9 |

## Verification and build health

Treat this as its own finding: **there is no gate.** `.github/workflows/build-windows.yml` runs
install → `package:win` → attach the `.exe` to a public Release on a `v*` tag, with no typecheck, no
lint, no smoke, and no rebuild of `receipt.exe`. `electron-vite` uses esbuild, which never
typechecks. Root `pnpm typecheck` cannot be that gate while `tsc -b` sits at 49 errors in `src/main`
(none hides a runtime bug — they are noise a real error would hide in), and `pnpm -r` bails on
master before reaching `apps/order` and `apps/mobile`. Root `pnpm lint` is three `echo`s that exit
0 — do not wire it in as a substitute.

Of ten smoke scripts, three have teeth (`smoke-e2e-flow`, `smoke-stock-count`,
`smoke-prd13-boundary`). Four pass on an empty database, `smoke-prd13-monthly-perf` has no
assertions at all, `smoke-telegram-files` verifies an inline copy of the Excel export rather than the
export, and `smoke-prd13-clock-isolation`'s "structural guarantee" is a comment that executes
nothing. `smoke-finance-pnl.ts:106` mass-cancels every open order with a raw `updateMany`, skipping
stock restore and the audit log, so a green run poisons the baseline the next run asserts against.
`smoke-cashflow-reversal.ts:59` still does five unfiltered `deleteMany({})`, and `apps/master/.env`
plus the Docker bind mount both point it at `dev.db` by default.

Two coverage holes matter for money: the blocking print inside the confirm transaction is stubbed on
Linux (`print.service.ts:45`), so the rollback rule has **no verification path on any machine in
this project**; and `/api/discounts`, `/api/settings`, `/api/audit`, `/api/printers`,
`/api/expense-categories` and `/api/me` have zero script coverage.

One worry closed: `pnpm.overrides` is **not** a risk. `pnpm-lock.yaml:7-11` carries the overrides
block and the only react/react-dom entries are 19.1.0. A `--frozen-lockfile` install cannot produce
two Reacts.

## What is sound

- **Bill arithmetic.** FOOD-only subtotal, SERVICE-derived xizmat haqi,
  `total = (subtotal − discount) + serviceCharge`, service never discounted and surviving a 100%
  comp. Every discount path clamps so the total cannot go negative. The payment check is a strict
  integer `!==` with no tolerance.
- **Stock primitives.** `decrementStockAtomic` is a genuine conditional `updateMany` — oversell is
  impossible, and SQL `NULL >= n` makes "sanoq kiritilmagan" fail the guard with no extra branch.
  Consume/restore are symmetric on every path except through the transaction races above.
- **Money storage.** Every UZS value lands with SQLite integer affinity; aggregates accumulate in
  `Prisma.Decimal` and stringify only at the DTO boundary.
- **Time.** `lib/time.ts` anchors at literal `+05:00`, returns half-open windows, derives day keys
  through `Intl` in Asia/Tashkent, and every call site goes through it. `closedAt`, `sentAt`,
  `canceledAt` and `occurredAt` are server-stamped — a waiter's phone clock cannot move a sale into
  another day.
- **The cash-drawer rule.** `cashOut = gross − sameDayReversal` is computed once and read by the
  ledger, the admin drawer, the owner report, the PDF and the digest. No cash surface uses
  `expenseNet`. Daily, monthly and range builders agree on netSales, COGS and operating expense.
- **Migrations and schema.** All 17 replay cleanly (`integrity_check` ok, `foreign_key_check`
  clean); declared indexes match the migrated database with zero drift except the one partial index
  Prisma cannot express; the CRLF-normalising checksum genuinely fixed the v0.1.0 brick; the dead
  ingredient/recipe/FIFO models have no live code path and cannot block a write.
- **Auth primitives.** bcrypt 10 rounds, 32-byte random tokens, single-device eviction, trivial-PIN
  blacklist, session re-read from the database per request so a role change or deactivation takes
  effect immediately. `F-5` genuinely fixed. Socket rooms derive from the server-side session. CORS
  on 0.0.0.0 is not a real risk here — tokens live in a header, not a cookie.
- **Route/role matrix.** All 17 routers walked: no route lets a lower role reach a handler it should
  not. Every controller runs a Zod parse, and `z.object()` stripping means there is no
  mass-assignment path.
- **Deferred socket emits.** The AsyncLocalStorage bag flushes only after the transaction resolves —
  nothing can emit on a rolled-back write.
- **Blocks C1.** Across all 15 screens at 1366×768: no sub-floor touch targets, no sub-12px text,
  hover gone from page code, money pinned at 17px `tabular-nums`. The Panel-foot rule is structural.
  It is finding 7 (window geometry), not the design system, that defeats it.
- **Build variants.** No path in a packaged build puts `production` and `next` on one *database*.
  `production` never calls `app.setName()`, so an upgrade cannot lose the existing file. The
  `installer.nsh` wipe prompt is confirmed dead code. (Finding 1 is the *server* they share, not the
  database path.)
- **Mobile invariants.** All three still hold verbatim.

## Remediation order

**Before merging this branch** — branch regressions and one-line stops on money paths.

1. **`next` variant renderer port** (`api/client.ts:4`, `socket-client.ts:21`). Add a `define` to
   the renderer block of `electron.vite.config.ts` and read it in both files. Until then,
   `package:win:next` is unsafe beside a live till — say so in `CLAUDE.md`. — *an hour*
2. **Nasiya leg prefill** (`OrderTicket.tsx:114,166`). Move the amount off the existing legs rather
   than inventing a zero, add a remove action, and reject `amount <= 0` in `submit()`. — *an hour*
3. **Reject non-positive payment legs and >1 DEBT leg server-side** (`orders.controller.ts:52`,
   `order.service.ts:672`). — *one line each*
4. **Window geometry** (`main/index.ts:191`). `maximize()` or explicit 1366×768 bounds, plus
   `Menu.setApplicationMenu(null)`. Everything the design system promises depends on it. — *one line*
5. **Nav rail overflow** (`NavRail.tsx:75`). `min-h-0` plus a scroll wrapper, or render "Boshqa" as
   a sheet that replaces the primary list. — *an hour*
6. **Confirm ticket discount base** (`OrderTicket.tsx:112`). Derive food and service from
   `order.lines` the way `OrderPanel.tsx:88` already does. Fix `gallery/fixtures/orders.ts:76` to
   leave snapshots null on SENT so the preview stops masking this class of bug. — *an hour*

**First week after merge** — 7 and 8 make 9 verifiable.

7. **Draft cleanup** (`scheduler.ts:10`). Replace the delete with the existing cancel path: CANCELED
   + reason, `maybeRestoreLineStock` per line, audit row, one transaction. Never hard-delete an
   order that has touched inventory. — *an hour*
8. **Backup + atomic upgrade** (`sqlite-bootstrap.ts:117`). Daily `VACUUM INTO` with 30-day
   rotation, one before every migration run, `PRAGMA integrity_check` at boot, and write via
   `.tmp` + fsync + rename. Nothing else here is safe to attempt without it. — *a day*
9. **Compare-and-swap the state machine** (`order.repo.ts:204,214`; `order.service.ts:216,366,591`).
   CAS both terminal writes, turn the dead `if (!updated) throw` sites live, and move every status
   and line read inside its transaction. — *a day*
10. **PIN login** (`auth.service.ts:103`, `user.repo.ts:19`). Move `ensureNotLocked` inside the match
    branch, charge failures per-IP, and add an admin unlock — today nothing can clear it. — *an hour*
11. **Credentials and roles.** Random seed password shown once at first run, stop writing it to
    `startup.log`, reject `input.role` unless the actor is OWNER, reject self-role edits, audit
    `USER_ROLE_CHANGED`. — *a day*
12. **Print out of the transaction** (`order.service.ts:725`). Commit the financial state, then
    print, with a durable `PrintJob` on the base client. If the rollback semantics must stay, at
    minimum cap the queue wait below the transaction budget, set `busy_timeout` and WAL, and map
    P2024/P2028/P2034 to an Uzbek `AppError`. — *a day*
13. **ZodError branch** (`errorHandler.ts:12`) plus a `code → Uzbek` map in `api/client.ts`, and a
    `MutationCache` `onError` so no mutation can fail silently again. — *an hour*

**Next** — real money, slower burning.

14. **Book stock loss.** Write an Expense on a downward `setCount`, and stop
    `setCostFromPaid: false` from producing a purchase in neither opex nor COGS. — *a day*
15. **Restore the one-active-order-per-table index** in a new migration, add a `findFirst`
    precondition in `createDraft` and in `transfer`, and note in `schema.prisma` that the index is
    not Prisma-managed. — *an hour*
16. **Correction paths for cash-in.** Reverse/void for repayments and returns; key expense reversal
    on `createdAt` rather than `occurredAt`. — *a day*
17. **Telegram honesty.** Make `sendMessage` throw or return a boolean; write
    `daily_report_last_sent_date` and `REPORT_SENT` only on confirmed delivery; walk forward from the
    last sent day. Retry `bot.start()`. — *a day*
18. **CI gate.** Add `typecheck:renderer` and `typecheck:gallery` before `package:win` (both exit 0
    today), plus a tag-vs-version check. Then clear the 49 `src/main` errors — 32 are the same
    `req.params.id` shape and fall to one typed helper. **Before that, repoint
    `tsconfig.main.json`'s `outDir`**: it collides with electron-vite's `out/main`, which
    `build.files` packages, so the first green `tsc -b` would ship two copies of the main process.
    — *a week, in pieces*
19. **Make the smokes honest.** Guard `smoke-cashflow-reversal.ts` on a `smoke-*.db` URL, scope
    `smoke-finance-pnl`'s cleanup to its own orders, fail the zero-day smokes on empty data, delete
    `simulate-full-flow.sh`, and make the print executor injectable so one script can prove a failed
    print leaves the order SENT. — *a day*

**Can wait:** icon-only report toolbar buttons, the dialog close target and missing `max-h`, the
PDF's server-local date helpers (only bites on a non-Tashkent host), the unbounded debt query in
`daily()`, the `waiveServiceCharge` stale comment, CLOSED-tab pagination.

---

## What this review did not do

- **Nothing was run against a live server.** Docker was down. Every finding is static analysis, the
  same limit `AUDIT_FINDINGS.md` §7 declares. Findings 4, 9 and 11 are concurrency and timing claims
  that deserve a live reproduction before the fix is designed.
- **No hardware.** No Windows machine, no printer, no 1366×768 panel. Finding 7 is arithmetic from
  the source, not an observation.
- **No load testing.** Behaviour at 500 orders/day is still unknown.
