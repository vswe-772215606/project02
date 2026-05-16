# PRD 02 — SQLite vs. PostgreSQL: settle the database strategy

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Architecture (persistence, deployment)
- **Related code:** `apps/master/prisma/schema.prisma`, `apps/master/prisma/migrations/migration_lock.toml`, `apps/master/src/main/sqlite-bootstrap.ts`, `apps/master/.env`, `apps/master/package.json` (build/extraResources)
- **Related docs:** `docs/PROJECT_TECHNICAL_OVERVIEW.md` (§2 "Backend"), `docs/SESSION_HANDOFF_2026-05-05.md` (§3 + §6), `docs/agent-plans/00-shared/schema.md`

---

## 1. Context

The project documentation has, since the earliest plans, treated PostgreSQL as the eventual production database:

- `docs/PROJECT_TECHNICAL_OVERVIEW.md:18` — "SQLite via Prisma ORM (planned transition to PostgreSQL 16 for production)."
- `docs/SESSION_HANDOFF_2026-05-05.md:92` — "Database: PostgreSQL 16 on Linux (`chayxana_app` / `chayxana_dev_pw`). Note: Packaged Windows app uses SQLite."

The **code** has not followed that plan. As of 2026-05-15:

- `prisma/schema.prisma:7` pins `provider = "sqlite"`.
- `prisma/migrations/migration_lock.toml:3` pins `provider = "sqlite"`.
- Dev `apps/master/.env:3` is `DATABASE_URL="file:./dev.db"`.
- Packaged Windows installs an SQLite file at `app.getPath('userData')/data/master.sqlite` via `sqlite-bootstrap.ts`. Migrations are run **in-process** by a custom sql.js-based runner (`apps/master/src/main/sqlite-bootstrap.ts:26-108`) because the Prisma CLI cannot run from inside an electron-builder NSIS install. This was a significant engineering investment (commits `291e27a`, `7acfb1a`, `090ac95`).

So there is **no dual-DB today**. There is a **documented intent to migrate** and a **codebase that has actively diverged from that intent** — including custom infrastructure (sql.js migration runner) that exists solely to make SQLite work inside Electron and would be discarded if we moved to Postgres.

The decision needs to be made before more SQLite-specific work compounds. Concrete pressure points:

- The Prisma schema is currently **SQLite-compatible** by construction: no JSONB, no partial indexes beyond what SQLite supports, no native UUIDs, no array columns. Every model design choice is silently shaped by "must work on SQLite."
- The custom migration runner means migrations can only contain SQL that sql.js can run. No `pg_*` functions, no Postgres extensions, no concurrent index creation.
- The finance reporting work added recently (commit `49993a2`) leans on Prisma aggregate queries; some operations that would be simple `SUM() OVER (PARTITION BY …)` in Postgres are decomposed into multiple round-trips because SQLite's window-function support is limited and Prisma's abstraction over it is inconsistent.

We need to decide: **commit to SQLite for v1 and beyond, or actually execute the Postgres migration before the SQLite-shaped code multiplies.**

## 2. Goals / Non-goals

### Goals

- Pick one of: (a) **SQLite forever** for this product, (b) **migrate to Postgres now** before more SQLite-specific code accumulates, (c) **migrate to Postgres on a defined trigger** (e.g. second location, multi-master, >N orders/day) and defer until then.
- If (a) — update docs to retire the Postgres plan, so future contributors stop building around an aspirational target.
- If (b) or (c) — define the migration scope: schema, data, deployment topology, packaging story (does Master still ship as a single NSIS installer if it now depends on Postgres?).

### Non-goals

- Replacing Prisma. We're staying with Prisma either way; the question is the underlying provider.
- Multi-tenant / multi-location architecture. That's downstream of this decision but not in scope here.
- Schema redesign. Whatever DB we pick, the existing schema is correct enough; this PRD is about engine, not modelling.

## 3. Current state (code-grounded)

### What we have

