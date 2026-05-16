# Archived docs

These were active at one point but are now stale. Kept for historical reference. **Do not act on anything in them without cross-checking the current source-of-truth docs in `docs/`.**

| File | Era | Why archived |
|---|---|---|
| `AUDIT_REPORT.md` | 2026-05-02 | Master-app audit. All 8 bugs listed here were fixed per `SESSION_HANDOFF_2026-05-05`. Behaviour superseded by Phase 1 work in REFACTOR_PLAN. |
| `KITCHEN_AUDIT.md` | 2026-05-03 | Kitchen audit. Bugs K1–K4 fixed (per session handoff). The state-machine composition rule that K1–K4 exposed is now documented in PRD 01. |
| `NETWORK_AUDIT.md` | 2026-05-05 | Phases 1 & 2 of the network audit are complete (config unified, setup UX shipped). Phase 3 (mDNS discovery, QR) is out of scope. |
| `HANDOFF.md` | Phase-5-in-progress era | Stale snapshot of the Phase-5 admin-UI rollout. Replaced by REFACTOR_PLAN.md and the renderer code that now exists. |
| `SESSION_HANDOFF_2026-05-05.md` | 2026-05-05 | Predates the ingredient/COGS refactor entirely. Useful as a "what the codebase looked like 10 days ago" snapshot, but its "next steps" section is no longer accurate. |

## Source-of-truth docs in `docs/`

- **`REFACTOR_PLAN.md`** — master refactor plan (ingredient ledger, COGS, recipes, stocktake, variance loop).
- **`UI_UX_RULES.md`** — design system rules for the admin and mobile UIs.
- **`PROJECT_TECHNICAL_OVERVIEW.md`** — high-level architecture overview.
- **`prd/`** — decision records for individual problems.
- **`agent-plans/`** — phase plans and locked product decisions.
- **`FINANCE_PLAN.md`** + **`FINANCE_IMPLEMENTATION_SPEC.md`** + **`FINANCE_REPORTING_CLARITY_PLAN.md`** — finance principles and spec.
- **`TECHNICAL_SPECIFICATION.md`** — formal spec.
