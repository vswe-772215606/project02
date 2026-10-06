# STATE — project02 (chayxana POS)

Five fields. Overwrite them, never append. If NEXT ACTION is not a command or a
file path, it is not specific enough. Everything below `<!-- auto:git -->` is
machine-written by the Stop hook — do not hand-edit it.

**GOAL**
A chayxana POS running on real hardware in a real restaurant: Uzbek-only, dense
enough for 1366x768, and able to update itself without a hand-delivered build.

**NEXT ACTION**
1. Build wave 1 of the money rules — P7 discount-qaytim, P1 guards-2, P2 trading-day — per
   `docs/superpowers/plans/2026-10-02-money-README.md` (merge order, pinned migrations, conflict
   rulings). Not started: the 2026-10-02 dispatch wrote Task 1 briefs, no commits. Cut each
   package fresh from `feat/money-rules`, merge back in README order, fast-forward `main`. Gates
   in the Docker harness (`CLAUDE.md` "Headless dev server"), before and after: `pnpm test` 142,
   `pnpm typecheck` 47, renderer 0, gallery 0, e2e 68 pass / 38 fail (106).
2. Measure the finance causes on real data. Barkamol copies the till's
   `%APPDATA%\@chayxana\master\data\master.sqlite` (app closed) to
   `apps/master/e2e/.data/prod/master.sqlite` (git-ignored, debtor data), then
   `docker compose -f compose.dev.yaml -f compose.e2e.yaml -p chayxana-e2e up -d` and
   `docker exec -w /app/apps/master chayxana-e2e-master-dev-1 pnpm exec tsx
   e2e/prod-forensics.ts e2e/.data/prod/master.sqlite --days=30` (copies first, reads only).
3. Before slice 1 reaches a till: PRD 14 §10 — the fractional-amount SQL on a copy of the till's
   database, and the checks owed on the till. Then release per `docs/UPDATE_FEED_RUNBOOK.md`.
4. Restore the update feed on avtobron — human-run, `docs/UPDATE_FEED_RUNBOOK.md` §2.5. Verify:
   `curl -sS https://updates.mutallib.uz/chayxana/master/production/latest.yml` prints YAML
   with `version: 0.1.4`. No fix reaches a till until this works.
5. Tag v0.1.4 — not pushed, because the tag push runs the Windows build and creates a GitHub
   Release: `git tag v0.1.4 49b7243 && git push origin v0.1.4`. Verify:
   `git ls-remote origin | grep v0.1.4`.
6. Audit report §11 "Shu hafta" (`docs/chayxana-pos-audit-2026-09-30.pdf`): backup, start
   with Windows — PIN lockout and printer fallback shipped in slice 1.

**LAST DECISION**
2026-10-06 — Barkamol: "whatever updated in this repo you need to push and merge to main, I'll
continue in another device." `main` fast-forwarded from v0.1.3 (`e8af3bf`) to `feat/money-rules`:
v0.1.4, slice 1 (PRD 14), D22–D27 and the seven 2026-10-02 plans. History was linear, so there
is no merge commit. His `CLAUDE.md` import block and the audit PDF are committed on that
instruction. Slice 1's own rulings: "Deviations during execution" in
`docs/superpowers/plans/2026-09-30-server-money-guards.md`.

**OPEN QUESTION**
Barkamol, with the chayxana owner:
- The seven "Questions for Barkamol" in `docs/superpowers/plans/2026-10-02-money-README.md`
  (morning count, Xizmat haqi until payday, quiet days, latest-only count correction, waiter
  Qoldiq start, Naqd/Karta for Keldi and avans returns, PIN lock reset). Defaults hold till then.
- PRD 14 G5 assumes each waiter logs in from their own phone.
- Were the seeded owner/admin passwords changed on the till? Is a separate registered fiscal
  register used at the counter?
- Continue `feat/web-platform` (pushed 2026-10-06; slice 1 would be ported by hand, PRD 14 §10)?
  Which visual rulebook wins: `docs/UI_UX_RULES.md` or `docs/design/BLOCKS_C1.md`?

**DO NOT TOUCH**
- The ledger core (`reports.service.ts` dailyLedger, billing math, `cashOut` not
  `expenseNet`): every control passes. D9 and D11 change what it groups, not its formulas.
- `apps/master` deliberately does not build on `feat/web-platform`; its demo runs from a
  separate worktree as project `chayxana-demo`, never from a checkout you build in.
- `docs/UI_UX_RULES.md` is the declared visual source of truth but conflicts with
  `docs/design/BLOCKS_C1.md`, which the renderer follows — don't restyle before OPEN QUESTION.
- avtobron is production for carmap.uz too; the feed lives in its
  `click-avto-nginx-1`. Never change or restart it from a session — hand over commands.
- Never commit `apps/master/e2e/.data/` (debtor data). On the first Mac,
  `../project02-finance-e2e` may hold the till's copy: don't remove or clean it.
- On the first Mac, local `feat/money-{discount-qaytim,guards-2,trading-day}` sit at `cedd71a`
  with empty ledgers, never pushed: don't build on them.
- No `scripts/gate.sh`, no test CI. `pnpm test`: 142 tests in 14 files, pure helpers only; the
  finance e2e suite runs by hand in the Docker harness (38 fail by design).

<!-- auto:git -->
- branch: feat/auto-update
- last commit: 7926371 2026-09-30 docs(plan): server money guards, slice 1 implementation plan
- uncommitted files: 2
- refreshed: 2026-09-30 22:21
<!-- /auto:git -->
