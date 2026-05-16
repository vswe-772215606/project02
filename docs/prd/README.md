# Chayxana POS — PRD index

This directory holds **Product Requirement Documents** (RFC-style) for refactors and uncertain design questions in the Chayxana POS codebase. Each PRD is scoped to **one specific problem** with an explicit decision to be made.

A PRD here is *not* a bug ticket. Open bugs live in `docs/AUDIT_REPORT.md`, `docs/KITCHEN_AUDIT.md`, and `docs/NETWORK_AUDIT.md`. PRDs in this directory capture problems where the *right answer is not yet known* — typically because:

- Multiple plausible designs exist with non-trivial tradeoffs.
- The current behaviour is technically working but operationally fragile.
- A v1 simplification (locked in `docs/agent-plans/00-shared/decisions.md`) needs revisiting now that the system has shape.

## Template

Every PRD follows the same structure:

1. **Context** — what the area looks like today, what triggered the PRD.
2. **Goals / Non-goals** — what success means for *this* document; what is explicitly out of scope.
3. **Current state** — concrete code/data references (file paths, line numbers, fields), not abstract description.
4. **Options** — at least 2, each with mechanism, pros, cons, blast radius.
5. **Decision matrix** — side-by-side comparison on the dimensions that matter.
6. **Open questions** — what we need from the owner / operator before we can pick.
7. **Recommendation** — what the document author would pick, with the caveat that the decision belongs to the human.
8. **Rollout** — migration steps, fallbacks, observability hooks, sunset plan if applicable.

Each PRD is a single Markdown file: `NN-kebab-case-title.md`. The number is informational ordering, not a strict execution order — PRDs are intentionally independent.

## Index

| # | Title | Area | Status |
|---|---|---|---|
| 01 | [Order & kitchen-ticket terminal-state semantics](01-order-ticket-terminal-state.md) | Domain | Draft |
| 02 | [SQLite (packaged) vs. PostgreSQL — settle the DB strategy](02-dual-db-strategy.md) | Architecture | Draft |
| 03 | [Print pipeline redesign](03-print-pipeline-redesign.md) | Architecture / Perf | Draft |
| 04 | [Master server / admin UI separation](04-server-ui-separation.md) | Architecture | Draft |
| 05 | [Walkout & cancellation accounting](05-walkout-cancellation-accounting.md) | Domain | Draft |
| 06 | [Debt reconciliation timing](06-debt-reconciliation-timing.md) | Domain | Draft |
| 07 | [Stock model: daily-reset vs. perpetual](07-stock-model-refinement.md) | Domain | **Superseded** by [REFACTOR_PLAN](../REFACTOR_PLAN.md) |
| 08 | [Service charge clawback rules](08-service-charge-clawback.md) | Domain | Draft |
| 09 | [Print throughput at peak](09-print-throughput-at-peak.md) | Perf | Draft |
| 10 | [Backup & disaster recovery](10-backup-and-dr.md) | Ops | Draft |
| 11 | [Auto-update & multi-machine rollout](11-auto-update-rollout.md) | Ops | Draft |
| 12 | [Network partition / degraded UX](12-network-partition-degraded-ux.md) | Architecture / UX | Draft |

## Quick navigation by theme

- **Operational simplicity (single-chayxana operator):** PRDs 04, 10, 11, 12 are the practical-ops bundle.
- **Domain / accounting truth:** PRDs 05, 06, 08 share the FINANCE_PLAN §2 principles. PRD 07 (stock) is adjacent.
- **State-machine correctness:** PRD 01 underlies 05 and 12; ideally implemented first.
- **Cross-cutting:** PRDs 03 + 09 are the same area (print) from architecture and capacity sides; ideally read together.

## Related: top-level refactor plan

A separate document, [`docs/REFACTOR_PLAN.md`](../REFACTOR_PLAN.md), captures a business-model-level refactor (ingredient ledger + COGS + variance loop) decided on 2026-05-15. It supersedes PRD 07 and modifies how PRDs 01, 05, and 10 will play out. Read it first if you want the full v2 picture; the PRDs below remain the single-problem decision records.

## Doc-vs-code findings raised by this batch

Each PRD that flagged a contradiction notes it in its Context section. Summary:

- **PRD 02:** docs ("planned Postgres migration") vs code (SQLite locked). The migration was never executed; the dual-DB premise in earlier handoffs is stale.
- **PRD 03:** `decisions.md` says "if print fails, the BILL_REQUESTED → PENDING_PAYMENT transition rolls back." Code commits the transition first and prints async via `deferAfterCommit`. The rule has drifted.
- **PRD 06:** `FINANCE_PLAN.md §2.2` mandates immutable financial records. `Debt.remainingAmount` is mutated on each repayment. Cache-vs-truth gap that should be either justified or removed.
- **PRD 07:** `stockService.today()` uses UTC, but the operator's "today" is Tashkent local (UTC+5). Small but real day-boundary bug.

These are not bugs to fix in the audit sense — they are decision points about whether to fix the doc, fix the code, or document the divergence. Each PRD proposes a path.

## How to use

- A PRD is **ready to implement** only after the **Recommendation** is approved by the human owner and the **Open questions** are resolved (either answered or explicitly deferred). Until then, the doc is for discussion.
- When implementation lands, update the PRD's status to `Implemented` and link the relevant commits or `docs/agent-plans/` phase file. Do **not** delete the PRD — its "Context" and "Options" are the reasoning record.
- If a decision is **rejected** (we are keeping the status quo), update status to `Rejected — keep current` and write one line explaining why. The same problem will surface again; future-you should be able to find the prior reasoning.

## Out of scope for this round

Captured but not yet PRD'd (raised in initial survey, see chat log 2026-05-15):

- Discount model: bill-level-only vs. per-line / comp / void.
- Socket.IO "notify + refetch" pattern under burst load.
- i18n: hardcoded Uzbek vs. lightweight string table.
- Repository-layer purity enforcement (lint rule / codegen).
- Session / PIN policy at scale.
- Audit log retention & growth.

These remain candidates if the first batch lands well.