| Aspect | Current state |
|---|---|
| Prisma provider | `sqlite` (locked in schema and migration lock) |
| Dev DB path | `apps/master/.env`: `file:./dev.db` |
| Production DB path (packaged Win) | `app.getPath('userData')/data/master.sqlite` |
| Migrations runner (dev) | Prisma CLI (`prisma migrate dev`) |
| Migrations runner (packaged) | Custom in-process sql.js runner (`sqlite-bootstrap.ts:26-108`) with `_app_migrations` checksum table |
| Seed (packaged) | In-process, runs once when user count is 0 (`sqlite-bootstrap.ts:110-160`) |
| Concurrency model | One Electron main process; one Prisma client; SQLite WAL implicit |
| Backup story | None documented (see PRD 10) |
| Telegram bot | Reads via the same Prisma client (`telegram-bot.service.ts`) |

### What is invariant either way

- Schema models (User, Order, OrderLine, KitchenTicket, etc.) are provider-agnostic at the Prisma level.
- Repository layer (`repositories/*.repo.ts`) is the only Prisma-touching code per `conventions.md`. Migrating providers does **not** touch services.
- Socket.io, REST, auth, print — all unaffected.

### What is SQLite-specific today

- `binaryTargets = ["native", "windows", ...]` in `schema.prisma:3` exists only because of how we package the SQLite engine across OSes.
- `extraResources` in `apps/master/package.json` ships `prisma/migrations` + `.prisma/client` into the installer. With Postgres, migrations would still ship but the engine binaries would shrink.
- `sqlite-bootstrap.ts` (213 lines, full sql.js migration runner). Disappears entirely on Postgres.
- Atomic stock decrement uses a single-statement `update … where currentCount >= ?`. Works the same on Postgres.
- `Decimal` columns are stored as text in SQLite via Prisma's mapping. Postgres uses native `numeric`. Reports that currently call `decimalToInt` in `order.service.ts:34-45` are robust to either.

## 4. Options

### Option A — Stay on SQLite, formalise it

Commit to SQLite as the production DB. Update docs to retire the Postgres-migration plan.

- **Mechanism:** delete every "planned transition to Postgres" sentence in docs. Lock the decision in `decisions.md`. Continue using the sql.js bootstrap runner. Accept that the per-install DB is the durable system of record.
- **Topology:** one DB per master install. Backup story is "back up `master.sqlite`." Cross-location aggregation, if ever needed, is a separate ETL job — out of scope here.
- **Pros:**
  - Zero migration risk.
  - Keeps the single-NSIS-installer story (massive operational simplicity for the chayxana — owner double-clicks an .exe).
  - No daemon to keep alive; no `pg_ctl`; no Windows service to manage; no network config.
  - The sql.js bootstrap already works and is checksummed.
