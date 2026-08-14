# Chayxana POS — Current workflow (live state)

**Snapshot:** 2026-08-14, branch `feat/remove-walkout` (continues `feat/c1-design-system`), clean tree.
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
(`order.service.ts:652-774`).

### Order state machine (enforced server-side, `order.service.ts`)

```
DRAFT ──send──► SENT ──confirm──► CLOSED        (terminal)
  │               │
  └──cancel───────┴──cancel───────► CANCELED     (terminal)
```

There is no `WALKOUT` (removed 2026-08-14 — see §11 and §13; an unpaid order is *meant* to close
as nasiya or a full discount instead, but §11 #1 documents why neither reliably works today), no
`BILL_REQUESTED`, no `PENDING_PAYMENT`, no `KitchenTicket`. Nothing leaves a terminal state. Line
mutations (add / adjust / remove / note / transfer) are legal in **both** DRAFT and SENT.

| Transition | Function | Repo write | Guard |
|---|---|---|---|
| ∅ → DRAFT | `createDraft` `:160` | `orderRepo.create` | DINE_IN needs `tableId`; TAKEAWAY forbids it |
| DRAFT → SENT | `send` `:486` | `setSent` — **CAS** | waiter owns it; ≥1 non-canceled line |
| SENT → CLOSED | `confirm` `:651` | `setClosed` — **no CAS** ⚠ | status===SENT; payments sum exactly; print OK |
| DRAFT\|SENT → CANCELED | `cancelOrder` `:585` | `setCanceled` — **no CAS** ⚠ | waiter owns it, or ADMIN/OWNER |

⚠ See §11 defect #2 — the missing compare-and-swap on `setClosed`/`setCanceled` is the most
serious concurrency bug (defect #1 is a bigger operational blocker, but it isn't a race).

### Confirm, step by step (`order.service.ts:652-774`)

Outside the transaction: re-read order → reject unless SENT → require debt metadata if any DEBT
leg → `billingService.computeTotals` → require `Σpayments === total` **exactly**.

Inside one `$transaction` (timeout 30s): stamp approval → write the four snapshot columns →
insert `Payment` rows → create `Debt` if a DEBT leg exists → **print the bill (blocking)** → flip
to CLOSED → write `ORDER_CONFIRMED` audit.

After commit: flush deferred socket emits, then fire Telegram owner alerts.

**Printer failure rolls the whole thing back** — order stays SENT, no payments, no debt, clean
retry. This works as designed. (Side effect: the failed `PrintJob` row rolls back too, so
confirm-time print failures leave no trace in the DB.)

### Bill math (`billing.service.ts:54-130`)

```
subtotal      = Σ(qty × unitPriceSnapshot)  WHERE menuItem.kind = FOOD    ← service excluded
discount      = ad-hoc so'm amount (caps BYPASSED)  |  preset Discount FK (caps enforced)
netFood       = subtotal − discount
serviceCharge = Σ(qty × unitPriceSnapshot)  WHERE menuItem.kind = SERVICE
total         = netFood + serviceCharge
```

**Service charge is not a setting.** It is `MenuItem` rows with `kind = SERVICE` that the waiter
adds like any other item, quantity typically = number of customers. It is waiter income, excluded
from revenue and profit, and never discounted. `Order.serviceChargeSnapshot` /
`serviceChargeWaived` survive for historical rows; `serviceChargeWaived` still zeroes the charge
at confirm time but is otherwise vestigial.

Payments: `CASH | CARD | DEBT`, mixed allowed, must sum exactly. **There is no AVANS payment
method** — avans is a repayable `Expense` on the outflow side, unrelated to this path.

---

## 3. Roles

| Role | Surface | Can do |
|---|---|---|
| **OWNER** | master admin UI + Telegram | Everything. Only role that can reach `/api/reports/*`. Receives daily Telegram summary. |
| **ADMIN** | master admin UI | Menu/tables/users/stock (Ombor)/discounts CRUD, confirm+pay, cancel, expenses, debts, audit read. Per `decisions.md` must NOT see profit — but see §11 defect #8. |
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
  (`order.service.ts:331-335`).

### Sale and restore (`stock.service.ts`, same two entry points `order.service.ts` calls)

`consume(line, portions, tx)`: `kind = SERVICE` → no-op. `counted = true` → one atomic conditional
`updateMany` guarded by `stockCount >= portions`; no row matched → `Errors.OutOfStock`, the line
transaction rolls back (`counted = false` skips straight past this). Then
`cogsSnapshot += costPrice × portions` (0 when `costPrice` is NULL). Crossing to 0 emits
`menu:itemAvailability` to `all` (§7) and fires the owner Telegram stock-out alert
(`alertService.itemStockOut`).

`restore(line, portions, tx)` fires on quantity decrease, line cancel, and order cancel from
**both** `DRAFT` and `SENT` — `maybeRestoreLineStock` still never reads order status
(`order.service.ts:123-136`, deliberate, commit `000e540`). Every cancellation restores; there is
no path left that consumes without restoring, now that `WALKOUT` is gone (§11, §13).
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
with a DEBT payment leg; repayments are append-only and belong to the day received.

Reports are OWNER-only (`/api/reports/*`). `/api/finance/daily` is the ADMIN-safe daily view — but
see §11 defect #8.

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
to `{ error: { code, message, details } }`. **It has no `ZodError` branch** — validation failures
return 500 `INTERNAL` (§11 defect #9).

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
for it, which is harmless dead code. See §11 defect #10 — `order:canceled` is what's still dead.

---

## 8. Auth

- OWNER/ADMIN: username + password. WAITER: 4-digit PIN. Both bcryptjs.
- Tokens: 32-byte `crypto.randomBytes(...).base64url`, stored in `Session`, sent as `Bearer`.
- **Single device per user** — a new login deletes the user's existing sessions.
- 5 failed logins → account locked 5 minutes (`Errors.Locked`, HTTP 423).
- `POST /api/auth/login-pin` is IP-rate-limited; `POST /api/auth/login` is **not** (mitigated by
  account lockout). The limiter returns HTTP **409**, not 429, and its in-memory map never evicts.

---

## 9. Runtime

**Cold start** (`main/index.ts:239-262`): single-instance lock → SQLite bootstrap → data migrations
→ load settings → start Telegram bot (non-blocking) → `httpServer.listen(4000, '0.0.0.0')` →
mDNS advertise → **then** open the BrowserWindow. The API serves before the UI exists, which is
correct for a machine waiters depend on. Heavy startup logging lands in `userData/`.

Packaged Windows applies migrations **in-process via sql.js** with its own `_app_migrations` ledger
(checksum self-heals on drift); dev uses the Prisma CLI against `dev.db`.

**Printing:** `printBill → PrintJob row → p-queue mutex (concurrency 1) → execFile receipt.exe`
(Win32 RAW ESC/POS, `cpp/receipt.cpp`). Only `BILL` and `BILL_REPRINT` types remain. On non-Windows
dev hosts `executeBinary` is a stub that logs and returns success — printing appears to work.

**Telegram bot:** `/bugun /kecha /sana /oldin /hafta /oy /oylik /umumiy /excel /pdf /qarzlar
/xarajatlar /omborxona /ofitsiantlar /yordam`, plus five push alerts — large discount,
debt sale, debt write-off, large expense, item stock-out (`alertService.itemStockOut`, fired from
`stock.service.ts` when a counted item's `stockCount` crosses to 0 — see §4). The walkout alert
is gone with the rest of the status (§11, §13).

**Scheduler:** stale-draft cleanup every 6 hours; the finance report scheduler polls **every 60
seconds** for the configured send time.

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
| Stock didn't move on order | `services/stock.service.ts` (consume/restore), `order.service.ts:209-288` |
| Bill total looks wrong | `services/billing.service.ts:54-130` |
| Confirm rejected | `order.service.ts:652-688` (guards run before the transaction) |
| Keldi/Sanoq didn't update count or cost | `services/stock.service.ts` `restock`/`setCount` (`:140-289`), `stock.routes.ts` |
| Cash drawer disagrees | `reports.service.ts` `dailyLedger.cashflow.cashOut` — and read §5 |
| A canceled order didn't refresh another open screen | Expected — no listener, §11 defect #10 |
| Print didn't fire | `services/print.service.ts`; check `admin_printer_name` setting |
| Daily Telegram missing | `services/finance-report.service.ts` + `lib/scheduler.ts` |

---

## 11. Known defects (re-verified 2026-08-13 on `feat/count-based-inventory`, ranked; renumbered
2026-08-14 after walkout removal, renumbered again 2026-08-14 when the final branch review added
defect #1 — see §13)

**Money-affecting**

1. **The documented nasiya/full-discount close path cannot execute on an order carrying a service
   line.** `OrderTicket.tsx:52` declares `const [debtorName, setDebtorName] = useState('')`;
   `setDebtorName` has no caller anywhere in the renderer, so `debtorName` stays `''` forever.
   `needsDebtor` (`:57`) is therefore permanently `true` once any `DEBT` leg is added, and
   TASDIQLASH (`:125`, `disabled={!balanced || needsDebtor || submitting}`) is permanently
   disabled — the nasiya close is dead in the admin UI. Separately, `waiveServiceCharge` exists
   only as a type field (`api/orders.ts:17`) with zero senders; `due = Math.max(food − discount,
   0) + serviceChargeSnapshot` (`OrderTicket.tsx:54`), so on any order carrying a `Xizmat haqi`
   (SERVICE-kind) line, a 100% food discount still leaves `due > 0` and `balanced = paid === due`
   (`:56`) never holds. **Net effect: an unpaid `SENT` order with a service line cannot be closed
   by any path** — not nasiya, not a full discount. The admin's only remaining action is
   `Bekor qilish`, which restores stock for food already eaten (both `DRAFT` and `SENT` restore,
   §4) — exactly what `20260814111159_convert_walkout_orders/migration.sql` says must not happen.
   Both gaps pre-date this branch (C1-rebuild remnants), but this branch deleted `WALKOUT`, the
   last working escape hatch, and documented this non-working replacement as live fact — see §12.
   Wiring the debtor input is slice 2/3 work and needs a product decision first.
2. **Duplicate confirm is reachable.** `setClosed`/`setCanceled` use plain `update` with no status
   precondition, while `setSent` uses CAS `updateMany` (`order.repo.ts:204,214`). Two
   concurrent confirms both pass the `status===SENT` check and both commit → duplicate payments,
   second bill printed. *Currently latent* because `OrderTicket` disables its button while the
   mutation is in flight (`OrderTicket.tsx:125`, `disabled={... || submitting}`) — two windows or
   a post-timeout retry defeats that. The `if (!updated) throw` guards at `order.service.ts:729`
   are unreachable dead code. **Fix:** make both repo methods CAS like their siblings.
3. **Confirm computes totals outside the transaction it commits** (`:668-682` vs `:690`). A
   concurrent line edit on a SENT order lands between them; payments get recorded against the
   pre-edit total while the receipt prints the post-edit lines. **Fix:** move the read +
   `computeTotals` inside the transaction.
4. **Payment amounts are not validated non-negative** (`orders.controller.ts:52`) — the adjacent
   `discountAmount` on `:48` does have `.nonnegative()`, so this is an oversight. Server-side
   only: `OrderTicket.applyKey` (`OrderTicket.tsx:20-27`) only ever multiplies an already
   non-negative accumulator by 10 and adds a digit, floor-divides it on backspace, or multiplies
   it by 1000 — the current UI cannot type a negative amount. A negative is reachable only from
   curl/devtools; the server still accepts one.
5. **Ad-hoc discount bypasses both settings caps.** Only the preset-`discountId` path enforces
   `max_discount_percent` / `max_discount_amount` (`billing.service.ts:82-115`). A 100% discount is
   a valid request from any ADMIN.

**Correctness / data integrity**

6. **`isAvailable` (the manual admin toggle) is never enforced server-side.** `order.service.ts`'s
   `addLine`/`addCombo` check only `isActive`; `Errors.ItemUnavailable` has zero throw sites — a
   waiter can add a line for an item an admin marked unavailable. This is distinct from stock
   exhaustion, which **is** enforced (`stockService.consume`'s CAS decrement throws `OutOfStock`
   at `stockCount` 0 or NULL — §4); `effectivelyAvailable` folds both into one client-facing flag,
   but only the stock half has a server-side guard behind it.
7. **"One active order per table" is unenforced.** Migration `20260607041034` rebuilt the `Order`
   table and recreated only the plain indexes — the partial unique index from migration 2 is gone.
   `createDraft` relies on a `P2002` that can no longer fire.

**Contract / UX**

8. **ADMIN can read owner-only profit.** `/api/finance/daily` is ADMIN+OWNER and returns
   `pnl.profit` (`finance.service.ts:292-296`); the comment above it says the renderer hides it.
   Client-side only — curl or devtools reads it off the wire. Violates `decisions.md`.
9. **Zod validation failures return 500 `INTERNAL`, not 400** — `errorHandler.ts` has no
   `ZodError` branch, so malformed bodies surface with no field detail. Covers the new
   `/api/stock` `restock`/`count` schemas too.
10. **`order:canceled` has no listener in any client.** The `join('all')` fix (§7) means
    `menu:changed`/`menu:itemAvailability` now reach every socket, and `ingredient:stockChanged`
    is simply gone (no longer emitted server-side — `order`/`mobile` still register a handler for
    it, harmless dead code, not a defect). `order:canceled` is what's left dead: no app
    subscribes, so canceling an order pushes no live refresh to other open screens.
11. **Customer receipts don't add up** on any order with a service charge — the item list prints
    SERVICE lines but the printed subtotal is FOOD-only, and there is no service-charge line
    (`printer/receipt-builder.ts:44,56-77`).
12. **Verified fixed 2026-08-14.** ~~A fully-comped order can never be closed~~ — the old citation
    (`ConfirmModal.tsx:131`, `canSubmit` requiring `previewTotal > 0`) no longer exists; that
    component was deleted by the C1 renderer rebuild. The live gate is `OrderTicket.tsx:56-58`,
    `balanced = paid === due`, which is satisfied at `paid = due = 0` — a fully-discounted order
    with no service line closes today. (Add a service line and it stops being that simple —
    defect #1.)
13. **A non-integer payment amount produces an opaque failure server-side.** The confirm schema's
    `amount: z.union([z.number().int(), z.string().min(1)])` (`orders.controller.ts:52`) rejects a
    non-integer JS number with no `ZodError` branch to catch it (defect #9) → 500 `INTERNAL`, generic
    "Buyurtmani tasdiqlab bo'lmadi". Not reachable from the current UI: `applyKey` treats the
    `'decimal'` key as a no-op (`OrderTicket.tsx:22`), so no on-screen payment amount can ever be
    non-integer, and `balanced = paid === due` (`:56`) is exact — there is no client-side tolerance
    that could hide a fractional amount behind a false green check. The server gap is real only
    for a non-UI caller (curl, a future client).

**Dead code worth knowing:** `MenuItem.unitCostSnapshot` and `OrderLine.consumptionSnapshot` are
still declared and still never written or read (they pre-date the count model too);
`orderRepo.setStatus` has zero callers. `yieldService`, `stocktakeRepo`, `wasteEventRepo`,
`ingredientMovementRepo` and the rest of the old ingredient/FIFO layer are gone outright, not
merely dead — §4 lists what is still declared in the schema with no code path left onto it.

---

## 12. What to trust in the docs

| Doc | Verdict |
|---|---|
| **This file** | Current as of 2026-08-14, `feat/remove-walkout` (see header). |
| `agent-plans/00-shared/decisions.md` | Labelled "locked" but **partly stale** — see below. Still authoritative on intent and on v1 scope exclusions. |
| `agent-plans/00-shared/conventions.md` | Current. Follow it. |
| `FINANCE_IMPLEMENTATION_SPEC.md`, `MOLIYA_KASSA_HISOBLASH_XATOSI.md` | Current and load-bearing for finance work. |
| `PROJECT_TECHNICAL_OVERVIEW.md`, `TECHNICAL_SPECIFICATION.md` | Partly historical — verify before relying. |
| `docs/prd/*` | Proposals, not implemented state. |
| `docs/archive/*` | Historical only. |

**Specific claims in `decisions.md` that are now wrong:**

- ❌ "PostgreSQL 16" → it is **SQLite**.
- ❌ "Master at static `192.168.1.10`" → `192.168.1.50` per README/CLAUDE.
- ❌ "Service charge is a fixed UZS amount configurable in Settings" → it is `MenuItem.kind=SERVICE`
  lines; there is no such setting.
- ❌ "Cancelling from SENT does not restore stock" → it **does** (commit `000e540`, deliberate).
- ❌ Expense categories "Go'sht / Sabzavot / Avans / …" → in practice just `Mahsulot xaridi`
  (auto for purchases) and `Operatsion` (default).
- ⚠ "One active order per table, enforced by partial unique index" → index was dropped, §11 #7.
- ⚠ "ADMIN cannot see profit totals" → true in the UI only, §11 #8.
- ❌ "mark walkout" listed as an ADMIN capability (Roles table) → the action, the button and the
  status are all gone; see §11 #1 for what actually happens to an unpaid order today.
- ❌ The lifecycle diagram's `SENT ─"Walkout"─► WALKOUT` branch and the `SENT → WALKOUT`
  transition row (Order lifecycle) → both deleted. The 2026-08-14 amendment below them states the
  real graph, but the original diagram and transition table above it were never struck.
- ❌ "Never from `CLOSED`, `WALKOUT`, or `CANCELED`" (cancellation rules) → `WALKOUT` doesn't
  exist; the terminal states are `CLOSED` and `CANCELED`.
- ❌ Partial unique index "where status NOT IN (`CLOSED`, `WALKOUT`, `CANCELED`)" (Tables) →
  `WALKOUT` doesn't exist, and the index itself is gone regardless — see §11 #7.
- ❌ "No restore ... on walkout" (Stock tracking, consumption flow) → the whole surrounding
  per-dish ingredient model is superseded by count-based inventory (§4); the walkout clause is
  additionally dead on its own terms.
- ❌ Daily report "order count broken down by `CLOSED`, `CANCELED`, `WALKOUT`" and "Walkouts log"
  (Reports), and the Telegram summary's "canceled and walkout counts" (Reports) → none of these
  fields exist; reports carry `CLOSED`/`CANCELED` only.
- ❌ `WALKOUT_MARKED` listed among currently-tracked audit actions (Audit log) → no code path
  produces it any more; it survives only as historical vocabulary on old rows
  (`lib/audit-labels.ts`).

**Claims in `CLAUDE.md` that are wrong:** none open as of this pass (2026-08-13). The entries
previously listed here (a nonexistent `simulate-flow.ts`, React 18, the SENT-stock-restore claim)
no longer match the file — `CLAUDE.md` already states React 19, the both-DRAFT-and-SENT restore
rule, and the `api-smoke.sh`/`simulate-*.ts` staleness warning correctly. Re-verify `CLAUDE.md`
against this file's §2/§4 whenever either changes; don't assume this stays empty.

---

## 13. Keeping this file honest

- Update it in the same commit that changes the behaviour it describes.
- When a defect in §11 is fixed, delete the entry — don't mark it "done".
- If §12 shrinks because someone corrects `decisions.md`, that's the goal.
- There is no test runner in this repo. Verification is manual flows plus the `scripts/simulate-*.ts`
  helpers, several of which have stale expectations — read before trusting a green run.
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
