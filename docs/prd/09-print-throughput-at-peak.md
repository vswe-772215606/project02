# PRD 09 — Print throughput at peak

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Performance / capacity (printing under load)
- **Related code:** `apps/master/src/main/server/services/print.service.ts`, `…/lib/print-queue.ts`, `apps/master/cpp/receipt.cpp`
- **Related docs:** PRD 03 (print pipeline redesign), `docs/PROJECT_TECHNICAL_OVERVIEW.md`

---

## 1. Context

PRD 03 redesigns the **architecture** of the print pipeline (sync vs async, observability, retry). This PRD addresses the **capacity envelope**: how fast can the existing pipeline actually print, where does it bottleneck under realistic load, and what SLO should we commit to.

The two PRDs are deliberately separate because they answer different questions:

- PRD 03: "is the pipeline shape correct?"
- PRD 09 (this): "even with the current shape, can we serve a lunch rush?"

The deployment context is the only operational constraint that matters: **one chayxana, one printer, one master machine, owner is not a sysadmin**. Any answer that requires a load balancer or a second printer is the wrong answer for v1.

### Operational profile

Per `SESSION_HANDOFF_2026-05-05.md §1` and `decisions.md §"Domain"`:

- **~500 orders/day** total.
- **Two rush windows**: lunch (~12:00–14:00) and evening (~19:00–22:00). ~70% of orders in these windows. Rough estimate: **120–150 orders in a 2-hour lunch peak**, or **~1 order/minute average** with much higher spikes (e.g., 4 simultaneous bill approvals at the end of a lunch sitting).
- **70% dine-in, 30% takeaway**. Both kinds eventually get a printed bill.
- **Add-ons are common** in Uzbek chayxana culture — multiple kitchen tickets per order, each potentially printed if `kitchen_printer_enabled = true` (default false per `seedIfEmpty` in `sqlite-bootstrap.ts:152`).

### Print events per order (approximate)

| Event | Print? | Type | Blocking? |
|---|---|---|---|
| `SEND` (first ticket) | If kitchen printer enabled | KITCHEN_TICKET | non-blocking |
| Add-on (per ticket) | Same | KITCHEN_TICKET | non-blocking |
| `BILL_REQUESTED → PENDING_PAYMENT` (admin approve) | Always | BILL | **blocking** |
| Reprint (rare) | On demand | BILL_REPRINT / TICKET_REPRINT | varies |

With kitchen printer disabled (default), only bill prints hit the printer. Lunch peak with 4 simultaneous approvals → queue of 4 bill prints, each waiting on the previous. With kitchen printer enabled: ~2-4 kitchen tickets per order + 1 bill per order. At 1 order/min average, that's 3-5 prints/min sustained.

### Known constraints

- **Single physical printer**, single queue (`print-queue.ts:5`, `PQueue({ concurrency: 1 })`).
- **`execFile` per job**, 15-second hard timeout (`print.service.ts:69-72`). Spawn cost + binary cold-open is ~150-300ms per job on tested Windows hardware (no telemetry — these numbers are estimates).
- **Receipt content**: 80mm thermal, ~30-50 lines per bill, ~5-15 lines per kitchen ticket. Empirical print speed on the target POS-80 printer family: 6-10 lines/sec → 3-8 seconds per bill, 0.5-2 seconds per kitchen ticket.
- **No measurement infrastructure**. We are sizing based on guesses.

### The question

Can the system print **the busiest realistic minute** — say 5 bill approvals + 8 kitchen tickets in a 60-second window — without head-of-line stalling the admin UI? The pessimistic estimate:

- 5 bills × 6s = 30s
- 8 kitchen tickets × 1.5s = 12s
- Serialised total: 42s
- Plus spawn overhead: ~3s
- **~45 seconds of queue work compressed into 60 seconds of wall-clock**.

That's tight but not impossible. The risk is the tail: if any one print spikes to 12s (paper near-end, USB renegotiation, etc.), the bill-approval flow stalls and admin clicks "Approve" repeatedly, queueing duplicates.

## 2. Goals / Non-goals

### Goals

- Quantify the **actual** print latency profile under operating conditions (replace estimates with measurements).
- Establish an explicit **SLO** for the bill-approval path: e.g. "p95 receipt-printed time within 5s of clicking Approve."
- Identify the worst-case minute and confirm the system survives it.
- Provide an early warning when load approaches the envelope.

### Non-goals

- Architectural redesign — covered by PRD 03.
- Multi-printer or printer fail-over — single physical printer is locked for v1.
- Replacing the C++ binary — out of scope.

## 3. Current state (code-grounded)

