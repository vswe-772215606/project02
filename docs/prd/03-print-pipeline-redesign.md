# PRD 03 — Print pipeline redesign

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Architecture / performance (printing, transactional boundaries)
- **Related code:** `apps/master/src/main/server/services/print.service.ts`, `…/lib/print-queue.ts`, `…/printer/`, `apps/master/cpp/receipt.cpp`
- **Related docs:** `docs/PROJECT_TECHNICAL_OVERVIEW.md` (§ "Printer Service"), `docs/agent-plans/00-shared/decisions.md` (§ "Bills, discounts, service charge"), `docs/HANDOFF.md` (p-queue v6 pinning note)

---

## 1. Context

The receipt printer is the most physical thing in this system. A printer that is slow, jammed, or unplugged today **blocks the entire bill-approval flow** because of two architectural choices:

1. **Print is blocking & in-transaction for bills.** `orderService.approve` (`order.service.ts:670-732`) computes totals, writes them, transitions order to `PENDING_PAYMENT`, then calls `printService.printBill(freshOrder)` via `deferAfterCommit`. If the print job fails, `runQueuedJob` throws (`print.service.ts:91-98`), which means: for `blocking: true` jobs (bill, bill-reprint), the error is surfaced — and the **transition is *not* rolled back** because the print is on `deferAfterCommit`, not inside the tx. The locked decision (`decisions.md`) actually says "if print fails, transition is rolled back." The implementation has drifted: the order is already `PENDING_PAYMENT` when print fails. This is a quiet design contradiction.

2. **Serial print queue with concurrency=1.** `print-queue.ts` creates a single global `PQueue({ concurrency: 1 })`. *Every* print job — bills, bill reprints, kitchen tickets, kitchen reprints — serialises through that one queue. There is only one physical printer in v1, so this is logically correct for the printer side. But it means a 10-second print of a kitchen ticket *also* delays the bill the admin just clicked Approve on.

3. **Single printer for everything.** `admin_printer_name` and `kitchen_printer_name` settings exist, but the queue does not partition by printer. If the chayxana ever installs a second printer (e.g., a dedicated kitchen printer), the queue will serialise jobs that could run in parallel.

4. **`receipt.exe` spawn per job, 15s timeout.** Every print job is a fresh `execFile('receipt.exe', [printerName, ...args])` with a 15-second hard timeout. `receipt.cpp` uses Win32 RAW spooling — it opens the printer, writes ESC/POS bytes, closes. There is no IPC, no daemon, no warm pool. Spawn + open-printer is typically ~100-300ms; the rest is the printer itself.

5. **PrintJob persistence is correct.** `printJobRepo.create` writes the job row *before* attempting print. `incrementAttempts` is called on each attempt. `markSuccess` / `markFailed` finalise. So there is **a record of every attempt** — but no auto-retry, no exponential backoff, no idempotency key on the payload. A failed bill is just a row marked `FAILED`. The admin sees a "PrintFailed" error toast and is expected to click "reprint" — see `order.service.ts:829-847`.

6. **p-queue v9 → v6 pinning** (per `HANDOFF.md`): v9 is ESM-only; Electron main is CJS; so we're stuck on v6. There's also a `print-queue.ts` defensive default-export fallback for the same reason. This works but is a known sharp edge.

The whole pipeline does what it needs to for a happy-path lunch. The PRD-worthy questions are about the **unhappy paths and the throughput envelope**:

- What happens when the printer goes offline mid-rush? Today: the queue silently fills with failed jobs; the admin sees toasts but has no way to see the queue state.
- What if the printer is OK but slow (4-5s per receipt)? Today: at 30 approvals in 10 minutes (lunch rush), the queue head-of-line grows; admin clicks Approve, waits ~5s × N for their bill.
- What if the network blip during print causes execFile to time out at 15s but the receipt actually printed? Today: job marked FAILED, admin reprints, customer gets a duplicate receipt.

## 2. Goals / Non-goals

### Goals

