# Chayxana POS — Current workflow (live state)

**Snapshot:** 2026-08-03, commit `e8af3bf` (tag `v0.1.3`), clean tree.
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
  "Tasdiqlash" queue → ConfirmModal → POST /api/orders/:id/confirm → CLOSED
```

★ **The most counter-intuitive fact in the codebase: stock and COGS move at line-add time, not at
any status transition.** `send` touches no inventory. `confirm` touches no inventory
(`order.service.ts:652-774`). Adding a line runs a FIFO peel inside a 30-second transaction.

### Order state machine (enforced server-side, `order.service.ts`)

```
DRAFT ──send──► SENT ──confirm──► CLOSED        (terminal)
  │               │
  │               ├──mark-walkout──► WALKOUT     (terminal)
  │               │
  └──cancel───────┴──cancel───────► CANCELED     (terminal)
```

There is no `BILL_REQUESTED`, no `PENDING_PAYMENT`, no `KitchenTicket`. Nothing leaves a terminal
state. Line mutations (add / adjust / remove / note / transfer) are legal in **both** DRAFT and SENT.

| Transition | Function | Repo write | Guard |
|---|---|---|---|
| ∅ → DRAFT | `createDraft` `:161` | `orderRepo.create` | DINE_IN needs `tableId`; TAKEAWAY forbids it |
| DRAFT → SENT | `send` `:487` | `setSent` — **CAS** | waiter owns it; ≥1 non-canceled line |
| SENT → CLOSED | `confirm` `:652` | `setClosed` — **no CAS** ⚠ | status===SENT; payments sum exactly; print OK |
| SENT → WALKOUT | `markWalkout` `:776` | `setWalkout` — **CAS** | status===SENT; reason required |
| DRAFT\|SENT → CANCELED | `cancelOrder` `:586` | `setCanceled` — **no CAS** ⚠ | waiter owns it, or ADMIN/OWNER |

⚠ See §11 defect #1 — the missing compare-and-swap on `setClosed`/`setCanceled` is the most
serious open bug.

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
| **ADMIN** | master admin UI | Menu/tables/users/ingredients/recipes/purchases/discounts CRUD, confirm+pay, walkout, cancel, expenses, debts, audit read. Per `decisions.md` must NOT see profit — but see §11 defect #9. |
| **WAITER** | mobile or order app | PIN login, create/edit/send orders, transfer own orders, cancel own orders. |

Role gating is server-side via `requireRole` on every router. The admin UI's 17 React routes are
**not** individually role-gated — only the sidebar filters by role (`Sidebar.tsx:144`). URL-hash
navigation to a hidden page renders it, but the API behind it returns 403. Server is the real gate.

---

## 4. Inventory, FIFO and COGS

Stock lives on `Ingredient`, **scoped to exactly one parent dish** (`@@unique([parentMenuItemId, name])`).
"Piyoz for plov" and "Piyoz for qiyma" are different rows and cannot share a pool.

Everything downstream of purchase is in `recipeUnit`:
```
quantityRecipeUnit    = quantityBuyUnit × conversionFactor
unitCostPerRecipeUnit = totalCostUzs / quantityRecipeUnit
```

### The four menu-item creation modes

`CreateItemMode` is a **create-time-only** discriminator, never stored. Tracking behaviour is
inferred afterwards purely from which relations exist:

| Mode | `kind` | Rows created | Consumption behaviour |
|---|---|---|---|
| `SERVICE` | SERVICE | none | never consumes; excluded from subtotal, added as service charge |
| `SIMPLE` | FOOD | self-`Ingredient` (+ optional initial purchase) | 1 portion = 1 recipeUnit peeled |
| `COMPOSITE` | FOOD | `Recipe` + N ingredients (+ initial purchases) | peels `RecipeIngredient.quantity × N` of each |
| `UNTRACKED` | FOOD | **nothing** | no stock movement, **no COGS**, always available |

`MenuItemKind` in the DB has only two values: `FOOD | SERVICE`.

### FIFO engine

- **Batch = one `Purchase` row.** Created with `remainingQty = quantityRecipeUnit`.
- **Peel** (`consumption.service.ts:75-162`) takes oldest-first from `status='ACTIVE' AND remainingQty > 0`.
  Per batch it writes an `OrderLineBatchConsumption` row + `IngredientMovement(CONSUME)` and
  accumulates `OrderLine.cogsSnapshot`. `peelAtomic` is a conditional `updateMany`, so concurrent
  peels cannot double-spend a batch.
- **Restore** is **LIFO over that peel ledger**, at the frozen original prices
  (`unwindRestore:168-227`). Past COGS is never restated — "honest history".
- Insufficient stock throws `Errors.OutOfStock` → 409 → the whole line transaction rolls back.

**Key invariant:** `Ingredient.currentStock == Σ Purchase.remainingQty WHERE status='ACTIVE'`.
Defect #6 in §11 breaks it permanently, and there is no repair tool.

### When stock moves

| Trigger | Effect |
|---|---|
| `addLine`, `addCombo`, quantity **increase** | consume |
| quantity **decrease**, `cancelLine`, `cancelOrder` | restore |
| `send`, `confirm` | **nothing** |
| `markWalkout` | **nothing** — deliberate, food was eaten |

**Cancel restores stock from SENT as well as DRAFT.** `maybeRestoreLineStock` takes the order as
`_order` and never reads its status (`order.service.ts:123-136`). This was a deliberate change
(commit `000e540`); `decisions.md` and `CLAUDE.md` still claim otherwise and are stale.

### Movement types actually written

`PURCHASE` (+), `CONSUME` (+, magnitude only — the *type* carries direction), `RESTORE` (+),
`ADJUST` (−, purchase reverse/delete). **`STOCKTAKE`, `WASTE`, `COST_ADJUST` are never written** —
stocktake and waste are Phase-0 stubs whose every method throws
(`stocktake.service.ts:13-38`, `waste.service.ts:11-25`). No routes, no UI, no repair path.

`weightedAvgCost` is misnamed — it holds the **last** purchase's unit cost and is display-only.
FIFO peel is the sole COGS authority.

### Purchases

- **Create** → one transaction: `Expense` (category `seed-cat-ingredients`) + `Purchase` batch +
  stock up + `IngredientMovement(PURCHASE)` + audit. One event, two views: Xaridlar (inventory)
  and Chiqimlar (cash), linked by `Expense.purchaseId`.
- **Edit** → metadata only (`supplierNote`, `occurredAt`). Quantity/cost deliberately immutable.
- **Reverse** → same Tashkent day only, and only if completely untouched.
- **Delete** (soft) → any day, any consumption state. **This is the only producer of cross-day
  reversals**, and cross-day reversals are exactly what the cash-drawer math has to special-case (§5).

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
see §11 defect #9.

---

## 6. API surface

62 endpoints across 18 routers (`server/app.ts`). Middleware order: `cors()` (open) →
`cookieParser` → `express.json({limit:'1mb'})` → routers → `errorHandler`.

| Mount | Auth | Roles |
|---|---|---|
| `/api/health` | **none** | — (`/` and `/server-info`, used for LAN discovery) |
| `/api/auth` | mixed | `login`, `login-pin` (IP-limited), `logout`, `me` |
| `/api/menu` | yes | reads **all roles**, writes + `/yield` ADMIN+OWNER |
| `/api/orders` | yes | see table in §2; `confirm` / `mark-walkout` / `reprint-bill` ADMIN+OWNER |
| `/api/tables`, `/api/me` | yes | reads all roles |
| `/api/reports` | yes | **OWNER only** |
| `/api/finance`, `/api/audit` | yes | ADMIN + OWNER |
| `/api/expenses`, `/expense-categories`, `/debts`, `/purchases`, `/ingredients`, `/discounts`, `/settings`, `/printers`, `/users` | yes | ADMIN + OWNER |

Errors: throw `AppError` / `Errors.*` from `lib/errors.ts` (20 codes). The central handler maps it
to `{ error: { code, message, details } }`. **It has no `ZodError` branch** — validation failures
return 500 `INTERNAL` (§11 defect #10).

---

## 7. Real-time

Socket.io on the same HTTP server. Handshake auth is `auth: { token }` validated against `Session`.

**Rooms joined:** `admin` (OWNER/ADMIN) and `waiter:{userId}` (WAITER) — `socket.ts:51-52`. That's all.

Emits are deferred through `AsyncLocalStorage` and flushed only after the transaction commits
(`lib/socket-events.ts`), so a rolled-back transaction never emits. Payloads are minimal IDs;
clients re-fetch via REST and invalidate TanStack Query keys.

| Event | Room | Reaches a client? |
|---|---|---|
| `order:updated` | admin, waiter | ✅ master + order app (**mobile does not subscribe**) |
| `order:closed` / `order:walkout` / `order:transferred` | admin, waiter | ✅ all three |
| `order:canceled` | admin, waiter | ❌ **no listener anywhere** |
| `ingredient:stockChanged` | admin **only** | ✅ master only — waiter apps subscribe but never receive |
| `menu:changed`, `menu:itemAvailability` | `'all'` | ❌ **room never joined — reaches nobody** |
| `auth:kicked` | direct | ✅ all three force-logout |

See §11 defect #11 — live menu/availability push is entirely dead.

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
/xarajatlar /omborxona /ofitsiantlar /yordam`, plus six push alerts — walkout, large discount,
debt sale, debt write-off, large expense, ingredient stock-out.

