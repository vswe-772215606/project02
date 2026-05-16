# PRD 12 — Network partition / degraded UX

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Architecture / UX (offline tolerance, action queueing, mobile + kitchen)
- **Related code:** `apps/mobile/src/api/client.ts`, `apps/mobile/src/hooks/useSocket.ts`, `apps/kitchen/src/renderer/api/client.ts`, `apps/kitchen/src/renderer/hooks/useSocket.ts`, `apps/master/src/main/server/socket.ts`
- **Related docs:** `docs/NETWORK_AUDIT.md`, `docs/agent-plans/00-shared/decisions.md` (§"Communication Protocols"), `docs/SESSION_HANDOFF_2026-05-05.md` §3

---

## 1. Context

The Chayxana POS clients (Waiter Mobile, Kitchen Display) talk to Master over the LAN. The Network Audit (2026-05-05) thoroughly characterised the *configuration* layer (where the URL comes from, what gets persisted) and led to substantial fixes (Phases 1 + 2 complete; client-side setup screens, the 5-state connection vocabulary `connecting / online / reconnecting / auth-failed / unreachable`).

What it **did not specify** is what the client should *do* with stale data and pending user actions during the unreachable state. The current behaviour, derived from the audit and the code:

- **Mobile**: on `connect_error`, the connection store flips to `unreachable`. TanStack Query caches keep showing stale data. New mutations fail with a network error and surface a toast. There is **no action-queue** — if a waiter tries to add a line while offline, the line is lost.
- **Kitchen**: same. The kitchen display shows the last set of tickets. New `ticket:new` events from Master are missed. When the socket reconnects, kitchen relies on the next manual refresh (or a query refetch on socket connect — partial) to resync.
- **Master**: agnostic. It serves requests when it can; clients deal with their own disconnections.

Concrete operational symptoms:

- Wi-Fi flap of 10 seconds during peak: waiters lose their place. Items they typed during the gap are gone.
- Kitchen socket reconnects: the kitchen display has been showing stale "PENDING" tickets that have actually been canceled. Cook hears "Boshlash" but the order is gone.
- Add-item-while-offline: TanStack Query mutation fires, master is unreachable, error toast appears, the input field is cleared. Waiter retypes.

The PRD is to specify a **degraded-mode contract**:

1. What's visibly stale to the user when offline?
2. What user actions can be queued? Which must fail loudly?
3. How does recovery work — automatic refetch, manual refresh, both?

This is mostly a UX contract with small server-side support for idempotency on retried mutations.

## 2. Goals / Non-goals

### Goals

- Specify which client surfaces show **explicit stale indicators** during disconnection.
- Decide which mutations may be **queued and retried** on reconnect, and which must fail loudly.
- Define **idempotency keys** for the queueable mutations so retry-on-reconnect doesn't double-add lines.
- Specify how **socket reconnection** triggers cache invalidation (the audit-fixed flow is partial; we need the contract).
- Keep the offline window short and the system honest. Don't pretend to be online.

### Non-goals

- Real offline-first architecture (sync engines, CRDTs, conflict resolution). Out of scope; v1 LAN is not built for it.
- Multi-master / replicated server architecture. Out of scope.
- Background sync after process death (mobile killed by OS, restart). Pending queues are lost. Acceptable for v1.

## 3. Current state (code-grounded)

| Concern | File / lines | Behaviour |
|---|---|---|
| Mobile connection store | `apps/mobile/src/stores/connection.store.ts` (existence inferred from audit) | 5-state vocabulary. |
| Mobile API client | `apps/mobile/src/api/client.ts:22-29` | `fetch(...)`; on 401 calls unauthorized handler. On network error, throws. |
| Mobile socket | `apps/mobile/src/hooks/useSocket.ts:27-36` | `io(masterUrl, { auth: { token }, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 5000 })`. `connect_error` flips store offline. |
| Kitchen API client | `apps/kitchen/src/renderer/api/client.ts:13-20` | Same shape as mobile. |
| Kitchen socket | `apps/kitchen/src/renderer/hooks/useSocket.ts:49-58` | Same shape as mobile. |
| TanStack Query | Both | Default config; no offline persistence; mutations don't auto-retry on reconnect. |
| Idempotency at server | None | Master's mutation endpoints have no idempotency-key handling. Retrying a "create order line" mutation duplicates the line. |
| Refetch-on-reconnect | Partial | Some queries invalidated; not a universal contract. |

### Behaviour gaps

- No action queue. Offline mutations are lost.
- No idempotency. Retried mutations duplicate.
- No "this data is X seconds stale" indicator on the screen.
- Kitchen ticket list doesn't always rebuild on reconnect (the audit's BUG-K2 was related).
- Mobile draft is server-persisted, so adding items is *already* a network call; offline = no draft growth. The waiter sees "add failed."

