# Phase 01-master / 06 — Stock tracking UI

**Goal:** admin can manage daily stock counts from the Master UI. Morning routine: open Stock page, enter today's prepared counts for tracked items, save. During the day: counts decrement automatically as orders come in (already wired in phase 02), and admin can manually adjust if needed. The page displays in real-time as orders deplete the count.

**Prerequisites:** `01-master/05-admin-ui.md` complete and verified.

**Estimated scope:** small. Backend stock service, repos, and API are already done. This phase adds the UI screen and confirms end-to-end flow.

---

## Read these files before starting

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md` ← stock tracking section
- `docs/agent-plans/00-shared/api-contract.md` ← stock endpoints

## Context

Stock tracking was added late in the interview process. The schema (`MenuItem.trackStock` and `DailyStock` table) was included in phase 01. The service (`stock.service.ts`) was implemented in phase 02. The API endpoints were exposed in phase 03. Decrement and restore happen in `orderService.addLine` and `cancelLine` already.

What's missing: the **admin-facing UI** to set morning counts and view current counts. This phase adds it.

After this phase, the master is operationally complete except for reports and audit log (next phase).

## Tasks

### 1. Add the Stock page to navigation

Update **`apps/master/src/renderer/components/Layout.tsx`** to include a new sidebar link:

- "Zaxiralar" (Stock) → `/stock`

Order it between "Menyu" and "Stollar".

### 2. Build the stock page

**`apps/master/src/renderer/pages/StockPage.tsx`**

Layout: a single table-style list of all tracked items (`MenuItem` where `trackStock = true`). Each row shows:

- Item name.
- Initial count (today's). Editable.
- Current count (today's). Editable separately.
- A small badge showing how many were "consumed" today: `initialCount - currentCount`.
- Manual override buttons:
  - "+5" / "+10" / "+20" quick-add buttons (if a fresh batch was prepped).
  - "-5" / "-10" buttons (if a batch was thrown out).
- A "Save all" button at the top that submits any changes via `POST /api/stock/today`.

UX rules:

- Editing the initial count and current count are separate operations (different audit reasons).
- The page subscribes to `stock:changed` socket events and updates rows in real-time as orders deplete counts.
- Items with `currentCount === 0` get a red "Tugagan" badge ("Out of stock") on the row.
- Items with `currentCount < 5` get a yellow "Kam qoldi" badge ("Running low").

### 3. Backend method polish (if needed)

Verify `stock.service.ts` is complete. Specifically:

- `setInitialCounts(entries, actorUserId)` — bulk upsert. Each entry creates or updates today's row. Logs `DAILY_STOCK_SET` audit per entry. Emits `stock:changed` per entry.
- `adjustCurrent(menuItemId, newCount, actorUserId)` — updates today's row. Logs `DAILY_STOCK_ADJUSTED`. Emits `stock:changed`.
- `listToday()` — returns rows for ALL tracked items, even those without a row today (returning zero counts).

If any are missing or incorrect, add/fix them now.

### 4. Waiter app stock indicator (preparation)

The waiter mobile app (phase 03-mobile) will show "X qoldi" (X left) badges on menu items. The data comes from `GET /api/stock/today`. No work in master needed for this — the API already supports it.

But ensure: when admin toggles `trackStock` on a menu item via Menu page (`PATCH /api/menu/items/:id`), the menu refresh broadcasts a `menu:itemAvailability` event so all clients re-fetch the menu and pick up the change. Verify in code review.

### 5. Update the menu list response

`menuService.listMenuForClients()` should include the **effective availability** per item. Right now it might just be returning `isAvailable`. Update so the response shape includes:

```ts
{
  id, name, price, ...,
  isAvailable: boolean,
  trackStock: boolean,
  todayCurrentCount: number | null,  // null if not tracked
  effectivelyAvailable: boolean,     // computed: isAvailable && (!trackStock || todayCurrentCount > 0)
}
```

This way the waiter app can show "X left" hints without making extra requests.

Wire it: in `menuService.listMenuForClients()`, fetch all `DailyStock` rows for today in one query, build a map by menuItemId, then map menu items to include the count and effective availability.

### 6. Stock decrement validation in addLine

Already wired in phase 02 — verify it's still correct:

- `orderService.addLine` calls `stockService.decrement` inside the transaction.
- For tracked items only.
- Atomic decrement via `dailyStockRepo.decrementAtomic` — fails if `currentCount < quantity`.
- On failure, throws `OUT_OF_STOCK`.

Add a defensive check too: if a tracked item has no `DailyStock` row for today (admin forgot to set counts), throw `OUT_OF_STOCK` with a helpful message ("Bu mahsulot uchun bugungi zaxira belgilanmagan" — "No stock set for this item today").

### 7. Stock restoration on cancel

Already wired — verify:

- `orderService.cancelLine` and `cancelOrder` restore stock for canceled lines whose ticket was PENDING.
- For lines with no ticket (still in DRAFT), also restore — they were never sent to kitchen, so no waste.
- For lines whose ticket was IN_PROGRESS, READY, or CANCELED — no restoration.

### 8. Admin manual edit logging

When admin uses the StockPage to override a count:

- Setting initial count → `DAILY_STOCK_SET` audit entry with metadata `{ menuItemId, oldInitial, newInitial }`.
- Adjusting current count → `DAILY_STOCK_ADJUSTED` audit entry with metadata `{ menuItemId, oldCount, newCount, reason: "manual_admin_edit" }`.

Verify in service layer.

## Constraints

- Do not change the `DailyStock` schema.
- Do not add a "weekly" or "historical" stock view in this phase. Owner sees history only via reports later (phase 07).
- Do not add automatic refilling logic (e.g., "if count drops below 10, alert"). Save for v2.
- The "Save all" button on StockPage submits in one batch; don't submit on every keystroke.

## Verification gate

### V1. Typecheck

```sh
pnpm typecheck
```

### V2. Stock page renders

Login as admin. Navigate to "Zaxiralar". Page loads showing all tracked items (from seed: kebab, somsa, salatlar) with their counts. Untracked items (plov, choy, non) are NOT shown.

### V3. Set morning counts

Edit initial count for kebab to 120. For somsa to 130. Click "Save all".

Verify:

- Toast or success indicator appears.
- Refreshing the page shows the new counts.
- `AuditLog` has new `DAILY_STOCK_SET` entries.
- Other clients (e.g., waiter app once it's built) would receive `stock:changed`.

### V4. Decrement on order

Login as waiter via Postman/curl. Create order with 3 kebabs. Send.

Refresh StockPage. Kebab `currentCount` should now be 117. Status bar in StockPage should show "Bugun sotilgan: 3" or similar consumed-count indicator.

### V5. Real-time update

With StockPage open, run another waiter order via Postman that adds 5 more kebabs. Watch the page — the count should drop from 117 to 112 within a second or two without manual refresh (socket-driven).

### V6. Block at zero

Set kebab count to 2. Try to create an order with 3 kebabs. API returns `OUT_OF_STOCK`.

Try with 2 kebabs — succeeds. Now try to add 1 more — `OUT_OF_STOCK`. Count is 0.

### V7. Restoration on PENDING cancel

Create order with 3 kebabs (count drops 110 → 107). Don't send to kitchen — cancel from DRAFT. Verify count restores to 110.

Create order with 2 kebabs and SEND. Kitchen ticket is PENDING (no one tapped "start cooking"). Cancel as admin. Verify count restores.

Create order with 2 kebabs and SEND. Kitchen tapped IN_PROGRESS. Cancel as admin. Verify count does NOT restore.

### V8. Manual override

Open StockPage. Click "+10" on kebab (or directly edit current count). Save. Verify:

- Count updates.
- `AuditLog` has `DAILY_STOCK_ADJUSTED` entry.

### V9. Untracked items unaffected

Create an order with 5 plovs (plov is untracked). No errors. No `DailyStock` row consulted.

### V10. Menu DTO has effective availability

```sh
curl http://localhost:4000/api/menu -H "Authorization: Bearer $TOKEN"
```

Response includes `trackStock`, `todayCurrentCount`, `effectivelyAvailable` for each item.

## Definition of done

- [ ] StockPage exists and is in navigation.
- [ ] Initial count edit + manual adjust work.
- [ ] Real-time `stock:changed` socket updates the page.
- [ ] Decrement on addLine works (V4).
- [ ] Block at zero (V6).
- [ ] Restoration only for PENDING-ticket cancels (V7).
- [ ] Untracked items work normally (V9).
- [ ] Menu DTO includes effective availability info.
- [ ] All audit log entries fire correctly.
- [ ] Typecheck passes.

When all are checked, stop. Wait for human approval before phase `01-master/07-reports-and-audit.md`.
