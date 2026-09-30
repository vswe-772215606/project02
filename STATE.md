# STATE — project02 (chayxana POS)

Five fields. Overwrite them, never append. If NEXT ACTION is not a command or a
file path, it is not specific enough. Everything below `<!-- auto:git -->` is
machine-written by the Stop hook — do not hand-edit it.

**GOAL**
A chayxana POS running on real hardware in a real restaurant: Uzbek-only, dense
enough for 1366x768, and able to update itself without a hand-delivered build.

**NEXT ACTION**
1. Restore the update feed on avtobron — production, human-run, per
   `docs/UPDATE_FEED_RUNBOOK.md` §2.5. Down as of 2026-09-30: `updates.mutallib.uz`
   serves carmap.uz's certificate and SPA, so no till can update. Put the two
   mounts into click_avto's own `deploy/docker-compose.yml` so a redeploy cannot
   drop them again. Verify:
   `curl -sS https://updates.mutallib.uz/chayxana/master/production/latest.yml`
   prints YAML with `version: 0.1.4`, not HTML.
2. Push what the customer runs: `git push -u origin feat/auto-update`, then
   `git tag v0.1.4 49b7243 && git push origin v0.1.4` (the tag push triggers the
   Windows CI build). Unpushed: 14 commits, no tag anywhere. Verify:
   `git ls-remote origin | grep -E 'auto-update|v0.1.4'`.
3. Start the "Shu hafta" list of `docs/chayxana-pos-audit-2026-09-30.pdf` §11 on a
   new branch off `feat/auto-update`: daily backup plus a copy before migrating
   (`apps/master/src/main/sqlite-bootstrap.ts`), start with Windows, the floor-wide
   PIN lockout (`auth.service.ts` loginPin, `user.repo.ts` findActiveByPin), printer
   fallback and a test print. Not started. Verify: `pnpm test` and `pnpm typecheck`
   in `apps/master` (floor 48), plus the HTTP smokes.
4. Then §11 "Keyingi versiyada". Code evidence for every item, with file:line,
   is in `memory/2026-09-30.md`.

**LAST DECISION**
2026-09-30 — nothing new settled. The audit report's order (§11: protect data,
code and access first; then what stops the floor; then money controls) is a
proposal awaiting Barkamol. Before it: 2026-08-18, v0.1.4 shipped from
`feat/auto-update` with self-update — whose feed is now down (NEXT ACTION 1).

**OPEN QUESTION**
Barkamol, with the chayxana owner:
- Were the seeded owner/admin passwords changed on the till? Is the daily
  Telegram report on? (It is off by default.)
- Is a separate registered fiscal register used at the counter? Decides
  reconciliation versus a fiscal integration (report §7, item 10).
- Continue `feat/web-platform`? It means no payments when the internet drops, and
  the live debt ledger cannot migrate once slice 1 landed — it has.
- Which visual rulebook wins: `docs/UI_UX_RULES.md` or `docs/design/BLOCKS_C1.md`,
  which the renderer actually follows? They contradict each other.

**DO NOT TOUCH**
- `apps/master` deliberately does not build on `feat/web-platform`; the demo runs
  from `../project02-demo` on that branch, never from here.
- `docs/UI_UX_RULES.md` is the source of truth for every visual decision.
  It is loaded into every session — argue with the file, not from a screenshot.
  ⚠ Flagged 2026-09-30: it conflicts with `BLOCKS_C1.md` — see OPEN QUESTION.
- avtobron is production for carmap.uz too; the feed lives in its
  `click-avto-nginx-1`. Never change or restart it from a session — hand over commands.
- This repo has NO `scripts/gate.sh` and NO test CI. 45k LOC, 8 test files.

<!-- auto:git -->
- branch: feat/auto-update
- last commit: 49b7243 2026-08-18 chore(release): v0.1.4
- uncommitted files: 3
- refreshed: 2026-09-30 17:12
<!-- /auto:git -->
