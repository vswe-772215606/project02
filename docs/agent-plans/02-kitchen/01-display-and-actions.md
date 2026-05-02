# Phase 02-kitchen / 01 — Display and actions

**Goal:** kitchen display shows active tickets in real-time. Cooks tap "Boshlash" to mark IN_PROGRESS and "Tayyor" to mark READY. Canceled tickets show a red banner. Note edits update live. Touch-friendly large layout.

**Prerequisites:** `02-kitchen/00-scaffolding.md` complete.

## Read first

- `00-shared/decisions.md`, `00-shared/api-contract.md`, `00-shared/conventions.md`

## Tasks

### 1. Define ticket types

**`apps/kitchen/src/renderer/api/types.ts`** — types matching the `GET /api/kitchen/tickets/active` response:

```ts
export type TicketStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'CANCELED';

export type TicketLine = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  notes: string | null;
  comboGroupId: string | null;
  comboNameSnapshot: string | null;
  isCanceled: boolean;
};

export type Ticket = {
  id: string;
  orderId: string;
  status: TicketStatus;
  startedAt: string | null;
  readyAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  order: {
    id: string;
    orderType: 'DINE_IN' | 'TAKEAWAY';
    table: { id: string; name: string } | null;
    waiter: { id: string; fullName: string };
  };
  lines: TicketLine[];
};
```

Update `kitchenApi` in `api/kitchen.ts` to use `Ticket[]` and `Ticket` types instead of `unknown`.

### 2. Build the TicketCard component

**`apps/kitchen/src/renderer/components/TicketCard.tsx`**

A large card showing one ticket. Includes:

- Header: table name (large), waiter name, time elapsed since `createdAt` (auto-updating).
- Status badge: PENDING (gray), IN_PROGRESS (yellow), READY (green), CANCELED (red).
- Items list: each line shows quantity × name on one line, notes on the next line in italic if present.
- Combo grouping: lines with the same `comboGroupId` are grouped under a small header showing the combo name.
- Action buttons:
  - PENDING → big "Boshlash" button (calls `setStatus(id, 'IN_PROGRESS')`).
  - IN_PROGRESS → big "Tayyor" button (calls `setStatus(id, 'READY')`).
  - READY → no button (card disappears from active list automatically since "active" = PENDING/IN_PROGRESS only).
  - CANCELED → red banner overlay "BEKOR QILINDI" + "Tushundim" button to dismiss (just hides locally; ticket remains canceled in DB).

Touch-first sizing: card min-height 220px, buttons min-height 80px, font-size 22px+ for items.

### 3. Build the KitchenDisplayPage

Replace the placeholder from phase 00.

**`apps/kitchen/src/renderer/pages/KitchenDisplayPage.tsx`**

Layout:

- Top bar: title, connection indicator, logout, current time (HH:MM, auto-updating).
- Body: grid of `TicketCard`s (3 columns on a large screen, 2 on smaller).
- Empty state: "Hozircha buyurtmalar yo'q" centered.

Data:

```ts
const { data: tickets } = useQuery({
  queryKey: ['kitchen', 'tickets'],
  queryFn: () => kitchenApi.listActive(),
});
```

Socket events from `useSocket` already invalidate `['kitchen', 'tickets']` (set up in scaffolding phase). When a `ticket:new` arrives → refetch. When `ticket:statusChanged` → refetch.

Sort tickets by `createdAt` ascending (oldest first — FIFO kitchen order).

### 4. Cancel banner handling

When a `ticket:canceled` event arrives, the ticket's `status` becomes CANCELED in the next refetch. The TicketCard renders the red CANCELED banner. Cook taps "Tushundim" → the card hides locally (kept in a small Zustand `dismissedTicketIds: Set<string>`).

When the canceled ticket is no longer in the active list (because IN_PROGRESS or READY tickets cycle out), it disappears naturally.

### 5. Reprint button (optional, polish)

Add a small "Qayta chop etish" button on each card that calls `kitchenApi.reprint(ticketId)`. Useful when paper jams. Only visible if `kitchen_printer_enabled` setting is true — but querying settings on every render is wasteful, so just always show it; if printer isn't configured, the API returns 200 with no-op (per phase 04 behavior).

### 6. Audio cue (optional polish, low priority)

When a new ticket arrives, play a short beep so cooks notice without staring at the screen. Use the Web Audio API with a generated tone — no audio files needed.

```ts
function beep() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.frequency.value = 880;
  osc.connect(ctx.destination);
  osc.start();
  setTimeout(() => { osc.stop(); ctx.close(); }, 200);
}
```

Hook it: in `useSocket`, on `ticket:new`, call `beep()`.

## Constraints

- No new backend changes. All endpoints already exist.
- Touch-friendly sizing throughout.
- Don't add a "history" view in this phase. Cooks see only active tickets.
- Don't add per-line completion (mark individual items ready). Whole-ticket only.

## Verification

### V1. Typecheck

```sh
pnpm typecheck
```

### V2. End-to-end kitchen flow

1. Master + kitchen running.
2. Use Postman / waiter API to create an order, send to kitchen.
3. Kitchen display shows the ticket within 1 second.
4. Tap "Boshlash" — status updates, button changes to "Tayyor".
5. Tap "Tayyor" — ticket disappears from view.
6. Verify in master DB: ticket status = READY, `readyAt` set.

### V3. Cancellation banner

1. Create order, send.
2. Verify ticket appears on kitchen.
3. Admin cancels order via master UI.
4. Kitchen display shows red CANCELED banner on the card.
5. Tap "Tushundim" — card hides.

### V4. Note edit live

1. Create order with a line, send.
2. Waiter (via API) edits the line's note while still PENDING.
3. Kitchen display shows updated note.

### V5. Multiple tickets

1. Create 5 orders with various items, send all.
2. Kitchen sees 5 cards.
3. Mark them in different states (some PENDING, some IN_PROGRESS, some READY).
4. Verify only PENDING and IN_PROGRESS remain visible.

### V6. Disconnect resilience

1. Have 3 active tickets visible.
2. Stop master backend.
3. Connection banner red.
4. Restart master.
5. Banner green. Tickets re-fetched. State matches DB.

## Definition of done

- [ ] Ticket types defined.
- [ ] TicketCard component built and touch-friendly.
- [ ] KitchenDisplayPage replaces placeholder.
- [ ] Status transitions work (V2).
- [ ] Cancel banner works (V3).
- [ ] Note edits live-update (V4).
- [ ] Reconnect refetch works (V6).
- [ ] Typecheck passes.

Kitchen track is complete. Move to `03-mobile/00-scaffolding.md`.