## 4. Options

### Option A — Honest offline: visible state, no queueing, full refetch on reconnect

Don't try to queue user actions. When offline:

- Show a banner: "Aloqa yo'q — qayta urinmoqda" (No connection — retrying).
- All mutation buttons disabled. Toasts say "Aloqa tiklangach qayta urinib ko'ring."
- TanStack Query: on socket reconnect, invalidate everything. Full refetch.
- Each query gets a `lastFetchedAt` tag; the UI shows it on critical screens (e.g., orders list shows "yangilanish: 14:32" so the waiter knows the data is from before the gap).

- **Pros:** simple. Honest. No phantom-write risk.
- **Cons:** waiter loses what they were typing if the gap is mid-action.

### Option B — Limited action queue with idempotency

Queue exactly the highest-friction actions: "add line to order", "send to kitchen", "request bill". Each queued action carries a client-generated idempotency key. On reconnect, the queue replays in order. Server deduplicates by idempotency key (stored in a short-lived table; TTL 1h).

- **Mechanism:**
  - Client generates UUID per intended mutation, stored alongside the action in a Zustand store.
  - On reconnect: drain queue serially, each call carrying `Idempotency-Key: <uuid>` header.
  - Server: middleware checks `IdempotencyKey` table. If exists with same body hash → return cached response. If exists with different body → 409 conflict. If not exists → process + store result.
  - UI: queued items shown with a "yuborilmoqda" (sending) indicator. On success → normal. On conflict → "bu allaqachon yuborilgan" with link to the existing row.
- **Pros:** the waiter's typing survives a 30-second Wi-Fi flap. The cook is not asked to "add a line they already added."
- **Cons:** new server-side machinery. Idempotency-key table needs cleanup. Out-of-order replay could violate state-machine constraints — needs careful handling.

### Option C — Aggressive: full offline-first store

Real offline cache, optimistic updates, sync engine.

- **Pros:** robust to extended outages.
- **Cons:** way out of scope. Rejected.

### Option D — Status quo + better visibility only

Don't add queueing. Just make the offline state more visible and the reconnect refetch more complete.

- **Pros:** small change.
- **Cons:** doesn't solve the "I lost what I was typing" pain.

## 5. Decision matrix

| Dimension | A (honest, no queue) | B (queue + idempotency) | C (full offline) | D (visibility only) |
|---|---|---|---|---|
| Waiter retains typed input across short gaps | No | Yes | Yes | No |
| Phantom-write risk | None | Low (idempotency) | Medium | None |
| Cook sees stale data | Visible (banner) | Visible (banner) | Hidden (sync resolves) | Visible (banner) |
| Server complexity | None | Idempotency middleware + table | Sync server | None |
| Client complexity | Low | Medium | High | Low |
| Effort | S | M | XL | XS |
| Honest about state | Best | Good | Worst (hides drift) | Best |

## 6. Open questions

1. **What's the actual outage duration distribution?** A 200ms blip is fundamentally different from a 5-minute Wi-Fi-router-reboot. If the latter is common, Option B's value is high; if rare, Option A is fine.
2. **Which actions actually need to be queued?** Empirically, "add line" and "send to kitchen" are most painful. "Request bill" is rare. "Cancel order" needs to fail loudly. The choice of queueable set determines complexity.
3. **What happens to the queue if the app is killed?** Mobile OS can kill background apps. Should queued actions persist (AsyncStorage)? Or are they ephemeral (session-only)?
4. **Should kitchen also queue?** Kitchen mutations are "start ticket" and "mark ready" — they're idempotent in the order-state sense (multiple starts collapse). Queueing seems unnecessary; visibility is enough.
5. **Server idempotency cleanup:** 1 hour TTL? 24 hours? Larger TTL = bigger table = slight pressure on SQLite.

## 7. Recommendation

**Option A (honest offline + visible state) as Phase 1**, **promote to Option B (queue with idempotency) only for the two highest-value actions** in Phase 2.

Phased recommendation:

1. **Phase 1 (Option A):** add visible offline banner with state vocabulary, disabled mutation buttons during offline, refetch-on-reconnect for every TanStack Query, `lastFetchedAt` indicators on the orders list and kitchen ticket cards. This eliminates the worst confusion (cook acts on stale data) cheaply.
2. **Phase 2 (Option B for `addLine` and `send`):** introduce idempotency keys on those two endpoints only. Mobile queues just those two. Other actions remain fail-loud.
3. **Phase 3 (optional):** based on observed pain, expand the queueable set.

