# Locked decisions — source of truth

Every decision in this file is final unless the human explicitly says otherwise. Agents must not change anything here without being told.

## Domain

- Uzbek chayxana, single location.
- 50 rooms + 20 tables, treated identically as `Table` entities with `type: ROOM | TABLE`.
- 70% dine-in / 30% takeaway. ~500 orders/day. Lunch + evening rush.
- Casual dining. Add-ons after order send are common.

## Roles

| Role | Capabilities |
|---|---|
| OWNER | Everything. Sees all revenue, debt, expense, profit, and owner-only reports. Receives the daily Telegram finance summary. |
| ADMIN | Operations: menu CRUD, users, tables, discounts (create + apply), bill approval, mark paid, mark walkout, cancellations after kitchen started, audit log read. Can record expenses, debt sales, and debt repayments. **Cannot see owner financial reports or profit totals.** |
| KITCHEN | Per-station account. Logs in once on the monoblock. Marks tickets `IN_PROGRESS` and `READY`. Toggles item availability. |
| WAITER | Mobile-only. PIN auth. Creates orders, adds items, sends to kitchen, requests bills, transfers tables (own orders), cancels orders only while all tickets are still `PENDING`. |

## Order lifecycle

States:

```
DRAFT → SENT → BILL_REQUESTED → PENDING_PAYMENT → CLOSED
                                                 ↘ WALKOUT
CANCELED  (terminal, from DRAFT/SENT/BILL_REQUESTED only — never from PENDING_PAYMENT or CLOSED)
```

Transitions:

