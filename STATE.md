# STATE — project02 (chayxana POS)

Five fields. Overwrite them, never append. If NEXT ACTION is not a command or a
file path, it is not specific enough. Everything below `<!-- auto:git -->` is
machine-written by the Stop hook — do not hand-edit it.

**GOAL**
A chayxana POS running on real hardware in a real restaurant: Uzbek-only, dense
enough for 1366x768, and able to update itself without a hand-delivered build.

**NEXT ACTION**
1. Slice 1 (PRD 14, server money guards) is built and pushed as `fix/server-money-guards`, not
   merged: 14 commits `e4082df..d04a2a8`, a docs commit, then the final review's code commit
   `67455a1` and its docs commit (worktree `../project02-guards`). At `67455a1`: e2e 68 pass /
   38 fail (106), `pnpm test` 142, typecheck 47. With Barkamol's go-ahead, from
   `~/dev/lab/project02`, setting aside his uncommitted CLAUDE.md and STATE.md first:
   `git stash push -m pre-merge CLAUDE.md STATE.md && git merge --no-ff fix/server-money-guards &&
   git stash pop`. After merging, update the merge state in three places: this item, the status
   line of `docs/prd/14-server-money-guards.md`, and row 14 of `docs/prd/README.md`. Before a till
   gets it: that PRD's §10 — the pre-release check (a fractional total can no longer be paid) and
   the checks owed on the till.
2. Measure the finance causes on real data. Barkamol copies the till's
   `%APPDATA%\@chayxana\master\data\master.sqlite` (app closed) to
   `../project02-finance-e2e/apps/master/e2e/.data/prod/master.sqlite` (git-ignored, debtor
   data). Both Docker projects bind host ports 4020 and 5199, so first, in `../project02-guards`:
   `docker compose -f compose.dev.yaml -f compose.e2e.yaml -p chayxana-guards down`. Then in
   `../project02-finance-e2e`: `docker compose -f compose.dev.yaml -f compose.e2e.yaml -p
   chayxana-e2e up -d`, then `docker exec -w /app/apps/master chayxana-e2e-master-dev-1 pnpm exec
   tsx e2e/prod-forensics.ts e2e/.data/prod/master.sqlite --days=30`. Never run on real data.
3. After slice 1: design and plan slice 2 (money-rules §7) and the line-edit race in PRD 14
   §2; rewrite each e2e expectation in money-rules §5 as its slice lands. Also owed (PRD 14 §10):
   confirm must compute totals and check payments after its claim, inside the transaction; D14
   must say how a written-off debt shows after a later payment, refuse writing it off twice, and
   stamp `writtenOffAt` inside the write-off transaction. Port PRD 14 to `feat/web-platform` by
   hand (notes in §10).
4. Restore the update feed on avtobron — human-run, `docs/UPDATE_FEED_RUNBOOK.md` §2.5. Verify:
   `curl -sS https://updates.mutallib.uz/chayxana/master/production/latest.yml` prints YAML
   with `version: 0.1.4`. No fix reaches a till until this works.
5. Push: `git push -u origin feat/auto-update`, then `git tag v0.1.4 49b7243 && git push
   origin v0.1.4`. Unpushed: 20 commits, no upstream, no tag. Verify:
   `git ls-remote origin | grep -E 'auto-update|v0.1.4'`.
6. Audit report §11 "Shu hafta" (`docs/chayxana-pos-audit-2026-09-30.pdf`): backup, start
   with Windows — PIN lockout and printer fallback are in slice 1.

**LAST DECISION**
2026-10-01, Barkamol away (his instruction: finish, commit, push as its own branch; no merge, tag
or deploy). Rulings on slice 1, none reversing PRD 14 §5–§6; the full list, one line each, is the
plan's "Deviations during execution" (`docs/superpowers/plans/2026-09-30-server-money-guards.md`):
- Written-off debts stay repayable (D14); the write-off is race-safe.
- Tan narx (`costPrice`) keeps its old validation; menu price and discount value are whole so'm.
- A zero Nasiya leg is refused.
- Confirm emits, then prints, then fires the owner alerts; a failed print leaves the sale closed.
- A cancel claims from the status it checked.
- One PIN attempt per device at a time; the device key is the address only.
- Final review: every toast of the confirm loop sits bottom-centre (set per toast; the global
  Toaster keeps the rulebook's corner); each owner alert waits at most 5 s for Telegram; the
  session touch writes at most once a minute.
His own decisions stand: the 2026-09-30 money rules
(`docs/superpowers/specs/2026-09-30-money-rules-design.md`) and PRD 14 §6.

**OPEN QUESTION**
Barkamol, with the chayxana owner:
- Money-rules §6 assumptions: Hisobot opens to ADMIN too; a closed day may be corrected
  however far back. PRD 14 G5 assumes each waiter logs in from their own phone.
- Were the seeded owner/admin passwords changed on the till?
- Is a separate registered fiscal register used at the counter?
- Continue `feat/web-platform`? Which visual rulebook wins: `docs/UI_UX_RULES.md` or
  `docs/design/BLOCKS_C1.md`?
- Sanoq vs open orders: a Sanoq counts 10 somsa while a draft holds 5 of them; cancelling that
  draft later (by hand, or the 12-hour cleanup) adds 5 back, so the count says 15. Skip the
  restore for lines older than the last Sanoq, or accept it until the next Sanoq?
- Auto-cancelled drafts count as cancelled orders: a waiter who leaves 3 drafts overnight shows 3
  in `ordersCanceled` and in the day report. Keep, or hide automatic ones?
- PIN lock resets on a successful login: a phone with one valid PIN guesses 4 times, logs in
  with its own and repeats, never locking (24 guesses and 6 own logins a minute). Keep misses
  across a success and let them expire some minutes after the last one? G5 B (name, then PIN) is
  stronger but changes both apps.

**DO NOT TOUCH**
- `../project02-finance-e2e` still holds the git-ignored `e2e/.data/` (the till's database copy,
  debtor data): don't remove or clean it while item 2 is in use. Keep `../project02-guards` until
  `fix/server-money-guards` is merged. Never commit `e2e/.data/`.
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
- No `scripts/gate.sh`, no test CI. `pnpm test`: 142 tests in 14 files, pure helpers only; the
  finance e2e suite (106 tests, 38 fail by design) runs by hand in the Docker harness (`CLAUDE.md`).

<!-- auto:git -->
- branch: feat/auto-update
- last commit: 7926371 2026-09-30 docs(plan): server money guards, slice 1 implementation plan
- uncommitted files: 2
- refreshed: 2026-09-30 22:21
<!-- /auto:git -->
