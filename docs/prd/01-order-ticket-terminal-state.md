# PRD 01 — Order & kitchen-ticket terminal-state semantics

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Domain (order lifecycle, kitchen, stock, audit)
- **Related code:** `apps/master/src/main/server/services/order.service.ts`, `…/services/kitchen.service.ts`, `…/repositories/order.repo.ts`, `…/repositories/kitchen.repo.ts`
- **Related docs:** `docs/agent-plans/00-shared/decisions.md` (§ "Order lifecycle"), `docs/KITCHEN_AUDIT.md` (BUG-K1..K4), `docs/AUDIT_REPORT.md`

---

## 1. Context

Chayxana's order has two state machines that interact:

- **Order** statuses: `DRAFT → SENT → BILL_REQUESTED → PENDING_PAYMENT → CLOSED | WALKOUT`, plus `CANCELED` from non-terminal states.
- **KitchenTicket** statuses: `PENDING → IN_PROGRESS → READY`, plus `CANCELED`.

A single order has *many* tickets — `SEND` creates the first ticket; every add-on after `SENT` creates an extra ticket. The Kitchen audit on 2026-05-03 identified four bugs (K1–K4) that all stem from the same root: the order state machine and the per-ticket state machine were modelled and enforced independently. The bugs were patched (per `SESSION_HANDOFF_2026-05-05.md`), but the underlying composition rule was never written down. New code keeps re-discovering "what should happen to the ticket when the order goes X" by reading the surrounding service file.

Today's behaviour, derived from `order.service.ts:612-668` (cancelOrder) and `kitchen.service.ts:21-74` (setStatus):

- Cancelling an order marks **only `PENDING`** tickets as `CANCELED`. Tickets in `IN_PROGRESS` are left as-is — the cook has already started cooking, so the work item is "in flight."
- Stock is restored only for lines whose ticket was `null` or `PENDING` at the time of cancel (`maybeRestoreLineStock` at `order.service.ts:153-161`).
- `kitchen.service.setStatus` (lines 32-35) explicitly **rejects** ticket transitions when the order is in a terminal status (`CANCELED | CLOSED | WALKOUT`). This was added to fix BUG-K4.
- The kitchen renderer is expected to surface a red "BEKOR QILINDI" banner when it receives `order:canceled` for an active card. That's a UI-level cleanup, not a server-side guarantee.

The combination works for the happy path but the **semantics are implicit**: there is no single rule that says "what is the lifecycle of a kitchen ticket whose parent order has gone terminal." Specifically:

