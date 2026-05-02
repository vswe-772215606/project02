# Phase 03-mobile / 02 — Order flow

**Goal:** waiter can do the core job: pick a table, browse menu, build an order, edit notes, send to kitchen, see status update live as kitchen works through tickets.

**Prerequisites:** `03-mobile/01-pin-login.md`.

## Read first

- `00-shared/decisions.md`, `00-shared/api-contract.md`

## Context

This is the heart of the mobile app. After this phase the waiter app is fully functional from order creation through kitchen status updates. The bill/walkout/payment flows from the waiter side are tiny (just "Request Bill" button) — phase 03 adds them.

## Tasks

### 1. Implement remaining endpoint clients

Fill in the stubs from scaffolding:

**`apps/mobile/src/api/menu.ts`** — `listMenu()` returns `{ categories: [...with items] }`.

**`apps/mobile/src/api/tables.ts`** — `listTables()` returns `[{ id, name, type, activeOrderId }]`.

**`apps/mobile/src/api/orders.ts`** — full CRUD: `list({ mine: true })`, `getById(id)`, `create({ orderType, tableId? })`, `addItem(orderId, { menuItemId, quantity, notes? })`, `addCombo(orderId, { comboId })`, `editLineNote(orderId, lineId, notes)`, `cancelLine(orderId, lineId, reason?)`, `send(orderId)`, `transfer(orderId, tableId)`, `requestBill(orderId)`, `cancel(orderId, reason)`.

**`apps/mobile/src/api/stock.ts`** — `getToday()` returns `[{ menuItemId, currentCount }]`. Used to show "X qoldi" on items.

### 2. Replace HomeScreen with real content

The home screen now lists the waiter's active orders. From here, waiter either:

- Taps "+ Yangi buyurtma" to start a new order → NewOrderScreen.
- Taps an existing order to open its details → OrderEditScreen.

Active orders = those in `DRAFT`, `SENT`, or `BILL_REQUESTED`. Filter in the query: `useQuery({ queryKey: ['orders', 'mine'], queryFn: () => ordersApi.list({ mine: true }) })` then filter active client-side, OR add `?status=` query support to the backend.

Each row shows: table name (or "Olib ketish"), short ID, status badge, item count, time elapsed.

### 3. Build NewOrderScreen

Two steps:

**Step A — Order type:** big buttons "Zalda" and "Olib ketish" (Dine-in / Takeaway).

**Step B — Table picker (only if Zalda):**

- Grid of tiles. Each tile shows table name and an occupancy indicator.
- Tiles for occupied tables (where `activeOrderId` is set) are grayed out and not tappable.
- Tap a free table → `ordersApi.create({ orderType: 'DINE_IN', tableId })` → navigate to OrderEditScreen with the new order ID.

If TAKEAWAY: skip step B, immediately `create({ orderType: 'TAKEAWAY' })` → OrderEditScreen.

### 4. Build OrderEditScreen

The most complex screen. Layout:

- Top: order summary bar — table name, status badge, total so far.
- Middle: list of order lines (current items in the order). Each line shows quantity × name, unit price × qty = total, optional note (italic small text below).
  - Lines with `kitchenTicketId` (already sent to kitchen) get a status badge: PENDING (waiting), IN_PROGRESS (cooking), READY (ready to pick up).
  - Tap a line → opens line actions modal: "Eslatma qo'shish/o'zgartirish" (add/edit note), "Bekor qilish" (cancel — if allowed by current ticket state).
- Bottom: large action buttons depending on order status:
  - DRAFT: "Menyu" (open menu to add items) + "Yuborish" (send to kitchen, disabled if 0 lines).
  - SENT: "Menyu" (add more items) + "Hisob so'rash" (request bill).
  - BILL_REQUESTED: "Menyu" (still can add) + status text "Hisob tasdiqlanishi kutilmoqda".
  - PENDING_PAYMENT and beyond: read-only — just show "Hisob bajarilmoqda".

Live updates via socket invalidation (already wired in `useSocket`). When `ticket:statusChanged` arrives, the order's lines refetch and badges update.

### 5. Build MenuScreen (modal/sub-screen)

Triggered from OrderEditScreen's "Menyu" button. Could be a stack push or modal:

- Top: tabs/categories (horizontally scrollable). Active category highlighted.
- Middle: grid (or list) of menu items in the active category. Each item card shows:
  - Name.
  - Price.
  - "X qoldi" badge for tracked items (read from `stockApi.getToday()`).
  - Grayed out + "Yo'q" overlay if `effectivelyAvailable === false`.
- Tap an item → quantity picker modal (default 1, +/- buttons, optional notes field) → "Qo'shish" button → `ordersApi.addItem(orderId, { menuItemId, quantity, notes })` → toast confirmation.
- Combos section at the top of the category list (or a separate "Set menyular" tab). Tap a combo → confirm → `ordersApi.addCombo(orderId, { comboId })`.

Stock badge updates live via socket (`stock:changed`).

When user backs out of MenuScreen, returns to OrderEditScreen which now shows the new lines.

### 6. Cancellation flow

In OrderEditScreen, a "..." menu (top-right) with "Buyurtmani bekor qilish":

