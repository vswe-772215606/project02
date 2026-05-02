# Chayxana POS — Agent Build Plans

These plans are written for an autonomous coding agent (Claude Code, Codex, or similar). Each file is a single phase. Phases are executed in order.

## Two ways to run these

### A. Phase-by-phase (safest, slow)

For each phase: open a fresh agent session, give it this prompt:

> Read `docs/agent-plans/README.md`. Read every file in `docs/agent-plans/00-shared/`. Then read `docs/agent-plans/<PHASE_PATH>` and execute the tasks in order. Stop at the verification gate at the end and show me the output. Do not declare the phase complete until verification passes.

You commit, you verify, then start the next phase.

### B. Autonomous run (fast — what you probably want)

Tell the agent to chain phases until it hits a blocker. Use this prompt:

> Read `docs/agent-plans/README.md` and every file in `docs/agent-plans/00-shared/`. These are the rules and the source of truth.
>
> Then execute phases in this order, treating each as a self-contained task:
>
> 1. `docs/agent-plans/01-master/00-scaffolding.md`
> 2. `docs/agent-plans/01-master/01-schema-and-repos.md`
> 3. `docs/agent-plans/01-master/02-services.md`
> 4. `docs/agent-plans/01-master/03-api-and-auth.md`
> 5. `docs/agent-plans/01-master/04-printer.md`     ← may need human help with physical printer
> 6. `docs/agent-plans/01-master/05-admin-ui.md`
> 7. `docs/agent-plans/01-master/06-stock-tracking.md`
> 8. `docs/agent-plans/01-master/07-reports-and-audit.md`
> 9. `docs/agent-plans/02-kitchen/00-scaffolding.md`
> 10. `docs/agent-plans/02-kitchen/01-display-and-actions.md`
> 11. `docs/agent-plans/03-mobile/00-scaffolding.md`
> 12. `docs/agent-plans/03-mobile/01-pin-login.md`
> 13. `docs/agent-plans/03-mobile/02-order-flow.md`
> 14. `docs/agent-plans/03-mobile/03-bill-and-status.md`
>
> For each phase:
> - Read the phase file in full.
> - Execute the Tasks section in order.
> - At the end, run the Verification gate commands and show me the output.
> - If verification passes, commit with message `phase X complete: <name>`, then proceed to the next phase.
> - If verification fails, do NOT proceed. Stop and report the specific failure.
> - If the phase requires me (the human) to do something physical (install a printer, connect a phone), pause and tell me what to do.
>
> Do not skip phases. Do not modify locked decisions in `00-shared/decisions.md`. Do not improvise solutions when blocked — surface the blocker.

The agent runs as many phases as it can in one go. Phases that need human intervention pause and wait.

## Likely human-intervention points

| Phase | Why |
|---|---|
| `01-master/01-schema-and-repos.md` | Install PostgreSQL on Windows, create the `chayxana` database |
| `01-master/04-printer.md` | Plug in the actual thermal printer, install Windows driver, share its name |
| `02-kitchen/00-scaffolding.md` | If running on a real kitchen monoblock (vs the same dev machine), MASTER_URL must be set |
| `03-mobile/00-scaffolding.md` | Phone on same Wi-Fi, Expo Go installed |
| `03-mobile/03-bill-and-status.md` | EAS Build account for production APK |

Have prerequisites ready before starting that phase to keep momentum.

## Phase order — strict

```
00-shared/                          (read by every phase, never executed)
  decisions.md                      Source of truth for locked decisions
  schema.md                         Full Prisma schema
  api-contract.md                   REST + socket events
  conventions.md                    Naming, error handling, patterns

01-master/                          Master backend + admin desktop UI (8 phases)
02-kitchen/                         Kitchen Display Electron app (2 phases)
03-mobile/                          Waiter Android app (4 phases)
```

## Rules the agent must follow

1. **Do not change locked decisions.** `00-shared/decisions.md` is the source of truth.
2. **Do not add features outside the phase scope.**
3. **Do not skip verification.**
4. **Do not invent files outside the listed file tree.**
5. **TypeScript strict mode is non-negotiable.**
6. **Prisma is touched only in repository files.**
7. **Single-quotes, semicolons, 2-space indent.**
8. **Uzbek for all user-facing text.**
9. **If blocked, STOP and surface.** Do not improvise.

## What's NOT in v1 (deliberately)

The agent must NOT build any of these:

- Split / merge bills.
- Per-line discounts.
- Mobile transfer payments (Click, Payme).
- Pre-bill print.
- Top items / hourly distribution / AOV in reports.
- Structured menu modifiers.
- Combos with special pricing.
- Multi-tenant SaaS.
- Inventory ingredient tracking.
- Per-table table map UI.
- CSV / PDF exports.
- Charts in reports.
- Offline queue on mobile.

## When verification fails

Do not proceed. Common fixes:

- TypeScript errors → fix and re-run `pnpm typecheck`.
- Test output unexpected → debug specific failure.
- Locked decision violated → point at `00-shared/decisions.md`.

If a phase consistently fails after 2-3 retries, the plan may be wrong. Stop and ask the human.

## After all 14 phases — pre-deployment checklist

- Physical printer tested in chayxana environment.
- Wi-Fi signal walked in every room.
- Static IP for Master at router.
- PostgreSQL Windows service running, backups scheduled (`pg_dump` daily via Task Scheduler).
- Master + Kitchen Electron apps auto-start on Windows boot.
- Owner training session.
- Mobile APK distributed to waiter phones.

These are deployment tasks, not coding tasks.
