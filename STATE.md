# STATE — project02 (chayxana POS)

Five fields. Overwrite them, never append. If NEXT ACTION is not a command or a
file path, it is not specific enough. Everything below `<!-- auto:git -->` is
machine-written by the Stop hook — do not hand-edit it.

**GOAL**
A chayxana POS running on real hardware in a real restaurant: Uzbek-only, dense
enough for 1366x768, and able to update itself without a hand-delivered build.

**NEXT ACTION**
1. Build slice 1: run `docs/superpowers/plans/2026-09-30-server-money-guards.md` with
   superpowers:subagent-driven-development. Committed (7926371), not started. Its Task 1
   creates `../project02-guards` on `fix/server-money-guards` off `feat/auto-update` and
   versions the e2e suite from `../project02-finance-e2e` (Docker project `chayxana-guards`).
   Verify at the end: e2e 52 pass / 38 fail (90), `pnpm test` 119, `pnpm typecheck` 48.
2. Measure the finance causes on real data. Barkamol copies the till's
   `%APPDATA%\@chayxana\master\data\master.sqlite` (app closed) to
   `../project02-finance-e2e/apps/master/e2e/.data/prod/master.sqlite` (git-ignored, debtor
   data). There: `docker compose -f compose.dev.yaml -f compose.e2e.yaml -p chayxana-e2e up -d`,
   then `docker exec -w /app/apps/master chayxana-e2e-master-dev-1 pnpm exec tsx
   e2e/prod-forensics.ts e2e/.data/prod/master.sqlite --days=30`. Never run on real data.
3. After slice 1: design and plan slice 2 (money-rules §7) and the line-edit race in PRD 14
   §2; rewrite each e2e expectation in money-rules §5 as its slice lands.
4. Restore the update feed on avtobron — human-run, `docs/UPDATE_FEED_RUNBOOK.md` §2.5. Verify:
   `curl -sS https://updates.mutallib.uz/chayxana/master/production/latest.yml` prints YAML
   with `version: 0.1.4`. No fix reaches a till until this works.
5. Push: `git push -u origin feat/auto-update`, then `git tag v0.1.4 49b7243 && git push
   origin v0.1.4`. Unpushed: 20 commits, no upstream, no tag. Verify:
   `git ls-remote origin | grep -E 'auto-update|v0.1.4'`.
6. Audit report §11 "Shu hafta" (`docs/chayxana-pos-audit-2026-09-30.pdf`): backup, start
   with Windows — PIN lockout and printer fallback are in slice 1.

**LAST DECISION**
2026-09-30 — Barkamol settled the money rules, D9–D21 with D3, D4 and waiter payouts
confirmed (`docs/superpowers/specs/2026-09-30-money-rules-design.md`): Kassa is cash only;
the day ends 05:00 and closes with a cash count; a forgotten expense is corrected on the
day the cash left, with an owner message; write-offs book on their own day; food cost is
tan narx only; ADMIN may see profit. Slice 1 (`docs/prd/14-server-money-guards.md`): a
failed print leaves the sale closed and reprintable; five PIN misses lock the device, not
the floor; one SQLite connection (measured). Admins don't read notes — cash must match.

**OPEN QUESTION**
Barkamol, with the chayxana owner:
- Money-rules §6 assumptions: Hisobot opens to ADMIN too; a closed day may be corrected
  however far back. PRD 14 G5 assumes each waiter logs in from their own phone.
- Were the seeded owner/admin passwords changed on the till?
- Is a separate registered fiscal register used at the counter?
- Continue `feat/web-platform`? Which visual rulebook wins: `docs/UI_UX_RULES.md` or
  `docs/design/BLOCKS_C1.md`?

**DO NOT TOUCH**
- `../project02-finance-e2e` holds the only copy of the finance suite and diagnostic,
  untracked, until plan Task 1 copies it: don't remove or clean it. Never commit `e2e/.data/`.
- The ledger core (`reports.service.ts` dailyLedger, billing math, `cashOut` not
  `expenseNet`): every control passes. D9 and D11 change what it groups, not its formulas.
- `apps/master` deliberately does not build on `feat/web-platform`; the demo runs
  from `../project02-demo` on that branch, never from here.
- `docs/UI_UX_RULES.md` is the declared visual source of truth but conflicts with
  `docs/design/BLOCKS_C1.md`, which the renderer follows — don't restyle before OPEN QUESTION.
- avtobron is production for carmap.uz too; the feed lives in its
  `click-avto-nginx-1`. Never change or restart it from a session — hand over commands.
- `CLAUDE.md`'s uncommitted top block (`@STATE.md`, `@docs/UI_UX_RULES.md` imports) and
  `docs/chayxana-pos-audit-2026-09-30.pdf` are Barkamol's: don't commit or revert them.
- No `scripts/gate.sh`, no test CI. `pnpm test`: 90 tests in 8 files, pure helpers only.

<!-- auto:git -->
- branch: feat/auto-update
- last commit: 7926371 2026-09-30 docs(plan): server money guards, slice 1 implementation plan
- uncommitted files: 2
- refreshed: 2026-09-30 22:21
<!-- /auto:git -->