- If all kitchen tickets on the order are PENDING (or no tickets yet), waiter can cancel directly. Confirm with reason input → `ordersApi.cancel(orderId, reason)`.
- If any ticket is past PENDING, button is disabled with tooltip "Adminni chaqiring".

Logic: `canCancel = order.kitchenTickets.every(t => t.status === 'PENDING')`. Read order with details — `ordersApi.getById(orderId)` — to check ticket statuses.

### 7. Transfer table

In OrderEditScreen "..." menu: "Stolni o'zgartirish":

- Opens table picker (re-use NewOrderScreen's step B).
- Tap a free table → `ordersApi.transfer(orderId, newTableId)`.
- On success, order updates, top bar shows new table name.

### 8. Sending to kitchen

The "Yuborish" button:

- Disabled if 0 lines.
- On tap: confirm modal "Buyurtmani oshxonaga yuborasizmi?" → `ordersApi.send(orderId)`.
- On success: order state moves to SENT. UI updates. Each line gets a PENDING badge.

### 9. Note editing

Tap a line → modal → "Eslatma" field (multi-line text):

- Save calls `ordersApi.editLineNote(orderId, lineId, notes)`.
- Backend rejects if line's ticket is past PENDING (returns ILLEGAL_STATE). UI shows Uzbek error.
- On success, the line's note updates in-place.

### 10. Stock-out handling

If user tries to add an item that's out of stock, server returns `OUT_OF_STOCK`. Show: "Bu mahsulot tugagan" toast. The menu badge ("X qoldi" → "Yo'q") may not have updated yet on the user's screen due to a race; the menu refetches automatically via socket.

## Constraints

- No offline mode. If `connection.status !== 'online'`, all action buttons disable. Show "Internet ulanmagan" banner across action sections.
- No drag-to-reorder, no fancy animations. Keep simple.
- Use TanStack Query mutations for all writes — `useMutation({ mutationFn, onSuccess: () => qc.invalidateQueries(...) })`.

## Verification

### V1. Typecheck

### V2. Full happy path

1. Login as waiter Botir (PIN 5678).
2. Tap "+ Yangi buyurtma" → "Zalda" → pick Stol 1.
3. OrderEditScreen opens with empty draft.
4. Tap "Menyu" → choose Salatlar tab → tap a salad → +2 quantity → add → returns to OrderEditScreen.
5. Add a few more items.
6. Tap "Yuborish".
7. Kitchen Display (running on another device) shows the ticket within ~1 second.
8. On kitchen: tap "Boshlash" then "Tayyor".
9. On waiter phone: each line shows "Tayyor" green badge.

### V3. Add-on after send

1. From a SENT order, tap "Menyu" again, add another item.
2. Kitchen display shows a NEW ticket (with just the new item), separate from the original.
3. Mark new ticket ready. Verify on phone.

### V4. Note edit

1. Add a line. Tap it → add note "Tuz kam".
2. Send.
3. Kitchen shows the note on the ticket.
4. Try to edit the note while ticket is PENDING — succeeds.
5. Kitchen taps "Boshlash" (IN_PROGRESS).
6. Try to edit note again — fails with Uzbek error.

### V5. Cancel by waiter (pre-cook)

1. Add lines, send. Don't have kitchen tap "Boshlash".
2. Waiter taps "Buyurtmani bekor qilish" → reason → confirm.
3. Order moves to CANCELED. Stock restored for tracked items.

### V6. Cancel locked after kitchen starts

1. Add lines, send.
2. Kitchen taps "Boshlash" (IN_PROGRESS).
3. Waiter tries to cancel — button disabled with tooltip.

### V7. Stock UI

1. Set kebab stock to 5 via admin UI.
2. Open menu on phone — kebab card shows "5 qoldi".
3. Add 3 kebabs to an order. Stock badge updates live to "2 qoldi".
4. Try to add 3 more — error "Bu mahsulot tugagan" (server rejects OUT_OF_STOCK because 3 > 2). UI re-fetches and shows "2 qoldi" still.
5. Add 2 — success. Stock now 0. Menu shows "Yo'q" overlay on kebab.

### V8. Transfer

1. Open order. Tap "..." → "Stolni o'zgartirish".
2. Pick another free table. Confirm.
3. Top bar updates. Kitchen display also updates (table label changes on the ticket).

### V9. Connection banner blocks actions

1. Stop master. Banner red.
2. Tap "Yuborish" or any action button — disabled or error.
3. Restart master. Banner green. Actions work again.

## Definition of done

- [ ] HomeScreen lists active orders.
- [ ] NewOrderScreen + table picker work.
- [ ] OrderEditScreen with line list and ticket status badges.
- [ ] MenuScreen with categories, items, combos, stock badges.
- [ ] Send, request bill, cancel, transfer, edit-note, cancel-line all work.
- [ ] Live updates via socket on every relevant event.
- [ ] Stock-out blocked at API and reflected in UI.
- [ ] All offline scenarios handled (banner + disabled buttons).
- [ ] Typecheck passes.

Move to `03-mobile/03-bill-and-status.md` for the final mobile phase.
