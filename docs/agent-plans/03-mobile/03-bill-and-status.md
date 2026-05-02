# Phase 03-mobile / 03 — Bill and status

**Goal:** waiter sees the bill flow status from their phone. Request bill button works. Live status updates as admin approves, marks paid, marks walkout. Order history view. Final polish before deployment.

**Prerequisites:** `03-mobile/02-order-flow.md`.

## Context

Most of the bill flow lives on the admin side (approval, mark paid). The waiter just needs to:

1. Request bill.
2. Watch status change live.
3. See the final bill amount once approved.
4. View completed orders in a history list.

Short phase. Mostly UI polish.

## Tasks

### 1. Hisob so'rash button

In OrderEditScreen, when status is SENT and at least one line is past PENDING (or all lines are READY), show a prominent "Hisob so'rash" button. Tapping it calls `ordersApi.requestBill(orderId)`.

After request:
- Status changes to BILL_REQUESTED.
- Button replaced with status text "Hisob tasdiqlanishi kutilmoqda" (Waiting for bill approval).

### 2. Bill detail panel

When status is BILL_REQUESTED, PENDING_PAYMENT, CLOSED, WALKOUT — show a bill detail panel below the line list:

- "Jami" — subtotal (sum of lines).
- "Chegirma" — only show if a discount has been applied (status >= PENDING_PAYMENT).
- "Xizmat haqi" — service charge.
- "Umumiy" — total.

Until PENDING_PAYMENT, only subtotal is computable client-side. Show that. Once PENDING_PAYMENT or beyond, server has snapshotted totals — use those.

### 3. Live status display

The status badge at the top of OrderEditScreen reflects current state in big, friendly Uzbek:

- DRAFT → "Qoralama"
- SENT → "Oshxonada"
- BILL_REQUESTED → "Hisob so'raldi"
- PENDING_PAYMENT → "To'lov kutilmoqda"
- CLOSED → "Yopildi" (green)
- WALKOUT → "To'lovsiz ketdi" (red)
- CANCELED → "Bekor qilindi" (red)

When `order:approved` event arrives, status badge changes. When `order:closed` arrives, show a brief "Buyurtma yopildi" toast and the order moves out of the active list.

### 4. Order history screen

Add a tab or accessible link from HomeScreen: "Buyurtmalar tarixi" (Order history).

**`apps/mobile/src/screens/OrderHistoryScreen.tsx`**

Lists the waiter's CLOSED, WALKOUT, and CANCELED orders for today (default) with a date picker to view older days. Each row:

- Date + time.
- Table name (or Olib ketish).
- Total (or — for canceled).
- Status badge.

Tap a row to open OrderEditScreen in read-only mode (lines list, no action buttons).

### 5. End-of-shift summary

Optional polish: at the top of HomeScreen, a small badge:

- "Bugun: 12 buyurtma, 1 240 000 so'm" — count and gross from today's CLOSED orders for this waiter.
- Plus service earned: "Xizmat haqi: 120 000 so'm".

Computed on the client from the same data the report would show. Keep simple — no fancy summary view.

### 6. Polish: empty states

- HomeScreen with 0 active orders: friendly message + big "+ Yangi buyurtma" button centered.
- OrderEditScreen with 0 lines: "Menyu" button highlighted.
- MenuScreen with 0 items in a category: "Bu kategoriyada mahsulotlar yo'q".

### 7. Polish: errors

Build a small `<ErrorAlert />` (RN equivalent) that maps error codes to Uzbek strings:

- `OUT_OF_STOCK`: "Mahsulot tugagan"
- `ITEM_UNAVAILABLE`: "Mahsulot mavjud emas"
- `ILLEGAL_STATE`: "Bu amal hozir bajarib bo'lmaydi"
- `CONFLICT`: "Mojaro yuz berdi, qayta urinib ko'ring"
- `FORBIDDEN`: "Sizda ruxsat yo'q"
- `UNAUTHORIZED`: "Sessiya tugadi, qaytadan kiring"
- `LOCKED`: "Hisob bloklangan"
- default: "Xato yuz berdi"

Use this consistently across all mutations.

### 8. Polish: optimistic UI for read-only updates

For status badge changes from sockets, no optimistic update needed — server is fast. But for adding items, consider optimistic UI:

- On `addItem` mutation, immediately push the new line to the local cache.
- On error, roll back via `qc.invalidateQueries(['orders', orderId])`.

Simple version using TanStack Query's `onMutate` + `onError`. Skip if it complicates things too much.

### 9. Build for production

Once all flows are tested, do a real Android build:

```sh
cd apps/mobile
npx expo prebuild --platform android   # only if EAS Build isn't used
# OR via EAS:
npm install -g eas-cli
eas build --profile preview --platform android
```

The output is an `.apk` file the waiter can install. Document this in `apps/mobile/README.md`.

## Constraints

- No offline queue.
- No fancy animations.
- Order history limited to last 30 days client-side filter — backend already supports date range.
- Don't add a "request again" button if approval was rejected — there's no rejection flow per `decisions.md`.

## Verification

### V1. Typecheck

### V2. Full bill flow

1. Login as waiter, create order, send, kitchen ready.
2. Tap "Hisob so'rash". Status changes to "Hisob so'raldi".
3. On master UI (admin), see the new approval. Apply a discount, approve.
4. On phone: status changes to "To'lov kutilmoqda" within seconds.
5. Bill detail panel now shows the discount line and final total.
6. Admin marks paid.
7. Phone shows "Yopildi" toast. Order moves to history.

### V3. Walkout

Repeat V2 but admin marks walkout instead of paid. Phone shows "To'lovsiz ketdi" status.

### V4. Order history

Open history tab. See today's closed/canceled/walkout orders. Tap one — read-only details show.

### V5. End-of-shift summary

Top of home shows: "Bugun: N buyurtma, X so'm" + service earned. Numbers match what the master daily report shows for this waiter.

### V6. Error mapping

Force a stock-out or other error. UI shows the right Uzbek message.

### V7. Build artifact

`eas build` produces an .apk. Install on a fresh phone. Connect to chayxana Wi-Fi. App works end-to-end.

## Definition of done

- [ ] Bill request button works.
- [ ] Live status updates on bill flow events.
- [ ] Bill detail panel shows totals correctly.
- [ ] Order history screen.
- [ ] Optional: end-of-shift summary.
- [ ] Error mapping consistent across screens.
- [ ] APK produced via EAS Build.
- [ ] Typecheck passes.

**Mobile track is complete. The full v1 system is now built across master, kitchen, and mobile.**

Pre-deployment tasks (handled outside this plan): physical printer testing on the real device, Wi-Fi coverage walk, owner training, daily backup setup, auto-start for master + kitchen Electron apps via Windows Task Scheduler.
