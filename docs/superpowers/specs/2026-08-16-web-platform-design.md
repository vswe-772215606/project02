# Web platform — design

**Date:** 2026-08-16 · **Status:** design approved, unimplemented
**Branch:** `feat/web-platform`, cut from `feat/remove-walkout`
**Scope:** move the master admin and its server off Electron and onto the web, deployed on the
owner's VPS behind their own domain. The two waiter clients keep working against the same API and
are otherwise untouched.

**Supersedes** the LAN-only deployment assumption in `docs/CURRENT_WORKFLOW.md` §1 and §9, and the
build-variant machinery described in `CLAUDE.md` "Build variants". Everything those documents say
about the *money path* still holds and is deliberately preserved — see §10.

**Reads on:** `docs/TECHNICAL_REVIEW_2026-08-16.md`. Several findings in that review stop being
optional once this system is reachable from the internet; §7 names them.

---

## 1. Intent

The product is one Uzbek chayxana's till. Today it is an Electron app on a Windows machine that
hosts its own server on the LAN. The owner has servers and a domain and wants the admin side to be a
web application.

This is a smaller change than it sounds, and the measurements say why:

- `apps/master/src/main/server/**` is 82 files and ~10 100 lines, and imports Electron in **exactly
  one** file — `printer/binary-resolver.ts`. `scripts/serve-headless.ts` already boots the whole
  Express + Socket.io API with no Electron at all, and the Docker harness has been running it for
  weeks.
- `apps/master/src/renderer/**` is 142 files and ~14 200 lines, and has **zero** call sites for the
  `window.chayxana` preload bridge. The admin UI already speaks nothing but HTTP, which is why the
  browser gallery works.
- There is **no raw SQL** anywhere in the server tree and no SQLite-specific syntax. The data layer
  is portable as written.

So the work is not a rewrite. It is: a database swap, a printing architecture, hardening for public
exposure, and deployment.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Where does the server run | On the owner's VPS, behind their domain, TLS terminated at a reverse proxy. The till becomes a browser. |
| D2 | What happens when the internet drops | The till cannot take payments. Accepted knowingly, with the trade stated. No offline mode is built. |
| D3 | Database | PostgreSQL. **Fresh start** — no data is migrated from the current Windows install. |
| D4 | How does the bill print | A local Windows **print agent** at the chayxana keeps `receipt.exe` and pulls jobs from the server over an authenticated socket. |
| D5 | What if the printer or agent is down | The sale commits anyway. The print becomes a queued job with its own state, reprintable from the ticket. |
| D6 | What happens to the Electron app | Kept buildable, but **reduced to a kiosk shell** onto the domain. It is not an offline fallback. |
| D7 | How is the code laid out | One copy. The server and the UI become workspace packages that both deployment targets consume. |
| D8 | Are the review's security findings in scope | Yes. On a LAN they were annoyances; on a public domain they are the front door. |

**D6 is the one to revisit first if it turns out to be wrong.** The instruction given was "keep it
buildable alongside"; this design reads that as "keep producing a Windows artifact", not "keep a
second self-contained application". A genuinely offline-capable desktop build means two Prisma
providers, two migration histories, and a sync story for money rows — roughly double this project.
Nothing here forecloses that; it just is not built.

## 3. Target architecture

```
packages/db/          Prisma schema (postgresql), migrations, generated client
packages/server/      Express + Socket.io API — routes, controllers, services, repositories
packages/admin-ui/    React 19 + Vite SPA (today's renderer, Blocks C1 untouched)

apps/web/             Node entry: boots packages/server, serves the admin-ui build   → VPS
apps/agent/           Windows print agent: socket client + receipt.exe               → the till
apps/master/          Electron kiosk shell pointing at the domain                    → keeps package:win
apps/order/           untouched — MASTER_URL changes only
apps/mobile/          untouched — MASTER_URL changes only
```

`pnpm-workspace.yaml` already globs `packages/*`, so no workspace change is needed.

### What moves

Both trees move with `git mv` so history follows and the relative imports inside each tree stay
valid:

