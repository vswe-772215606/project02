# PRD 10 — Backup & disaster recovery

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Ops (data durability, recovery)
- **Related code:** `apps/master/src/main/sqlite-bootstrap.ts`, `apps/master/src/main/index.ts`, electron-builder `extraResources` config
- **Related docs:** PRD 02 (DB strategy — SQLite), PRD 04 (server lifecycle)

---

## 1. Context

The Chayxana POS production data lives in **one file**: `app.getPath('userData')/data/master.sqlite` on the Windows machine that runs Master. There is **no backup story today**:

- No scheduled dump.
- No file copy to external storage.
- No off-machine replication.
- No restore documentation.
- No verification that a restore would work.

Per `decisions.md` and the existing system: each chayxana is a single-tenant, single-location, single-machine deployment. The single machine *is* the system of record. If its disk dies, gets ransomware'd, or the building has a fire, the chayxana loses:

- All historical orders, payments, debts.
- All audit logs.
- Settings, users, menu, table configuration.
- Telegram bot config (chat IDs, tokens).

Real-world stakes for a single chayxana:

- **Disk failure**: SSDs on cheap POS hardware fail. Not common, not negligible.
- **Power events**: Tashkent grid is OK but not perfect. Bad shutdown of SQLite usually recovers via WAL but is the most common corruption trigger.
- **Ransomware**: a chayxana cashier accidentally running a malicious attachment encrypts the DB. Has happened to similar businesses.
- **OS reinstall**: Windows reinstall by a technician who doesn't know what to preserve. Has *definitely* happened.
- **Accidental deletion**: someone uninstalls the app expecting "no data to lose."
- **Theft of the physical machine**.

Recovery without a backup means recreating: menu, users, tables, settings (~half a day of admin work) + losing all historical financial data, all open debts (the chayxana literally forgets who owes them money), all owner reports.

This PRD is to specify a **practical backup story** that survives the operator-is-not-a-sysadmin constraint.

**Note on cross-reference:** PRD 02 may decide to migrate to Postgres. The backup story differs slightly (`pg_dump` vs file copy) but the *operational* shape — automated local snapshots + off-machine copies — is the same.

## 2. Goals / Non-goals

### Goals

- Define a recovery point objective (RPO): how much data is acceptable to lose in a disaster. Suggest **24 hours** as a starting point (one calendar day).
- Define a recovery time objective (RTO): how long to restore service. Suggest **2 hours** (replace machine, install app, restore latest snapshot).
- Specify the backup mechanism, schedule, and verification.
- Specify the restore procedure in operator language.
- Make backup transparent — the operator should not have to remember to do anything.

### Non-goals

- Geographically distributed replication. Out of scope.
- Point-in-time recovery to the second. Daily granularity is enough.
- Multi-master replication. Out of scope.
- Backing up renderer logs, electron debug artefacts, anything in `Local Storage`. Only the DB and the settings that aren't in the DB.

## 3. Current state (code-grounded)

| Concern | File / lines | Behaviour |
|---|---|---|
| DB location (packaged) | `sqlite-bootstrap.ts:181-185` | `app.getPath('userData')/data/master.sqlite`. |
| DB location (dev) | `apps/master/.env:3` | `./dev.db` (in working directory). |
| WAL mode | Implicit | Prisma over sql.js → standard SQLite, journal mode default. May or may not be in WAL — needs confirmation. |
| Backup schedule | None | — |
| Backup destination | None | — |
| Backup verification | None | — |
| Restore tooling | None | — |
| Operator awareness | None | The packaged app does not mention backup anywhere. |

### What's in the DB

Per `schema.prisma`:

- User, Session, Setting
- Category, MenuItem, Combo, ComboComponent
- Table, Order, OrderLine, KitchenTicket
- Discount, Payment, Debt, DebtRepayment
- DailyStock, AuditLog, PrintJob, Expense, ExpenseCategory

All operational + financial data. Loss is total business loss.

### What's *not* in the DB (still needs preservation)

- The `userData` folder also contains Electron's `Local Storage`, runtime logs (`startup.log`, `runtime.log`, `renderer.log`). Useful for debug but not required for recovery.
- Receipt-template strings live in settings (in the DB) — covered.
- `receipt.exe` is in `extraResources`, ships with the installer — covered (recoverable by reinstall).

## 4. Options

### Option A — File-copy with rotation, fully local, scheduled by Master

Master itself, on a daily timer, performs a hot copy of `master.sqlite` to a rotated set of local backup files. Operator's only job: connect a USB stick or share once a week and copy files to it (or this is automated to a known location).