- **Cons:**
  - SQLite single-writer semantics: the master process is the only writer. Today this is fine (one Electron app). If we ever want a "headless" master + admin tool talking to the same DB, we'd need WAL + careful coordination. Postgres handles this for free.
  - No partial indexes with `WHERE` conditions involving function calls (the `Order.tableId` partial unique index works because it uses only IS NULL / status enum; that's fine).
  - JSON columns are TEXT. Prisma's `Json` field works but no server-side indexing.
  - Cross-location reporting requires manual aggregation.
- **Cost / effort:** XS (delete doc lines, add a decision entry). Done in an afternoon.

### Option B — Migrate to PostgreSQL now

Move the production target from SQLite to Postgres before more code accretes around SQLite assumptions.

- **Mechanism:**
  1. Change `provider = "postgresql"` in `schema.prisma` and `migration_lock.toml`.
  2. Re-generate migrations (the cleanest path is to wipe and re-baseline since no real production data exists at scale yet, per `SESSION_HANDOFF`).
  3. Replace the sql.js bootstrap with **shipping a Postgres binary inside the Master installer** (embedded Postgres). Several options exist (e.g. `pg_embed`, postgresql portable). Or run Postgres as a Windows service installed by the NSIS installer's `installerHeader` step.
  4. Update `electron-builder` config to bundle the Postgres binaries or to script their installation.
- **Topology:** one Postgres instance per master machine, listening on `127.0.0.1:5432`, started by Electron on boot. Data dir under `app.getPath('userData')/postgres/`.
- **Pros:**
  - Native JSON, partial indexes with anything, generated columns, window functions, real `numeric`, real `timestamp with time zone`.
  - Concurrent readers/writers — future "background job" service or "headless master" daemon is trivial.
  - Backup tooling is industry standard (`pg_dump`, `pg_basebackup`).
  - Multi-location: a future cloud aggregator can ingest Postgres dumps natively.
- **Cons:**
  - **Operational risk on Windows.** Embedded Postgres works but has more failure modes than SQLite: port conflicts, service startup races, data-directory corruption that's harder to recover from than a single SQLite file.
  - Adds ~80-150MB to the installer size.
  - Migration of the in-process bootstrap runner: we'd still need *something* to ensure Postgres is started and migrations applied on first run.
  - The packaged-NSIS installer becomes substantially more complex (service install scripts, firewall rules for 5432, retry-on-port-busy).
  - Real adoption risk: if chayxana ops staff need to reinstall, the Postgres install step is the most likely to fail in the field.
- **Cost / effort:** L. Roughly 2-3 weeks if we do it carefully (embed Postgres + retest packaging + retest install on a fresh Windows box) plus follow-on tuning.

### Option C — Defer; migrate on a defined trigger

Stay on SQLite for v1, but **lock the trigger** that flips us to Postgres. Until the trigger fires, all schema-level decisions assume "we will need to migrate eventually."

- **Mechanism:**
  - Lock the trigger in `decisions.md`. Candidate triggers (pick exactly one):
    - "Second physical location signed."
    - ">5,000 orders / day sustained for a month."
    - "Owner asks for cross-location finance reporting."
  - Until the trigger: continue SQLite-only. Forbid schema features that have no SQLite equivalent (we already do this implicitly; make it explicit).
  - Maintain a **migration spike** repo or branch: a one-page schema diff that demonstrates the SQLite → Postgres migration plan works end-to-end on a copy of production data. Re-run it every release so it doesn't bit-rot.
- **Pros:**
  - Buys time without forcing a binary commitment.
  - Forces the team to *know* what would change. Trigger date is the migration date, not "after we discover the limit."
- **Cons:**
  - Easy to drift. If no one re-runs the spike, the deferred migration becomes harder over time.
  - The "trigger" can be slippery — owners always say "not yet" when the alternative is downtime.
- **Cost / effort:** S now (write trigger + spike), recurring small effort to maintain the spike.

### Option D — Hybrid: SQLite for the chayxana, Postgres for a cloud aggregator (separate project)

Keep the per-chayxana master on SQLite forever. If multi-location reporting ever becomes a thing, build a separate **read-only** Postgres aggregator that ingests SQLite snapshots / change-data-capture from each location. Each chayxana's master stays simple.

- **Pros:**
  - Operational simplicity at the edge (the only thing that runs on a Windows monoblock in a chayxana stays SQLite). Cloud is a separate concern with its own deployment.
  - Read-only aggregator is much simpler than a Postgres-on-Windows install.
- **Cons:**
  - Two systems to maintain. ETL drift risk.
  - Doesn't solve any concurrency issue at the master (still single-writer SQLite).
- **Cost / effort:** Whenever the aggregator becomes needed. Today, S to document; L when actually built.

## 5. Decision matrix

| Dimension | A (SQLite forever) | B (Postgres now) | C (defer + trigger) | D (hybrid) |
|---|---|---|---|---|
| Operational complexity at chayxana | Lowest | Highest | Low (until trigger) | Lowest |
| Schema power | Low | High | Low (until trigger) | Low (master) / High (aggregator) |
| Backup story | "copy one file" | `pg_dump` | "copy one file" | "copy + replicate" |
| Concurrency | Single writer | Native | Single writer | Single writer |
| Future multi-location | Hard | Easy | Becomes possible at trigger | Yes, via aggregator |
| Code we delete | None | sqlite-bootstrap.ts | None | None |
| Code we add | None | Postgres bundling + service mgmt | Migration spike | Aggregator (later) |
| Effort now | XS | L | S | XS |
| Reversibility | High (can still migrate later) | Low (committed) | High | High |

## 6. Open questions

1. **Is there a real plan for a second location?** If "maybe in 2027," Option A or C is correct. If "owner is actively scouting," Option B becomes urgent.
2. **What's the actual backup pain we have today?** If owners are losing data because no one copies `master.sqlite`, that's a backup PRD (PRD 10) issue, not a database-choice issue. Don't migrate to Postgres for the wrong reason.
3. **Does the Telegram bot or any future integration need to read the DB *while master is running*?** Today it shares Prisma client in-process, so SQLite is fine. If we ever want an external dashboard process to read the DB live, SQLite + WAL works but Postgres is cleaner.
4. **Operational support model:** when something breaks in the chayxana, who logs in? If "the developer SSHes in," Postgres recovery is fine. If "the owner emails a screenshot," SQLite's one-file model is much more recoverable.
5. **What was the original motivation for the "planned Postgres" line?** None of the existing docs explain it. Possibly inherited from a template. Worth asking the human before deciding.

## 7. Recommendation

**Option C — defer with a locked trigger** — with a strong lean toward folding into Option A if the trigger doesn't fire within 12 months.

Rationale:

- The actual operational target (one chayxana, single Windows machine, one admin who double-clicks an installer) maps perfectly to SQLite. There is no engineering reason to migrate *today*.
- But documentation has been ambient-promising Postgres for months, which has subtly shaped (a) reviewer expectations and (b) what schema features people think are "safe." Killing the ambiguity is the actual goal of this PRD.
- A locked trigger gets us the same operational simplicity as Option A while keeping the door open. The cost of maintaining a migration spike is bounded; the cost of an emergency migration mid-incident is not.
- If 12 months pass without the trigger firing, fold into Option A — that's a small follow-up PR (delete the spike, lock SQLite, retire the trigger).

Recommended trigger: **"Owner signs a second physical location, OR daily-finance Telegram report exceeds 1,000 line items per day for one calendar month."** First clause covers the operational reason to migrate; second clause covers the technical one.

## 8. Rollout

### If Option C (recommended)

1. **PR 1 — docs:** Update `PROJECT_TECHNICAL_OVERVIEW.md` and `SESSION_HANDOFF_2026-05-05.md` to remove "planned transition to Postgres" language. Replace with "SQLite is the production database; Postgres migration is gated by [trigger]."
2. **PR 2 — `decisions.md`:** Add an explicit "Database engine" section locking SQLite as the v1 engine and listing the trigger.
3. **PR 3 — migration spike (separate branch, not merged):** Demonstrate provider swap to Postgres against a recent dump. Document the steps. Tag the branch. Re-run quarterly.
4. **PR 4 — schema lint:** Add a comment block at the top of `schema.prisma` listing the SQLite-imposed constraints (so contributors know what features they can and can't use). Optional: pre-commit hook that flags JSON columns, generated columns, etc.

### If Option B

1. **Spike first.** Branch off main, change `provider = "postgresql"`, re-baseline migrations against a clean Postgres on dev. Confirm finance reports return identical numbers.
2. **Embedded Postgres for packaging.** Evaluate `pg_embed`, `embedded-postgres-windows`, or scripting `postgresql-portable` into the NSIS installer. Pick the option that survives a clean Windows 10/11 install with no prior Postgres.
3. **Install integration test.** Fresh Windows VM, run the installer, verify the app starts, run the api-smoke script.
4. **Data migration script** for any existing chayxana installs (likely zero today).
5. **Cutover plan.** Tag the last SQLite build. Ship Postgres build as a new major version.

### Observability for any path

- Add `db.kind = 'sqlite' | 'postgres'` to the boot log so we can tell from a support log which engine is running.
- Add a Prisma query log sample (1% of queries) to runtime logs in dev only — useful when comparing query behaviour cross-engine.

### Reversal plan

- If we pick Option A and later regret it: same as Option B's rollout (the spike branch is the artefact). Cost is the migration window, no further architectural change.
- If we pick Option B and it breaks in the field: keep the SQLite branch alive as a hotfix path for one release cycle. Any chayxana that hit issues falls back to SQLite while we stabilise Postgres.