- `apps/master/src/main/server/**` → `packages/server/src/**`
- `apps/master/src/renderer/**` → `packages/admin-ui/src/**`
- `apps/master/gallery/**` → `packages/admin-ui/gallery/**`
- `apps/master/prisma/schema.prisma` → `packages/db/prisma/schema.prisma`
- `apps/master/src/main/pdf-report.ts` → `packages/server/src/pdf-report.ts` (pdfkit, server-side already)
- `apps/master/cpp/`, `resources/bin/receipt.exe` → `apps/agent/`

### What is deleted

Each exists only to serve Electron or SQLite:

- `sqlite-bootstrap.ts` — in-process sql.js migrations and the seeded credentials. Replaced by
  `prisma migrate deploy` and first-run setup (§7).
- `prisma-runtime.ts` — packaged-binary path resolution for the Prisma engine.
- `mdns-advertise.ts` — LAN discovery. The server has a domain now.
- `app-identity.ts`, `installer.nsh`, `installer.next.nsh`, `package-win-next.mjs` — the
  production/next variant machinery. It exists to keep two SQLite databases apart; with one Postgres
  server there is nothing to keep apart.
- `server/printer/binary-resolver.ts` — the single Electron import in the server tree.
- `preload.ts`'s PDF bridge — zero call sites today; the SPA downloads the PDF over HTTP instead.

### `apps/master` is broken from slice 1 until slice 5

Moving the two trees out and deleting the variant machinery breaks the Electron build immediately.
That is intended and it is the cost of keeping one copy of the code rather than two: `apps/master`
does not build again until slice 5 rebuilds it as a kiosk shell. If a working Windows installer is
needed in the interim, it comes from `feat/remove-walkout`, which is untouched by this branch.

### What survives unchanged

The Telegram bot, the scheduler, the receipt builder, every service, every repository, every route,
and the entire renderer including Blocks C1. They move; they do not change, except where §5 and §7
name a specific file.

## 4. Data layer

`provider = "postgresql"`. A single new initial migration is generated; the 17 SQLite migrations are
not carried forward, which is what D3's fresh start buys. The consequence is explicit: **after this
lands, the current Windows install's database can never be migrated into the web system.** If the
owner changes their mind about the fresh start, that decision has to be revisited before slice 1
ships, not after.

**The 39 `Decimal` columns get explicit types.** They carry no `@db.` annotation today, which is
harmless on SQLite but becomes `Decimal(65,30)` on Postgres. Each gets `@db.Decimal(14, 2)` — 14
digits covers any so'm figure this business will produce, and keeping `Decimal` rather than moving to
integer so'm means `Prisma.Decimal` arithmetic and the `.toFixed(0)` DTO boundary stay exactly as
they are. Converting to integers would be a larger and riskier change to the finance layer for no
gain here.

**Concurrency.** Postgres gives real row-level locking, which is what makes the transaction races in
`TECHNICAL_REVIEW_2026-08-16.md` findings 4 and 9 both fixable and provable. Prisma's `$transaction`
runs at Read Committed, so the compare-and-swap pattern is still required — Postgres does not fix
those bugs, it makes fixing them meaningful. The fixes themselves are not in this project's scope;
they are pre-existing work that slice 1 must not make harder.

**Backups.** `pg_dump` on a timer with retention, plus an off-box pull. This closes the worst finding
in the review — today nothing backs up anything.

## 5. Printing

The printer is physical and stays at the chayxana. The server is on a VPS. Nothing in the current
design survives that split unchanged.

### The agent

`apps/agent` is a small Node process running on a Windows machine at the venue. It holds
`receipt.exe` and knows one server. It is deliberately dumb: **the server renders the receipt
payload** using the existing `printer/receipt-builder.ts`, and the agent only spools bytes. The agent
is the component hardest to update in the field, so no business logic lives in it.

Configuration: server URL, agent token, printer name. Installed as a Windows service so it survives a
reboot.

The exact hand-off format is settled at implementation against `receipt.exe`'s real argument
interface (`cpp/receipt.cpp`), which takes a printer name and a payload today. The requirement this
design fixes is only that the agent receives something already rendered and does not decide what a
receipt says.

### The protocol

1. Agent connects to the `/agent` Socket.io namespace and authenticates with a shared token from the
   environment. One venue, one token.