Single-machine-operator weighting: Option A's banner-and-refetch is the lowest-moving-parts answer that fixes the most-cited symptom (cook seeing stale tickets). Option B adds value for a specific pain (Wi-Fi flap mid-order) at the cost of a real server-side table; defensible but not the first step.

Reject C as out of scope; D loses the typed-input survival benefit; B as the first step is too much infrastructure for an unmeasured problem.

## 8. Rollout

### Phase 1 — honest offline (Option A)

1. **Client banner standardisation** (mobile + kitchen):
   - When connection store is `unreachable` or `reconnecting`, render a non-dismissable top banner: "Aloqa: ulanmoqda…" or "Aloqa yo'q — qayta urinmoqda" with retry-now button.
   - All mutation buttons disabled while not `online`. Toasts on attempted clicks: "Aloqa tiklanmaganda mumkin emas."
   - For consistency, expose this through a single `useConnection()` hook that all action surfaces consult.
2. **Refetch-on-reconnect contract:**
   - On socket `connect` (not `connect_error`), invalidate all active TanStack Query keys. For mobile: orders list, menu items, draft. For kitchen: active tickets, menu availability.
   - Add an integration test: simulate socket drop + reconnect, assert active queries refetch.
3. **`lastFetchedAt` indicator** on key surfaces:
   - Orders list (mobile + admin): small grey timestamp at top.
   - Kitchen active-tickets header: "Oxirgi yangilanish: 14:32".
   - When data is older than 30 seconds and offline, the timestamp turns yellow.
4. **Server-side audit log** for `RECONNECT_RESYNC` event on every socket re-handshake — useful for diagnosing flap rates from logs.
5. **Stuck-ticket sanity check (cross-PRD 01):** on every reconnect, kitchen client should refetch active tickets with a `?since=<lastFetchedAt>` query and re-render. If PRD 01's cascade-on-cancel is in place, this naturally drops zombie tickets.

### Phase 2 — queue + idempotency (Option B, two endpoints)

1. **Server idempotency middleware**:
   - New table `IdempotencyKey { key TEXT PRIMARY KEY, userId, endpoint, requestHashSha256, responseBody, statusCode, createdAt }`.
   - Middleware on `POST /api/orders/:id/lines` and `POST /api/orders/:id/send`: if `Idempotency-Key` header present, look up. Match by key. If found and `requestHashSha256` matches → return cached response. If found but request differs → 409. If not found → store after the handler returns.
   - TTL cleanup: scheduler job evicts entries older than 1 hour.
2. **Mobile client queue**:
   - Zustand store `pendingActionsStore` with array of `{ idempotencyKey, action: 'ADD_LINE'|'SEND', payload, attempts, lastError }`.
   - On user click while offline: enqueue + return immediate optimistic UI (line shown greyed out with "yuborilmoqda").
   - On `online`: drain queue serially. Success → remove + invalidate. Error → keep + retry with backoff.
   - On app launch: queue is not persisted (session-only) by default. Optional Phase 2.5: persist to AsyncStorage so a killed app retains queue. **Defer unless observed pain.**
3. **UI surfacing**:
   - Mobile order screen: greyed lines with a small spinner for unsent lines.
   - Toast on successful drain: "X ta amal yuborildi."
   - Toast on conflict: "Bu amal allaqachon bajarilgan."

### Phase 3 (optional) — expanded queueable set

- Add `requestBill` and `addCombo` to the queue if Phase 2 reveals demand.
- Cancel order remains fail-loud (it has heavy side effects and the operator should see the failure immediately).

### Observability

- Client-side: count of failed-while-offline actions. Surface in mobile dev menu.
- Server-side: count of `Idempotency-Key` cache hits per day. Surface in owner Telegram weekly summary as "Tarmoq uzilishlari: N kunlik takror so'rovlar."

### Rollback

- Phase 1 is fully reversible. Banner / disabled buttons / refetch logic can be reverted independently.
- Phase 2's server-side middleware is opt-in by header: if mobile stops sending the header, server behaves as before. The `IdempotencyKey` table is additive.

### Cross-references

- **PRD 01 (terminal-state semantics):** the kitchen-reconnect refetch only resolves zombie tickets if the cascade-on-cancel rule is in place server-side. PRD 01 Phase 1 unblocks PRD 12 Phase 1's kitchen story.
- **PRD 03 (print pipeline):** unrelated, but a printer-failure error in a mutation should not be treated as a connection error. UI vocabulary should distinguish.
- **PRD 04 (server/UI separation):** if Master becomes a Windows service, its restart cadence shifts — clients see more reconnects in deployment-day windows. Phase 1's refetch contract matters more.