**Scheduler:** stale-draft cleanup every 6 hours; the finance report scheduler polls **every 60
seconds** for the configured send time.

**Mobile monorepo invariants** (all currently holding — verify before touching):
root `.npmrc` has `node-linker=hoisted` + `shamefully-hoist=true`; `apps/mobile/index.js` is the
entry named in `package.json` `main`; `metro.config.js` pins react / react-native / react-dom to
workspace-root copies. Two RN copies → invariant-violation crash. Use `npx expo start --tunnel`.

---

## 10. Where to look when something breaks

| Symptom | File |
|---|---|
| Stock didn't move on order | `services/consumption.service.ts` (peel/restore), `order.service.ts:209-288` |
| Bill total looks wrong | `services/billing.service.ts:54-130` |
| Confirm rejected | `order.service.ts:652-688` (guards run before the transaction) |
| Purchase didn't update cost/stock | `services/purchase.service.ts:73-190` |
| Cash drawer disagrees | `reports.service.ts` `dailyLedger.cashflow.cashOut` — and read §5 |
| Menu change didn't reach waiters | Expected — dead socket room, §11 defect #11 |
| Walkout cash doesn't reconcile | Expected — no Payment row by design; but also §11 defect #3 |
| Print didn't fire | `services/print.service.ts`; check `admin_printer_name` setting |
| Daily Telegram missing | `services/finance-report.service.ts` + `lib/scheduler.ts` |