2. On connect, the agent drains the backlog: `GET /api/print-jobs/pending`.
3. The server emits `print:job` when a new job is enqueued.
4. The agent **claims** a job — `PENDING → CLAIMED`, stamped with agent id and time — before
   printing, so a reconnect cannot double-print. A `CLAIMED` job older than five minutes returns to
   `PENDING`.
5. The agent runs `receipt.exe` and reports: `POST /api/print-jobs/:id/result { ok, error? }`.
6. The server marks `DONE` or `FAILED`. A failed job is retryable by the admin from the ticket.

`PrintJob` already exists in the schema and already has a status. It gains the claim fields.

### The confirm flow changes in exactly one place

Today (`order.service.ts:689-730`), `confirm` prints **inside** the database transaction and a print
failure rolls the whole sale back. That guarantee cannot cross a WAN: holding a Postgres transaction
open across a round-trip to a machine at the chayxana is not acceptable.

```
before:  BEGIN → snapshot → Payment/Debt → print (blocking) → CLOSED → COMMIT
after:   BEGIN → snapshot → Payment/Debt → CLOSED → enqueue PrintJob → COMMIT → agent prints
```

The sale is money-final at commit. Paper is a job. The ticket shows a pending or failed print with a
reprint action, and jobs queue while the agent is offline and drain on reconnect.

This is a real behaviour change for the owner: today a printer fault silently protects them from a
sale with no receipt; after this it does not. That is the cost of D5 and it was chosen deliberately.
Two things offset it — the failure is now *visible* rather than a rolled-back transaction that left
no trace, and a jammed printer no longer stalls every other write on the database
(`TECHNICAL_REVIEW_2026-08-16.md` finding 11).

## 6. Waiter clients

Out of scope as feature work, in scope as a config change. Both apps hardcode a LAN default and will
stop working the moment the server leaves `192.168.1.50:4000`:

- `apps/mobile/app.config.js` — `extra.MASTER_URL`
- `apps/order` — `MasterUrlProvider`, persisted in `userData`

Both get pointed at the domain. Their API contract does not change: the server keeps Bearer tokens in
a header rather than moving the admin SPA to cookies, precisely so these two clients are unaffected.
Bearer also means there is no CSRF surface to defend.

## 7. Public exposure

These are not new features. They are findings from `docs/TECHNICAL_REVIEW_2026-08-16.md` that were
tolerable on a LAN and are not tolerable on a public domain, so this project closes them:

| What | Where | Why it changes here |
|---|---|---|
| Seeded `owner/owner123`, `admin/admin123`, written to `startup.log` | `sqlite-bootstrap.ts:145,187` | The file is deleted anyway. Replaced by first-run setup: while no users exist, `POST /api/setup` creates the OWNER with a chosen password; afterwards the route 404s. |
| No rate limit on `/api/auth/login` | `auth.routes.ts:8` | Only the PIN route is limited today, and it returns 409 rather than 429. Both get a real per-IP limit. |
| One mistyped PIN locks every waiter | `auth.service.ts:103`, `user.repo.ts:19` | `findActiveByPin` ignores its argument and `ensureNotLocked` runs before the compare. Fix: match first, lock the matched user, and add an admin unlock — today nothing can clear it. |
| ADMIN can PATCH itself to OWNER | `user.service.ts:79` | Reject role changes unless the actor is OWNER, reject self-role edits, audit the change. |
| `/api/finance/daily` ships `pnl.profit` to ADMIN | `finance.service.ts:288` | Role-filtered DTO. Client-side hiding is not a control on a public API. |
| CORS is open | `server/app.ts` | Allowlist the origin. Same for the Socket.io handshake. |
| No TLS | — | Terminated at the reverse proxy. `trust proxy` set so the rate limiter sees real client IPs. |

Secrets come from the environment and never enter git, per the machine-wide policy.

## 8. Configuration and deployment

Everything infrastructural moves to environment variables; business settings stay in the `Setting`
table where they are:

`DATABASE_URL`, `PORT`, `APP_ORIGIN`, `AGENT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TZ=Asia/Tashkent`.

