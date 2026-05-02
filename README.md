# Chayxana POS — Agent Build Plans

These plans are written for an autonomous coding agent (Claude Code, Codex, or similar). Each file is a single phase. Phases are executed **one at a time, in order**. Do not run multiple phases at once.

## How to use these plans

For each phase:

1. **Open a fresh agent session** for the phase. Don't carry state across phases — each phase file is self-contained and tells the agent everything it needs.
2. **Give the agent this prompt** (substitute the phase path):
   > Read `docs/agent-plans/01-master/00-scaffolding.md`. Read every file it references in `00-shared/`. Then execute the tasks in order. Stop at the verification gate at the end and show me the output of the verification commands. Do not declare the phase complete until verification passes.
3. **The agent runs the phase.** It reads shared context (`00-shared/*.md`), then the phase tasks, then executes.
4. **The agent stops at the verification gate.** It runs the verification commands and shows you the output.
5. **You review.** If verification passed, mark the phase done (in your tracking — Git tag, Notion checkbox, whatever). If it failed, ask the agent to fix the specific failure, then re-run verification.
6. **Move to the next phase** only after the previous phase is verified done.

## Phase order

Strict order. Do not skip or reorder.

```
00-shared/                          (read by every phase, never executed)
  decisions.md                      Source of truth for locked decisions
  schema.md                         Full Prisma schema
  api-contract.md                   REST + socket events
  conventions.md                    Naming, error handling, patterns

01-master/                          Master backend + admin desktop UI
  00-scaffolding.md                 Monorepo, Electron, Express, PG, Prisma init
  01-schema-and-repos.md            Apply schema, write repositories, seed
  02-services.md                    Business logic, no HTTP yet
  03-api-and-auth.md                REST endpoints, auth middleware, validation
  04-printer.md                     C++ binary integration, print queue
  05-admin-ui.md                    React renderer for owner/admin
  06-stock-tracking.md              Daily stock counts (added late)
  07-reports-and-audit.md           Daily/monthly reports, audit log UI

02-kitchen/                         Kitchen Display Electron app
  00-scaffolding.md                 Electron + React + socket client
  01-display-and-actions.md         Ticket queue, status changes, cancel banner

03-mobile/                          Waiter Android app (Expo)
  00-scaffolding.md                 Expo init, navigation, monorepo wiring
  01-pin-login.md                   PIN pad, auth flow, connection banner
  02-order-flow.md                  Table picker, menu, draft, send to kitchen
  03-bill-and-status.md             Live ticket status, request bill, end-of-flow
```

## Rules the agent must follow

These apply to every phase. Every phase file repeats the most critical ones in its Constraints section, but they are global:

1. **Do not change locked decisions.** Decisions live in `00-shared/decisions.md`. If something seems wrong, the agent must surface it as a question, not silently rewrite it.
2. **Do not add features outside the phase scope.** A phase that says "implement repositories" does not implement services. Scope creep breaks verification.
3. **Do not skip verification.** A phase is not complete until all verification commands pass. The agent must run them and show output.
4. **Do not invent new files outside the listed file tree.** If the phase says "create `X.ts`", create exactly that. Don't add helper files unless the phase explicitly allows it.
5. **TypeScript strict mode is non-negotiable.** No `any` shortcuts unless the phase explicitly permits.
6. **Prisma is touched only in repository files.** Services call repos. Controllers call services. No Prisma in routes, controllers, services, or anywhere else.
7. **Single-quotes, semicolons, 2-space indent.** Match the conventions file.
8. **Uzbek for all user-facing text.** No English in UI strings.
9. **If the agent hits an unexpected blocker** (e.g., a library version conflict, a Windows-specific issue), the agent must STOP and surface the problem with a clear description, not improvise a workaround that diverges from the plan.

## When a phase fails verification

Do not proceed to the next phase. Common failure modes:

- **TypeScript errors:** ask agent to fix them, re-run `pnpm typecheck`.
- **Test command output unexpected:** ask agent to debug the specific failure.
- **Wrong file structure:** ask agent to reconcile against the file tree in the phase.
- **Locked decision violated:** point at `00-shared/decisions.md`, ask agent to fix.

If the phase consistently fails after 2-3 retries, the phase plan itself may be wrong. Stop, get help, do not have the agent improvise.
