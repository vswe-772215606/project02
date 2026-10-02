# Money ledger (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** planned 2026-10-02, not started. Package P3 of the money rules, wave 2: it is built after
> wave 1 (P1 guards-2, P2 trading-day, P7 discount-qaytim) has merged into the branch. Line numbers
> below were read at `cafd82e`; wave 1 moves some of them. Find each place by the code quoted, not by
> the number.

**Goal:** One vocabulary for money, worked out once on the server and shown everywhere: Kassa is the
cash in the drawer, Karta is its own line, nasiya is neither; an expense records Naqd or Karta; ADMIN
sees Foyda and opens Hisobot; waiters never receive food cost; the printed bill adds up and says how
it was paid.

**Architecture:** A pure function `dayMoney(parts)` turns the ledger's existing raw sums into the seven
words of money rules §3.9. `dailyLedger`, `monthly` and `summary` call it and expose the result as
`money`; every screen, Telegram command, the PDF and Excel read `money` instead of doing arithmetic of
their own. The ledger core (its queries, the billing math, `cashOut` not `expenseNet`) is untouched:
the only new input is the Naqd/Karta split of `cashOut`, which comes from a new `Expense.paymentMethod`
column. The bill moves its layout decisions into TypeScript (`buildBillArgs`, unit-tested); `receipt.exe`
only prints the rows it is given, with one rule of its own: a dish prints on one line when it fits 48
columns, on two when it does not.

**Tech Stack:** Node + Express + Prisma 6.17 on SQLite, zod 4, vitest 2 (unit: `pnpm test`; e2e:
`vitest.e2e.config.ts`), exceljs, pdfkit, React 19 + TanStack Query + Blocks C1 in the renderer,
MinGW for `receipt.exe`, Docker for every run.

**Spec:** `docs/superpowers/specs/2026-09-30-money-rules-design.md` — D9, D10, D17, D18, D19, D22, §3.1,
§3.9, §3.10, §3.11, §4 (33), §5. Builds on `docs/superpowers/specs/2026-08-14-money-model-design.md`
§8 (what stays) and PRD 14 (`docs/prd/14-server-money-guards.md`, slice 1, built).

---

## Design

### Goal

Today the same day reads as different numbers on different surfaces (Money Map issues 2, 9–13): "Kassa
o'zgarishi" includes card money, "Chiqim" names three figures, "Sotuv" sometimes includes Xizmat haqi,
the owner's /xarajatlar counts deliveries as profit-side cost, and the bill prints items that do not
add up to its total. Barkamol's governing constraint: an admin who sees the system's cash differ from
the drawer concludes the system is broken. After this package every cash figure called Kassa is the
drawer, and every word means one thing everywhere.

### Decisions covered

| # | Decision | What this package builds |
|---|---|---|
| D9 | Kassa is cash only; card is its own line; nasiya is neither | `money.kassa = kirim.naqd − chiqim.naqd` on every surface; Karta shown as its own Kirim/Chiqim line |
| D10 | Expense is Naqd (default) or Karta | `Expense.paymentMethod`; the form's Naqd/Karta choice; Chiqim split Naqd/Karta; Kassa uses Naqd |
| D17 | One vocabulary (§3.9) | `ledger.money` = Sotuv, Xizmat haqi, Tan narx, Kirim, Chiqim, Xarajat, Kassa, Foyda; read by every surface |
| D18 | ADMIN may see profit, tan narx totals, per-dish margins; waiters see none | Kunlik moliya shows Foyda and per-dish Foyda; order DTOs carry no food cost (issue 32) |
| D22 | ADMIN opens the whole Hisobot | `/api/reports/*` is ADMIN+OWNER; the rail shows Hisobot to ADMIN |
| D19 | The printed bill | Food lines, Ovqat jami, Chegirma, Xizmat haqi (N kishi), UMUMIY, one line per payment leg; ASCII |
| §4 (33) | Money groups with spaces | Telegram, PDF, Excel and the order app group explicitly, never through `Intl` `uz-UZ` |

