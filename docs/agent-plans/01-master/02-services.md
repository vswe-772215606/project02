# Phase 01-master / 02 — Services

**Goal:** implement all business logic as services. Order lifecycle works end-to-end via direct service calls (no HTTP, no UI yet). State transitions are guarded. Bill calculation produces correct totals. Stock decrement and restoration work atomically. A simulation script walks an order from `DRAFT` → `CLOSED` and prints all intermediate states.

**Prerequisites:** `01-master/01-schema-and-repos.md` complete and verified.

**Estimated scope:** large. Services hold the bulk of the system's logic. Expect ~10 service files plus support files (errors, deferred-emit helper, settings cache).

---

## Read these files before starting

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md`
- `docs/agent-plans/00-shared/schema.md` (for reference)
- `docs/agent-plans/00-shared/conventions.md` ← important: error handling, transaction patterns, deferred emit pattern, atomic state transitions

## Context

Services hold the brains of the master backend. They orchestrate repository calls, validate state transitions, run multi-step operations inside Prisma transactions, and prepare events to be broadcast over WebSocket (when sockets are wired in phase 03).

In this phase, sockets do not exist yet. Use a stub `emitToRoom(room, event, payload)` that just `console.log`s. Phase 03 wires the real socket emitter behind the same interface.

After this phase, the system has:

- Full bill calculation (subtotal, discount, service charge, total, with cap validation).
- Order lifecycle service: createDraft, addLine, addCombo, send, requestBill, approve, markPaid, markWalkout, cancel (waiter and admin variants), transfer, edit-note, cancel-line.
- Kitchen service: list active tickets, mark IN_PROGRESS, mark READY.
- Auth service: hashPassword, hashPin, login, loginPin, logout, validateSession.
- Stock service: ensureTodayRow, decrement, restore, setInitial, adjust.
- Discount service: create, edit, list, validateAgainstCap, soft-delete.
- Audit service: log (used by other services).
- Settings service: get/getBool/getInt/set, with in-memory cache.

No HTTP, no Express routes, no controllers. The simulation script exercises everything by calling services directly.

## Tasks

### 1. Add error helpers

**`apps/master/src/main/server/lib/errors.ts`**

Exact contents from `00-shared/conventions.md` "Error handling" section. The `AppError` class plus the `Errors` factory.

### 2. Add deferred-emit infrastructure

**`apps/master/src/main/server/lib/socket-events.ts`**

Stub implementation. Real socket integration comes in phase 03 — keep the API stable.

```ts
import { AsyncLocalStorage } from 'async_hooks';

type DeferredEmit = { room: string; event: string; payload: unknown };
type DeferredAfterCommit = () => void | Promise<void>;
type Bag = { emits: DeferredEmit[]; afterCommit: DeferredAfterCommit[] };

const als = new AsyncLocalStorage<Bag>();

export function withEmitContext<T>(fn: () => Promise<T>): Promise<T> {
  return als.run({ emits: [], afterCommit: [] }, fn);
}

export function deferEmit(room: string, event: string, payload: unknown): void {
  const bag = als.getStore();
  if (!bag) {
    // No active emit context — emit immediately (e.g., from a script)
    emitToRoom(room, event, payload);
    return;
  }
  bag.emits.push({ room, event, payload });
}

export function deferAfterCommit(fn: DeferredAfterCommit): void {
  const bag = als.getStore();
  if (!bag) {
    void fn();
    return;
  }
  bag.afterCommit.push(fn);
}

export async function flushDeferredEmits(): Promise<void> {
  const bag = als.getStore();
  if (!bag) return;
  for (const e of bag.emits) {
    emitToRoom(e.room, e.event, e.payload);
  }
  bag.emits = [];
}

export async function flushAfterCommit(): Promise<void> {
  const bag = als.getStore();
  if (!bag) return;
  for (const fn of bag.afterCommit) {
    try {
      await fn();
    } catch (err) {
      console.error('[afterCommit failed]', err);
    }
  }
  bag.afterCommit = [];
}