- An `IN_PROGRESS` ticket whose order was cancelled mid-cook is left in `IN_PROGRESS` forever in the DB. The cook can no longer mark it READY (rejected at `kitchen.service.ts:32-35`), and the order is already closed. So the ticket is **stuck in a state it can never leave**.
- `kitchenRepo.listActive()` filters by ticket status, not by order status (the Audit report and the fix history confirm this was BUG-K2's symptom). A ticket whose order is `CANCELED` but whose own status is still `PENDING`/`IN_PROGRESS` will leak into the active list on refresh. The current mitigation is to immediately mark `PENDING` tickets as `CANCELED` in the cancel path — but `IN_PROGRESS` ones are not touched.
- There is no accounting event for "food was cooked but never sold" — neither in audit, finance, nor stock. Walkouts (which are post-payment-due) don't restore stock either, but at least surface in finance.

This PRD is to **lock down the composition rule** so service code, repositories, and reporting all agree.

## 2. Goals / Non-goals

### Goals

- Specify, in one place, what happens to every `KitchenTicket` row when its parent `Order` transitions to a terminal state (`CANCELED`, `CLOSED`, `WALKOUT`).
- Eliminate the "stuck `IN_PROGRESS` after cancel" leak.
- Define whether cooked-but-unsold food generates an accounting / audit event, and what fields it carries.
- Specify the symmetric rule: how `kitchen.service.setStatus` and `kitchen.service.cancelTicket` interact with order status (today: ad-hoc check at top of `setStatus`).

### Non-goals

- Re-opening the locked decision that **waiters cannot cancel once any ticket is `IN_PROGRESS`** (`decisions.md` says so, and operations agreed). Cancellation *policy* is fixed; this PRD is about *consequences*.
- Changing the order state graph itself (DRAFT → SENT → … is locked).
- Per-line discount / void semantics — that's PRD-13 territory (out of scope this round).
- Walkout's *financial* representation — covered separately in PRD 05.

## 3. Current state (code-grounded)

| Behaviour | File / lines | Note |
|---|---|---|
| Order → CANCELED marks `PENDING` tickets `CANCELED` in same tx | `order.service.ts:632-643` | `IN_PROGRESS` tickets untouched |
| Order → CANCELED restores stock only for `PENDING`/null-ticket lines | `order.service.ts:153-161, 645-648` | `maybeRestoreLineStock` |
| Ticket → `IN_PROGRESS`/`READY` rejected when order status terminal | `kitchen.service.ts:32-35` | Added post-BUG-K4 |
| Ticket cancel does **not** check order status | `kitchen.service.ts:76-83` | Admin can cancel any ticket regardless of parent |
| `kitchenRepo.listActive` filters by **ticket** status only | (not shown — KitchenAudit BUG-K2 was here) | UI relies on real-time `order:canceled` event |
| No `OrderStatus → cooked-loss` audit event | `order.service.ts:649-659` | Audit logs cancel reason, not cooked-line value |
| Order → CLOSED: tickets remain in whatever status they were (typically `READY`) | `order.service.ts:734-788` | Closed orders normally have all tickets READY first |
| Order → WALKOUT: same — tickets untouched | `order.service.ts:790-827` | Walkout happens after `PENDING_PAYMENT`, food was served |

### Implicit invariants the code already relies on

- `cancelOrder` is only callable from `DRAFT | SENT | BILL_REQUESTED` (`order.service.ts:625-630`). Therefore at cancel time, tickets are in `PENDING | IN_PROGRESS | READY | CANCELED`. (A `READY` ticket on a cancelled order is rare but possible — cook marked READY, waiter then cancelled before bill request.)
- `kitchen.service.setStatus` only allows `IN_PROGRESS → READY` and `PENDING → IN_PROGRESS`. There is no path to "abandon mid-cook."
- The kitchen renderer's active list is the only place the "stuck `IN_PROGRESS` after cancel" leak is visible. The DB row is otherwise harmless until a cook reopens the app or a refresh happens.

## 4. Options

### Option A — "Ticket follows order" (cascade terminal)

When an order goes to `CANCELED | CLOSED | WALKOUT`, every non-terminal ticket on it gets a terminal ticket status in the **same transaction**:

| Order → | `PENDING` ticket | `IN_PROGRESS` ticket | `READY` ticket |
|---|---|---|---|
| CANCELED | → `CANCELED` (no-op now) | → **new** terminal `ABANDONED` | → unchanged (food was cooked, just unserved) |
| CLOSED | n/a (must be `READY` first — see B) | n/a | unchanged |
| WALKOUT | n/a | n/a | unchanged |

- **New status added:** `KitchenTicketStatus.ABANDONED` — distinct from `CANCELED` because *the cook spent time on it*. Reports can count it. Stock is **not** restored (food consumed).
- **Audit event:** `TICKET_ABANDONED` with `{ ticketId, orderId, cookedLineIds, cookedValueUzs }`.
- **kitchenRepo.listActive** filter unchanged; the cascade does the work.
- **Pros:** every ticket lives in a defined terminal state; no leak. Cooked-loss is countable. Stock and finance both have a source of truth.
- **Cons:** schema change (new enum value, migration). Reports need an extra category. Need to decide whether `ABANDONED` is owner-visible or admin-visible.

### Option B — "Order can't terminalise until tickets do" (gated transition)

Don't allow `cancelOrder` while any ticket is `IN_PROGRESS`. Require the admin to either:

- Wait for cook to mark `READY`, then cancel — order becomes `CANCELED`, tickets stay `READY` (cooked but unserved).
- Or have the kitchen explicitly "void" the in-flight ticket via a new action (`PENDING → CANCELED` exists; new `IN_PROGRESS → VOIDED`).

- **Pros:** the order state machine becomes monotonic in tickets — no inconsistency possible because cancellation is blocked at the gate.
- **Cons:** changes the admin UX contract (currently: "cancel always works for admin in non-terminal states"). In a chayxana, the admin is the one talking to the angry customer; making them wait for the cook is operationally bad. Also doesn't solve the `READY-on-cancelled-order` case.

### Option C — "Just filter by parent" (minimal change)

Keep ticket statuses untouched on order terminal transitions. Change `kitchenRepo.listActive` (and any kitchen-facing query) to **join on Order and exclude terminal parents**:

```sql
WHERE KitchenTicket.status IN ('PENDING', 'IN_PROGRESS')
  AND Order.status NOT IN ('CANCELED', 'CLOSED', 'WALKOUT')
```

- **Pros:** smallest diff. No schema change. Fixes the leak immediately.
- **Cons:** the DB still contains "zombie" rows in `IN_PROGRESS` forever. Reports counting "tickets started" vs "tickets completed" become wrong without re-joining. The implicit invariant "ticket status is the source of truth for ticket state" is broken — the truth is now "ticket status AND parent order status."

### Option D — Hybrid: cascade `CANCELED` only, accept stuck `IN_PROGRESS` as a known artefact

A variant of A that **does not introduce `ABANDONED`**. On order cancel, mark *all* non-terminal tickets `CANCELED` regardless of cook progress. Cooked-loss is invisible.

- **Pros:** no schema change. Eliminates the leak. Tiny code change in `order.service.ts:632-643` (drop the `status === PENDING` filter).
- **Cons:** loses the signal — a ticket the cook spent 8 minutes on looks identical in the DB to one that never started. Future "cooked waste" reporting becomes impossible without re-walking audit logs.

## 5. Decision matrix

| Dimension | A (cascade + ABANDONED) | B (gated cancel) | C (filter by parent) | D (cascade, no ABANDONED) |
|---|---|---|---|---|
| Fixes K2-style leak | Yes | Yes | Yes | Yes |
| Schema change required | Yes (enum value) | No (but new action) | No | No |
| Migration needed | Yes (trivial) | No | No | No |
| Preserves "cooked but not served" signal | Yes | Yes (READY-on-cancel) | No (zombie rows) | No |
| Operational disruption (admin UX) | None | High (cancel blocked) | None | None |
| Reporting cleanliness | Best | Good | Worst (joins everywhere) | Medium |
| Effort | M (enum + migration + audit + report column) | M (UX change + new kitchen action) | S (one query) | XS |

## 6. Open questions

1. **Does the owner want a "cooked waste" line in finance reports?** If yes → Option A. If "don't bother me with that, just count revenue" → D or C is fine.
2. **Is admin-initiated cancel-during-cook actually common?** If it's <1/day, the operational cost of Option B (gated) is low and a stronger invariant might be worth it.
3. **Should `READY`-on-cancelled-order be normalised** (e.g. promoted to `CANCELED` or to a new `UNSERVED` status)? Today it's left alone. This is a real edge case (waiter cancels right after cook hits READY but before serving) and current code is silent on it.
4. **Telegram daily summary**: today the owner receives a daily Telegram summary. Should it include abandoned/cooked-waste counts (if Option A) or stay revenue-only?
5. **Reprint behaviour**: `reprintBill` allows reprint for CLOSED/WALKOUT/PENDING_PAYMENT (`order.service.ts:829-833`). Should reprint be allowed for `CANCELED` too, in case the receipt was already printed before cancel? Not strictly part of this PRD but adjacent.

## 7. Recommendation

**Option A** with a phased rollout:

1. Add `KitchenTicketStatus.ABANDONED` to the Prisma enum (or model it as a sub-status on `CANCELED` with a `wasCooked: Boolean` column — slightly less invasive). Prefer the enum value for grep-ability.
2. Update `order.service.ts` cancel path: cascade all non-terminal tickets. `PENDING → CANCELED`, `IN_PROGRESS → ABANDONED`. Stock restoration rule unchanged (only `PENDING` restores).
3. Add `auditService.log` entry per ticket transitioned, with cooked-line value snapshot.
4. Extend `reports.service.ts` daily report with an "abandoned tickets" count and approximate cooked-cost. Owner-only by default.
5. Document the composition rule in `decisions.md` as a new "Cross-machine invariants" section.

Rationale: B is operationally too disruptive; C accumulates zombie rows that quietly break future reports; D is the cheapest fix but throws away signal we'll need the moment the owner asks "where is my food going?" — which is the kind of question that comes up at month-end, not at design time. A is one schema migration away and locks the invariant explicitly.

## 8. Rollout

1. **PR 1 — schema:** Add `KitchenTicketStatus.ABANDONED` enum value, generate migration. Re-run `pnpm dev:master`; verify Prisma client typecheck still passes everywhere `KitchenTicketStatus` is exhaustively matched.
2. **PR 2 — service change:** Update `order.service.cancelOrder` cascade. Add audit event. Add unit/integration test that:
   - Creates an order, sends it (creates ticket), starts the ticket (`IN_PROGRESS`), then cancels the order. Assert ticket → `ABANDONED`, audit row exists, stock **not** restored for cooked lines.
   - Creates an order, sends it, but ticket stays `PENDING`. Cancel order. Assert ticket → `CANCELED`, stock restored.
3. **PR 3 — kitchen client:** Update kitchen renderer to ignore `ABANDONED` tickets (treat like `CANCELED` for active-list purposes; cook gets the same red banner). Confirm the SocketIO event vocabulary doesn't need a new event — `order:canceled` is enough.
4. **PR 4 — reports:** Add abandoned-tickets line to daily/monthly report, owner-only.
5. **PR 5 — docs:** Update `decisions.md` with the locked composition rule (small section, ~15 lines). Mark this PRD `Implemented` with commit links.

### Backward compatibility

- Existing `IN_PROGRESS` rows on already-cancelled orders in production data won't be retroactively transitioned by the code change. A one-off cleanup script (or an idempotent boot-time normaliser) can fix them: find tickets where `status IN ('PENDING', 'IN_PROGRESS')` and `order.status IN ('CANCELED', 'CLOSED', 'WALKOUT')`, transition to the appropriate terminal. Audit log can be backfilled with `action: 'TICKET_NORMALISED'` for traceability.

### Observability

- Add a debug counter / log line per cascade transition, so the first week post-rollout we can confirm the rule fires for real cancels.
- Add a "stuck ticket" alert in the startup health-check: if any ticket is `IN_PROGRESS | PENDING` and parent order is terminal, log a warning. Should be zero after rollout.