Deployment is Docker Compose on the VPS: the Node app, Postgres, and a reverse proxy for TLS. The
existing `compose.dev.yaml` harness becomes the local equivalent of the real thing rather than a
special case, which is a quiet win — the thing being tested locally is the thing that ships.

`TZ` matters more than it looks: every finance window is a half-open Asia/Tashkent range anchored at
literal `+05:00` in `lib/time.ts`, and the review confirmed that layer is correct. Running the
container in any other zone must not be able to change it, so the anchor stays explicit and the
environment variable is belt and braces.

## 9. Verification

The review's blunt finding was that **there is no gate**: CI builds a Windows installer with no
typecheck, no lint and no test, `pnpm lint` is three `echo`s, and of ten smoke scripts three assert
anything meaningful.

This project does not inherit that. Slice 1 adds **Vitest to `packages/server`**, which the
machine-wide policy has required all along, and the first tests cover the things that cost money: the
billing formulas, the stock consume/restore pair, and the confirm guards. The existing HTTP smokes
are retargeted at `apps/web` and keep their role as end-to-end checks.

CI runs typecheck plus tests on every push, and that gate exists before slice 4 deploys anything.

## 10. What is untouched

Verified correct in `docs/TECHNICAL_REVIEW_2026-08-16.md` and deliberately preserved:

- **Bill arithmetic.** FOOD-only subtotal, xizmat haqi from SERVICE lines, service never discounted
  and surviving a 100% food comp, total clamped non-negative, payments summing exactly.
- **Stock at line-add.** Consume on add, restore from both DRAFT and SENT, the atomic conditional
  decrement that makes oversell impossible.
- **The cash-drawer rule.** `cashOut = gross − sameDayReversal`, never `expenseNet`.
- **Tashkent time handling** and server-stamped timestamps.
- **Blocks C1** and every screen in the admin UI. This project moves the renderer; it does not
  redesign it.
- **The order state machine.** `DRAFT → SENT → CLOSED`, `DRAFT|SENT → CANCELED`.

## 11. Slices

Each is independently shippable, in this order. **The implementation plan that follows this spec
covers slice 1 only**; slices 2 to 5 each get their own plan when their turn comes, so no plan
outruns what the previous slice actually proved.

1. **Extract and run on Postgres — done 2026-08-16.** The package moves, provider swap,
   `@db.Decimal` typing, Vitest, `apps/web` boots and serves the SPA locally in Docker. No behaviour
   change and no new features — the point is that the same system runs in a new shape. Implemented on
   `feat/web-platform`, commits `3ea8c1f..ba1c426`. All four HTTP smokes pass against Postgres, and
   the P&L and range builders agree independently on 277800.

   Three things the plan got wrong and the work corrected, recorded because they are the kind of
   mistake that recurs: the typecheck floor is 63 rather than 49 once `scripts/` is included for the
   first time; `apps/web` cannot typecheck clean because it consumes the server as TypeScript source,
   and project references cannot fix that until the 49 pre-existing errors are cleared; and dropping
   the dead models did require a code change after all, because `Expense.purchaseId` was a foreign key
   to one of them.
2. **Print agent.** Protocol, `apps/agent`, the confirm change in §5, job state surfaced in the
   admin UI with a reprint action.
3. **Public hardening.** Everything in §7.
4. **Deploy.** Compose on the VPS, reverse proxy, `pg_dump` backups with an off-box pull, CI gate.
5. **Kiosk shell and client URLs.** `apps/master` reduced to a shell; `apps/order` and
   `apps/mobile` pointed at the domain.

## 12. Out of scope

Offline mode and any local write path. Multi-venue or multi-tenant. Split and merge bills, per-line
discounts, Click and Payme — still excluded, as in v1. Migrating the existing Windows database.
Rewriting the waiter apps. The pre-existing money-path bugs from the review that are not named in §7:
they are real and they are tracked, but fixing them is separate work and mixing it into a platform
move would make both impossible to verify.

## 13. Risks accepted

- **The till depends on the internet.** An outage stops payments entirely. Chosen with the trade
  stated (D2).
- **A closed sale can briefly have no paper.** Chosen (D5); the job is visible and retryable.
- **The current install's history is discarded.** Chosen (D3), and irreversible once slice 1 ships.
- **No desktop fallback.** Follows from D6.
