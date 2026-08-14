# Master renderer rebuild — status and handoff

**Branch:** `feat/c1-design-system` (50 commits ahead of `main`, not merged)
**Last worked:** 2026-08-14
**Scope:** the master admin renderer only. No server, schema, or business logic was changed
except where noted in "Open items" below.

Read this before touching `apps/master/src/renderer`. It says what the renderer is now, how
to look at it without Windows, and what is deliberately unfinished.

---

## 1. What changed

The renderer was rebuilt on a design system and a single layout shell.

- **Design system: Blocks C1** — [`BLOCKS_C1.md`](./BLOCKS_C1.md) is the authority. No
  borders, no radius, no shadows, no accent bars, no hover. Separation is a 2px seam;
  state is the fill; every fill carries its word. Type floors are **12px labels / 13px
  text / 17px money**.
- **Layout shell** — every screen is `Screen` + `Panel` from `components/layout/`. A
  `NavRail` of six primary destinations plus a `Boshqa` toggle replaces the old sidebar.
- **The structural rule that matters:** `Panel`'s `foot` sits *outside* the scroll
  container. A screen's primary action can therefore never be pushed below the fold, which
  was the most common blocker in the audit. All 15 app pages sit on this shell — only
  `LoginPage` (no rail) and `ComponentsPage` (developer reference) are outside it.
- 20 superseded components were deleted, along with 7 dependencies that died with them.

**Hardware floor, which drives all of the above:** 1366×768 touchscreen, operated standing,
by finger. No mouse, no hover, no keyboard in normal use. Read at arm's length, often by an
older owner. Any change that assumes a pointer or a keyboard is wrong for this product.

## 2. Looking at it without Windows

The master only runs inside Electron on Windows, and the dev machine is a Mac. Two harnesses
replace it. Neither needs Electron.

**Renderer — the browser preview.** Mounts the real pages, real queries and real mutations
against a stubbed `window.fetch`, in a 1366×768 frame.

```bash
cd apps/master && pnpm gallery:page      # writes gallery-dist/blocks-c1-gallery.html
```

Open that file directly; it is self-contained. Fixtures live in `gallery/fixtures/`, one
module per domain, each owning seed data plus a route handler. `gallery/mock-server.ts`
only composes them. Add a screen by adding its handler and an entry in `gallery/main.tsx`.

**Server — the Docker harness.** See the root `CLAUDE.md`; `compose.dev.yaml` runs the same
Express + Socket.io server without the Electron shell, which is what the HTTP smokes need.

## 3. Gate

```bash
cd apps/master
pnpm run typecheck:renderer   # renderer — clean
pnpm run typecheck:gallery    # gallery fixtures vs real API types — clean
pnpm exec electron-vite build # clean
npx tsc -b                    # 51 errors, ALL in src/main, ALL pre-existing
```

Two traps, both hit on this branch:

- `pnpm typecheck` (`tsc -b`) is the only command that checks `src/main`. Plain
  `tsc -p tsconfig.json` compiles **nothing** — the root config is solution-style
  (`files: []` + references). A green run from it means nothing.
- `tsconfig.renderer.json` does **not** cover `gallery/` — it is composite with
  `rootDir: src/renderer`. `tsconfig.gallery.json` covers both trees and `pnpm gallery`
  runs it first. If you add a third tree, check it is actually compiled with
  `tsc --listFiles -p <config> | grep <dir>` before trusting a pass.

## 4. Open items — decisions, not tasks

These were found, verified, and deliberately left alone. Each needs a call before work.

**Profit reaches ADMIN over the wire.** `/api/finance/daily` returns `pnl.profit`, and
`finance.service.ts:300` additionally ships the whole canonical `ledger` DTO, which contains
it too. The renderer no longer reads it on the admin path (`FinancePage` and
`FinanceWorkArea` both document this), so the in-code comment claiming removal would "break
the Yakun card" is now stale. Closing it means a role-filtered DTO mid-T10 migration.
`PRD_FOUNDATION.md` §8 warns against unprompted finance changes — hence untouched.

**`DataTable` rows are not real targets.** `components/data/DataTable.tsx:108` puts
`onClick` on a bare `<tr>` — no `role`, no `tabIndex`, no press feedback. Live via
`MonthlyTable`'s day drill-down. Tapping works, so it is not urgent on a device with no
keyboard, but it neither looks nor behaves like a control. Its seven callers are the reports
sections; convert them together.

**Two pre-C1 remnants** remain outside `components/ui/`, both listed in `BLOCKS_C1.md` §7.

**Product questions never answered** — do not guess these:
- Does the Chegirmalar page need to exist at all, or do discounts belong inside the confirm flow?
- Payroll matrix: per-day columns (current) or per-week?
- Change arithmetic: should `Naqd olindi` compute and show `Qaytim`?

## 5. The audit is stale on purpose

[`../UI_UX_LAYOUT_AUDIT.md`](../UI_UX_LAYOUT_AUDIT.md) has 158 findings scored against the
pre-rebuild renderer. **Its counts no longer describe the code** — the rebuild addressed
much of it structurally (below-fold actions, touch targets, the shell), but the audit was
never re-run, and no finding was individually ticked off. Treat it as the rationale for the
rebuild, not as a live tracker. Re-auditing against the current tree is a clean next task.

## 6. Bugs found while rebuilding

Recorded because each was pre-existing, invisible from the code alone, and the class of
mistake tends to recur.

- **Money rendered at 14px across most of the app.** `MoneyCell` set alignment but no font
  size, so it inherited `DataTable`'s ambient `text-sm`. Fixed at the primitive.
- **Positive money printed unformatted** in Yakuniy hisobot. The section inferred "is this
  money?" from string shape, but money arrives as `Decimal.toFixed(0)` — `"245000"` is
  identical to an order count, so positive money took the count branch and rendered as a
  bare digit run while negative money formatted correctly. `RowSpec` now declares `kind`.
  **Any future "is this money?" heuristic on a formatted string is wrong for the same reason.**
- **Labels were invisible on coloured fills.** `FieldLabel` hardcoded muted ink: 1.07:1 on
  the owed fill. Tones now publish `--label-fg`.
- **A dead `ConfirmDialog` carried a document-level Enter handler** that fired `onConfirm`
  regardless of focus. On a till that confirms money. Deleted; the surviving
  `components/feedback/ConfirmDialog.tsx` has no key handler.

## 7. Commit hygiene note

`d3e1817` and `7352551` have swapped messages — the file deletions landed in the first
rather than the second. The tree is correct at every commit. History was not rewritten;
squash at merge.