---

## 11. Known defects (verified at `e8af3bf`, ranked)

**Money-affecting**

1. **Duplicate confirm is reachable.** `setClosed`/`setCanceled` use plain `update` with no status
   precondition, while `setSent`/`setWalkout` use CAS `updateMany` (`order.repo.ts:223,233`). Two
   concurrent confirms both pass the `status===SENT` check and both commit → duplicate payments,
   second bill printed. *Currently latent* because ConfirmModal disables its button while the
   mutation is in flight — two windows or a post-timeout retry defeats that. The
   `if (!updated) throw` guards at `order.service.ts:729` are unreachable dead code.
   **Fix:** make both repo methods CAS like their siblings.
2. **Confirm computes totals outside the transaction it commits** (`:668-682` vs `:690`). A
   concurrent line edit on a SENT order lands between them; payments get recorded against the
   pre-edit total while the receipt prints the post-edit lines. **Fix:** move the read +
   `computeTotals` inside the transaction.
3. **Walkout loss is structurally always zero.** `orderRepo.applyTotals` has exactly one call site
   — inside `confirm`. WALKOUT orders never get `totalSnapshot`, so `finance.service.ts:119-122`
   sums `?? 0`. The audit `amount` and the Telegram alert amount are `'0'` too. COGS also filters
   on `status = CLOSED`, so a walkout is invisible on **both** sides of the P&L while the food is
   physically gone.
4. **Payment amounts are not validated non-negative** (`orders.controller.ts:52`) — the adjacent
   `discountAmount` on `:48` does have `.nonnegative()`, so this is an oversight. Reachable from
   the UI: the payment input is `type="number" min="0"` with a bare `Number()` in `onChange`
   (`ConfirmModal.tsx:479-488`), and `min` does not block typed negatives.
