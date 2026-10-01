# Chayxana POS — Current workflow (live state)

**Snapshot:** 2026-08-18, branch `fix/customer-feedback` (off `feat/remove-walkout`), clean tree.
**Updated 2026-10-01** for PRD 14, built on `fix/server-money-guards`: §2, §4–§6 and §8–§13, and
one renumbered cross-reference in §7. Line numbers in those sections point at that branch.
**Method:** every claim below was read from source, not from other docs. Where this file
disagrees with `docs/agent-plans/00-shared/decisions.md`, **this file is right** — see §12.
**Update when:** any behaviour here changes. Code is the truth; if you change code, change this.

Start here if you are new. Read §2 (the money path) and §12 (what to distrust) before touching anything.

---

## 1. What the system is

One Uzbek chayxana, single location, LAN-only, no cloud.

A single Windows machine runs `apps/master`: an Electron app whose **main process hosts the
Express + Socket.io server** on `:4000`, and whose renderer is the admin UI. Two thin waiter
clients talk to it over REST + WebSocket:

| App | Stack | Who uses it |
|---|---|---|
| `apps/master` | Electron + React 19 + Vite + Tailwind | OWNER / ADMIN — approval, payment, menu, inventory, finance |
| `apps/order` | Electron + React 19 | WAITER on a desktop/touchscreen monoblok |
| `apps/mobile` | Expo RN 0.81 / React 19 | WAITER on Android phones |

There is **no kitchen app** and no kitchen printer. The admin at the master machine is the single
point of order approval and payment. All user-facing strings are Uzbek. DB is **SQLite** via Prisma.

---

## 2. The money path (the one flow that matters)

```
WAITER (mobile or order app)
  PIN login → tables list → POST /api/orders                    → DRAFT
  taps items → POST /api/orders/:id/items                       → ★ STOCK LEAVES HERE
  taps "Yuborish" → POST /api/orders/:id/send                   → SENT
ADMIN (master admin UI)
  "Tasdiqlash" queue → OrderTicket → POST /api/orders/:id/confirm → CLOSED
```

★ **The most counter-intuitive fact in the codebase: stock and COGS move at line-add time, not at
any status transition.** Adding a line decrements the item's `stockCount` atomically and books
`costPrice × qty` into `cogsSnapshot`. `send`/`confirm` still touch no inventory
(`order.service.ts`: `send` `:507`, `confirm` `:737`).

### Order state machine (enforced server-side, `order.service.ts`)

```
DRAFT ──send──► SENT ──confirm──► CLOSED        (terminal)
  │               │
  └──cancel───────┴──cancel───────► CANCELED     (terminal)
```

There is no `WALKOUT` (removed 2026-08-14 — see §11 and §13); an unpaid order closes as **nasiya**,
with the admin picking the debtor on the confirm ticket (§2 "Closing an unpaid order"), or as a
full discount. No
`BILL_REQUESTED`, no `PENDING_PAYMENT`, no `KitchenTicket`. Nothing leaves a terminal state. Line
mutations (add / adjust / remove / note / transfer) are legal in **both** DRAFT and SENT.

| Transition | Function | Repo write | Guard |
|---|---|---|---|
| ∅ → DRAFT | `createDraft` `:181` | `orderRepo.create` | DINE_IN needs `tableId`; TAKEAWAY forbids it |
| DRAFT → SENT | `send` `:507` | `setSent` — **CAS** | waiter owns it; ≥1 non-canceled line |
| SENT → CLOSED | `confirm` `:737` | `closeIfSent` — **CAS**, the transaction's first write | status===SENT; payments sum exactly (a failed print does not block it) |
| DRAFT\|SENT → CANCELED | `cancelOrder` `:606` | `cancelIfIn` — **CAS**, from the status it checked | waiter owns it, or ADMIN/OWNER |
| DRAFT → CANCELED (automatic) | `cancelStaleDraft` `:688` | `cancelIfIn` — **CAS**, from DRAFT | the scheduler: a draft unsent for 12 hours (§9) |

Every transition claims the order with one conditional `updateMany` — the status is in the
`WHERE`, and the count must be 1 — so two writers racing for one order get one winner: the loser
writes nothing and answers 409 (PRD 14 G1). Line edits do not claim the order; see §11 #1.

### Confirm, step by step (`order.service.ts:737-893`)

Before the transaction: re-read the order → reject unless SENT (a fast path; the claim below
decides) → refuse more than one DEBT leg, and a DEBT leg of 0 → require debt metadata if a DEBT
leg exists → `billingService.computeTotals` → require `Σpayments === total` **exactly**. Every leg
is a whole so'm ≥ 0 (`somAmountOrZero`, PRD 14 G3); a body that fails its schema answers 400
`VALIDATION`.

Inside one `$transaction` (timeout 30 s, `maxWait` 10 s): **claim the order** with a conditional
SENT→CLOSED update — a second confirm or a racing cancel finds it no longer SENT, writes nothing
and answers 409 → stamp approval → write the four snapshot columns → insert `Payment` rows →
create `Debt` if a DEBT leg exists → write `ORDER_CONFIRMED` audit.

After the commit, in this order: flush the deferred socket emits (`order:closed`) → **print the
bill** → fire the Telegram owner alerts. The response waits for each alert, up to 5 s apiece
(`alertService.send`; a slower send finishes in the background, its error caught), so they go
last: a slow Telegram must hold neither the other screens nor the customer's slip. A transaction
that throws emits, prints and alerts nothing.

