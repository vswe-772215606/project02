# STATE — project02 (chayxana POS)

Five fields. Overwrite them, never append. If NEXT ACTION is not a command or a
file path, it is not specific enough. Everything below `<!-- auto:git -->` is
machine-written by the Stop hook — do not hand-edit it.

**GOAL**
A chayxana POS running on real hardware in a real restaurant: Uzbek-only, dense
enough for 1366x768, and able to update itself without a hand-delivered build.

**NEXT ACTION**
1. Measure the finance causes on real data. Barkamol copies the till's
   `%APPDATA%\@chayxana\master\data\master.sqlite` (app closed) to
   `../project02-finance-e2e/apps/master/e2e/.data/prod/master.sqlite` (git-ignored,
   holds debtor data). There: `docker compose -f compose.dev.yaml -f compose.e2e.yaml
   -p chayxana-e2e up -d`, then `docker exec -w /app/apps/master chayxana-e2e-master-dev-1
   pnpm exec tsx e2e/prod-forensics.ts e2e/.data/prod/master.sqlite --days=30`.
   Untracked; validated 18/18 on planted cases; never run on real data.
2. Version the finance e2e suite: untracked in the detached worktree
   `../project02-finance-e2e` (`apps/master/e2e/`, `vitest.e2e.config.ts`,
   `vite.e2e.config.ts`, `compose.e2e.yaml`). Move it to a branch off `feat/auto-update`,
   outside `pnpm test` (48 tests fail by design until fixed). Verify in the container:
   `pnpm exec vitest run --config vitest.e2e.config.ts` → 39 pass / 48 fail.
3. Fix the code-level causes test-first, with Barkamol's go-ahead (report causes 5–7:
   double confirm, repayment race, draft cleanup stock, print holding the SQLite lock,
   floor-wide PIN lockout, /xarajatlar, /hafta, dish-table total, bill register, waiter
   "Jami"). Each fix flips its e2e test green. Verify: suite + `pnpm test` +
   `pnpm typecheck` (floor 48). Shipping needs items 4–5.
4. Restore the update feed on avtobron — production, human-run, per
   `docs/UPDATE_FEED_RUNBOOK.md` §2.5 (serves carmap.uz's cert and SPA). Verify:
   `curl -sS https://updates.mutallib.uz/chayxana/master/production/latest.yml` prints YAML
   with `version: 0.1.4`. No fix reaches a till until this works.
5. Push what the customer runs: `git push -u origin feat/auto-update`, then
   `git tag v0.1.4 49b7243 && git push origin v0.1.4`. Unpushed: 16 commits, no tag.
   Verify: `git ls-remote origin | grep -E 'auto-update|v0.1.4'`.
6. Audit report §11 "Shu hafta" (`docs/chayxana-pos-audit-2026-09-30.pdf`): backup, start
   with Windows, PIN lockout, printer fallback — the last two overlap item 3.

**LAST DECISION**
2026-09-30 — nothing settled by Barkamol. Proposed order for the money work: measure on
the customer's database (item 1), settle the money rules (OPEN QUESTION), then fix the
code-level causes, which need no decision. Money Map:
https://claude.ai/artifact/5fWhB6Fb3tAs6aM1ZwVkYS · test report:
https://claude.ai/artifact/Bnz1wr84tywTLPDaRnuMSR. The audit's §11 order is still a proposal.

**OPEN QUESTION**
Barkamol, with the chayxana owner:
- Money rules behind most wrong numbers (recommendations in the test report): Kassa =
  cash only? How purchases reach profit when a dish has a tan narx, and is tan narx
  required? Build the waiter payout record? Finish D3 or make the discount cap bind?
  Write-off button, loss on its own day? One meaning of "Sotuv"? May a reported day change?
- Were the seeded owner/admin passwords changed on the till? Turn the nightly Telegram
  report on? (Off on every packaged install — confirmed by test.)
- Is a separate registered fiscal register used at the counter?
- Continue `feat/web-platform`? (No payments offline; slice 1 already landed.)
- Which visual rulebook wins: `docs/UI_UX_RULES.md` or `docs/design/BLOCKS_C1.md`?

**DO NOT TOUCH**
- `../project02-finance-e2e` holds the only copy of the finance suite and diagnostic,
  untracked: don't remove or clean it before item 2. Never commit its `e2e/.data/`.
- The ledger core (`reports.service.ts` dailyLedger, billing math, `cashOut` not
  `expenseNet`): every control passes; defects are in inputs, copies and guards.
- `apps/master` deliberately does not build on `feat/web-platform`; the demo runs
  from `../project02-demo` on that branch, never from here.
- `docs/UI_UX_RULES.md` is the declared source of truth for visual decisions, but it
  conflicts with `BLOCKS_C1.md`, which the renderer follows — see OPEN QUESTION.
- avtobron is production for carmap.uz too; the feed lives in its
  `click-avto-nginx-1`. Never change or restart it from a session — hand over commands.
- No `scripts/gate.sh`, no test CI. `pnpm test`: 90 tests in 8 files, pure helpers only.

<!-- auto:git -->
- branch: feat/auto-update
- last commit: de1e67e 2026-09-30 docs: state after the 2026-09-30 audit, for a cold start
- uncommitted files: 3
- refreshed: 2026-09-30 19:12
<!-- /auto:git -->