- Decouple the **order state transition** from the **physical print outcome**, while preserving the user-facing contract ("admin clicks Approve, customer leaves with a receipt").
- Make the print queue **observable** to admin (queue depth, last failure reason, retry options).
- Define **retry semantics** for transient failures (timeout, printer-busy, paper-out) vs. permanent ones (binary missing, wrong printer name).
- Define **idempotency** so that retrying a print doesn't print twice.
- Survive a 3× peak load over current peak without head-of-line blocking on unrelated jobs.

### Non-goals

- Replacing the C++ printer binary. `receipt.cpp` works. Out of scope.
- Supporting non-ESC/POS printers (e.g., A4 laser fallback). Out of scope.
- Multi-location printer routing. Out of scope (single-location v1).
- Changing the bill *content* / layout. PRD-09 covers throughput; PRD-03 (this) covers pipeline.

## 3. Current state (code-grounded)

| Aspect | File / lines | Behaviour |
|---|---|---|
| Queue | `print-queue.ts:1-5` | One global `PQueue({ concurrency: 1 })`. p-queue v6 (CJS). |
| Bill print | `print.service.ts:124-159` | `blocking: true` — caller awaits; failure throws `Errors.PrintFailed`. |
| Bill reprint | `print.service.ts:200-234` | Same as bill print, type `BILL_REPRINT`. |
| Kitchen ticket print | `print.service.ts:161-198` | `blocking: false` — fire-and-forget via `.catch`. Returns null if printer disabled. |
| Kitchen reprint | `print.service.ts:236-276` | `blocking: false`. |
| Binary call | `print.service.ts:46-73` | `execFile(binaryPath, [printerName, ...args])` with 15s timeout. Linux stub logs args. |
| Job recording | `printJobRepo` | Row created before execution; attempts incremented; success/failure persisted. |
| Print scheduled | `order.service.ts:725-727` | `deferAfterCommit(() => printService.printBill(freshOrder))`. After the tx commits, *then* print is attempted. |
| Failure handling | `runQueuedJob:91-98` | On error: mark FAILED. For blocking, rethrow. For non-blocking, log. |
| Retry | None | No `retry` field, no scheduled retry job, no backoff. |
| Idempotency key | None | Payload contains `orderId` / `ticketId` but the binary is not idempotency-aware. |
| Observability | None | No admin UI for queue state. Logs in `console`. |
| Contradiction with decisions.md | `order.service.ts:687-727` vs `decisions.md` | Decisions say "if print fails, transition rolls back." Code commits the transition first, prints after. |

## 4. Options

### Option A — Make print truly async, with a visible queue

Separate the **order state transition** from the **physical print** entirely. The order goes to `PENDING_PAYMENT` regardless of print outcome. Print jobs are queued, retried, and visible.

- **Mechanism:**
  - `orderService.approve` writes the order row + creates a `PrintJob(status=QUEUED)` in the same tx. No print attempt in-band.
  - A background worker (in-process, polling or `setImmediate`-driven) pulls QUEUED jobs and processes them with exponential backoff (e.g., 0s, 5s, 30s, 5min, then DEAD).
  - Admin UI gets a "Print queue" panel showing depth, last error, manual-retry button.
  - `printJob.attempts` and `printJob.nextAttemptAt` columns added.
- **Decision change required:** the locked rule "transition rolls back if print fails" is **abandoned**. New rule: "transition always succeeds; failed prints are surfaced and retried."
- **Pros:**
  - Removes head-of-line: a stuck printer doesn't block admin clicks.
  - Visible queue means ops can see "10 receipts pending, printer offline" instead of clicking through error toasts.
  - Retry handles flaky USB / paper-out / cover-open without manual intervention.
- **Cons:**
  - Customer experience drift: admin clicks Approve, customer walks to register, no receipt yet. Today, receipt prints first. Operationally this needs a UX answer (show "printing…" spinner + reprint button on the bill screen?).
  - Loses the "atomic transition + print" contract. Requires a doc update.
  - Real risk of duplicate prints if retry semantics are wrong — needs idempotency key on the binary side or on the spool.

### Option B — Keep bill print blocking, but make the state transition the rollback boundary

Honour the decisions.md contract. Move the print **into** the transaction.

- **Mechanism:**
  - In `orderService.approve`, attempt `printService.printBill` *inside* the `$transaction`. If it throws, the tx rolls back; the order stays in `BILL_REQUESTED`.
  - This requires the print binary to be **idempotent on retry** because a failure rolls back and the admin will click again.
  - Non-bill prints (kitchen tickets) stay async.