| Concern | File / lines | Behaviour |
|---|---|---|
| Concurrency | `print-queue.ts:5` | 1 |
| Per-job overhead | `print.service.ts:69-73` | `execFile` spawn + 15s timeout |
| Bill print path | `print.service.ts:124-159` | `blocking: true`; admin UI awaits |
| Kitchen-ticket print | `print.service.ts:161-198` | `blocking: false`; fire-and-forget but still serialised through the same queue |
| Retry on failure | None | One attempt; mark FAILED; throw if blocking |
| Telemetry | None | No durationMs logging; no queue-depth metric; no alerting |

### What we don't know

- Actual p50 / p95 / p99 per-job print duration.
- Actual lunch-rush concurrency (how many simultaneous Approve clicks).
- Actual failure rate of the print binary in the field.
- Whether the printer is the bottleneck or whether spawn / file IO dominates.

This information vacuum is the most important problem to fix before any tuning.

## 4. Options

### Option A — Measure first; tune later

Add structured per-job telemetry and burn 2 weeks of production data. Make decisions from the data.

- **Mechanism:**
  - On every print attempt, log JSON: `{ jobId, type, printerName, queueDepthAtEnqueue, queueWaitMs, executionMs, totalMs, result, errorClass }`.
  - Daily summary in Telegram for owner: count, p50, p95, max, failure count.
  - After 2 weeks, decide whether to tune (Option B), redesign (PRD 03), or accept the current envelope.
- **Pros:** zero risk; decisions become data-driven.
- **Cons:** doesn't fix anything immediately. If the printer is already slow, the operator suffers for two more weeks while we measure.

### Option B — Tactical tuning within the current architecture

Optimise the existing pipeline. No architectural change.

- **Mechanisms (each independently small):**
  - **B1.** Pre-spawn or pool: keep a long-lived `receipt.exe` process talking over stdin instead of `execFile` per job. Eliminates ~150-300ms of spawn overhead per print. Requires `receipt.cpp` changes — out of scope per goals. Reject.
  - **B2.** Shorter `execFile` timeout for kitchen tickets (5s instead of 15s) so a stuck non-blocking print doesn't sit in the queue for 15s blocking the next bill.
  - **B3.** Two queues, one each for `BILL*` and `KITCHEN_TICKET*`. Concurrency still 1 *per queue* but bills no longer wait behind kitchen tickets. Caveat: the physical printer is still single. Both queues' work hits the same device; this only helps if the printer can buffer the second job while the first is still printing. Worth measuring.
  - **B4.** Priority queue: bill prints jump ahead of kitchen tickets in the same queue. Lower-effort version of B3.
  - **B5.** Drop kitchen-ticket prints entirely when `kitchen_printer_enabled = false` (today: confirmed already done at `print.service.ts:161-164` — returns null before queueing). Verify this is wired up correctly under all paths.
- **Pros:** small, contained PRs. Reversible. No semantic change.
- **Cons:** moves the bottleneck around without removing it. If the printer itself is the slow part (likely), tuning the orchestrator helps less than measurement would suggest.

### Option C — Cap concurrent admin Approve clicks

UX-side fix. Greying out the Approve button while a previous approval is in-flight, with a clear "printing…" spinner. Prevents duplicate clicks during the queue's worst minute.

- **Pros:** removes the worst observed failure mode (admin clicks Approve N times in panic, generates N PrintJob rows).
- **Cons:** doesn't increase throughput; only prevents queue inflation.

### Option D — Pre-print the bill on `BILL_REQUESTED`

Print a *draft* bill the moment the waiter requests a bill (before admin approval). When admin approves with no change, "print" is just confirming the already-printed slip. If discount/waive is applied, reprint.

- **Pros:** moves print work out of the admin-approval critical path almost entirely.
- **Cons:** decisions.md says no pre-bill in v1. Reverses a locked decision. Also doubles paper consumption for the common case where the waiter requests bill and admin tweaks something.

### Option E — Defer bill print to "money received"

Print the receipt only after `markPaid`. Admin approval becomes a non-printing step.

- **Pros:** decouples approval latency from print latency.
- **Cons:** customer doesn't see the bill before paying — bad UX. Reject.

## 5. Decision matrix

| Dimension | A (measure) | B2 (timeout tune) | B3/B4 (queue split) | C (UX cap) | D (pre-print) | E (defer print) |
|---|---|---|---|---|---|---|
| Increases throughput | No | Slight | Maybe (depends on printer) | No | Yes | Yes |
| Reduces tail latency | No | Yes | Yes | No | Yes | Yes |
| Code risk | Lowest | Low | Low | Low | Medium | Medium |
| Reverses locked decision | No | No | No | No | Yes | Yes |
| Operational cost | Zero | Zero | Zero | Zero | More paper | Worse UX |
| Effort | XS | XS | S | S | M | M |

## 6. Open questions

