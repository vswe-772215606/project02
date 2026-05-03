# Chayxana POS — Kitchen App Feature Audit
Date: 2026-05-03
Status: **UNSTABLE** (4 Bugs Identified)

---

## 1. Auth and connection
- [x] Cold start: kitchen app launches, login page renders: ✅ Works as expected
- [x] Login with kitchen1/kitchen123 → succeeds, display loads: ✅ Works as expected
- [x] Connection banner: green when connected, red when master is down: ✅ Works as expected
- [x] Stop master mid-session → banner red within 5 sec: ✅ Works as expected
- [x] Restart master → banner green, ticket list refreshes automatically: ✅ Works as expected
- [x] Login with admin/admin123 from kitchen app: ✅ Succeeds
- [x] Login with owner/owner123 from kitchen app: ✅ Succeeds
- [x] Login with wrong password 5 times → 6th attempt locks out: ✅ Works as expected (Master-side enforcement)
- [x] Logout button works, returns to login: ✅ Works as expected

## 2. Display layout
- [x] Empty state when no tickets: ✅ Friendly message shown
- [x] Top bar: title, connection indicator, current time auto-updating, logout: ✅ Works as expected
- [x] Touch sizing: buttons at least 64px tall: ✅ Buttons are 80px tall
- [x] Font readable from 1.5m away: ✅ Base font 18px, bold text used for items
- [x] Window opens fullscreen in production mode: ✅ Configured in main process

## 3. Real-time ticket arrival
- [x] From master, owner creates order at table, adds items, sends to kitchen → ticket appears within 1 second: ✅ Works as expected
- [x] Order has multiple items → ticket shows all items with quantities: ✅ Works as expected
- [x] Items with notes → notes display below item name in italic: ✅ Works as expected
- [x] Items in same comboGroupId → grouped under combo name header: ⚠️ Unable to verify due to BUG-K3
- [x] Audio beep plays on new ticket arrival: ✅ Works as expected
- [x] Ticket card shows: table name, waiter name, time elapsed since createdAt: ✅ Works as expected
- [x] Time elapsed updates live: ✅ Works as expected

## 4. Status transitions
- [x] PENDING ticket has "Boshlash" button visible: ✅ Works as expected
- [x] Tap "Boshlash" → status updates locally, button changes to "Tayyor": ✅ Works as expected
- [x] Master UI sees the IN_PROGRESS status: ✅ Works as expected
- [x] Tap "Tayyor" → ticket disappears from active list: ✅ Works as expected
- [x] After tapping ready, the ticket is gone from THIS kitchen display: ✅ Works as expected
- [x] If a second kitchen monoblock were watching, it would also see the disappearance: ✅ Verified via API

## 5. Add-on tickets
- [ ] While order is SENT, waiter (via API) adds a new item → new kitchen ticket appears: ❌ **FAILED** (See BUG-K1)
- [x] Original ticket still shows only original items: ✅ Works as expected
- [ ] New ticket has just the added item: ❌ **FAILED** (See BUG-K1)

## 6. Cancellation flow
- [x] Admin cancels an order with active kitchen ticket → red BEKOR QILINDI banner appears on kitchen card: ✅ Works as expected
- [x] "Tushundim" button hides the canceled card locally: ✅ Works as expected
- [x] Refresh page → canceled tickets that were already past PENDING remain in DB but kitchen page shows only active: ❌ **FAILED** (See BUG-K2)
- [x] Cancel a PENDING ticket → banner appears: ✅ Works as expected
- [x] Cancel an IN_PROGRESS ticket → banner appears, cook acknowledges: ✅ Works as expected

## 7. Note editing
- [x] Waiter edits a note on a PENDING ticket → kitchen display updates within 1 second: ✅ Works as expected
- [x] Edit a note on an IN_PROGRESS ticket via API → master rejects: ✅ Works as expected

## 8. Multi-ticket scenarios
- [x] Send 3 orders in rapid succession → all 3 tickets appear, sorted by createdAt ascending: ✅ Works as expected
- [x] Mark them in different states: only PENDING + IN_PROGRESS visible: ✅ Works as expected
- [x] Mark all 3 ready → display goes to empty state: ✅ Works as expected

## 9. Race conditions
- [x] Two windows tapping "Boshlash" simultaneously: ✅ Handled by atomic DB update (one succeeds, other fails)
- [x] While kitchen has IN_PROGRESS, admin cancels the order. Cook taps "Tayyor": ❌ **FAILED** (See BUG-K4)

## 10. Disconnect resilience
- [x] Restart master → Kitchen reconnects. Tickets refetch: ✅ Works as expected
- [x] While kitchen is disconnected, tap "Boshlash" → should fail gracefully: ✅ Fails with API error

## 11. Stock and menu sync
- [x] Admin changes a menu item's availability → kitchen receives menu:itemAvailability event: ✅ Received, but kitchen UI currently ignores it (as designed)
- [x] Stock change via order → kitchen doesn't crash on receiving event: ✅ Works as expected

## 12. Kitchen printer
- [x] kitchen_printer_enabled is false by default. No KITCHEN_TICKET PrintJobs created: ✅ Works as expected

## 13. Performance
- [x] Scrolling smooth, no jank: ✅ Verified
- [x] Adding more tickets doesn't slow down the page: ✅ Verified

## 14. Backend health
- [x] pnpm typecheck passes for kitchen + master: ✅ Passes
- [x] Master simulate-flow.ts still passes: ✅ Passes

---

## Bug Reports

| ID | Title | Reproduction | Expected vs Actual | Suspected File |
|:---|:---|:---|:---|:---|
| BUG-K1 | Add-on items cannot be sent to kitchen | 1. Create order 2. Add item 3. Send 4. Add another item 5. Send again | Expected: New ticket created. Actual: `ILLEGAL_STATE` error (Cannot transition from SENT to SENT). | `order.service.ts` |
| BUG-K2 | Canceled tickets leak in active list | 1. Send order to kitchen 2. Cancel order from admin 3. Refresh kitchen page | Expected: Ticket removed from active list. Actual: Ticket remains in active list because its own status is still `PENDING`/`IN_PROGRESS`. | `order.service.ts`, `kitchenRepo.ts` |
| BUG-K3 | Adding combo to order fails | 1. Create order 2. Add combo (e.g., Lunch Set) | Expected: Order lines created for combo components. Actual: `INTERNAL` server error. | `order.service.ts` (field name mismatch) |
| BUG-K4 | Cook can mark ticket READY after order CANCELED | 1. Ticket is IN_PROGRESS 2. Admin cancels order 3. Cook taps "Tayyor" | Expected: Error or no-op due to order status. Actual: Ticket marked as READY (Stock was already restored during cancel). | `order.service.ts`, `kitchen.service.ts` |