- **Mechanism:**
  - On Master startup, register a daily scheduler tick (extend `startScheduler` from `index.ts:87`). At 03:00 local time (after the chayxana is closed), perform: `SQLite VACUUM INTO 'master-backup-YYYY-MM-DD.sqlite'` into `userData/backups/`.
  - Keep last 7 daily + last 4 weekly + last 6 monthly. Total: ~20MB × 17 ≈ 350MB.
  - Log success/failure to the audit log. Surface in owner Telegram morning summary.
  - Optional: also copy to a configurable second path (settings: `backup_external_path`). Operator configures this once to point at a network drive / USB stick.
- **Pros:**
  - Zero operator burden in the default case.
  - SQLite `VACUUM INTO` is the canonical hot-backup approach. Atomic. Doesn't require Master to stop.
  - Backups live next to the DB — easy to find for restore.
- **Cons:**
  - Backups live on the same disk as the primary. A disk failure loses both. **Insufficient alone for the "machine dies" scenario.**
  - The optional external path requires operator action; if they don't set it, only local backups exist.

### Option B — Cloud snapshot (Telegram, S3, or similar)

Daily backup uploaded to an off-machine destination over the internet.

- **Mechanism:**
  - Same daily VACUUM INTO as Option A.
  - Then upload the resulting file to either:
    - **B1.** Telegram (send as document to the owner chat — the same bot that delivers daily summaries). Telegram document limit is 50MB; our DB is well under that for years.
    - **B2.** S3 / Backblaze / similar cloud blob storage. Requires credentials; ops complexity.
    - **B3.** Google Drive via API. Auth complexity.
  - Owner doesn't have to do anything; the backup arrives in their pocket.
- **Pros (B1 Telegram specifically):**
  - Off-machine, geographically distant, encrypted in transit, **already configured** (the bot is set up).
  - Owner literally has the backup on their phone. Restore involves them forwarding the file.
  - Free.
  - Zero operational complexity vs Telegram.
- **Cons:**
  - Telegram is not an official backup service. Owner could delete the chat. Mitigated by pinning or by also keeping local copies.
  - For B2/B3: credentials management, ops complexity, monthly cost.

### Option C — External-drive auto-sync

Master detects when a configured external drive (USB stick / network share) is connected and syncs latest backups to it.

- **Mechanism:**
  - Settings: `backup_drive_path` (e.g. `D:\chayxana-backup`).
  - Scheduler polls every 5 minutes; if the path is reachable, rsyncs the `userData/backups/` folder.
- **Pros:** off-machine; survives ransomware (if the drive is normally disconnected); cheap.
- **Cons:** requires operator to plug in the drive periodically. Forgetting = no backup.

### Option D — Manual operator-driven backup

Just document a procedure: "copy this file once a week." Owner Telegram morning summary reminds them.

- **Pros:** zero code.
- **Cons:** the operator forgets. Backups don't happen. Same as no backup in practice.

### Option E — Continuous WAL streaming to a replica

Real-time replication to a second machine.

- **Pros:** RPO near zero.
- **Cons:** requires a second machine; nothing in v1 setup justifies this complexity. Reject.

## 5. Decision matrix

| Dimension | A (local rotation) | B1 (Telegram) | B2/B3 (cloud) | C (USB sync) | D (manual) | E (replica) |
|---|---|---|---|---|---|---|
| Survives disk failure | If external path set | Yes | Yes | If drive connected | If operator did it | Yes |
| Survives ransomware | Partial | Yes | Yes | If drive normally disconnected | No | If air-gapped |
| Operator burden | None (default) / one-time setup | None | Setup credentials | Plug drive in | Remember to copy | High |
| Recurring cost | None | None | Monthly | None | None | Machine + power |
| Recovery clarity | Good (files visible) | Good (in chat) | OK | OK | Bad | Complex |
| Effort to build | S | S | M | S | XS | XL |

## 6. Open questions

1. **Owner's relationship with Telegram:** if the owner uses Telegram daily (already configured for finance summaries), B1 is delightful. If not, useless.
2. **DB size growth:** at current data volume the DB is probably <5MB. Over years it could grow into tens of MB. Telegram's 50MB document limit is a future ceiling — should we plan for compressed (gzip) uploads from day one? Yes — trivial.
3. **What does the owner consider "lost data"?** Last 24h? Last hour? The RPO choice depends on what's tolerable.
4. **Are operator IT skills uniform across chayxanas?** If yes, we can pick one option and document. If varied (some have a son who's a sysadmin, some don't), we may need a tiered story: defaults work for everyone; advanced ops can configure more.
5. **Telegram bot rate limits:** ~30 messages/sec, ~20 documents/min. Single daily upload is fine.

