# Chayxana POS — Master App Feature Audit (Pre-Kitchen)
Date: 2026-05-02
Status: **UNSTABLE** (8 Bugs Identified)

---

## 1. Auth
- [x] Login as admin / admin123 succeeds: ✅ Works as expected
- [x] Login as owner / owner123 succeeds: ✅ Works as expected
- [x] Login as kitchen / kitchen123: ✅ Works as expected (Backend allows it, though decisions.md says they use Kitchen App)
- [x] Login with PIN 5678 (waiter): ✅ Works as expected (Backend allows it, though decisions.md says they use Mobile App)
- [x] Wrong password 5 times → 6th locks out: ✅ Works as expected
- [x] Single-device kick: ✅ Works as expected
- [x] Logout button works: ✅ Works as expected

## 2. Layout / Sidebar
- [x] Sidebar collapse + expand works: ✅ Works as expected
- [x] All nav items have icons: ✅ Works as expected
- [x] Connection banner: ✅ Works as expected

## 3. Dashboard
- [x] Three counter cards display numbers: ✅ Works as expected
- [x] Numbers are correct: ✅ Works as expected
- [x] Recent activity list shows recent orders: ⚠️ PARTIAL
  - **Reproduction:** Close an order.
  - **Expected:** Closed order appears in activity list.
  - **Actual:** Only active orders (SENT, BILL_REQUESTED, PENDING_PAYMENT) appear.
  - **Suspected file:** `apps/master/src/renderer/pages/DashboardPage.tsx` (uses `ordersApi.list()` which defaults to active).

## 4. Approval Queue
- [x] Empty state when no orders: ✅ Works as expected
- [x] LIVE update within 1 second: ✅ Works as expected
- [x] Click an order → modal opens: ✅ Works as expected
- [x] Discount picker dropdown: ✅ Works as expected
- [x] Service charge waive toggle: ✅ Works as expected
- [x] Approve button: ✅ Works as expected
- [x] Cancel button: ✅ Works as expected

## 5. Orders Page
- [x] Tabs across the top with counts: ✅ Works as expected
- [x] Active tab shows orders with correct fields: ✅ Works as expected
- [x] Click order to expand: ✅ Works as expected
- [x] PENDING_PAYMENT: "Mark Paid" modal: ✅ Works as expected
- [x] PENDING_PAYMENT: "Mark Walkout": ✅ Works as expected
- [x] SENT/BILL_REQUESTED: Cancel works: ✅ Works as expected
- [x] CLOSED/WALKOUT: "Reprint" button: ✅ Works as expected

## 6. Menyu (Menu)
- [x] Categories list: ✅ Works as expected
- [x] Add/Edit/Deactivate Category: ✅ Works as expected
- [x] Items list filtered by category: ✅ Works as expected
- [x] Item form fields: ✅ Works as expected
- [x] Availability toggle (Eye/EyeOff): ✅ Works as expected
- [x] Combos section list: ✅ Works as expected
- [x] Add new combo: ✅ Works as expected
- [x] Edit/Deactivate Combo: ✅ Works as expected

## 7. Stollar (Tables)
- [x] 6 seeded tables visible: ✅ Works as expected
- [x] Add table: ✅ Works as expected
- [x] Edit/Deactivate Table: ✅ Works as expected
- [x] Occupancy indicator: ✅ Works as expected

## 8. Zaxiralar (Stock)
- [x] Page shows tracked items only: ✅ Works as expected
- [x] Item layout: name on top, subtitle below: ✅ Works as expected
- [x] Morning input for first-time: ✅ Works as expected
- [x] Batch buttons after initialization: ✅ Works as expected
- [x] Add batch math: ✅ Works as expected
- [x] Remove batch math: ✅ Works as expected
- [x] Decrement on order: ✅ Works as expected
- [x] Restore on PENDING-cancel: ✅ Works as expected
- [x] NO restore on IN_PROGRESS-cancel: ✅ Works as expected
- [x] Out of stock rejection: ✅ Works as expected

## 9. Foydalanuvchilar (Users)
- [x] List shows seeded users: ✅ Works as expected
- [x] Add user form (conditional fields): ✅ Works as expected
- [x] Trivial PIN rejected client-side: ✅ Works as expected
- [x] Trivial PIN rejected server-side: ✅ Works as expected
- [x] Deactivate user works: ✅ Works as expected
- [x] Show inactive toggle: ✅ Works as expected
- [x] Reactivate works (security checks): ✅ Works as expected
- [x] Cannot deactivate the last active OWNER: ✅ Works as expected