Money Map issue 10 (Kunlik moliya's dish table counts Xizmat haqi as dish sales) is taken here as part
of D17 ("Sotuv never includes Xizmat haqi"); no other package claims it.

### The words (money rules §3.9), as the server computes them

```
Sotuv       = netSales                     = food − Chegirma          (never Xizmat haqi)
Xizmat haqi = serviceCharge                                           (its own line)
Tan narx    = cogs
Kirim       naqd  = orderCash + debtRepaidCash + expenseReturns
            karta = orderCard + debtRepaidCard
            jami  = naqd + karta           = realCashIn               (ledger core, unchanged)
Chiqim      naqd  = Σ cashOut rows paid CASH
            karta = Σ cashOut rows paid CARD
            jami  = naqd + karta           = cashOut                  (ledger core, unchanged)
Xarajat     = operatingExpense                                        (ledger core, unchanged)
Kassa       = kirim.naqd − chiqim.naqd                                (NEW: the drawer, cash only)
Foyda       = Sotuv − Tan narx − Xarajat   = profit                   (ledger core, unchanged)
```

Nasiya (`debtSales`) is in none of them: it becomes Kirim on the day it is repaid. An avans return is
Kirim naqd (it has no method; the cash comes back to the drawer). `ledger.cashflow.drawerMovement`
(`realCashIn − cashOut`, card included) stays in the DTO for the smokes and the forensics diagnostic,
but no surface shows it after this package.

On the tested day of `07-day.test.ts` (money rules §3.9): Sotuv 165 000, Xizmat haqi 25 000, Tan narx
73 000, Kirim 180 000 (naqd 130 000, karta 50 000), Chiqim 170 000 (naqd 170 000, karta 0), Xarajat
40 000, Kassa −40 000, Foyda 52 000.

### What the operator sees

Exact Uzbek strings. Money is grouped with spaces by `formatMoney` (screen, NBSP) or `formatUZS`
(Telegram, PDF, printer, ASCII space); a negative shows `-40 000` with an ASCII minus.

**Bugun** (`MoneyPanel`, head "Bugungi pul"), five `MoneyField`s:

| Label | Value | Note |
|---|---|---|
| `Sotuv` | `money.sotuv` | `Xizmat haqi {x} alohida` |
| `Kassa` | `money.kassa` | `Naqd: kirim − chiqim` |
| `Chiqim` | `money.chiqim.jami` | `Naqd {n} · Karta {k}` |
| `Foyda` | `money.foyda` | `Sotuv − Tan narx − Xarajat` |
| `Nasiya qoldiq` | unchanged | unchanged |

**Kunlik moliya**, the pinned panel (`FinanceDrawerPanel`): head `Kassa` / `Bugungi naqd pul`; rows
`Naqd sotuv`, `Nasiya to'lovi (naqd)`, `Qaytgan avans` (only when > 0), `Kirim (naqd)` (bold, `+`),
`Chiqim (naqd)` (`-`, sub-line `Mahsulot xaridi {p} · boshqa {o}`); then a raised row
`Karta — kassaga kirmaydi` with rows `Karta kirim` and `Karta chiqim`; foot `KASSA` and the signed
`money.kassa`. The work area leads with four `MoneyField`s in two rows (`columns="1fr 1fr"`):
`Sotuv` (`{n} ta porsiya`), `Tan narx` (`Sotilgan ovqat tan narxi`), `Xarajat`
(`Mahsulot xaridi va ochiq avanssiz`), `Foyda` (`Sotuv − Tan narx − Xarajat`). The dish table's
columns are `Ovqat / Kategoriya`, `Soni`, `Ovqat jami`, `Tan narx`, `Foyda`, food rows only, with a
separate row under its `Jami`: `Xizmat haqi (ofitsiantlarniki)` · `{q} kishi` · amount. Section titles:
`Mahsulot xaridi` (was `Xaridlar`), `Xarajat` (was `Chiqimlar (xaridlarsiz)`), total row
`Xarajat ({n} ta)`; a Karta expense carries a `Karta` chip.

**Chiqimlar** (the expense page): title and tab title `Chiqimlar`; button `Yangi chiqim`; tiles
`Chiqim` (day: server `totals.cashOut`, note `Naqd {n} · Karta {k}`; search: the visible rows' sum,
note `Qidiruv natijasi`), `Qaytishi kutilayotgan avans`, `Bekor qilingan`. A Karta row carries a
`Karta` chip; the detail panel shows `To'lov` · `Naqd`/`Karta`. The create dialog is titled
`Yangi chiqim`, and between the amount and the reason it has a `To'lov` choice of two 48 px buttons,
`Naqd` (preset) and `Karta`, with the line `Karta bilan to'langan chiqim kassadan chiqmaydi, lekin
foydani kamaytiradi.`

**Hisobot** (now ADMIN and OWNER): headline tiles `Sotuv`, `Tan narx`, `Xarajat`, `Foyda` (note
`Sotuv − Tan narx − Xarajat`); results `Foyda` and `Kassa`; `Kirim va chiqim` with columns `Kirim`
(`Naqd sotuv`, `Karta sotuv`, `Nasiya to'lovi (naqd)`, `Nasiya to'lovi (karta)`, `Qaytgan avans`,
`Kirim`) and `Chiqim` (`Naqd`, `Karta`, `Chiqim`), then strips `Kassa` and `Karta: kirim {k} · chiqim
{c}`. Words retired from every surface: `Sof foyda`, `Sof sotuv`, `Sof savdo`, `Savdo`, `Yalpi sotuv`
(now `Ovqat jami`), `Operatsion`, `Jami kelgan`, `Jami ketgan`, `Kelgan`, `Ketgan`, `Kassa
o'zgarishi`, `Qarz qaytimi` (now `Nasiya to'lovi`), `Qarzga sotildi` (now `Nasiyaga sotildi`),
`Avans qaytimi` / `Kutilayotgan qaytim` (now `Qaytgan avans` / `Qaytishi kutilayotgan avans`, because
D20 gives `Qaytim` to the change for cash). The avans-return flow on Chiqimlar loses `Qaytim` too: the
panel's action button reads `Avans qaytdi`, its history head `Qaytgan avanslar`, the dialog's title
`Qaytgan avans` and its field `Qaytgan summa (UZS)`, and the toast `Qaytgan avans yozildi`. The forbidden message reads `Bu sahifa faqat ega va
administrator uchun.`

**Telegram** — exact layouts in Task 9. `/bugun` and the nightly report: blocks `Sotuv`, `Kirim`,
`Chiqim`, `Natija` (Tan narx, Xarajat, Foyda, Kassa, Qarz qoldig'i).

**The bill** (D19), 48 columns, ASCII:

```
Osh  2 x 45 000                           90 000
------------------------------------------------
Ovqat jami                                90 000
Chegirma                                 -10 000
Xizmat haqi (3 kishi)                     15 000
UMUMIY                                    95 000      (bold)
To'lov: Naqd                              95 000
```

A dish prints on one line, `{name}  {qty} x {unit}` left and its amount right, as in §3.11, whenever
that fits 48 columns; a name too long for that prints on its own line with `  {qty} x {unit} … {amount}`
under it, so nothing is cut. A nasiya leg prints `Nasiya: Karim aka 45 000`; several legs print one
line each; `Chegirma` and `Xizmat haqi` print only when non-zero; a leg of 0 prints nothing. Xizmat
haqi lines are not item rows any more: they fold into the one `Xizmat haqi (N kishi)` row, N being
their total quantity.

### Server, schema and API changes

- **Schema:** `enum ExpensePaymentMethod { CASH CARD }`; `Expense.paymentMethod ExpensePaymentMethod
  @default(CASH)`. One migration, `ALTER TABLE ... ADD COLUMN` only (no table rebuild, so the six
  `Expense` indexes stay).
- **`POST /api/expenses`** accepts `paymentMethod: 'CASH' | 'CARD'` (optional, default `CASH`; `DEBT`
  answers 400 `VALIDATION`). Every expense DTO carries `paymentMethod`. A same-day undo (`REVERSAL`
  row) copies its original's method. `GET /api/expenses?date=` totals gain `cashOutNaqd` and
  `cashOutKarta` (they add up to `cashOut`).
- **`dailyLedger`** gains `money: DayMoney`; `GET /api/reports/daily` and `GET /api/finance/daily`
  carry it inside `ledger`. `GET /api/finance/daily` also gains top-level `money`, `serviceLine:
  { qty, amount }`, and `operatingExpenses[].paymentMethod`; its `drawer.movement` becomes Kassa
  (cash only), `cashflow.totalIn` and `outflow.totalOut` become `money.kirim.jami` and
  `money.chiqim.jami` (the same values as before, now read rather than recomputed); `mealSales`,
  `mealSalesByCategory` and `mealSalesTotal` hold food only.
- **`GET /api/reports/monthly`**: each `daily[]` row and `totals` gain `money`.
  **`GET /api/reports/summary`** gains `money`.
- **`/api/reports/*`** is `requireRole(['ADMIN', 'OWNER'])`.
- **Order DTOs** (`mapToDto`, every order route): lines carry no `cogsSnapshot`,
  `consumptionSnapshot` or `menuItem` (they keep `price` and `menuItemKind`).
- **`receipt.exe`** takes `<printer> <heading> <orderInfo> <items> <totals>`; `<totals>` is
  `;`-separated `label|amount|style` rows (`B` = bold).

### What deliberately stays

- The ledger core: `dailyLedger`'s 11 queries, `cashOut` (gross − same-day reversals, never
  `expenseNet`), `operatingExpense` (ingredient category excluded), `profit`, `realCashIn`,
  `drawerMovement`, the billing math. D9/D17 add a grouping and labels, not a formula.
- `reportsService.daily().results.cashflowBasedNet` and `checks.*` keep their values (smokes read
  them); no screen shows `cashflowBasedNet` afterwards.
- The `<items>` argument keeps its shape (`name|qty|unit|total`), so `parseBill`'s `lines` and every
  test that reads them stay as they are; only the printed layout of a short dish changes (one line).
- Ingredient purchases (Keldi) stay `CASH`; avans returns stay naqd (Open questions, forwarded to
  Barkamol).
- `docs/agent-plans/00-shared/decisions.md` is not edited (it changes only on Barkamol's word);
  CURRENT_WORKFLOW §12 records that its "ADMIN cannot see profit" line is superseded.
- Trading-day grouping is P2's (wave 1: `tradingDayOf`, `tradingDayStart`, `tradingDayRange`,
  `tradingDayAnchor` in `server/lib/time.ts`, as its plan names them): this package adds no day-range
  query; every new figure is read from rows the existing, P2-adjusted queries already return. Where a
  step below needs "today's key" or a day's anchor, use the helper the surrounding code uses after P2.

---

## Global Constraints

- **Where:** the worktree and branch the build stage names (planned: `~/dev/lab/project02-money` on
  `feat/money-rules`, wave 1 merged). Never commit to `main` or `feat/auto-update`; never push, merge,
  tag or deploy. Never read or write `../project02`, `../project02-guards`, `../project02-demo` or
  `../project02-finance-e2e`.
- **Where things run:** only in the container the build stage names, written `CONTAINER` below. Never
  start Electron; never run anything on the host but `git` and file edits.
- **Gates** (floors measured in Task 1; no task may raise a typecheck count):

  ```bash
  docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
  docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'                 # 47
  docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'  # 0
  docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'   # 0
  docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
  ```

  e2e: after each task, only the tests the task names change status (`E2E-DIFF` below). Tests owned by
  later packages keep failing.
- **`E2E-DIFF`** — the status list compared with Task 1's:

  ```bash
  docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER sh -c 'pnpm exec vitest run --config vitest.e2e.config.ts --reporter=verbose 2>&1 | grep -E "^ +(✓|×) " | sed -E "s/ +[0-9]+ ?m?s$//" | sort > e2e/.data/p3-status-now.txt; diff e2e/.data/p3-status-base.txt e2e/.data/p3-status-now.txt'
  ```

  (If the reporter marks differently, adapt the grep once in Task 1 and use the same form after.)
- **Money:** whole so'm. Group with `formatUZS` (`src/main/server/lib/format.ts`, ASCII space) on the
  server and `formatMoney` (`src/renderer/lib/format.ts`, NBSP) in the renderer. Never
  `Intl.NumberFormat('uz-UZ')` or `toLocaleString` for money: that locale groups with commas.
- **Renderer:** compose Blocks C1 (`components/blocks`, `components/layout/Screen` + `Panel`). No new
  borders, radius, shadows or hover-only routes. Touch targets 48/56/66 px; type floors 12/13/17 px;
  everything must fit a 1236 × 623 panel. The rail holds at most 10 slots.
- **Waiters** (`apps/order`, `apps/mobile`, any WAITER session) never receive tan narx or food cost.
- **Code rules** (`docs/agent-plans/00-shared/conventions.md`): TypeScript strict,
  `noUncheckedIndexedAccess`, no `any` outside tests and the existing Telegram formatters; 2-space
  indent, single quotes, semicolons, trailing commas; Prisma only in `repositories/` and the services
  that already query it; throw `Errors.*`; every user-facing string in Uzbek (Latin).
- **Tests first:** each task writes its failing test, runs it to see it fail, then implements.
- **Commits:** authored as Barkamol, conventional, plain. No AI attribution, no `Co-Authored-By`
  line. Never commit `apps/master/e2e/.data/`. Never `--no-verify`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/master/src/main/server/lib/day-money.ts` (+ `.test.ts`) | Create | `dayMoney(parts)`: the seven words, the only place Kassa is worked out |
| `apps/master/prisma/schema.prisma`, `prisma/migrations/<ts>_expense_payment_method/` | Modify, create | `ExpensePaymentMethod`, `Expense.paymentMethod` |
| `apps/master/src/main/server/controllers/expense.controller.ts` | Modify | `paymentMethod` in the create schema |
| `apps/master/src/main/server/services/expense.service.ts` | Modify | Store and return the method; split `cashOut`; a reversal copies the method |
| `apps/master/src/main/server/services/reports.service.ts` | Modify | `money` on `dailyLedger`, `monthly` (rows, totals), `summary` |
| `apps/master/src/main/server/services/finance.service.ts` | Modify | Kunlik moliya DTO: `money`, Kassa as `drawer.movement`, food-only dish table |
| `apps/master/src/main/server/routes/reports.routes.ts` | Modify | ADMIN + OWNER |
| `apps/master/src/main/server/lib/client-order-line.ts` (+ `.test.ts`) | Create | `toClientLine`: an order line without food cost |
| `apps/master/src/main/server/services/order.service.ts` | Modify | `mapToDto` uses `toClientLine` |
| `apps/master/src/main/server/services/telegram-bot.service.ts` | Modify | `formatUZS`; every command in the ledger's words; `buildExpensesMessage`, `formatSummaryMessage` |
| `apps/master/src/main/server/services/finance-report.service.ts` | Modify | Remove the dead comma formatter |
| `apps/master/src/main/server/services/summary-workbook.ts` (+ `.test.ts`) | Create | The Excel summary, space-grouped |
| `apps/master/src/main/pdf-blocks.ts` (+ `.test.ts`) | Create | The PDF's money blocks from `ledger.money` |
| `apps/master/src/main/pdf-report.ts` | Modify | Uses `pdf-blocks`, `formatUZS` |
| `apps/master/src/main/server/printer/receipt-builder.ts` (+ `.test.ts`) | Modify, create | `BillInput`, `buildBillArgs`: the D19 rows |
| `apps/master/src/main/server/services/print.service.ts` | Modify | `billInputFromOrder` adapter; new arg contract |
| `apps/master/cpp/receipt.cpp`, `apps/master/resources/bin/receipt.exe` | Modify, rebuild | Print the `<totals>` rows; a `RECEIPT_STDOUT` build for Linux checks |
| `apps/order/src/renderer/lib/format.ts` | Modify | `formatMoney` groups explicitly |
| `apps/master/e2e/harness.ts` | Modify | `parseBill` for the new contract; `moneyWords` |
| `apps/master/e2e/01-bill.test.ts`, `07-day.test.ts`, `08-staff-access.test.ts`, `10-ticket-unit.test.ts` | Modify | Money rules §5 expectations |
| `apps/master/e2e/17-kassa-karta.test.ts` | Create | D9/D10 on a day with Karta |
| `apps/master/src/renderer/api/{reports,finance,expenses}.ts` | Modify | `DayMoney` and the new fields |
| `apps/master/gallery/fixtures/{finance,reports,expenses}.ts` | Modify | Fixtures carry the new fields |
| `apps/master/src/renderer/components/dashboard/MoneyPanel.tsx`, `pages/DashboardPage.tsx` | Modify | Bugun |
| `apps/master/src/renderer/components/finance/FinanceDrawerPanel.tsx`, `FinanceWorkArea.tsx`, `pages/FinancePage.tsx` | Modify | Kunlik moliya |
| `apps/master/src/renderer/pages/ExpensesPage.tsx`, `components/expenses/{ExpenseCreateDialog,ExpenseList,ExpensePanel,ExpenseReturnDialog}.tsx` | Modify | Chiqimlar, Naqd/Karta; `Qaytim` → `Qaytgan avans` / `Avans qaytdi` for avans returns |
| `apps/master/src/renderer/components/reports/*.tsx`, `pages/ReportsPage.tsx` | Modify | Hisobot |
| `apps/master/src/renderer/lib/navigation.ts` (+ `.test.ts`) | Modify | Hisobot for ADMIN |
| `docs/CURRENT_WORKFLOW.md`, `docs/superpowers/specs/2026-09-30-money-rules-design.md` §5, `CLAUDE.md` (Roles bullet) | Modify | Say what the code now does |

---

### Task 1: Baselines

**Files:** none committed.

**Interfaces:**
- Consumes: the branch with wave 1 merged, the running `CONTAINER`.
- Produces: `apps/master/e2e/.data/p3-status-base.txt` (git-ignored) and the floors every later task
  compares against.

- [ ] **Step 1: Confirm where you are**

```bash
cd ~/dev/lab/project02-money
git status --short
git log --oneline -5
grep -n "localDayRangeFor\|tradingDay" apps/master/src/main/server/services/reports.service.ts | head
grep -n "appliedDiscount\|Discount" apps/master/src/main/server/printer/receipt-builder.ts apps/master/src/main/server/services/print.service.ts
```

Expected: a clean tree; wave 1's merges in the log. Note which day-range helper `dailyLedger` calls
now (P2) and whether `appliedDiscount` survived P7 — Tasks 4, 9 and 12 follow what is there.

- [ ] **Step 2: Record the gates**

```bash
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER sh -c 'pnpm exec vitest run --config vitest.e2e.config.ts --reporter=verbose 2>&1 | grep -E "^ +(✓|×) " | sed -E "s/ +[0-9]+ ?m?s$//" | sort > e2e/.data/p3-status-base.txt; wc -l < e2e/.data/p3-status-base.txt; grep -c "×" e2e/.data/p3-status-base.txt'
```

Expected: typecheck `47`, renderer `0`, gallery `0`; write down the unit count and the e2e totals. If
`pnpm typecheck` is not 47, the container's number is the floor; say so in Task 18.

- [ ] **Step 3: Note the tests this package flips**

```bash
docker exec -w /app/apps/master CONTAINER grep -E "issue (1|2|9|10|11|12|13|20|32)\]" e2e/.data/p3-status-base.txt
```

Expected: `×` for `[issue 1]` (two receipt tests), `[issue 2]`, `[issue 9]`, `[issue 10]`,
`[issue 11]`, `[issue 12]` (`/oylik` prints no "Tan narxi"), `[issue 13]`, `[issue 20]`, `[issue 32]`.
Keep this list for Task 18.

---

### Task 2: `dayMoney` — the seven words, worked out once

**Files:**
- Create: `apps/master/src/main/server/lib/day-money.ts`
- Test: `apps/master/src/main/server/lib/day-money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MoneyParts`, `MoneySplit`, `DayMoney`, `dayMoney(parts: MoneyParts): DayMoney`. Pure, no
  Prisma import (whole so'm strings, `BigInt` arithmetic), so `pnpm test` covers it. P5 reads
  Kutilgan's inputs as `ledger.money.kirim.naqd`, `ledger.money.chiqim.naqd` and `ledger.money.kassa`
  (Task 4's `dailyLedger(day).money`). There is no `kassa.naqdKirim` or `kassa.naqdChiqim`: `kassa` is
  one string, and the naqd parts sit under `kirim` and `chiqim`. P6 extends `MoneyParts` with waiter
  payouts (naqd Chiqim) and write-offs (Xarajat).

- [ ] **Step 1: Write the failing test**

```ts
// apps/master/src/main/server/lib/day-money.test.ts
import { describe, expect, it } from 'vitest';
import { dayMoney, type MoneyParts } from './day-money';

// The day of e2e/07-day.test.ts and money rules §3.9.
const TESTED_DAY: MoneyParts = {
  netSales: '165000',
  serviceCharge: '25000',
  cogs: '73000',
  operatingExpense: '40000',
  orderCash: '110000',
  orderCard: '50000',
  debtRepaidCash: '0',
  debtRepaidCard: '0',
  expenseReturns: '20000',
  cashOutNaqd: '170000',
  cashOutKarta: '0',
};

const ZERO: MoneyParts = {
  netSales: '0', serviceCharge: '0', cogs: '0', operatingExpense: '0',
  orderCash: '0', orderCard: '0', debtRepaidCash: '0', debtRepaidCard: '0',
  expenseReturns: '0', cashOutNaqd: '0', cashOutKarta: '0',
};

describe('dayMoney (money rules §3.9)', () => {
  it('names the tested day the way §3.9 does', () => {
    expect(dayMoney(TESTED_DAY)).toEqual({
      sotuv: '165000',
      xizmatHaqi: '25000',
      tanNarx: '73000',
      kirim: { naqd: '130000', karta: '50000', jami: '180000' },
      chiqim: { naqd: '170000', karta: '0', jami: '170000' },
      xarajat: '40000',
      kassa: '-40000',
      foyda: '52000',
    });
  });

  it('[D10] a 40 000 gas bill paid by Karta lowers Foyda but not Kassa', () => {
    const m = dayMoney({ ...TESTED_DAY, cashOutNaqd: '130000', cashOutKarta: '40000' });
    expect({ kassa: m.kassa, chiqim: m.chiqim, foyda: m.foyda })
      .toEqual({ kassa: '0', chiqim: { naqd: '130000', karta: '40000', jami: '170000' }, foyda: '52000' });
  });

  it('[D9] a nasiya sale is neither Kirim nor Kassa, only Sotuv', () => {
    const m = dayMoney({ ...ZERO, netSales: '45000', cogs: '25000' });
    expect({ sotuv: m.sotuv, kirim: m.kirim.jami, kassa: m.kassa, foyda: m.foyda })
      .toEqual({ sotuv: '45000', kirim: '0', kassa: '0', foyda: '20000' });
  });

  it('[D9] an old nasiya repaid by card is Karta Kirim, not Kassa', () => {
    const m = dayMoney({ ...ZERO, debtRepaidCard: '30000' });
    expect({ kirim: m.kirim, kassa: m.kassa }).toEqual({ kirim: { naqd: '0', karta: '30000', jami: '30000' }, kassa: '0' });
  });

  it('keeps the ledger core: Kirim is realCashIn, Chiqim is cashOut, Foyda is profit', () => {
    const p = { ...TESTED_DAY, debtRepaidCash: '7000', debtRepaidCard: '3000', cashOutKarta: '9000' };
    const m = dayMoney(p);
    const realCashIn = 110000 + 50000 + 7000 + 3000 + 20000;
    const cashOut = 170000 + 9000;
    expect({ kirim: Number(m.kirim.jami), chiqim: Number(m.chiqim.jami), foyda: Number(m.foyda) })
      .toEqual({ kirim: realCashIn, chiqim: cashOut, foyda: 165000 - 73000 - 40000 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/day-money.test.ts
```

Expected: fails — `Cannot find module './day-money'`.

- [ ] **Step 3: Implement**

```ts
// apps/master/src/main/server/lib/day-money.ts
/**
 * The day's money in the words every surface uses (money rules D9, D10, D17; §3.9).
 *
 * The day ledger works out the raw sums; this turns them into the seven words.
 * Screens, Telegram, the PDF and Excel read the result and never do this
 * arithmetic themselves — that duplication is how "Kassa" came to include card
 * money on one screen and not another.
 *
 *   Sotuv       = food after Chegirma; never Xizmat haqi
 *   Xizmat haqi = the waiters' money, always its own line
 *   Kirim       = every so'm received, split Naqd / Karta   (jami = realCashIn)
 *   Chiqim      = every so'm paid out, split Naqd / Karta   (jami = cashOut)
 *   Xarajat     = what reduces profit (operating expense)
 *   Kassa       = naqd Kirim − naqd Chiqim: the drawer, cash only
 *   Foyda       = Sotuv − Tan narx − Xarajat               (= profit)
 *
 * Nasiya is in none of them; it is Kirim on the day it is repaid. An avans
 * return is naqd. Every part is a whole-so'm `Decimal.toFixed(0)` string, so
 * BigInt is exact.
 */
export type MoneyParts = {
  netSales: string;
  serviceCharge: string;
  cogs: string;
  operatingExpense: string;
  orderCash: string;
  orderCard: string;
  debtRepaidCash: string;
  debtRepaidCard: string;
  expenseReturns: string;
  cashOutNaqd: string;
  cashOutKarta: string;
};

export type MoneySplit = { naqd: string; karta: string; jami: string };

export type DayMoney = {
  sotuv: string;
  xizmatHaqi: string;
  tanNarx: string;
  kirim: MoneySplit;
  chiqim: MoneySplit;
  xarajat: string;
  kassa: string;
  foyda: string;
};

const som = (value: string): bigint => BigInt(value);
const str = (value: bigint): string => value.toString();

export function dayMoney(p: MoneyParts): DayMoney {
  const kirimNaqd = som(p.orderCash) + som(p.debtRepaidCash) + som(p.expenseReturns);
  const kirimKarta = som(p.orderCard) + som(p.debtRepaidCard);
  const chiqimNaqd = som(p.cashOutNaqd);
  const chiqimKarta = som(p.cashOutKarta);
  return {
    sotuv: str(som(p.netSales)),
    xizmatHaqi: str(som(p.serviceCharge)),
    tanNarx: str(som(p.cogs)),
    kirim: { naqd: str(kirimNaqd), karta: str(kirimKarta), jami: str(kirimNaqd + kirimKarta) },
    chiqim: { naqd: str(chiqimNaqd), karta: str(chiqimKarta), jami: str(chiqimNaqd + chiqimKarta) },
    xarajat: str(som(p.operatingExpense)),
    kassa: str(kirimNaqd - chiqimNaqd),
    foyda: str(som(p.netSales) - som(p.cogs) - som(p.operatingExpense)),
  };
}
```

- [ ] **Step 4: Run it to see it pass, then the gates**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/day-money.test.ts
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: 5 passed; unit total +5, one more file; `47`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/lib/day-money.ts apps/master/src/main/server/lib/day-money.test.ts
git commit -m "feat(ledger): one function for the day's money words" -m "Sotuv, Xizmat haqi, Kirim, Chiqim, Xarajat, Kassa and Foyda are worked out in one place (money rules D17). Kassa is the naqd part only (D9); a Karta expense lowers Foyda but not Kassa (D10)."
```

---

### Task 3: An expense is Naqd or Karta

**Files:**
- Modify: `apps/master/prisma/schema.prisma` (`model Expense`, `:436-475`; new enum beside
  `enum PaymentMethod`, `:38-42`)
- Create: `apps/master/prisma/migrations/<timestamp>_expense_payment_method/migration.sql`
- Modify: `apps/master/src/main/server/controllers/expense.controller.ts` (`createExpenseSchema`
  `:7-14`, `create` `:80-94`)
- Modify: `apps/master/src/main/server/services/expense.service.ts` (`mapExpense` `:45-77`,
  `listByDate` `:85-192`, `create` `:214-289`, `reverse` `:430-439`)
- Create: `apps/master/e2e/17-kassa-karta.test.ts` (the setup and its first two tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Expense.paymentMethod` (`'CASH' | 'CARD'`, default `CASH`) on every expense DTO;
  `listByDate(...).totals.cashOutNaqd` and `.cashOutKarta` (strings, adding up to `totals.cashOut`);
  `POST /api/expenses` body `paymentMethod`. P4 builds the expense form's later changes on top.

- [ ] **Step 1: Write the failing e2e file**

Create `apps/master/e2e/17-kassa-karta.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// Kassa is the drawer's cash; Karta is its own line; nasiya is neither (money rules D9, D10, D17).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, boot, buildWorld, capturePrints, n, sale, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D = '2026-10-01';
let made: { cash: any; card: any; refused: { status: number; body: any } };

// Hand-computed truth for the day below.
const TRUTH = {
  sotuv: 114000, // Osh 2 × 45 000 + Somsa 3 × 8 000
  xizmatHaqi: 10000, // Xizmat haqi 2 × 5 000
  tanNarx: 62000, // Osh 2 × 25 000 + Somsa 3 × 4 000
  kirim: { naqd: 60000, karta: 50000, jami: 110000 }, // Naqd 60 000; Karta 40 000 + nasiya to'lovi 10 000 by card
  chiqim: { naqd: 30000, karta: 20000, jami: 50000 }, // Gaz 30 000 Naqd; Internet 20 000 Karta; 5 000 Karta undone the same day
  xarajat: 50000,
  kassa: 30000, // 60 000 − 30 000
  foyda: 2000, // 114 000 − 62 000 − 50 000
  nasiya: 24000, // in none of the above
  drawerMovement: 60000, // ledger core, card included: 110 000 − 50 000
};

beforeAll(async () => {
  setClock(at(`${D}T09:00`));
  env = await boot('kassa');
  w = await buildWorld(env.base);
  setClock(at(`${D}T10:00`));
  await sale(w, w.w1, [[w.items.osh, 2], [w.items.xizmat, 2]], {
    payments: [{ method: 'CASH', amount: 60000 }, { method: 'CARD', amount: 40000 }],
  });
  setClock(at(`${D}T11:00`));
  const b = await sale(w, w.w2, [[w.items.somsa, 3]], { payments: [{ method: 'DEBT', amount: 24000 }], debt: { debtorName: 'Olim' } });
  setClock(at(`${D}T12:00`));
  const debt = await env.prisma.debt.findFirstOrThrow({ where: { orderId: b.id } });
  await w.admin.post(`/api/debts/${debt.id}/repayments`, { amount: 10000, method: 'CARD' });
  setClock(at(`${D}T13:00`));
  const when = at(`${D}T13:00`).toISOString();
  const cash = await w.admin.post('/api/expenses', { amount: 30000, reason: 'Gaz', occurredAt: when });
  const card = await w.admin.post('/api/expenses', { amount: 20000, reason: 'Internet', paymentMethod: 'CARD', occurredAt: when });
  const wrong = await w.admin.post('/api/expenses', { amount: 5000, reason: 'Xato yozildi', paymentMethod: 'CARD', occurredAt: when });
  await w.admin.post(`/api/expenses/${wrong.id}/reverse`, { note: 'Xato yozildi' });
  const refused = await w.admin.call('POST', '/api/expenses', { amount: 1000, reason: 'Nasiya chiqim', paymentMethod: 'DEBT', occurredAt: when });
  made = { cash, card, refused };
  setClock(at(`${D}T16:00`));
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('An expense is Naqd or Karta (D10)', () => {
  it('[D10] an expense is Naqd unless Karta is chosen, and never Nasiya', () => {
    expect({
      cash: made.cash.paymentMethod,
      card: made.card.paymentMethod,
      refused: made.refused.status,
      code: made.refused.body?.error?.code,
    }).toEqual({ cash: 'CASH', card: 'CARD', refused: 400, code: 'VALIDATION' });
  });

  it('[D10] Chiqimlar splits the day\'s Chiqim into Naqd and Karta; an undo gives back its own method', async () => {
    const day = await w.admin.get(`/api/expenses?date=${D}`);
    expect({ cashOut: n(day.totals.cashOut), naqd: n(day.totals.cashOutNaqd), karta: n(day.totals.cashOutKarta) })
      .toEqual({ cashOut: TRUTH.chiqim.jami, naqd: TRUTH.chiqim.naqd, karta: TRUTH.chiqim.karta });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/17-kassa-karta.test.ts
```

Expected: 2 failed — `paymentMethod` is `undefined` (zod strips the unknown key, so the Karta expense
saves as a plain one) and `cashOutNaqd` is `NaN`.

- [ ] **Step 3: The schema**

In `apps/master/prisma/schema.prisma`, after `enum PaymentMethod { … }` add:

```prisma
/// How an expense was paid (money rules D10). Naqd leaves the drawer; Karta does
/// not. Both reduce profit the same way. A REVERSAL row carries its original's.
enum ExpensePaymentMethod {
  CASH
  CARD
}
```

In `model Expense`, after `purchaseId        String?       @unique`, add:

```prisma
  paymentMethod     ExpensePaymentMethod @default(CASH)
```

- [ ] **Step 4: The migration — an added column, never a rebuilt table**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --name expense_payment_method --create-only
docker exec -w /app/apps/master CONTAINER sh -c 'cat prisma/migrations/*_expense_payment_method/migration.sql'
```

Expected, the whole file:

```sql
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'CASH';
```

If Prisma wrote a `RedefineTables` block instead, replace the file's content with exactly the two
lines above: the table is then not rebuilt, so `Expense`'s six indexes stay. Then apply and regenerate:

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --name expense_payment_method
docker exec -w /app/apps/master CONTAINER pnpm exec prisma generate
```

Existing rows read `CASH`, which is what every expense so far was (the form had no choice).

- [ ] **Step 5: The API**

`expense.controller.ts`, `createExpenseSchema`: add `paymentMethod: z.enum(['CASH', 'CARD']).optional(),`
and pass `paymentMethod: body.paymentMethod` to `expenseService.create`. A `DEBT` fails the schema, which
the error handler answers as 400 `VALIDATION` (PRD 14 G3).

`expense.service.ts`:

- `import { ExpensePaymentMethod, ExpenseStatus, Prisma } from '@prisma/client';`
- `mapExpense`: add `paymentMethod: item.paymentMethod,` after `status`.
- `create`: input gains `paymentMethod?: ExpensePaymentMethod`; the `expenseRepo.create` data gains
  `paymentMethod: input.paymentMethod ?? ExpensePaymentMethod.CASH`; the `EXPENSE_CREATED` audit
  metadata gains `paymentMethod`.
- `reverse`: the REVERSAL row's data gains `paymentMethod: original.paymentMethod,` — an undo returns
  money to where it came from, so a Karta undo never moves Kassa.

- [ ] **Step 6: Split `cashOut` by method in `listByDate`**

In `listByDate`, declare beside `sameDayReversal`:

```ts
    // Kassa needs the naqd part of cash out (money rules D10). Each row's share
    // of cashOut is `sign` below: + amount for ACTIVE/REVERSED, − amount for a
    // same-day REVERSAL, 0 for a cross-day one — so the two parts always add up
    // to `gross − sameDayReversal`, the ledger's cashOut.
    let cashOutNaqd = new Prisma.Decimal(0);
    let cashOutKarta = new Prisma.Decimal(0);
```

and in the loop, right after `const sign = …` (`:155-157`):

```ts
      if (item.paymentMethod === ExpensePaymentMethod.CARD) {
        cashOutKarta = cashOutKarta.plus(sign);
      } else {
        cashOutNaqd = cashOutNaqd.plus(sign);
      }
```

In `totals`, after `cashOut`, add `cashOutNaqd: decimalToString(cashOutNaqd),` and
`cashOutKarta: decimalToString(cashOutKarta),`. Nothing else in `listByDate` changes.

- [ ] **Step 7: Run the tests**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/17-kassa-karta.test.ts
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: 2 passed; `47`. Then `E2E-DIFF`: only the two new 17 tests added.

- [ ] **Step 8: Commit**

```bash
git add apps/master/prisma/schema.prisma apps/master/prisma/migrations apps/master/src/main/server/controllers/expense.controller.ts apps/master/src/main/server/services/expense.service.ts apps/master/e2e/17-kassa-karta.test.ts
git commit -m "feat(expenses): record whether an expense was paid Naqd or Karta" -m "Expense.paymentMethod, CASH by default and for every existing row (money rules D10). The day's cash out splits into its naqd and karta parts, and an undo carries its original's method, so a Karta undo never moves the drawer."
```

---

### Task 4: The day ledger speaks the words

**Files:**
- Modify: `apps/master/src/main/server/services/reports.service.ts` (`dailyLedger`, after
  `const profit = …` `:1268`; the returned object `:1292-1372`)
- Modify: `apps/master/e2e/harness.ts` (add `moneyWords`)
- Test: `apps/master/e2e/07-day.test.ts` (new control), `apps/master/e2e/17-kassa-karta.test.ts`

**Interfaces:**
- Consumes: `dayMoney` (Task 2), `totals.cashOutNaqd/Karta` (Task 3).
- Produces: `dailyLedger(day).money: DayMoney` — and through it `GET /api/reports/daily` `.ledger.money`
  and `GET /api/finance/daily` `.ledger.money`; the locals `cashOutNaqd` / `cashOutKarta` in
  `dailyLedger` (P6 adds waiter payouts to `cashOutNaqd`). P5 reads exactly these three fields:
  `ledger.money.kirim.naqd`, `ledger.money.chiqim.naqd` and `ledger.money.kassa` (each a whole-so'm
  string); there is no `ledger.money.kassa.naqdKirim` or `.naqdChiqim`. `moneyWords(m)` in the e2e
  harness.

- [ ] **Step 1: Add the harness helper**

At the end of `apps/master/e2e/harness.ts`:

```ts
/** A `DayMoney` as numbers, for one `toEqual` against hand-computed truth. */
export const moneyWords = (m: any) => ({
  sotuv: n(m.sotuv),
  xizmatHaqi: n(m.xizmatHaqi),
  tanNarx: n(m.tanNarx),
  kirim: { naqd: n(m.kirim.naqd), karta: n(m.kirim.karta), jami: n(m.kirim.jami) },
  chiqim: { naqd: n(m.chiqim.naqd), karta: n(m.chiqim.karta), jami: n(m.chiqim.jami) },
  xarajat: n(m.xarajat),
  kassa: n(m.kassa),
  foyda: n(m.foyda),
});
```

- [ ] **Step 2: Write the failing tests**

In `07-day.test.ts`, import `moneyWords` from `./harness`, and add to `describe('The day ledger (C29–C39)')`
after the first control:

```ts
  it('control: the day in the ledger\'s words — Sotuv, Xizmat haqi, Kirim, Chiqim, Xarajat, Kassa, Foyda (§3.9)', () => {
    expect(moneyWords(ledger.money)).toEqual({
      sotuv: 165000,
      xizmatHaqi: 25000,
      tanNarx: 73000,
      kirim: { naqd: 130000, karta: 50000, jami: 180000 }, // cash 110 000 + avans back 20 000; card 50 000
      chiqim: { naqd: 170000, karta: 0, jami: 170000 }, // Keldi 80 000 + gas 40 000 + avans 50 000, all from the till
      xarajat: 40000,
      kassa: -40000, // TRUTH.physicalCash
      foyda: 52000,
    });
  });
```

In `17-kassa-karta.test.ts`, import `moneyWords`, add `let ledger: any;`, set
`ledger = await env.svc.reports.dailyLedger(D);` as the last line of `beforeAll`, and add:

```ts
describe('The day ledger (D9, D10, D17)', () => {
  it('[D9] Kassa is the cash alone, Karta is its own line, and nasiya is in neither', () => {
    expect({
      money: moneyWords(ledger.money),
      nasiya: n(ledger.sales.debtSales),
      drawerMovement: n(ledger.cashflow.drawerMovement),
    }).toEqual({
      money: {
        sotuv: TRUTH.sotuv, xizmatHaqi: TRUTH.xizmatHaqi, tanNarx: TRUTH.tanNarx,
        kirim: TRUTH.kirim, chiqim: TRUTH.chiqim, xarajat: TRUTH.xarajat, kassa: TRUTH.kassa, foyda: TRUTH.foyda,
      },
      nasiya: TRUTH.nasiya,
      drawerMovement: TRUTH.drawerMovement,
    });
  });
});
```

Run both files; expected: the two new tests fail on `ledger.money` being `undefined`.

- [ ] **Step 3: Implement**

`reports.service.ts`: `import { dayMoney } from '../lib/day-money';`. In `dailyLedger`, after
`const profit = netSales.minus(cogs).minus(operatingExpense);`:

```ts
    // The day in the words every surface shows (money rules D17). Inputs are the
    // sums above, unchanged; dayMoney only groups them (Kassa = naqd Kirim −
    // naqd Chiqim) and is the one place that grouping exists.
    // The naqd and karta parts of cashOut (money rules D10). Any cash outflow the
    // ledger learns later joins one of these, so Kassa follows it — P6 adds the
    // day's waiter payouts to the naqd part, as it adds them to cashOut.
    const cashOutNaqd = new Prisma.Decimal(expenseSummary.totals.cashOutNaqd);
    const cashOutKarta = new Prisma.Decimal(expenseSummary.totals.cashOutKarta);
    const money = dayMoney({
      netSales: decStr(netSales),
      serviceCharge: decStr(serviceCharge),
      cogs: decStr(cogs),
      operatingExpense: decStr(operatingExpense),
      orderCash: decStr(orderCash),
      orderCard: decStr(orderCard),
      debtRepaidCash: decStr(debtRepaidCash),
      debtRepaidCard: decStr(debtRepaidCard),
      expenseReturns: decStr(expenseReturnsTotal),
      cashOutNaqd: decStr(cashOutNaqd),
      cashOutKarta: decStr(cashOutKarta),
    });
```

In the returned object add `money,` right after `pnl: { … },`. Update the doc comment above
`dailyLedger` with one line: "`money` is the day in the vocabulary of money rules §3.9 — read it,
don't recompute it."

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/07-day.test.ts e2e/17-kassa-karta.test.ts
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: both new controls pass; the first 07 control still passes (the core is unchanged); `47`.
`E2E-DIFF`: only the two new tests.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/services/reports.service.ts apps/master/e2e/harness.ts apps/master/e2e/07-day.test.ts apps/master/e2e/17-kassa-karta.test.ts
git commit -m "feat(ledger): the day ledger carries Sotuv, Kirim, Chiqim, Xarajat, Kassa and Foyda" -m "ledger.money groups the ledger's existing sums in the vocabulary of money rules 3.9. Kassa is naqd Kirim minus naqd Chiqim. No formula of the ledger core changes."
```

---

### Task 5: The month and the range speak the same words

**Files:**
- Modify: `apps/master/src/main/server/services/reports.service.ts` — `monthly` (`DayAgg` `:487-504`,
  `emptyAgg`, the expense loop `:580-614`, the day rows `:663-737`, the return `:751-768`);
  `summary` (the closed-orders loop `:866-877`, the expense loop `:924-962`, the return `:1002-1056`)
- Test: `apps/master/e2e/17-kassa-karta.test.ts`

**Interfaces:**
- Consumes: `dayMoney`, `Expense.paymentMethod`.
- Produces: `monthly(...).daily[i].money`, `monthly(...).totals.money`, `summary(...).money` — each a
  `DayMoney`. Month totals are `dayMoney` of the summed parts, which equals the sum of the days' money
  (the function is linear).
- `monthly` and `summary` do **not** call `dailyLedger`: each aggregates its own parts — `monthly` in
  `DayAgg.cashOutNaqd` / `DayAgg.cashOutKarta` (and `DayAgg.operatingExpense`), `summary` in its locals
  `cashOutNaqd` / `cashOutKarta` (and `operatingForPnl`). So P6 must add the waiter payouts to
  `DayAgg.cashOutNaqd` and `summary`'s `cashOutNaqd`, and the write-off losses to `DayAgg.operatingExpense`
  and `summary`'s `operatingForPnl` (through the sums it is derived from), as well as to `dailyLedger`; adding them to `dailyLedger` alone leaves Hisobot
  oylik, umumiy, `/oylik`, `/umumiy` and the Excel on the old figures, and Task 5's test (day row = month
  = range = day) catches the gap.

- [ ] **Step 1: Write the failing test**

In `17-kassa-karta.test.ts`:

```ts
describe('The month and the range (D17)', () => {
  it('[D17] Hisobot oylik (the day row and the month) and umumiy carry the same money as the day', async () => {
    const month = await w.owner.get(`/api/reports/monthly?month=${D.slice(0, 7)}`);
    const row = month.daily.find((r: any) => r.date === D);
    const period = await w.owner.get(`/api/reports/summary?from=${D}&to=${D}`);
    const day = moneyWords(ledger.money);
    expect({ row: moneyWords(row.money), month: moneyWords(month.totals.money), period: moneyWords(period.money) })
      .toEqual({ row: day, month: day, period: day });
  });
});
```

Run; expected: fails on `row.money` being `undefined`.

- [ ] **Step 2: `monthly`**

Add `cashOutNaqd` and `cashOutKarta` (`Prisma.Decimal`) to `DayAgg` and `emptyAgg`. In the expense
loop, mirror Task 3's rule exactly:

```ts
      const isCard = expense.paymentMethod === ExpensePaymentMethod.CARD;
      if (expense.status === ExpenseStatus.ACTIVE || expense.status === ExpenseStatus.REVERSED) {
        agg.expenseGross = agg.expenseGross.plus(expense.amount);
        if (isCard) agg.cashOutKarta = agg.cashOutKarta.plus(expense.amount);
        else agg.cashOutNaqd = agg.cashOutNaqd.plus(expense.amount);
        // … operating, unchanged
      } else if (expense.status === ExpenseStatus.REVERSAL) {
        agg.expenseReversal = agg.expenseReversal.plus(expense.amount);
        const originalDay = …; // unchanged
        if (originalDay === dayKey) {
          agg.expenseSameDayReversal = agg.expenseSameDayReversal.plus(expense.amount);
          if (isCard) agg.cashOutKarta = agg.cashOutKarta.minus(expense.amount);
          else agg.cashOutNaqd = agg.cashOutNaqd.minus(expense.amount);
        }
        // … operating, unchanged
      }
```

Write a local `const partsOf = (agg: DayAgg): MoneyParts => ({ netSales: decStr(agg.gross.minus(agg.discount)), serviceCharge: decStr(agg.serviceCharge), cogs: decStr(agg.cogs), operatingExpense: decStr(agg.operatingExpense), orderCash: decStr(agg.orderCash), orderCard: decStr(agg.orderCard), debtRepaidCash: decStr(agg.debtRepaidCash), debtRepaidCard: decStr(agg.debtRepaidCard), expenseReturns: decStr(agg.expenseReturns), cashOutNaqd: decStr(agg.cashOutNaqd), cashOutKarta: decStr(agg.cashOutKarta) });`.
Each day row gains `money: dayMoney(partsOf(agg))` (add `money: DayMoney` to the row type); the
roll-up adds the two new fields to `totals`; the return's `totals` gains `money: dayMoney(partsOf(totals))`.
Every existing field keeps its value.

- [ ] **Step 3: `summary`**

In the closed-orders loop, also sum `serviceCharge` (`dec(o.serviceChargeSnapshot)`). In the expense
loop, after `cashDelta` is settled:

```ts
      if (e.paymentMethod === ExpensePaymentMethod.CARD) cashOutKarta = cashOutKarta.plus(cashDelta);
      else cashOutNaqd = cashOutNaqd.plus(cashDelta);
```

Return `money: dayMoney({ netSales: netFoodRevenue.toFixed(0), serviceCharge: serviceCharge.toFixed(0), cogs: totalCogs.toFixed(0), operatingExpense: operatingForPnl.toFixed(0), orderCash: salesCash.toFixed(0), orderCard: salesCard.toFixed(0), debtRepaidCash: debtRepaidCash.toFixed(0), debtRepaidCard: debtRepaidCard.toFixed(0), expenseReturns: expenseReturns.toFixed(0), cashOutNaqd: cashOutNaqd.toFixed(0), cashOutKarta: cashOutKarta.toFixed(0) })`
beside `pnl` and `cash`. `pnl` and `cash` keep their values.

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/17-kassa-karta.test.ts e2e/07-day.test.ts
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: 17's new test passes; nothing else in 07 changes; `47`. `E2E-DIFF`: only the new test.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/services/reports.service.ts apps/master/e2e/17-kassa-karta.test.ts
git commit -m "feat(reports): the month and the range carry the same money words" -m "Each day row of the monthly report, the month's totals and the range summary gain money, built by the same dayMoney from the same sums, split Naqd/Karta as the day ledger does."
```

---

### Task 6: Kunlik moliya's Kassa is the cash in the drawer

**Files:**
- Modify: `apps/master/src/main/server/services/finance.service.ts` (header comment `:21-37`; the
  numbers block `:78-111`; the DTO `:113-289`)
- Test: `apps/master/e2e/07-day.test.ts` (control #2 `:77-90`, `[issue 11]` `:108-117`),
  `apps/master/e2e/17-kassa-karta.test.ts`

**Interfaces:**
- Consumes: `ledger.money`, monthly/summary `money`.
- Produces: `GET /api/finance/daily` gains `money: DayMoney`, `serviceLine: { qty: number; amount: string }`,
  `operatingExpenses[].paymentMethod`; `drawer.movement` = `money.kassa`; `cashflow.totalIn` =
  `money.kirim.jami`; `outflow.totalOut` = `money.chiqim.jami`; `mealSales`, `mealSalesByCategory`,
  `mealSalesTotal` exclude SERVICE rows.
- `dailyForAdmin` aggregates no money of its own after this task: every figure above is read from
  `ledger.money`, so what P6 adds to `dailyLedger` reaches Kunlik moliya with no change here. The two
  aggregators P6 must also extend are `monthly` and `summary` (Task 5).

- [ ] **Step 1: Rewrite and add the tests**

In `07-day.test.ts` replace the second control (`'control: owner daily, admin daily, the month and the period report agree on the day'`) with:

```ts
  it('control: Kunlik moliya, Hisobot kunlik, oylik and umumiy agree on Foyda and Kassa', async () => {
    const daily = await w.owner.get(`/api/reports/daily?date=${D}`);
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    const month = await w.owner.get(`/api/reports/monthly?month=${D.slice(0, 7)}`);
    const row = month.daily.find((r: any) => r.date === D);
    const period = await w.owner.get(`/api/reports/summary?from=${D}&to=${D}`);
    expect({
      ownerFoyda: n(daily.ledger.money.foyda), adminFoyda: n(admin.money.foyda), monthFoyda: n(row.money.foyda), periodFoyda: n(period.money.foyda),
      ownerKassa: n(daily.ledger.money.kassa), adminKassa: n(admin.drawer.movement), monthKassa: n(row.money.kassa), periodKassa: n(period.money.kassa),
    }).toEqual({
      ownerFoyda: TRUTH.profit, adminFoyda: TRUTH.profit, monthFoyda: TRUTH.profit, periodFoyda: TRUTH.profit,
      ownerKassa: TRUTH.physicalCash, adminKassa: TRUTH.physicalCash, monthKassa: TRUTH.physicalCash, periodKassa: TRUTH.physicalCash,
    });
  });
```

Replace `[issue 11]` with the D17 meaning (money rules §5):

```ts
  it('[issue 11] every "Chiqim" is all the money paid out, and every "Xarajat" is what reduces profit (D17)', async () => {
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    const expenses = await w.admin.get(`/api/expenses?date=${D}`);
    const chiqim = {
      'Bugun → Chiqim': n(admin.money.chiqim.jami),
      'Chiqimlar → Chiqim': n(expenses.totals.cashOut),
      'Chiqimlar → rows': expenses.items.reduce((s: number, e: any) => s + n(e.signedAmount), 0),
      'Kunlik moliya → Chiqim': n(admin.outflow.totalOut),
    };
    const xarajat = { 'Kunlik moliya → Xarajat': n(admin.money.xarajat), 'Kunlik moliya → pnl': n(admin.pnl.operatingExpense) };
    expect({ chiqim, xarajat }).toEqual({
      chiqim: { 'Bugun → Chiqim': 170000, 'Chiqimlar → Chiqim': 170000, 'Chiqimlar → rows': 170000, 'Kunlik moliya → Chiqim': 170000 },
      xarajat: { 'Kunlik moliya → Xarajat': 40000, 'Kunlik moliya → pnl': 40000 },
    });
  });
```

Leave `[issue 2]` and `[issue 10]` as they are; they are the defect pins this task fixes. In
`17-kassa-karta.test.ts` add:

```ts
describe('Kunlik moliya (D9, D18)', () => {
  it('[D9] Kunlik moliya\'s Kassa is 30 000, the cash alone; Karta 50 000 is shown beside it, not inside it', async () => {
    const admin = await w.admin.get(`/api/finance/daily?date=${D}`);
    expect({
      kassa: n(admin.drawer.movement),
      money: moneyWords(admin.money),
      kirim: n(admin.cashflow.totalIn),
      chiqim: n(admin.outflow.totalOut),
      xizmat: admin.serviceLine,
    }).toEqual({
      kassa: TRUTH.kassa,
      money: moneyWords(ledger.money),
      kirim: TRUTH.kirim.jami,
      chiqim: TRUTH.chiqim.jami,
      xizmat: { qty: 2, amount: '10000' },
    });
  });
});
```

Run 07 and 17; expected: control #2, `[issue 2]`, `[issue 10]`, the new `[issue 11]` and the new 17
test fail.

- [ ] **Step 2: Implement**

In `dailyForAdmin`:

- Header comment: replace "NO profit" and the "Renderer hides `pnl.profit`" paragraph with: "ADMIN sees
  Foyda, tan narx and per-dish Foyda (money rules D18). `drawer.movement` is Kassa — the drawer's cash
  alone (D9); card money is `money.kirim.karta`."
- Delete the local drawer arithmetic (`:104-111`) and read the ledger instead:

```ts
    const money = ledger.money;
```

  In the DTO: `cashflow.totalIn: money.kirim.jami`, `outflow.totalOut: money.chiqim.jami`,
  `drawer.movement: money.kassa`, and a new top-level `money,`.
- The dish table holds food only (Money Map issue 10; D17 "Sotuv never includes Xizmat haqi"):

```ts
    const foodMeals = ledger.lines.mealSales.filter((row) => !row.isService);
    const serviceMeals = ledger.lines.mealSales.filter((row) => row.isService);
    const serviceLine = {
      qty: serviceMeals.reduce((n, row) => n + row.qty, 0),
      amount: decStr(serviceMeals.reduce((sum, row) => sum.plus(row.grossRevenue), new Prisma.Decimal(0))),
    };
```

  `mealSales`, `mealSalesByCategory` and `mealSalesTotal` iterate `foodMeals` instead of
  `ledger.lines.mealSales`; `mealsRevenue` sums `foodMeals`. `mealsCogs` stays `ledger.pnl.cogs`
  (SERVICE lines carry no cost). Add `serviceLine,` to the DTO.
- `operatingExpenses` and `expensesItems` rows gain `paymentMethod: e.paymentMethod`.
- Remove the now-unused locals the typecheck reports (`expenseReturnsTotal`, `debtRepaidCash`, … if
  unused), keeping every DTO field's value.

- [ ] **Step 3: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/07-day.test.ts e2e/17-kassa-karta.test.ts
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
```

Expected: `[issue 2]` (−40 000), `[issue 10]` (171 000, 13 portions), the rewritten control and
`[issue 11]`, and the new 17 test pass; `47`; `0`. `E2E-DIFF`: exactly those, plus the two old test
names gone.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/main/server/services/finance.service.ts apps/master/e2e/07-day.test.ts apps/master/e2e/17-kassa-karta.test.ts
git commit -m "fix(finance): Kunlik moliya's Kassa is the cash in the drawer" -m "drawer.movement is naqd Kirim minus naqd Chiqim, so card money no longer shows as till cash (money rules D9). Kirim and Chiqim are read from the ledger rather than added up again, and the dish table holds food only, with Xizmat haqi on its own line (D17, Money Map issues 2, 10, 11)."
```

---

### Task 7: ADMIN opens Hisobot; waiters never receive food cost

**Files:**
- Modify: `apps/master/src/main/server/routes/reports.routes.ts:8`
- Create: `apps/master/src/main/server/lib/client-order-line.ts`, `client-order-line.test.ts`
- Modify: `apps/master/src/main/server/services/order.service.ts` (`mapToDto` lines map `:82-86`)
- Modify: `apps/master/src/renderer/lib/navigation.ts:69`, `navigation.test.ts:55-59`
- Modify: `apps/master/src/renderer/pages/ReportsPage.tsx:691` (forbidden message)
- Test: `apps/master/e2e/08-staff-access.test.ts` (`describe('Who sees profit')` `:74-90`),
  `apps/master/e2e/01-bill.test.ts` (`[issue 32]` `:73-80`, unchanged)

**Interfaces:**
- Consumes: `money` on both daily DTOs.
- Produces: `/api/reports/*` for ADMIN and OWNER; `toClientLine(line, price)`; order DTO lines without
  `cogsSnapshot`, `consumptionSnapshot`, `menuItem`.

- [ ] **Step 1: Write the failing tests**

Unit:

```ts
// apps/master/src/main/server/lib/client-order-line.test.ts
import { describe, expect, it } from 'vitest';
import { toClientLine } from './client-order-line';

describe('toClientLine (money rules D18; Money Map issue 32)', () => {
  it('drops the food cost and the dish row, keeps what a waiter needs', () => {
    const line = {
      id: 'l1', nameSnapshot: 'Osh', quantity: 2, unitPriceSnapshot: '45000', isCanceled: false,
      cogsSnapshot: '50000', consumptionSnapshot: null,
      menuItem: { id: 'm1', kind: 'FOOD', costPrice: '25000', unitCostSnapshot: '25000' },
    };
    const out = toClientLine(line, 45000);
    expect(out).toEqual({ id: 'l1', nameSnapshot: 'Osh', quantity: 2, unitPriceSnapshot: '45000', isCanceled: false, price: 45000, menuItemKind: 'FOOD' });
    expect(Object.keys(out)).not.toContain('cogsSnapshot');
  });

  it('defaults a line with no dish row to FOOD', () => {
    expect(toClientLine({ id: 'l2', menuItem: null }, 0).menuItemKind).toBe('FOOD');
  });
});
```

In `08-staff-access.test.ts` replace `describe('Who sees profit', …)` with:

```ts
describe('Who sees profit (D18, D22)', () => {
  it('[D22] ADMIN opens the whole Hisobot: kunlik, oylik and umumiy', async () => {
    const day = env.svc.time.tradingDayOf();
    const paths = [`/api/reports/daily?date=${day}`, `/api/reports/monthly?month=${day.slice(0, 7)}`, `/api/reports/summary?from=${day}&to=${day}`];
    const statuses = await Promise.all(paths.map(async (p) => (await w.admin.call('GET', p)).status));
    expect(statuses).toEqual([200, 200, 200]);
  });

  it('control: a waiter opens neither Hisobot nor Kunlik moliya', async () => {
    const day = env.svc.time.tradingDayOf();
    const statuses = [
      (await w.w1.call('GET', `/api/reports/daily?date=${day}`)).status,
      (await w.w1.call('GET', `/api/finance/daily?date=${day}`)).status,
    ];
    expect(statuses).toEqual([403, 403]);
  });

  it('[D18] ADMIN receives the same Foyda the owner sees, and its terms', async () => {
    const day = env.svc.time.tradingDayOf();
    const admin = await w.admin.get(`/api/finance/daily?date=${day}`);
    const owner = await w.owner.get(`/api/reports/daily?date=${day}`);
    const m = admin.money;
    expect({
      admin: n(m.foyda),
      pnl: n(admin.pnl.profit),
      terms: n(m.sotuv) - n(m.tanNarx) - n(m.xarajat),
      dishes: admin.mealSales.every((r: any) => r.profit !== undefined),
    }).toEqual({ admin: n(owner.ledger.money.foyda), pnl: n(owner.ledger.money.foyda), terms: n(owner.ledger.money.foyda), dishes: true });
  });
});
```

Run the unit test (fails: no module) and 08 (the `[D22]` test fails with 403).

- [ ] **Step 2: Implement**

```ts
// apps/master/src/main/server/lib/client-order-line.ts
/**
 * An order line as it goes on the wire, to every role. A waiter reads order
 * payloads, so the line's food cost (`cogsSnapshot`) and the dish row (which
 * carries `costPrice`) never leave the server (money rules D18; Money Map 32).
 * `menuItemKind` is all a client needs from the dish.
 */
export function toClientLine<L extends { menuItem?: { kind?: string } | null }>(line: L, price: number) {
  const { cogsSnapshot: _cogs, consumptionSnapshot: _consumption, menuItem, ...rest } = line as L & {
    cogsSnapshot?: unknown;
    consumptionSnapshot?: unknown;
  };
  return { ...rest, price, menuItemKind: menuItem?.kind ?? 'FOOD' };
}
```

In `mapToDto`: `lines: order.lines?.map((l: any) => toClientLine(l, decimalToInt(l.unitPriceSnapshot))),`.
No client reads a line's `menuItem` (checked: `apps/order`, `apps/mobile` and the master renderer read
`menuItemKind`; `component.menuItem` is the combos payload, already whitelisted).

`reports.routes.ts`: `reportsRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));`.

`navigation.ts:69`: `roles: STAFF`. The ADMIN rail becomes 10 slots, the ceiling. `navigation.test.ts`:
replace `'hands an owner the reports the admin must not see'` with:

```ts
  it('hands the owner and the admin Hisobot, and a waiter no Hisobot (D22)', () => {
    expect(railFor('OWNER').map((d) => d.to)).toContain('/reports');
    expect(railFor('ADMIN').map((d) => d.to)).toContain('/reports');
    expect(railFor('WAITER').map((d) => d.to)).not.toContain('/reports');
  });
```

`ReportsPage.tsx`, the forbidden `ReportMessage`: hint `Bu sahifa faqat ega va administrator uchun.`

- [ ] **Step 3: Verify**

```bash
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/08-staff-access.test.ts e2e/01-bill.test.ts
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
```

Expected: unit +2 and the nav suite green (the rail tests hold at 10); the three new 08 tests and
`[issue 32]` pass; `47`; `0`. `E2E-DIFF`: `[issue 32]` flips; the old `control: ADMIN cannot open the
owner report` and `[issue 20]` are gone; three new tests added.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/main/server/routes/reports.routes.ts apps/master/src/main/server/lib/client-order-line.ts apps/master/src/main/server/lib/client-order-line.test.ts apps/master/src/main/server/services/order.service.ts apps/master/src/renderer/lib/navigation.ts apps/master/src/renderer/lib/navigation.test.ts apps/master/src/renderer/pages/ReportsPage.tsx apps/master/e2e/08-staff-access.test.ts
git commit -m "feat(access): ADMIN opens Hisobot; waiters never receive food cost" -m "Hisobot's routes and rail entry open to ADMIN as well as OWNER (money rules D22), and ADMIN reading Foyda is by decision, not a leak (D18). Order lines leave the server without their food cost or the dish row that carries tan narx (Money Map issue 32)."
```

---

### Task 8: Money groups with spaces in Telegram and the order app

**Files:**
- Modify: `apps/master/src/main/server/services/telegram-bot.service.ts` (`formatMoney` `:15-19`). Not
  `/omborxona`: P1 (guards-2, Task 12) already prints its tan narx through `formatUZS`.
- Modify: `apps/master/src/main/server/services/finance-report.service.ts:30-34` (dead `formatMoney`)
- Modify: `apps/order/src/renderer/lib/format.ts` (`moneyFormatter`, `formatMoney`)
- Test: `apps/master/e2e/10-ticket-unit.test.ts`, `apps/master/e2e/17-kassa-karta.test.ts`

**Interfaces:**
- Consumes: `formatUZS`.
- Produces: every Telegram money figure via `formatUZS`; the order app's `formatMoney` groups with
  NBSP, never commas (money rules §4 (33)).

- [ ] **Step 1: Write the failing tests**

`10-ticket-unit.test.ts`:

```ts
import { formatMoney as orderAppMoney } from '../../order/src/renderer/lib/format';

describe('Money in the order app (§4, issue 33)', () => {
  it('[issue 33] groups 1 673 000 with spaces, never commas, whatever the device locale', () => {
    expect(orderAppMoney(1673000).replace(/ /g, ' ')).toBe('1 673 000');
    expect(orderAppMoney(-40000).replace(/ /g, ' ')).toBe('-40 000');
  });
});
```

`17-kassa-karta.test.ts`:

```ts
describe('Telegram (D9, §4 33)', () => {
  it('[issue 33] /bugun groups money with spaces and never with commas', async () => {
    const report = await env.svc.reports.daily(env.svc.time.tradingDayStart(D));
    const msg: string = env.svc.telegram.formatReportMessage(env.svc.time.tradingDayStart(D), report);
    expect({ commas: /\d,\d{3}/.test(msg), spaced: msg.includes('114 000') }).toEqual({ commas: false, spaced: true });
  });
});
```

Run both; expected: the order-app test fails (`1,673,000`), the Telegram one fails (`commas: true`).

- [ ] **Step 2: Implement**

`telegram-bot.service.ts`: delete the local `formatMoney`, `import { formatUZS } from '../lib/format';`
(P1's Task 12 may have added this import already; keep one), and add `const formatMoney = formatUZS;`
with the comment "Explicit ASCII-space grouping: `uz-UZ` groups with commas (money rules §4, 33)."
Leave `formatStockMessage` as P1 left it.

`finance-report.service.ts`: delete the unused `formatMoney` (`:30-34`).

`apps/order/src/renderer/lib/format.ts`: delete `moneyFormatter`; `formatMoney` keeps its null and
non-finite handling, then:

```ts
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  // Explicit grouping: Intl's uz-UZ data groups with commas (money rules §4, 33).
  // NBSP so a figure never wraps, as in the master renderer.
  return sign + Math.abs(rounded).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
```

- [ ] **Step 3: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/10-ticket-unit.test.ts e2e/17-kassa-karta.test.ts
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app CONTAINER pnpm --filter @chayxana/order typecheck 2>&1 | tail -3
```

Expected: both new tests pass; `47`; the order app's typecheck as before. `E2E-DIFF`: two tests added.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/main/server/services/telegram-bot.service.ts apps/master/src/main/server/services/finance-report.service.ts apps/order/src/renderer/lib/format.ts apps/master/e2e/10-ticket-unit.test.ts apps/master/e2e/17-kassa-karta.test.ts
git commit -m "fix(format): money groups with spaces in Telegram and the order app" -m "Both formatted money through Intl's uz-UZ data, which groups with commas (money rules 4, Money Map issue 33). Grouping is now explicit, as on the till and the printer."
```

---

### Task 9: Every Telegram command speaks the ledger's words

**Files:**
- Modify: `apps/master/src/main/server/services/telegram-bot.service.ts` — `formatReportMessage`
  (`:723-826`), `formatMonthlyMessage` (`:828-883`), `formatExpensesMessage` (`:916-967`) and its
  handler `sendExpensesToday` (`:229-241`), `formatWaitersMessage` (`:990-1022`), `formatWeekSummary`
  (`:1024-1081`), `sendSummaryText` (`:352-410`)
- Test: `apps/master/e2e/07-day.test.ts` (`describe("Owner's Telegram (area 7)")` `:129-150`),
  `apps/master/e2e/17-kassa-karta.test.ts`

**Interfaces:**
- Consumes: `report.ledger.money` (daily), `month.totals.money`, `summary.money`, `listByDate` totals.
- Produces: `telegramBotService.buildExpensesMessage(dayKey: string): Promise<string>` (fetches and
  formats; the handler calls it); `telegramBotService.formatSummaryMessage(report): string` (the
  `/umumiy` text, extracted from `sendSummaryText`). P5 adds the close figures to
  `formatReportMessage` later; it keeps the line `  Yopilgan buyurtmalar: <b>N</b> ta` that
  `09-nightly-report` reads.

The exact layouts (blank lines between blocks; `━━━━━━━━━━━━━━━━━━━━` before each block; `{x}` is
`formatMoney(x)`; lines marked *(> 0)* print only when their value is positive):

`/bugun` and the nightly report (`formatReportMessage`):

```
📊 <b>{dd.mm.yyyy} — kunlik hisobot</b>
🍽 <b>Sotuv</b>
  Yopilgan buyurtmalar: <b>{closedCount}</b> ta
  Ovqat jami: <b>{sales.gross}</b> so'm
  Chegirma: <b>-{sales.discount}</b> so'm                 (> 0)
  Sotuv: <b>{money.sotuv}</b> so'm
  ✨ Xizmat haqi: <b>{money.xizmatHaqi}</b> so'm
  Nasiyaga sotildi: <b>{sales.debtSales}</b> so'm          (> 0)
  Bekor qilinganlar: <b>{canceledCount}</b> ta             (> 0)
📥 <b>Kirim</b>
  Naqd sotuv: <b>{cashflow.orderCash}</b> so'm
  Karta sotuv: <b>{cashflow.orderCard}</b> so'm
  Nasiya to'lovi (naqd): <b>{debtRepaidCash}</b> so'm       (> 0)
  Nasiya to'lovi (karta): <b>{debtRepaidCard}</b> so'm      (> 0)
  Qaytgan avans: <b>{expenseReturns}</b> so'm               (> 0)
  Kirim: <b>{money.kirim.jami}</b> so'm
📤 <b>Chiqim</b>
  Naqd: <b>{money.chiqim.naqd}</b> so'm
  Karta: <b>{money.chiqim.karta}</b> so'm                   (> 0)
  Chiqim: <b>{money.chiqim.jami}</b> so'm
  Eng katta turkumlar:                                       (top 3 of report.expenses.byCategory, as today)
    • {categoryName}: {amount} so'm
  ⏳ Qaytishi kutilayotgan avans: <b>{pendingRepayable}</b> so'm   (> 0)
💰 <b>Natija</b>
  Tan narx: <b>{money.tanNarx}</b> so'm
  Xarajat: <b>{money.xarajat}</b> so'm
  🟢 Foyda: <b>{money.foyda}</b> so'm                      (🔴 when negative)
  💵 Kassa: <b>{money.kassa}</b> so'm (naqd)
  Qarz qoldig'i: <b>{debt.outstandingAsOfEod}</b> so'm
```

`/hafta` (`formatWeekSummary`): heading as today; a row per day
`  {dd.mm.yyyy}  {orders} buyurtma · {money.sotuv} · {+/-}{money.foyda}` under
`<b>Kun           Sotuv · Foyda</b>`; then `<b>📊 Jami</b>` with `Buyurtmalar`, `Sotuv`,
`✨ Xizmat haqi`, `Kirim`, `Chiqim`, `Xarajat`, `Foyda`, `💵 Kassa` — each `Label: <b>{x}</b> so'm`,
summed over the days' `ledger.money`. Sotuv never adds Xizmat haqi (issue 9).

`/oylik` (`formatMonthlyMessage`, from `totals` and `totals.money`): block `🍽 <b>Sotuv</b>`
(Yopilgan buyurtmalar, Bekor qilinganlar (> 0), Ovqat jami, Chegirma (> 0), Sotuv, ✨ Xizmat haqi,
Nasiyaga sotildi (> 0)); block `📥 <b>Kirim va chiqim</b>` (`Kirim: <b>{jami}</b> so'm (naqd {n} ·
karta {k})`, the same for `Chiqim`); block `💰 <b>Natija</b>` (Tan narx, Xarajat, Foyda, 💵 Kassa,
Oy oxiri qarz qoldig'i); the top-5 days list ranks by `money.sotuv`.

`/xarajatlar` (`buildExpensesMessage`): heading `📤 <b>{dd.mm.yyyy} — chiqimlar</b>`; `Kiritilgan:
<b>{gross}</b> so'm`; `Bekor qilingan (shu kun): <b>-{sameDayReversal}</b> so'm` (> 0); `Chiqim:
<b>{totals.cashOut}</b> so'm`; `  Naqd: {cashOutNaqd} so'm · Karta: {cashOutKarta} so'm`; `Xarajat:
<b>{money.xarajat}</b> so'm (foydani kamaytiradi)`; `⏳ Qaytishi kutilayotgan avans` (> 0); categories
and recent rows as today, a Karta row prefixed `💳 `. Xarajat comes from the day ledger, which excludes
Mahsulot xaridi; today the handler reads `listByDate` without that exclusion.

`/umumiy` (`formatSummaryMessage`): heading as today; `<b>Sotuv — kategoriyalar bo'yicha</b>` with the
category bullets (no `<b>`), then `Ovqat jami`, `Chegirma` (> 0), `Sotuv`, `✨ Xizmat haqi`; `<b>Foyda</b>`
with `Tan narx`, `Xarajat` and its category bullets, `🟢 Foyda`; `<b>Kirim va chiqim</b>` with
`Kirim: <b>{jami}</b> so'm (naqd {n} · karta {k})`, `Chiqim: …` with its category bullets, `💵 Kassa:
<b>{money.kassa}</b> so'm (naqd)`.

`/ofitsiantlar`: per waiter `{orders} buyurtma · Sotuv {revenue} so'm · ✨ {service} so'm`; totals
`Jami: <b>{n}</b> buyurtma · Sotuv {x} so'm`.

- [ ] **Step 1: Write the failing tests**

In `07-day.test.ts`, replace the three tests of `describe("Owner's Telegram (area 7)")` with:

```ts
describe("Owner's Telegram (area 7)", () => {
  const day = () => env.svc.time.tradingDayStart(D);

  it('[issue 13] /bugun: the Kirim lines add up to Kirim, and Kassa is the cash alone (D9)', async () => {
    const msg: string = env.svc.telegram.formatReportMessage(day(), await env.svc.reports.daily(day()));
    const block = msg.split('📥 <b>Kirim</b>')[1]!.split('\n  Kirim:')[0]!;
    const listed = [...block.matchAll(/<b>([^<]+)<\/b> so'm/g)].map((m) => money(m[1]!));
    expect({ listed: listed.reduce((s, v) => s + v, 0), kirim: pick(msg, 'Kirim'), kassa: pick(msg, 'Kassa') })
      .toEqual({ listed: 180000, kirim: 180000, kassa: -40000 });
  });

  it('[issue 9] /hafta "Sotuv" is the same Sotuv as /bugun', async () => {
    const msg: string = env.svc.telegram.formatWeekSummary([{ date: day(), report: await env.svc.reports.daily(day()) }]);
    expect(pick(msg, 'Sotuv'), `/hafta Sotuv vs Sotuv ${TRUTH.netSales} (Xizmat haqi ${TRUTH.service})`).toBe(TRUTH.netSales);
  });

  it('[issue 12] /oylik shows the terms of Foyda so the owner can check it: Sotuv − Tan narx − Xarajat', async () => {
    const msg: string = env.svc.telegram.formatMonthlyMessage(await env.svc.reports.monthly(day()));
    expect({ sotuv: pick(msg, 'Sotuv'), tanNarx: pick(msg, 'Tan narx'), xarajat: pick(msg, 'Xarajat'), foyda: pick(msg, 'Foyda'), kassa: pick(msg, 'Kassa') })
      .toEqual({ sotuv: 165000, tanNarx: 73000, xarajat: 40000, foyda: 52000, kassa: -40000 });
  });

  it('[D17] /xarajatlar: Chiqim is the 170 000 paid out; Xarajat is the 40 000 that reduces profit', async () => {
    const msg: string = await env.svc.telegram.buildExpensesMessage(D);
    expect({ chiqim: pick(msg, 'Chiqim'), xarajat: pick(msg, 'Xarajat') }).toEqual({ chiqim: 170000, xarajat: 40000 });
  });

  it('[D17] /umumiy uses the ledger\'s words', async () => {
    const msg: string = env.svc.telegram.formatSummaryMessage(await env.svc.reports.summary({ from: day(), to: day() }));
    expect({
      sotuv: pick(msg, 'Sotuv'), tanNarx: pick(msg, 'Tan narx'), xarajat: pick(msg, 'Xarajat'), foyda: pick(msg, 'Foyda'),
      kirim: pick(msg, 'Kirim'), chiqim: pick(msg, 'Chiqim'), kassa: pick(msg, 'Kassa'),
    }).toEqual({ sotuv: 165000, tanNarx: 73000, xarajat: 40000, foyda: 52000, kirim: 180000, chiqim: 170000, kassa: -40000 });
  });
});
```

In `17-kassa-karta.test.ts`, inside `describe('Telegram (D9, §4 33)')`:

```ts
  it('[D9] /bugun: Kirim 110 000 with its Karta lines, Kassa 30 000, and the nasiya sale outside Kirim', async () => {
    const msg: string = env.svc.telegram.formatReportMessage(env.svc.time.tradingDayStart(D), await env.svc.reports.daily(env.svc.time.tradingDayStart(D)));
    const kirimBlock = msg.split('📥 <b>Kirim</b>')[1]!.split('\n  Kirim:')[0]!;
    expect({
      kirim: pick(msg, 'Kirim'),
      kassa: pick(msg, 'Kassa'),
      kartaSotuv: pick(msg, 'Karta sotuv'),
      kartaNasiya: pick(msg, "Nasiya to'lovi \\(karta\\)"),
      nasiyaInKirim: kirimBlock.includes('Nasiyaga sotildi'),
      nasiyaSold: pick(msg, 'Nasiyaga sotildi'),
    }).toEqual({ kirim: 110000, kassa: 30000, kartaSotuv: 40000, kartaNasiya: 10000, nasiyaInKirim: false, nasiyaSold: 24000 });
  });
```

(Add to 17 the same `money`/`pick` helpers 07 defines: `money` strips everything but digits and `-`;
`pick(msg, label)` reads `${label}: <b>([^<]+)</b>`.)

Run 07 and 17; expected: all six fail (old wording, missing methods).

- [ ] **Step 2: Implement the layouts above**

Rules for every formatter:

- Read figures from `money` (daily: `report.ledger.money`; week: each day's `report.ledger.money`;
  month: `report.totals.money`; range: `report.money`). The legacy `report.sales` / `results` fallbacks
  of `formatReportMessage` and `formatWeekSummary` go: every caller passes a current payload.
- Negative values print through `formatMoney` (ASCII `-`), never a typed `−` (U+2212): the e2e `money()`
  helper and the owner's phone both read the ASCII minus.
- `buildExpensesMessage(dayKey)`: `const summary = await expenseService.listByDate(<the day anchor for
  dayKey, as P2 left listByDate's callers>); const { money } = await reportsService.dailyLedger(dayKey);
  return this.formatExpensesMessage(<anchor>, summary, money);`. `formatExpensesMessage` takes the
  `money` third argument. `sendExpensesToday` calls `this.buildExpensesMessage(<today's key>)`.
- `sendSummaryText` becomes `await ctx.replyWithHTML(this.formatSummaryMessage(report), mainMenu)`.

- [ ] **Step 3: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/07-day.test.ts e2e/09-nightly-report.test.ts e2e/17-kassa-karta.test.ts
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: the five 07 Telegram tests and the new 17 test pass; 09 unchanged (its passes still pass,
its D21 failures still fail); `47`. `E2E-DIFF`: `[issue 9]` flips; `[issue 13]` and `[issue 12]` are
replaced by passing tests; two `[D17]` tests and one 17 test added.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/main/server/services/telegram-bot.service.ts apps/master/e2e/07-day.test.ts apps/master/e2e/17-kassa-karta.test.ts
git commit -m "fix(telegram): every command shows the ledger's words" -m "/bugun, the nightly report, /hafta, /oylik, /xarajatlar, /umumiy and /ofitsiantlar read the day ledger's money instead of adding up their own (money rules D17). /hafta's Sotuv no longer adds Xizmat haqi, /xarajatlar's Xarajat no longer counts deliveries, and Kassa is the cash alone (D9; Money Map issues 9, 11, 12, 13)."
```

---

### Task 10: The Excel summary speaks the words and groups with spaces

**Files:**
- Create: `apps/master/src/main/server/services/summary-workbook.ts`, `summary-workbook.test.ts`
- Modify: `apps/master/src/main/server/services/telegram-bot.service.ts` (`sendSummaryExcel` `:414-536`)

**Interfaces:**
- Consumes: `summary(...)` with `money`.
- Produces: `SOM_NUM_FMT`, `WorkbookSummary` (the structural subset of the summary it reads),
  `buildSummaryWorkbook(report: WorkbookSummary): Promise<ExcelJS.Workbook>`.

Sheets and rows (column B is money unless noted; every money cell is a number with `numFmt = SOM_NUM_FMT`):

| Sheet | Rows |
|---|---|
| `Sotuv` | header `Kategoriya`, `Soni`, `Ovqat jami`, `Tan narx`, `Foyda (chegirmagacha)`; one row per category; `JAMI` |
| `Xarajat` | header `Kategoriya`, `Summa`; one row per `pnl.expensesByCategory`; blank; `Ovqat jami`, `Chegirma` (negative), `Sotuv`, `Tan narx` (negative), `Xarajat` (negative), `FOYDA` (bold) |
| `Kirim va chiqim` | header `Ko'rsatkich`, `Summa`; `Kirim (naqd)`, `Kirim (karta)`, `Kirim` (bold); blank; one row per `cash.expensesByCategory`; `Chiqim (naqd)`, `Chiqim (karta)`, `Chiqim` (bold); blank; `KASSA (naqd)` (bold) |
| `Yakun` | header `Ko'rsatkich`, `Summa`; `Davr boshi`, `Davr oxiri` (text); `Sotuv`, `Xizmat haqi`, `Tan narx`, `Xarajat`, `Foyda`, `Kirim`, `Chiqim`, `Kassa (naqd)`, `Karta kirim` |

`SOM_NUM_FMT = '# ### ### ##0'`: literal spaces, so the grouping is a space on every device (Excel's
`#,##0` shows the viewer's own separator, a comma on most phones). A negative shows with spaces after
its minus (`-  40 000`); accepted, since `#,##0` would group with the phone's own separator, usually a
comma.

- [ ] **Step 1: Write the failing test**

```ts
// apps/master/src/main/server/services/summary-workbook.test.ts
import { describe, expect, it } from 'vitest';
import { SOM_NUM_FMT, buildSummaryWorkbook, type WorkbookSummary } from './summary-workbook';

// The tested day of e2e/07-day.test.ts, as GET /api/reports/summary returns it.
const DAY: WorkbookSummary = {
  from: '2026-09-29',
  to: '2026-09-29',
  incomes: {
    byMenuCategory: [
      { categoryName: 'Taomlar', qty: 8, revenue: '160000', cogs: '70000', profit: '90000' },
      { categoryName: 'Choy va non', qty: 5, revenue: '11000', cogs: '3000', profit: '8000' },
    ],
    totals: { qty: 13, revenue: '171000', cogs: '73000' },
  },
  pnl: { expensesByCategory: [{ categoryName: 'Operatsion', amount: '40000' }], grossRevenue: '171000', discount: '6000' },
  cash: { expensesByCategory: [{ categoryName: 'Mahsulot xaridi', amount: '80000' }, { categoryName: 'Operatsion', amount: '90000' }] },
  money: {
    sotuv: '165000', xizmatHaqi: '25000', tanNarx: '73000',
    kirim: { naqd: '130000', karta: '50000', jami: '180000' },
    chiqim: { naqd: '170000', karta: '0', jami: '170000' },
    xarajat: '40000', kassa: '-40000', foyda: '52000',
  },
};

const rowsOf = (sheet: { eachRow: (cb: (row: { getCell: (c: number) => { value: unknown; numFmt?: string } }) => void) => void }) => {
  const out: Array<{ label: unknown; value: unknown; numFmt?: string }> = [];
  sheet.eachRow((row) => out.push({ label: row.getCell(1).value, value: row.getCell(2).value, numFmt: row.getCell(2).numFmt }));
  return out;
};

describe('buildSummaryWorkbook (money rules D17, §4 33)', () => {
  it('names its sheets in the ledger\'s words', async () => {
    const wb = await buildSummaryWorkbook(DAY);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Sotuv', 'Xarajat', 'Kirim va chiqim', 'Yakun']);
  });

  it('Yakun shows the day\'s words as numbers, space-grouped', async () => {
    const wb = await buildSummaryWorkbook(DAY);
    const yakun = rowsOf(wb.getWorksheet('Yakun')!).filter((r) => typeof r.value === 'number');
    expect(yakun.map((r) => [r.label, r.value])).toEqual([
      ['Sotuv', 165000], ['Xizmat haqi', 25000], ['Tan narx', 73000], ['Xarajat', 40000], ['Foyda', 52000],
      ['Kirim', 180000], ['Chiqim', 170000], ['Kassa (naqd)', -40000], ['Karta kirim', 50000],
    ]);
    expect(new Set(yakun.map((r) => r.numFmt))).toEqual(new Set([SOM_NUM_FMT]));
  });

  it('no money cell anywhere is formatted with a comma', async () => {
    const wb = await buildSummaryWorkbook(DAY);
    const formats = wb.worksheets.flatMap((s) => rowsOf(s).map((r) => r.numFmt ?? ''));
    expect(formats.filter((f) => f.includes(','))).toEqual([]);
  });

  it('Kirim va chiqim ends with the cash-only Kassa', async () => {
    const wb = await buildSummaryWorkbook(DAY);
    const last = rowsOf(wb.getWorksheet('Kirim va chiqim')!).at(-1)!;
    expect([last.label, last.value]).toEqual(['KASSA (naqd)', -40000]);
  });
});
```

Run: `docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/services/summary-workbook.test.ts` → fails (no module).

- [ ] **Step 2: Implement** `summary-workbook.ts` per the table, importing exceljs the way
`sendSummaryExcel` does today (`(await import('exceljs')).default`) and `DayMoney` from
`../lib/day-money`. The module imports nothing that touches Prisma. Then `sendSummaryExcel` keeps its
temp-file and reply logic and replaces its sheet-building block with
`const wb = await buildSummaryWorkbook(report);`.

- [ ] **Step 3: Verify**

```bash
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: +4 unit tests, one more file; `47`.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/main/server/services/summary-workbook.ts apps/master/src/main/server/services/summary-workbook.test.ts apps/master/src/main/server/services/telegram-bot.service.ts
git commit -m "fix(telegram): the Excel summary uses the ledger's words and space grouping" -m "The /excel workbook is built by one tested function from the summary's money: Sotuv, Xarajat, Kirim va chiqim and Yakun sheets, Kassa cash only (money rules D9, D17). Money cells stay numbers, grouped with literal spaces instead of the viewer's locale separator (4, 33)."
```

---

### Task 11: The daily PDF speaks the words

**Files:**
- Create: `apps/master/src/main/pdf-blocks.ts`, `apps/master/src/main/pdf-blocks.test.ts`
- Modify: `apps/master/src/main/pdf-report.ts` (`fmtUZSDecimal` `:22-32`, `fmtSigned` `:34-40`,
  `KvRow` `:143`; section 1 `:375-411`; section 2 `:425-433`; section 3 `:436-449`; section 4 title
  `:453`; section 10 `:720-764`)

**Interfaces:**
- Consumes: `reportsService.daily(...).ledger` (with `money`).
- Produces: `KvRow`, `KvBlock`, `PdfLedger` (the structural subset of the day ledger it reads),
  `ledgerBlocks(ledger: PdfLedger): { foyda; sotuv; kirim; chiqim; natija }`, each a `KvBlock`. Pure:
  imports `formatUZS` and the `DayMoney` type only.

Blocks (`{x}` = `formatUZS(x) + " so'm"`):

| Block | Title | Rows |
|---|---|---|
| `foyda` | `Foyda hisobi` | `Sotuv` {sotuv}; `- Tan narx` -{tanNarx} (muted); `- Xarajat` -{xarajat} (muted); `Foyda` {foyda} (bold, good/danger); `Xizmat haqi (alohida)` {xizmatHaqi} (muted) |
| `sotuv` | `Sotuv` | `Ovqat jami` {sales.gross}; `Chegirma` -{sales.discount} (muted); `Sotuv` {sotuv} (bold); `Xizmat haqi (ofitsiantlarniki)` {xizmatHaqi}; `Nasiyaga sotildi` {sales.debtSales} (warn when > 0) |
| `kirim` | `Kirim` | `Naqd sotuv`, `Karta sotuv`, `Nasiya to'lovi (naqd)`, `Nasiya to'lovi (karta)`, `Qaytgan avans` (always, zeros included, so the lines add up — issue 13), `Kirim` {kirim.jami} (bold) |
| `chiqim` | `Chiqim` | `Kiritilgan` {outflow.expenseGross}; `Bekor qilingan (shu kun)` -{outflow.expenseSameDayReversal} (muted); `Naqd` {chiqim.naqd}; `Karta` {chiqim.karta}; `Chiqim` {chiqim.jami} (bold) |
| `natija` | `Yakuniy natija` | `FOYDA` {foyda} (bold, good/danger); `KASSA (naqd)` {kassa} (bold, good/danger); `Karta kirim` {kirim.karta} (muted) |

- [ ] **Step 1: Write the failing test** — with the tested day's ledger subset (sales gross 171 000,
  discount 6 000, debtSales 30 000; cashflow 110 000 / 50 000 / 0 / 0 / 20 000; outflow gross 170 000,
  same-day reversal 0; `money` as in Task 2's first test), assert:
  - `kirim.rows` values are `['110 000 so'm', '50 000 so'm', '0 so'm', '0 so'm', '20 000 so'm', '180 000 so'm']`,
    and the first five, parsed, add up to the last;
  - `chiqim.rows.at(-1)` is `{ label: 'Chiqim', value: "170 000 so'm", bold: true }`;
  - `foyda.rows` labels are `['Sotuv', '- Tan narx', '- Xarajat', 'Foyda', 'Xizmat haqi (alohida)']`
    and `Foyda` is `52 000 so'm`;
  - `natija.rows[1]` is `{ label: 'KASSA (naqd)', value: "-40 000 so'm", bold: true, tone: 'danger' }`;
  - no value anywhere matches `/\d,\d{3}/`.

  Run `docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/main/pdf-blocks.test.ts` → fails.

- [ ] **Step 2: Implement** `pdf-blocks.ts`. In `pdf-report.ts`: move `KvRow` to `pdf-blocks.ts` and
  import it; `fmtUZSDecimal` and `fmtSigned` return `formatUZS(...)` (keep their signatures — the
  tables still call them); `const blocks = ledgerBlocks(data.ledger);` once, then section 1 renders
  `blocks.foyda` and keeps `To'lov tekshiruvi`; section 2 keeps `Buyurtmalar` and renders
  `blocks.sotuv`; section 3 (title `Kirim va chiqim`, subtitle `Kassa — faqat naqd pul`) renders
  `blocks.kirim` and `blocks.chiqim`; section 4's title becomes `Chiqimlar`; section 10 renders
  `blocks.sotuv`, `blocks.kirim`, `blocks.chiqim`, the existing `Qarz holati`, and `blocks.natija`.
  The pre-PRD-13 fallback branch goes. Only ASCII `-` in values.

- [ ] **Step 3: Verify**

```bash
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -e DATABASE_URL=file:/app/apps/master/e2e/.data/t-day.db -w /app/apps/master CONTAINER sh -c 'pnpm exec tsx -e "import(\"./src/main/pdf-report\").then(async (m) => { await m.generateDailyReportPdf({ date: new Date(\"2026-09-29T00:00:00+05:00\"), outputPath: \"/tmp/p3.pdf\" }); console.log(\"ok\"); })" && head -c 5 /tmp/p3.pdf'
```

Expected: +5 unit tests; `47`; `ok` then `%PDF-` — the PDF still renders, against the database the
07-day e2e file left (run that file first if `t-day.db` is missing). If `tsx` cannot load the module
this way, record it and rely on the unit test; the PDF is also checked by hand in the handover.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/main/pdf-blocks.ts apps/master/src/main/pdf-blocks.test.ts apps/master/src/main/pdf-report.ts
git commit -m "fix(pdf): the daily PDF shows the ledger's words" -m "Foyda hisobi, Sotuv, Kirim, Chiqim and Yakuniy natija are built by one tested function from ledger.money (money rules D17). Kassa is cash only, every Kirim line is printed so they add up, and money groups with spaces (D9, Money Map issue 13, 4/33)."
```

---

### Task 12: The printed bill adds up and says how it was paid

**Files:**
- Modify: `apps/master/src/main/server/printer/receipt-builder.ts` (whole file, `:1-77`)
- Create: `apps/master/src/main/server/printer/receipt-builder.test.ts`
- Modify: `apps/master/src/main/server/services/print.service.ts` (`PrintableOrder` `:13-36`,
  `printBill` `:129-163`, `reprintBill` `:165-199`)
- Modify: `apps/master/cpp/receipt.cpp` (header `:12-21`, `main` `:236-327`, the item loop `:284-302`); rebuild
  `apps/master/resources/bin/receipt.exe`
- Modify: `apps/master/e2e/harness.ts` (`parseBill` `:149-162`)
- Test: `apps/master/e2e/01-bill.test.ts` (`describe('Printed bill (F9)')` `:37-62`)

**Interfaces:**
- Consumes: the closed order `getOrderOrThrow` returns (lines with `menuItem.kind`, `payments`, `debt`).
- Produces: `BillInput`, `BillRow`, `RECEIPT_WIDTH`, `billRows(bill): BillRow[]`,
  `buildBillArgs(bill, store): string[]` (`[heading, orderInfo, items, totals]`);
  `print.service`'s `billInputFromOrder(order)`; `receipt.exe <printer> <heading> <orderInfo> <items>
  <totals>`; the harness's `parseBill(args)` → `{ heading, info, lines, rows, jami, chegirma, xizmat,
  xizmatLabel, umumiy, payments, raw }`.

- [ ] **Step 1: Write the failing unit test**

```ts
// apps/master/src/main/server/printer/receipt-builder.test.ts
import { describe, expect, it } from 'vitest';
import { RECEIPT_WIDTH, billRows, buildBillArgs, type BillInput } from './receipt-builder';

// e2e/01-bill.test.ts's bill: Osh 2 × 45 000, Xizmat haqi 3 × 5 000, Chegirma 10 000.
const BILL: BillInput = {
  id: 'ckabc123',
  orderType: 'DINE_IN',
  tableName: 'Stol 1',
  approvedAt: new Date('2026-09-29T07:00:00Z'),
  lines: [
    { name: 'Osh', quantity: 2, unitPrice: 45000, kind: 'FOOD', isCanceled: false },
    { name: 'Xizmat haqi', quantity: 3, unitPrice: 5000, kind: 'SERVICE', isCanceled: false },
    { name: 'Somsa', quantity: 1, unitPrice: 8000, kind: 'FOOD', isCanceled: true },
  ],
  subtotal: 90000,
  discount: 10000,
  serviceCharge: 15000,
  total: 95000,
  payments: [{ method: 'CASH', amount: 95000 }],
  debtorName: null,
};
const STORE = { storeHeading: 'Chayxana' };

describe('the printed bill (money rules D19)', () => {
  it('prints food, then Chegirma, Xizmat haqi, UMUMIY and the payment leg', () => {
    expect(billRows(BILL)).toEqual([
      { label: 'Ovqat jami', amount: '90 000', bold: false },
      { label: 'Chegirma', amount: '-10 000', bold: false },
      { label: 'Xizmat haqi (3 kishi)', amount: '15 000', bold: false },
      { label: 'UMUMIY', amount: '95 000', bold: true },
      { label: "To'lov: Naqd", amount: '95 000', bold: false },
    ]);
  });

  it('lists food lines only, grouped with spaces; Xizmat haqi is not an item row', () => {
    expect(buildBillArgs(BILL, STORE)[2]).toBe('Osh|2|45 000|90 000');
  });

  it('adds up: Ovqat jami − Chegirma + Xizmat haqi = UMUMIY = Σ legs', () => {
    expect(BILL.subtotal - BILL.discount + BILL.serviceCharge).toBe(BILL.total);
    expect(buildBillArgs(BILL, STORE)[3]).toBe("Ovqat jami|90 000|;Chegirma|-10 000|;Xizmat haqi (3 kishi)|15 000|;UMUMIY|95 000|B;To'lov: Naqd|95 000|");
  });

  it('prints one line per leg, a nasiya leg with its debtor, and no line for a leg of 0', () => {
    const rows = billRows({ ...BILL, discount: 0, total: 105000, payments: [{ method: 'CARD', amount: 60000 }, { method: 'DEBT', amount: 45000 }, { method: 'CASH', amount: 0 }], debtorName: 'Karim aka' });
    expect(rows.slice(-2)).toEqual([
      { label: "To'lov: Karta", amount: '60 000', bold: false },
      { label: 'Nasiya: Karim aka', amount: '45 000', bold: false },
    ]);
    expect(rows.map((r) => r.label)).not.toContain('Chegirma');
  });

  it('keeps every row inside 48 columns and ASCII, whatever the debtor is called', () => {
    const rows = billRows({ ...BILL, payments: [{ method: 'DEBT', amount: 1234567 }], debtorName: 'Abdulazizxon Toʻxtasinov Baxtiyorovich (Yunusobod; 4-kv | 12)' });
    for (const row of rows) {
      expect(row.label.length + 1 + row.amount.length).toBeLessThanOrEqual(RECEIPT_WIDTH);
      expect(/^[\x20-\x7e]*$/.test(row.label)).toBe(true);
      expect(row.label).not.toMatch(/[|;]/);
    }
  });

  it('prints no Xizmat haqi row on a bill without one', () => {
    expect(billRows({ ...BILL, serviceCharge: 0, total: 80000, lines: BILL.lines.filter((l) => l.kind === 'FOOD') }).map((r) => r.label))
      .toEqual(['Ovqat jami', 'Chegirma', 'UMUMIY', "To'lov: Naqd"]);
  });
});
```

Run `docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/printer/receipt-builder.test.ts` → fails (no `billRows`).

- [ ] **Step 2: Write the failing e2e tests**

`harness.ts`, `parseBill`:

```ts
export function parseBill(args: string[]) {
  const [heading = '', info = '', items = '', totals = ''] = args;
  const num = (s: string) => Number(String(s).replace(/[^\d-]/g, ''));
  const lines = items
    ? items.split(';').map((row) => {
        const [name = '', qty = '0', unit = '0', amount = '0'] = row.split('|');
        return { name, qty: Number(qty), unit: num(unit), amount: num(amount) };
      })
    : [];
  // receipt.cpp prints the food lines, a rule, then one row per totals entry (money rules D19).
  const rows = totals
    ? totals.split(';').map((row) => {
        const [label = '', amount = '0', style = ''] = row.split('|');
        return { label, amount: num(amount), bold: style === 'B' };
      })
    : [];
  const find = (match: (label: string) => boolean) => rows.find((r) => match(r.label));
  const xizmat = find((l) => l.startsWith('Xizmat haqi'));
  return {
    heading,
    info,
    lines,
    rows,
    jami: find((l) => l === 'Ovqat jami')?.amount ?? 0,
    chegirma: Math.abs(find((l) => l === 'Chegirma')?.amount ?? 0),
    xizmat: xizmat?.amount ?? 0,
    xizmatLabel: xizmat?.label ?? null,
    umumiy: find((l) => l === 'UMUMIY')?.amount ?? 0,
    payments: rows.filter((r) => r.label.startsWith("To'lov:") || r.label.startsWith('Nasiya:')).map(({ label, amount }) => ({ label, amount })),
    raw: args,
  };
}
```

`01-bill.test.ts`, replace `describe('Printed bill (F9)')` with:

```ts
describe('Printed bill (F9, D19)', () => {
  it('[issue 1] "Ovqat jami" is the sum of the food lines printed above it; Xizmat haqi is not one of them', () => {
    const bill = printer.billFor(order.id);
    expect({ jami: bill.jami, items: bill.lines.reduce((s, l) => s + l.amount, 0), names: bill.lines.map((l) => l.name) })
      .toEqual({ jami: 90000, items: 90000, names: ['Osh'] });
  });

  it('[issue 1] Ovqat jami − Chegirma + Xizmat haqi (3 kishi) = UMUMIY', () => {
    const bill = printer.billFor(order.id);
    expect({ jami: bill.jami, chegirma: bill.chegirma, xizmat: bill.xizmat, xizmatLabel: bill.xizmatLabel, umumiy: bill.umumiy })
      .toEqual({ jami: 90000, chegirma: 10000, xizmat: 15000, xizmatLabel: 'Xizmat haqi (3 kishi)', umumiy: 95000 });
  });

  it('control: "UMUMIY" equals what was charged', () => {
    expect(printer.billFor(order.id).umumiy).toBe(order.closed.totalSnapshot);
  });

  it('[D19] the payment prints as its own line and adds up to UMUMIY', () => {
    expect(printer.billFor(order.id).payments).toEqual([{ label: "To'lov: Naqd", amount: 95000 }]);
  });

  it('[issue 1] a bill closed on nasiya prints "Nasiya: Karim aka 45 000"', async () => {
    const debtSale = await sale(w, w.w2, [[w.items.osh, 1]], { payments: [{ method: 'DEBT', amount: 45000 }], debt: { debtorName: 'Karim aka' } });
    expect(printer.billFor(debtSale.id).payments).toEqual([{ label: 'Nasiya: Karim aka', amount: 45000 }]);
  });

  it('[D19] a bill paid Naqd 50 000 and Karta 45 000 prints both legs', async () => {
    const mixed = await sale(w, w.w1, [[w.items.osh, 2], [w.items.xizmat, 1]], {
      payments: [{ method: 'CASH', amount: 50000 }, { method: 'CARD', amount: 45000 }],
    });
    const bill = printer.billFor(mixed.id);
    expect({ umumiy: bill.umumiy, payments: bill.payments }).toEqual({
      umumiy: 95000,
      payments: [{ label: "To'lov: Naqd", amount: 50000 }, { label: "To'lov: Karta", amount: 45000 }],
    });
  });
});
```

Run 01; expected: every new test fails (the old args put `90 000` where `parseBill` now expects the
totals). `00-harness` and `11-extras` `[issue 38]` read `umumiy` and `lines`, which keep their meaning.

- [ ] **Step 3: Implement the builder**

```ts
// apps/master/src/main/server/printer/receipt-builder.ts
import { formatDateTimeUZ, formatUZS } from '../lib/format';

/** Characters per line on the 80 mm printer; receipt.cpp pads every row to it. */
export const RECEIPT_WIDTH = 48;

/** Everything the bill prints, as plain values (no Prisma types), so it is unit-testable. */
export type BillInput = {
  id: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  tableName: string | null;
  approvedAt: Date | null;
  lines: Array<{ name: string; quantity: number; unitPrice: number; kind: 'FOOD' | 'SERVICE'; isCanceled: boolean }>;
  /** Ovqat jami: food before Chegirma (subtotalSnapshot). */
  subtotal: number;
  discount: number;
  serviceCharge: number;
  total: number;
  payments: Array<{ method: 'CASH' | 'CARD' | 'DEBT'; amount: number }>;
  debtorName: string | null;
};

export type BillRow = { label: string; amount: string; bold: boolean };

// ASCII_FALLBACKS, toAscii and safe — unchanged from the current file.

/** Cuts a label so label + one space + amount fits the line (money rules D19, ASCII). */
function fit(label: string, amount: string): string {
  const max = RECEIPT_WIDTH - amount.length - 1;
  return label.length > max ? label.slice(0, max).trimEnd() : label;
}

/**
 * The rows after the dashes, in the order money rules §3.11 fixes: Ovqat jami,
 * Chegirma, Xizmat haqi (N kishi), UMUMIY, then one row per payment leg.
 * Ovqat jami − Chegirma + Xizmat haqi = UMUMIY = Σ legs, by the billing math.
 */
export function billRows(bill: BillInput): BillRow[] {
  const rows: Array<{ label: string; amount: number; bold?: boolean }> = [{ label: 'Ovqat jami', amount: bill.subtotal }];
  if (bill.discount > 0) rows.push({ label: 'Chegirma', amount: -bill.discount });
  if (bill.serviceCharge > 0) {
    const guests = bill.lines
      .filter((line) => !line.isCanceled && line.kind === 'SERVICE')
      .reduce((n, line) => n + line.quantity, 0);
    rows.push({ label: guests > 0 ? `Xizmat haqi (${guests} kishi)` : 'Xizmat haqi', amount: bill.serviceCharge });
  }
  rows.push({ label: 'UMUMIY', amount: bill.total, bold: true });
  for (const leg of bill.payments) {
    if (leg.amount <= 0) continue;
    const label = leg.method === 'CASH' ? "To'lov: Naqd"
      : leg.method === 'CARD' ? "To'lov: Karta"
      : `Nasiya: ${bill.debtorName ?? ''}`.trim();
    rows.push({ label, amount: leg.amount });
  }
  return rows.map((row) => {
    const amount = formatUZS(row.amount);
    return { label: fit(safe(row.label), amount), amount, bold: row.bold === true };
  });
}

export function buildBillArgs(
  bill: BillInput,
  opts: { storeHeading: string; storePhone?: string; storeAddress?: string },
): string[] {
  const info: string[] = [`Buyurtma #${bill.id.slice(-6)}`];
  if (bill.orderType === 'DINE_IN' && bill.tableName) info.push(`Stol: ${bill.tableName}`);
  info.push(`Tur: ${bill.orderType === 'DINE_IN' ? 'Zalda' : 'Olib ketish'}`);
  info.push(`Sana: ${formatDateTimeUZ(bill.approvedAt ?? new Date())}`);

  // Food only: Xizmat haqi is one row after the dashes, not an item (D19).
  const items = bill.lines
    .filter((line) => !line.isCanceled && line.kind === 'FOOD')
    .map((line) => [safe(line.name), String(line.quantity), formatUZS(line.unitPrice), formatUZS(line.unitPrice * line.quantity)].join('|'))
    .join(';');

  const heading = [opts.storeHeading];
  if (opts.storeAddress) heading.push(opts.storeAddress);
  if (opts.storePhone) heading.push(`Tel: ${opts.storePhone}`);

  const totals = billRows(bill).map((row) => `${row.label}|${row.amount}|${row.bold ? 'B' : ''}`).join(';');
  return [heading.map(safe).join('\n'), info.map(safe).join('\n'), items, totals];
}
```

`formatDateTimeUZ` stays as P2/P1 left it (issue 34 is not this package's).

`print.service.ts`: `PrintableOrder` becomes the shape `getOrderOrThrow` returns that the adapter
needs — `lines[].menuItem: { kind: 'FOOD' | 'SERVICE' } | null`, `serviceChargeSnapshot`,
`payments: Array<{ method; amount: Prisma.Decimal }>`, `debt: { debtorName: string } | null`,
`table: { name } | null` (drop `appliedDiscount` if P7 left it). Add:

```ts
function billInputFromOrder(order: PrintableOrder): BillInput {
  const som = (d: Prisma.Decimal | null) => (d ? d.toNumber() : 0);
  return {
    id: order.id,
    orderType: order.orderType,
    tableName: order.table?.name ?? null,
    approvedAt: order.approvedAt,
    lines: order.lines.map((line) => ({
      name: line.nameSnapshot,
      quantity: line.quantity,
      unitPrice: line.unitPriceSnapshot.toNumber(),
      kind: line.menuItem?.kind === 'SERVICE' ? 'SERVICE' : 'FOOD',
      isCanceled: line.isCanceled,
    })),
    subtotal: som(order.subtotalSnapshot),
    discount: som(order.discountAmountSnapshot),
    serviceCharge: som(order.serviceChargeSnapshot),
    total: som(order.totalSnapshot),
    payments: order.payments.map((p) => ({ method: p.method, amount: p.amount.toNumber() })),
    debtorName: order.debt?.debtorName ?? null,
  };
}
```

and `printBill` / `reprintBill` call `buildBillArgs(billInputFromOrder(order), …)`.

- [ ] **Step 4: Implement the binary**

`receipt.cpp`:

- Header comment: `Invocation (5 positional args, all UTF-8): receipt.exe <printer> <heading>
  <orderInfo> <items> <totals>`; `<items>` is `;`-separated food rows `name|qty|unit|total`;
  `<totals>` is `;`-separated rows `label|amount|style`, style `B` printing bold (money rules D19).
- The item loop: a dish goes on one line when it fits (money rules §3.11), on two only when it does
  not. Replace the two `payload +=` lines after `const std::string& total = parts[3];` with:

```cpp
            // One line when it fits 48 columns: "Osh  2 x 45 000 ... 90 000" (§3.11).
            // A longer name keeps the two-line shape so nothing is cut.
            const std::string oneLine = name + "  " + qty + " x " + unit;
            if (static_cast<int>(oneLine.size() + 1 + total.size()) <= RECEIPT_WIDTH) {
                payload += twoColumns(oneLine, total, RECEIPT_WIDTH) + "\n";
            } else {
                payload += wrap(name, RECEIPT_WIDTH) + "\n";
                std::ostringstream left;
                left << "  " << qty << " x " << unit;
                payload += twoColumns(left.str(), total, RECEIPT_WIDTH) + "\n";
            }
```

- `main`: require `argv.size() >= 6`; read `totalsData = argv[5]`; after the items and the dashes,
  replace the three fixed `Jami:` / `Chegirma:` / `Umumiy:` rows with:

```cpp
    {
        const auto rows = split(totalsData, ';');
        for (const auto& entry : rows) {
            if (entry.empty()) continue;
            const auto parts = split(entry, '|');
            if (parts.size() < 2) continue;
            const bool bold = parts.size() > 2 && parts[2] == "B";
            if (bold) payload += boldOn();
            payload += twoColumns(parts[0], parts[1], RECEIPT_WIDTH) + "\n";
            if (bold) payload += boldOff();
        }
    }
```

- A Linux check build: wrap `<windows.h>`, `<winspool.h>`, `<shellapi.h>`, `utf8ToWide`,
  `wideToUtf8`, `readArgsUtf8` and `sendToPrinter` in `#ifndef RECEIPT_STDOUT`. `main` becomes
  `int main(int argc, char** argv)`; under `RECEIPT_STDOUT` it builds the `std::vector<std::string>`
  from `argv` and writes `payload` to `std::cout` instead of the spooler; otherwise it reads
  `readArgsUtf8()` and calls `sendToPrinter` as today.

Check the layout on Linux, then build the Windows binary:

```bash
docker exec -w /app/apps/master CONTAINER sh -c 'g++ -std=c++17 -DRECEIPT_STDOUT cpp/receipt.cpp -o /tmp/receipt-stdout && /tmp/receipt-stdout POS Chayxana "Buyurtma #ABC123" "Osh|2|45 000|90 000;Qozon kabob, katta porsiya 2 kishilik|1|45 000|45 000" "Ovqat jami|135 000|;Chegirma|-10 000|;Xizmat haqi (3 kishi)|15 000|;UMUMIY|140 000|B;Nasiya: Karim aka|140 000|" | cat -v | grep -E "Osh|Qozon|x 45 000|Ovqat jami|Chegirma|Xizmat haqi|UMUMIY|Nasiya"'
docker exec -u root CONTAINER sh -c 'apt-get update -qq && apt-get install -y -qq g++-mingw-w64-x86-64 >/dev/null && echo installed'
docker exec -w /app/apps/master CONTAINER pnpm build:printer
docker exec -w /app/apps/master CONTAINER sh -c 'head -c 2 resources/bin/receipt.exe; echo'
```

Expected: `Osh  2 x 45 000` then 27 spaces then `90 000`, one line; `Qozon kabob, katta porsiya 2
kishilik` alone on its line (37 + 12 + 1 + 6 = 56 > 48), then `  1 x 45 000` then 30 spaces then
`45 000`; then the five rows, each label left and amount right (`Ovqat jami` then 31 spaces then
`135 000`; the `UMUMIY` row preceded by `^[E^A`); `installed`; `Built …/receipt.exe`; `MZ`.

- [ ] **Step 5: Verify**

```bash
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/00-harness.test.ts e2e/01-bill.test.ts e2e/11-extras.test.ts
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: +6 unit tests; 01's six bill tests pass, `[issue 32]` still passes, `[issue 17]` as P1 left
it; 00 green; 11's `[issue 38]` as before; `47`. `E2E-DIFF`: the two old `[issue 1]` failures and the
old nasiya test are replaced by passing tests; one `[D19]` mixed-legs test and one payment-line test
added.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/main/server/printer apps/master/src/main/server/services/print.service.ts apps/master/cpp/receipt.cpp apps/master/resources/bin/receipt.exe apps/master/e2e/harness.ts apps/master/e2e/01-bill.test.ts
git commit -m "feat(bill): print food, discount, Xizmat haqi, total and each payment leg" -m "The bill listed Xizmat haqi as items and printed a food-only Jami, so it did not add up, and a nasiya bill looked paid (Money Map issue 1). It now prints the food, Ovqat jami, Chegirma, Xizmat haqi (N kishi), UMUMIY and one line per leg, Nasiya with the debtor (money rules D19). A dish prints on one line when it fits 48 columns, on two when it does not. The rows are decided in tested TypeScript; receipt.exe prints the rows it is given."
```

---

### Task 13: Renderer types, fixtures and Bugun

**Files:**
- Modify: `apps/master/src/renderer/api/reports.ts` (`DailyLedger` `:12-110`), `api/finance.ts`
  (`FinanceDaily` `:6-140`)
- Modify: `apps/master/gallery/fixtures/finance.ts` (`buildDailyLedger` `:279-330`,
  `buildThinDailyLedger`, the finance daily DTOs `:356`, `:409`)
- Modify: `apps/master/src/renderer/components/dashboard/MoneyPanel.tsx` (`:9-53`),
  `pages/DashboardPage.tsx` (comments `:17-23`, `:49-52`)

**Interfaces:**
- Consumes: the server DTOs of Tasks 4–6.
- Produces: renderer `DayMoney` (exported from `api/reports.ts`) and `DailyLedger.money`;
  `FinanceDaily.money`, `.serviceLine`, `operatingExpenses[].paymentMethod`,
  `expensesItems[].paymentMethod`; fixtures that carry them.

- [ ] **Step 1: Types.** In `api/reports.ts` add, mirroring `server/lib/day-money.ts`:

```ts
/** The day in the words every surface shows (money rules §3.9). Read it; never recompute it. */
export type MoneySplit = { naqd: string; karta: string; jami: string };
export interface DayMoney {
  sotuv: string;
  xizmatHaqi: string;
  tanNarx: string;
  kirim: MoneySplit;
  chiqim: MoneySplit;
  xarajat: string;
  kassa: string; // naqd Kirim − naqd Chiqim: the drawer, cash only
  foyda: string; // Sotuv − Tan narx − Xarajat
}
```

  `DailyLedger` gains `money: DayMoney`. `FinanceDaily` gains `money: DayMoney`,
  `serviceLine: { qty: number; amount: string }`, and `paymentMethod: 'CASH' | 'CARD'` on its
  `expensesItems` and `operatingExpenses` rows; the `drawer.movement` comment says "Kassa: cash only".

- [ ] **Step 2: Fixtures.** Run `typecheck:gallery` and fix every error it lists: each fixture
  ledger and finance DTO gets `money` computed from its own numbers (`kirim.naqd = orderCash +
  debtRepaidCash + expenseReturns`, `kirim.karta = orderCard + debtRepaidCard`, `chiqim.naqd =
  cashOut`, `chiqim.karta = '0'`, `kassa = kirim.naqd − cashOut`, `foyda = pnl.profit`), the finance
  fixture's `drawer.movement` becomes that `kassa`, `serviceLine` sums the fixture's SERVICE meal rows
  (which leave its `mealSales`), and expense rows get `paymentMethod: 'CASH'` with one `'CARD'` row so
  the chip has something to show.

- [ ] **Step 3: Bugun.** `MoneyPanel` shows, in this order, `MoneyField`s with the labels, values and
  notes of the Design table: `Sotuv`, `Kassa`, `Chiqim`, `Foyda`, `Nasiya qoldiq` (unchanged). Values
  through `formatMoney`; `—` while loading. Its doc comment: "Today's money in the ledger's words.
  ADMIN sees Foyda (money rules D18)." `DashboardPage`'s comments drop "Sof foyda never appears here"
  and name the five figures.

- [ ] **Step 4: Verify**

```bash
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master CONTAINER pnpm run gallery 2>&1 | tail -3
```

Expected: `0`, `0`, unit unchanged, the gallery builds. Five fields in a 400 px panel at 623 px fit
without scrolling only if each is the compact size; if the panel scrolls at 1236 × 623, pass
`size="compact"` to all five (the panel already scrolls, so nothing is ever unreachable).

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/renderer/api apps/master/gallery/fixtures apps/master/src/renderer/components/dashboard/MoneyPanel.tsx apps/master/src/renderer/pages/DashboardPage.tsx
git commit -m "feat(renderer): Bugun shows Sotuv, Kassa, Chiqim and Foyda from the ledger" -m "The renderer's types carry the day ledger's money; Bugun reads it instead of picking pnl fields, so its Chiqim is all money paid out and its Kassa the drawer's cash (money rules D9, D17, D18)."
```

---

### Task 14: Kunlik moliya shows Foyda and a cash-only Kassa

**Files:**
- Modify: `apps/master/src/renderer/components/finance/FinanceDrawerPanel.tsx` (`:8-87`)
- Modify: `apps/master/src/renderer/components/finance/FinanceWorkArea.tsx` (comment `:32-45`, tiles
  `:75-91`, dish table `:93-134`, sections `:136-207`)
- Modify: `apps/master/src/renderer/pages/FinancePage.tsx` (comment `:12-18`)

**Interfaces:**
- Consumes: `FinanceDaily.money`, `.serviceLine`, `operatingExpenses[].paymentMethod`.
- Produces: the screen of the Design section.

- [ ] **Step 1: The panel.** `FinanceDrawerPanel` per the Design section: rows from
  `data.cashflow.cashIn`, `data.cashflow.debtRepaidCash`, `data.cashflow.expenseReturns` (> 0),
  `data.money.kirim.naqd` (bold, `+`), `data.money.chiqim.naqd` (`-`, sub-line
  `Mahsulot xaridi {purchasesTotal} · boshqa {chiqim.naqd − purchasesTotal}`); a raised
  `Karta — kassaga kirmaydi` row with `Karta kirim` = `money.kirim.karta` and `Karta chiqim` =
  `money.chiqim.karta`; foot `KASSA` with the signed `money.kassa` (`+` when ≥ 0). No arithmetic but
  the sub-line's subtraction. Doc comment: "Kassa is the drawer's cash alone (money rules D9). Card
  money has its own rows and never enters the foot."
- [ ] **Step 2: The work area.** Tiles: `<Seam direction="row" columns="1fr 1fr">` holding two rows
  of two `MoneyField`s — `Sotuv` (`money.sotuv`, note `{mealSalesTotal.qty} ta porsiya`), `Tan narx`
  (`money.tanNarx`), `Xarajat` (`money.xarajat`), `Foyda` (`money.foyda`), notes as the Design table.
  Dish table: `MEAL_COLUMNS = '1fr 56px 112px 112px 112px'`, headers `Ovqat / Kategoriya`, `Soni`,
  `Ovqat jami`, `Tan narx`, `Foyda`; category and item rows add `profit`; the `Jami` row adds
  `mealSalesTotal.profit`; when `serviceLine.qty > 0` a row under it: `Xizmat haqi (ofitsiantlarniki)`
  · `{qty} kishi` · `serviceLine.amount` (blank Tan narx and Foyda cells). The `xizmat` sub-label on
  item rows goes (no service rows reach the table). `Xaridlar` → `Mahsulot xaridi`, its total
  `Jami mahsulot xaridi ({n} ta)`; `Chiqimlar (xaridlarsiz)` → `Xarajat`, total `Xarajat ({n} ta)`,
  and a `<Chip tone="inert">Karta</Chip>` after the reason of a Karta row. The file comment says ADMIN
  sees Foyda at every grain (D18) and that the dish table is food only (D17).
- [ ] **Step 3: FinancePage**'s comment: "ADMIN's daily money screen. Foyda is shown (money rules
  D18); the pinned panel is the drawer's cash (D9)."
- [ ] **Step 4: Verify** — `typecheck:renderer` `0`, `typecheck:gallery` `0`, `pnpm run gallery`
  builds. Width check by arithmetic: at 1236 px the work area is ≈ 664 px; the dish table's fixed
  columns take 392 px plus seams, leaving ≈ 260 px for the name.
- [ ] **Step 5: Commit**

```bash
git add apps/master/src/renderer/components/finance apps/master/src/renderer/pages/FinancePage.tsx
git commit -m "feat(renderer): Kunlik moliya shows Foyda and a cash-only Kassa" -m "The pinned Kassa is naqd Kirim minus naqd Chiqim with card on its own rows (money rules D9); the work area leads with Sotuv, Tan narx, Xarajat and Foyda, and the dish table shows per-dish Foyda with Xizmat haqi as its own row (D17, D18; Money Map issues 2, 10, 20)."
```

---

### Task 15: Chiqimlar — Naqd or Karta on a new expense

**Files:**
- Modify: `apps/master/src/renderer/api/expenses.ts` (`ExpenseItem` `:27-51`, `getByDate` totals `:58`,
  `create` `:61-68`)
- Modify: `apps/master/gallery/fixtures/expenses.ts`
- Modify: `apps/master/src/renderer/components/expenses/ExpenseCreateDialog.tsx` (`:19-162`)
- Modify: `apps/master/src/renderer/components/expenses/ExpenseList.tsx` (row `:88-105`)
- Modify: `apps/master/src/renderer/components/expenses/ExpensePanel.tsx` (doc comment `:51`, action
  `:106`, history head `:165`)
- Modify: `apps/master/src/renderer/components/expenses/ExpenseReturnDialog.tsx` (`:51`, `:68`, `:80`)
- Modify: `apps/master/src/renderer/pages/ExpensesPage.tsx` (`:33`, `:66-80`, `:100`, `:120-136`, toast
  `:167`)
- Modify: `apps/master/src/main/server/services/expense.service.ts` (the two return messages `:311`,
  `:322`, which the return dialog shows)

**Interfaces:**
- Consumes: `paymentMethod`, `totals.cashOut/cashOutNaqd/cashOutKarta` (Task 3).
- Produces: the form P4 extends next (Mahsulot xaridi, corrections). Keep the method state and the
  `To'lov` block self-contained so P4 adds beside it.

- [ ] **Step 1: Types and fixtures.** `ExpenseItem.paymentMethod: 'CASH' | 'CARD'`; `getByDate`
  totals add `cashOut`, `cashOutNaqd`, `cashOutKarta`; `create` accepts `paymentMethod?: 'CASH' |
  'CARD'`. Fixtures: `paymentMethod` on every row (one `CARD`), the three totals.
- [ ] **Step 2: The dialog.** Title `Yangi chiqim`; `const [method, setMethod] = useState<'CASH' |
  'CARD'>('CASH')`, reset to `'CASH'` when it opens; between the amount and the reason:

```tsx
          <div className="space-y-1.5">
            <Label>To&apos;lov</Label>
            <Seam direction="row" columns="1fr 1fr">
              <Button type="button" aria-pressed={method === 'CASH'} variant={method === 'CASH' ? 'default' : 'secondary'} onClick={() => setMethod('CASH')}>
                Naqd
              </Button>
              <Button type="button" aria-pressed={method === 'CARD'} variant={method === 'CARD' ? 'default' : 'secondary'} onClick={() => setMethod('CARD')}>
                Karta
              </Button>
            </Seam>
            <p className="text-[13px] text-muted-foreground">
              Karta bilan to&apos;langan chiqim kassadan chiqmaydi, lekin foydani kamaytiradi.
            </p>
          </div>
```

  (`DebtPanel.tsx:122-129` is the precedent: a two-button Seam, 48 px `h-control`.) The mutation sends
  `paymentMethod: method`. The description line keeps its avans sentence.
- [ ] **Step 3: The page.** `usePageTitle('Chiqimlar')`; button `Yangi chiqim`. Tiles: when not
  searching, `Chiqim` = `data.totals.cashOut` with note `Naqd {cashOutNaqd} · Karta {cashOutKarta}`
  (the server's figure, not a sum of rows — D17); when searching, the visible rows' sum with note
  `Qidiruv natijasi`. `Kutilayotgan qaytim` → `Qaytishi kutilayotgan avans`. The comment above the
  `useMemo` says it serves search mode only.
- [ ] **Step 4: List and panel.** `ExpenseList` row: `<Chip tone="inert" className="ml-2">Karta</Chip>`
  after the reason when `paymentMethod === 'CARD'`. `ExpensePanel`: a field `To'lov` · `Naqd`/`Karta`
  beside the amount.
- [ ] **Step 5: An avans return is not a Qaytim** (D20 gives `Qaytim` to the change for cash; D17 one
  word, one meaning). Every avans-return string on this page, exactly:

  | Where | Was | Becomes |
  |---|---|---|
  | `ExpensePanel.tsx` action button | `Qaytim` | `Avans qaytdi` |
  | `ExpensePanel.tsx` history head | `Qaytimlar` | `Qaytgan avanslar` |
  | `ExpensePanel.tsx`, `ExpenseList.tsx` doc comments | `` `Qaytim` and `Yo'qotish` `` | `` `Avans qaytdi` and `Yo'qotish` `` |
  | `ExpenseReturnDialog.tsx` title | `Qaytim qo'shish` | `Qaytgan avans` |
  | `ExpenseReturnDialog.tsx` field label | `Qaytim summasi (UZS)` | `Qaytgan summa (UZS)` |
  | `ExpenseReturnDialog.tsx` fallback error | `Qaytimni saqlab bo'lmadi` | `Qaytgan avansni saqlab bo'lmadi` |
  | `ExpensesPage.tsx` toast | `Qaytim yozildi` | `Qaytgan avans yozildi` |
  | `ExpenseCreateDialog.tsx` description | `keyinroq qaytim qo'shish mumkin` | `keyinroq qaytgan avansni yozish mumkin` |
  | `ExpenseCreateDialog.tsx` Qaytariladi hint | `keyinroq qaytim yoki yo'qotish belgilanadi` | `keyinroq qaytgan avans yoki yo'qotish belgilanadi` |
  | `expense.service.ts` return validation | `Qaytim summasi 0 dan katta bo'lishi kerak` | `Qaytgan summa 0 dan katta bo'lishi kerak` |
  | `expense.service.ts` return over the remainder | `Qaytim qoldiqdan oshib ketmasligi kerak (qoldiq: …)` | `Qaytgan summa qoldiqdan oshib ketmasligi kerak (qoldiq: …)` |

  Keep JSX apostrophes as `&apos;`. No e2e or unit test reads these strings (checked:
  `grep -rn "Qaytim" apps/master/e2e apps/master/src --include='*.test.ts'` finds none).
- [ ] **Step 6: Verify** — `typecheck:renderer` `0`, `typecheck:gallery` `0`, `pnpm run gallery`
  builds; `pnpm typecheck` `47`; the dialog at 1236 × 623 holds amount, To'lov, reason, note,
  Qaytariladi and the footer without the footer leaving the screen (the dialog is `sm:max-w-md`,
  ≈ 520 px tall); `Avans qaytdi` fits its `ActionBar` slot beside `Yo'qotish` at 1236 px; and

  ```bash
  grep -rn "Qaytim\|qaytim" apps/master/src/renderer/components/expenses apps/master/src/renderer/pages/ExpensesPage.tsx apps/master/src/main/server/services/expense.service.ts
  ```

  prints nothing (`Qaytishi kutilayotgan avans` from Step 3 does not match).
- [ ] **Step 7: Commit**

```bash
git add apps/master/src/renderer/api/expenses.ts apps/master/gallery/fixtures/expenses.ts apps/master/src/renderer/components/expenses apps/master/src/renderer/pages/ExpensesPage.tsx apps/master/src/main/server/services/expense.service.ts
git commit -m "feat(renderer): a Naqd/Karta choice on a new expense" -m "A new chiqim is Naqd unless Karta is chosen; Karta rows carry a chip, and the day's Chiqim tile is the server's figure split Naqd/Karta (money rules D10, D17). An avans coming back is 'Avans qaytdi' and 'Qaytgan avans', never 'Qaytim', which D20 gives to the change for cash."
```

---

### Task 16: Hisobot's day view speaks the words

**Files:**
- Modify: `apps/master/src/renderer/components/reports/PnlSummaryTiles.tsx`, `ResultsSection.tsx`,
  `CashflowSection.tsx`, `GrandSummarySection.tsx` (`:33-122`), `SalesSummary.tsx`,
  `ExpensesSection.tsx`
- Modify: `apps/master/src/renderer/pages/ReportsPage.tsx` (`DailyView` `:146-153`)
- Modify: `apps/master/src/renderer/api/reports.ts` (`ExpenseReportItem` gains `paymentMethod`),
  `gallery/fixtures/reports.ts` as the typecheck requires

**Interfaces:**
- Consumes: `DailyReport.ledger.money`.
- Produces: the day view of the Design section.

Strings, component by component (values from `report.ledger.money` unless named):

| Component | Change |
|---|---|
| `PnlSummaryTiles` | props become `{ money: DayMoney }`; tiles `Sotuv`, `Tan narx`, `Xarajat`, `Foyda` (note `Sotuv − Tan narx − Xarajat`). `DailyView` and `SummaryReportView` pass `money` |
| `ResultsSection` | headlines `Foyda` (`foyda`, prominent) and `Kassa` (`kassa`); `Foyda hisobi`: `Sotuv`, `− Tan narx`, `− Xarajat`, `Foyda`, `Xizmat haqi (ofitsiantlarniki)`; `To'lov tekshiruvi` unchanged |
| `CashflowSection` | title `Kirim va chiqim`; left `Kirim`: `Naqd sotuv`, `Karta sotuv`, `Nasiya to'lovi (naqd)`, `Nasiya to'lovi (karta)`, `Qaytgan avans` (always), `Kirim` (bold, `kirim.jami`); right `Chiqim`: `Naqd`, `Karta`, `Chiqim` (bold), and a muted line `Kiritilgan {gross}, shu kun bekor qilingan {sameDayReversal}`; strip `Kassa` with the signed `kassa`; a second strip `Karta: kirim {kirim.karta} · chiqim {chiqim.karta}`. The BigInt drawer arithmetic goes |
| `GrandSummarySection` | groups `Sotuv` (`Ovqat jami`, `Chegirma`, `Sotuv`, `Xizmat haqi (ofitsiantlarniki)`, `Chek summasi`), `Kirim` (the five lines, `Kirim`, then `Nasiyaga sotildi` with hint `Kirim emas: hali to'lanmagan`), `Chiqim` (`Kiritilgan`, `Bekor qilingan (shu kun)`, `Naqd`, `Karta`, `Chiqim`, categories), `Nasiya holati` (labels unchanged but `Bugun qaytarilgan` → `Bugungi nasiya to'lovi`), `Buyurtmalar soni`, `Yakuniy natija` (`Sotuv`, `− Tan narx`, `− Xarajat`, `Foyda`, `Kassa`); bottom strip `Bugungi foyda` |
| `SalesSummary` | `Yalpi sotuv` → `Ovqat jami`; `Sof sotuv` → `Sotuv`; `Qarzga sotildi` → `Nasiyaga sotildi` |
| `ExpensesSection` | title `Chiqimlar`; summary rows `Kiritilgan`, `Bekor qilingan (shu kun)` (`checks.expenses.sameDayReversalAmount`), `Naqd`, `Karta`, `Chiqim` (`money.chiqim.jami` — today it shows `expenses.net`, which disagrees on a day with a cross-day undo); the item table gains a `To'lov` column (`Naqd`/`Karta`) |

- [ ] **Step 1:** Implement the table. No component adds or subtracts money any more except
  `GrandSummarySection`'s presentation of a negative.
- [ ] **Step 2: Verify** — `typecheck:renderer` `0`, `typecheck:gallery` `0`, `pnpm run gallery` builds;
  `grep -rn "Sof foyda\|Sof sotuv\|Sof savdo\|Yalpi sotuv\|Kassa o'zgarishi\|Jami kelgan\|Jami ketgan\|Qarz qaytimi" apps/master/src/renderer/components/reports apps/master/src/renderer/pages/ReportsPage.tsx`
  lists only `MonthlyTable.tsx` and the `ReportsPage` month/range views (Task 17).
- [ ] **Step 3: Commit**

```bash
git add apps/master/src/renderer/components/reports apps/master/src/renderer/pages/ReportsPage.tsx apps/master/src/renderer/api/reports.ts apps/master/gallery/fixtures/reports.ts
git commit -m "feat(renderer): Hisobot's day view speaks the ledger's words" -m "Sotuv, Tan narx, Xarajat, Foyda, Kirim, Chiqim and a cash-only Kassa, read from the day ledger's money; Karta has its own strip and Nasiyaga sotildi is outside Kirim (money rules D9, D17)."
```

---

### Task 17: Hisobot's month and range views speak the words

**Files:**
- Modify: `apps/master/src/renderer/api/reports.ts` (`MonthlyDayRow` `:125-166`, `MonthlyReport`
  `:168-185`, `SummaryReport` `:187-235`)
- Modify: `apps/master/gallery/fixtures/reports.ts`
- Modify: `apps/master/src/renderer/components/reports/MonthlyTable.tsx` (columns `:33-125`)
- Modify: `apps/master/src/renderer/pages/ReportsPage.tsx` (`MonthlyReportView` `:194-256`,
  `IncomesByCategory` `:258-326`, `PnlBreakdownCard` `:328-385`, `CashBreakdownCard` `:387-452`,
  `SummaryReportView` `:454-472`)

**Interfaces:**
- Consumes: `MonthlyDayRow.money`, `MonthlyReport.totals.money`, `SummaryReport.money`.
- Produces: the month and range views in the ledger's words.

- [ ] **Step 1: Types and fixtures** — add `money: DayMoney` to `MonthlyDayRow`, `MonthlyReport.totals`
  and `SummaryReport`; fixtures computed as in Task 13.
- [ ] **Step 2: Monthly.** Tiles (grid `grid-cols-2 md:grid-cols-4`): `Kirim` (`totals.money.kirim.jami`,
  hint `Naqd {n} · Karta {k}`), `Sotuv`, `Xizmat haqi` (hint `Ofitsiantlarniki`), `Chiqim`, `Foyda`
  (hint `Sotuv − Tan narx − Xarajat`), `Kassa` (hint `Faqat naqd`), `Qarz qoldig'i`, `Buyurtmalar`.
  `MonthlyTable` columns: `Sana`, `Buyurtmalar`, `Sotuv`, `Tan narx`, `Xarajat`, `Foyda`, `Chiqim`,
  `Kassa`, `Qarz qoldig'i` — values from `row.money` (Chiqim was `expenses.net`; Foyda was
  `results.salesBasedProfit`); `Yalpi sotuv`, `Chegirma`, `Xizmat haqi` columns go (Xizmat haqi lives
  in the tile). The month's Foyda can now be checked against its terms on screen (Money Map issue 12).
- [ ] **Step 3: Umumiy.** `SummaryReportView`'s tiles pass `report.money`. `IncomesByCategory`: title
  `Sotuv — kategoriyalar bo'yicha`; columns `Kategoriya`, `Soni`, `Ovqat jami`, `Tan narx`,
  `Foyda (chegirmagacha)`; the "other inflows" rows move to the cash card. `PnlBreakdownCard`: title
  `Foyda`, sub `Sotuv − Tan narx − Xarajat`; `Xarajat — kategoriyalar bo'yicha`; rows `Ovqat jami`,
  `− Chegirma`, `Sotuv`, `− Tan narx`, `− Xarajat`, `Foyda`. `CashBreakdownCard`: title
  `Kirim va chiqim`, sub `Kassa — faqat naqd pul`; `Kirim` rows `Naqd`, `Karta`, `Nasiya to'lovi`,
  `Qaytgan avans`, `Kirim`; `Chiqim` categories, `Naqd`, `Karta`, `Chiqim`; footer `Kassa` (`money.kassa`)
  replacing `Farq`, and a muted `Karta: kirim {k} · chiqim {c}`.
- [ ] **Step 4: Verify** — `typecheck:renderer` `0`, `typecheck:gallery` `0`, `pnpm run gallery`
  builds; the grep of Task 16 Step 2 over the whole renderer returns nothing.
- [ ] **Step 5: Commit**

```bash
git add apps/master/src/renderer/api/reports.ts apps/master/gallery/fixtures/reports.ts apps/master/src/renderer/components/reports/MonthlyTable.tsx apps/master/src/renderer/pages/ReportsPage.tsx
git commit -m "feat(renderer): Hisobot's month and range views speak the ledger's words" -m "The month shows Sotuv, Tan narx, Xarajat, Foyda, Chiqim and Kassa per day, so its Foyda can be checked (Money Map issue 12); the range shows Kirim and Chiqim split Naqd/Karta and a cash-only Kassa instead of Farq (money rules D9, D17)."
```

---

### Task 18: Documents and handover

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md` — header `:3-8`; §3 Roles `:155-168`; §5 Finance vocabulary
  `:271-309`; §6 API table `:312-332`; §10 `:483-500`; §11 defects #7 (`:549-551`) and #9
  (`:557-559`); §12 `:600-640`; §13 `:660-672`
- Modify: `docs/superpowers/specs/2026-09-30-money-rules-design.md` §5 (`07-day`, `08-staff-access`,
  `01-bill` bullets) and the status line
- Modify: `CLAUDE.md` (the "Roles" bullet under "Domain rules to respect")
- Modify: this plan (append "Deviations during execution")

**Interfaces:**
- Consumes: Tasks 1–17.
- Produces: documents that match the code.

- [ ] **Step 1: CURRENT_WORKFLOW.md**
  - Header: add "Updated <date> for the money ledger (P3, `feat/money-rules`): §3, §5, §6, §10–§13."
  - §3: ADMIN row — "…expenses, debts, audit read, **Hisobot and profit** (money rules D18, D22)."; OWNER
    row — drop "Only role that can reach `/api/reports/*`"; WAITER row — add "Never receives tan narx or
    food cost: order lines go out through `toClientLine`."
  - §5: after the formula block, add the vocabulary table of this plan's Design ("The words") and:
    "`ledger.money` (`lib/day-money.ts`) is the only place these words are worked out. Screens,
    Telegram, the PDF and Excel read it. **Kassa is cash only**: `kirim.naqd − chiqim.naqd`.
    `drawerMovement` (card included) stays in the DTO for the smokes; nothing shows it." Add the
    `Expense.paymentMethod` paragraph (Naqd default; a REVERSAL copies its original's; Keldi is Naqd;
    an avans return is naqd). Replace "Reports are OWNER-only (`/api/reports/*`). `/api/finance/daily`
    is the ADMIN-safe daily view — but see §11 defect #7." with "`/api/reports/*` and
    `/api/finance/daily` are ADMIN + OWNER; both carry `money`."
  - §6: `/api/reports` → `ADMIN + OWNER`.
  - §10: "Cash drawer disagrees" → "`ledger.money.kassa` (`lib/day-money.ts`); Karta and nasiya are
    never in it — read §5". Add "Bill does not add up → `printer/receipt-builder.ts` `billRows`
    (unit-tested) and `cpp/receipt.cpp`".
  - §11: delete #7 (ADMIN profit is by decision now) and #9 (receipts add up, D19); renumber and
    re-check every `§11 #N` reference in the file.
  - §12: replace "⚠ 'ADMIN cannot see profit totals' → true in the UI only, §11 #7." with
    "❌ 'ADMIN cannot see profit totals' → ADMIN may see profit, tan narx and per-dish Foyda, and opens
    Hisobot (money rules D18, D22)."
  - §13: the unit and e2e counts measured in Step 4, and a dated line listing the defects
    deleted from §11 by this package.
- [ ] **Step 2: money rules §5** — `07-day`: "Built (P3): the controls assert `ledger.money`
  (Chiqim 170 000, Xarajat 40 000, Kassa −40 000, Foyda 52 000) on every surface; `/bugun`'s test reads
  Kirim and the cash-only Kassa." `08-staff-access`: "Built (P3): `[issue 20]` withdrawn for
  `[D18] ADMIN receives the same Foyda`; `[D22] ADMIN opens the whole Hisobot`." `01-bill`: "Built (P3):
  the receipt tests assert the D19 layout, including mixed legs and `Nasiya: <debtor>`." Status line:
  add "P3 (D9, D10, D17, D18, D19, D22) built on `feat/money-rules`".
- [ ] **Step 3: CLAUDE.md** — the Roles bullet: replace "(today it does — Money Map issue 32). The
  owner's Hisobot (`reports.routes.ts`) is still OWNER-only in code." with "(order lines leave the
  server through `toClientLine`). Hisobot is ADMIN + OWNER (D22)."
- [ ] **Step 4: Final verification**

```bash
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master CONTAINER grep -rnE 'localDayKey|parseLocalDay|localDayRange|localMonthRangeFor|isSameLocalDay|localToday|localClockMinutes' src e2e scripts
```

  The last line is P2's retired-helper gate (trading-day plan, Task 7): `e2e/` and `scripts/` are
  outside every tsconfig, so a call to a helper P2 deleted fails only when that test runs. It must
  print nothing.

  Expected: unit = Task 1's + 22 (day-money 5, client-order-line 2, summary-workbook 4, pdf-blocks 5,
  receipt-builder 6; the navigation test is rewritten, not added), five more files; `47`; `0`;
  `0`; the grep prints nothing. e2e (`E2E-DIFF`): flipped to pass — `[issue 2]`, `[issue 9]`, `[issue 10]`, `[issue 32]`;
  rewritten and passing — the 07 second control, `[issue 11]`, `[issue 12]`, `[issue 13]`, the 01
  receipt tests, the 08 access tests; added and passing — the 07 money control, two 07 `[D17]`
  Telegram tests, seven 17 tests, one 10 test, one 01 mixed-legs test; removed — `[issue 20]`,
  `control: ADMIN cannot open the owner report`. Every other line identical to Task 1's list.
- [ ] **Step 5: Commit**

```bash
git add docs/CURRENT_WORKFLOW.md docs/superpowers/specs/2026-09-30-money-rules-design.md CLAUDE.md docs/superpowers/plans/2026-10-02-money-ledger.md
git commit -m "docs: one vocabulary, a cash-only Kassa and the new bill" -m "CURRENT_WORKFLOW, the money rules' e2e list and CLAUDE.md's roles line say what P3 built: ledger.money, Expense.paymentMethod, Hisobot for ADMIN, no food cost to waiters, and the D19 bill."
```

- [ ] **Step 6: Hand over.** Stop at "ready to merge" for the wave. Report the commits, the final
  counts, and the checks owed on the till: print one bill each paid Naqd, Naqd + Karta, and Nasiya
  with the rebuilt `receipt.exe`, one of them with a dish whose name is too long for one line; open Bugun, Kunlik moliya, Chiqimlar and Hisobot at 1236 × 623;
  open `/excel` on the owner's phone.

---

## Open questions

Forwarded to Barkamol. The default is what the plan builds; it does not block the plan.

- **Keldi payments and avans returns have no Naqd/Karta choice.** A paid delivery from Ombor (Keldi)
  records its expense as Naqd, and an avans return is always naqd Kirim (the cash comes back to the
  drawer). Default: both stay Naqd until P4 or a later package adds the choice there.

## Risks

- **Wave 1 moves these files first** (rebase points, not same-wave conflicts): P2 — `reports.service.ts`,
  `finance.service.ts`, `telegram-bot.service.ts`, `pdf-report.ts`, `expense.service.ts` callers and the
  e2e day helpers; P1 — `order.service.ts` (confirm; issue 17's `billSummary` reads each line's `price` and
  `menuItemKind`, which `toClientLine` keeps), `e2e/01-bill.test.ts` (`[issue 17]`),
  `e2e/08-staff-access.test.ts`, `e2e/11-extras.test.ts` `[issue 38]`, possibly `e2e/harness.ts`; P7 — `receipt-builder.ts` and `print.service.ts`
  (`appliedDiscount`/`Discount` gone), `lib/navigation.ts` and its test (Chegirmalar gone),
  `e2e/10-ticket-unit.test.ts`, `OrderTicket.tsx`. Read each before editing it.
- **Wave 3 builds on this**: P4 edits `ExpenseCreateDialog.tsx`, `expense.service.ts`,
  `05-expenses.test.ts`; P6 extends `MoneyParts` (waiter payouts into `chiqim.naqd`, write-offs into
  `xarajat`) and touches `finance.service.ts`. Keep `dayMoney` the single place they add to.
- **`receipt.exe` cannot run here.** It is rebuilt with MinGW in the container and its layout is checked
  through the `RECEIPT_STDOUT` Linux build; a till print is owed. A stale binary given the new arguments
  prints nothing, which PRD 14 G6 turns into `billPrinted: false`, reprintable — no sale is lost.
- **The migration must be an added column.** A Prisma `RedefineTables` would rebuild `Expense`; the plan
  replaces it with the one `ALTER TABLE … ADD COLUMN` so all six indexes stay.
- **Kassa changes meaning on the admin's screens.** On a day with card sales the figure the admin
  called "Kassa o'zgarishi" drops by the card money. That is the point (D9) and matches the drawer, but
  Barkamol should tell the operator before the build reaches the till.
- **Renderer fit at 1236 × 623 is not gated.** Typecheck and the gallery build pass vacuously on layout;
  Bugun's five fields, Kunlik moliya's five-column dish table and the dialog's added block need a look.
- **`Qaytim` still names debt repayments in `DebtPanel.tsx`** (the `Qaytim` head `:86`, `Qaytimlar
  tarixi` `:149`) and `audit-labels.ts` (`Qarz qaytimi qabul qilindi`). They collide with D20 as the
  avans strings did, but this plan's request covered only avans returns; whoever next touches the
  debt screens renames them to `Nasiya to'lovi`.
- **Order DTO shape.** Lines lose `menuItem`; no client in this repo reads it (checked), but a waiter
  build older than this one would simply ignore its absence.