**A printer failure no longer undoes the sale** (PRD 14 G6). The bill stays CLOSED with its
payments, and the response carries `billPrinted: false` and the error. With a printer chosen, a
failed print leaves its own `PrintJob` row marked FAILED; with none chosen the print stops before
any row exists ("Admin printer not configured"). The Tasdiqlash screen shows "Chek chiqmadi"
(Uzbek text from `renderer/lib/confirm-result.ts`, never the server's English error), starting
with the bill's name — its table, or `Olib ketish #ABC123` without one — because several notices
stack when the printer is out of paper. The notice stays until the admin closes it ("Yopish") or
reprints ("Qayta chop etish", `POST /api/orders/:id/reprint-bill`, ADMIN/OWNER, CLOSED orders
only); a reprint that fails shows the notice again. Every toast of the confirm loop sits
bottom-centre (`ApprovalQueuePage.tsx`): the Toaster's bottom-right corner is the next bill's
TASDIQLASH, enabled in the same render that raises the last bill's toast.

### Bill math (`billing.service.ts:54-130`)

```
subtotal      = Σ(qty × unitPriceSnapshot)  WHERE menuItem.kind = FOOD    ← service excluded
discount      = ad-hoc so'm amount (cap BYPASSED)   |  preset Discount FK (cap enforced)
netFood       = subtotal − discount
serviceCharge = Σ(qty × unitPriceSnapshot)  WHERE menuItem.kind = SERVICE
total         = netFood + serviceCharge
```

**Service charge is not a setting.** It is `MenuItem` rows with `kind = SERVICE` that the waiter
adds like any other item, quantity typically = number of customers. It is waiter income, excluded
from revenue and profit, and never discounted. `Order.serviceChargeSnapshot` /
`serviceChargeWaived` survive for historical rows; `serviceChargeWaived` still zeroes the charge
at confirm time but is otherwise vestigial.

**A discount is always a whole so'm amount.** `Discount.type` and the `DiscountType` enum were
dropped on 2026-08-18 (migration `20260818100000_drop_percent_discount`) — the chayxana only ever
takes a sum off a bill, so the PERCENT/FIXED discriminator was a choice the operator could get
wrong for no gain. Presets that WERE percents are deactivated, not converted: their `value` is a
percentage and there is no order-independent conversion. `max_discount_percent` went with it;
`max_discount_amount` remains and still applies to presets.

⚠ **The confirm ticket does not use presets at all.** It sends `discountAmount`, a hand-typed so'm
figure, and `discountId` has no caller in the renderer. So `Chegirmalar` is currently a list nothing
reads — the open question is whether presets should reach the ticket or the page should go.

Payments: `CASH | CARD | DEBT`, mixed allowed, must sum exactly. At most one `DEBT` leg per bill,
never of 0, and every leg a whole so'm ≥ 0 (PRD 14 G3; `lib/money-input.ts`). **There is no AVANS
payment method** — avans is a repayable `Expense` on the outflow side, unrelated to this path.

### Closing an unpaid order (`OrderTicket.tsx`)

Adding a `DEBT` leg opens the **debtor picker** in the panel's middle, in the slot the keypad uses.
It lists everyone already in the debt ledger — `GET /api/debts`, folded to one row per trimmed
`debtorName`, outstanding summed, most recently seen first — so the usual case is one tap and no
typing. `+ Yangi qarzdor` swaps to a plain 48px text field for someone new. Picking a known debtor
carries their `debtorPhone` into the confirm body for free; a typed name sends none. The ticket
sends one Nasiya leg and drops one still at 0 (`toPayments`, `renderer/lib/payment-legs.ts`); the
server answers 400 to a second leg or a leg of 0.

`needsDebtor` (`:124`) keeps TASDIQLASH (`:227`) disabled until a name is set, so a nasiya can
never close anonymously. The service charge is **not** waived on this path — the whole `due`,
waiter's pay included, goes onto the debt, which is what `serviceChargeSnapshot` being the waiter's
earnings requires. A 100% food discount likewise still leaves the service charge owed; that is
correct, not a bug, and nasiya is what settles the remainder.

---

## 3. Roles

| Role | Surface | Can do |
|---|---|---|
| **OWNER** | master admin UI + Telegram | Everything. Only role that can reach `/api/reports/*`. Receives daily Telegram summary. |
| **ADMIN** | master admin UI | Menu/tables/users/stock (Ombor)/discounts CRUD, confirm+pay, cancel, expenses, debts, audit read. Per `decisions.md` must NOT see profit — but see §11 defect #7. |
| **WAITER** | mobile or order app | PIN login, create/edit/send orders, transfer own orders, cancel own orders. |

Role gating is server-side via `requireRole` on every router. The admin UI's 17 React routes are
**not** individually role-gated — only the sidebar filters by role (`Sidebar.tsx:144`). URL-hash
navigation to a hidden page renders it, but the API behind it returns 403. Server is the real gate.

---

## 4. Count-based inventory

Refactored 2026-08-13 on `feat/count-based-inventory`, replacing the ingredient/recipe/FIFO model
outright — no ingredients, no recipes, no batches, no unit conversions. Every `MenuItem` carries a
count; a sale subtracts from it; margin is `price − costPrice`. Design doc:
`docs/superpowers/specs/2026-08-13-count-based-inventory-design.md`.

### Three modes, one item

`mode` (`SERVICE` / `COUNTED` / `UNCOUNTED`) is a create-time request field (`menu.service.ts`
`CreateItemMode`) that writes `kind` + `counted` — both **persisted and editable later** via
`PATCH /api/menu/items/:id`, unlike the old create-time-only discriminator. Toggling `counted`
resets `stockCount` to `NULL` in either direction (`menu.service.ts:197-202`) — items are no
longer locked to their creation mode.

| Mode | `kind` | `counted` | Behaviour |
|---|---|---|---|
| `SERVICE` | SERVICE | ignored | never counted, never costed, excluded from subtotal |
| `COUNTED` | FOOD | `true` | `stockCount` gates availability; optional `costPrice` |
| `UNCOUNTED` | FOOD | `false` | never runs out (choy); optional `costPrice` still books real COGS |

### `stockCount` / `costPrice` — independent

- `stockCount` `NULL` = "sanoq kiritilmagan" (never counted) — **blocks the sale exactly like 0**.
  SQL `NULL >= n` is not-true, so the atomic decrement guard rejects it for free
  (`menuRepo.decrementStockAtomic`, `menu.repo.ts:117-122`).
- `costPrice` `NULL` → the sale still goes through, books **0 COGS**, admin UI shows "tan narxi
  kiritilmagan". An uncounted item with a cost books real COGS — fixes the old UNTRACKED "100%
  margin" bug (audit `M-64`).
- Counts are whole numbers. Combos decrement each component's own count by its component quantity
  (`order.service.ts:351-355`).

### Sale and restore (`stock.service.ts`, same two entry points `order.service.ts` calls)

`consume(line, portions, tx)`: `kind = SERVICE` → no-op. `counted = true` → one atomic conditional
`updateMany` guarded by `stockCount >= portions`; no row matched → `Errors.OutOfStock`, the line
transaction rolls back (`counted = false` skips straight past this). Then
`cogsSnapshot += costPrice × portions` (0 when `costPrice` is NULL). Crossing to 0 emits
`menu:itemAvailability` to `all` (§7) and fires the owner Telegram stock-out alert
(`alertService.itemStockOut`).

`restore(line, portions, tx)` fires on quantity decrease, line cancel, and order cancel from
**both** `DRAFT` and `SENT` — `maybeRestoreLineStock` still never reads order status
(`order.service.ts:134-147`, deliberate, commit `000e540`) — and on the automatic cancel of a stale
draft. Every cancellation restores; there is no path left that consumes without restoring, now that
`WALKOUT` is gone (§11, §13) and the draft cleanup cancels instead of deleting (§9).
`cancelOrder` and `cancelStaleDraft` claim the order first and restore from the lines they re-read
inside the transaction after the claim, so a line added or cancelled since their first read is
neither missed nor restored twice.
Unconditional atomic increment, guarded to non-NULL counts only (a line restored after `counted`
was toggled off-then-on just leaves the item awaiting its first count). `cogsSnapshot` is
recomputed **proportionally** — `new = old × remainingQty / quantity` — instead of unwinding a
peel ledger; this preserves the frozen at-add-time cost even if `costPrice` changed since. A line
already marked `isCanceled` keeps its snapshot (already excluded from every report).

### The two admin verbs — `POST /api/stock/*` (ADMIN+OWNER, `stock.routes.ts`)

- **Keldi** (`restock`) `{ qty, paidUzs?, setCostFromPaid?, note? }` — `stockCount += qty`.
  Optional `paidUzs` creates an excluded `Mahsulot xaridi` `Expense` (reason `Keldi: {name}`)
  linked via `StockEntry.expenseId`, deriving `unitCost = paidUzs ÷ qty`; `setCostFromPaid` also
  writes `costPrice = unitCost`.
- **Sanoq** (`count`) `{ countedQty, note? }` — sets `stockCount` **absolutely**, not additive.
  The only stock correction mechanism.

Both write an append-only `StockEntry` (`RESTOCK`/`COUNT`, before/after) + `AuditLog`
(`STOCK_RESTOCKED`/`STOCK_COUNT_SET`) — that pair is the whole detective control on count edits.
Sales are **not** journaled in `StockEntry`; they're reconstructible from `OrderLine`s. A
menu-create with an initial count journals one `StockEntry(COUNT)` with `countBefore` NULL.

**Sanoq and open orders:** `count` overwrites the count and allows nothing for portions held by
open orders, so a cancel after a Sanoq — by hand, or the automatic stale-draft cancel — adds those
portions back and the count reads high until the next Sanoq. An open product question (STATE.md).

**Corrections:** a wrong count → another Sanoq (overwrites). A wrong restock's *money* → the
ordinary same-day `Expense` reverse (`expense.service.ts:405+`) — unwinds cash/expense only, does
**not** touch `stockCount`; a wrong *quantity* needs its own Sanoq. §5's
`dailyLedger.outflow.ingredientPurchases` sources these from `StockEntry` now — same formula,
different query.

### Availability

`effectivelyAvailable = isAvailable && (kind === SERVICE || !counted || (stockCount ?? 0) > 0)`
(`menu.service.ts:55-72`). `NULL` count is unavailable, same as 0. Waiter DTO field names are
unchanged from before the refactor.

### Ombor (`/ombor`, ADMIN+OWNER) replaces Ingredients/Purchases/Recipes

One list of counted `FOOD` items — count ("—" at NULL, red badge at 0), tan narx or
"kiritilmagan", last entry date — with **+ Keldi** / **Sanoq** row actions and a per-item entry
history drawer.

### What's still in the schema but dead

`Ingredient`, `Recipe`, `RecipeIngredient`, `RecipeEdit`, `Purchase`, `OrderLineBatchConsumption`,
`WasteEvent`, `Stocktake`, `StocktakeEntry`, `IngredientMovement` are still **declared** in
`schema.prisma`, and their DB tables and historical rows are untouched — but every service and
repo that read or wrote them is deleted (§11's dead-code note). This is deliberate: dropping the
tables needs a backup mechanism that doesn't exist yet. There is no live code path onto them —
don't add one; inventory history predating 2026-08-13 is frozen in these tables, unqueried.

---

## 5. Finance vocabulary

Canonical formulas live in `reports.service.ts → dailyLedger` (13 parallel queries, all half-open
`Asia/Tashkent` windows, hardcoded timezone). Read those fields; do not recompute.

```
netSales       = Σ subtotalSnapshot − Σ discountAmountSnapshot        (CLOSED orders, by closedAt)
cogs           = Σ OrderLine.cogsSnapshot                             (CLOSED orders only)
operating      = expenses EXCLUDING seed-cat-ingredients              (already counted via COGS)
profit         = netSales − cogs − operating
realCashIn     = orderCash + orderCard + debtRepaidCash + debtRepaidCard + expenseReturns
cashOut        = expenseGross − sameDayReversal                       ← NOT expenseNet
drawerMovement = realCashIn − cashOut
```

**The cash-drawer rule.** Always use `cashOut` (same-day-reversal aware), never `expenseNet`.
A prior-day purchase deleted today writes a REVERSAL stamped today, but its cash left the drawer
on an earlier day; subtracting it from today inflates the drawer. `sameDayReversal` only counts
REVERSALs whose original falls in the same window. This was a real production bug — see
`docs/MOLIYA_KASSA_HISOBLASH_XATOSI.md`.

P&L and cash flow are **separate** and were correct — don't "fix" one using the other.

Expenses: `ACTIVE → REVERSED` plus a mirror `REVERSAL` row. Repayable expenses (avans, zalog) sit
in `pendingRepayable` until returned or written off. Debts are created only from a CLOSED order
with a DEBT payment leg (one per bill); repayments are append-only and belong to the day received.

**Debt repayment and write-off** (PRD 14 G2, `debt.service.ts`, `debt.repo.ts`). A repayment is one
conditional decrement of `remainingAmount` (`applyRepayment`, the transaction's first write), so two
at the same moment both count and together can never overpay; the loser answers 409
`DEBT_NOT_OPEN` or 400 `DEBT_OVERPAY`. Every debt but a PAID one stays repayable, **a written-off
one included** (money rules D14). A write-off re-reads the debt inside its transaction, refuses
unless it is OPEN or PARTIAL, records the balance it finds there and claims the status
conditionally (`writeOffIfOpen`); the loser of two simultaneous write-offs answers
`DEBT_ALREADY_WRITTEN_OFF`.

Reports are OWNER-only (`/api/reports/*`). `/api/finance/daily` is the ADMIN-safe daily view — but
see §11 defect #7.

---

## 6. API surface

69 endpoints across 17 routers (`server/app.ts`). Middleware order: `cors()` (open) →
`cookieParser` → `express.json({limit:'1mb'})` → routers → `errorHandler`.

| Mount | Auth | Roles |
|---|---|---|
| `/api/health` | **none** | — (`/` and `/server-info`, used for LAN discovery) |
| `/api/auth` | mixed | `login`, `login-pin` (IP-limited), `logout`, `me` |
| `/api/menu` | yes | reads **all roles**, writes ADMIN+OWNER |
| `/api/orders` | yes | see table in §2; `confirm` / `reprint-bill` ADMIN+OWNER |
| `/api/tables`, `/api/me` | yes | reads all roles |
| `/api/reports` | yes | **OWNER only** |
| `/api/finance`, `/api/audit` | yes | ADMIN + OWNER |
| `/api/expenses`, `/expense-categories`, `/debts`, `/stock`, `/discounts`, `/settings`, `/printers`, `/users` | yes | ADMIN + OWNER |

Errors: throw `AppError` / `Errors.*` from `lib/errors.ts` (20 codes). The central handler maps it
to `{ error: { code, message, details } }`. A `ZodError` — a body that fails its schema — answers
400 `VALIDATION` with the issues in `details` (PRD 14 G3); anything else that is not an `AppError`
answers 500 `INTERNAL`.

---

## 7. Real-time

Socket.io on the same HTTP server. Handshake auth is `auth: { token }` validated against `Session`.

**Rooms joined:** `admin` (OWNER/ADMIN), `waiter:{userId}` (WAITER), and `all` (every authenticated
socket, unconditionally) — `socket.ts:51-53`.

Emits are deferred through `AsyncLocalStorage` and flushed only after the transaction commits
(`lib/socket-events.ts`), so a rolled-back transaction never emits. Payloads are minimal IDs;
clients re-fetch via REST and invalidate TanStack Query keys.

| Event | Room | Reaches a client? |
|---|---|---|
| `order:updated` | admin, waiter | ✅ master + order app (**mobile does not subscribe**) |
| `order:closed` / `order:transferred` | admin, waiter | ✅ all three |
| `order:canceled` | admin, waiter | ❌ **no listener anywhere** |
| `stock:changed` | admin | ✅ master only — Ombor/menu cache invalidation |
| `menu:changed`, `menu:itemAvailability` | `'all'` (every authenticated socket) | ✅ all three — `socket.join('all')` shipped (`socket.ts:53`), the room now actually reaches clients |
| `auth:kicked` | direct | ✅ all three force-logout |

`ingredient:stockChanged` is no longer emitted anywhere server-side (the room-nobody-joined defect
it used to illustrate is fixed by `join('all')` above); `order`/`mobile` still register a handler
for it, which is harmless dead code. See §11 defect #8 — `order:canceled` is what's still dead.

---

## 8. Auth

- OWNER/ADMIN: username + password. WAITER: 4-digit PIN. Both bcryptjs.
- Tokens: 32-byte `crypto.randomBytes(...).base64url`, stored in `Session`, sent as `Bearer`.
- **Single device per user** — a new login deletes the user's existing sessions.
- Every authenticated request touches its session's `lastUsedAt` without waiting for it, **at most
  once a minute** (`sessionRepo.touchLastUsed`, a conditional `updateMany`): on the one connection
  each write's disk sync holds up the reads behind it. Nothing reads `lastUsedAt`; expiry is
  `expiresAt`, fixed at login (8 h for a password, 30 days for a PIN).
- **Password login:** 5 failed logins → the account is locked 5 minutes (`Errors.Locked`, HTTP 423;
  `User.failedLogins` / `lockedUntil`).
- **PIN login locks the device, not the floor** (PRD 14 G5; `auth.service.ts` `loginPin`,
  `lib/pin-lockout.ts`). The PIN is compared first, and only the matched waiter's own lock applies
  to them. A PIN that matches nobody counts against the device — its client address, since the
  server binds `0.0.0.0` and sets no `trust proxy` — and 5 misses lock that device for 5 minutes
  (423 `LOCKED`, `details.until`). The counter is in memory: a restart of the master clears every
  lock, and a successful login clears that device's misses. A device runs **one PIN attempt at a
  time**; an overlapping one answers 409 "Oldingi urinish hali tugamadi, biroz kuting", so parallel
  guesses cannot all pass the lock check before the first miss is counted.
- `POST /api/auth/login-pin` is also IP-rate-limited (`ipRateLimit` in `auth.routes.ts`: 30
  requests per address per minute); `POST /api/auth/login` is **not** (mitigated by account
  lockout). The limiter returns HTTP **409**, not 429, and its in-memory map never evicts.
- ⚠ Reset-on-success is a hole (§11 #6): anyone holding one valid PIN can guess 4 times, log in
  with their own PIN, and repeat without the device ever locking — with the 30-per-minute limit,
  24 guesses evaluated and 6 logins of its own per minute. If a reverse proxy or a `::` bind is
  ever added, set `trust proxy` deliberately, or every client shares one key and a floor-wide lock
  returns. A shared terminal locks for everyone at it (PRD 14 §6.2).

---

## 9. Runtime

**Cold start** (`main/index.ts:239-262`): single-instance lock → SQLite bootstrap → data migrations
→ load settings → start Telegram bot (non-blocking) → `httpServer.listen(4000, '0.0.0.0')` →
mDNS advertise → **then** open the BrowserWindow. The API serves before the UI exists, which is
correct for a machine waiters depend on. Heavy startup logging lands in `userData/`.

Packaged Windows applies migrations **in-process via sql.js** with its own `_app_migrations` ledger
(checksum self-heals on drift); dev uses the Prisma CLI against `dev.db`.

**One SQLite connection** (PRD 14 G7). `lib/prisma.ts` opens the `PrismaClient` through
`lib/sqlite-url.ts`, which sets `connection_limit=1` on `DATABASE_URL`, and sets
`transactionOptions.maxWait` to 10 s: a `$transaction` now waits for that one connection, and
Prisma's default 2 s would turn the wait into a 500 (P2028). Measured 2026-09-30: with several
connections, the session touch that `requireAuth` fires without awaiting deadlocked against a
request's own transaction until Prisma's 5 s timeout (P1008), and 78 writes back to back failed.
The touch now has a `.catch`, so it can never become an unhandled rejection, and writes at most
once a minute per session (§8). Once, when it is created, the client logs
`[prisma] client created: one SQLite connection (…)` with the URL it uses; a packaged till writes
it to `<userData>/logs/runtime.log`. **Never call `getPrisma()` inside a `$transaction` callback —
use `tx`:** with one connection the query waits for the connection its own transaction holds, and
fails as P2028 "Transaction already closed" at the transaction's timeout (30 s for confirm).
⚠ A Windows profile path with a space fails at `$connect`: `toSqliteUrl` (`sqlite-bootstrap.ts:16`)
percent-encodes the path and Prisma does not decode it. Found while testing G7; it is the same on
the build the customer runs.

A bind failure on the port is now fatal-with-a-dialog rather than silent: `httpServer` gets an
`error` handler that rejects the startup promise, which `whenReady`'s catch turns into
`dialog.showErrorBox` (`index.ts`). Before 2026-08-15 the listen promise had a success callback
only, so a taken port left it pending forever — `createWindow()` unreachable, no window, no error.
That closes audit `C-3`.

**Build identity, and therefore the database path.** `app-identity.ts` decides what a build calls
itself. Electron derives `userData` from `app.getName()`, and the database is
`<userData>/data/master.sqlite` — so the app name *is* the database path. That name is
`@chayxana/master` (package.json `name`), **not** `build.productName`, which electron-builder reads
at package time and Electron never sees. The live DB is therefore
`%APPDATA%\@chayxana\master\data\master.sqlite`.

Two builds can be installed at once: `production` (untouched behaviour, port 4000) and `next`
(`pnpm package:win:next` — own app name, own userData, own appId, install directory, shortcut,
firewall rule, and port 4100). The variant is baked at build time by `electron.vite.config.ts`;
`production` does not call `app.setName()` at all, so that bundle is unchanged and an upgrade
cannot lose the existing database. See `CLAUDE.md` "Build variants".

⚠ Side effect of the above worth recording: `installer.nsh`'s database-wipe prompt tests
`$APPDATA\${PRODUCT_NAME}\data\master.sqlite` — `%APPDATA%\Chayxana Master\...` — which no build has
ever written to. **The prompt cannot fire.** Audit `C-2` is overstated on that basis; the offer to
delete the production database is dead code rather than a live hazard.

**Printing:** `printBill → PrintJob row → p-queue mutex (concurrency 1) → execFile receipt.exe`
(Win32 RAW ESC/POS, `cpp/receipt.cpp`). Only `BILL` and `BILL_REPRINT` types remain. On non-Windows
dev hosts `executeBinary` is a stub that logs and returns success — printing appears to work.
Confirm prints after its transaction commits, never inside one (PRD 14 G6): a slow or jammed
printer (15 s `execFile` timeout) delays only the confirm and reprint requests waiting for their
turn at it, and no other write.

**Telegram bot:** `/bugun /kecha /sana /oldin /hafta /oy /oylik /umumiy /excel /pdf /qarzlar
/xarajatlar /omborxona /ofitsiantlar /yordam`, plus five push alerts — large discount,
debt sale, debt write-off, large expense, item stock-out (`alertService.itemStockOut`, fired from
`stock.service.ts` when a counted item's `stockCount` crosses to 0 — see §4). A request that fires
an alert after its commit waits for it, at most 5 s per alert (`alertService.send`). The walkout
alert is gone with the rest of the status (§11, §13).

**Scheduler:** at start-up and every 6 hours, drafts created more than 12 hours ago are
**cancelled, not deleted**, oldest first (`runDraftCleanup` → `orderService.cancelStaleDraft`,
PRD 14 G4): the same conditional claim as a cancel, every live line restored, the reason
"Avtomatik bekor qilindi: 12 soat yuborilmadi", and an `ORDER_CANCELED` audit row with
`automatic: true` whose actor is the draft's own waiter (`AuditLog.userId` is required). One draft
that fails is logged and stays a draft for the next run; the rest go on. Cancelled drafts appear
wherever CANCELED orders do: Buyurtmalar's "Bekor qilingan" tab, the day report of the day they
are cancelled, the waiter's `ordersCanceled`, and the audit page. The finance report scheduler
polls **every 60 seconds** for the configured send time.

**Headless dev server for verification (Docker):** non-Windows dev hosts don't run Electron, so
`dev:master` can't provide the server that the HTTP-driven smoke scripts need (see `CLAUDE.md`
Commands). `scripts/serve-headless.ts` boots the same Express + Socket.io server
`main/index.ts`'s `startServer()` does, minus the Electron shell, Telegram bot, mDNS, scheduler,
and printer init. `compose.dev.yaml` runs it in a container on `:4000` — `docker compose -f
compose.dev.yaml up -d`, `... exec master-dev <cmd>` to run a smoke against it, `... down` after.

⚠ `scripts/smoke-cashflow-reversal.ts` does not need this harness and should not be run through
it against the shared `dev.db` — it talks to Prisma directly, not HTTP, and its cleanup step
deletes every row of five tables with no scoping. See §13.

**Mobile monorepo invariants** (all currently holding — verify before touching):
root `.npmrc` has `node-linker=hoisted` + `shamefully-hoist=true`; `apps/mobile/index.js` is the
entry named in `package.json` `main`; `metro.config.js` pins react / react-native / react-dom to
workspace-root copies. Two RN copies → invariant-violation crash. Use `npx expo start --tunnel`.

---

## 10. Where to look when something breaks

| Symptom | File |
|---|---|
| Stock didn't move on order | `services/stock.service.ts` (consume/restore), `order.service.ts:229-308` |
| Bill total looks wrong | `services/billing.service.ts:54-130` |
| Confirm rejected | `order.service.ts:755-786` (checks run before the transaction); a 409 means the bill was no longer SENT, at the fast-path check (`:756`) or at the claim (`:794`) |
| Keldi/Sanoq didn't update count or cost | `services/stock.service.ts` `restock`/`setCount` (`:140-289`), `stock.routes.ts` |
| Cash drawer disagrees | `reports.service.ts` `dailyLedger.cashflow.cashOut` — and read §5 |
| A canceled order didn't refresh another open screen | Expected — no listener, §11 defect #8 |
| Print didn't fire | `services/print.service.ts`; check `admin_printer_name` setting |
| A bill closed but no slip | The confirm answered `billPrinted: false`; `PrintJob` FAILED (no row if no printer is chosen); reprint from the ticket or `POST /api/orders/:id/reprint-bill` |
| 500 with P2028 or P1008, or a request that hangs | One SQLite connection (§9): a `getPrisma()` call inside a `$transaction` |
| A confirm or an added dish answers about 5 s late | Telegram is slow or unreachable: each owner alert the request fires waits up to 5 s (`services/alert.service.ts`) |
| A waiter gets 423 with the right PIN | Their phone's address is locked — `lib/pin-lockout.ts`, in memory; restart the master to clear it (§8) |
| Daily Telegram missing | `services/finance-report.service.ts` + `lib/scheduler.ts` |

---

## 11. Known defects (re-verified 2026-08-13 on `feat/count-based-inventory`, ranked; renumbered
2026-08-14 after walkout removal, again the same day when the final branch review added a defect at
the top, again 2026-08-15 when that defect was fixed and deleted, and again 2026-10-01 when PRD 14
fixed four — see §13)

**Money-affecting**

1. **Confirm computes totals outside the transaction it commits, and line edits do not claim the
   order.** Confirm reads the order and runs `computeTotals` (`order.service.ts:755-786`) before
   its transaction claims the bill (`:794`). A line edit that lands between them leaves a CLOSED
   bill whose snapshot total and payments miss the dish, while the receipt — printed from a read
   taken inside the transaction — lists it. `addLine`, `addCombo`, `updateLineQuantity` and
   `cancelLine` (`:229`, `:310`, `:367`, `:458`) also check the status before their own
   transaction, so an edit can land after the claim, on a bill that has just closed: its stock
   taken, its price in no total (PRD 14 §2; not tested). **Fix (slice 2):** claim line edits the
   way transitions are claimed, and have confirm compute totals and check payments from a re-read
   inside its transaction, after the claim (`computeTotals`' `discountRepo.findById` then needs
   `tx`).
2. **Ad-hoc discount bypasses the settings cap.** Only the preset-`discountId` path enforces
   `max_discount_amount`. A 100% discount is a valid request from any ADMIN. Since the confirm
   ticket only ever sends `discountAmount`, the cap is in practice enforced nowhere on the money
   path — it guards preset *creation*, not spending.
3. **A debt paid after its write-off shows differently on two screens.** A repayment on a
   written-off debt is accepted (§5, D14) and turns it PARTIAL or PAID with `writtenOffAt` still
   set. Qarzlar counts what is left of it (`debtRepo.sumOutstanding` sums OPEN and PARTIAL); the
   ledger (`buildDebtLedger`) treats any debt written off before the day's end as WRITTEN_OFF with
   nothing remaining, so Hisobot's Qarz qoldig'i says 0. `writtenOffAt` is also stamped before the
   write-off's transaction (`debt.service.ts:243`). **Fix (slice 2, D14):** define how a recovered
   written-off debt shows, and stamp `writtenOffAt` inside the transaction.

**Correctness / data integrity**

4. **`isAvailable` (the manual admin toggle) is never enforced server-side.** `order.service.ts`'s
   `addLine`/`addCombo` check only `isActive`; `Errors.ItemUnavailable` has zero throw sites — a
   waiter can add a line for an item an admin marked unavailable. This is distinct from stock
   exhaustion, which **is** enforced (`stockService.consume`'s CAS decrement throws `OutOfStock`
   at `stockCount` 0 or NULL — §4); `effectivelyAvailable` folds both into one client-facing flag,
   but only the stock half has a server-side guard behind it.
5. **"One active order per table" is unenforced.** Migration `20260607041034` rebuilt the `Order`
   table and recreated only the plain indexes — the partial unique index from migration 2 is gone.
   `createDraft` relies on a `P2002` that can no longer fire.
6. **The PIN lock resets on a successful login** (§8). A device that holds one valid PIN can
   guess 4 times, log in with it, and repeat without ever locking. **Fix, if Barkamol wants it:**
   keep misses across a success and let them expire some minutes after the last miss.

**Contract / UX**

7. **ADMIN can read owner-only profit.** `/api/finance/daily` is ADMIN+OWNER and returns
   `pnl.profit` (`finance.service.ts:292-296`); the comment above it says the renderer hides it.
   Client-side only — curl or devtools reads it off the wire. Violates `decisions.md`.
8. **`order:canceled` has no listener in any client.** The `join('all')` fix (§7) means
   `menu:changed`/`menu:itemAvailability` now reach every socket, and `ingredient:stockChanged`
   is simply gone (no longer emitted server-side — `order`/`mobile` still register a handler for
   it, harmless dead code, not a defect). `order:canceled` is what's left dead: no app
   subscribes, so canceling an order pushes no live refresh to other open screens.
9. **Customer receipts don't add up** on any order with a service charge — the item list prints
   SERVICE lines but the printed subtotal is FOOD-only, and there is no service-charge line
   (`printer/receipt-builder.ts:44,56-77`).
10. **Verified fixed 2026-08-14.** ~~A fully-comped order can never be closed~~ — the old citation
    (`ConfirmModal.tsx:131`, `canSubmit` requiring `previewTotal > 0`) no longer exists; that
    component was deleted by the C1 renderer rebuild. The live gate is `OrderTicket.tsx:122`,
    `balanced = paid === due`, which is satisfied at `paid = due = 0` — a fully-discounted order
    with no service line closes today. An order *with* a service line still owes the service
    charge after a 100% food discount, which is correct (it is the waiter's pay, §2); nasiya
    settles that remainder, and as of 2026-08-15 the debtor picker makes nasiya reachable.

11. **Menyu collapses the dish name to nothing.** The name column is the only flexible one; price,
    stock and status hold fixed widths, so at the real viewport the list reads "Smoke p… 30 000" —
    price survives, identity does not. Its header also breaks: the search field clips mid-
    placeholder, a button wraps to a second row, and the page title falls out of alignment.
    Reported from site; Task 5 of the active plan.
12. **Sozlamalar scrolls sideways.** The settings pane overflows its width by 29px against the one
    hard layout rule this product has, and the cost lands on the Yoqilgan/O'chirilgan toggles,
    whose labels are cut. The two-column grid needs to collapse. Also on that screen: the
    maximum-discount value renders unformatted as a bare `100000`, and the server address the
    operator asked to see is still absent (Task 8).
13. **No `+ Naqd` on the confirm ticket.** The tender row offers `+ Karta` and `+ Nasiya`; once the
    cash leg is removed it cannot be restored. Recorded as deferred item I4 in the Task 2 review.

**Not defects, but the reason the screens read as thin** — recorded here because they keep getting
rediscovered, and because they are a redesign rather than a patch:

- **The product has no data visualization at all.** No charting library, no SVG, no sparkline, no
  trend, no comparison against yesterday. Every figure is a number in a box, so `SAVDO 1 673 000`
  arrives with nothing to read it against.
- **A fixed ~400px detail rail sits beside a mostly-empty list column on seven screens**
  (Tasdiqlash, Buyurtmalar, Ombor, Stollar, Qarzlar, Chiqimlar, Menyu). On five of them that rail
  holds one centred sentence in an otherwise blank box, while the work — the bill being settled —
  is the thing being compressed.

**Dead code worth knowing:** `MenuItem.unitCostSnapshot` and `OrderLine.consumptionSnapshot` are
still declared and still never written or read (they pre-date the count model too);
`orderRepo.setStatus` has zero callers. `yieldService`, `stocktakeRepo`, `wasteEventRepo`,
`ingredientMovementRepo` and the rest of the old ingredient/FIFO layer are gone outright, not
merely dead — §4 lists what is still declared in the schema with no code path left onto it.

---

## 12. What to trust in the docs

| Doc | Verdict |
|---|---|
| **This file** | Current as of 2026-08-14, `feat/remove-walkout` (see header); the sections the header lists were updated 2026-10-01 for PRD 14. |
| `agent-plans/00-shared/decisions.md` | Labelled "locked" but **partly stale** — see below. Still authoritative on intent and on v1 scope exclusions. |
| `agent-plans/00-shared/conventions.md` | Current. Follow it. |
| `FINANCE_IMPLEMENTATION_SPEC.md`, `MOLIYA_KASSA_HISOBLASH_XATOSI.md` | Current and load-bearing for finance work. |
| `PROJECT_TECHNICAL_OVERVIEW.md`, `TECHNICAL_SPECIFICATION.md` | Partly historical — verify before relying. |
| `docs/prd/*` | Proposals, not implemented state — except PRD 14 (server money guards), implemented on `fix/server-money-guards`. |
| `docs/archive/*` | Historical only. |

**Specific claims in `decisions.md` that are now wrong:**

- ❌ "PostgreSQL 16" → it is **SQLite**.
- ❌ "Master at static `192.168.1.10`" → `192.168.1.50` per README/CLAUDE.
- ❌ "Service charge is a fixed UZS amount configurable in Settings" → it is `MenuItem.kind=SERVICE`
  lines; there is no such setting.
- ❌ "Cancelling from SENT does not restore stock" → it **does** (commit `000e540`, deliberate).
- ❌ "Bill prints (blocking); if the print fails, the whole transaction rolls back and the order
  stays at `SENT`" (Order lifecycle; Receipts and printer) and the Approval flow's "in this exact
  order" list (steps 1–4 inside the transaction, 8 print, 9 flip to `CLOSED`) → the checks run
  before the transaction, its first write is the SENT→CLOSED claim, and the bill prints after the
  commit; a failed print leaves the bill `CLOSED` with `billPrinted: false`, reprintable (§2,
  PRD 14 G1 and G6). `decisions.md` itself changes only on Barkamol's instruction.
- ❌ Expense categories "Go'sht / Sabzavot / Avans / …" → in practice just `Mahsulot xaridi`
  (auto for purchases) and `Operatsion` (default).
- ⚠ "One active order per table, enforced by partial unique index" → index was dropped, §11 #5.
- ⚠ "ADMIN cannot see profit totals" → true in the UI only, §11 #7.
- ❌ "mark walkout" listed as an ADMIN capability (Roles table) → the action, the button and the
  status are all gone; an unpaid order closes as nasiya via the debtor picker (§2 "Closing an
  unpaid order").
- ❌ The lifecycle diagram's `SENT ─"Walkout"─► WALKOUT` branch and the `SENT → WALKOUT`
  transition row (Order lifecycle) → both deleted. The 2026-08-14 amendment below them states the
  real graph, but the original diagram and transition table above it were never struck.
- ❌ "Never from `CLOSED`, `WALKOUT`, or `CANCELED`" (cancellation rules) → `WALKOUT` doesn't
  exist; the terminal states are `CLOSED` and `CANCELED`.
- ❌ Partial unique index "where status NOT IN (`CLOSED`, `WALKOUT`, `CANCELED`)" (Tables) →
  `WALKOUT` doesn't exist, and the index itself is gone regardless — see §11 #5.
- ❌ "No restore ... on walkout" (Stock tracking, consumption flow) → the whole surrounding
  per-dish ingredient model is superseded by count-based inventory (§4); the walkout clause is
  additionally dead on its own terms.
- ❌ Daily report "order count broken down by `CLOSED`, `CANCELED`, `WALKOUT`" and "Walkouts log"
  (Reports), and the Telegram summary's "canceled and walkout counts" (Reports) → none of these
  fields exist; reports carry `CLOSED`/`CANCELED` only.
- ❌ `WALKOUT_MARKED` listed among currently-tracked audit actions (Audit log) → no code path
  produces it any more; it survives only as historical vocabulary on old rows
  (`lib/audit-labels.ts`).

**Claims in `CLAUDE.md` that are wrong:** none open as of 2026-08-15. Two were closed on that
date: the order-state bullet still said the nasiya close does not work (fixed with the behaviour,
see §2), and the Commands section still warned about `scripts/api-smoke.sh`, which was **deleted**
in `4194702` when the ingredient/FIFO layer came out — the warning outlived the file by three
branches. The entries listed here before that (a nonexistent `simulate-flow.ts`, React 18, the
SENT-stock-restore claim) were already corrected. Re-verify `CLAUDE.md` against this file's §2/§4
whenever either changes; the 2026-08-13 pass recorded this list as empty and it was not — a
warning about a deleted file reads as current until someone checks the path exists.

---

## 13. Keeping this file honest

- Update it in the same commit that changes the behaviour it describes.
- When a defect in §11 is fixed, delete the entry — don't mark it "done".
- If §12 shrinks because someone corrects `decisions.md`, that's the goal.
- **Vitest exists as of 2026-08-18** (`pnpm test` in `apps/master`: 142 tests in 14 files on
  `fix/server-money-guards`) but covers pure modules only — `payment-legs`, `money-input`,
  `pin-lockout`, `errorHandler`, `alert.service` (with Telegram mocked), and the like. The finance
  e2e suite (`apps/master/e2e/`, its own `vitest.e2e.config.ts`, versioned on that branch) drives
  the real server over HTTP in the Docker harness: 106 tests, 38 of which fail on purpose, each
  pinning a defect a later slice owns — judge a change by which tests flip. Everything else is
  manual flows plus the `scripts/smoke-*.ts` family; several `simulate-*.ts` helpers carry stale
  expectations, so read before trusting a green run.
- **2026-08-18:** ten entries left §11 by being fixed, and are deleted per the rule above rather
  than listed. For the record, since a cold reader may wonder what changed: money grouped with a
  comma everywhere (`Intl.NumberFormat('uz-UZ')` does that, against the spec and against
  `formatMoney`'s own docstring) and a second hand-rolled formatter on the payroll screens leaked
  fractions; six nav destinations including **Chiqish** were unreachable behind an
  `overflow-y: visible` rail; the tender keypad was clipped through its bottom row and the hardware
  keyboard did nothing; `RowSub` overflowed its fixed-height `Row` at 36 call sites; `itemCount` was
  never on the wire though three components render it; the Buyurtmalar CLOSED tab silently ignored
  its date filter and loaded all history; and its tab counts read 0 above the rows they listed.
  Found by clicking every screen in a browser against a live server — a method worth repeating, and
  one the 1366×768 gallery frame cannot substitute for.
- **2026-08-14:** former defect #3 ("walkout loss structurally always zero") is not in §11 because
  it was **deleted, not fixed** — the `WALKOUT` status itself was removed from the product on this
  date, so the scenario it described can no longer occur. This is different from the ordinary
  "fixed, so delete the entry" case above: nobody patched the zero-loss bug, the thing it was a
  bug *in* stopped existing. See `decisions.md`'s 2026-08-14 amendment and
  `docs/superpowers/specs/2026-08-14-money-model-design.md` §7. §11 defect #12 was also renumbered
  in this pass (was #13) and defect #11 (was #12) was verified fixed, not deleted — its content
  says why.
- **2026-08-14 (final branch review, second renumbering the same day):** a new defect #1 was
  inserted at the top of the money-affecting group — the nasiya/full-discount close path
  documented in §2 above, in `CLAUDE.md`, and in `decisions.md`'s amendment does not execute on an
  order carrying a service line (`OrderTicket.tsx:52-57`, `api/orders.ts:17`). Pre-existing, not
  introduced by this branch, but newly the *only* path left since this branch removed `WALKOUT`.
  Every defect from the old #1 onward shifted down by one, for 13 total; every `§11 defect #N` and
  `§11 #N` cross-reference in the file was re-checked against the new numbers, not just
  incremented. Two of them, both in §12 (`§11 #7`, `§11 #8`), landed back on their original digits
  by coincidence — they were one-too-high before this pass (should have read #6/#7 against the
  numbering that pass left behind) and this pass's insertion shifted the correct target by exactly
  one, so the text needed no edit.
- **2026-08-14, on the verification story itself — three facts this branch measured, not about
  walkout:**
  - `tsc -b` compiles **nothing** under `apps/master/scripts` — verified with
    `npx tsc --listFiles -p tsconfig.main.json | grep -c "/scripts/"` → `0`. Every `smoke-*.ts` and
    `simulate-*.ts` script here is entirely untypechecked; running it is the only check it gets.
  - `smoke-prd13-clock-isolation.ts` overclaims: its header comment says it proves `sentAt`,
    `closedAt`, `canceledAt` and `Payment.createdAt` are all server-stamped, but its `checks` array
    (`:74-77`) only asserts `createdAt` and `sentAt`. Known gap, not fixed here.
  - `smoke-cashflow-reversal.ts` is **destructive and unguarded** (`:59-63`): `deleteMany({})` with
    no `where` clause against `Payment`, `Expense`, `Order`, `ExpenseCategory` and `User` — every
    row in each. Its comment claims "idempotent across reruns on the same temp db"; nothing
    enforces "temp" — it wipes whatever `DATABASE_URL` points at, users included.
    `smoke-prd13-boundary.ts` and `smoke-prd13-clock-isolation.ts` scope their own cleanup with
    `where: { cancelReason: SENTINEL }`; this is the one script that doesn't. It also currently
    **fails** outright, proven pre-existing against the schema as it stood before this branch
    dropped the `WALKOUT` columns (same failure on a `git stash` baseline with none of this
    branch's edits applied). `CLAUDE.md`'s Commands section now carries this warning too. Fixing
    the script is separate work, awaiting a decision on which cleanup strategy it should use.
  - Several `simulate-*.ts` scripts fail for unrelated pre-v0.1.3 reasons — already recorded in the
    root `CLAUDE.md`, not re-chased here.
- **2026-08-15 (third renumbering, this time by deletion):** the defect #1 added by the previous
  bullet is **fixed and therefore deleted**, per the rule at the top of this section. `OrderTicket`
  now carries a debtor picker (§2 "Closing an unpaid order"), so a nasiya close is reachable and an
  unpaid order has a working exit again. Every defect from the old #2 onward moved **up** by one,
  back to 12 total — the exact inverse of the previous pass. All nine numeric cross-references were
  re-checked against content rather than incremented blindly: §3, §5, §6, §7, §10, §12 ×3, and the
  `(defect #8)` pointer inside defect #12. The two prose references to the deleted entry (in defect
  #11 and in §12's "mark walkout" line) were rewritten rather than renumbered, because their target
  no longer exists. Note the second half of the old defect — that a 100% food discount leaves the
  service charge owed — was **not** a bug and was not "fixed": under the money model's D1 the
  service charge is the waiter's pay, so it is meant to survive a comped meal. Only the missing
  debtor input was ever broken.
- **2026-08-15, verification for that change:** `typecheck:renderer` and `typecheck:gallery` both
  clean, `tsc -b` still **49** (unchanged floor). Driven end-to-end in the browser against
  `pnpm gallery:page`: adding a nasiya leg opens the picker, the eight fixture debtors fold to
  eight rows with phone and outstanding, selecting one enables TASDIQLASH, and a fully unpaid
  order (`CASH 0` + `DEBT 174 000` on a 174 000 bill) sent **exactly one** confirm request whose
  body carried `debt: { debtorName, debtorPhone }` — then left the queue. The `+ Yangi qarzdor`
  fallback autofocuses a 48px field and gates `Tayyor` on a non-empty name. Measured in the same
  pass: nothing in the panel renders below the 768px frame edge.
- **2026-10-01 (fourth renumbering, by deletion and addition; PRD 14, `fix/server-money-guards`):**
  four entries left §11 by being fixed and are deleted per the rule above — the duplicate confirm
  (`setClosed`/`setCanceled` had no compare-and-swap), payment amounts with no non-negative check,
  zod failures answering 500, and the non-integer payment amount's opaque failure. Two were added
  (a debt paid after its write-off shows on two screens; the PIN lock resets on a successful
  login), and the old #2 took in the line-edit race. Old 2, 4, 5, 6, 9, 10, 11, 13, 14, 15 are now
  1, 2, 4, 5, 8, 9, 10, 11, 12, 13; #7 kept its number. Every `§11` cross-reference in the file was
  re-checked against content (§2, §3, §5, §7, §8, §10, §12 ×3); the one in §6 went with the
  deleted entry. Behaviour documented in this pass: confirm claims SENT→CLOSED first and prints
  after the commit (§2); cancel and the stale-draft cleanup claim first and restore from lines
  re-read inside their transaction (§2, §4, §9); repayment is one conditional decrement and
  written-off debts stay repayable (§5); PIN lockout is per device (§8); one SQLite connection
  (§9); a failed schema answers 400 (§6). Verified in the Docker harness at `d04a2a8`:
  `pnpm test` 136 tests in 13 files, finance e2e 66 pass / 38 fail (104), `pnpm typecheck` **47**
  (the `loginPin` rewrite removed one error), `typecheck:renderer` and `typecheck:gallery` 0.
- **2026-10-01, PRD 14's final review (`67455a1`):** no §11 entry changed. Behaviour documented:
  each owner alert waits at most 5 s for Telegram (§2, §9, §10); the session touch writes at most
  once a minute and the client logs its one connection (§8, §9); the print-failure notice names its
  bill and every confirm-loop toast sits bottom-centre (§2); stale drafts go oldest first (§9); the
  §4 and §10 line pointers re-checked. Verified in the Docker harness at `67455a1`: `pnpm test`
  142 tests in 14 files, finance e2e 68 pass / 38 fail (106) with no test changing status,
  `pnpm typecheck` **47**, `typecheck:renderer` and `typecheck:gallery` 0.