5. **Ad-hoc discount bypasses both settings caps.** Only the preset-`discountId` path enforces
   `max_discount_percent` / `max_discount_amount` (`billing.service.ts:82-115`). A 100% discount is
   a valid request from any ADMIN.

**Correctness / data integrity**

6. **`restoreToBatch` has no status check** (`purchase.repo.ts:128-133` — its own docstring admits
   it) while `peelAtomic` correctly guards on ACTIVE. Restoring into a soft-deleted batch
   permanently inflates `currentStock` above `Σ ACTIVE remainingQty` → phantom sellable stock, then
   spurious `OUT_OF_STOCK` at sale time. **No repair path exists** — stocktake is a stub, yet
   `purchase.service.ts:285` tells the admin to fix it via stocktake.
7. **`isAvailable` is never enforced server-side.** `order.service.ts` checks only `isActive`;
   `Errors.ItemUnavailable` has zero throw sites. Availability is a client-side hint.
8. **"One active order per table" is unenforced.** Migration `20260607041034` rebuilt the `Order`
   table and recreated only the plain indexes — the partial unique index from migration 2 is gone.
   `createDraft` relies on a `P2002` that can no longer fire.

**Contract / UX**

9. **ADMIN can read owner-only profit.** `/api/finance/daily` is ADMIN+OWNER and returns
   `pnl.profit` (`finance.service.ts:302-306`); the comment at `:34` says the renderer hides it.
   Client-side only — curl or devtools reads it off the wire. Violates `decisions.md`.
10. **Zod validation failures return 500 `INTERNAL`, not 400** — `errorHandler.ts` has no
    `ZodError` branch, so malformed bodies surface with no field detail.
11. **Live menu push is dead.** `menu:changed` / `menu:itemAvailability` emit to room `'all'`,
    which nobody joins. `ingredient:stockChanged` goes only to `admin`, so waiter clients that
    subscribe never receive it. `order:canceled` has no listener in any client.
12. **Customer receipts don't add up** on any order with a service charge — the item list prints
    SERVICE lines but the printed subtotal is FOOD-only, and there is no service-charge line
    (`printer/receipt-builder.ts:44,56-77`).
13. **A fully-comped order can never be closed.** `canSubmit` requires `previewTotal > 0`
    (`ConfirmModal.tsx:131`) though the server would accept a zero total. The order is stuck at
    SENT; cancelling it restores stock for food that was eaten.
14. **Decimal payment amounts produce an opaque failure.** `isBalanced` uses a `< 1` tolerance
    (`ConfirmModal.tsx:129`) while the server requires exact `!==`, so a decimal shows a green ✓
    then fails server zod → 500 (defect #10) → generic "Buyurtmani tasdiqlab bo'lmadi".

**Dead code worth knowing:** `MenuItem.unitCostSnapshot` and `OrderLine.consumptionSnapshot` are
never written or read; `orderRepo.setStatus`, `yieldService.effectivelyAvailable`, all of
`stocktakeRepo` / `wasteEventRepo`, and most of `ingredientMovementRepo` have zero callers.

---

## 12. What to trust in the docs

| Doc | Verdict |
|---|---|
| **This file** | Current as of `e8af3bf`. |
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
- ⚠ "One active order per table, enforced by partial unique index" → index was dropped, §11 #8.
- ⚠ "ADMIN cannot see profit totals" → true in the UI only, §11 #9.

**Claims in `CLAUDE.md` that are wrong:** `scripts/simulate-flow.ts` does not exist (the real one
is `simulate-confirm-flow.ts`, itself stale); `api-smoke.sh` is dead legacy referencing kitchen
users and removed endpoints; renderers run **React 19**, not 18; the SENT-stock-restore claim is
stale as above.

---

## 13. Keeping this file honest

- Update it in the same commit that changes the behaviour it describes.
- When a defect in §11 is fixed, delete the entry — don't mark it "done".
- If §12 shrinks because someone corrects `decisions.md`, that's the goal.
- There is no test runner in this repo. Verification is manual flows plus the `scripts/simulate-*.ts`
  helpers, several of which have stale expectations — read before trusting a green run.