- `DRAFT → SENT`: waiter taps "Send to Kitchen". Creates a `KitchenTicket` containing all draft lines.
- `SENT → BILL_REQUESTED`: waiter taps "Request Bill". Items can still be added in this state — fires more `KitchenTicket`s.
- `BILL_REQUESTED → PENDING_PAYMENT`: admin approves bill. **Receipt prints. If print fails, transition is rolled back.**
- `PENDING_PAYMENT → CLOSED`: admin marks paid (with payment rows: cash, card, or mixed).
- `PENDING_PAYMENT → WALKOUT`: admin marks walkout (customer didn't pay).
- Any non-terminal → `CANCELED`: cancellation rules below.

Cancellation rules:

- **Waiter** can cancel only while ALL kitchen tickets on the order are `status: PENDING`.
- **Admin** can cancel from `DRAFT`, `SENT`, `BILL_REQUESTED`. Not from `PENDING_PAYMENT` or `CLOSED`.
- Cancellation always emits a banner notification to the kitchen room.

Add-ons:

- Adding an item after `SEND` creates a NEW `KitchenTicket` containing only the new item. Kitchen never sees "the full updated order" — only what was just fired.
- Quantity changes: increase = add a new line (new ticket fires). Decrease = admin must cancel the line (partial void). No quantity edit on existing tickets.
- Note edits: allowed only while the line's ticket is `PENDING`. Locked once `IN_PROGRESS` or later.

Server-side drafts:

- Drafts are persisted to the database immediately. Every "add item" hits the API.
- Old drafts (>12 hours, no kitchen ticket) are cleaned up by a daily scheduled task.

## Tables

- One active order per table at a time. Enforced by partial unique index on `Order(tableId)` where status NOT IN (`CLOSED`, `WALKOUT`, `CANCELED`) AND `tableId IS NOT NULL`.
- Takeaway orders have `tableId: null` and `orderType: TAKEAWAY`.
- Dine-in orders have `orderType: DINE_IN` and a non-null `tableId`.
- Transfers supported: waiter can transfer their own orders, admin can transfer anyone's.
- No split/merge bills in v1.
- No table map UI in v1. Occupancy derived from query (`activeOrderId` field on Table responses).

## Menu

- Flat categories with `displayOrder`.
- Separate menu items, no variants/sizes table — different sizes are different menu items.
- No half-portion concept.
- Free-text notes only. No structured modifiers.
- Combos are templates: tap one button, expand into N order lines (no special pricing). Components billed at current menu prices. Lines tagged with `comboGroupId` (shared cuid) and `comboNameSnapshot` for grouping on tickets and bills.
- `isAvailable: Boolean` per item, broadcast in real-time.
- Price snapshotted to `OrderLine.unitPriceSnapshot` at order time.

## Bills, discounts, service charge

Bill calculation order:

```
subtotal      = sum of (line.unitPriceSnapshot × line.quantity) for non-canceled lines
- discount    (applied to subtotal only)
+ service     = fixed UZS amount (configurable in Settings) — UNLESS waived
= total
```

Discounts:

- Bill-level only. No line-level discounts.
- Two types: `PERCENT` or `FIXED` (UZS amount).
- Capped: owner sets `max_discount_percent` and `max_discount_amount` in Settings. Discounts that exceed cap are rejected at create-time and at apply-time.
- Admin creates discounts (catalog) and applies them at approval. Owner can too.
- Waiters cannot create or apply discounts.
- Every creation, edit, and application is audit-logged.

Service charge:

- Fixed UZS amount (e.g., 10000), configurable in Settings.
- Goes to the order's waiter (per-waiter analytics for payouts).
- Applied AFTER discount.
- Admin can waive per-bill at approval time. Audit-logged.
- NOT counted as restaurant revenue. Tracked separately as a pass-through to waiters.

Approval flow (two-step):

1. Admin clicks "Approve" → bill calculation finalized, snapshotted onto Order, receipt prints. **If print fails, rollback — order stays at `BILL_REQUESTED`.** On success, status moves to `PENDING_PAYMENT`.
2. Admin clicks "Mark Paid" → records `Payment` rows, status moves to `CLOSED`.

Items can be added during `BILL_REQUESTED` (live bill — admin's screen updates via socket).

## Payments

- Cash + card + debt supported.
- Mixed payments supported: one bill can have multiple `Payment` rows (e.g., 150k cash + 50k debt, or 120k cash + 80k card).
- No tips.
- No mobile payment methods (Click, Payme) in v1.
- Payment rows total must equal `Order.totalSnapshot` exactly.
- If any `Payment.method = DEBT`, the request must also include debt metadata (`debtorName`, optional phone/note).
- A debt sale still closes the order; it does NOT leave the order open forever.
- Debt repayments are separate financial events and do NOT modify the original order totals.

## Debt tracking

- Debt is created only from a closed order that contains a `Payment` row with `method = DEBT`.
- One order can create at most one debt record.
- Debt stores:
  - which order it came from
  - debtor name
  - optional debtor phone
  - original amount
  - remaining amount
  - opened timestamp
  - status `OPEN | PARTIAL | PAID`
- Debt repayments are append-only rows. Each repayment stores:
  - debt id
  - amount
  - method (`CASH` or `CARD`)
  - paid timestamp
  - who received it
- Partial repayment is allowed.
- Overpayment is rejected.
- When remaining amount reaches `0`, debt status becomes `PAID`.
- Order detail may show that an old debt is now paid, but debt repayment money still belongs to the day it was actually received.

## Expense tracking

- Expenses are recorded by admin or owner.
- Every expense must store:
  - category
  - reason
  - amount
  - occurred timestamp
  - actor
  - optional note
- Expense categories include at least:
  - Go'sht
  - Sabzavot
  - Ichimlik
  - Transport
  - Xo'jalik
  - Ishchilar oyligi
  - Avans
  - Boshqa
- Expense rows are immutable:
  - no normal edit
  - no hard delete
  - corrections happen only by creating a reversal row
- Reversal keeps the original row for auditability and subtracts it in reports.
- Salary and wage payouts are expenses, not service charges.

## Stock tracking — per-dish ingredient model

Stock lives on `Ingredient` rows. Every `Ingredient` is **scoped to exactly one parent `MenuItem`** (`Ingredient.parentMenuItemId`). "Piyoz" used in plov is a different `Ingredient` row from "Piyoz" used in qiyma — they cannot share a pool. Composite unique key `(parentMenuItemId, name)`.

Each menu item belongs to one of three patterns, determined by what exists in the schema (no `trackStock` flag):

| Pattern | What exists | How stock works |
|---|---|---|
| **Recipe-based** (plov, kabob, lagman) | `Recipe` with N `RecipeIngredient`s | Sale of 1 portion decrements **each** recipe ingredient by `recipeIngredient.quantity`. Out-of-stock = any one ingredient cannot cover the demand. |
| **Direct stock** (cola, non, suv) | `Ingredient` with `isSelfMenuItem=true` and `selfMenuItemId` pointing back to the menu item | Sale of N decrements the self-ingredient by N. |
| **Untracked** (choy) | Neither recipe nor self-ingredient | Always available; no movement written. |

### Yield (max possible portions)

Derived at read time, **never stored**:

```
yield(menuItem) = floor( min over recipeIngredients of ingredient.currentStock / quantityPerPortion )
                = floor(selfIngredient.currentStock) for direct-stock items
                = null for untracked items
```

The bottleneck ingredient (the `min` argument) is returned alongside the number so admin sees "Sabzi tugayapti, faqat 18 ta palov yetadi".

### Role visibility

- **OWNER / ADMIN**: `GET /api/menu/yield` returns `{ possiblePortions, bottleneckIngredientId, bottleneckIngredientName, bottleneckCurrentStock, bottleneckUnit }` per item. Shown in MenuPage as a per-row badge with traffic-light colors (red 0, amber ≤5, green >5).
- **WAITER / KITCHEN**: see only `effectivelyAvailable: boolean` in `/api/menu`. No numbers leaked.

### Consumption flow

- **Decrement on `addLine`** (and on combo expansion, and on quantity increase delta). Atomic per-ingredient: `UPDATE Ingredient SET currentStock = currentStock - need WHERE id = :id AND currentStock >= :need`. If any single ingredient returns `updateMany count: 0`, the whole order-line transaction rolls back.
- For each touched ingredient, write `IngredientMovement(type=CONSUME, orderLineId, quantity, resultingStock, resultingAvgCost)`.
- **Restore on cancel** only if the canceled line's ticket is still `PENDING`. Mirror logic with `IngredientMovement(type=RESTORE)`. No restore for `IN_PROGRESS`/`READY`/walkout.
- **Quantity convention**: `IngredientMovement.quantity` is always positive. Conservation sum is sign-aware (`CONSUME`/`WASTE`/`STOCKTAKE_DECREASE` → minus; rest → plus).

### Errors

`Errors.OutOfStock(ingredientName, parentDishName?)` → HTTP 409, message `"Sabzi (Palov uchun) yetarli emas"`. Details include `{ ingredientName, parentDishName }`.

### Recipe authoring guard

When upserting a `Recipe`, the service rejects any `ingredientId` whose `parentMenuItemId` does not equal the recipe's `menuItemId`. Prevents cross-dish ingredient pooling at the API level.

### Real-time

- `ingredient:stockChanged { ingredientId }` — fired from consume, restore, purchase, waste, stocktake. Emitted to `admin` room.
- Renderer/mobile invalidate `['ingredients']`, `['menu', 'clients']`, `['yield']` on receipt.
- Old `stock:changed` event removed.

### What's gone

- `DailyStock` table and the daily-reset semantics — removed entirely.
- `MenuItem.trackStock` — removed; tracking is implied by recipe-vs-self-vs-neither.
- `DAILY_STOCK_SET`, `DAILY_STOCK_ADJUSTED` audit actions — removed.
- `/api/stock/*` routes, `stockService`, `dailyStockRepo`, `StockPage.tsx` — all deleted.

## Receipts and printer

- Two receipt types in v1: `KITCHEN_TICKET`, `BILL`. Plus `BILL_REPRINT`, `TICKET_REPRINT`.
- 1 admin printer (required, used for bills). 1 kitchen printer (optional, per-installation).
- C++ binary `receipt.exe` is a child process spawned per print via `execFile`. NOT a long-running service. NOT HTTP.
- Node-side serialization mutex (`p-queue` with `concurrency: 1`) prevents simultaneous spawns colliding on the printer.
- Bill printing is BLOCKING: failure rolls back the approval transaction.
- Kitchen ticket printing is NON-BLOCKING: kitchen display is the source of truth, printer is optional backup. Failure is logged to `PrintJob`, doesn't fail the request.
- Reprint allowed for both, audit-logged.
- All print attempts logged in `PrintJob` table.
- Receipt language: Uzbek. Heading, "Buyurtma", "Stol", "Jami", "Chegirma", "Umumiy", footer "Xaridingiz uchun rahmat!".

## Real-time

- WebSocket via `socket.io`. Mounted on the same HTTP server, default `/socket.io` path.
- Rooms: `kitchen`, `admin`, `waiter:{userId}`. Server joins clients to rooms based on role at handshake time.
- Sockets are notification-only. Payloads are minimal (`{ id }` style). Clients re-fetch via REST after every socket event to get actual data.
- Server keeps NO event buffer. On reconnect, clients re-fetch the relevant active state via REST.
- Authentication at socket handshake: `auth: { token }` validated against `Session` table.

## Network resilience

- Hard-fail on Wi-Fi loss for all clients. No offline queue, no draft caching beyond what the server holds.
- Connection indicator banner in every client (green/red).
- Mutation buttons disabled when offline.
- WebSocket auto-reconnect via socket.io's built-in backoff.
- Master Electron app auto-starts on Windows boot.
- PostgreSQL runs as a Windows service (default install).

## Auth

- **Owner / Admin / Kitchen**: username + password. bcryptjs hashing (cost 10).
- **Waiter**: 4-digit PIN. bcryptjs hashing (same cost).
- DB-backed session tokens (32-byte base64url). Stored in `Session` table.
- Token lifetime: waiter mobile = 30 days, desktop roles = 8 hours.
- Auth header: `Authorization: Bearer <token>` on every REST request and on socket handshake.
- **Single device per user**: new login deletes existing sessions for that user.
- **Rate limit**: 5 wrong attempts in a row → lock account for 5 minutes. Per-IP rate limit on PIN endpoint to prevent cross-user brute force.
- **PIN strength**: reject sequential (1234, 4321) and trivial (0000, 1111, 2222...). Static blacklist.
- **No JWT**, no refresh tokens, no Passport.js, no auth library. One middleware function, ~20 lines.

## Reports

Reports are owner-only inside the app.

Daily report:

- Order count broken down by `CLOSED`, `CANCELED`, `WALKOUT`.
- Gross food revenue (sum of subtotals of closed orders).
- Total discounts applied.
- Net food revenue (`gross - discounts`).
- Debt sales total for the day.
- Service charges collected (separate from revenue, pass-through to waiters).
- Order payment breakdown: cash total / card total.
- Debt repayment breakdown: cash / card.
- Real cash-in total:
  - order cash
  - order card
  - debt repayments received that day
- Expense totals for the day.
- Expense breakdown by category.
- Sales-based profit:
  - `net sales - expense net`
- Cashflow-based result:
  - `real cash in - expense net`
- Outstanding debt snapshot as of end-of-day.
- Per-waiter breakdown (orders, revenue, service earned).
- Cancellations log.
- Walkouts log.

Monthly report:

- Aggregate totals for the month.
- Day-by-day table.
- Includes monthly debt sales, debt repayments, expenses, sales-based profit, and cashflow-based result.
- No charts.

### Owner Telegram summary

- Owner receives one automatic daily Telegram summary.
- Telegram summary contains:
  - gross sales
  - discounts
  - net sales
  - debt sales
  - real cash-in
  - debt repaid that day
  - daily expenses
  - sales-based profit
  - cashflow-based result
  - service charge
  - canceled and walkout counts
- Telegram sending requires outbound internet from the Master machine.
- No VPS is required in v1.

NOT in v1: top items, hourly distribution, average order value, CSV/PDF export.

## Audit log

- Owner-only screen.
- One `AuditLog` table.
- Tracked actions: `USER_CREATED`, `USER_DEACTIVATED`, `DISCOUNT_CREATED`, `DISCOUNT_EDITED`, `DISCOUNT_DELETED`, `DISCOUNT_APPLIED`, `ORDER_CANCELED`, `WALKOUT_MARKED`, `TABLE_TRANSFERRED`, `RECEIPT_REPRINTED`, `SETTINGS_CHANGED`, `SERVICE_CHARGE_WAIVED`, `DAILY_STOCK_SET`, `DAILY_STOCK_ADJUSTED`, `EXPENSE_CREATED`, `EXPENSE_REVERSED`, `DEBT_CREATED`, `DEBT_PAYMENT_RECORDED`, `DEBT_CLOSED`, `REPORT_SENT`, `REPORT_SEND_FAILED`.
- Paginated, filterable by action / user / date range.

## Multi-tenancy

- Single-tenant. No `Tenant` entity. No `tenantId` columns.
- Codebase is deploy-clonable: per-restaurant config lives in `Settings` table.

## Localization

- Uzbek-only UI. Hardcoded strings (no i18n library).
- UZS currency. No decimals in display. Thousands separator: space (`200 000`).
- Date format: `DD.MM.YYYY HH:MM`.
- UTF-8 throughout. No script enforcement on menu item names (admin can mix Uzbek Latin / Cyrillic Russian / English).

## Stack

- **Backend**: Node.js + Express + TypeScript.
- **Database**: PostgreSQL 16 + Prisma.
- **Real-time**: socket.io.
- **Master UI / Kitchen UI**: Electron + React (Vite) + TypeScript.
- **Mobile**: React Native + Expo (managed workflow). TypeScript.
- **State**: TanStack Query (server state) + Zustand (local global state).
- **Validation**: zod.
- **Hashing**: bcryptjs (NOT bcrypt — avoids native build issues on Windows).
- **HTTP client (mobile + kitchen)**: native `fetch`.
- **Print queue**: `p-queue`.
- **Code organization**: pnpm monorepo. Apps in `apps/`, shared packages in `packages/`.
- **Master ↔ Master UI**: HTTP, not Electron IPC. Master UI is just another HTTP client.
- **OS target**: Windows 10 x64 for Master and Kitchen monoblock. Android 9+ for waiter phones.
- **Network**: single Wi-Fi LAN, Master at static `192.168.1.10:4000`.
