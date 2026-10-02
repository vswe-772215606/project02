# Money rules P4: the expense form, corrections and tan narx. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`)
> syntax for tracking. Where a task's text and "Deviations during execution" (added at the end
> while building) disagree, the deviations win.

**Goal:** The expense form files food bought at the bazaar as Mahsulot xaridi, a forgotten expense
is written to the trading day the cash left as an explicit correction the owner hears about, an
entry on a past day can be undone the same way, undoing a Keldi payment takes back its stock and
tan narx, Keldi payments raise the large-expense alert, and a food dish can no longer be saved
without a tan narx.

**Architecture:** One new service, `dayCorrectionService`, owns every change to a past trading
day: it takes the day's profit before, runs the caller's write in one transaction, takes the
profit after, writes a `DAY_CORRECTED` audit row and sends the owner one Telegram message.
Corrections run one at a time, so before and after always describe one change. Expense create and
undo decide with one pure rule (`expenseDayRule`) whether an entry is ordinary, a correction, or
refused. An undo is always stamped on the day of the entry it undoes, so it never moves money
between days. P6 (D24) and P5 (day close) build on the same service.

**Tech stack:** Node + Express + Prisma 6.17 on SQLite (`connection_limit=1`), zod 4, vitest 2
(unit: `pnpm test`; e2e: `vitest.e2e.config.ts`), React 19 + TanStack Query + sonner, Blocks C1.

**Spec:** `docs/superpowers/specs/2026-09-30-money-rules-design.md` D13, D15, D23, D4 (§3.4, §3.6),
§4 items 19 and 23, §5 lines for `04-stock-cost` and `05-expenses`. D4 as
`docs/superpowers/specs/2026-08-14-money-model-design.md` §6 specifies.

**Wave:** 3, in parallel with P6 (payouts and write-offs). P6 calls `dayCorrectionService`
(Task 3); hand P6 the Task 3 commit as soon as it lands.

---

## Design

### Goal and decisions covered

| Decision | What this package builds |
|---|---|
| D15 | The form gains "Mahsulot xaridi" beside ordinary expenses. It is Chiqim (leaves the till, inside `cashOut`) and never Xarajat (stays out of `operatingExpense`), because food cost reaches profit only as tan narx × portions. |
| D4 (money-model §6) | `menu.service` refuses a FOOD dish without a positive tan narx, on create and on edit. Dishes that already have none keep selling at 0 food cost, are listed under "Tan narxsiz" in Ombor, and Kunlik moliya names how many remain. |
| D13 | A forgotten expense is written to the trading day the cash left. The form defaults to today; a past day is chosen explicitly and is a correction. A correction recomputes that day's profit, writes an audit row and messages the owner: what, who, profit before and after. |
| D23 | Any past day, by OWNER or ADMIN. An entry on a past day is undone the same way; `EXPENSE_REVERSAL_SAME_DAY_ONLY` is gone. |
| §4 (19) | Undoing a Keldi payment takes back its portions and restores the tan narx it set. |
| §4 (23) | A paid Keldi raises the large-expense alert like any other Chiqim. |

"Closed" means any trading day before today's (`dayCorrectionService.isClosedDay`). It stays that
way after P5: `isClosedDay` stays "any trading day before today's". P5's close windows are
time-based, so an entry after a count lands in the next close. P5 extends `snapshot()` with
`expected` and `difference`, and adds `stampInsideClose` in `create` and `reverse`.

### What the operator sees

**Chiqimlar, "Yangi chiqim" dialog** (`ExpenseCreateDialog.tsx`). The page's date filter no longer
reaches the dialog. New rows of two buttons each (the `NewItemPanel` mode-row pattern), above the
P3 Naqd/Karta row:

| Control | Strings |
|---|---|
| Title / description | `Yangi chiqim` / `Kassadan chiqqan pulni yozing.` |
| Turi | label `Turi`; buttons `Xarajat` (default) and `Mahsulot xaridi` |
| Hint under Turi | Xarajat: `Foydadan ayriladi: gaz, ijara, ta'mir.` Mahsulot xaridi: `Bozordan olingan oziq-ovqat. Kassadan chiqadi, lekin foydadan ikkinchi marta ayrilmaydi: taomning tan narxi orqali hisoblanadi.` |
| Qaysi kun | label `Qaysi kun`; buttons `Bugun` (default) and `O'tgan kun` |
| O'tgan kun picked | a date input, `aria-label="Tuzatiladigan kun"`, latest allowed day = yesterday's trading day; an owed-tone Field: `O'tgan kunni tuzatish. Kunni tanlang.` until a day is picked, then `O'tgan kunni tuzatish: 30.09.2026 kunining foydasi qayta hisoblanadi va egasiga Telegram xabar boradi.` |
| Qaytariladi | hidden while Mahsulot xaridi is picked |
| Submit | `Saqlash`, or `Tuzatishni saqlash` for a past day; `Saqlanmoqda…` while pending |
| Toast | `Chiqim saqlandi`, or `Tuzatish saqlandi, egasiga xabar yuborildi` |
| Form errors | `Summa va sababni to'ldiring`, `Summa butun so'm bo'lsin`, `Summa 0 dan katta bo'lsin`, `Sababni kamida 3 harf bilan yozing`, `Qaysi kunni tuzatayotganingizni tanlang`, `O'tgan kunni tanlang: bugun yoki kelgusi kun tuzatish emas` |

The fields scroll inside the dialog and the footer stays outside the scroll, so `Saqlash` is
visible at 1236 × 623.

**Chiqimlar list and panel.** A correction row's sub-line reads
`Tuzatish · 01.10.2026 da kiritildi · Operatsion` instead of a made-up 12:00. Every ACTIVE,
non-repayable entry shows `Bekor qilish`; the note `Faqat bugun kiritilgan chiqimni bekor qilish
mumkin.` is gone. For an entry on a past day the undo dialog shows an owed-tone Field
`Bu 30.09.2026 kunini tuzatadi: o'sha kunning foydasi qayta hisoblanadi va egasiga xabar boradi.`
and its button reads `Tuzatib bekor qilish`.

**The owner's Telegram message** (one per correction, HTML, no emoji):

```
<b>O'tgan kun tuzatildi</b>
Kun: 30.09.2026
Nima: Chiqim qo'shildi: Gaz — 30 000 so'm
Kim: Admin
Foyda: 30 000 → 0 so'm
```

Undo: `Nima: Chiqim bekor qilindi: Gaz — 30 000 so'm`. A Mahsulot xaridi adds ` (Mahsulot xaridi)`,
a Karta expense (P3) adds ` (Karta)`. The `what` text and the actor name are HTML-escaped. P5 adds
`Kutilgan: … → … so'm` and `Farq: … → … so'm` lines through the same formatter, by filling
`expected` and `difference` in `snapshot()`; it builds no second message path.

**Ombor.** A third filter button `Tan narxsiz {n}` (shown while n > 0) lists every active FOOD dish
without a tan narx, counted or not: name, category, `Sanaladigan` or `Sanoqsiz`, and an owed chip
`Tan narxsiz`. Selecting one opens a panel: Field `Tan narx (1 porsiya)`, hint
`Har sotilgan porsiyaning foydasi shu narxdan hisoblanadi. Kiritilmaguncha taom foydani yuqori
ko'rsatadi.`, and a 66 px button `SAQLA VA KEYINGISI` (or `SAQLASH` on the last one). Toast
`Tan narx saqlandi`. In the counted list a missing tan narx shows the owed chip `Tan narxsiz`
instead of `—`. In a dish's entry history an undone Keldi reads `Keldi (bekor qilingan)`.

**Menyu.** `Tan narx (ixtiyoriy)` becomes `Tan narx`. A FOOD dish cannot be saved without one:
`Tan narxini kiriting`, `Tan narx 0 dan katta bo'lsin`, `Tan narx noto'g'ri`. An old dish without
one shows `Tan narx kiritilmagan: saqlash uchun kiriting`. `Faolsizlantirish` still works without
a tan narx.

**Kunlik moliya.** While dishes lack a tan narx: an owed Field
`{n} ta taomning tan narxi kiritilmagan: ularning foydasi to'liq narxda ko'rinadi` with a button
`Omborda kiritish` (navigates to `/ombor?filter=tannarx`). The purchases block becomes
`Mahsulot xaridi` and lists every Mahsulot xaridi of the day, Keldi payments and form entries
alike, with the total `Jami mahsulot xaridi`.

### Server, schema and API

| Surface | Change |
|---|---|
| `POST /api/expenses` | `occurredAt` becomes optional (absent = now). New `kind: 'OPERATING' \| 'FOOD_PURCHASE'` (default OPERATING; `categoryId` still wins when sent). New `correction: boolean`. A FOOD_PURCHASE cannot be repayable (400 `VALIDATION`). An entry whose trading day is closed needs `correction: true`, else 409 `PAST_DAY_NEEDS_CORRECTION`. A later trading day than today answers 400 `FUTURE_DAY`. |
| `POST /api/expenses/:id/reverse` | New `correction: boolean`. Closed day without it: 409 `PAST_DAY_NEEDS_CORRECTION`. The status claim is conditional (two undos never write two REVERSAL rows). The REVERSAL row is stamped with the original's `occurredAt`, always. A Keldi payment's undo takes back stock and tan narx. |
| Expense DTO | gains `tradingDay`, `isCorrection` (trading day of `occurredAt` before that of `createdAt`), `isFoodPurchase`. |
| `GET /api/stock/missing-cost` (ADMIN, OWNER) | `[{ id, name, categoryName, counted, stockCount }]`, active FOOD dishes with no tan narx, by name. |
| `GET /api/stock/:id/entries` | each entry gains `undone` (its Keldi payment was undone). |
| `GET /api/finance/daily` | gains `missingCostCount` and `foodPurchases: { items, total }`. |
| `POST/PATCH /api/menu/items` | a FOOD result without a positive tan narx answers 400 `VALIDATION` `Taomning tan narxini kiriting`, except a patch that only sets `isActive`. |
| `POST /api/stock/:id/restock` | a paid Keldi records the tan narx it replaced and calls `alertService.largeExpense`. |
| Schema | `AuditAction.DAY_CORRECTED`; `StockEntry.costPriceBefore Decimal?`, `StockEntry.costPriceSet Boolean @default(false)`. Two added columns, no table rebuild. |
| Errors | `Errors.PastDayNeedsCorrection()` (409), `Errors.FutureDay()` (400); `Errors.ExpenseReversalSameDayOnly` is deleted. |

### What deliberately stays

- `reports.service.ts` `dailyLedger`, its formulas, and `cashOut` (not `expenseNet`). A correction
  changes rows; the ledger recomputes them unchanged. `dayCorrectionService` only reads it.
- Mahsulot xaridi stays the seeded category `seed-cat-ingredients`; no new category, no migration
  of old rows. Old Operatsion rows that were really food stay where they are (forensics
  `double-count` still finds them).