## 7. Recommendation

**Option A + Option B1 (Telegram) combined.**

- **Local rotated backups (A)** are the cheap, fast restore path. Most "I deleted the wrong thing" disasters recover from a local file in seconds.
- **Daily Telegram upload (B1)** is the off-machine survival path. Free. Owner already has Telegram. Encrypted in transit. Survives ransomware, disk failure, theft.

This pair maps cleanly to the operator profile: nobody has to remember anything. The owner gets a small daily Telegram message containing the backup file with a one-line caption ("Chayxana zaxira nusxasi — 2026-05-15, 18kB"). If something goes wrong, they forward the file back to a technician.

If C (USB) is also wanted by paranoid owners, it can be a setting they configure — additive, no conflict.

RPO: **24 hours** (last-night's snapshot). RTO: **2 hours** (replace machine, reinstall app, drop backup file into the data folder).

## 8. Rollout

### Phase 1 — local rotation (Option A)

1. **Scheduler hook**: extend the existing scheduler (`startScheduler` in `apps/master/src/main/server/lib/scheduler.ts` — should exist as referenced from `index.ts:87`) with a daily 03:00 local job.
2. **Backup logic**: `prisma.$queryRawUnsafe(\`VACUUM INTO '\${path}'\`)`. SQLite supports this directly. The result is a self-contained DB file.
3. **Rotation**: keep last 7 daily, last 4 weekly (Sundays), last 6 monthly (1st of month). Total ~17 files; ~50MB of disk at year 5.
4. **Audit + log**: success/failure rows in AuditLog (`BACKUP_LOCAL`). Daily Telegram summary surfaces success ("Zaxira: ✓").
5. **Settings**: `backup_local_enabled` (default true), `backup_local_path` (default `userData/backups`).

### Phase 2 — Telegram upload (Option B1)

1. **Compress**: gzip the snapshot before upload. SQLite compresses ~5×.
2. **Upload**: use the existing Telegram bot. New method `telegramBotService.sendDocument(buffer, filename, caption)`.
3. **Schedule**: same daily timer as Phase 1. After successful local backup, attempt upload. Failures: retry next day; don't block local rotation.
4. **Settings**: `backup_telegram_enabled` (default true if bot is configured), `backup_telegram_caption_format`.
5. **Audit**: `BACKUP_TELEGRAM` event.

### Phase 3 — restore tooling

1. **Operator README**: one-page "Zaxiradan tiklash" (Restoring from backup) doc with screenshots. Steps:
   1. Install app fresh.
   2. Quit app.
   3. Replace `userData/data/master.sqlite` with the backup file (rename it to `master.sqlite`).
   4. Start app.
2. **In-app restore helper**: optional Phase 3.5 — admin UI page "Tiklash" that takes a `.sqlite` file via drag-and-drop, validates it (schema check, recent timestamps), confirms with the owner, and replaces the active DB after the app prompts to restart. Only OWNER role.
3. **Test in CI / on a fresh VM**: at least one packaged-build test that includes "create some data, take a backup, wipe userData, restore backup, verify data is back."

### Phase 4 — verification

1. **Daily restore-test job (paranoia mode):** every Sunday, in-process: copy the latest backup to a temp file, open it with sql.js, run a `SELECT COUNT(*) FROM Order WHERE closedAt > date('now', '-1 day')`, assert > 0 if there were orders yesterday. Report failures to the owner.
2. **Boot-time check**: if no backup has been taken in the last 48h, alert in the admin UI banner.

### Observability

- Daily Telegram summary line: "Zaxira: ✓ (local + cloud)" or "Zaxira: ⚠ faqat local" (local only) or "Zaxira: ✗ — tekshiring".
- Audit log entries for every backup attempt, success and failure.

### Rollback

- All phases are additive. Reverting any phase removes the corresponding job; no data loss.
- The restore tool (Phase 3.5) can be deferred indefinitely — manual file copy is the fallback.

### Cross-references

- **PRD 02 alignment:** if the database moves to Postgres, replace `VACUUM INTO` with `pg_dump --format=custom`. The schedule, rotation, Telegram-upload, and operator README stay identical in shape. Pre-build the abstraction (`backupService.takeSnapshot()`) so a future swap is easy.
- **PRD 04 alignment:** if Master becomes a Windows service, ensure the scheduler runs reliably regardless of whether the admin UI is open. Phase 1 should test "app running headless, no window open, 03:00 fires" before shipping.