- **Pros:**
  - Aligns with decisions.md without changing the rule.
  - Customer experience preserved: print succeeds → admin sees success → customer gets receipt.
- **Cons:**
  - **Holds a database transaction open across a 15-second print**. SQLite serialises writes; this blocks every other write in the system for up to 15s on a slow print. With 30 approvals in a lunch rush this is catastrophic.
  - Doesn't address the queue-visibility or retry gap.
  - Couples DB latency to printer latency in a way SQLite specifically dislikes.

### Option C — Hybrid: optimistic transition + bounded sync print with fast rollback

A compromise. The bill print is attempted in a short window (e.g., 3s) **before** the tx commits. If it succeeds, commit. If it times out or fails fast, roll back the tx and surface "printer offline — try again." Long-tail failures (printer running but slow past 3s) are treated as success and processed async.

- **Mechanism:**
  - Wrap `printBill` with a 3s deadline.
  - On deadline: assume printer accepted the job; commit the tx; queue an async "verify and retry on failure" task.
  - On hard fail before deadline: rollback.
- **Pros:**
  - Preserves the happy-path UX (customer gets receipt before they pay).
  - Bounds the DB-lock window.
- **Cons:**
  - Probabilistic correctness ("printer accepted the job, probably"). Hard to reason about.
  - Adds complexity for marginal benefit.

### Option D — Partition the queue per printer

Smaller scope: address the head-of-line problem without changing transactional semantics.

- **Mechanism:**
  - Replace the single `printQueue` with a map keyed by `printerName`. Each printer gets its own `concurrency=1` queue.
  - When admin printer = kitchen printer (today's config), behaviour is identical to current. When they differ (future), kitchen tickets and bills run in parallel.
- **Pros:**
  - Tiny change, future-proofing only.
  - No semantic change.
- **Cons:**
  - Doesn't address blocking, observability, retry, or idempotency.
  - Only helps when there are actually two printers.

### Option E — Idempotency key + manual retry only

Address only the duplicate-print risk. Send `--idempotency-key=<jobId>` to `receipt.exe`; binary writes a small log file and refuses to print again if asked with the same key within N minutes.

- **Pros:** safe to retry.
- **Cons:** doesn't address the throughput / blocking / visibility issues. Modifies the C++ binary (out of scope per goals).

## 5. Decision matrix

| Dimension | A (async queue) | B (in-tx print) | C (hybrid 3s) | D (per-printer queue) | E (idempotency only) |
|---|---|---|---|---|---|
| Head-of-line solved | Yes | No | Partially | If two printers | No |
| Tx lock window | Short (no print) | Up to 15s | Up to 3s | Short | Short |
| Customer UX preserved | Needs new UX | Yes | Mostly | Yes | Yes |
| Queue observable | Yes | No | Partial | No | No |
| Retry / DLQ | Yes | No | Partial | No | Yes |
| Duplicate-print risk | Needs idempotency | Low | Medium | Low | Eliminated |
| Honours decisions.md rule | No (rule retired) | Yes | Partially | Yes | Yes |
| Code change size | L | S | M | XS | M (touches cpp) |
| Future multi-printer | Native | Awkward | Awkward | Yes | N/A |
| Effort | L | S | M | XS | S |

## 6. Open questions

1. **What is the actual customer-facing contract?** "Admin clicks Approve → customer immediately holds the receipt" is what today's code targets. Is it acceptable for the receipt to print 5-10 seconds *after* the admin clicks (while customer is at the cash register)? If yes, Option A is straightforward. If no, B/C are the only options and we live with their costs.
2. **How often does the printer actually fail / slow down?** No production telemetry exists. The pipeline's perceived risk is mostly hypothetical. A 2-week instrumentation effort (log every print's wall-clock duration + outcome) might show the printer is fast and reliable, in which case Option D + E is enough.
3. **Is the rule in decisions.md still right?** It was written before the system shipped to a real chayxana. If the rule causes admins to retry-click during peak (because print failed once), that's worse than not rolling back.
4. **Does the chayxana have a backup printer?** If yes, the queue should fail over. Today no support.
5. **What's the right "DEAD" state for a print job that's failed N times?** Surface to owner? Telegram alert? Auto-mark order as "receipt-issue"?