1. **What's the actual printer model and observed print speed?** POS-80 is a family; the cheap end (~6 lines/sec) and the higher end (~12 lines/sec) differ materially.
2. **Has the printer ever actually been a bottleneck in production?** Subjective complaints exist; no telemetry confirms.
3. **Is kitchen-printer enabled in production at any chayxana, or do all current installs run with it off?** If off, lunch-rush print load is purely bill prints — much lighter.
4. **How does the C++ binary handle a printer that's "online" via Windows but actually offline (out of paper, cover open)?** Does it block the spool, return immediately, or hang until timeout?
5. **Failure modes**: when print fails today, is the failure usually transient (paper-out, USB renegotiation) or permanent (cable unplugged, driver crash)? Determines retry strategy.

## 7. Recommendation

**Option A (measure) immediately, then Option B (B2 + B4) once data is in**, with **Option C (UX cap on rapid Approve clicks) as an unconditional follow-up** because it's cheap and addresses the most obviously bad failure mode.

Phased recommendation (deliberately conservative — operator is not a sysadmin, more moving parts is worse):

1. **Week 1 — Add telemetry only (Option A).** No behaviour change. Telegram daily summary gains a print-latency line.
2. **Week 1, parallel — UX cap (Option C).** Admin Approve button disables + spinner until print job resolves. Removes the duplicate-print failure mode entirely.
3. **Week 3, after data review** — apply B2 (shorter kitchen-ticket timeout) and B4 (priority bills in queue) if the data shows kitchen tickets routinely stall bills. Skip if data shows the queue rarely has both types simultaneously.
4. **Week 4 — set SLO.** Based on real data, commit to "p95 bill-print time within X seconds of Approve click; alert on breach for 10+ minutes." Surface the SLO breach to owner via Telegram (not admin — alert fatigue).

Reject D and E as locked-decision reversals not justified by the (still hypothetical) throughput problem.

## 8. Rollout

### Step 1 — telemetry (Option A)

1. In `runQueuedJob` (`print.service.ts:75-110`): capture wall-clock at enqueue, at task-start, at finish. Log a single JSON line per terminal event.
2. New `print_metric` table (or just structured log file rotated daily) capturing the above. Cheap.
3. Telegram daily owner summary (`telegram-bot.service.ts:formatReportMessage`): append `Chop: N tasi, p50: Xs, p95: Ys, xato: Z%`.
4. No behavioural change.

### Step 2 — UX cap (Option C)

1. In the admin Approval Queue page, disable the Approve button while the approve mutation is in-flight (TanStack Query `isPending`). Add a spinner with localised text "Chop etilmoqda…" (Printing…).
2. On error (PrintFailed), re-enable with toast "Printer xatosi — yana urinib ko'ring" (Printer error — try again). Linked manual retry via the new `POST /api/print-jobs/:id/retry` endpoint if PRD 03 ships before this.
3. Add a "Reprint last bill" button at the top of the queue as the supported recovery path for duplicate-print fears.

### Step 3 — tuning (Option B2 + B4) — conditional on data

1. **B2 (timeout):** add a per-job `timeoutMs` parameter to `executeBinary`. Pass 5000 for kitchen tickets, 15000 for bills. Tiny change.
2. **B4 (priority bills):** introduce a priority field in the queue task. Replace p-queue or wrap it with a wrapper that prefers BILL/BILL_REPRINT over KITCHEN_TICKET. p-queue v6 supports `priority` natively. ~20 lines.

### Step 4 — SLO

1. Define in `decisions.md`: "p95 bill-print wall-clock (Approve-click to PrintJob.success) ≤ 5 seconds during operating hours."
2. Alert: if any 10-minute window has >2 bills exceed 10s, send owner Telegram alert "Printer sekin ishlamoqda — tekshiring."
3. Document the SLO in the operator README.

### Observability

- Daily summary: count by `result` (success/failed), p50/p95/max execution time, queue-depth high-water mark.
- Weekly: same with trend vs previous week.
- Real-time admin UI: queue depth indicator (if PRD 03 ships with a queue UI, reuse that surface).

### Rollback

- Step 1 telemetry: revertable (single commit).
- Step 2 UX: revertable; affects only the admin page.
- Step 3 tuning: parametric; if regressions appear, revert the priority field and the per-type timeout.
- Step 4 SLO: documentation only.

## Cross-reference with PRD 03

- PRD 03 Phase 0 (instrument) is the same work as Step 1 here. **They should be the same PR.**
- PRD 03 Phase 1 (per-printer queue) is more aggressive than this PRD's Option B3 — fine to skip B3 if PRD 03 lands first.
- This PRD intentionally does **not** wait for PRD 03's async-queue rewrite. Steps 1 and 2 are independently valuable.