- Avans (repayable) undo, return and write-off are untouched here (P6 T5 owns §4 (30), D14 is
  P6's). The panel still offers no undo for a repayable entry. P6's `expenseContribution` must
  accept P4's REVERSAL rows stamped at the original's `occurredAt`: its rule reads the row's
  `status` and `original.repayable`, never its time, so an avans undo stays profit-neutral on the
  original's day.
- `MenuItem.costPrice` stays nullable in the schema; a migration cannot invent a cost.
- Sanoq, line restore (D26) and the stock model are untouched; the Keldi undo only reads "was there
  a Sanoq since" by the same rule.

### Settled defaults

No open questions remain. These were raised while planning and are built as stated:

- **Keldi undo, partial stock:** when fewer portions remain than were delivered, take back what
  is there; the count never goes below 0.
- **Keldi undo, today's stock:** the portions come off the count as it stands now, unless a Sanoq
  was taken since the Keldi; then the count already says what is on the shelf (D26's rule).
- **Keldi undo, hand-set tan narx:** the tan narx goes back only if the Keldi set it and nobody has
  changed it since; a tan narx typed by hand stays.
- **Large-expense alert on corrections:** none separate; the correction message already carries the amount.
- **Editing a dish with no tan narx:** money-model §6 answers it: any edit of a FOOD dish needs a
  tan narx, except switching it on or off.
- **Unclosed past days:** D23, any past day is corrected the same way, however far back.

---

## Global constraints

- **Where:** worktree `/Users/uzmacbook/dev/lab/project02-money`, branch for this package as the
  orchestrator gives it, built on `feat/money-rules` after waves 1 and 2 merged. Never touch
  `../project02`, `../project02-guards`, `../project02-demo`, `../project02-finance-e2e`. Never
  push, merge, tag or deploy.
- **Where things run:** Docker only, container `CONTAINER` (named at build time). Never on the host,
  never Electron. Every `docker exec` that runs vitest takes `-e NO_COLOR=1`.
- **Floors** (measured in Task 1, after waves 1–2): e2e pass/fail counts, `pnpm test` count,
  `pnpm typecheck` errors (47 before waves 1–2), `typecheck:renderer` 0, `typecheck:gallery` 0. No
  task raises a typecheck count, and no e2e test that passed before a task fails after it. Tests
  owned by later packages may stay red.
- **Money:** whole so'm; server text through `formatUZS` (`server/lib/format.ts`), screen text
  through `formatMoney` (`renderer/lib/format.ts`). Never `Intl` `uz-UZ` raw. The printer is not
  touched.
- **Never call `reportsService.dailyLedger` (or any `getPrisma()` read) inside a `$transaction`
  callback**: with one connection it waits for itself until P2028.
- **Renderer:** Blocks C1 primitives only (`components/blocks`, `Screen` + `Panel`). Targets 48/56/66
  px, type floors 12/13/17 px, no hover-only route, usable at 1236 × 623. The nav rail is not
  touched.
- **Waiters** never receive tan narx or food cost: every new endpoint is ADMIN + OWNER.
- **Code rules:** TypeScript strict, `noUncheckedIndexedAccess`, no `any` outside test files;
  2-space indent, single quotes, semicolons, trailing commas; Prisma only in `repositories/`;
  throw `Errors.*`; user-facing text in Uzbek (Latin).
- **Tests first:** every task writes its failing test, runs it red, then implements.
- **Commits:** conventional, plain, authored as the human. No AI attribution, no `Co-Authored-By`.
  Never `--no-verify`. Never commit `apps/master/e2e/.data/`.

### Gate commands

```bash
# e2e, whole suite / one file / one test
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/05-expenses.test.ts
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/05-expenses.test.ts -t "issue 5"
# unit
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
# typechecks
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
```

"Run the gates" below means all of these, compared against the Task 1 floors.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/master/src/main/server/lib/day-correction-message.ts` (+ `.test.ts`) | Create | `DaySnapshot`, `formatDayCorrection` |
| `apps/master/src/main/server/lib/serial-runner.ts` (+ `.test.ts`) | Create | `createSerialRunner`: one correction at a time |
| `apps/master/src/main/server/lib/expense-day.ts` (+ `.test.ts`) | Create | `expenseDayRule`: ordinary, correction, or refused |
| `apps/master/src/main/server/lib/keldi-undo.ts` (+ `.test.ts`) | Create | `keldiUndoPlan`: stock and tan narx after a Keldi undo |
| `apps/master/src/main/server/lib/cost-rule.ts` (+ `.test.ts`) | Create | `missingRequiredCost`: D4 for create and patch |
| `apps/master/src/main/server/services/day-correction.service.ts` | Create | `apply`, `snapshot`, `isClosedDay` |
| `apps/master/src/main/server/services/expense.service.ts` | Modify | `create` (kind, correction), `reverse` (claim, stamp, correction, Keldi), `mapExpense` (new fields) |
| `apps/master/src/main/server/controllers/expense.controller.ts` | Modify | body schemas |
| `apps/master/src/main/server/repositories/expense.repo.ts` | Modify | `reverseIfActive` |
| `apps/master/src/main/server/lib/errors.ts` | Modify | `PastDayNeedsCorrection`, `FutureDay`; delete `ExpenseReversalSameDayOnly` |
| `apps/master/src/main/server/services/alert.service.ts` | Modify | `dayCorrected` |
| `apps/master/src/main/server/services/stock.service.ts` | Modify | restock records cost before, raises the alert; `undoKeldiPayment`; `listMissingCost`; `mapEntry.undone` |
| `apps/master/src/main/server/repositories/stockEntry.repo.ts` | Modify | `findByExpenseId`, `hasCountAfter` |
| `apps/master/src/main/server/repositories/menu.repo.ts` | Modify | `listFoodMissingCost`, `countFoodMissingCost` |
| `apps/master/src/main/server/controllers/stock.controller.ts`, `routes/stock.routes.ts` | Modify | `GET /missing-cost` |
| `apps/master/src/main/server/services/menu.service.ts` | Modify | D4 on create and update |
| `apps/master/src/main/server/services/finance.service.ts` | Modify | `missingCostCount`, `foodPurchases` |
| `apps/master/prisma/schema.prisma` + `prisma/migrations/<ts>_stock_entry_cost_before/` | Modify / create | `DAY_CORRECTED`, two StockEntry columns |
| `apps/master/e2e/19-day-correction.test.ts` | Create | the service's own e2e |
| `apps/master/e2e/04-stock-cost.test.ts`, `05-expenses.test.ts` | Modify | §5 expectations, new tests |
| `apps/master/e2e/harness.ts`, `e2e/seed-ui-day.ts` | Modify | old no-tan-narx dishes planted directly |
| `apps/master/e2e/14-forensics.test.ts`, `e2e/prod-forensics.ts` | Modify | past-day and Keldi-undo damage planted directly; corrections are not damage |
| `apps/master/src/renderer/lib/expense-form.ts` (+ `.test.ts`) | Create | `buildExpenseBody`, `undoChoice` |
| `apps/master/src/renderer/lib/menu-form.ts` (+ `.test.ts`) | Create | `costPriceError` |
| `apps/master/src/renderer/api/expenses.ts`, `api/stock.ts`, `api/finance.ts` | Modify | types, `missingCost` |
| `apps/master/src/renderer/components/expenses/ExpenseCreateDialog.tsx`, `ExpenseReverseDialog.tsx`, `ExpensePanel.tsx`, `ExpenseList.tsx`, `pages/ExpensesPage.tsx` | Modify | the form and the undo |
| `apps/master/src/renderer/components/menu/NewItemPanel.tsx`, `ItemPanel.tsx` | Modify | tan narx required |
| `apps/master/src/renderer/pages/OmborPage.tsx`, `components/stock/StockList.tsx`, `StockPanel.tsx`, `components/stock/MissingCostList.tsx`, `MissingCostPanel.tsx` | Modify / create | Tan narxsiz |
| `apps/master/src/renderer/components/finance/FinanceWorkArea.tsx` | Modify | count banner, Mahsulot xaridi block |
| `apps/master/src/renderer/lib/audit-labels.ts` | Modify | `DAY_CORRECTED` |
| `apps/master/gallery/fixtures/{expenses,stock,finance,audit}.ts` | Modify | new shapes and routes |
| `docs/CURRENT_WORKFLOW.md`, `docs/superpowers/specs/2026-09-30-money-rules-design.md` | Modify | say what the code now does |

---

### Task 1: Baseline and the interfaces waves 1–2 left

**Files:** none changed. No commit.

**Interfaces:**
- Consumes: the merged waves 1–2 on this branch.
- Produces: the floors and the exact names every later task uses.

- [ ] **Step 1: Confirm the branch and the container**

```bash
cd /Users/uzmacbook/dev/lab/project02-money && git log --oneline -5 && git status --short
docker exec CONTAINER test -f /tmp/ready && echo ready
```

Expected: a clean tree on the P4 branch, `ready`.

- [ ] **Step 2: Record the floors**

Run the gate commands. Write down: e2e `Tests  F failed | P passed (T)`, the list of failing e2e
test names (`... 2>&1 | grep -E '✗|×|FAIL'`), `pnpm test` count, the three typecheck counts.

- [ ] **Step 3: Name what P2 and P3 built**

```bash
cd /Users/uzmacbook/dev/lab/project02-money/apps/master
grep -n "export function" src/main/server/lib/time.ts src/main/server/lib/format.ts
grep -n "export function" src/renderer/lib/trading-day.ts src/renderer/lib/format.ts
grep -n "paymentMethod" prisma/schema.prisma src/main/server/controllers/expense.controller.ts src/renderer/components/expenses/ExpenseCreateDialog.tsx
grep -n "pnl:\|profit\|chiqim\|xarajat\|kassa" src/main/server/services/reports.service.ts | tail -40
```

This plan uses P2's names exactly:

| Where | Name | From |
|---|---|---|
| Server | `tradingDayOf(at?: Date): string` | `server/lib/time.ts` |
| Server | `isSameTradingDay(a, b)` (what `expense.service` imports after P2) | `server/lib/time.ts` |
| Server | `formatDayKeyUZ(dayKey)` (`'2026-09-30'` → `'30.09.2026'`) | `server/lib/format.ts` |
| e2e | `env.svc.time.tradingDayOf()` | the harness's `svc.time` (`lib/time.ts`) |
| Renderer | `tradingDayKey(at?: Date): string` | `renderer/lib/trading-day.ts` (not `lib/format.ts`) |
| Expense | `paymentMethod` (`'CASH' \| 'CARD'`) | P3 |
| Ledger | `ledger.pnl.profit` for the day's Foyda | `reports.service.ts` |

If the greps show a name differs, use the real one everywhere this plan says these, and record the
mapping as the first line of "Deviations during execution".

- [ ] **Step 4: Confirm what this plan expects to find red**

These tests must be failing now and are this package's to turn green: `04` `[issue 4] a food dish
cannot be saved without a tan narx`, `04` `[issue 4] selling a dish with no tan narx books its food
cost`, `05` `[issue 3]`, `05` `[issue 5]`, `05` `[issue 19]`, `11` `[issue 23]`. If any already
passes, note it; if `05` `[issue 30]` or `11` `[issue 25]` still fails, it belongs to P1/P3, not
here: note it and move on.

---

### Task 2: Pure helpers: the correction message, the serial runner, the day rule

**Files:**
- Create: `apps/master/src/main/server/lib/day-correction-message.ts`, `day-correction-message.test.ts`
- Create: `apps/master/src/main/server/lib/serial-runner.ts`, `serial-runner.test.ts`
- Create: `apps/master/src/main/server/lib/expense-day.ts`, `expense-day.test.ts`

**Interfaces:**
- Consumes: `formatUZS` (`lib/format.ts:14`) and P2's `formatDayKeyUZ` (`server/lib/format.ts`), P2's `tradingDayOf` (`lib/time.ts`).
- Produces:
  - `type DaySnapshot = { profit: string; expected?: string; difference?: string }`
  - `formatDayCorrection(m: { tradingDay: string; what: string; actorName: string; before: DaySnapshot; after: DaySnapshot }): string`
  - `createSerialRunner(): <T>(fn: () => Promise<T>) => Promise<T>`
  - `expenseDayRule(p: { day: string; today: string; closed: boolean; correction: boolean }): { ok: true; isCorrection: boolean } | { ok: false; error: 'FUTURE_DAY' | 'PAST_DAY_NEEDS_CORRECTION' }`

None of the three imports Prisma, so `pnpm test` covers them.

- [ ] **Step 1: Write the failing tests**

`day-correction-message.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDayCorrection } from './day-correction-message';

const base = { tradingDay: '2026-09-30', what: "Chiqim qo'shildi: Gaz — 30 000 so'm", actorName: 'Admin' };

describe('formatDayCorrection', () => {
  it('names the day, what, who, and profit before and after', () => {
    expect(formatDayCorrection({ ...base, before: { profit: '30000' }, after: { profit: '0' } })).toBe(
      "<b>O'tgan kun tuzatildi</b>\nKun: 30.09.2026\nNima: Chiqim qo'shildi: Gaz — 30 000 so'm\nKim: Admin\nFoyda: 30 000 → 0 so'm",
    );
  });

  it('shows a loss with its minus sign', () => {
    expect(formatDayCorrection({ ...base, before: { profit: '80000' }, after: { profit: '-220000' } }))
      .toContain("Foyda: 80 000 → -220 000 so'm");
  });

  it('escapes what the operator typed, because the message is sent as HTML', () => {
    const text = formatDayCorrection({ ...base, what: 'Gaz <balon> & suv', actorName: 'A<b>', before: { profit: '0' }, after: { profit: '0' } });
    expect(text).toContain('Nima: Gaz &lt;balon&gt; &amp; suv');
    expect(text).toContain('Kim: A&lt;b&gt;');
  });

  it('adds Kutilgan and Farq only when both sides carry them (day close, P5)', () => {
    const text = formatDayCorrection({
      ...base,
      before: { profit: '30000', expected: '500000', difference: '-20000' },
      after: { profit: '0', expected: '470000', difference: '10000' },
    });
    expect(text.split('\n').slice(-2)).toEqual(["Kutilgan: 500 000 → 470 000 so'm", "Farq: -20 000 → 10 000 so'm"]);
    expect(formatDayCorrection({ ...base, before: { profit: '1' }, after: { profit: '1', expected: '5' } })).not.toContain('Kutilgan');
  });
});
```

`serial-runner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSerialRunner } from './serial-runner';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createSerialRunner', () => {
  it('runs one job at a time, in the order they arrive', async () => {
    const run = createSerialRunner();
    const log: string[] = [];
    const job = (name: string, ms: number) => run(async () => { log.push(`${name} start`); await tick(ms); log.push(`${name} end`); return name; });
    expect(await Promise.all([job('a', 30), job('b', 1)])).toEqual(['a', 'b']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end']);
  });

  it('a failed job rejects its caller and does not stop the next', async () => {
    const run = createSerialRunner();
    const failed = run(async () => { throw new Error('boom'); });
    const next = run(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
```

`expense-day.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expenseDayRule } from './expense-day';
import { tradingDayOf } from './time';

const today = '2026-10-01';

describe('expenseDayRule', () => {
  it('today is an ordinary entry', () => {
    expect(expenseDayRule({ day: today, today, closed: false, correction: false })).toEqual({ ok: true, isCorrection: false });
  });
  it('today stays ordinary even when the client says correction', () => {
    expect(expenseDayRule({ day: today, today, closed: false, correction: true })).toEqual({ ok: true, isCorrection: false });
  });
  it('a closed day without the correction flag is refused', () => {
    expect(expenseDayRule({ day: '2026-09-30', today, closed: true, correction: false })).toEqual({ ok: false, error: 'PAST_DAY_NEEDS_CORRECTION' });
  });
  it('a closed day with the flag is a correction, however far back (D23)', () => {
    expect(expenseDayRule({ day: '2025-01-15', today, closed: true, correction: true })).toEqual({ ok: true, isCorrection: true });
  });
  it('a past day the caller reports not closed is ordinary (the pure rule; isClosedDay never says so today)', () => {
    expect(expenseDayRule({ day: '2026-09-30', today, closed: false, correction: false })).toEqual({ ok: true, isCorrection: false });
  });
  it('a later day is refused, flag or not', () => {
    expect(expenseDayRule({ day: '2026-10-02', today, closed: false, correction: true })).toEqual({ ok: false, error: 'FUTURE_DAY' });
  });
  it('04:30 belongs to the evening before (D11), so it is not a past day', () => {
    expect(tradingDayOf(new Date('2026-10-01T04:30:00+05:00'))).toBe('2026-09-30');
    expect(tradingDayOf(new Date('2026-10-01T05:00:00+05:00'))).toBe('2026-10-01');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/day-correction-message.test.ts src/main/server/lib/serial-runner.test.ts src/main/server/lib/expense-day.test.ts
```

Expected: three files fail to import their module.

- [ ] **Step 3: Implement**

`serial-runner.ts`:

```ts
/**
 * One job at a time, in arrival order. Day corrections run through one runner, so the profit
 * "before" of one correction is the "after" of the one ahead of it. Process-local: the master is
 * one process.
 */
export function createSerialRunner(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => undefined);
    return next;
  };
}
```

`expense-day.ts`: the four outcomes exactly as the tests state, in this order: `day > today` →
FUTURE_DAY; `day < today && closed && !correction` → PAST_DAY_NEEDS_CORRECTION;
`day < today && closed` → correction; anything else → ordinary. Keys compare as strings
(`YYYY-MM-DD`). Comment that `closed` comes from `dayCorrectionService.isClosedDay`.

`day-correction-message.ts`: `escapeHtml` for `&`, `<`, `>`; money through `formatUZS`; the
`Kun:` line through P2's `formatDayKeyUZ` (no local day formatter); lines joined with `\n`; the
Kutilgan line only when `before.expected` and `after.expected` are both defined, the Farq line
likewise. Re-export `formatDayKeyUZ` from this file only if P6 needs a single import.

- [ ] **Step 4: Run them to verify they pass, then the gates**

Same command as Step 2: all pass. Then run the gates: `pnpm test` is the floor + 13.

- [ ] **Step 5: Commit**

```bash
cd /Users/uzmacbook/dev/lab/project02-money
git add apps/master/src/main/server/lib/day-correction-message.ts apps/master/src/main/server/lib/day-correction-message.test.ts apps/master/src/main/server/lib/serial-runner.ts apps/master/src/main/server/lib/serial-runner.test.ts apps/master/src/main/server/lib/expense-day.ts apps/master/src/main/server/lib/expense-day.test.ts
git commit -m "feat(expenses): pure rules for past-day corrections and their owner message"
```

---

### Task 3: The day correction service

**Files:**
- Create: `apps/master/src/main/server/services/day-correction.service.ts`
- Modify: `apps/master/prisma/schema.prisma:125` (append `DAY_CORRECTED` after `ITEM_COST_CHANGED`)
- Modify: `apps/master/src/main/server/services/alert.service.ts:137` (new method before `itemStockOut`)
- Modify: `apps/master/src/main/server/lib/errors.ts:57-58`
- Modify: `apps/master/src/renderer/lib/audit-labels.ts:28-29, :92, :111-116`
- Test: `apps/master/e2e/19-day-correction.test.ts` (new file, so P6 never edits it)

**Interfaces:**
- Consumes: Task 2 helpers; `reportsService.dailyLedger(tradingDay)`; `auditService.log`; `userRepo.findById` (`user.repo.ts:11`).
- `snapshot(tradingDay)` calls `reportsService.dailyLedger(tradingDay)` with the trading-day key;
  P2 keeps `dailyLedger`'s string signature.
- Produces (P5 and P6 build on these; keep the signatures). `apply`'s signature is frozen, because
  P6 T7 and P5 T6 call it:
  `apply<T>({ tradingDay, actorUserId, what, entityType, write, entityIdOf? }) → { result, before, after }`.

```ts
export const dayCorrectionService: {
  /**
   * The day's figures a correction reports: reportsService.dailyLedger(tradingDay), by key.
   * P5 extends it with expected (Kutilgan) and difference (Farq).
   */
  snapshot(tradingDay: string): Promise<DaySnapshot>;
  /**
   * Every trading day before today's, before and after P5. P5's close windows are time-based, so
   * an entry after a count lands in the next close; P5 adds stampInsideClose in create and reverse.
   */
  isClosedDay(tradingDay: string): Promise<boolean>;
  /**
   * Runs `write` in one transaction as a correction of `tradingDay`: snapshot before, write,
   * snapshot after, one DAY_CORRECTED audit row, one owner message. Serialized with every other
   * correction. Never call it from inside a transaction.
   */
  apply<T>(input: {
    tradingDay: string;
    actorUserId: string;
    what: string;                       // Uzbek, one line, e.g. "Chiqim qo'shildi: Gaz — 30 000 so'm"
    entityType: string;                 // 'Expense', 'Debt', …
    write: (tx: Prisma.TransactionClient) => Promise<T>;
    entityIdOf?: (result: T) => string;
  }): Promise<{ result: T; before: DaySnapshot; after: DaySnapshot }>;
};
alertService.dayCorrected(m: Parameters<typeof formatDayCorrection>[0]): Promise<void>;
Errors.PastDayNeedsCorrection(): AppError; // 409 PAST_DAY_NEEDS_CORRECTION
Errors.FutureDay(): AppError;              // 400 FUTURE_DAY
```

- [ ] **Step 1: Write the failing e2e test**

Create `apps/master/e2e/19-day-correction.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// Day corrections (money rules D13, D23): the one service every change to a past day goes through.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { at, boot, buildWorld, capturePrints, sale, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D1 = '2026-09-28';
const D2 = '2026-09-29';
let svc: typeof import('../src/main/server/services/day-correction.service').dayCorrectionService;

const gas = (amount: number) => (tx: any) =>
  tx.expense.create({ data: { categoryId: 'seed-cat-operational', amount, reason: 'Gaz', occurredAt: at(`${D1}T12:00`), createdById: 'seed-admin' } });

const messagesDuring = async (fn: () => Promise<unknown>) => {
  const spy = vi.spyOn(env.svc.telegram, 'sendMessage');
  try {
    await fn();
    return spy.mock.calls.map((c) => String(c[0])).filter((t) => t.includes("O'tgan kun tuzatildi"));
  } finally {
    spy.mockRestore();
  }
};

beforeAll(async () => {
  setClock(at(`${D1}T10:00`));
  env = await boot('day-correction');
  w = await buildWorld(env.base);
  svc = (await import('../src/main/server/services/day-correction.service')).dayCorrectionService;
  // Osh ×2: Sotuv 90 000, tan narx 2 × 25 000 → Foyda 40 000.
  await sale(w, w.w1, [[w.items.osh, 2]], { payments: [{ method: 'CASH', amount: 90000 }] });
  setClock(at(`${D2}T11:00`));
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('Day corrections', () => {
  it('[D13] a correction recomputes the day, writes one audit row and tells the owner profit before and after', async () => {
    let r: any;
    const messages = await messagesDuring(async () => {
      r = await svc.apply({ tradingDay: D1, actorUserId: 'seed-admin', what: "Chiqim qo'shildi: Gaz — 15 000 so'm", entityType: 'Expense', write: gas(15000), entityIdOf: (e: any) => e.id });
    });
    const audits = await env.prisma.auditLog.findMany({ where: { action: 'DAY_CORRECTED' } });
    expect({
      before: r.before.profit,
      after: r.after.profit,
      ledger: (await env.svc.reports.dailyLedger(D1)).pnl.profit,
      audits: audits.map((a) => ({ user: a.userId, entityId: a.entityId, meta: a.metadata })),
      messages,
    }).toEqual({
      before: '40000',
      after: '25000',
      ledger: '25000',
      audits: [{
        user: 'seed-admin',
        entityId: D1,
        meta: { tradingDay: D1, what: "Chiqim qo'shildi: Gaz — 15 000 so'm", sourceEntityType: 'Expense', sourceEntityId: r.result.id, before: { profit: '40000' }, after: { profit: '25000' } },
      }],
      messages: ["<b>O'tgan kun tuzatildi</b>\nKun: 28.09.2026\nNima: Chiqim qo'shildi: Gaz — 15 000 so'm\nKim: Admin\nFoyda: 40 000 → 25 000 so'm"],
    });
  });

  it('[D13] two corrections at once run one after the other: the second starts where the first ended', async () => {
    await Promise.all([
      svc.apply({ tradingDay: D1, actorUserId: 'seed-admin', what: 'a', entityType: 'Expense', write: gas(10000) }),
      svc.apply({ tradingDay: D1, actorUserId: 'seed-admin', what: 'b', entityType: 'Expense', write: gas(5000) }),
    ]);
    // Read the chain from the figures, not from createdAt: two rows can share a millisecond.
    const rows = (await env.prisma.auditLog.findMany({ where: { action: 'DAY_CORRECTED' } }))
      .map((a) => [(a.metadata as any).before.profit, (a.metadata as any).after.profit] as [string, string])
      .filter(([before]) => before !== '40000');
    const first = rows.find(([before]) => before === '25000');
    const second = rows.find((r) => r !== first);
    expect({ count: rows.length, firstStarts: first?.[0], secondStartsAtFirstEnd: second?.[0] === first?.[1], ends: second?.[1] })
      .toEqual({ count: 2, firstStarts: '25000', secondStartsAtFirstEnd: true, ends: '10000' });
  });

  it('[D13] a correction whose write fails changes nothing, writes no audit row and tells no one', async () => {
    const expenses = await env.prisma.expense.count();
    const audits = await env.prisma.auditLog.count({ where: { action: 'DAY_CORRECTED' } });
    const messages = await messagesDuring(async () => {
      await expect(svc.apply({
        tradingDay: D1, actorUserId: 'seed-admin', what: 'x', entityType: 'Expense',
        write: async (tx) => { await gas(99000)(tx); throw new Error('refused'); },
      })).rejects.toThrow('refused');
    });
    expect({
      expenses: await env.prisma.expense.count(),
      audits: await env.prisma.auditLog.count({ where: { action: 'DAY_CORRECTED' } }),
      messages: messages.length,
      profit: (await env.svc.reports.dailyLedger(D1)).pnl.profit,
    }).toEqual({ expenses, audits, messages: 0, profit: '10000' });
  });

  it('every trading day before today is closed (05:00 boundary)', async () => {
    setClock(at(`${D2}T11:00`));
    const at1100 = [await svc.isClosedDay(D1), await svc.isClosedDay(D2)];
    setClock(at('2026-09-30T04:30')); // still D2's trading day
    const at0430 = await svc.isClosedDay(D2);
    setClock(at(`${D2}T11:00`));
    expect({ at1100, at0430 }).toEqual({ at1100: [true, false], at0430: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/19-day-correction.test.ts
```

Expected: the file fails to import `day-correction.service`.

- [ ] **Step 3: Add the audit action and generate the client**

In `schema.prisma`, add `DAY_CORRECTED` after `ITEM_COST_CHANGED` (line 125). Then:

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --name day_corrected_audit_action
docker exec -w /app/apps/master CONTAINER pnpm exec prisma generate
```

On SQLite the enum is TEXT, so Prisma may report the database already in sync and write no
migration. That is expected; do not hand-write one. If it does write one, it must contain no
`RedefineTables`.

- [ ] **Step 4: Errors and the alert**

In `errors.ts`, replace `ExpenseReversalSameDayOnly` (`:57-58`; Task 5 removes its one caller, so
keep it until then and delete it in Task 5) by adding beside it:

```ts
  PastDayNeedsCorrection: () =>
    new AppError('PAST_DAY_NEEDS_CORRECTION', 409, "Bu kun yopilgan. Uni tuzatish uchun \"O'tgan kun\"ni tanlang"),
  FutureDay: () =>
    new AppError('FUTURE_DAY', 400, "Kelgusi kunga chiqim yozib bo'lmaydi"),
```

In `alert.service.ts`, add before `itemStockOut`:

```ts
  /** A past trading day was corrected (money rules D13). Always sent; the caller awaits it. */
  async dayCorrected(m: DayCorrectionInput): Promise<void> {
    await send(formatDayCorrection(m));
  },
```

with `import { formatDayCorrection } from '../lib/day-correction-message';` and
`type DayCorrectionInput = Parameters<typeof formatDayCorrection>[0];`.

- [ ] **Step 5: The service**

```ts
import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { tradingDayOf } from '../lib/time';
import { createSerialRunner } from '../lib/serial-runner';
import type { DaySnapshot } from '../lib/day-correction-message';
import { userRepo } from '../repositories/user.repo';
import { auditService } from './audit.service';
import { alertService } from './alert.service';

type Tx = Prisma.TransactionClient;
const serial = createSerialRunner();

async function snapshot(tradingDay: string): Promise<DaySnapshot> {
  // Lazy: reports.service imports expense.service, which imports this file.
  const { reportsService } = await import('./reports.service');
  const ledger = await reportsService.dailyLedger(tradingDay);
  return { profit: ledger.pnl.profit };
}

export const dayCorrectionService = {
  snapshot,

  async isClosedDay(tradingDay: string): Promise<boolean> {
    return tradingDay < tradingDayOf(new Date());
  },

  async apply<T>(input: {
    tradingDay: string;
    actorUserId: string;
    what: string;
    entityType: string;
    write: (tx: Tx) => Promise<T>;
    entityIdOf?: (result: T) => string;
  }): Promise<{ result: T; before: DaySnapshot; after: DaySnapshot }> {
    const done = await serial(async () => {
      // Both snapshots run outside the transaction: the master has one SQLite connection, and a
      // ledger read inside the callback would wait for the transaction holding it.
      const before = await snapshot(input.tradingDay);
      const result = await getPrisma().$transaction((tx) => input.write(tx));
      const after = await snapshot(input.tradingDay);
      // Inside the serial section, so audit rows keep the order the corrections ran in. The
      // change's own audit row (written by `write`, inside its transaction) also names the day,
      // so a crash between the commit and this line still leaves a trail.
      await auditService.log({
        userId: input.actorUserId,
        action: 'DAY_CORRECTED',
        entityType: 'TradingDay',
        entityId: input.tradingDay,
        metadata: {
          tradingDay: input.tradingDay,
          what: input.what,
          sourceEntityType: input.entityType,
          sourceEntityId: input.entityIdOf ? input.entityIdOf(result) : null,
          before,
          after,
        },
      });
      return { result, before, after };
    });
    const actor = await userRepo.findById(input.actorUserId);
    // Awaited (at most 5 s, alertService.send): a correction is rare, and the operator's
    // "egasiga xabar yuborildi" should be true when it is shown.
    await alertService.dayCorrected({
      tradingDay: input.tradingDay,
      what: input.what,
      actorName: actor?.fullName ?? '-',
      before: done.before,
      after: done.after,
    });
    return done;
  },
};
```

If `userRepo.findById` returns the password hash, select only `fullName` through a new
`userRepo.findNameById` instead; never pass a user row further than this function.

- [ ] **Step 6: Audit label**

In `audit-labels.ts`: `DAY_CORRECTED: "O'tgan kun tuzatildi"` after `EXPENSE_REVERSED` (`:29`);
add `'DAY_CORRECTED'` to the "Chiqim va qarz" group (`:92`); add it to the `'warning'` tone list
(`:116`).

- [ ] **Step 7: Run the test to verify it passes, then the gates**

Step 2's command: `Tests  4 passed (4)`. Then the gates: e2e = floor + 4 passing, nothing newly red.

- [ ] **Step 8: Commit**

```bash
git add apps/master/prisma apps/master/src/main/server/services/day-correction.service.ts apps/master/src/main/server/services/alert.service.ts apps/master/src/main/server/lib/errors.ts apps/master/src/renderer/lib/audit-labels.ts apps/master/e2e/19-day-correction.test.ts
git commit -m "feat(finance): one service for correcting a past trading day" -m "Profit before and after, one DAY_CORRECTED audit row, one owner message, one correction at a time. Money rules D13 and D23; P6 and day close build on it."
```

Hand this commit to P6 (`git log -1 --format=%H`).

---

### Task 4: The expense form's server side: Mahsulot xaridi and explicit corrections

**Files:**
- Modify: `apps/master/src/main/server/controllers/expense.controller.ts:7-14` (schema), `:80-95` (create)
- Modify: `apps/master/src/main/server/services/expense.service.ts:7` (imports), `:34-78` (`mapExpense`), `:214-289` (`create`)
- Modify: `apps/master/e2e/05-expenses.test.ts:25-40` (`[issue 3]`), `:91-103` (`[issue 5]`), new describe at the end
- Modify: `apps/master/e2e/14-forensics.test.ts:30, :70-71`; `apps/master/e2e/prod-forensics.ts:175-178`

**Interfaces:**
- Consumes: `expenseDayRule`, `dayCorrectionService`, P2's `tradingDayOf` (`lib/time.ts`), P3's `paymentMethod`.
- Produces: `POST /api/expenses` body `{ amount, reason, note?, occurredAt?, kind?, correction?, repayable?, categoryId?, paymentMethod? }`; DTO fields `tradingDay`, `isCorrection`, `isFoodPurchase`.

- [ ] **Step 1: Write the failing tests in `05-expenses.test.ts`**

Add a helper after `const ledger = …` (line 12):

```ts
const messagesDuring = async (fn: () => Promise<unknown>) => {
  const spy = vi.spyOn(env.svc.telegram, 'sendMessage');
  try {
    await fn();
    return spy.mock.calls.map((c) => String(c[0])).filter((t) => t.includes("O'tgan kun tuzatildi"));
  } finally {
    spy.mockRestore();
  }
};
```

(add `vi` to the vitest import.) Replace the `[issue 3]` test (`:25-40`) with:

```ts
  it('[issue 3] tea bought at the bazaar, filed as Mahsulot xaridi, reaches profit once (D15)', async () => {
    // 20 cups of choy (tan narx 1 000) sold for 100 000; the tea itself bought for 20 000.
    setClock(at(`${D1}T10:00`));
    await sale(w, w.w1, [[w.items.choy, 20]], { payments: [{ method: 'CASH', amount: 100000 }] });
    // Keldi refuses an uncounted dish, so the tea goes through the expense form.
    const keldi = await w.admin.call('POST', `/api/stock/${w.items.choy}/restock`, { qty: 20, paidUzs: 20000 });
    expect(keldi.status, 'Keldi for an uncounted dish').toBeGreaterThanOrEqual(400);
    const before = await ledger(D1);
    const row = await w.admin.post('/api/expenses', { amount: 20000, reason: 'Choy bargi', kind: 'FOOD_PURCHASE' });
    const l = await ledger(D1);
    expect({
      category: row.categoryName,
      isFoodPurchase: row.isFoodPurchase,
      tradingDay: row.tradingDay,
      profit: n(l.pnl.profit),
      xarajat: n(l.pnl.operatingExpense) - n(before.pnl.operatingExpense),
      chiqim: n(l.cashflow.cashOut) - n(before.cashflow.cashOut),
    }).toEqual({ category: 'Mahsulot xaridi', isFoodPurchase: true, tradingDay: D1, profit: 80000, xarajat: 0, chiqim: 20000 });
  });

  it('[D15] a Mahsulot xaridi is never repayable', async () => {
    const before = await env.prisma.expense.count();
    const r = await w.admin.call('POST', '/api/expenses', { amount: 30000, reason: 'Guruch', kind: 'FOOD_PURCHASE', repayable: true });
    expect({ status: r.status, code: r.body?.error?.code, written: (await env.prisma.expense.count()) - before })
      .toEqual({ status: 400, code: 'VALIDATION', written: 0 });
  });
```

Replace the `[issue 5]` test (`:91-103`) with:

```ts
  it('[issue 5] a past day is booked only as an explicit correction (D13)', async () => {
    setClock(at(`${D2}T11:00`));
    await w.relogin();
    d1Before = await ledger(D1);
    const d2Before = await ledger(D2);
    // What Chiqimlar used to send while its date picker showed yesterday: noon of that day.
    const body = { amount: 300000, reason: 'Qassobga (kecha uchun)', occurredAt: at(`${D1}T12:00`).toISOString() };
    const silent = await w.admin.call('POST', '/api/expenses', body);
    const afterSilent = await ledger(D1);
    let corrected: any;
    const messages = await messagesDuring(async () => {
      corrected = await w.admin.call('POST', '/api/expenses', { ...body, correction: true });
    });
    const d1After = await ledger(D1);
    const d2After = await ledger(D2);
    expect({
      silent: [silent.status, silent.body?.error?.code],
      silentMovedD1: n(afterSilent.pnl.profit) - n(d1Before.pnl.profit),
      corrected: [corrected.status, corrected.body?.tradingDay, corrected.body?.isCorrection],
      d1Profit: n(d1After.pnl.profit) - n(d1Before.pnl.profit),
      d1Chiqim: n(d1After.cashflow.cashOut) - n(d1Before.cashflow.cashOut),
      d2Chiqim: n(d2After.cashflow.cashOut) - n(d2Before.cashflow.cashOut),
      messages: messages.length,
      says: messages[0] ?? '',
    }).toEqual({
      silent: [409, 'PAST_DAY_NEEDS_CORRECTION'],
      silentMovedD1: 0,
      corrected: [201, D1, true],
      d1Profit: -300000,
      d1Chiqim: 300000,
      d2Chiqim: 0,
      messages: 1,
      says: expect.stringContaining(`Foyda: ${fmt(n(d1Before.pnl.profit))} → ${fmt(n(d1Before.pnl.profit) - 300000)} so'm`),
    });
  });
```

with `const fmt = (v: number) => (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');`
beside the helper.

Append a new describe at the end of the file:

```ts
describe('Corrections to a whole day (D11, D13, D23)', () => {
  const D3 = '2026-09-30';
  const D4 = '2026-10-01';

  it('control: Osh ×2 on a fresh day makes 40 000 profit', async () => {
    setClock(at(`${D3}T10:00`));
    await w.relogin();
    await sale(w, w.w1, [[w.items.osh, 2]], { payments: [{ method: 'CASH', amount: 90000 }] });
    expect(n((await ledger(D3)).pnl.profit)).toBe(40000);
  });

  it('[D11] at 04:30 an expense still belongs to the evening before; no correction needed', async () => {
    setClock(at(`${D4}T04:30`));
    await w.relogin();
    const r = await w.admin.call('POST', '/api/expenses', { amount: 10000, reason: 'Non' });
    expect({ status: r.status, day: r.body?.tradingDay, correction: r.body?.isCorrection, profit: n((await ledger(D3)).pnl.profit) })
      .toEqual({ status: 201, day: D3, correction: false, profit: 30000 });
  });

  it('[D13] a forgotten Gaz bill is written to the day the cash left, and the owner is told', async () => {
    setClock(at(`${D4}T11:00`));
    await w.relogin();
    const d3Before = await ledger(D3);
    let r: any;
    const messages = await messagesDuring(async () => {
      r = await w.admin.call('POST', '/api/expenses', { amount: 30000, reason: 'Gaz', occurredAt: at(`${D3}T12:00`).toISOString(), correction: true });
    });
    const d3 = await ledger(D3);
    const d4 = await ledger(D4);
    const audit = await env.prisma.auditLog.findFirstOrThrow({ where: { action: 'DAY_CORRECTED', entityId: D3 }, orderBy: { createdAt: 'desc' } });
    expect({
      status: r.status,
      d3Profit: n(d3.pnl.profit),
      d3Chiqim: n(d3.cashflow.cashOut) - n(d3Before.cashflow.cashOut),
      d4: [n(d4.cashflow.cashOut), n(d4.pnl.profit)],
      audit: [audit.userId, (audit.metadata as any).before.profit, (audit.metadata as any).after.profit],
      messages,
    }).toEqual({
      status: 201,
      d3Profit: 0,
      d3Chiqim: 30000,
      d4: [0, 0],
      audit: ['seed-admin', '30000', '0'],
      messages: ["<b>O'tgan kun tuzatildi</b>\nKun: 30.09.2026\nNima: Chiqim qo'shildi: Gaz — 30 000 so'm\nKim: Admin\nFoyda: 30 000 → 0 so'm"],
    });
  });

  it('[D13] a Mahsulot xaridi written to a past day changes its Chiqim, not its profit', async () => {
    const before = await ledger(D3);
    const messages = await messagesDuring(() =>
      w.admin.post('/api/expenses', { amount: 25000, reason: "Go'sht", kind: 'FOOD_PURCHASE', occurredAt: at(`${D3}T12:00`).toISOString(), correction: true }));
    const after = await ledger(D3);
    expect({ profit: n(after.pnl.profit), chiqim: n(after.cashflow.cashOut) - n(before.cashflow.cashOut), says: messages[0] })
      .toEqual({ profit: 0, chiqim: 25000, says: expect.stringContaining("Nima: Chiqim qo'shildi: Go'sht — 25 000 so'm (Mahsulot xaridi)\nKim: Admin\nFoyda: 0 → 0 so'm") });
  });

  it('[D13] a later day is refused and nothing is written', async () => {
    const before = await env.prisma.expense.count();
    const r = await w.admin.call('POST', '/api/expenses', { amount: 5000, reason: 'Ertaga', occurredAt: at('2026-10-02T12:00').toISOString() });
    expect({ status: r.status, code: r.body?.error?.code, written: (await env.prisma.expense.count()) - before })
      .toEqual({ status: 400, code: 'FUTURE_DAY', written: 0 });
  });
});
```

If Task 1 found P3 appends ` (Naqd)` or other text to the expense line, or Admin's name differs,
adjust the exact strings in one place and note it.

- [ ] **Step 2: Run to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/05-expenses.test.ts
```

Expected: `[issue 3]` (category `Operatsion`, profit 60 000), `[D15]` (201), `[issue 5]` (201 on the
silent post), `[D11]`? passes already if P2 is in, the `[D13]` tests fail on status or message.

- [ ] **Step 3: The controller schema**

```ts
const createExpenseSchema = z.object({
  categoryId: z.string().min(1).optional(),
  kind: z.enum(['OPERATING', 'FOOD_PURCHASE']).optional(),
  amount: somAmount,
  reason: z.string().trim().min(3),
  note: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
  repayable: z.boolean().optional(),
  correction: z.boolean().optional(),
  // + P3's paymentMethod, unchanged
});
```

`create` passes `occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date()`, `kind`,
`correction`.

- [ ] **Step 4: `expenseService.create`**

Replace the category choice at `:223-243`: `categoryId = input.categoryId ?? (input.kind === 'FOOD_PURCHASE' ? 'seed-cat-ingredients' : 'seed-cat-operational')`,
keeping the existing fallback. Name the two ids once at the top of the file
(`FOOD_PURCHASE_CATEGORY_ID`, `OPERATING_CATEGORY_ID`). After the amount check:

```ts
    const isFoodPurchase = categoryId === FOOD_PURCHASE_CATEGORY_ID;
    if (isFoodPurchase && input.repayable) {
      throw Errors.Validation("Mahsulot xaridi qaytariladigan bo'lmaydi");
    }

    const day = tradingDayOf(input.occurredAt);
    const rule = expenseDayRule({
      day,
      today: tradingDayOf(new Date()),
      closed: await dayCorrectionService.isClosedDay(day),
      correction: input.correction === true,
    });
    if (!rule.ok) {
      throw rule.error === 'FUTURE_DAY' ? Errors.FutureDay() : Errors.PastDayNeedsCorrection();
    }

    const write = async (tx: Tx) => {
      const created = await expenseRepo.create({ /* as today, plus P3's paymentMethod */ }, tx);
      await auditService.log({
        /* as today; metadata gains: */
        // kind: isFoodPurchase ? 'FOOD_PURCHASE' : 'OPERATING',
        // correction: rule.isCorrection ? { tradingDay: day } : null,
      }, tx);
      return created;
    };

    if (rule.isCorrection) {
      const { result } = await dayCorrectionService.apply({
        tradingDay: day,
        actorUserId: input.actorUserId,
        what: `Chiqim qo'shildi: ${input.reason.trim()} — ${formatUZS(amount.toFixed(0))} so'm${tags}`,
        entityType: 'Expense',
        write,
        entityIdOf: (row) => row.id,
      });
      // No "Katta chiqim" alert as well: the correction message already carries the amount.
      return mapExpense(await expenseRepo.findById(result.id));
    }

    const expense = await getPrisma().$transaction(write);
    void alertService.largeExpense({ /* as today */ });
    return mapExpense(await expenseRepo.findById(expense.id));
```

`tags` is `' (Mahsulot xaridi)'` for a food purchase, then `' (Karta)'` for a P3 Karta expense;
empty otherwise. `create` accepts `kind?` and `correction?` in its input type.

- [ ] **Step 5: `mapExpense`, and a JS-clock `createdAt`**

Every `expenseRepo.create` call in `expense.service.ts` (create and, in Task 5, the REVERSAL row)
passes `createdAt: new Date()`. Prisma fills `@default(now())` in its query engine, whose clock the
e2e fake clock (`setClock`, Date only) does not move, and `isCorrection` compares `createdAt` with
`occurredAt`; on the till both clocks are the same, so nothing changes there.

Add to `mapExpense`, with `FOOD_PURCHASE_CATEGORY_ID` and P2's `tradingDayOf`:

```ts
    tradingDay: tradingDayOf(item.occurredAt),
    isCorrection: tradingDayOf(item.occurredAt) < tradingDayOf(item.createdAt),
    isFoodPurchase: item.categoryId === FOOD_PURCHASE_CATEGORY_ID,
```

- [ ] **Step 6: Keep the forensics plants and the diagnostic true**

`14-forensics.test.ts` plants a backdated expense and an avans given yesterday through the API
(`:30`, `:70`, `:71`); the API now refuses them, so `beforeAll` would throw and all 19 forensics
tests would fail. Write them as an old database holds them: replace each
`w.admin.post('/api/expenses', { …, occurredAt: yesterdayNoon() })` with
`env.prisma.expense.create({ data: { categoryId: 'seed-cat-operational', amount, reason, repayable?, occurredAt: new Date(yesterdayNoon()), createdById: 'seed-admin' } })`,
keeping the returned `id` the later lines use (`old.id`, `avansOld.id`). Comment: "the damage the
old build let through; the server now writes a past day only as a correction".

In `prod-forensics.ts` (`:175-178`), the `backdated` finding must not count corrections. Add to its
`WHERE`:

```sql
AND NOT EXISTS (SELECT 1 FROM AuditLog a WHERE a.entityId = e.id AND a.action = 'EXPENSE_CREATED'
                AND json_extract(a.metadata, '$.correction') IS NOT NULL)
```

and add one line to its `meaning`: `Corrections made with the 2026-10 build are not counted.`

- [ ] **Step 7: Run to verify they pass, then the gates**

Step 2's command: every test named in Step 1 passes. The forensics file:

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/14-forensics.test.ts 2>&1 | grep -E '^\s+Tests'
```

Expected: the same count as at Task 1. Then the gates. The Chiqimlar dialog still sends the page
date as `occurredAt`, so a past date shown on the page now answers 409 until Task 10; that is the
fix for issue 5 arriving server-first.

- [ ] **Step 8: Commit**

```bash
git add apps/master/src/main/server/controllers/expense.controller.ts apps/master/src/main/server/services/expense.service.ts apps/master/e2e/05-expenses.test.ts apps/master/e2e/14-forensics.test.ts apps/master/e2e/prod-forensics.ts
git commit -m "feat(expenses): Mahsulot xaridi and explicit past-day corrections" -m "A past trading day is written only with correction: true, through the day correction service, and the owner is told. Mahsulot xaridi leaves the till without reaching profit. Money rules D13, D15, D23."
```

---

### Task 5: Undo: claim first, stamp on its own day, correct a past day

**Files:**
- Modify: `apps/master/src/main/server/repositories/expense.repo.ts:55-60` (add `reverseIfActive` after `updateStatus`)
- Modify: `apps/master/src/main/server/services/expense.service.ts:405-461` (`reverse`)
- Modify: `apps/master/src/main/server/controllers/expense.controller.ts:16-18, :97-108`
- Modify: `apps/master/src/main/server/lib/errors.ts:57-58` (delete `ExpenseReversalSameDayOnly`)
- Test: `apps/master/e2e/05-expenses.test.ts` (two tests)

**Interfaces:**
- Consumes: Task 3, Task 4.
- Produces: `expenseRepo.reverseIfActive(id: string, tx: Tx): Promise<boolean>`;
  `POST /api/expenses/:id/reverse` body `{ note, correction? }`; `expenseService.reverse` input
  gains `correction?: boolean` and keeps its return shape. Task 6 adds the Keldi step inside
  `write`.

- [ ] **Step 1: Write the failing tests**

In `05-expenses.test.ts`, directly after the `[issue 5]` test:

```ts
  it('[D13] the past-day entry is undone the same way, and the day comes back', async () => {
    const entry = (await w.admin.get(`/api/expenses?date=${D1}`)).items.find((e: any) => e.reason === 'Qassobga (kecha uchun)' && e.status === 'ACTIVE');
    const before = await ledger(D1);
    const d2Before = await ledger(D2);
    const silent = await w.admin.call('POST', `/api/expenses/${entry.id}/reverse`, { note: 'Ikki marta yozildi' });
    let undo: any;
    const messages = await messagesDuring(async () => {
      undo = await w.admin.call('POST', `/api/expenses/${entry.id}/reverse`, { note: 'Ikki marta yozildi', correction: true });
    });
    const twice = await w.admin.call('POST', `/api/expenses/${entry.id}/reverse`, { note: 'Ikki marta yozildi', correction: true });
    const after = await ledger(D1);
    const d2After = await ledger(D2);
    expect({
      silent: [silent.status, silent.body?.error?.code],
      undo: [undo.status, undo.body?.reversal?.occurredAt?.slice(0, 10) === entry.occurredAt.slice(0, 10)],
      twice: twice.status,
      d1Profit: n(after.pnl.profit) - n(before.pnl.profit),
      d1Chiqim: n(after.cashflow.cashOut) - n(before.cashflow.cashOut),
      d2: [n(d2After.cashflow.cashOut) - n(d2Before.cashflow.cashOut), n(d2After.pnl.profit) - n(d2Before.pnl.profit)],
      d1BackToStart: n(after.pnl.profit) === n(d1Before.pnl.profit),
      messages: messages.length,
    }).toEqual({
      silent: [409, 'PAST_DAY_NEEDS_CORRECTION'],
      undo: [200, true],
      twice: 409,
      d1Profit: 300000,
      d1Chiqim: -300000,
      d2: [0, 0],
      d1BackToStart: true,
      messages: 1,
    });
  });
```

In the "Corrections to a whole day" describe, after the Mahsulot xaridi test:

```ts
  it('[D23] the owner undoes the Gaz entry; the day is told, and nothing moves to today', async () => {
    const gaz = (await w.owner.get(`/api/expenses?date=${D3}`)).items.find((e: any) => e.reason === 'Gaz' && e.status === 'ACTIVE');
    let r: any;
    const messages = await messagesDuring(async () => {
      r = await w.owner.call('POST', `/api/expenses/${gaz.id}/reverse`, { note: 'Ikki marta yozildi', correction: true });
    });
    const d3 = await ledger(D3);
    const d4 = await ledger(D4);
    expect({ status: r.status, d3Profit: n(d3.pnl.profit), d4: [n(d4.cashflow.cashOut), n(d4.pnl.profit)], messages }).toEqual({
      status: 200,
      d3Profit: 30000,
      d4: [0, 0],
      messages: ["<b>O'tgan kun tuzatildi</b>\nKun: 30.09.2026\nNima: Chiqim bekor qilindi: Gaz — 30 000 so'm\nKim: Owner\nFoyda: 0 → 30 000 so'm"],
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/05-expenses.test.ts -t "undone the same way|owner undoes"
```

Expected: both fail with 409 `EXPENSE_REVERSAL_SAME_DAY_ONLY` on the flagged undo.

- [ ] **Step 3: The conditional claim**

```ts
  /** ACTIVE → REVERSED as one conditional statement; false when it was no longer ACTIVE. */
  async reverseIfActive(id: string, tx: Tx): Promise<boolean> {
    const result = await tx.expense.updateMany({
      where: { id, status: ExpenseStatus.ACTIVE },
      data: { status: ExpenseStatus.REVERSED },
    });
    return result.count === 1;
  },
```

- [ ] **Step 4: `expenseService.reverse`**

Keep the checks at `:410-419` and `:423-425`. Replace `:420-422` and the transaction:

```ts
    const day = tradingDayOf(original.occurredAt);
    const closed = await dayCorrectionService.isClosedDay(day);
    if (closed && !input.correction) {
      throw Errors.PastDayNeedsCorrection();
    }

    const write = async (tx: Tx) => {
      // Claim first: a second undo (double tap, two stations) finds it no longer ACTIVE.
      if (!(await expenseRepo.reverseIfActive(original.id, tx))) {
        throw Errors.ExpenseAlreadyReversed();
      }
      // Stamped on the original's own moment, always: an undo never moves money between days,
      // so its day's cashOut nets it as a same-day reversal and no other day changes.
      const reversal = await expenseRepo.create({
        /* as today, with */ occurredAt: original.occurredAt,
      }, tx);
      await auditService.log({
        /* as today; metadata gains */ // correction: closed ? { tradingDay: day } : null,
      }, tx);
      return { originalId: original.id, reversalId: reversal.id };
    };

    const result = closed
      ? (await dayCorrectionService.apply({
          tradingDay: day,
          actorUserId: input.actorUserId,
          what: `Chiqim bekor qilindi: ${original.reason} — ${formatUZS(original.amount.toFixed(0))} so'm`,
          entityType: 'Expense',
          write,
          entityIdOf: (r) => r.originalId,
        })).result
      : await getPrisma().$transaction(write);
```

The controller schema gains `correction: z.boolean().optional()` and passes it. Delete
`Errors.ExpenseReversalSameDayOnly` (`EXPENSE_REVERSAL_SAME_DAY_ONLY`) and, from
`expense.service.ts`, the `isSameTradingDay` import (P2 mapped `isSameLocalDay` to it). Do not
delete `isSameTradingDay` from `lib/time.ts`: P2's unit tests cover it.

Note in "Deviations" if any test measured where today's REVERSAL row sits in time: it now carries
the original's `occurredAt` (its `createdAt` is the undo moment).

- [ ] **Step 5: Run to verify they pass, then the gates**

Step 2's command: both pass. Whole `05` file: every test that passed before still passes. Then the
gates; `11` `[issue 25]` must not change status.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/main/server apps/master/e2e/05-expenses.test.ts
git commit -m "feat(expenses): undo an entry on its own day, a past day as a correction" -m "The status claim is conditional, the reversal carries the original's time, and a closed day is undone only with correction: true. The same-day-only rule is gone (money rules D13, D23)."
```

---

### Task 6: Undoing a Keldi payment takes back its stock and its tan narx (§4 item 19)

**Files:**
- Modify: `apps/master/prisma/schema.prisma:830-852` (`StockEntry`) + new migration
- Create: `apps/master/src/main/server/lib/keldi-undo.ts`, `keldi-undo.test.ts`
- Modify: `apps/master/src/main/server/services/stock.service.ts:36-51` (`mapEntry`), `:139-228` (`restock`), new `undoKeldiPayment`
- Modify: `apps/master/src/main/server/repositories/stockEntry.repo.ts` (two reads)
- Modify: `apps/master/src/main/server/services/expense.service.ts` (`reverse` → `write`, wrapped in `withEmitContext`)
- Modify: `apps/master/e2e/05-expenses.test.ts` (after `[issue 19]`, `:61-68`), `e2e/14-forensics.test.ts:76-77`, `e2e/prod-forensics.ts:202-209`

**Interfaces:**
- Consumes: Task 5's `write`.
- Produces: `keldiUndoPlan(p)`; `stockService.undoKeldiPayment(expenseId: string, tx: Tx): Promise<KeldiUndone | null>`;
  `stockEntryRepo.findByExpenseId(expenseId, tx)`, `stockEntryRepo.hasCountAfter(menuItemId, entry, tx)`;
  StockEntry DTO `undone: boolean`.

Rules (settled defaults, see Design): the portions come back off the count unless a
Sanoq was taken after the Keldi (the count already says what is on the shelf, as D26 rules for
line cancels), and never below 0; the tan narx goes back to what it was only if the Keldi set it
and nobody has changed it since.

- [ ] **Step 1: Write the failing tests**

`keldi-undo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { keldiUndoPlan } from './keldi-undo';

const base = { qty: 10, stockNow: 110, countedSince: false, costNow: '6000', unitCost: '6000', costSet: true, costBefore: '4000' };

describe('keldiUndoPlan', () => {
  it('takes the delivered portions back off the count', () => {
    expect(keldiUndoPlan(base)).toMatchObject({ stockAfter: 100, stockTakenBack: 10 });
  });
  it('never takes the count below zero', () => {
    expect(keldiUndoPlan({ ...base, stockNow: 4 })).toMatchObject({ stockAfter: 0, stockTakenBack: 4 });
  });
  it('leaves the count alone after a Sanoq taken since the Keldi', () => {
    expect(keldiUndoPlan({ ...base, countedSince: true })).toMatchObject({ stockAfter: 110, stockTakenBack: 0 });
  });
  it('leaves a dish that is not counted any more alone', () => {
    expect(keldiUndoPlan({ ...base, stockNow: null })).toMatchObject({ stockAfter: null, stockTakenBack: 0 });
  });
  it('puts back the tan narx the Keldi replaced', () => {
    expect(keldiUndoPlan(base)).toMatchObject({ restoreCost: true, costAfter: '4000' });
  });
  it('keeps a tan narx changed by hand since the Keldi', () => {
    expect(keldiUndoPlan({ ...base, costNow: '6500' })).toMatchObject({ restoreCost: false, costAfter: '6500' });
  });
  it('touches no tan narx when the Keldi set none', () => {
    expect(keldiUndoPlan({ ...base, costSet: false })).toMatchObject({ restoreCost: false, costAfter: '6000' });
  });
  it('puts back "no tan narx" when that is what the Keldi replaced', () => {
    expect(keldiUndoPlan({ ...base, costBefore: null })).toMatchObject({ restoreCost: true, costAfter: null });
  });
});
```

In `05-expenses.test.ts`, after `[issue 19]` (`:68`):

```ts
  it('[issue 19] after a Sanoq, undoing an earlier Keldi payment leaves the counted stock alone', async () => {
    setClock(at(`${D1}T12:30`));
    const entry = await w.admin.post(`/api/stock/${w.items.osh}/restock`, { qty: 10, paidUzs: 300000, setCostFromPaid: true }); // 60, tan narx 30 000
    setClock(at(`${D1}T12:35`));
    await w.admin.post(`/api/stock/${w.items.osh}/count`, { countedQty: 55 });
    setClock(at(`${D1}T12:40`));
    await w.admin.post(`/api/expenses/${entry.expenseId}/reverse`, { note: "Noto'g'ri kiritildi" });
    const history = await w.admin.get(`/api/stock/${w.items.osh}/entries`);
    expect({ item: await itemState(env, w.items.osh), undone: history.find((e: any) => e.id === entry.id)?.undone })
      .toEqual({ item: { stock: 55, cost: 25000 }, undone: true });
  });

  it('[issue 19] undoing a Keldi keeps a tan narx typed by hand since', async () => {
    setClock(at(`${D1}T12:45`)); // after the Sanoq above, so this Keldi has none after it
    const entry = await w.admin.post(`/api/stock/${w.items.osh}/restock`, { qty: 4, paidUzs: 120000, setCostFromPaid: true }); // 59, tan narx 30 000
    await w.admin.patch(`/api/menu/items/${w.items.osh}`, { costPrice: '28000' });
    await w.admin.post(`/api/expenses/${entry.expenseId}/reverse`, { note: "Noto'g'ri kiritildi" });
    const after = await itemState(env, w.items.osh);
    await w.admin.patch(`/api/menu/items/${w.items.osh}`, { costPrice: '25000' }); // as the world expects
    expect(after).toEqual({ stock: 55, cost: 28000 });
  });
```

- [ ] **Step 2: Run to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/keldi-undo.test.ts
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/05-expenses.test.ts -t "issue 19"
```

Expected: the unit file fails to import; the three `[issue 19]` tests fail (stock not taken back,
cost not restored, `undone` undefined).

- [ ] **Step 3: Schema and migration**

In `StockEntry`, after `unitCost`:

```prisma
  costPriceBefore Decimal?          // the tan narx a paid Keldi replaced (money rules §4 (19))
  costPriceSet    Boolean  @default(false)
```

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --name stock_entry_cost_before
```

The migration must be two `ALTER TABLE "StockEntry" ADD COLUMN` lines. If Prisma writes a
`RedefineTables` block instead, check it recreates `StockEntry_expenseId_key`,
`StockEntry_menuItemId_occurredAt_idx`, `StockEntry_occurredAt_idx` and every index waves 1–2
added (`grep -n "StockEntry" prisma/migrations/*/migration.sql`).

- [ ] **Step 4: `keldiUndoPlan`**

```ts
export function keldiUndoPlan(p: {
  qty: number;
  stockNow: number | null;
  countedSince: boolean;
  costNow: string | null;     // Decimal.toString() of MenuItem.costPrice now
  unitCost: string | null;    // the Keldi's unit cost, same form
  costSet: boolean;
  costBefore: string | null;
}): { stockAfter: number | null; stockTakenBack: number; restoreCost: boolean; costAfter: string | null } {
  const stockTakenBack = p.stockNow === null || p.countedSince ? 0 : Math.min(p.qty, Math.max(p.stockNow, 0));
  const stockAfter = p.stockNow === null ? null : p.stockNow - stockTakenBack;
  const restoreCost = p.costSet && p.unitCost !== null && p.costNow === p.unitCost;
  return { stockAfter, stockTakenBack, restoreCost, costAfter: restoreCost ? p.costBefore : p.costNow };
}
```

Both cost strings come from `Prisma.Decimal#toString()` of stored values, so the same stored value
always gives the same string (Keldi stores `paid ÷ qty` unrounded).

- [ ] **Step 5: Record what a paid Keldi replaced**

In `restock`, read `costPrice` in the same `findUniqueOrThrow` (`:163-166`), and give
`stockEntryRepo.create` (`:187-199`) `costPriceBefore: fresh.costPrice` and
`costPriceSet: Boolean(paid && unitCost && input.setCostFromPaid)`.

- [ ] **Step 6: The undo**

`stockEntryRepo`:

```ts
  async findByExpenseId(expenseId: string, tx: Tx) {
    return tx.stockEntry.findUnique({ where: { expenseId }, include: entryInclude });
  },
  /**
   * A Sanoq of this dish taken after the given entry. By `occurredAt` (the JS clock the
   * controllers stamp), with `createdAt` breaking a tie inside one millisecond.
   */
  async hasCountAfter(menuItemId: string, entry: { occurredAt: Date; createdAt: Date }, tx: Tx): Promise<boolean> {
    const n = await tx.stockEntry.count({
      where: {
        menuItemId,
        kind: 'COUNT',
        OR: [
          { occurredAt: { gt: entry.occurredAt } },
          { occurredAt: entry.occurredAt, createdAt: { gt: entry.createdAt } },
        ],
      },
    });
    return n > 0;
  },
```

If wave 1 (D26) already added a "latest Sanoq of a dish" read to this repo, reuse it with the same
ordering instead of adding a second one.

`stockService.undoKeldiPayment(expenseId, tx)`: find the entry (return `null` when there is none);
read the dish inside `tx`; build the plan with `countedSince = hasCountAfter(item.id, entry, tx)`;
when `stockTakenBack > 0`, `menuRepo.setStock(item.id, plan.stockAfter, tx)`, `deferEmit('admin', 'stock:changed', …)`,
and when `stockAfter` reaches 0 from above, `deferEmit('all', 'menu:itemAvailability', { menuItemId, isAvailable: false })`;
when `restoreCost`, `menuRepo.updateItem(item.id, { costPrice: plan.costAfter }, tx)`. Return
`{ stockEntryId, itemName, countBefore, countAfter, stockTakenBack, costRestored, costBefore, costAfter }`
for the audit row.

In `expenseService.reverse`, call it inside `write` after the REVERSAL row and put its result into
the `EXPENSE_REVERSED` metadata as `keldi` (null when not a Keldi payment). Wrap the whole
`reverse` body in `withEmitContext(async () => { …; await flushDeferredEmits(); return … })` as
`restock` does (`stock.service.ts:149, :225`).

`mapEntry` gains `undone: e.expense?.status === 'REVERSED'` (the include already selects it).

- [ ] **Step 7: Forensics stays true**

`14-forensics.test.ts:76-77` undoes a Keldi through the API, which now takes the stock back, so it
is no longer the damage the `keldi-undone` finding looks for. Plant it directly: mark the Keldi's
expense `REVERSED` and create its `REVERSAL` row with `env.prisma` (the same two writes as the
cross-day plant at `:31-32`, stamped now). In `prod-forensics.ts:202-203`, add to the `keldiUndone`
query:

```sql
AND NOT EXISTS (SELECT 1 FROM AuditLog a WHERE a.entityId = e.id AND a.action = 'EXPENSE_REVERSED'
                AND json_extract(a.metadata, '$.keldi') IS NOT NULL)
```

- [ ] **Step 8: Run to verify they pass, then the gates**

Step 2's commands: the unit file `8 passed`; the three `[issue 19]` tests pass. `14-forensics`
unchanged. Then the gates.

- [ ] **Step 9: Commit**

```bash
git add apps/master/prisma apps/master/src/main/server apps/master/e2e/05-expenses.test.ts apps/master/e2e/14-forensics.test.ts apps/master/e2e/prod-forensics.ts
git commit -m "fix(stock): undoing a Keldi payment takes back its portions and tan narx" -m "Unless a Sanoq was taken since, and never below zero; the tan narx goes back only if nobody changed it since. Money rules §4 (19)."
```

---

### Task 7: A paid Keldi raises the large-expense alert (§4 item 23)

**Files:**
- Modify: `apps/master/src/main/server/services/stock.service.ts:225-227`
- Test: `apps/master/e2e/11-extras.test.ts:39-45` (`[issue 23]` exists; add one control)

- [ ] **Step 1: Write the failing control**

After `[issue 23]` in `11-extras.test.ts`:

```ts
  it('control: a Keldi without a payment alerts no one', async () => {
    const count = await alertsDuring(() => w.admin.post(`/api/stock/${w.items.osh}/restock`, { qty: 5 }), 'Katta chiqim');
    expect(count).toBe(0);
  });
```

- [ ] **Step 2: Run to verify `[issue 23]` fails and the control passes**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/11-extras.test.ts -t "Large-expense"
```

Expected: `[issue 23]` fails (`0` alerts), both controls pass.

- [ ] **Step 3: Implement**

After `await flushDeferredEmits();` in `restock`:

```ts
      if (paid) {
        // A paid Keldi is cash out of the till like any Chiqim (money rules §4 (23)).
        void alertService.largeExpense({ reason: `Keldi: ${item.name}`, amount: paid.toFixed(0), categoryName: 'Mahsulot xaridi' });
      }
```

Same pattern as `expenseService.create`; the control above proves the timing. If `[issue 23]`
proves flaky, use `deferAfterCommit` inside the transaction and `await flushAfterCommit()` after it
(`order.service.ts` confirm does), and note it.

- [ ] **Step 4: Run to verify, then the gates; commit**

```bash
git add apps/master/src/main/server/services/stock.service.ts apps/master/e2e/11-extras.test.ts
git commit -m "fix(stock): a paid Keldi raises the large-expense alert" -m "Money rules §4 (23)."
```

---

### Task 8: A food dish needs a tan narx (D4, server)

**Files:**
- Create: `apps/master/src/main/server/lib/cost-rule.ts`, `cost-rule.test.ts`
- Modify: `apps/master/src/main/server/services/menu.service.ts:135-155` (`createItem`), `:198-234` (`updateItem`)
- Modify: `apps/master/src/main/server/repositories/menu.repo.ts:90-96` (add two reads after `listCountedFoodItems`)
- Modify: `apps/master/src/main/server/services/stock.service.ts` (`listMissingCost`), `controllers/stock.controller.ts`, `routes/stock.routes.ts:11`
- Modify: `apps/master/src/main/server/services/finance.service.ts:113-288` (`missingCostCount`)
- Modify: `apps/master/e2e/harness.ts:212-223`, `apps/master/e2e/seed-ui-day.ts:39-40`
- Modify: `apps/master/e2e/04-stock-cost.test.ts:42-46`, `:131-136`

**Interfaces:**
- Produces: `missingRequiredCost(p: { kind: 'FOOD' | 'SERVICE'; costPrice: string | null; changed: string[] }): boolean`;
  `menuRepo.listFoodMissingCost(tx?)`, `menuRepo.countFoodMissingCost(tx?)`;
  `GET /api/stock/missing-cost`; `FinanceDaily.missingCostCount: number`.

- [ ] **Step 1: Write the failing tests**

`cost-rule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { missingRequiredCost } from './cost-rule';

describe('missingRequiredCost (D4)', () => {
  it('a food dish saved without a tan narx is refused', () => {
    expect(missingRequiredCost({ kind: 'FOOD', costPrice: null, changed: ['name', 'price', 'costPrice'] })).toBe(true);
  });
  it('an old dish with no tan narx cannot be renamed without one', () => {
    expect(missingRequiredCost({ kind: 'FOOD', costPrice: null, changed: ['name'] })).toBe(true);
  });
  it('an old dish with no tan narx can still be switched off and on', () => {
    expect(missingRequiredCost({ kind: 'FOOD', costPrice: null, changed: ['isActive'] })).toBe(false);
  });
  it('an empty patch changes nothing and is not refused', () => {
    expect(missingRequiredCost({ kind: 'FOOD', costPrice: null, changed: [] })).toBe(false);
  });
  it('a dish with a tan narx is fine', () => {
    expect(missingRequiredCost({ kind: 'FOOD', costPrice: '1000', changed: ['name'] })).toBe(false);
  });
  it('Xizmat haqi never has one', () => {
    expect(missingRequiredCost({ kind: 'SERVICE', costPrice: null, changed: ['name'] })).toBe(false);
  });
});
```

`harness.ts`: create `salat` and `non` with `costPrice: 1`, then, right after the `items` object:

```ts
  // How most dishes came out of the 13.08.2026 migration: no tan narx. The server no longer saves a
  // food dish that way (money rules D4), so the gap is planted directly, as old data.
  const { getPrisma } = await import('../src/main/server/lib/prisma');
  await getPrisma().menuItem.updateMany({ where: { id: { in: [items.salat, items.non] } }, data: { costPrice: null } });
```

`seed-ui-day.ts` (HTTP only, no database handle): give Achichuk `costPrice: 8000` and Non
`costPrice: 1000`, with a comment that the server refuses a food dish without one.

`04-stock-cost.test.ts`: replace `[issue 4] a food dish cannot be saved without a tan narx`
(`:42-46`) with:

```ts
  it('[issue 4] a food dish cannot be saved without a tan narx (decision D4)', async () => {
    const cat = (await w.admin.get('/api/menu/categories'))[0].id;
    const before = await env.prisma.menuItem.count();
    const refused = {
      createUncounted: await w.admin.call('POST', '/api/menu/items', { categoryId: cat, name: 'Lagmon', price: 30000, mode: 'UNCOUNTED' }),
      createCounted: await w.admin.call('POST', '/api/menu/items', { categoryId: cat, name: 'Manti', price: 25000, mode: 'COUNTED', costPrice: null, initialCount: 10 }),
      clearCost: await w.admin.call('PATCH', `/api/menu/items/${w.items.choy}`, { costPrice: null }),
      renameWithoutCost: await w.admin.call('PATCH', `/api/menu/items/${w.items.non}`, { name: 'Non (tandir)' }),
      serviceToFood: await w.admin.call('PATCH', `/api/menu/items/${w.items.xizmat}`, { kind: 'FOOD' }),
    };
    const allowed = {
      switchOff: await w.admin.call('PATCH', `/api/menu/items/${w.items.non}`, { isActive: false }),
      switchOn: await w.admin.call('PATCH', `/api/menu/items/${w.items.non}`, { isActive: true }),
    };
    const choy = await env.prisma.menuItem.findUniqueOrThrow({ where: { id: w.items.choy } });
    const non = await env.prisma.menuItem.findUniqueOrThrow({ where: { id: w.items.non } });
    expect({
      refused: Object.fromEntries(Object.entries(refused).map(([k, r]) => [k, [r.status, r.body?.error?.code]])),
      allowed: Object.fromEntries(Object.entries(allowed).map(([k, r]) => [k, r.status])),
      created: (await env.prisma.menuItem.count()) - before,
      choyCost: n(choy.costPrice),
      non: [non.name, non.isActive],
    }).toEqual({
      refused: {
        createUncounted: [400, 'VALIDATION'],
        createCounted: [400, 'VALIDATION'],
        clearCost: [400, 'VALIDATION'],
        renameWithoutCost: [400, 'VALIDATION'],
        serviceToFood: [400, 'VALIDATION'],
      },
      allowed: { switchOff: 200, switchOn: 200 },
      created: 0,
      choyCost: 1000,
      non: ['Non', true],
    });
  });
```

Replace `[issue 4] selling a dish with no tan narx books its food cost` (`:131-136`) with:

```ts
  it('[issue 4] dishes without a tan narx keep selling, and the finance screen counts them (money-model §6)', async () => {
    const day = env.svc.time.tradingDayOf();
    const { closed } = await sale(w, w.w1, [[w.items.non, 2]], { payments: [{ method: 'CASH', amount: 6000 }] });
    const row = (await env.svc.reports.dailyLedger(day)).lines.mealSales.find((r: any) => r.menuItemId === w.items.non)!;
    const before = { daily: await w.admin.get(`/api/finance/daily?date=${day}`), list: await w.admin.get('/api/stock/missing-cost') };
    const waiter = await w.w1.call('GET', '/api/stock/missing-cost');
    await w.admin.patch(`/api/menu/items/${w.items.salat}`, { costPrice: '8000' });
    const after = { daily: await w.admin.get(`/api/finance/daily?date=${day}`), list: await w.admin.get('/api/stock/missing-cost') };
    expect({
      sold: closed.status,
      nonFoodCost: n(row.cogs),
      count: [before.daily.missingCostCount, after.daily.missingCostCount],
      names: [before.list.map((i: any) => i.name), after.list.map((i: any) => i.name)],
      waiter: waiter.status,
      leaks: JSON.stringify(before.list).includes('costPrice'),
    }).toEqual({
      sold: 'CLOSED',
      nonFoodCost: 0,
      count: [2, 1],
      names: [['Achichuk', 'Non'], ['Non']],
      waiter: 403,
      leaks: false,
    });
  });
```

(`env.svc.time.tradingDayOf` is P2's name; Task 1 maps it.)

- [ ] **Step 2: Run to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/cost-rule.test.ts
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/04-stock-cost.test.ts
```

Expected: the unit file fails to import; both `[issue 4]` tests fail (201s, 404 on the route).

- [ ] **Step 3: Implement**

`cost-rule.ts`: `true` only when `kind === 'FOOD'`, `costPrice` is null, and `changed` holds
anything other than `isActive`. The positive check stays where it is (`menu.service.ts:146-148`,
`:220`).

`menu.service.createItem`: after computing `costPrice` (`:143-145`),
`if (missingRequiredCost({ kind, costPrice: costPrice?.toString() ?? null, changed: ['create'] })) throw Errors.Validation('Taomning tan narxini kiriting');`.

`menu.service.updateItem`: after the patch is built (`:234`), compute the result
`kind = data.kind ?? existing.kind`, `cost = 'costPrice' in patch ? patch.costPrice : existing.costPrice`
(a SERVICE→FOOD change counts; for a SERVICE result the rule answers false), `changed` = the keys of
`data` whose value is not `undefined`, and throw the same `Errors.Validation` when the rule says so.
Note that `isService` (`:215`) ignores a `costPrice` on a SERVICE item; when `data.kind === 'FOOD'`
on a SERVICE item, the sent `costPrice` must apply, so compute `isService` from the resulting kind.

`menuRepo`:

```ts
  async listFoodMissingCost(tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.findMany({
      where: { kind: MenuItemKind.FOOD, isActive: true, costPrice: null },
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  },
  async countFoodMissingCost(tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.count({ where: { kind: MenuItemKind.FOOD, isActive: true, costPrice: null } });
  },
```

`stockService.listMissingCost()` maps to `{ id, name, categoryName, counted, stockCount }` only.
`stockController.missingCost` like `list`; route `stockRouter.get('/missing-cost', …)` above
`/:menuItemId/entries` (the router already requires ADMIN or OWNER, `stock.routes.ts:8-9`).
`financeService.dailyForAdmin` adds `missingCostCount: await menuRepo.countFoodMissingCost()` to
its result (the current count, not as of the chosen day: it is a to-do, not a figure).

- [ ] **Step 4: Run to verify they pass, then the gates**

Step 2's commands: `6 passed`; the whole `04` file passes except tests owned by later packages.
Then the gates; `07-day`'s cogs (Non and Achichuk still without a tan narx) must be unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server apps/master/e2e/harness.ts apps/master/e2e/seed-ui-day.ts apps/master/e2e/04-stock-cost.test.ts
git commit -m "feat(menu): a food dish cannot be saved without a tan narx" -m "Dishes that have none keep selling and are listed by GET /api/stock/missing-cost; Kunlik moliya counts them. Money rules D4, money-model §6."
```

---

### Task 9: Every Mahsulot xaridi on Kunlik moliya

**Files:**
- Modify: `apps/master/src/main/server/services/finance.service.ts:48-76, :254-266`
- Test: `apps/master/e2e/05-expenses.test.ts` (Day 1, after `[D15]`)

The purchases block lists StockEntry rows only (`finance.service.ts:254-262`), so a Mahsulot xaridi
typed in the form (Task 4) is inside Chiqim but listed nowhere on the screen. If Task 1 found that
P3's `/api/finance/daily` already lists every Chiqim entry with its category, write only the test
against P3's field and note the deviation.

- [ ] **Step 1: Write the failing test**

```ts
  it('[D15] Kunlik moliya lists every Mahsulot xaridi of the day, Keldi payments and form entries alike', async () => {
    const daily = await w.admin.get(`/api/finance/daily?date=${D1}`);
    const byReason = Object.fromEntries(daily.foodPurchases.items.map((i: any) => [i.reason, i.amount]));
    expect({ tea: byReason['Choy bargi'], somsa: byReason['Keldi: Somsa'], total: daily.foodPurchases.total })
      .toEqual({ tea: '20000', somsa: '80000', total: '100000' });
  });
```

Place it after the `control: a paid Keldi stays out of profit` test (`:42-51`), so D1 then holds
the 20 000 tea and the 80 000 Keldi and nothing else in that category.

- [ ] **Step 2: Run to verify it fails** (`foodPurchases` undefined).

- [ ] **Step 3: Implement**

From the `expenseSummary` already fetched (`:56`):

```ts
      // Every Mahsulot xaridi of the day: Keldi payments and form entries. The total is the
      // category's cash-basis amount from listByDate (same-day reversals netted), not a new sum.
      foodPurchases: {
        items: expenseSummary.items
          .filter((e) => e.categoryId === INGREDIENT_EXPENSE_CATEGORY_ID)
          .map((e) => ({ id: e.id, occurredAt: e.occurredAt, reason: e.reason, amount: e.amount, status: e.status })),
        total: expenseSummary.byCategory.find((c) => c.categoryId === INGREDIENT_EXPENSE_CATEGORY_ID)?.amount ?? '0',
      },
```

- [ ] **Step 4: Run to verify it passes, then the gates; commit**

```bash
git add apps/master/src/main/server/services/finance.service.ts apps/master/e2e/05-expenses.test.ts
git commit -m "feat(finance): list every Mahsulot xaridi of the day on Kunlik moliya"
```

---

### Task 10: The expense form

**Files:**
- Create: `apps/master/src/renderer/lib/expense-form.ts`, `expense-form.test.ts`
- Modify: `apps/master/src/renderer/api/expenses.ts:27-51` (`ExpenseItem`), `:61-70` (`create`, `reverse`)
- Modify: `apps/master/src/renderer/components/expenses/ExpenseCreateDialog.tsx` (whole form)
- Modify: `apps/master/src/renderer/pages/ExpensesPage.tsx:100, :151-156`
- Modify: `apps/master/gallery/fixtures/expenses.ts:9-34, :74-95`

**Interfaces:**
- Consumes: Task 4's API; P2's renderer `tradingDayKey` (`renderer/lib/trading-day.ts`, not `lib/format.ts`); P3's Naqd/Karta state in the dialog.
- Produces:

```ts
export type ExpenseKind = 'OPERATING' | 'FOOD_PURCHASE';
export type ExpenseDay = { type: 'today' } | { type: 'past'; day: string | null };
export type ExpenseBody = { amount: number; reason: string; note?: string; kind: ExpenseKind; repayable: boolean; occurredAt?: string; correction?: true };
export function buildExpenseBody(f: { amount: string; reason: string; note: string; kind: ExpenseKind; repayable: boolean; day: ExpenseDay; today: string }):
  { ok: true; body: ExpenseBody; correctionDay: string | null } | { ok: false; error: string };
export function latestCorrectableDay(today: string): string; // the day before `today`
```

- [ ] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildExpenseBody, latestCorrectableDay } from './expense-form';

const today = '2026-10-01';
const f = { amount: '30000', reason: 'Gaz', note: '', kind: 'OPERATING' as const, repayable: false, day: { type: 'today' as const }, today };

describe('buildExpenseBody', () => {
  it('today sends no date and no correction: the server stamps the moment', () => {
    expect(buildExpenseBody(f)).toEqual({ ok: true, correctionDay: null, body: { amount: 30000, reason: 'Gaz', kind: 'OPERATING', repayable: false } });
  });
  it('a past day is noon of that day in Tashkent, flagged as a correction', () => {
    expect(buildExpenseBody({ ...f, day: { type: 'past', day: '2026-09-30' } })).toEqual({
      ok: true, correctionDay: '2026-09-30',
      body: { amount: 30000, reason: 'Gaz', kind: 'OPERATING', repayable: false, occurredAt: '2026-09-30T07:00:00.000Z', correction: true },
    });
  });
  it('O\'tgan kun with no day picked is not sent', () => {
    expect(buildExpenseBody({ ...f, day: { type: 'past', day: null } })).toEqual({ ok: false, error: "Qaysi kunni tuzatayotganingizni tanlang" });
  });
  it('today or a later day picked as "past" is refused', () => {
    expect(buildExpenseBody({ ...f, day: { type: 'past', day: today } })).toEqual({ ok: false, error: "O'tgan kunni tanlang: bugun yoki kelgusi kun tuzatish emas" });
  });
  it('Mahsulot xaridi is never repayable', () => {
    const r = buildExpenseBody({ ...f, kind: 'FOOD_PURCHASE', repayable: true });
    expect(r.ok && r.body.repayable).toBe(false);
  });
  it('the amount is whole so\'m above zero', () => {
    expect(buildExpenseBody({ ...f, amount: '' })).toEqual({ ok: false, error: "Summa va sababni to'ldiring" });
    expect(buildExpenseBody({ ...f, amount: '12500.5' })).toEqual({ ok: false, error: "Summa butun so'm bo'lsin" });
    expect(buildExpenseBody({ ...f, amount: '0' })).toEqual({ ok: false, error: "Summa 0 dan katta bo'lsin" });
  });
  it('the reason has at least 3 letters, as the server asks', () => {
    expect(buildExpenseBody({ ...f, reason: ' ab ' })).toEqual({ ok: false, error: 'Sababni kamida 3 harf bilan yozing' });
  });
  it('a note is trimmed and dropped when empty', () => {
    const r = buildExpenseBody({ ...f, note: '  Bozor  ' });
    expect(r.ok && r.body.note).toBe('Bozor');
  });
});

describe('latestCorrectableDay', () => {
  it('is the day before today, across a month end', () => {
    expect(latestCorrectableDay('2026-10-01')).toBe('2026-09-30');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/renderer/lib/expense-form.test.ts
```

- [ ] **Step 3: Implement the helper**

Noon: `new Date(`${day}T12:00:00+05:00`).toISOString()`. Noon sits inside the trading day under
the 05:00 boundary. `latestCorrectableDay` subtracts one day from the key at UTC noon
(`new Date(`${today}T12:00:00Z`)`), so no host time zone moves it.

- [ ] **Step 4: API types**

`ExpenseItem` gains `tradingDay: string; isCorrection: boolean; isFoodPurchase: boolean;`.
`expensesApi.create` takes `ExpenseBody` (plus P3's `paymentMethod`); `reverse(id, note, correction?: boolean)`
sends `{ note, correction }`.

- [ ] **Step 5: The dialog**

`ExpenseCreateDialog` loses its `date` prop (`:22, :27`) and `ExpensesPage` stops passing it
(`:154`); the page button reads `Yangi chiqim` (`:100`). State: `kind` (`'OPERATING'`), `day`
(`{ type: 'today' }`), reset on open with the rest (`:37-45`). Layout, top to bottom: Summa, Sabab,
Izoh (as today), `Turi` row, its hint (`bg-field px-pad py-2 text-[13px] text-muted-foreground`),
P3's To'lov row, `Qaysi kun` row, then when `O'tgan kun` is picked the date `Input`
(`type="date"`, `max={latestCorrectableDay(tradingDayKey())}`, `aria-label="Tuzatiladigan kun"`)
and the owed Field, then Qaytariladi (only when `kind === 'OPERATING'`). Rows of two are
`<Seam direction="row" columns="1fr 1fr">` of `Button`s, `variant={active ? 'default' : 'secondary'}`,
as `NewItemPanel.tsx:89-95`. Strings exactly as the Design table. The day in the owed Field and the
submit label come from `correctionDay` of a dry `buildExpenseBody` run, or from the picked day.

`DialogContent` gets `flex max-h-[calc(100dvh-2rem)] flex-col`; the fields sit in
`div.min-h-0.flex-1.overflow-y-auto`; the error Alert and `DialogFooter` stay outside that div.

Submit: `buildExpenseBody`; on `ok: false` show its error; else mutate with `body`. `onSuccess`
invalidates `['expenses']` and `['finance']`, and calls `onCreated(correctionDay)`; the page's
toast is `Chiqim saqlandi` or `Tuzatish saqlandi, egasiga xabar yuborildi`. Server errors show
their Uzbek message as today (`:61`).

- [ ] **Step 6: Gallery**

`fixtures/expenses.ts`: derive the three new fields for every seeded item
(`items = raw.map(withDerived)` with `tradingDay: i.occurredAt.slice(0, 10)`, `isCorrection: false`,
`isFoodPurchase: i.categoryId === CATEGORY.ingredients.id`); the POST mock maps
`kind: 'FOOD_PURCHASE'` to the ingredients category, uses `occurredAt ?? now`, and sets
`isCorrection: body.correction === true`. Add one correction row (`x-113`, Operatsion, 60 000,
`Gaz (kecha)`, `isCorrection: true`, `createdAt` today, `occurredAt` yesterday noon).

- [ ] **Step 7: Verify**

Unit test: `10 passed`. Gates: `typecheck:renderer` and `typecheck:gallery` 0. If a browser is
available in this session, open the gallery's Chiqimlar at 1236 × 623 with O'tgan kun and
Mahsulot xaridi picked and confirm `Tuzatishni saqlash` is visible without scrolling the page;
otherwise list it under "Checks owed" in the docs task.

- [ ] **Step 8: Commit**

```bash
git add apps/master/src/renderer apps/master/gallery/fixtures/expenses.ts
git commit -m "feat(expenses): the form files Mahsulot xaridi and corrects a past day on purpose" -m "It defaults to today; the page's date filter no longer decides the day (issue 5). Money rules D13, D15."
```

---

### Task 11: Undo as a correction, and corrections marked in the list

**Files:**
- Modify: `apps/master/src/renderer/lib/expense-form.ts` (+ `.test.ts`): `undoChoice`
- Modify: `apps/master/src/renderer/components/expenses/ExpensePanel.tsx:10-18, :67-68, :110-121, :186-190`
- Modify: `apps/master/src/renderer/components/expenses/ExpenseReverseDialog.tsx:19, :39-43, :77-82, :107-109`
- Modify: `apps/master/src/renderer/components/expenses/ExpenseList.tsx:96-98`
- Modify: `apps/master/src/renderer/pages/ExpensesPage.tsx:158-162`
- Modify: `apps/master/gallery/fixtures/expenses.ts` (reverse mock), `gallery/fixtures/audit.ts` (one `DAY_CORRECTED` row)

**Interfaces:** `undoChoice(item: Pick<ExpenseItem, 'status' | 'repayable' | 'tradingDay'>, today: string): { allowed: false } | { allowed: true; correctionDay: string | null }`.

- [ ] **Step 1: Write the failing tests** (append to `expense-form.test.ts`)

```ts
describe('undoChoice', () => {
  const item = { status: 'ACTIVE' as const, repayable: false, tradingDay: '2026-10-01' };
  it('today\'s entry is undone plainly', () => {
    expect(undoChoice(item, '2026-10-01')).toEqual({ allowed: true, correctionDay: null });
  });
  it('a past day\'s entry is undone as a correction of that day', () => {
    expect(undoChoice({ ...item, tradingDay: '2026-09-28' }, '2026-10-01')).toEqual({ allowed: true, correctionDay: '2026-09-28' });
  });
  it('an avans is not undone here', () => {
    expect(undoChoice({ ...item, repayable: true }, '2026-10-01')).toEqual({ allowed: false });
  });
  it('an entry already undone, or a reversal row, is not undone again', () => {
    expect(undoChoice({ ...item, status: 'REVERSED' }, '2026-10-01')).toEqual({ allowed: false });
    expect(undoChoice({ ...item, status: 'REVERSAL' }, '2026-10-01')).toEqual({ allowed: false });
  });
});
```

- [ ] **Step 2: Run to verify they fail; implement `undoChoice`.**

- [ ] **Step 3: The panel and the dialog**

`ExpensePanel`: replace the same-day check (`isToday` at `:10-18`, or P2's `isSameTradingDay(item.occurredAt)` that replaced it) with `const undo = undoChoice(item, tradingDayKey())`, `tradingDayKey` from `renderer/lib/trading-day.ts`;
the foot shows `Bekor qilish` whenever `undo.allowed` (`:110-121`) and passes
`{ id, reason, amount: item.signedAmount, correctionDay: undo.correctionDay }`; delete the
same-day note (`:186-190`). For `item.isCorrection`, add a `bg-field px-pad py-2 text-[13px]`
line under the money row: `Tuzatish: {formatDate(item.createdAt)} da kiritilgan`.

`ReversalTarget` gains `correctionDay: string | null`. `ExpenseReverseDialog`: drop the
same-day Alert (`:77-82`); when `correctionDay` is set, show
`<Field tone="owed">Bu {formatDate(correctionDay)} kunini tuzatadi: o'sha kunning foydasi qayta hisoblanadi va egasiga xabar boradi.</Field>`
and label the button `Tuzatib bekor qilish`; the mutation calls
`expensesApi.reverse(id, note, correctionDay !== null)` and invalidates `['expenses']` and
`['finance']`. `onSuccess(correctionDay)`; the page's toast is `Chiqim bekor qilindi` or
`Tuzatish saqlandi, egasiga xabar yuborildi`.

`ExpenseList` (`:96-98`): for `item.isCorrection` the sub-line is
`Tuzatish · {formatDate(item.createdAt)} da kiritildi · {item.categoryName}`.

- [ ] **Step 4: Gallery**

The reverse mock accepts `correction`; `fixtures/audit.ts` gains one `DAY_CORRECTED` row with the
metadata shape of Task 3 (`tradingDay`, `what`, `before.profit`, `after.profit`).

- [ ] **Step 5: Verify** (unit `+4`, renderer and gallery typechecks 0, the rest of the gates).

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/renderer apps/master/gallery/fixtures
git commit -m "feat(expenses): undo a past day's entry as a correction, and mark corrections" -m "Money rules D13, D23."
```

---

### Task 12: Tan narx required in Menyu, Tan narxsiz in Ombor

**Files:**
- Create: `apps/master/src/renderer/lib/menu-form.ts`, `menu-form.test.ts`
- Modify: `apps/master/src/renderer/components/menu/NewItemPanel.tsx:43-64, :123`
- Modify: `apps/master/src/renderer/components/menu/ItemPanel.tsx:60-81, :95-104, :140-151`
- Modify: `apps/master/src/renderer/api/stock.ts:16-29, :31-36`
- Create: `apps/master/src/renderer/components/stock/MissingCostList.tsx`, `MissingCostPanel.tsx`
- Modify: `apps/master/src/renderer/pages/OmborPage.tsx:12-14, :27-37, :73-124`
- Modify: `apps/master/src/renderer/components/stock/StockList.tsx:54-56`, `StockPanel.tsx:186-193`
- Modify: `apps/master/gallery/fixtures/stock.ts:62-64` (+ `GET /api/stock/missing-cost`, `undone`)

**Interfaces:** `costPriceError(kind: 'FOOD' | 'SERVICE', raw: string): string | null`;
`stockApi.missingCost(): Promise<MissingCostItem[]>` with
`MissingCostItem = { id: string; name: string; categoryName: string; counted: boolean; stockCount: number | null }`;
`StockEntry.undone: boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { costPriceError } from './menu-form';

describe('costPriceError', () => {
  it('a food dish needs one', () => {
    expect(costPriceError('FOOD', '  ')).toBe('Tan narxini kiriting');
  });
  it('above zero', () => {
    expect(costPriceError('FOOD', '0')).toBe("Tan narx 0 dan katta bo'lsin");
  });
  it('a number', () => {
    expect(costPriceError('FOOD', '12 ming')).toBe("Tan narx noto'g'ri");
  });
  it('a fraction left by a Keldi is fine (PRD 14 G3)', () => {
    expect(costPriceError('FOOD', '3333.3333333333')).toBeNull();
  });
  it('Xizmat haqi never has one', () => {
    expect(costPriceError('SERVICE', '')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail; implement.**

- [ ] **Step 3: Menyu**

`NewItemPanel`: label `Tan narx`; in `submit` (`:58`), for COUNTED and UNCOUNTED,
`const costError = costPriceError('FOOD', costPrice); if (costError) return setFormError(costError);`
and send `costPrice: Number(costPrice)`.

`ItemPanel`: `const costError = isService ? null : costPriceError('FOOD', String(costPrice))`;
`Saqlash` is disabled while `costError` (`:102`); when `!isService && item.costPrice === null`
show `<div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">Tan narx kiritilmagan: saqlash uchun kiriting</div>`
in the foot, otherwise show `costError` there once the field was touched. `Faolsizlantirish` keeps
working (it sends only `isActive`).

- [ ] **Step 4: Ombor**

`OmborPage`: `type Filter = 'uncounted' | 'all' | 'nocost'`; the initial filter is `'nocost'` when
`useSearchParams().get('filter') === 'tannarx'`. A second query
`useQuery({ queryKey: ['stock', 'missing-cost'], queryFn: stockApi.missingCost })`. A third status
button `Tan narxsiz {n}`, rendered only while `n > 0`. With `nocost`, the list is
`<MissingCostList>` and the panel `<MissingCostPanel>`.

`MissingCostList`: `Seam` + `RowHeader` (`Taom`, `Holat`) + one `Row` per dish (columns
`1fr 150px`): name with `RowSub` `{categoryName} · {counted ? 'Sanaladigan' : 'Sanoqsiz'}`, and
`<Chip tone="owed">Tan narxsiz</Chip>`.

`MissingCostPanel`: `Panel` with head (name, category); body one `Field` with
`FieldLabel` `Tan narx (1 porsiya)`, a numeric `Input`, and the hint line from the Design table;
foot one `Button size="action" className="w-full"`: `SAQLA VA KEYINGISI` when another dish
remains, else `SAQLASH`; the error line above it in owed tone. Save:
`menuApi.updateItem(id, { costPrice: String(Number(value)) })` → invalidate `['stock']`,
`['menu']`, `['finance']`; toast `Tan narx saqlandi`; select the next dish in the list (as
`OmborPage.tsx:53-58` does for Sanoq).

`StockList` (`:54-56`): `item.costPrice ? formatMoney(item.costPrice) : <Chip tone="owed">Tan narxsiz</Chip>`.
`StockPanel` (`:191`): `entry.kind === 'RESTOCK' ? (entry.undone ? 'Keldi (bekor qilingan)' : 'Keldi') : 'Sanoq'`.

- [ ] **Step 5: Gallery** (`missing-cost` route returning two dishes; `undone: false` on entries,
one `true`).

- [ ] **Step 6: Verify** (unit `+5`, renderer and gallery typechecks 0, the gates).

- [ ] **Step 7: Commit**

```bash
git add apps/master/src/renderer apps/master/gallery/fixtures/stock.ts
git commit -m "feat(menu): tan narx is required in Menyu; Ombor lists dishes without one" -m "Money rules D4, money-model §6."
```

---

### Task 13: Kunlik moliya: the count and the Mahsulot xaridi block

**Files:**
- Modify: `apps/master/src/renderer/api/finance.ts:6+` (`FinanceDaily`)
- Modify: `apps/master/src/renderer/components/finance/FinanceWorkArea.tsx` (top of the returned `Seam`; the purchases block)
- Modify: `apps/master/gallery/fixtures/finance.ts` (`buildFinanceDaily`)

P3 rewrote this file for D17/D18; place both changes into P3's layout, keeping its vocabulary.

- [ ] **Step 1: Types**

`FinanceDaily` gains `missingCostCount: number` and
`foodPurchases: { items: Array<{ id: string; occurredAt: string; reason: string; amount: string; status: 'ACTIVE' | 'REVERSED' | 'REVERSAL' }>; total: string }`.

- [ ] **Step 2: The count**

First child of the work area, when `data.missingCostCount > 0`:

```tsx
<Field tone="owed" className="flex items-center justify-between gap-4">
  <span className="text-[15px] font-semibold">
    {data.missingCostCount} ta taomning tan narxi kiritilmagan: ularning foydasi to&apos;liq narxda ko&apos;rinadi
  </span>
  <Button variant="secondary" onClick={() => navigate('/ombor?filter=tannarx')}>Omborda kiritish</Button>
</Field>
```

(`useNavigate` from `react-router-dom`, as `TablesPage.tsx:26`.)

- [ ] **Step 3: The Mahsulot xaridi block**

The purchases section (`Xaridlar`) renders from `data.foodPurchases`: header `Mahsulot xaridi`,
columns `120px 1fr 130px` (`Vaqti`, `Nima`, `Summa`), a REVERSED row struck through, a REVERSAL
row in `text-owed` with a minus; total row `Jami mahsulot xaridi` = `formatMoney(data.foodPurchases.total)`.
Shown when `items.length > 0`.

- [ ] **Step 4: Gallery** — `buildFinanceDaily` returns `missingCostCount: 3` and a `foodPurchases`
built from the expenses fixture's Mahsulot xaridi rows.

- [ ] **Step 5: Verify** (renderer and gallery typechecks 0, the gates).

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/renderer apps/master/gallery/fixtures/finance.ts
git commit -m "feat(finance): Kunlik moliya counts dishes without a tan narx and lists every Mahsulot xaridi"
```

---

### Task 14: Documents

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md`
- Modify: `docs/superpowers/specs/2026-09-30-money-rules-design.md` §5
- Modify: this plan ("Deviations during execution", "Checks owed")

- [ ] **Step 1: `CURRENT_WORKFLOW.md`**, each line re-checked against the code:
  - §4 "`stockCount` / `costPrice` — independent" (`:190-199`): `costPrice NULL` is refused on
    create and edit for FOOD (D4); legacy NULL rows still sell at 0 COGS and are listed by
    `GET /api/stock/missing-cost`.
  - §4 "The two admin verbs" (`:224-229`): restock records `costPriceBefore`/`costPriceSet` and
    raises `largeExpense`.
  - §4 "Corrections" (`:242-245`): undoing a Keldi payment takes back its portions (not after a
    Sanoq, never below 0) and the tan narx it set (if unchanged); it is no longer same-day only.
  - §4 "Ombor" (`:254-258`): the `Tan narxsiz` filter and panel.
  - §5 (`:294-296` and new paragraph): Mahsulot xaridi from the form (`kind`), past-day entries
    only as corrections through `dayCorrectionService` (audit `DAY_CORRECTED`, owner message),
    undo stamped on the original's moment and claimed conditionally, `isClosedDay` = any trading
    day before today's.
  - §6 (`:312-333`): `GET /api/stock/missing-cost`; new body fields; error codes
    `PAST_DAY_NEEDS_CORRECTION`, `FUTURE_DAY` (and `EXPENSE_REVERSAL_SAME_DAY_ONLY` gone); update
    the endpoint and error counts.
  - §9 Telegram (`:449-453`): six push messages, adding the day correction; Keldi in large expense.
  - §12 (`:625-626`): Mahsulot xaridi is now also chosen by hand on the form.
- [ ] **Step 2: money-rules §5**: mark the `04-stock-cost` and `05-expenses` lines built, naming
  the tests as they now read (`[issue 4] dishes without a tan narx keep selling, and the finance
  screen counts them`; `[issue 5] a past day is booked only as an explicit correction`, `[D13] the
  past-day entry is undone the same way`, and the "Corrections to a whole day" describe).
- [ ] **Step 3: This plan**: "Deviations during execution" (Task 1's name mapping first), the final
  numbers (e2e, `pnpm test`, the three typechecks), and "Checks owed": the dialog at 1236 × 623 if
  Task 10 could not check it; the packaged build never opened.
- [ ] **Step 4: Gates and P2's retired-helper grep, then commit**

Run the gates, then P2's retired-helper grep (P2 Task 7 Step 3) over `src`, `e2e` and `scripts`;
`e2e` and `scripts` are outside every tsconfig, so a stale name there fails only at run time:

```bash
docker exec -w /app/apps/master CONTAINER grep -rnE 'localDayKey|parseLocalDay|localDayRange|localMonthRangeFor|isSameLocalDay|localToday|localClockMinutes' src e2e scripts
```

Expected: the grep prints nothing; the gates at their final numbers.

```bash
git add docs/CURRENT_WORKFLOW.md docs/superpowers/specs/2026-09-30-money-rules-design.md docs/superpowers/plans/2026-10-02-money-expenses.md
git commit -m "docs: expenses, corrections and tan narx as built (money rules P4)"
```

---

## Deviations during execution

(Filled in while building. Task 1's interface mapping goes first.)

## Checks owed

(Filled in by Task 14.)