## 7. Recommendation

**Option A (async queue + visible UI + retry) combined with Option E (idempotency key)** — but only after a **2-week measurement window** using a simple addition (Option D as a low-risk first step + instrumentation).

Phased recommendation:

1. **Phase 0 — measure (1 week).** Add structured logging: `printJob.id`, `type`, `printerName`, wall-clock duration, success/failure reason. Ship to owner's Telegram daily summary. Goal: know whether the printer is the bottleneck or whether the problem is theoretical.
2. **Phase 1 — Option D (per-printer queue) + Option E (idempotency)** as low-risk improvements. Adds future-proofing without changing semantics. ~2 days of work.
3. **Phase 2 — Option A** if Phase 0 data shows the printer's slow/unreliable behaviour is real. Update decisions.md to retire the rollback rule. Build the admin print-queue UI. Add retry+backoff to the worker. ~2 weeks.

This sequence avoids committing to a large rewrite until we have real data. Option B is rejected because holding a DB tx open across a 15-second print is incompatible with our SQLite single-writer model (PRD 02).

## 8. Rollout

### Phase 0 — instrument

- Add fields to print log lines: `phase` (`enqueue`, `start`, `finish`), `durationMs`, `result`, `errorClass`. JSON one-line per event.
- Surface daily aggregates in Telegram owner summary (count, p50, p95, failure rate).
- No behaviour change.

### Phase 1 — partition + idempotency

- Replace `printQueue` singleton with a map keyed by `printerName`. Update `print.service.ts` callers.
- Add `printJob.idempotencyKey = printJob.id` to args passed to `receipt.exe`. Update `receipt.cpp` to check the key against a small on-disk dedup log (last 100 keys, 10-minute TTL) — if duplicate, exit success without printing.
- Add unit test for the queue map (two printers, parallel jobs).
- Risk: extremely low. Behaviour identical when there's one printer.

### Phase 2 — async queue + UI

1. **Schema:** add `printJob.status` enum (`QUEUED`, `IN_FLIGHT`, `SUCCESS`, `FAILED`, `DEAD`), `printJob.nextAttemptAt`, `printJob.lastError`. Migration is additive.
2. **Worker:** in-process scheduler (extend the existing `startScheduler` from `index.ts:87`) that picks `QUEUED` jobs whose `nextAttemptAt <= now`, processes them through the per-printer queue, increments attempts, backoff = `5s × 2^(attempts-1)` capped at 5 min. After 5 attempts → `DEAD`.
3. **API:** `GET /api/print-jobs?status=…` (admin-only). `POST /api/print-jobs/:id/retry`. `POST /api/print-jobs/:id/cancel`.
4. **UI:** admin sidebar gains a "Chop ishlari" panel showing queue depth, recent failures, retry button.
5. **Decisions doc:** update `decisions.md` "Bills" section. Replace "rollback on print failure" with "approval succeeds atomically; print is best-effort with retry. DEAD jobs require owner attention."
6. **`orderService.approve`:** drop the `deferAfterCommit(() => printService.printBill(...))`. Replace with a job-creation that's already part of the tx (`printJobRepo.create` inside the tx, status=`QUEUED`). Worker picks it up.
7. **Backfill test:** simulate-flow.ts updated to (a) approve an order, (b) assert order is `PENDING_PAYMENT` immediately, (c) poll print-job status, (d) verify completion. Run on packaged Windows build.

### Observability across all phases

- Telegram alert when any print job goes `DEAD` (owner-level alert, not admin).
- Daily count of `SUCCESS` / `FAILED` / `DEAD` per printer in the Telegram daily summary.
- Boot-time printer probe: if `admin_printer_name` is set, attempt a no-op `receipt.exe --probe`. Log result. Non-fatal but visible.

### Rollback plan

- Phase 1 is reversible by reverting one commit (map → singleton).
- Phase 2's schema additions are additive; the worker can be disabled by a setting (`print_async_enabled = false`) to fall back to the old in-band path while the new path is debugged.