// Stub for now. Phase 03 replaces with socket.io emit.
export function emitToRoom(room: string, event: string, payload: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[socket-stub] room=${room} event=${event}`, payload);
  }
}
```

### 3. Implement settings service

**`apps/master/src/main/server/services/settings.service.ts`**

Reads from `Setting` table on startup, caches in memory, exposes typed getters.

```ts
import { settingRepo } from '../repositories/setting.repo';
import { auditService } from './audit.service';

const cache = new Map<string, string>();

export const settingsService = {
  async loadAll(): Promise<void> {
    const all = await settingRepo.findAll();
    cache.clear();
    for (const s of all) cache.set(s.key, s.value);
  },

  get(key: string): string | undefined {
    return cache.get(key);
  },

  getInt(key: string, fallback = 0): number {
    const v = cache.get(key);
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  },

  getBool(key: string): boolean {
    return cache.get(key) === 'true';
  },

  async set(key: string, value: string, actorUserId: string): Promise<void> {
    await settingRepo.upsert(key, value);
    cache.set(key, value);
    await auditService.log({
      userId: actorUserId,
      action: 'SETTINGS_CHANGED',
      entityType: 'Setting',
      entityId: key,
      metadata: { key, value },
    });
  },
};
```

Document that `loadAll()` must be called once at server boot before any service relies on settings.

### 4. Implement audit service

**`apps/master/src/main/server/services/audit.service.ts`**

```ts
import { Prisma } from '@prisma/client';
import { auditRepo } from '../repositories/audit.repo';

type AuditInput = {
  userId: string;
  action: Prisma.AuditLogCreateInput['action'];
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
};

export const auditService = {
  async log(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    await auditRepo.create(
      {
        user: { connect: { id: input.userId } },
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      tx,
    );
  },

  async list(filters: {
    action?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    return auditRepo.list({
      page: 1,
      pageSize: 50,
      ...filters,
    });
  },
};
```

### 5. Implement auth service

**`apps/master/src/main/server/services/auth.service.ts`**

Responsibilities:

- `hashPassword(plain)` and `hashPin(plain)` — bcryptjs cost 10. Reject trivial PINs (0000, 1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888, 9999, 1234, 4321, 1111).
- `login(username, password, deviceLabel?)`:
  - Find user by username; reject if not found, not active, or no `passwordHash` (waiters use PIN).
  - Check lockout: if `lockedUntil > now`, throw `Errors.Locked(lockedUntil)`.
  - Compare bcrypt; on mismatch increment `failedLogins`. If `failedLogins >= 5`, set `lockedUntil = now + 5 min` and throw `Locked`.
  - On match: reset `failedLogins`, delete existing sessions for the user, create new session with random 32-byte base64url token, expiry 8h, return `{ token, user }`.
- `loginPin(pin, deviceLabel?)`:
  - Iterate active waiters that have a `pinHash`. Compare bcrypt against each. (Acceptable at chayxana scale.)
  - Same lockout logic per user.
  - On match: same session-creation flow, but expiry 30 days for waiters.
- `logout(token)`: delete session by token.
- `validateSession(token)`: returns the session with user, or null if expired/missing.

Use `crypto.randomBytes(32).toString('base64url')` for tokens.

### 6. Implement billing service

**`apps/master/src/main/server/services/billing.service.ts`**

Responsibilities:

- `computeTotals(order, opts)` where `order` has loaded `lines` and `opts = { discountId?, serviceChargeWaived }`:
  1. Sum non-canceled lines: `subtotal = sum(line.unitPriceSnapshot * line.quantity)`.
  2. If `discountId` provided, load discount; reject if not active.
  3. Compute `discountAmount`:
     - PERCENT: `subtotal * value / 100`, rounded to nearest integer UZS.
     - FIXED: `min(value, subtotal)` (can't discount below zero).
  4. Validate cap: discount must not exceed `max_discount_percent` of subtotal AND must not exceed `max_discount_amount`. If either cap is exceeded, throw `DiscountCapExceeded` with a message saying which.
  5. `netFood = subtotal - discountAmount`.
  6. `serviceCharge = serviceChargeWaived ? 0 : settingsService.getInt('service_charge_amount')`.
  7. `total = netFood + serviceCharge`.
  8. Return `{ subtotal, discountAmount, serviceCharge, total }` as Decimals (use `Prisma.Decimal` or string-numbers).

All amounts are UZS, no decimals. Use integers throughout the calculation; convert to `Prisma.Decimal` for storage.

### 7. Implement stock service

**`apps/master/src/main/server/services/stock.service.ts`**

Helpers and operations:

- `today()`: returns today's date at midnight (local TZ for the chayxana — for now use server local time; document this).
- `listToday()`: returns `[{ menuItemId, name, initialCount, currentCount, isAvailable }]` for tracked items. For tracked items that don't have a row today yet, return `initialCount: 0, currentCount: 0`.
- `setInitialCounts(entries, actorUserId)`: upsert rows for today, log `DAILY_STOCK_SET` audit per item, emit `stock:changed` per item.
- `adjustCurrent(menuItemId, newCount, actorUserId)`: update today's row, log `DAILY_STOCK_ADJUSTED`, emit `stock:changed`.
- `decrement(menuItemId, quantity, tx)`:
  - If item has `trackStock=false`, no-op.
  - Else atomic decrement on today's row using `dailyStockRepo.decrementAtomic`. If returns count 0, throw `Errors.OutOfStock(itemName)`.
  - Defer-emit `stock:changed`.
- `restore(menuItemId, quantity, tx)`:
  - If item has `trackStock=false`, no-op.
  - Else atomic increment on today's row.
  - Defer-emit `stock:changed`.
- `historyForItem(menuItemId, from, to)`: pass-through to repo.

### 8. Implement discount service

**`apps/master/src/main/server/services/discount.service.ts`**

- `create({ name, type, value }, actorUserId)`: validate against caps before creating. Log `DISCOUNT_CREATED`.
- `update(id, partial, actorUserId)`: re-validate against caps. Log `DISCOUNT_EDITED`.
- `softDelete(id, actorUserId)`: Log `DISCOUNT_DELETED`.
- `list()`: list active.
- `listAll()`: list all (admin view).
- `validateAgainstCap(type, value)`: helper. Returns true or throws.
  - For PERCENT, compare against `max_discount_percent`.
  - For FIXED, compare against `max_discount_amount`.

### 9. Implement menu service

**`apps/master/src/main/server/services/menu.service.ts`**

Wraps `menu.repo` with simple input validation and audit logging where appropriate. Methods:

- `listMenuForClients()`: returns categories with their items, sorted by `displayOrder`. Items include `isAvailable` AND a derived `effectivelyAvailable: boolean` based on the rule in `decisions.md`. (This requires looking up today's `DailyStock` for tracked items.)
- `createCategory(data, actorUserId)`, `updateCategory(id, data, actorUserId)`.
- `createItem(data, actorUserId)`, `updateItem(id, data, actorUserId)`.
- `setItemAvailability(id, isAvailable, actorUserId)` — emits `menu:itemAvailability` event.
- `createCombo(data, actorUserId)`, `updateCombo(id, data, actorUserId)`.

### 10. Implement order service (the big one)

**`apps/master/src/main/server/services/order.service.ts`**

Skeleton from `chayxana-pos-build-plan.md` section 5.4 is the reference. Extend it to cover all operations.

Methods:

- `createDraft({ waiterId, orderType, tableId })`:
  - Validate combinations (DINE_IN must have tableId, TAKEAWAY must not).
  - Validate table exists and is active.
  - `orderRepo.create` with status DRAFT. Catch P2002 (unique partial index) → `Errors.Conflict('Table already has an active order')`.

- `getById(orderId, requestingUser)`:
  - Returns full order DTO. Waiters can only read their own; admins/owner can read all; kitchen can read but typically uses kitchen endpoints.

- `addLine({ orderId, waiterId, menuItemId, quantity, notes? })`:
  - Inside `withEmitContext` and `prisma.$transaction`:
  - Load order. Verify waiter ownership. Verify status is DRAFT, SENT, or BILL_REQUESTED.
  - Load menu item. Verify `isActive` and `isAvailable`.
  - For tracked items: `stockService.decrement(menuItemId, quantity, tx)` — throws OUT_OF_STOCK if zero.
  - Create OrderLine with snapshots (`nameSnapshot = item.name`, `unitPriceSnapshot = item.price`).
  - If order is SENT or BILL_REQUESTED (i.e., this is an add-on):
    - Create new KitchenTicket with status PENDING.
    - Attach line to that ticket via `orderLineRepo.attachToTicket`.
    - `deferEmit('kitchen', 'ticket:new', { ticketId })`.
    - `deferEmit('waiter:'+waiterId, 'ticket:new', { ticketId })`.
    - If status is BILL_REQUESTED: `deferEmit('admin', 'order:updated', { orderId })`.
    - `deferAfterCommit(() => printService.tryPrintKitchenTicket(ticketId))` — print service comes in phase 04, stub this for now with a console.log.
  - Return the line.
  - After transaction: `flushDeferredEmits()`, `flushAfterCommit()`.

- `addCombo({ orderId, waiterId, comboId })`:
  - Load combo with components. Verify active.
  - Generate one `comboGroupId = cuid()`.
  - For each component, repeat the addLine flow (validate availability, decrement stock, create OrderLine with `comboGroupId` and `comboNameSnapshot = combo.name`).
  - All inside the same transaction.
  - If order is past DRAFT, fire ONE new KitchenTicket containing all the combo's lines (not one ticket per line).

- `editLineNote({ orderId, waiterId, lineId, notes })`:
  - Verify waiter ownership of order.
  - Verify line's ticket is null OR ticket status is PENDING. Otherwise throw `IllegalStateTransition`.
  - Update the note.
  - If line is on a ticket: `deferEmit('kitchen', 'ticket:noteEdited', { ticketId, lineId })`.

- `cancelLine({ orderId, requestingUser, lineId, reason? })`:
  - Load order and line.
  - Permission rules:
    - If all order's tickets are PENDING → waiter (own order) or admin can cancel.
    - Otherwise → admin/owner only.
  - Mark line `isCanceled=true`, set canceled fields.
  - If line is on a PENDING ticket: `stockService.restore(line.menuItemId, line.quantity, tx)` for tracked items.
  - If all lines on the ticket are now canceled, mark the ticket itself CANCELED.
  - Audit log `ORDER_CANCELED` with metadata `{ scope: 'line', lineId }`.

- `send({ orderId, waiterId })`:
  - Verify waiter ownership and status DRAFT.
  - Load draft lines (those with `kitchenTicketId: null`).
  - Reject if zero draft lines.
  - Create one KitchenTicket. Attach all draft lines to it.
  - `setStatus(orderId, 'SENT', expectedFrom: 'DRAFT')`.
  - Defer-emit `ticket:new` to kitchen and waiter rooms.
  - Defer-after-commit kitchen-ticket print (stub).

- `transfer({ orderId, requestingUser, newTableId })`:
  - Verify order is non-terminal.
  - Permission: waiter (own order) or admin.
  - Validate new table exists, active, and not occupied (use `tableRepo.findActiveOrderId`).
  - Update order's `tableId`. Catch P2002 if races.
  - Audit log `TABLE_TRANSFERRED` with `{ fromTableId, toTableId }`.
  - Defer-emit `order:transferred` to kitchen, admin, and waiter rooms.

- `requestBill({ orderId, waiterId })`:
  - Verify ownership and status SENT.
  - `setStatus(orderId, 'BILL_REQUESTED', expectedFrom: 'SENT')`.
  - Defer-emit `order:billRequested` to admin room.

- `cancelOrder({ orderId, requestingUser, reason })`:
  - Permission: same rule as cancelLine. If any ticket is past PENDING, only admin/owner can cancel.
  - Status validation: must be DRAFT, SENT, or BILL_REQUESTED. Cannot cancel from PENDING_PAYMENT, CLOSED, WALKOUT, or CANCELED.
  - For each non-canceled line: if its ticket was PENDING, restore stock. Otherwise no restore.
  - Mark all non-canceled lines as canceled.
  - Mark all PENDING tickets as CANCELED (others stay as-is so kitchen sees them as historical).
  - Set order status CANCELED, set `canceledAt`, `cancelReason`.
  - Audit log `ORDER_CANCELED` with `{ orderId, reason }`.
  - Defer-emit `ticket:canceled` to kitchen/waiter rooms for each canceled ticket.

- `approve({ orderId, adminUserId, discountId?, serviceChargeWaived })`:
  - Verify status BILL_REQUESTED.
  - Compute totals via `billingService.computeTotals`.
  - Snapshot totals, set `appliedDiscountId`, `serviceChargeWaived`, `approvedAt`, `approvedById`.
  - **Print bill (BLOCKING)** — call `printService.printBill(order)`. If throws, transaction rolls back. Print service is stubbed in this phase to always succeed (console.log) — phase 04 wires the real binary.
  - On print success, `setStatus(orderId, 'PENDING_PAYMENT', expectedFrom: 'BILL_REQUESTED')`.
  - Audit log `DISCOUNT_APPLIED` if discount was used (with metadata `{ discountId, amountOff }`).
  - Audit log `SERVICE_CHARGE_WAIVED` if waived.
  - Defer-emit `order:approved` to admin and waiter rooms.

- `markPaid({ orderId, adminUserId, payments })`:
  - Verify status PENDING_PAYMENT.
  - Validate payments sum equals `order.totalSnapshot` exactly. Otherwise `PaymentMismatch`.
  - Insert payment rows.
  - Set status CLOSED, `closedAt = now`.
  - Defer-emit `order:closed` to admin and waiter rooms.

- `markWalkout({ orderId, adminUserId, reason })`:
  - Verify status PENDING_PAYMENT.
  - Set status WALKOUT.
  - Audit log `WALKOUT_MARKED` with `{ orderId, amount: totalSnapshot, reason }`.
  - Defer-emit `order:walkout` to admin and waiter rooms.

- `reprintBill({ orderId, requestingUserId, reason? })`:
  - Verify status PENDING_PAYMENT, CLOSED, or WALKOUT (only orders that have been billed).
  - Call `printService.reprintBill(order)`. Stubbed in this phase.
  - Audit log `RECEIPT_REPRINTED`.

### 11. Implement kitchen service

**`apps/master/src/main/server/services/kitchen.service.ts`**

- `listActive()`: returns ticket DTOs for kitchen display.
- `getById(id)`: full ticket DTO.
- `setStatus({ ticketId, kitchenUserId, status })`:
  - Validate transition: PENDING→IN_PROGRESS, IN_PROGRESS→READY. (No backwards transitions.)
  - Use `expectedFrom` guard.
  - On IN_PROGRESS: set `startedAt`. On READY: set `readyAt`.
  - Defer-emit `ticket:statusChanged` to kitchen and to waiter (need to load the order to find waiterId).
- `cancelTicket({ ticketId, adminUserId, reason })`:
  - Used internally by orderService.cancelOrder.
  - Mark ticket CANCELED, set canceledAt.

### 12. Implement print service stub

**`apps/master/src/main/server/services/print.service.ts`**

```ts
// Stub. Real implementation in phase 04.
export const printService = {
  async printBill(order: any /* OrderWithDetails */): Promise<void> {
    console.log(`[print-stub] BILL for order ${order.id} (total=${order.totalSnapshot})`);
  },
  async tryPrintKitchenTicket(ticketId: string): Promise<void> {
    console.log(`[print-stub] KITCHEN_TICKET for ticket ${ticketId}`);
  },
  async reprintBill(order: any): Promise<void> {
    console.log(`[print-stub] BILL_REPRINT for order ${order.id}`);
  },
};
```

The signature is what later phases will keep stable. Real implementation throws `Errors.PrintFailed` on failure; the stub never throws.

### 13. Implement the simulation script

**`apps/master/scripts/simulate-flow.ts`**

A long-running script that:

1. Connects DB, calls `settingsService.loadAll()`.
2. Looks up the seeded waiter, admin, and at least 2 menu items.
3. **Flow A — happy path**:
   - createDraft (DINE_IN, table 1, waiter Botir).
   - addLine (kebab, qty 2).
   - addLine (somsa, qty 1).
   - send.
   - kitchen.setStatus IN_PROGRESS.
   - kitchen.setStatus READY.
   - addLine while SENT (additional kebab, qty 1) → fires new ticket.
   - kitchen.setStatus IN_PROGRESS for second ticket.
   - kitchen.setStatus READY for second ticket.
   - requestBill.
   - addLine while BILL_REQUESTED (a tea) → C3 live bill.
   - kitchen on third ticket ready.
   - approve (no discount, service not waived).
   - markPaid (mixed cash + card).
   - Print final order state.
4. **Flow B — cancellation by waiter (pre-cook)**:
   - createDraft.
   - addLine.
   - send.
   - cancelOrder by waiter → succeeds (ticket was PENDING).
   - Verify stock restored.
5. **Flow C — cancellation by admin (post-cook)**:
   - createDraft.
   - addLine.
   - send.
   - kitchen.setStatus IN_PROGRESS.
   - cancelOrder by waiter → throws `Forbidden` (ticket no longer PENDING).
   - cancelOrder by admin → succeeds.
   - Verify stock NOT restored.
6. **Flow D — walkout**:
   - createDraft → ... → approve → markWalkout.
7. **Flow E — race condition**:
   - Try to createDraft on a table that already has an active order. Expect `Conflict`.
8. **Flow F — discount cap**:
   - Try to create a discount of 30% (above 15% cap). Expect `DiscountCapExceeded`.

Each flow prints `=== Flow X ===` headers and a one-line summary of each step's result. At the end, log "All simulated flows completed successfully" if no errors thrown, otherwise rethrow.

## Constraints

- **No HTTP, no Express, no controllers, no routes.** Pure services.
- **No socket.io.** Use the stub `emitToRoom` from `socket-events.ts`.
- **No real printer.** Use the print service stub.
- **Prisma queries only in repos.** Services compose repos in transactions.
- **Every state-changing update on Order or KitchenTicket uses `expectedFrom` guarding** (atomic state transition pattern from conventions).
- **Every multi-step mutation runs in `prisma.$transaction`.** Defer emits + after-commit work to fire after commit.
- **bcryptjs cost factor 10.**
- **Trivial PINs are rejected at hash time.**
- Do not write tests. The simulation script is the verification.

## Verification gate

### V1. Typecheck

```sh
pnpm typecheck
```

Must pass.

### V2. Simulation runs end to end

```sh
cd apps/master
pnpm tsx scripts/simulate-flow.ts
cd ../..
```

Output must include:

- `=== Flow A ===` headers through `=== Flow F ===`.
- For Flow A, final state: `status: CLOSED`, payments matching the total, audit entries present.
- For Flow B, the canceled order's stock was restored (verifiable by querying `DailyStock` and comparing currentCount to initialCount).
- For Flow C, stock NOT restored.
- For Flow D, status `WALKOUT`.
- For Flow E, the second `createDraft` threw `Conflict`.
- For Flow F, the create discount threw `DiscountCapExceeded`.
- Final line: `All simulated flows completed successfully`.

### V3. Audit log populated

```sql
SELECT action, COUNT(*) FROM "AuditLog" GROUP BY action ORDER BY action;
```

Must show entries for `ORDER_CANCELED`, `WALKOUT_MARKED`, and any other actions exercised in the simulation.

### V4. Data integrity

```sql
-- Verify every closed order has matching payments
SELECT o.id, o."totalSnapshot", COALESCE(SUM(p.amount), 0) AS paid
FROM "Order" o LEFT JOIN "Payment" p ON p."orderId" = o.id
WHERE o.status = 'CLOSED'
GROUP BY o.id, o."totalSnapshot"
HAVING o."totalSnapshot" <> COALESCE(SUM(p.amount), 0);
```

Must return zero rows.

### V5. Master still boots

```sh
pnpm dev:master
```

Renderer still shows the health check success.

## Definition of done

- [ ] All 10 service files exist with the listed methods.
- [ ] `lib/socket-events.ts` deferred-emit infrastructure in place.
- [ ] `lib/errors.ts` `AppError` and `Errors` factory in place.
- [ ] `services/print.service.ts` stub in place with stable signatures.
- [ ] `scripts/simulate-flow.ts` runs all 6 flows and prints success.
- [ ] Audit log shows entries from the simulation.
- [ ] Payment integrity query returns no mismatched rows.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm dev:master` still boots.

When all are checked, stop. Wait for human approval before phase `01-master/03-api-and-auth.md`.