## 10. Chegirmalar (Discounts)
- [x] List shows discounts: ✅ Works as expected
- [x] Add discount form: ✅ Works as expected
- [x] Discount > cap (15%) rejected client-side: ✅ Works as expected
- [x] Discount > cap rejected server-side: ❌ BUG
  - **Reproduction:** `curl -X POST /api/discounts -d '{"value":30, "type":"PERCENT", ...}'`
  - **Expected:** 400 Validation Error.
  - **Actual:** Discount created with 30%.
  - **Suspected file:** `apps/master/src/main/server/services/discount.service.ts`
- [x] Delete/Deactivate discount: ✅ Works as expected
- [x] Show inactive toggle: ✅ Works as expected
- [x] Reactivate works: ✅ Works as expected
- [x] Approval queue's discount picker only shows ACTIVE: ✅ Works as expected

## 11. Sozlamalar (Settings)
- [x] All 7 setting keys visible: ❌ BUG
  - **Reproduction:** Open Settings page.
  - **Expected:** Keys like `max_discount_percent`, `service_charge_amount` visible.
  - **Actual:** Mismatched names (`printer_receipt_name` vs `admin_printer_name`).
  - **Suspected file:** `apps/master/src/renderer/pages/SettingsPage.tsx`
- [x] Money settings editable when owner: ✅ Works as expected
- [x] Save changes: ⚠️ PARTIAL
  - **Expected:** Saves to correct DB keys.
  - **Actual:** Saves to mismatched keys (UI uses `printer_receipt_name`, Backend expects `admin_printer_name`).
- [x] Cache reflects new value: ✅ Works as expected

## 12. Hisobotlar (Reports) — owner-only
- [x] Sidebar item hidden when admin: ✅ Works as expected
- [x] Direct URL /reports returns 403: ⚠️ PARTIAL
  - **Expected:** Error message or redirect.
  - **Actual:** Blank page (UI doesn't handle the 403 gracefully).
  - **Suspected file:** `apps/master/src/renderer/pages/ReportsPage.tsx`
- [x] Daily tab: numbers add up: ✅ Works as expected
- [x] Per-waiter breakdown: ✅ Works as expected
- [x] Cancellations log: ✅ Works as expected
- [x] Walkouts log: ✅ Works as expected
- [x] Monthly tab: aggregate sum: ✅ Works as expected
- [x] Date picker switches data: ✅ Works as expected

## 13. Audit jurnali (Audit) — owner-only
- [x] Sidebar item hidden when admin: ✅ Works as expected
- [x] List shows recent entries with fullName: ✅ Works as expected
- [x] Friendly Uzbek labels: ✅ Works as expected
- [x] Filter by action/user/date: ✅ Works as expected
- [x] Pagination: ✅ Works as expected
- [x] Stock adjustments appear: ✅ Works as expected
- [x] Discount applications appear: ✅ Works as expected
- [x] User deactivation/reactivation appear: ✅ Works as expected

## 14. End-to-end vertical slice
- [x] Run a full waiter flow via API: ❌ BUG
  - **Reproduction:** `curl -X POST /api/orders` with OWNER token.
  - **Expected:** 201 Created.
  - **Actual:** 403 Forbidden.
  - **Suspected file:** `apps/master/src/main/server/routes/orders.routes.ts` (Missing OWNER role in many routes).

## 15. Backend health
- [x] pnpm typecheck passes: ✅ Works as expected
- [x] pnpm simulate-flow passes: ✅ Works as expected
- [x] pnpm dev:master boots: ✅ Works as expected
- [x] curl /api/health returns ok: ✅ Works as expected

---

### Identified Bugs (Consolidated)

| Bug ID | Title | Suspected File(s) | Severity |
|---|---|---|---|
| BUG-6 | Server-side discount cap validation missing | `discount.service.ts` | Medium |
| BUG-7 | OWNER role cannot create or manage order items | `orders.routes.ts` | High |
| BUG-8 | Settings key names mismatch (UI vs Backend) | `SettingsPage.tsx`, `settings.service.ts` | High |
| BUG-9 | Recent activity only shows active orders | `DashboardPage.tsx` | Low |
| BUG-10 | Reports/Audit show blank page on 403 | `ReportsPage.tsx`, `AuditPage.tsx` | Medium |
