# Waiter payouts and write-offs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Package:** P6 payouts-writeoffs, wave 3 of `feat/money-rules`. Built beside P4 (expenses) on
> its own branch, after P1, P2, P7 (wave 1) and P3 (wave 2) are merged. P5 (day close) builds on it.

**Goal:** Waiters are paid once a month through a payout record (Ishlagan · Berilgan · Qoldiq), and
a bad debt or a lost avans leaves the books through "Hisobdan chiqarish": a Xarajat line on the day it
is written off, never cash, always an owner message, never twice. A later payment on a written-off
debt is Kirim that day and corrects the write-off day instead.

**Architecture:** One new table (`WaiterPayout`) and one new column (`Debt.writtenOffAmount`). Nothing
stores a balance: Qoldiq, the write-off day's loss and the nasiya ledger are derived on read. The day
ledger gains two inputs — payouts (naqd Chiqim) and write-off losses (Xarajat) — and keeps every
formula it has. A payment on a debt written off on an earlier trading day runs through P4's
day-correction service, which writes the audit row and messages the owner.

**Tech Stack:** Node + Express + Prisma 6.17 on SQLite (one connection, PRD 14 G7), zod 4, vitest 2
(unit: `pnpm test`; e2e: `vitest.e2e.config.ts`), React 19 + TanStack Query + sonner, Blocks C1.

**Spec:** `docs/superpowers/specs/2026-09-30-money-rules-design.md` D14, D16, D24, D25, §3.5, §3.7,
§4 (30). Parent: `docs/superpowers/specs/2026-08-14-money-model-design.md` §2 (`WaiterPayout`), §4.
Slice 1 leftovers: `docs/prd/14-server-money-guards.md` §10 ("For slice 2", D14 items) and the plan's
"Deferred review findings" (the losing concurrent write-off).

---

## Design

### Goal

1. **D16 + D25 — waiter pay.** Every waiter's month on one screen: what they earned (Ishlagan, the
   month's Xizmat haqi), what they were given (Berilgan, the month's payouts), and what is still owed
   (Qoldiq, all time). The admin records each payout or avans when the cash leaves the till. A payout
   is naqd Chiqim: Kassa falls, profit does not move.
2. **D14 — write-offs.** Qarzlar gets "Hisobdan chiqarish" for OWNER and ADMIN. The loss is Xarajat on
   the write-off day; cash is untouched; the owner is messaged with who did it; a debt is written off
   once. An avans write-off books on its write-off day, not the day the avans was given.
3. **D24 — a payment after a write-off.** Accepted however old the debt; Kirim on the day it arrives,
   never that day's profit; the write-off day's loss shrinks by the amount, as a D13 correction with an
   owner message. The rest stays on Qarzlar, payable.
4. **§4 (30) — undoing an open avans leaves profit alone.**

### Decisions covered

| Decision | What this package builds |
|---|---|
| D16 | `WaiterPayout`; `POST /api/finance/waiter-payouts`; payouts in the ledger's naqd Chiqim, never in Xarajat |
| D25 | Maoshlar leads with the month (Ishlagan · Berilgan · Qoldiq); partial payouts, avans and taking cash back all work; the per-day matrix stays, collapsed, below |
| D14 | "Hisobdan chiqarish" on Qarzlar; debt and avans write-offs book Xarajat on the write-off day; every write-off messages the owner with who; no second write-off; `writtenOffAt` stamped inside the transaction |
| D24 | A written-off debt stays WRITTEN_OFF until fully paid; the write-off day's loss is what is still unpaid; a payment on an earlier day's write-off goes through `dayCorrectionService.apply` |
| D17 | Payouts and write-off losses enter the ledger's sums before `dayMoney`, so `money.chiqim`, `money.kassa`, `money.xarajat` and `money.foyda` match `cashflow` and `pnl` on every surface; Chiqimlar's Chiqim tile reads the ledger's `money.chiqim` and lists the day's payouts read-only |
| §4 (30) | An undone open avans contributes nothing to profit or to Kutilayotgan qaytim |
| Slice 1 deferred | e2e test: the losing concurrent write-off answers `DEBT_ALREADY_WRITTEN_OFF` |

### Worked example (money rules §3.5, with this package's numbers)

Karim aka owes 100 000 nasiya from a sale on 5 October.

| When | What happens | 5 Oct | 10 Oct | 25 Oct |
|---|---|---|---|---|
| 10 Oct, admin writes it off | Xarajat +100 000 on 10 Oct; Kassa unchanged; owner messaged | Sotuv 100 000, unchanged | Foyda −100 000 | — |
| 25 Oct, Karim pays 40 000 naqd | Kirim +40 000 on 25 Oct; 10 Oct corrected; owner messaged | unchanged | Xarajat 60 000, Foyda −60 000 | Kassa +40 000, Foyda unchanged |
| Qarzlar after 25 Oct | Karim aka · Hisobdan chiqarildi · Qoldiq 60 000, payable | | | |
| Hisobot "Qarz qoldig'i" | excludes Karim (written off) — Qarzlar' Ochiq/Qisman balances still add up to it | | | |

### What the operator sees

**Maoshlar** (`/salaries`, nav label unchanged; screen title "Xodimlar maoshi"):

- Status bar: `‹` (aria-label "Oldingi oy"), the month as a label ("Oktabr 2026"), `›` (aria-label
  "Keyingi oy", disabled on the current month), "Shu oy". Every button 48 px.
- Summary line (13 px muted, values 17 px): `Ishlagan: 45 000 so'm · Berilgan: 10 000 so'm · Qoldiq (jami): 45 000 so'm`.
- Table, one Row per waiter, columns `Ofitsiant · Ishlagan · Berilgan · Qoldiq (jami)`. A negative
  Qoldiq shows the amount with the sub-line "Ortiqcha berilgan". Footnote (13 px muted):
  `Ishlagan va Berilgan — tanlangan oy uchun. Qoldiq 01.10.2026 dan beri hisoblanadi.`
  Empty: "Bu oyda ofitsiantlar yo'q"; loading: "Yuklanmoqda…".
- The day-by-day matrix (`DailyMatrix`) stays below, collapsed, over the same month.
- Panel, nothing chosen: "Pul berish uchun ofitsiantni tanlang". A waiter chosen: head "Aziz" /
  "Oktabr 2026 · 2 ta buyurtma"; tiles "Ishlagan", "Berilgan", "Qoldiq (jami)"; a two-way toggle
  "Berish" | "Qaytarib olish"; when Qoldiq > 0 a button "Qoldiqni to'liq berish: 25 000"; an input
  "Izoh (ixtiyoriy)"; the Keypad; the history "Shu oydagi to'lovlar" (date, who recorded it, note,
  amount; a taken-back row shows −) or "Bu oyda pul berilmagan". Foot: the amount labelled
  "Beriladi" / "Qaytariladi" and the 66 px button "PUL BERISH" / "QAYTARIB OLISH" ("Saqlanmoqda…"
  while pending).
- Toasts: "Aziz: 10 000 so'm berildi" · "Aziz: 5 000 so'm qaytarib olindi"; on error the server's
  Uzbek message, else "Saqlab bo'lmadi".

**Qarzlar** (`/debts`):

- Status chip and filter: WRITTEN_OFF reads "Hisobdan chiqarildi" (filter "Hisobdan chiqarilgan"),
  never "Yo'qotilgan" and never "To'landi".
- A debt OPEN or PARTIAL shows a 48 px full-width secondary button "Hisobdan chiqarish" above the
  repayment history. It opens a dialog: title "Qarzni hisobdan chiqarish"; description
  "Karim aka · Hisobdan chiqariladigan qoldiq: 100 000 so'm"; notice "Bu summa bugungi Xarajatga
  yoziladi va foydani kamaytiradi. Kassa o'zgarmaydi. Egasiga xabar boradi. Qarzdor keyin to'lasa,
  to'lovni shu yerda qabul qilasiz."; field "Sabab" (placeholder "Masalan: Shahardan ketgan, topib
  bo'lmadi"; under 3 letters: "Sababini kamida 3 ta harf bilan yozing"); buttons "Yopish" /
  "Hisobdan chiqarish" ("Yozilmoqda…"). Success toast: "Qarz hisobdan chiqarildi".
- A written-off debt keeps its repayment keypad (D24). Above the history: "Hisobdan chiqarildi:
  10.10.2026 · 100 000 so'm · Admin" and "Sabab: Shahardan ketgan". Above the confirm button: "Bu
  to'lov bugungi Kirimga tushadi. Hisobdan chiqarilgan kunning zarari shu summaga kamayadi, egasiga
  xabar boradi."
- A debt paid in full after a write-off: chip "Yopilgan", line "Hisobdan chiqarilgan edi:
  10.10.2026". The no-repay notice now reads only "Bu qarz yopilgan — to'lov qabul qilib bo'lmaydi."
- A second write-off answers "Bu qarz allaqachon hisobdan chiqarilgan".

**Chiqimlar** (`/expenses`): the day's Chiqim tile is the ledger's `money.chiqim.jami` (payouts
included), with the note `Naqd … · Karta …` from `money.chiqim`; a search keeps P3's visible-rows sum.
Under the expense list, when the day has payouts and no search is typed, one inert Row per payout:
"Ofitsiantga berildi: Aziz", the note as its sub-line, the amount (a taken-back payout with a minus).
They cannot be selected, reversed or edited here; Maoshlar records them.

**Kunlik moliya** (admin finance screen): two blocks under the expenses —
"Hisobdan chiqarilganlar (Xarajat)" with rows "Nasiya: Karim aka — Shahardan ketgan" /
"Avans: Oshpazga avans — Ishdan ketdi" and "Jami", and "Ofitsiantlarga berildi (naqd Chiqim)" with
rows "Aziz — Avans" and "Jami". Shown only when non-empty.

**Hisobot** nasiya ledger: status chip "Hisobdan chiqarildi", with the still-unpaid written-off
amount as its sub-line; "Jami qaytgan" counts only real payments.

**Owner's Telegram** (no new symbols; the existing debt message keeps its own):

```
❌ <b>Qarz hisobdan chiqarildi</b>
Qarzdor: <b>Karim aka</b>
Summa: <b>100 000</b> so'm
Sabab: Shahardan ketgan
Kim: Admin
```

```
<b>Avans hisobdan chiqarildi</b>
Oshpazga avans
Summa: <b>50 000</b> so'm
Sabab: Ishdan ketdi
Kim: Admin
```

A D24 correction message is P4's format; this package supplies its `what` line:
`Hisobdan chiqarilgan qarz to'landi: Karim aka, 40 000 so'm (25.10.2026)`.

### Server, schema and API

**Schema** (one migration, pinned as `20261004110000_waiter_payouts_and_write_offs` so it sorts after
P4's `20261004100000_stock_entry_cost_before`):

```prisma
model WaiterPayout {                       // money-model §2, unchanged
  id          String   @id @default(cuid())
  waiterId    String
  amount      Decimal                       // whole so'm, never 0; negative = taken back
  paidAt      DateTime
  note        String?
  createdById String
  createdAt   DateTime @default(now())
  waiter      User @relation("WaiterPayoutRecipient", fields: [waiterId], references: [id])
  createdBy   User @relation("WaiterPayoutCreator",  fields: [createdById], references: [id])
  @@index([waiterId])
  @@index([paidAt])
}
model User { payoutsReceived WaiterPayout[] @relation("WaiterPayoutRecipient")
             payoutsRecorded WaiterPayout[] @relation("WaiterPayoutCreator") }
model Debt { writtenOffAmount Decimal? }    // the balance the write-off took
enum AuditAction { WAITER_PAYOUT_RECORDED }
```

The migration also moves every debt that is PARTIAL with `writtenOffAt` set back to WRITTEN_OFF,
backfills `writtenOffAmount`, and inserts the setting `waiter_pay_since` (first day of the current
month) so a till with months of history does not show every past Xizmat haqi as owed.

**API**

| Route | Roles | Body / query | Answer |
|---|---|---|---|
| `GET /api/finance/waiter-pay` | ADMIN, OWNER | `month=YYYY-MM` (optional; the current trading month) | `WaiterPayMonth` (below) |
| `POST /api/finance/waiter-payouts` | ADMIN, OWNER | `{ waiterId, amount: somSigned, note?: string ≤ 200 }` | 201 the payout |
| `POST /api/debts/:id/write-off` | ADMIN, OWNER (exists) | `{ reason }` | 200 the debt; 409 `DEBT_ALREADY_WRITTEN_OFF` on a second |
| `POST /api/expenses/:id/write-off` | ADMIN, OWNER (exists) | `{ reason }` | 200; 409 `EXPENSE_ALREADY_WRITTEN_OFF` on a second |
| `POST /api/debts/:id/repayments` | exists | — | a written-off debt stays WRITTEN_OFF until paid in full |

```ts
type WaiterPayMonth = {
  month: string;            // '2026-10'
  since: string;            // '2026-10-01' — where Qoldiq starts counting
  waiters: Array<{
    waiterId: string; waiterName: string; isActive: boolean;
    orderCount: number;     // closed bills this month
    earned: string;         // Ishlagan — Σ serviceChargeSnapshot, this month
    paid: string;           // Berilgan — Σ payouts, this month (taken-back rows subtract)
    owed: string;           // Qoldiq — Σ earned since `since` − Σ every payout
    payouts: Array<{ id: string; amount: string; paidAt: string; note: string | null; createdByName: string }>;
  }>;
  totals: { orderCount: number; earned: string; paid: string; owed: string };
};
```

`GET /api/debts`, `GET /api/debts/:id` gain `writtenOffAt`, `writtenOffAmount`, `writtenOffReason`,
`writtenOffByName`. The day ledger (`reportsService.dailyLedger`) gains:

```ts
outflow.waiterPayouts: string;     // net payouts this trading day — inside cashflow.cashOut and money.chiqim.naqd
outflow.debtWriteOffs: string;     // Σ remainingAmount of debts written off this day
outflow.avansWriteOffs: string;    // Σ (amount − returned) of avans written off this day
// pnl.operatingExpense (Xarajat) = expense operating + debtWriteOffs + avansWriteOffs,
// summed before profit and before dayMoney, so money.xarajat = pnl.operatingExpense
// and money.foyda = pnl.profit
lines.writeOffs: Array<{ kind: 'NASIYA' | 'AVANS'; id: string; name: string; reason: string;
                         amount: string; writtenOffAt: string; writtenOffByName: string | null }>;
lines.waiterPayouts: Array<{ id: string; waiterName: string; amount: string; paidAt: string;
                             note: string | null; createdByName: string }>;
```

and each `debtLedger` row in `/api/reports/daily` gains `writtenOffAmount` (the part written off and
still unpaid at that day's end), while `totalRepaid` becomes the real repayments only.

### What deliberately stays

- `dailyLedger`'s formulas: `profit = netSales − cogs − Xarajat`, `drawerMovement = realCashIn −
  cashOut`, `cashOut` same-day-reversal aware (not `expenseNet`). This package adds two inputs to
  existing sums; it changes no formula and no grouping.
- Xizmat haqi stays out of Sotuv and out of profit (D1); a payout stays out of Xarajat (money-model §4).
- No stored balance anywhere: Qoldiq, the write-off loss and the ledger rows are derived on read.
- `serviceChargeMatrix` and `GET /api/finance/service-charge` are unchanged; `DailyMatrix` uses them.
- Waiter apps (mobile, order) are untouched and receive nothing new; `/api/finance/*` is ADMIN+OWNER.
- No payout deletion: a mistake is taken back with the opposite amount (money-model §4).
- The repayable-expense machinery (returns, write-off, reversal) keeps its shape; only where its loss
  books and how an undone avans counts change.

### Interfaces with other packages

**From P2 (trading day, wave 1).** `server/lib/time.ts` answers trading-day questions with the 05:00
boundary: `tradingDayOf(at)` → `'YYYY-MM-DD'`, `tradingDayRange(day)` → `{ start, end }`,
`tradingMonthOf(at)` → `'YYYY-MM'`, `tradingMonthRange(month)` → `{ start, end }`. `server/lib/format.ts`
gives `formatDayKeyUZ('2026-10-25')` → `'25.10.2026'`. P2 T7 deletes the calendar helpers
(`localDayKey`, `localDayRangeFor`, `localMonthRangeFor`, …); never call them.

**From P3 (ledger, wave 2).** `dailyLedger` still exposes `cashflow.cashOut`, `cashflow.realCashIn`,
`cashflow.drawerMovement`, `pnl.operatingExpense` (Xarajat) and `pnl.profit`, and adds
`money: DayMoney` from `dayMoney(parts)` (`lib/day-money.ts`), called after `profit`. Its inputs P6
feeds:

- `dailyLedger`: the local `cashOut` (:1224, before `drawerMovement`), the local `cashOutNaqd`
  (declared from `expenseSummary.totals.cashOutNaqd` just before the `dayMoney(...)` call), and the
  local `operatingExpense` (:1226, before `profit` and `dayMoney`).
- `monthly`: `DayAgg.cashOutNaqd` and `DayAgg.operatingExpense`, which `partsOf(agg)` passes to
  `dayMoney`; the day's `cashOut` is derived at :670 (`agg.expenseGross − agg.expenseSameDayReversal`),
  there is no `agg.cashOut` field.
- `summary`: `cashOutTotal` (:944), P3's own local `cashOutNaqd`, and `operatingForPnl` (:987).

P3 keeps `monthly` and `summary` aggregating on their own, so every "monthly/summary" step below is
required, not optional. `expenseService.listByDate(...).totals` (`cashOut`, `cashOutNaqd`) stays
expense-only: payouts never go into it, because `dailyLedger` reads it and would count them twice.

**Contract with P4 (expenses, same wave).** P4 creates the D13 correction service (P4 T3). P6 calls
exactly:

```ts
// apps/master/src/main/server/services/day-correction.service.ts — created by P4
export const dayCorrectionService: {
  apply<T>(input: {
    tradingDay: string;          // the trading day being corrected, 'YYYY-MM-DD'
    actorUserId: string;
    what: string;                // one Uzbek line: what changed and by how much
    entityType: string;          // the changed record's type: 'Debt'
    write: (tx: Prisma.TransactionClient) => Promise<T>;
    entityIdOf?: (result: T) => string;
  }): Promise<{ result: T; before: DaySnapshot; after: DaySnapshot }>;
};
```

Behaviour P6 relies on: serialized with every other correction; snapshots `dailyLedger(tradingDay)`
before, runs `write` in one `$transaction`, snapshots after; then, **after the commit**, writes one
`DAY_CORRECTED` audit row (`entityType: 'TradingDay'`, `entityId: tradingDay`, metadata
`{ tradingDay, what, sourceEntityType, sourceEntityId, before, after }`) and sends the owner one
Telegram message ("O'tgan kun tuzatildi", the day, what, who, Foyda before → after). Never call it from
inside a transaction (one connection, G7). P6 ignores the returned `{ result, before, after }`. Only
Task 7 calls it, and Task 7 runs after P4 is merged into this branch; hand P4's T3 commit over early to
read against. If P4 shipped none, stop and ask — never build a second correction service.

**Provided to P5 (day close, wave 4).**

- `waiterPayService.owedByWaiter(): Promise<Array<{ waiterId: string; waiterName: string; owed: string }>>`
  — P5's source for unpaid waiter Qoldiq (not `serviceChargeMatrix`, which carries no Qoldiq). `owed`
  is a whole-so'm string (`Decimal.toFixed(0)`), non-zero rows only (an over-paid waiter is negative;
  P5 keeps `owed > 0`).
- `WaiterPayPanel` (Task 9) is self-contained — props `{ waiterId; month?; onDone(); onClose() }` — so
  P5's close form can mount it for one waiter to enter a payout before the count.
- Payouts are inside `cashflow.cashOut` and `money.chiqim.naqd` (so `money.kassa`), so `Kutilgan`
  needs nothing extra.
- A write-off moves no cash, so it never changes a day's Kutilgan or Farq; it changes only Xarajat
  and Foyda.
- The write-off day's loss is derived from the debt's current balance: a later payment changes a past
  day's Foyda. P5's closed-day figures must be recomputed, not frozen — the same rule as D13.

---

## Global Constraints

- **Where:** the P6 worktree and branch given at build time (`$WT` below), cut from `feat/money-rules`
  after wave 2. Never commit to `main`, `feat/money-rules` or `feat/auto-update`; never push, merge,
  tag or deploy.
- **Where things run:** only in the container given at build time (`CONTAINER`). Never Electron on the
  Mac, never the host. Every e2e command takes `-e NO_COLOR=1` (the image sets `CI=1`).
- **Floors:** `pnpm typecheck` 47 errors, all pre-existing in `src/main`; `typecheck:renderer` 0;
  `typecheck:gallery` 0. Step 0 records the e2e and `pnpm test` counts after wave 2; no task may raise a
  typecheck count, and no e2e test that passed before a task may fail after it, except the two 06-debts
  tests Task 6 rewrites (named there).
- **Decided values:** a payout is a whole so'm, non-zero, ADMIN/OWNER only, to a WAITER only; a
  negative payout is cash taken back. Qoldiq counts from `waiter_pay_since`. A write-off needs a reason
  of 3+ letters. A debt is written off once, ever (WRITTEN_OFF, or PAID after a write-off, refuse).
  The write-off day's loss = what is still unpaid on that debt now.
- **Money in text:** group with spaces — `formatUZS` on the server, `formatMoney` in the renderer;
  never raw `Intl` uz-UZ (it groups with commas). The printer is untouched.
- **Renderer:** compose Blocks C1 (`components/blocks`, `components/layout/Screen` + `Panel`); touch
  targets 48/56/66 px; type floors 12/13/17 px; no hover-only route; must fit 1236×623. The nav rail is
  not touched.
- **Code rules** (`docs/agent-plans/00-shared/conventions.md`): strict TS, `noUncheckedIndexedAccess`,
  no `any` outside tests; 2-space indent, single quotes, semicolons, trailing commas; Prisma only in
  `repositories/`; `Errors.*` only; every user-facing string in Uzbek (Latin). Never call
  `getPrisma()` inside a `$transaction` callback (one connection — PRD 14 G7).
- **Tests first:** every task writes its failing tests before the code and runs them red.
- **Commits:** conventional, plain, authored as Barkamol. No AI attribution, no `Co-Authored-By`.
  Never commit `apps/master/e2e/.data/`. Never `--no-verify`.

### Gate commands

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+Tests'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'          # 47
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'   # 0
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'    # 0
```

One e2e file: append `e2e/<file>.test.ts`; one test: add `-t "<name fragment>"`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/master/prisma/schema.prisma` | Modify | `WaiterPayout`, `User` relations, `Debt.writtenOffAmount`, `WAITER_PAYOUT_RECORDED` |
| `apps/master/prisma/migrations/20261004110000_waiter_payouts_and_write_offs/migration.sql` | Create | Table, column, data fixes, `waiter_pay_since` |
| `apps/master/src/main/server/lib/money-input.ts` (+ `.test.ts`) | Modify | `somSigned` |
| `apps/master/src/main/server/lib/waiter-pay.ts` (+ `.test.ts`) | Create | `waiterPayRows` — Ishlagan · Berilgan · Qoldiq per waiter |
| `apps/master/src/main/server/lib/expense-contribution.ts` (+ `.test.ts`) | Create | How one expense row counts toward Xarajat and Kutilayotgan qaytim |
| `apps/master/src/main/server/lib/debt-ledger-row.ts` (+ `.test.ts`) | Create | `debtLedgerRow`, `debtStatusAfterRepayment` |
| `apps/master/src/main/server/repositories/waiter-payout.repo.ts` | Create | Payout rows, earned sums |
| `apps/master/src/main/server/services/waiter-pay.service.ts` | Create | Month summary, record a payout, `owedByWaiter`, `payoutsForRange` |
| `apps/master/src/main/server/controllers/waiter-pay.controller.ts` | Create | Two handlers |
| `apps/master/src/main/server/routes/finance.routes.ts` | Modify | Mount them |
| `apps/master/src/main/server/services/write-off.service.ts` | Create | `lossesForRange` — debt and avans write-offs booked in a range |
| `apps/master/src/main/server/repositories/debt.repo.ts` | Modify | `writeOffIfOpen` stamps the amount; `listWrittenOffInRange`; `writtenOffBy` include |
| `apps/master/src/main/server/repositories/expense.repo.ts` | Modify | `reversedExpense` include; `markWrittenOffIfOpen`; `listWrittenOffInRange` |
| `apps/master/src/main/server/services/debt.service.ts` | Modify | Write-off stamps inside; status after repayment; D24 routing |
| `apps/master/src/main/server/services/expense.service.ts` | Modify | Contribution helper; avans write-off claim and alert |
| `apps/master/src/main/server/services/reports.service.ts` | Modify | Ledger inputs (before `dayMoney`); `buildDebtLedger` via `debtLedgerRow`; the same inputs in `monthly` and `summary` |
| `apps/master/src/main/server/services/alert.service.ts` (+ `.test.ts`) | Modify | `debtWriteOff` names who; `avansWriteOff` |
| `apps/master/src/main/server/lib/errors.ts` | Modify | `ExpenseAlreadyWrittenOff`; `DebtAlreadyWrittenOff` wording |
| `apps/master/e2e/20-waiter-pay.test.ts` | Create | Payout money paths |
| `apps/master/e2e/21-write-offs.test.ts` | Create | Write-off and D24 money paths |
| `apps/master/e2e/06-debts.test.ts` | Modify | `[D14]` and the G2 race test follow D24's status |
| `apps/master/src/renderer/lib/waiter-pay-view.ts` (+ `.test.ts`) | Create | Month stepping, labels, signed amount |
| `apps/master/src/renderer/lib/debt-view.ts` (+ `.test.ts`) | Create | Status chip, `canWriteOff`, `canRepay` |
| `apps/master/src/renderer/api/finance.ts`, `api/debts.ts`, `api/reports.ts` | Modify | Types and calls |
| `apps/master/src/renderer/pages/SalariesPage.tsx` | Modify | Month-led screen with the payout panel |
| `apps/master/src/renderer/components/salaries/WaiterPayTable.tsx`, `WaiterPayPanel.tsx` | Create | The table and the self-contained payout panel (P5 mounts it too) |
| `apps/master/src/renderer/components/salaries/WaiterSummaryTable.tsx` | Delete | Replaced by `WaiterPayTable` |
| `apps/master/src/renderer/components/debts/DebtWriteOffDialog.tsx` | Create | The write-off dialog |
| `apps/master/src/renderer/components/debts/DebtPanel.tsx`, `DebtList.tsx`, `pages/DebtsPage.tsx` | Modify | Write-off button, labels, repay on written-off |
| `apps/master/src/renderer/components/reports/report-helpers.tsx`, `DebtSection.tsx` | Modify | WRITTEN_OFF label and sub-line |
| `apps/master/src/renderer/components/finance/WriteOffAndPayoutLines.tsx` | Create | The two Kunlik moliya blocks |
| `apps/master/src/renderer/components/finance/FinanceWorkArea.tsx` | Modify | Mount it (one line) |
| `apps/master/src/renderer/lib/chiqim-tile.ts` (+ `.test.ts`) | Create | Chiqimlar's Chiqim tile from the ledger's `money.chiqim`; the payout row label |
| `apps/master/src/renderer/pages/ExpensesPage.tsx` | Modify | The Chiqim tile reads the ledger; the day's payouts as read-only rows |
| `apps/master/gallery/fixtures/expenses.ts` | Modify | Only if the Chiqimlar mock needs a matching ledger day |
| `apps/master/src/renderer/lib/audit-labels.ts` | Modify | `WAITER_PAYOUT_RECORDED` |
| `apps/master/gallery/fixtures/{finance,debts,reports}.ts` | Modify | Mocks for the new shapes |
| `docs/CURRENT_WORKFLOW.md`, `docs/superpowers/specs/2026-09-30-money-rules-design.md` | Modify | Say what the code now does |

Line numbers below are as found on `fix/server-money-guards` at `cafd82e`. Waves 1–2 may have moved
them; find the cited code by its content.

---

### Task 0: Baseline

- [ ] **Step 1: Regenerate the client and record the floors**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma generate --schema prisma/schema.prisma
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests|FAIL' | sort -u > /tmp/p6-baseline.txt; cat /tmp/p6-baseline.txt
```

(Run the `cat` inside the container if `/tmp` is not shared.) Record the counts in the ledger, and the
four gate numbers. Expected among the failures: `[issue 6]` (08), `[issue 18]` and `[issue 30]` (05),
both `[issue 31]` (06). If any of the five already passes, a wave 1–2 package touched it: read its
diff before Task 3, 5 or 6. No commit.

---

### Task 1: Schema — the payout table and the written-off balance

**Files:**
- Modify: `apps/master/prisma/schema.prisma` (enum `AuditAction` :80-125, `model User` :148-180,
  `model Debt` :494-519; append `model WaiterPayout`)
- Create: `apps/master/prisma/migrations/20261004110000_waiter_payouts_and_write_offs/migration.sql`

A schema-only task: its check is that the migration applies to an empty and to a populated database
and moves no count. Every later task tests what it enables.

- [ ] **Step 1: Edit the schema** as the Design section shows. `User` gains the two relation lists
  after `stockEntries` (:180). `Debt.writtenOffAmount Decimal?` goes after `writtenOffReason` (:507).
  `WAITER_PAYOUT_RECORDED` goes after `ITEM_COST_CHANGED` (:125).

- [ ] **Step 2: Create the migration without applying it**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --name waiter_payouts_and_write_offs --create-only
docker exec -w /app/apps/master CONTAINER bash -lc 'cd prisma/migrations && mv *_waiter_payouts_and_write_offs 20261004110000_waiter_payouts_and_write_offs && ls | tail -3'
```

The rename pins the name so it sorts after P4's `20261004100000_stock_entry_cost_before` whenever
either is built (the cross-plan migration order: P7 `20261002140000`/`20261002150000`, P3
`20261003100000`, P4 `20261004100000`, P6 `20261004110000`, P5 `20261005100000`).

Expected: the folder `20261004110000_waiter_payouts_and_write_offs` with `CREATE TABLE "WaiterPayout"`, its two indexes and two foreign keys, and
`ALTER TABLE "Debt" ADD COLUMN "writtenOffAmount" DECIMAL`. No table rebuild — if Prisma generated
one for `Debt` or `User`, stop: a rebuild must recreate every index the table had
(`Debt_status_idx`, `Debt_openedAt_idx`, `Debt_createdById_idx`, `Debt_debtorName_idx`,
`Debt_orderId_key`).

- [ ] **Step 3: Append the data steps to `migration.sql`**

```sql
-- A written-off debt that a later payment turned PARTIAL stays written off
-- until it is paid in full (money rules D24).
UPDATE "Debt" SET "status" = 'WRITTEN_OFF'
WHERE "writtenOffAt" IS NOT NULL AND "status" = 'PARTIAL';

-- The balance each existing write-off took: what is left plus what was paid
-- since. The audit row holds the exact figure; no screen called the write-off
-- route before this build, so the till is expected to have none.
UPDATE "Debt" SET "writtenOffAmount" = "remainingAmount" + COALESCE((
  SELECT SUM(r."amount") FROM "DebtRepayment" r
  WHERE r."debtId" = "Debt"."id" AND r."paidAt" >= "Debt"."writtenOffAt"), 0)
WHERE "writtenOffAt" IS NOT NULL;

-- Qoldiq counts from the first day of the month this build first runs in;
-- months before it are taken as paid (open question 1). A trading day ends at
-- 05:00 Tashkent (UTC+5), so the trading date is the UTC date.
INSERT OR IGNORE INTO "Setting" ("key", "value", "updatedAt")
VALUES ('waiter_pay_since', strftime('%Y-%m-01', 'now'), CAST(strftime('%s', 'now') AS INTEGER) * 1000);
```

Check the `updatedAt` encoding against a row Prisma wrote: in a migrated, seeded database run
`SELECT typeof("updatedAt"), "updatedAt" FROM "Setting" LIMIT 1` with `sqlite3` inside the container;
if Prisma stored text, write `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` instead.

- [ ] **Step 4: Apply and check**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev
docker exec -w /app/apps/master CONTAINER pnpm exec prisma generate --schema prisma/schema.prisma
docker exec -w /app/apps/master CONTAINER bash -lc 'rm -f /tmp/p6-shadow.db && pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:/tmp/p6-shadow.db --exit-code; echo "diff exit $?"'
```

Expected: `migrate dev` applies `20261004110000_waiter_payouts_and_write_offs` and creates no other
migration; `diff exit 0`. Then the five gate commands. Expected: every count as in Task 0 (the e2e template is migrated fresh by
`e2e/global-setup.ts`, so the suite proves the migration applies to an empty database; the seeded
`dev.db` from `migrate dev` proves it on a populated one).

- [ ] **Step 5: Commit**

```bash
git -C $WT add apps/master/prisma/schema.prisma apps/master/prisma/migrations/20261004110000_waiter_payouts_and_write_offs
git -C $WT commit -m "feat(schema): waiter payouts and the balance a write-off took" -m "WaiterPayout records each payout of Xizmat haqi (money rules D16). Debt.writtenOffAmount keeps what a write-off took, and a written-off debt that was later paid in part goes back to WRITTEN_OFF (D24). waiter_pay_since starts Qoldiq at this month on a till with history."
```

---

### Task 2: Pure pieces — signed so'm and the waiter pay rows

**Files:**
- Modify: `apps/master/src/main/server/lib/money-input.ts`, `money-input.test.ts`
- Create: `apps/master/src/main/server/lib/waiter-pay.ts`, `waiter-pay.test.ts`

**Interfaces — produces:**

```ts
export const somSigned: z.ZodType<number>;   // whole so'm, not 0, may be negative
export type WaiterPayInput = {
  waiters: Array<{ id: string; fullName: string; isActive: boolean }>;
  monthEarned: Map<string, Prisma.Decimal>;  // waiterId → Σ serviceChargeSnapshot this month
  monthPaid: Map<string, Prisma.Decimal>;    // waiterId → Σ payouts this month
  monthOrders: Map<string, number>;
  earnedSince: Map<string, Prisma.Decimal>;  // since waiter_pay_since
  paidAll: Map<string, Prisma.Decimal>;      // every payout ever
};
export function waiterPayRows(input: WaiterPayInput): {
  rows: Array<{ waiterId: string; waiterName: string; isActive: boolean; orderCount: number;
                earned: Prisma.Decimal; paid: Prisma.Decimal; owed: Prisma.Decimal }>;
  totals: { orderCount: number; earned: Prisma.Decimal; paid: Prisma.Decimal; owed: Prisma.Decimal };
};
```

- [ ] **Step 1: Write the failing tests**

`money-input.test.ts`, new `describe('somSigned')`: accepts `10000 → 10000`, `-10000 → -10000`,
`'10000' → 10000`, `'-5000' → -5000`; refuses `0`, `'0'`, `'-0'`, `1000.5`, `'1 000'`, `''`, `'1e5'`,
`2 ** 53`, `'-0123'`.

`waiter-pay.test.ts`, with Aziz (active), Bekzod (active), Sobir (inactive, nothing anywhere) and
Doston (inactive, earned 5 000 since, nothing this month):

- Aziz: month earned 25 000, month paid 10 000, 2 orders, earned since 35 000, paid all 10 000 →
  `{ earned 25000, paid 10000, owed 25000, orderCount 2 }`.
- Bekzod: earned 20 000, nothing paid, 1 order → owed 20 000.
- Sobir is left out; Doston is listed with owed 5 000 and zeros for the month.
- An active waiter with nothing at all is listed with zeros.
- Order: owed descending, then name (`Aziz 25000`, `Bekzod 20000`, `Doston 5000`, then zero rows).
- Totals: orderCount 3, earned 45 000, paid 10 000, owed 50 000.
- An avans beyond what was earned: earned since 10 000, paid all 15 000 → owed −5 000.

- [ ] **Step 2: Run them red**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/money-input.test.ts src/main/server/lib/waiter-pay.test.ts
```

Expected: fails — `somSigned` and `waiter-pay.ts` do not exist.

- [ ] **Step 3: Implement**

```ts
/**
 * A whole so'm amount that is not zero and may be negative: a waiter payout,
 * where a negative amount is cash the waiter gave back (money-model §4 — a
 * mistaken payout is corrected by recording the opposite).
 */
export const somSigned = z.union([
  z.number().int().refine((v) => v !== 0, { message: "Summa 0 bo'lmasligi kerak" }),
  z.string().regex(/^-?[1-9]\d{0,14}$/).transform(Number),
]);
```

`waiterPayRows`: owed = `earnedSince − paidAll`, with missing map entries as 0. A waiter is listed
when active, or when any of owed, month earned, month paid or month orders is non-zero.

- [ ] **Step 4: Run green**, then `pnpm test` and `pnpm typecheck` (47).

- [ ] **Step 5: Commit**

```bash
git -C $WT add apps/master/src/main/server/lib/money-input.ts apps/master/src/main/server/lib/money-input.test.ts apps/master/src/main/server/lib/waiter-pay.ts apps/master/src/main/server/lib/waiter-pay.test.ts
git -C $WT commit -m "feat(finance): signed so'm amounts and the waiter pay rows" -m "somSigned types a payout, where a negative amount is cash taken back. waiterPayRows gives each waiter's Ishlagan and Berilgan for the month and Qoldiq since waiter_pay_since (money rules D25)."
```

---

### Task 3: Record a payout and read a waiter's month

**Files:**
- Create: `apps/master/src/main/server/repositories/waiter-payout.repo.ts`
- Create: `apps/master/src/main/server/services/waiter-pay.service.ts`
- Create: `apps/master/src/main/server/controllers/waiter-pay.controller.ts`
- Modify: `apps/master/src/main/server/routes/finance.routes.ts` (after :11)
- Create: `apps/master/e2e/20-waiter-pay.test.ts`
- Test that turns green: `apps/master/e2e/08-staff-access.test.ts:68-71` `[issue 6]`

**Interfaces — produces:**

```ts
waiterPayoutRepo.create(data: Prisma.WaiterPayoutCreateInput, tx: Tx)
waiterPayoutRepo.listForRange(start: Date, end: Date, waiterId?: string)   // with waiter + createdBy names, paidAt desc
waiterPayoutRepo.sumByWaiter(range?: { start: Date; end: Date })           // Map<waiterId, Decimal>
waiterPayoutRepo.earnedByWaiter(range: { start: Date; end?: Date })        // { earned: Map, orders: Map } from CLOSED orders' serviceChargeSnapshot, by closedAt
waiterPayService.month(month?: string): Promise<WaiterPayMonth>
waiterPayService.recordPayout(input: { waiterId: string; amount: number; note?: string; actorUserId: string }): Promise<Payout>
waiterPayService.owedByWaiter(): Promise<Array<{ waiterId: string; waiterName: string; owed: string }>>   // P5's Qoldiq source; owed whole so'm, non-zero rows
waiterPayService.payoutsForRange(start: Date, end: Date)                   // for the ledger (Task 4)
```

- [ ] **Step 1: Write the failing e2e tests** in `e2e/20-waiter-pay.test.ts`

Setup (`beforeAll`): `setClock(at('2026-09-28T09:00'))`, `boot('waiter-pay')`, `buildWorld`; set
`waiter_pay_since` to `2026-09-01` with
`env.prisma.setting.upsert({ where: { key: 'waiter_pay_since' }, update: { value: '2026-09-01' }, create: { key: 'waiter_pay_since', value: '2026-09-01' } })`
then `await env.svc.settings.loadAll()`. Sales (Xizmat haqi is 5 000 a portion):

| Clock | Waiter | Lines | Payment | Xizmat haqi |
|---|---|---|---|---|
| 2026-09-28 12:00 | Aziz | osh 1, xizmat 2 | CASH 55 000 | 10 000 (September) |
| 2026-10-01 12:00 | Aziz | osh 1, xizmat 2 | CASH 55 000 | 10 000 |
| 2026-10-01 13:00 | Bekzod | osh 1, xizmat 4 | CARD 65 000 | 20 000 |
| 2026-10-05 12:00 | Aziz | osh 1, xizmat 3 | CASH 60 000 | 15 000 |

(`w.relogin()` after each change of day.) Tests, in order:

1. `[issue 6][D16] a payout of Xizmat haqi to a waiter is recorded` — at 2026-10-05 18:00
   `POST /api/finance/waiter-payouts { waiterId: Aziz, amount: 10000, note: 'Avans' }` → 201,
   `{ amount: '10000', note: 'Avans', waiterName: 'Aziz' }`, one `WAITER_PAYOUT_RECORDED` audit row with
   `{ waiterId, amount: '10000' }`.
2. `[D25] Maoshlar gives each waiter's month: Ishlagan · Berilgan · Qoldiq` —
   `GET /api/finance/waiter-pay?month=2026-10` → by name
   `Aziz { orderCount 2, earned 25000, paid 10000, owed 25000 }` (10 000 September + 25 000 October −
   10 000), `Bekzod { orderCount 1, earned 20000, paid 0, owed 20000 }`; totals
   `{ orderCount 3, earned 45000, paid 10000, owed 45000 }`; `since: '2026-09-01'`; Aziz's `payouts`
   has the one row. `month=2026-09` → Aziz `{ earned 10000, paid 0, owed 25000 }`.
3. `[D16] partial payouts and an avans beyond what was earned both work` — at 2026-10-31 20:00 pay Aziz
   15 000, then 20 000 → `month=2026-10` Aziz `{ paid 45000, owed -10000 }`.
4. `[D16] cash taken back is a negative payout` — at 2026-10-31 20:30 pay Aziz −10 000, note
   `Qaytarib oldi` → 201; Aziz `{ paid 35000, owed 0 }`.
5. `[D11] a payout at 03:00 on 1 November belongs to October` — `setClock(at('2026-11-01T03:00'))`,
   pay Bekzod 20 000 → `month=2026-10` Bekzod `{ paid 20000, owed 0 }`; `month=2026-11` Bekzod
   `{ paid 0 }`.
6. `[PRD 14 G3] a payout is whole so'm, not zero, and only to a waiter` — amounts `0`, `1000.5`,
   `'1 000'` → 400 `VALIDATION`; `waiterId: 'seed-admin'` → 400 with message "Maosh faqat ofitsiantga
   beriladi"; an unknown id → 404; `WaiterPayout` count unchanged.
7. `[D18] a waiter can neither read nor record payouts` — `w.w1` GET `waiter-pay` → 403; POST → 403.

- [ ] **Step 2: Run red**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/20-waiter-pay.test.ts e2e/08-staff-access.test.ts -t "issue 6|D16|D25|D11|G3|D18"
```

Expected: every test in file 20 fails (404 on the routes); `[issue 6]` fails.

- [ ] **Step 3: Implement**

- Repository: only Prisma here. `earnedByWaiter` is a `groupBy` on `order` by `waiterId` where
  `status: CLOSED, closedAt: { gte: start, lt: end }`, summing `serviceChargeSnapshot` and counting.
- Service `month(month)`: `month ?? tradingMonthOf()`; range = `tradingMonthRange(month)`;
  `since = settingsService.get('waiter_pay_since') || '2000-01-01'`; since start =
  `tradingDayRange(since).start`; waiters = `userRepo.findByRole('WAITER')` (inactive included);
  run the five reads in `Promise.all`, feed `waiterPayRows`, attach each waiter's month payouts.
- Service `owedByWaiter()`: the same `since` and waiters, `earnedByWaiter({ start: since start })`
  and `sumByWaiter()`, through `waiterPayRows`; return the rows whose `owed` is non-zero as
  `{ waiterId, waiterName, owed: owed.toFixed(0) }`. Add one assertion to test 2:
  `owedByWaiter()` (dynamic `import('../src/main/server/services/waiter-pay.service')` after `boot`,
  as P4's 19-day-correction test does) gives Aziz `'25000'` and Bekzod `'20000'`.
- Service `recordPayout`: load the user; none → `Errors.NotFound('Waiter')`; not a WAITER →
  `Errors.Validation('Maosh faqat ofitsiantga beriladi')`. One `$transaction`: create the row
  (`paidAt: new Date()` taken inside the callback, `note` trimmed or null) and the
  `WAITER_PAYOUT_RECORDED` audit row `{ waiterId, waiterName, amount, note, paidAt }`. Return the row
  with names. No alert.
- Controller: `z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() })` and
  `z.object({ waiterId: z.string().min(1), amount: somSigned, note: z.string().trim().max(200).optional() })`;
  POST answers 201.
- Routes: `financeRouter.get('/waiter-pay', waiterPayController.month);`
  `financeRouter.post('/waiter-payouts', waiterPayController.recordPayout);` — the router already
  requires ADMIN or OWNER (`finance.routes.ts:8`).

- [ ] **Step 4: Run green** (same command). Expected: 7 + 1 passed. Then the full gates: e2e failures
  drop by exactly 1 (`[issue 6]`) with 7 new passes; `pnpm test`, typecheck 47 / 0 / 0.

- [ ] **Step 5: Commit**

```bash
git -C $WT add apps/master/src/main/server/repositories/waiter-payout.repo.ts apps/master/src/main/server/services/waiter-pay.service.ts apps/master/src/main/server/controllers/waiter-pay.controller.ts apps/master/src/main/server/routes/finance.routes.ts apps/master/e2e/20-waiter-pay.test.ts
git -C $WT commit -m "feat(finance): record waiter payouts and read each waiter's month" -m "POST /api/finance/waiter-payouts records a payout or, with a negative amount, cash taken back. GET /api/finance/waiter-pay gives Ishlagan and Berilgan for the month and Qoldiq since waiter_pay_since (money rules D16, D25)."
```

---

### Task 4: A payout is naqd Chiqim, never Xarajat

**Files:**
- Modify: `apps/master/src/main/server/services/reports.service.ts` — `dailyLedger` (:1075-1376:
  the `Promise.all` :1081-1146, `cashOut` :1224, `drawerMovement` :1225, P3's `cashOutNaqd` before
  `dayMoney(...)`, `outflow` :1306-1315, `lines` :1349-1374); `monthly` (`DayAgg` :486-503,
  `emptyAgg`, the day's `cashOut` :670, P3's `partsOf`) and `summary` (`cashOutTotal` :944, P3's
  `cashOutNaqd`, `cashFarq` :1000) — required: P3 keeps both aggregating on their own
- Modify: `apps/master/src/renderer/api/reports.ts` (`DailyLedger`), `apps/master/gallery/fixtures/reports.ts`
  (the two new fields, so `typecheck:gallery` stays 0)
- Modify: `apps/master/e2e/20-waiter-pay.test.ts`

- [ ] **Step 1: Write the failing tests** (append to file 20; they run after test 4, before test 5)

8. `[D16] a payout lowers Kassa and leaves Xarajat and Foyda alone` — around an Aziz payout of 5 000
   at 2026-10-31 21:00 (Aziz, so test 5's Bekzod figures do not move): `ledger('2026-10-31')` changes by `cashOut +5000`, `drawerMovement −5000`,
   `money.chiqim.naqd +5000`, `money.chiqim.jami +5000`, `money.kassa −5000`, `money.xarajat 0`,
   `money.foyda 0`, `pnl.operatingExpense 0`, `pnl.profit 0`, `realCashIn 0`;
   `outflow.waiterPayouts` is `'30000'` (15 000 + 20 000 − 10 000 + 5 000); `lines.waiterPayouts` has 4
   rows.
9. `control: the day, the month and the period agree on a payout day` — for 2026-10-31,
   `moneyWords` (P3's harness helper) of owner `/api/reports/daily` `ledger.money`, admin
   `/api/finance/daily` `ledger.money`, `/api/reports/monthly?month=2026-10` that day's row `.money` and
   `/api/reports/summary?from=2026-10-31&to=2026-10-31` `.money` are all equal; admin
   `drawer.movement` equals `money.kassa`; the day row's `results.cashflowBasedNet` and the summary's
   `cash.farq` equal `ledger.cashflow.drawerMovement` (no card that day); the four profits are equal.

Run red: `-t "lowers Kassa|payout day"`. Expected: cashOut change 0, not 5 000.

- [ ] **Step 2: Implement** — in `dailyLedger`, add `waiterPayService.payoutsForRange(dayStart, dayEnd)`
  to the `Promise.all`, then:

```ts
    // A waiter payout is cash out of the till (money rules D16): Chiqim, naqd,
    // never Xarajat — Xizmat haqi never entered Sotuv, so paying it out must not
    // leave profit either (money-model §4). Negative rows are cash taken back.
    const waiterPayouts = payouts.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const cashOut = new Prisma.Decimal(expenseSummary.totals.cashOut).plus(waiterPayouts);
    const drawerMovement = realCashIn.minus(cashOut);
```

  `cashOut` is declared here, before `drawerMovement`, which keeps its formula. Replace P3's
  declaration of the local `cashOutNaqd` (just before `dayMoney(...)`) with
  `const cashOutNaqd = new Prisma.Decimal(expenseSummary.totals.cashOutNaqd).plus(waiterPayouts);`,
  so `money.chiqim` and `money.kassa` carry the payouts too. Never add payouts to
  `expenseService.listByDate(...).totals`: `dailyLedger` reads those and would count them twice. Emit
  `outflow.waiterPayouts` and `lines.waiterPayouts`. `finance.service.ts:94, 110` reads
  `ledger.cashflow.cashOut` (and P3 points `drawer.movement` at `money.kassa`), so the admin drawer
  follows; confirm no other surface computes its own cash-out (grep `totals.cashOut`) and point any that
  does at the ledger — Chiqimlar's tile is Task 10b's.

  `monthly` (required): add `waiterPayouts: Prisma.Decimal` to `DayAgg` and `emptyAgg`; fetch
  `payoutsForRange(monthStart, monthEnd)` with the other reads; for each row,
  `const agg = getDay(tradingDayOf(p.paidAt))`, then `agg.waiterPayouts = agg.waiterPayouts.plus(p.amount)`
  and `agg.cashOutNaqd = agg.cashOutNaqd.plus(p.amount)` (so `partsOf(agg)` and the roll-up's
  `cashOutNaqd` carry it). The day's `cashOut` (:670) becomes
  `agg.expenseGross.minus(agg.expenseSameDayReversal).plus(agg.waiterPayouts)`, so `cashflowNet`
  and the month's `cashflowBasedNet` follow.

  `summary` (required): fetch `payoutsForRange` over the summary's range once; add the net sum to
  `cashOutTotal` and to P3's local `cashOutNaqd` after the expense loop, before `cashFarq` (:1000) and
  the `dayMoney(...)` call.

- [ ] **Step 3: Run green**, then the full gates (2 more passes; typecheck 47 / 0 / 0).

- [ ] **Step 4: Commit**

```bash
git -C $WT add apps/master/src/main/server/services/reports.service.ts apps/master/src/renderer/api/reports.ts apps/master/gallery/fixtures/reports.ts apps/master/e2e/20-waiter-pay.test.ts
git -C $WT commit -m "feat(ledger): a waiter payout is naqd Chiqim, never Xarajat" -m "Payouts join the day's cash out, so Kassa and the drawer fall by them while Xarajat and Foyda do not move (money rules D16, money-model §4)."
```

---

### Task 5: Avans — the write-off books on its own day, an undone avans counts for nothing

**Files:**
- Create: `apps/master/src/main/server/lib/expense-contribution.ts`, `expense-contribution.test.ts`
- Create: `apps/master/src/main/server/services/write-off.service.ts`
- Modify: `apps/master/src/main/server/repositories/expense.repo.ts` (`listForDate` include :71-85;
  `markWrittenOff` :99-112; add `listWrittenOffInRange`)
- Modify: `apps/master/src/main/server/services/expense.service.ts` (operating loop :115-150;
  `writeOff` :352-403)
- Modify: `apps/master/src/main/server/services/reports.service.ts` (`dailyLedger` operating :1226,
  profit :1268, P3's `dayMoney(...)` after it; `monthly` expense loop :580-608 and `summary` expense
  loop :947-958 and `operatingForPnl` :987 — required, P3 keeps both separate)
- Modify: `apps/master/src/main/server/services/alert.service.ts` (+ `alert.service.test.ts`)
- Modify: `apps/master/src/main/server/lib/errors.ts` (after :52)
- Create: `apps/master/e2e/21-write-offs.test.ts`
- Tests that turn green: `05-expenses.test.ts:70-80` `[issue 30]`, `:105-116` `[issue 18]`

**Interfaces — produces:**

```ts
export type ExpenseRowForPnl = {
  status: 'ACTIVE' | 'REVERSED' | 'REVERSAL';
  amount: Prisma.Decimal;
  repayable: boolean;
  writtenOffAt: Date | null;
  returnedTotal: Prisma.Decimal;
  original: { repayable: boolean } | null;    // REVERSAL rows: the row they undo
};
export function expenseContribution(row: ExpenseRowForPnl): { operating: Prisma.Decimal; pending: Prisma.Decimal };
writeOffService.lossesForRange(start: Date, end: Date): Promise<Array<{
  kind: 'NASIYA' | 'AVANS'; id: string; name: string; reason: string;
  amount: Prisma.Decimal; writtenOffAt: Date; writtenOffByName: string | null }>>;
alertService.avansWriteOff(p: { reason: string; amount: string | number; writeOffReason: string; actorName: string }): Promise<void>;
Errors.ExpenseAlreadyWrittenOff(): AppError   // 409 'EXPENSE_ALREADY_WRITTEN_OFF', "Bu avans allaqachon hisobdan chiqarilgan"
```

`lossesForRange` returns AVANS rows in this task; Task 6 adds the NASIYA rows.

- [ ] **Step 1: Write the failing unit tests** — `expense-contribution.test.ts`:

| Row | operating | pending |
|---|---|---|
| ACTIVE, not repayable, 40 000 | 40 000 | 0 |
| REVERSED, not repayable, 20 000 | 20 000 | 0 |
| REVERSAL of a not-repayable, 20 000 | −20 000 | 0 |
| ACTIVE avans 50 000, 20 000 returned | 0 | 30 000 |
| ACTIVE avans 100 000, written off | 0 | 0 |
| REVERSED avans 50 000 (undone, §4 (30)) | 0 | 0 |
| REVERSAL of an avans, 50 000 | 0 | 0 |
| REVERSAL whose original is unknown (`null`), 20 000 | −20 000 | 0 |

`alert.service.test.ts`: `avansWriteOff({ reason: 'Oshpazga avans', amount: 50000, writeOffReason:
'Ishdan ketdi', actorName: 'Admin' })` sends text containing `Avans hisobdan chiqarildi`,
`Oshpazga avans`, `50 000`, `Ishdan ketdi`, `Kim: Admin`.

- [ ] **Step 2: Write the failing e2e tests** in `e2e/21-write-offs.test.ts`

Setup: `S = '2026-10-05'`, `W = '2026-10-10'`, `P = '2026-10-25'`; `boot('write-offs')`,
`buildWorld`; spy `alertService.avansWriteOff` and `alertService.debtWriteOff` with
`vi.spyOn(...).mockImplementation(async () => {})`. At S 14:00 the admin gives two avans:
`Oshpazga avans` 70 000 (20 000 returned at S 15:00) and `Bozorchiga avans` 30 000.

1. `[D14] an avans written off on a later day books its loss that day, not the day it was given` — at
   W 11:00, around writing off `Oshpazga avans` (reason `Ishdan ketdi`): `ledger(S)` Xarajat and
   Foyda unchanged; `ledger(W)` Xarajat +50 000, Foyda −50 000, `cashOut` 0, `drawerMovement` 0;
   `outflow.avansWriteOffs` `'50000'`; `lines.writeOffs` holds
   `{ kind: 'AVANS', name: 'Oshpazga avans', amount: '50000', reason: 'Ishdan ketdi' }`;
   `ledger(W).money.foyda` equals `ledger(W).pnl.profit` and `money.xarajat` equals
   `pnl.operatingExpense` (D17: the loss enters before both are computed).
2. `[D14] an avans write-off messages the owner, naming who` — the spy got
   `{ reason: 'Oshpazga avans', amount: '50000', writeOffReason: 'Ishdan ketdi', actorName: 'Admin' }`.
3. `[D14] two write-offs of one avans at the same moment: one lands` — `Bozorchiga avans`, two
   simultaneous write-offs → statuses `[200, 409]`, the 409 code `EXPENSE_ALREADY_WRITTEN_OFF`; one
   `EXPENSE_WRITTEN_OFF` audit row; one alert; `ledger(W)` Xarajat rose 30 000, not 60 000.

Run red (both files):

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/expense-contribution.test.ts src/main/server/services/alert.service.test.ts
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/21-write-offs.test.ts e2e/05-expenses.test.ts -t "avans|issue 18|issue 30"
```

Expected: unit tests fail (no module, no method); e2e 1–3 fail; `[issue 18]` fails with
`d1ProfitChange: -100000`; `[issue 30]` fails with `chiqimChange: -50000`.

- [ ] **Step 3: Implement**

`expense-contribution.ts` — the one place the per-row rule lives:

```ts
export function expenseContribution(row: ExpenseRowForPnl) {
  const zero = new Prisma.Decimal(0);
  if (row.status === 'REVERSAL') {
    // Undoing an avans undoes a receivable, never an expense: it must not
    // lower Xarajat (money rules §4 (30)). Undoing an ordinary expense does.
    return { operating: row.original?.repayable ? zero : row.amount.negated(), pending: zero };
  }
  if (!row.repayable) return { operating: row.amount, pending: zero };
  // An avans is owed back, not spent. Once undone (REVERSED) it is nothing;
  // once written off, its loss books on the write-off day (D14), through
  // writeOffService — never on the day it was given.
  if (row.status === 'REVERSED' || row.writtenOffAt) return { operating: zero, pending: zero };
  return { operating: zero, pending: row.amount.minus(row.returnedTotal) };
}
```

- `expense.repo.ts`: `listForDate` includes `reversedExpense: { select: { repayable: true } }`; so do
  the `monthly` and `summary` expense queries in `reports.service.ts` (a REVERSAL whose original lies
  outside the range must still know it undid an avans). Replace `markWrittenOff` with
  `markWrittenOffIfOpen(id, { writtenOffById, writtenOffReason, writtenOffAt }, tx): Promise<boolean>`
  — `updateMany` where `{ id, repayable: true, writtenOffAt: null, status: ACTIVE }`, count must be 1.
  Add `listWrittenOffInRange(start, end)`: `repayable: true, status: ACTIVE, writtenOffAt` in range,
  with `returns` and `writtenOffBy { fullName }`.
- `expense.service.ts` `listByDate`: replace the operating/pending branches (:130-150) with
  `expenseContribution(...)`; the cash branches (:121-128, :152-164) stay exactly as they are.
- `expense.service.ts` `writeOff`: keep the pre-checks (:357-370) but answer a written-off one with
  `Errors.ExpenseAlreadyWrittenOff()`. Inside the transaction: `writtenOffAt = new Date()`; re-read
  the expense with `tx`; claim with `markWrittenOffIfOpen` (false → `ExpenseAlreadyWrittenOff`);
  compute `returned` and `lossAmount` from the re-read (:382-386 read them from before the
  transaction); write the audit row. After the commit:
  `void alertService.avansWriteOff({ reason, amount: lossAmount.toFixed(0), writeOffReason, actorName })`
  with the actor's `fullName` from `userRepo.findById`.
- `write-off.service.ts` `lossesForRange`: AVANS rows from `expenseRepo.listWrittenOffInRange`,
  amount `amount − Σ returns`, floored at 0.
- `reports.service.ts` `dailyLedger`: add `writeOffService.lossesForRange(dayStart, dayEnd)` to the
  `Promise.all`; `avansWriteOffs = Σ AVANS`; at the declaration (:1226)
  `const operatingExpense = new Prisma.Decimal(operatingExpenseSummary.totals.operating).plus(avansWriteOffs);`
  (Task 6 adds the debts) — before `profit` (:1268) and before P3's `dayMoney(...)`, so
  `pnl.profit` and `money.foyda` (and `pnl.operatingExpense` and `money.xarajat`) agree. Emit
  `outflow.avansWriteOffs` and `lines.writeOffs`. `profit` keeps its formula.
- `monthly` (required): the operating branches of the expense loop (:586-608) use
  `expenseContribution` (the ingredient-category exclusion and the cash fields stay as P3 left them);
  fetch `lossesForRange(monthStart, monthEnd)` once and add each loss to
  `getDay(tradingDayOf(loss.writtenOffAt)).operatingExpense` — the `DayAgg` field `partsOf` passes to
  `dayMoney` as `operatingExpense`, and the one the day's `profit` (:678) and the roll-up read.
- `summary` (required): the operating side of the expense loop (:947-958) uses `expenseContribution`;
  fetch `lossesForRange` over the range once and add their sum `writeOffLoss` at the declaration,
  `const operatingForPnl = operatingTotalAll.minus(operatingExclIngredients).plus(writeOffLoss);` (:987),
  before `pnlProfit` (:993) and P3's `dayMoney(...)`.

- [ ] **Step 4: Run green** (both commands). Then the full gates: `[issue 18]` and `[issue 30]` flip,
  3 new e2e passes; extend Task 4's "four surfaces agree" check in file 21 for W:

4. `control: the day, the month and the period agree on the write-off day` — as Task 4 test 9, for W.

- [ ] **Step 5: Commit**

```bash
git -C $WT add apps/master/src/main/server/lib/expense-contribution.ts apps/master/src/main/server/lib/expense-contribution.test.ts apps/master/src/main/server/services/write-off.service.ts apps/master/src/main/server/repositories/expense.repo.ts apps/master/src/main/server/services/expense.service.ts apps/master/src/main/server/services/reports.service.ts apps/master/src/main/server/services/alert.service.ts apps/master/src/main/server/services/alert.service.test.ts apps/master/src/main/server/lib/errors.ts apps/master/src/renderer/api/reports.ts apps/master/gallery/fixtures/reports.ts apps/master/e2e/21-write-offs.test.ts
git -C $WT commit -m "fix(expenses): an avans write-off books on its own day, an undone avans on none" -m "The loss of a written-off avans moves from the day it was given to the day it was written off, the owner is messaged and a second write-off is refused (money rules D14). Undoing an open avans no longer lowers Xarajat or leaves it in Kutilayotgan qaytim (§4, issue 30)."
```

---

### Task 6: Debt write-off — Xarajat on its day, once, and a balance still payable

**Files:**
- Create: `apps/master/src/main/server/lib/debt-ledger-row.ts`, `debt-ledger-row.test.ts`
- Modify: `apps/master/src/main/server/repositories/debt.repo.ts` (`findById` include :20-45;
  `writeOffIfOpen` :256-272; add `listWrittenOffInRange`)
- Modify: `apps/master/src/main/server/services/debt.service.ts` (`mapDebt` :14-54, `list` :99-117,
  repayment status :179-191, `writeOff` :224-296)
- Modify: `apps/master/src/main/server/services/write-off.service.ts`, `reports.service.ts`
  (`buildDebtLedger` :188-245, `dailyLedger`, `monthly`, `summary`), `alert.service.ts` (`debtWriteOff` :108-121, + test),
  `errors.ts` (:51-52)
- Modify: `apps/master/e2e/06-debts.test.ts` (:148-158, :167-184), `apps/master/e2e/21-write-offs.test.ts`
- Tests that turn green: `06-debts.test.ts:87-97` and `:99-103` (`[issue 31]` ×2)

**Interfaces — produces:**

```ts
export function debtStatusAfterRepayment(p: { remaining: Prisma.Decimal; writtenOff: boolean }): DebtStatus;
export function debtLedgerRow(
  debt: { originalAmount: Prisma.Decimal; writtenOffAt: Date | null;
          repayments: Array<{ amount: Prisma.Decimal; paidAt: Date }> },
  dayStart: Date, dayEnd: Date,
): { repaidToday: Prisma.Decimal; totalRepaid: Prisma.Decimal; remaining: Prisma.Decimal;
     writtenOff: Prisma.Decimal; status: 'OPEN' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF' };
debtRepo.listWrittenOffInRange(start: Date, end: Date)   // writtenOffAt in range, with writtenOffBy name
alertService.debtWriteOff(p: { debtorName: string; amount: string | number; reason: string; actorName: string })
```

- [ ] **Step 1: Write the failing unit tests** — `debt-ledger-row.test.ts`:

`debtStatusAfterRepayment`: `(0, false) → PAID`, `(40000, false) → PARTIAL`, `(40000, true) →
WRITTEN_OFF`, `(0, true) → PAID`.

`debtLedgerRow`, for Karim aka (100 000, written off 10.10 11:00, paid 40 000 on 25.10 and 60 000 on
26.10), viewed for the trading day of:

| Day | repaidToday | totalRepaid | remaining | writtenOff | status |
|---|---|---|---|---|---|
| 05.10 (opened) | 0 | 0 | 100 000 | 0 | OPEN |
| 10.10 | 0 | 0 | 0 | 100 000 | WRITTEN_OFF |
| 25.10 | 40 000 | 40 000 | 0 | 60 000 | WRITTEN_OFF |
| 26.10 | 60 000 | 100 000 | 0 | 0 | WRITTEN_OFF |

and a debt never written off, 45 000 with 5 000 paid → `{ totalRepaid 5000, remaining 40000,
writtenOff 0, status PARTIAL }`.

`alert.service.test.ts`: `debtWriteOff({ debtorName: 'Karim aka', amount: 100000, reason:
'Shahardan ketgan', actorName: 'Admin' })` sends text containing `Qarz hisobdan chiqarildi`,
`100 000`, `Kim: Admin`.

- [ ] **Step 2: Write the failing e2e tests** — append to file 21. Setup additions (in `beforeAll`, at
  S 10:00), DEBT sales: Karim aka 100 000 (osh 2, choy 2), Salim aka 60 000 (osh 1, choy 3),
  `Juft` 45 000 (osh 1), `Ikki marta` 45 000 (osh 1).

5. `[D14][issue 31] a debt write-off is Xarajat on the write-off day and leaves the cash alone` — at
   W 12:00, around writing off Karim (admin, `Shahardan ketgan`): `ledger(W)` Xarajat +100 000, Foyda
   −100 000, `realCashIn` 0, `cashOut` 0, `drawerMovement` 0, `money.kassa` 0; `ledger(S)` unchanged;
   `outflow.debtWriteOffs` `'100000'`; with both an avans and a debt loss on W,
   `ledger(W).money.foyda` equals `ledger(W).pnl.profit` and `money.xarajat` equals
   `pnl.operatingExpense`.
6. `[D14] every write-off messages the owner, naming who` — Salim written off by the **owner** at
   W 12:30 → the spy got `{ debtorName: 'Salim aka', amount: '60000', reason: 'Shahardan ketgan',
   actorName: 'Owner' }`.
7. `[D14] Qarzlar keeps a written-off debt as hisobdan chiqarildi with its balance payable` —
   `GET /api/debts` row Karim `{ status: 'WRITTEN_OFF', remainingAmount: '100000' }` with
   `writtenOffAt` set; `GET /api/debts/:id` `writtenOffAmount '100000'`, `writtenOffByName 'Admin'`.
8. `[PRD 14 deferred] two write-offs of one debt at the same moment: one lands, the other is
   DEBT_ALREADY_WRITTEN_OFF` — `Juft`, two at once → `[200, 409]`, code
   `DEBT_ALREADY_WRITTEN_OFF`; one `DEBT_WRITTEN_OFF` audit row; one alert; `ledger(W)` Xarajat rose
   45 000, not 90 000.
9. `[D14] a debt written off, then partly paid, cannot be written off again` — `Ikki marta` written off
   at W 13:00; at P 10:00 (`relogin`) paid 5 000 naqd → `WRITTEN_OFF`, 40 000 left; a second write-off
   → 409 `DEBT_ALREADY_WRITTEN_OFF`; `writtenOffAt` unchanged; still one audit row.
10. `[D14] the nasiya ledger shows hisobdan chiqarildi, never to'landi` — owner
   `/api/reports/daily?date=W`: Salim `{ status: 'WRITTEN_OFF', totalRepaid: '0', remainingAmount: '0',
   writtenOffAmount: '60000' }`.
10a. `control: the day, the month and the period agree on the write-off day, with debts` — as Task 4
   test 9, for W, now holding avans and debt losses: the four `moneyWords` equal, the four profits
   equal, `money.xarajat` equal to `pnl.operatingExpense`.

Rewrite in `06-debts.test.ts` (both pass today; they encode the status D24 replaces):

- `:167` → `[D14][D24] a payment on a written-off debt is accepted, keeps it written off until paid in
  full, and is money in that day`, expecting
  `seen: ['5000: HTTP 201, WRITTEN_OFF, 40000 left', '40000: HTTP 201, PAID, 0 left'], moneyIn: 45000`.
- `:148-150` → the comment says a payment after the write-off keeps the debt WRITTEN_OFF until paid in
  full, and `heldAtWriteOff = after.writtenOffAmount === null ? null : n(after.writtenOffAmount)`. Add
  the problem check: `after.writtenOffAt && left > 0 && after.status !== 'WRITTEN_OFF'` →
  `written off with ${left} left, yet ${after.status}`. The other checks stay.

Run red:

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/debt-ledger-row.test.ts src/main/server/services/alert.service.test.ts
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/21-write-offs.test.ts e2e/06-debts.test.ts
```

Expected: new unit tests fail; e2e 5, 6, 7, 9, 10 fail; 8 passes already (the slice 1 behaviour it
pins — keep it); 10a passes already (no surface sees a debt loss yet) and must still pass once all four do; both `[issue 31]` fail; the rewritten `[D14]` fails with `PARTIAL`; the race test
fails on `writtenOffAmount` being null.

- [ ] **Step 3: Implement**

- `debt-ledger-row.ts` as specified; `totalRepaid` is the repayments up to the day's end — never
  `original − remaining` (the `[issue 31]` bug, `reports.service.ts:205`).
- `buildDebtLedger` (:188-245) maps each debt through `debtLedgerRow`, keeps its fields, adds
  `writtenOffAmount`, and keeps a row when `writtenOff` is non-zero.
- `debt.repo.ts`: `findById` includes `writtenOffBy: { select: { id: true, fullName: true } }`;
  `writeOffIfOpen` takes and sets `writtenOffAmount` and adds `writtenOffAt: null` to its `where`;
  `listWrittenOffInRange(start, end)`: `writtenOffAt` in range (any status), selecting `id`,
  `debtorName`, `remainingAmount`, `writtenOffReason`, `writtenOffAt`, `writtenOffBy.fullName`.
- `debt.service.ts` `writeOff`:

```ts
    if (debt.writtenOffAt) {
      // WRITTEN_OFF, or PAID after a write-off: a debt is written off once (D14).
      throw Errors.DebtAlreadyWrittenOff();
    }
    // … the existing status and reason checks …
    const result = await getPrisma().$transaction(async (tx) => {
      const current = await debtRepo.findById(debt.id, tx);
      if (!current) throw Errors.NotFound('Debt');
      if (current.writtenOffAt) throw Errors.DebtAlreadyWrittenOff();
      if (current.status !== DebtStatus.OPEN && current.status !== DebtStatus.PARTIAL) {
        throw Errors.DebtNotOpen();
      }
      // Stamped inside the transaction, so no repayment can commit between the
      // stamp and the claim (PRD 14 §10).
      const writtenOffAt = new Date();
      const claimed = await debtRepo.writeOffIfOpen(debt.id, {
        writtenOffById: input.actorUserId,
        writtenOffReason: input.reason.trim(),
        writtenOffAt,
        writtenOffAmount: current.remainingAmount,
      }, tx);
      if (!claimed) throw Errors.DebtNotOpen();
      // … the existing DEBT_WRITTEN_OFF audit row …
      return { amount: current.remainingAmount };
    });
```

  After the commit: `void alertService.debtWriteOff({ …, actorName })` with the actor's `fullName`.
- `debt.service.ts` `recordRepayment` (:179-191): the status comes from
  `debtStatusAfterRepayment({ remaining: after.remainingAmount, writtenOff: after.writtenOffAt !== null })`;
  `closedAt` is `input.paidAt` when PAID, `after.closedAt` when WRITTEN_OFF, otherwise null.
- `mapDebt` and `list` add `writtenOffAt`, `writtenOffAmount`, `writtenOffReason`, `writtenOffByName`.
- `write-off.service.ts`: add NASIYA rows from `debtRepo.listWrittenOffInRange`, amount =
  `remainingAmount` — what is still unpaid now. A later payment therefore shrinks the write-off day's
  loss by itself (D24); Task 7 adds the correction record and the owner message.
- `dailyLedger`: `debtWriteOffs = Σ NASIYA`; at the same declaration `operatingExpense = operating +
  avansWriteOffs + debtWriteOffs`, still before `profit` and `dayMoney(...)`; emit
  `outflow.debtWriteOffs`. `sumOutstandingAsOf` already excludes written-off debts
  (`debt.repo.ts:124-163`) — unchanged. `monthly` and `summary` (required): Task 5's loss loop already
  reads `lossesForRange`, so the NASIYA rows reach `agg.operatingExpense` and `operatingForPnl` with
  no further change. Test 10a below pins it.
- `alert.service.ts` `debtWriteOff`: header `Qarz hisobdan chiqarildi`, add `Kim: ${actorName}`.
- `errors.ts:52`: message `Bu qarz allaqachon hisobdan chiqarilgan`.

- [ ] **Step 4: Run green** (both commands), then the full gates: both `[issue 31]` flip; file 21 tests
  5–10 and 10a pass; the two rewritten 06 tests pass; nothing else moves; typecheck 47 / 0 / 0
  (`typecheck:gallery` needs `gallery/fixtures/reports.ts` debt rows to carry `writtenOffAmount`).

- [ ] **Step 5: Commit**

```bash
git -C $WT add apps/master/src/main/server/lib/debt-ledger-row.ts apps/master/src/main/server/lib/debt-ledger-row.test.ts apps/master/src/main/server/repositories/debt.repo.ts apps/master/src/main/server/services/debt.service.ts apps/master/src/main/server/services/write-off.service.ts apps/master/src/main/server/services/reports.service.ts apps/master/src/main/server/services/alert.service.ts apps/master/src/main/server/services/alert.service.test.ts apps/master/src/main/server/lib/errors.ts apps/master/src/renderer/api/reports.ts apps/master/gallery/fixtures/reports.ts apps/master/e2e/06-debts.test.ts apps/master/e2e/21-write-offs.test.ts
git -C $WT commit -m "fix(debts): a write-off is Xarajat on its day, once, and the rest stays payable" -m "The loss is what is still unpaid on the debt, booked on the write-off day; cash is untouched and the owner is told who did it. writtenOffAt is stamped inside the transaction, a debt is never written off twice, and a payment after a write-off keeps it WRITTEN_OFF until it is paid in full. The nasiya ledger counts only real repayments as paid (money rules D14, D24; issue 31)."
```

---

### Task 7: D24 — a payment on an earlier write-off corrects that day

**Precondition:** P4 is merged into this branch and `services/day-correction.service.ts` exists with
the contract in "Interfaces with other packages" (`dayCorrectionService.apply`). If it does not, stop
and report — do not build one. After the merge, P4's `20261004100000_stock_entry_cost_before` sorts
before this branch's `20261004110000_…`, which `dev.db` already has: apply it and check for drift.

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate deploy
docker exec -w /app/apps/master CONTAINER pnpm exec prisma generate --schema prisma/schema.prisma
docker exec -w /app/apps/master CONTAINER bash -lc 'rm -f /tmp/p6-shadow.db && pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:/tmp/p6-shadow.db --exit-code; echo "diff exit $?"'
```

Expected: `diff exit 0`; then the five gates, which become the new floors for this task.

**Files:**
- Modify: `apps/master/src/main/server/services/debt.service.ts` (`recordRepayment` :127-222)
- Modify: `apps/master/e2e/21-write-offs.test.ts`

- [ ] **Step 1: Write the failing e2e tests** (append to file 21; they run after test 10)

11. `[D24] a payment on an older write-off is Kirim that day, never its profit, and corrects the
    write-off day` — at P 12:00 (`relogin`), around Karim paying 40 000 naqd: `ledger(P)` `realCashIn`
    +40 000 and Foyda unchanged; `ledger(W)` Foyda +40 000 and Xarajat −40 000; the debt is
    `WRITTEN_OFF` with 60 000 left; one new `DAY_CORRECTED` audit row with `entityId: W` and metadata
    `{ tradingDay: W, sourceEntityType: 'Debt', sourceEntityId: <Karim's debt id> }`, whose `what` is
    `Hisobdan chiqarilgan qarz to'landi: Karim aka, 40 000 so'm (25.10.2026)`; the owner got one
    message containing `O'tgan kun tuzatildi`, `10.10.2026` and `Karim aka` (spy on
    `env.svc.telegram.sendMessage`, filtered as P4's `messagesDuring` does).
12. `[D24] the written-off debt stays out of Qarz qoldig'i, and Qarzlar' open balances still add up to it`
    — `ledger(P).debt.outstandingAsOfEod` equals the sum of `remainingAmount` over `GET /api/debts`
    rows that are OPEN or PARTIAL.
13. `[D24] paying the rest closes the debt and takes the write-off day's loss to 0` — at P 13:00 Karim
    pays 60 000 → `PAID`, 0 left; `ledger(W)` Foyda +60 000 against before this payment; one more
    `DAY_CORRECTED` row.
14. `[D24] a payment on the write-off's own day is no correction` — a 45 000 debt `Bir kun` sold at
    P 13:30, written off at P 14:00 and paid 10 000 at P 15:00 → no new `DAY_CORRECTED` row; `ledger(P)` Xarajat
    for it is 35 000.

Run red: `-t "D24"`. Expected: 11 and 13 fail on the `DAY_CORRECTED` count (the money already moves
since Task 6); 12 and 14 pass — keep them, they pin the rule.

- [ ] **Step 2: Implement** — move the body of `recordRepayment`'s transaction (:155-219) into
  `async function repayInTx(tx, debt, amount, input)` unchanged, then:

```ts
    // A payment on a debt written off on an earlier trading day is Kirim today
    // and never today's profit; the loss on the write-off day shrinks by it, and
    // that change to a past day is a D13 correction (money rules D24).
    const writeOffDay = debt.writtenOffAt ? tradingDayOf(debt.writtenOffAt) : null;
    const paidDay = tradingDayOf(input.paidAt);
    const write = (tx: Prisma.TransactionClient) => repayInTx(tx, debt, amount, input);
    if (writeOffDay !== null && writeOffDay < paidDay) {
      // P4 writes the DAY_CORRECTED row and messages the owner after the
      // commit; the { result, before, after } it returns is not needed here.
      await dayCorrectionService.apply({
        tradingDay: writeOffDay,
        actorUserId: input.actorUserId,
        what: `Hisobdan chiqarilgan qarz to'landi: ${debt.debtorName}, ${formatUZS(amount.toFixed(0))} so'm (${formatDayKeyUZ(paidDay)})`,
        entityType: 'Debt',
        entityIdOf: () => debt.id,
        write,
      });
    } else {
      await getPrisma().$transaction(write);
    }
```

  Imports: `tradingDayOf` from `../lib/time`, `formatDayKeyUZ` and `formatUZS` from `../lib/format`
  (P2's `formatDayKeyUZ('2026-10-25')` → `'25.10.2026'`; no local day formatter), `dayCorrectionService`
  from `./day-correction.service`. `apply` must not be called from inside a transaction, and here it
  is not: the routing happens before any transaction opens. The decision reads `debt` from before the transaction: a write-off that lands in between is a
  same-day one, which needs no correction.

- [ ] **Step 3: Run green**, then the full gates (2 more passes; typecheck 47).

- [ ] **Step 4: Commit**

```bash
git -C $WT add apps/master/src/main/server/services/debt.service.ts apps/master/e2e/21-write-offs.test.ts
git -C $WT commit -m "feat(debts): a payment on an earlier write-off corrects the write-off day" -m "The payment is Kirim on the day it arrives and never that day's profit; the write-off day's loss shrinks by it through the day-correction service, which records it and messages the owner (money rules D24, D13)."
```

---

### Task 8: Qarzlar — "Hisobdan chiqarish" and the written-off debt

**Files:**
- Create: `apps/master/src/renderer/lib/debt-view.ts`, `debt-view.test.ts`
- Create: `apps/master/src/renderer/components/debts/DebtWriteOffDialog.tsx`
- Modify: `apps/master/src/renderer/api/debts.ts` (:3-61), `components/debts/DebtPanel.tsx` (:13-18,
  :56, :116-118, :173-177), `components/debts/DebtList.tsx` (:8-13), `pages/DebtsPage.tsx` (:15-21,
  :61-83, :105-113), `components/reports/report-helpers.tsx` (:132-150), `components/reports/DebtSection.tsx`
  (status cell), `api/reports.ts` (debt ledger row)
- Modify: `apps/master/gallery/fixtures/debts.ts` (:104-140: list fields, write-off route, repay on a
  written-off debt)

- [ ] **Step 1: Write the failing unit tests** — `debt-view.test.ts`:

- `debtStatusChip({ status: 'WRITTEN_OFF', writtenOffAt: '…' })` → `{ tone: 'owed', label: 'Hisobdan chiqarildi' }`.
- `debtStatusChip({ status: 'PAID', writtenOffAt: '…' })` → `{ tone: 'settled', label: 'Yopilgan', note: 'Hisobdan chiqarilgan edi' }`.
- `debtStatusChip({ status: 'PARTIAL', writtenOffAt: null })` → label `Qisman`.
- `canWriteOff`: OPEN 45 000 → true; PARTIAL 40 000 → true; WRITTEN_OFF 60 000 → false; PAID → false.
- `canRepay`: WRITTEN_OFF 60 000 → true; PAID 0 → false; OPEN 45 000 → true.
- No label anywhere is `Yo'qotilgan` or `To'landi`.

Run red:

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/renderer/lib/debt-view.test.ts
```

- [ ] **Step 2: Implement**

- `debt-view.ts`: the three functions; `DebtList`, `DebtPanel`, `DebtsPage` (filter label
  "Hisobdan chiqarilgan") and `report-helpers.tsx` (`WRITTEN_OFF: 'Hisobdan chiqarildi'`, tone `owed`)
  use it instead of their own maps.
- `api/debts.ts`: the four new fields on both types; `writeOff: (id, reason) =>
  api.post<DebtDetail>(`/api/debts/${id}/write-off`, { reason })`.
- `DebtWriteOffDialog.tsx`: modelled on `components/expenses/ExpenseWriteOffDialog.tsx`, with the
  strings of the Design section; the confirm button is `variant="destructive"`; invalidates
  `['debts']` and `['finance']` on success and toasts "Qarz hisobdan chiqarildi".
- `DebtPanel.tsx`: `canRepay` from `debt-view` (written-off debts keep the keypad); when
  `canWriteOff`, a full-width 48 px `variant="secondary"` button "Hisobdan chiqarish" in its own Seam
  row above the history (never inside a clickable Row); when written off, the two info lines; the
  D24 notice above the foot's confirm button; the closed notice (:173-177) reads only "Bu qarz yopilgan
  — to'lov qabul qilib bo'lmaydi." The panel takes an `onWriteOff` prop; `DebtsPage` owns the dialog
  and refetches the selected debt after either mutation (this also clears the stale balance after a
  repayment error — slice 1 deferred finding).
- `DebtSection.tsx`: the status cell shows the chip with `formatMoney(row.writtenOffAmount)` as a
  `RowSub` when it is not 0.
- Gallery: the write-off route sets `status: 'WRITTEN_OFF'`, `writtenOffAt`, `writtenOffAmount`,
  `writtenOffReason`, `writtenOffByName: 'Kamola Rashidova'`; a repayment on a written-off seed
  lowers `remainingAmount` and keeps the status; one seed is written off already.

- [ ] **Step 3: Verify**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/renderer/lib/debt-view.test.ts
docker exec -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'   # 0
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'    # 0
```

  Visual check in the gallery (`pnpm gallery:page`, served from the container) at 1236×623: Qarzlar
  with an open debt (the button is fully visible above the keypad and the foot), the dialog, and a
  written-off debt (both info lines, keypad, notice and confirm all on screen without scrolling the
  foot away).

- [ ] **Step 4: Commit**

```bash
git -C $WT add apps/master/src/renderer/lib/debt-view.ts apps/master/src/renderer/lib/debt-view.test.ts apps/master/src/renderer/components/debts apps/master/src/renderer/pages/DebtsPage.tsx apps/master/src/renderer/api/debts.ts apps/master/src/renderer/api/reports.ts apps/master/src/renderer/components/reports/report-helpers.tsx apps/master/src/renderer/components/reports/DebtSection.tsx apps/master/gallery/fixtures/debts.ts
git -C $WT commit -m "feat(qarzlar): write a debt off, and keep taking payment on it" -m "OWNER and ADMIN get Hisobdan chiqarish with a mandatory reason. A written-off debt reads hisobdan chiqarildi everywhere, never yo'qotilgan or to'landi, and still accepts payment (money rules D14, D24)."
```

---

### Task 9: Maoshlar — each waiter's month and the payout panel

**Files:**
- Create: `apps/master/src/renderer/lib/waiter-pay-view.ts`, `waiter-pay-view.test.ts`
- Create: `apps/master/src/renderer/components/salaries/WaiterPayTable.tsx`, `WaiterPayPanel.tsx`
- Delete: `apps/master/src/renderer/components/salaries/WaiterSummaryTable.tsx`
- Modify: `apps/master/src/renderer/pages/SalariesPage.tsx` (:14-165), `api/finance.ts` (:142-175),
  `lib/audit-labels.ts` (`WAITER_PAYOUT_RECORDED: 'Ofitsiantga maosh berildi'`, and in the money
  group beside `EXPENSE_CREATED` :92)
- Modify: `apps/master/gallery/fixtures/finance.ts` (beside :525-600: `GET /api/finance/waiter-pay`,
  `POST /api/finance/waiter-payouts`)

- [ ] **Step 1: Write the failing unit tests** — `waiter-pay-view.test.ts`:

- `shiftMonth('2026-10', -1) === '2026-09'`, `shiftMonth('2026-01', -1) === '2025-12'`,
  `shiftMonth('2026-12', 1) === '2027-01'`.
- `monthLabel('2026-10') === 'Oktabr 2026'`, `monthLabel('2026-09') === 'Sentabr 2026'`,
  `monthLabel('2026-01') === 'Yanvar 2026'`.
- `owedView('25000')` → `{ label: 'Qoldiq', amount: 25000, over: false }`;
  `owedView('-10000')` → `{ label: 'Ortiqcha berilgan', amount: 10000, over: true }`;
  `owedView('0')` → `{ label: 'Qoldiq', amount: 0, over: false }`.
- `signedPayout(10000, 'give') === 10000`, `signedPayout(5000, 'take-back') === -5000`.
- `payoutToast('Aziz', 10000) === "Aziz: 10 000 so'm berildi"`,
  `payoutToast('Aziz', -5000) === "Aziz: 5 000 so'm qaytarib olindi"` (grouped with spaces).
- `sinceNote('2026-10-01') === 'Qoldiq 01.10.2026 dan beri hisoblanadi.'`

Run red: `pnpm exec vitest run src/renderer/lib/waiter-pay-view.test.ts`.

- [ ] **Step 2: Implement**

- `api/finance.ts`: `WaiterPayMonth`, `WaiterPayout`; `waiterPay(month?: string)`,
  `recordPayout(body: { waiterId: string; amount: number; note?: string })`.
- `SalariesPage.tsx`: state `month: string | null` (null = the server's current trading month); the
  query `['finance', 'waiter-pay', month]`; the status bar of the Design section (stepping from
  `data.month`; `›` disabled when `data.month` is the current month the server answered for
  `month = null`, cached in a ref); the summary `Field`; `WaiterPayTable`; the footnote; `DailyMatrix`
  over `tradingMonth` bounds from the existing service-charge query (keep its collapsed default).
  The custom date range and the day presets go: the month is the unit (D25).
- `WaiterPayTable.tsx`: Blocks `RowHeader` + clickable `Row` (`selected` for the chosen waiter),
  columns `1fr 140px 140px 170px`, money in `RowMoney`; a negative Qoldiq with `RowSub` "Ortiqcha
  berilgan"; a total Row `inert`. Inactive waiters show `RowSub` "Ishlamaydi".
- `WaiterPayPanel.tsx`: self-contained, so P5's close form can mount it for one waiter. Props exactly
  `{ waiterId: string; month?: string; onDone(): void; onClose(): void }`; no `SalariesPage` state.
  It reads its own data with `useQuery({ queryKey: ['finance', 'waiter-pay', month ?? null], queryFn:
  () => financeApi.waiterPay(month) })` (the key `SalariesPage` uses, so the cache is shared) and finds
  its waiter's row by `waiterId`; it owns the mode, amount and note state and the mutation. Modelled on
  `DebtPanel.tsx` — `Panel` with head (a 48 px "Yopish" button, aria-label "Yopish", calls `onClose`),
  tiles (`Seam columns="1fr 1fr 1fr"`,
  values 17 px), the Berish / Qaytarib olish toggle (`Seam direction="row"`, two `Button`s as
  Naqd/Karta are), "Qoldiqni to'liq berish: …" (sets the amount; shown when owed > 0 and mode is
  give), `Input` "Izoh (ixtiyoriy)", `Keypad`, the history, and the foot (amount label + 66 px
  `size="action"` button). No cap on the amount: an avans may exceed Qoldiq. On success: toast
  `payoutToast`, invalidate `['finance']`, reset its own amount, note and mode, then call `onDone()`.
  `SalariesPage` mounts it as `<WaiterPayPanel key={selectedId} waiterId={selectedId}
  month={data.month} onDone={() => {}} onClose={() => setSelectedId(null)} />` and keeps only the
  selection. `WaiterPayPanel.tsx` imports nothing from `pages/` (check: `grep -n "pages/"
  src/renderer/components/salaries/WaiterPayPanel.tsx` prints nothing).
- Gallery: two waiters with the Task 3 numbers; POST appends to the chosen waiter's payouts and
  recomputes paid/owed.

- [ ] **Step 3: Verify** — the unit test, `pnpm test`, `typecheck:renderer` 0, `typecheck:gallery` 0,
  `pnpm typecheck` 47; visual check at 1236×623: the table with four waiters, the panel with a
  history of six payouts (the foot and its button stay on screen; the history scrolls), the
  over-paid state.

- [ ] **Step 4: Commit**

```bash
git -C $WT add apps/master/src/renderer/lib/waiter-pay-view.ts apps/master/src/renderer/lib/waiter-pay-view.test.ts apps/master/src/renderer/components/salaries apps/master/src/renderer/pages/SalariesPage.tsx apps/master/src/renderer/api/finance.ts apps/master/src/renderer/lib/audit-labels.ts apps/master/gallery/fixtures/finance.ts
git -C $WT commit -m "feat(maoshlar): each waiter's month, and paying them from the panel" -m "Maoshlar leads with the month: Ishlagan, Berilgan and Qoldiq per waiter. The panel records a payout, an avans or cash taken back; the day-by-day matrix stays below, collapsed (money rules D16, D25)."
```

---

### Task 10: Kunlik moliya — the write-off and payout lines

**Files:**
- Create: `apps/master/src/renderer/components/finance/WriteOffAndPayoutLines.tsx`
- Modify: `apps/master/src/renderer/components/finance/FinanceWorkArea.tsx` (one mount, after the
  Chiqimlar block :168-206 — or wherever P3 moved it)

- [ ] **Step 1: Implement** — props `{ ledger: DailyLedger }` (`FinanceDaily.ledger`). Two
  `SectionHead`-style blocks as in the Design section, each a list of `Row`s (`1fr 140px`) and an
  `inert` "Jami" Row; render nothing when both lists are empty. Labels: `Nasiya: {name} — {reason}`,
  `Avans: {name} — {reason}`, `{waiterName}{note ? ` — ${note}` : ''}`; time as `formatDateTime` in a
  `RowSub`; amounts via `formatMoney`, a taken-back payout with a minus.
- [ ] **Step 2: Verify** — `typecheck:renderer` 0, `typecheck:gallery` 0 (the finance fixture's
  `ledger` gets one write-off and two payouts), `pnpm typecheck` 47; visual check at 1236×623 that the
  blocks wrap long reasons with `truncate` and never widen the page.
- [ ] **Step 3: Commit**

```bash
git -C $WT add apps/master/src/renderer/components/finance/WriteOffAndPayoutLines.tsx apps/master/src/renderer/components/finance/FinanceWorkArea.tsx apps/master/gallery/fixtures/finance.ts
git -C $WT commit -m "feat(moliya): show the day's write-offs and waiter payouts" -m "Kunlik moliya lists what was written off (Xarajat) and what waiters were paid (naqd Chiqim), so both figures can be checked line by line."
```

---

### Task 10b: Chiqimlar — the day's Chiqim is the ledger's Chiqim (D17)

After Task 4 the ledger's `money.chiqim` includes waiter payouts, but Chiqimlar's tile reads
`GET /api/expenses?date=` `totals.cashOut` (P3 T15), which is expense-only and must stay so
(`dailyLedger` reads it; adding payouts there would count them twice). A Chiqim that means one thing on
Kunlik moliya and another on Chiqimlar breaks D17, so the tile reads the ledger.

**Files:**
- Create: `apps/master/src/renderer/lib/chiqim-tile.ts`, `chiqim-tile.test.ts`
- Modify: `apps/master/src/renderer/pages/ExpensesPage.tsx` (the tiles and the list, as P3 and P4
  left them)
- Modify: `apps/master/src/renderer/components/expenses/ExpenseCreateDialog.tsx`,
  `ExpenseReturnDialog.tsx`, `ExpenseReverseDialog.tsx`, `ExpenseWriteOffDialog.tsx` — only where a
  success handler does not already invalidate `['finance']`
- Modify: `apps/master/gallery/fixtures/finance.ts` (and `expenses.ts` only if needed) — the
  `/api/finance/daily` mock answers for the date Chiqimlar asks for
- Modify: `apps/master/e2e/20-waiter-pay.test.ts`

**Interfaces — produces:**

```ts
export function chiqimTile(money: { chiqim: { naqd: string; karta: string; jami: string } }): { value: number; note: string };
export function payoutRowLabel(waiterName: string): string;   // 'Ofitsiantga berildi: Aziz'
```

- [ ] **Step 1: Write the failing tests**

`chiqim-tile.test.ts`:

- `chiqimTile({ chiqim: { naqd: '17000', karta: '0', jami: '17000' } })` →
  `{ value: 17000, note: 'Naqd 17 000 · Karta 0' }` (grouped with spaces, `formatMoney`).
- `chiqimTile({ chiqim: { naqd: '-5000', karta: '0', jami: '-5000' } })` → `value: -5000` (a day
  whose only movement is cash taken back).
- `payoutRowLabel('Aziz') === 'Ofitsiantga berildi: Aziz'`.

Append to `e2e/20-waiter-pay.test.ts`, after test 7:

10. `[D17] on a payout day Chiqimlar's Chiqim is the ledger's Chiqim` — `setClock(at('2026-11-02T12:00'))`,
    `w.relogin()`; the admin records an ordinary 12 000 naqd expense (`POST /api/expenses`, the body as
    07-day builds one after P3/P4) and pays Aziz 5 000. For `2026-11-02`: admin `/api/finance/daily`
    `ledger.money.chiqim.jami` (what the tile now reads) is `'17000'` and equals owner
    `/api/reports/daily` `ledger.money.chiqim.jami`; `GET /api/expenses?date=2026-11-02`
    `totals.cashOut` stays `'12000'` (expense-only — no double count); `ledger.lines.waiterPayouts` is
    one row `{ waiterName: 'Aziz', amount: '5000' }`.

Run red:

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec vitest run src/renderer/lib/chiqim-tile.test.ts
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/20-waiter-pay.test.ts -t "D17"
```

Expected: the unit test fails (no module). The e2e test passes on arrival — the server has carried
payouts since Task 4; it pins the source the tile must read and that the expense totals stay
expense-only. Keep it.

- [ ] **Step 2: Implement**

- `chiqim-tile.ts`: the two functions, money through `formatMoney`.
- `ExpensesPage.tsx`: add `useQuery({ queryKey: ['finance', 'daily', date], queryFn: () =>
  financeApi.daily(date), enabled: !isSearching })` — the key `FinancePage.tsx:25` and
  `DashboardPage.tsx:55` already use, so the cache is shared. When not searching, the Chiqim tile is `chiqimTile(daily.ledger.money)` — value and note —
  instead of `data.totals.cashOut`; while the query loads, the tile shows "Yuklanmoqda…". When
  searching, P3's visible-rows sum and "Qidiruv natijasi" stay. Under `ExpenseList`, when not
  searching and `daily.ledger.lines.waiterPayouts` is non-empty: one `inert` `Row` per payout
  (`1fr 140px`), label `payoutRowLabel(p.waiterName)`, `RowSub` the note (if any) and the time
  (`formatDateTime`), `RowMoney` the amount with a minus when taken back. Not selectable, no panel, no
  undo — Maoshlar records and corrects payouts. Do not add payouts to `expenseService.listByDate` or
  its totals.
- Every expense mutation's success handler also invalidates `['finance']`, so the tile follows a new
  or undone expense.
- Gallery: the finance mock's `/api/finance/daily` answers any `date` with a ledger whose
  `money.chiqim.jami` is the expense fixture's `cashOut` plus one 5 000 payout, and whose
  `lines.waiterPayouts` holds that payout.

- [ ] **Step 3: Verify** — both commands green; full gates (one more e2e pass, unit +3);
  `typecheck:renderer` 0, `typecheck:gallery` 0, `pnpm typecheck` 47; visual check at 1236×623:
  Chiqimlar with expenses and a payout row (the row reads "Ofitsiantga berildi: …", the tile equals
  Kunlik moliya's Chiqim for the same day, nothing overflows).

- [ ] **Step 4: Commit**

```bash
git -C $WT add apps/master/src/renderer/lib/chiqim-tile.ts apps/master/src/renderer/lib/chiqim-tile.test.ts apps/master/src/renderer/pages/ExpensesPage.tsx apps/master/src/renderer/components/expenses apps/master/gallery/fixtures apps/master/e2e/20-waiter-pay.test.ts
git -C $WT commit -m "feat(chiqimlar): the day's Chiqim is the ledger's, payouts included" -m "Chiqimlar's Chiqim tile reads the day ledger's money.chiqim, so it matches Kunlik moliya on a payout day, and lists the day's waiter payouts as read-only rows. The expense totals stay expense-only (money rules D17)."
```

---

### Task 11: Documents

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md`
- Modify: `docs/superpowers/specs/2026-09-30-money-rules-design.md`

- [ ] **Step 1: `docs/CURRENT_WORKFLOW.md`**

- §5 "Finance vocabulary" (:271-310): the formula block gains `payouts` in `cashOut` and the two
  write-off terms in `operating` (Xarajat); the expenses paragraph (:294-296) says an avans write-off
  books on its write-off day and an undone avans counts for nothing; the debt paragraph (:298-305)
  says a written-off debt stays WRITTEN_OFF until paid in full, its loss is what is still unpaid, and a
  payment on an earlier write-off is a D13 correction; `writtenOffAt` and `writtenOffAmount` are set
  inside the transaction.
- §5 new paragraph "Waiter pay": `WaiterPayout`, Ishlagan · Berilgan · Qoldiq, `waiter_pay_since`,
  negative = taken back, naqd Chiqim, never Xarajat; Chiqimlar's Chiqim tile is the ledger's
  `money.chiqim` and lists the day's payouts read-only, while the expense totals stay expense-only.
- §6 "API surface" (:312-333): the two finance routes; the endpoint count.
- §11 "Known defects" #3 (:524-530): delete it (fixed), and renumber.
- §12 if it lists money-model §4 or Xodimlar maoshi as unbuilt.
- The audit actions list, wherever §5 or §8 names them: `WAITER_PAYOUT_RECORDED`.

- [ ] **Step 2: money rules §5** — add, in the file's style:

```markdown
- `05-expenses.test.ts`: "[issue 18]" and "[issue 30]" are met as written (D14, §4).
- `06-debts.test.ts`: "[D14] a payment on a written-off debt" now expects WRITTEN_OFF after a
  part-payment and PAID only when paid in full (D24); the write-off race test reads the balance the
  write-off took from `writtenOffAmount`. Both "[issue 31]" tests are met as written.
- `08-staff-access.test.ts`: "[issue 6]" is met as written (D16).
- New: `20-waiter-pay.test.ts` (D16, D25, D17) and `21-write-offs.test.ts` (D14, D24).
```

- [ ] **Step 3: Verify** — every cited line still points at what it names (`grep -n` each); P2's
  retired-helper grep (P2 Task 7 Step 3) prints nothing, since `e2e` and `scripts` are outside every
  tsconfig and an old name there fails only at run time:

```bash
docker exec -w /app/apps/master CONTAINER grep -rnE 'localDayKey|parseLocalDay|localDayRange|localMonthRangeFor|isSameLocalDay|localToday|localClockMinutes' src e2e scripts
docker exec -w /app/apps/master CONTAINER grep -rnE 'tradingDayKey|tradingDayRangeFor|tradingMonthRangeFor' src e2e scripts
```

  Both print nothing (the second catches the names this plan's earlier draft assumed). Then the five
  gates at their final numbers, recorded in the commit body.

- [ ] **Step 4: Commit**

```bash
git -C $WT add docs/CURRENT_WORKFLOW.md docs/superpowers/specs/2026-09-30-money-rules-design.md
git -C $WT commit -m "docs: waiter payouts and write-offs as built" -m "CURRENT_WORKFLOW describes payouts as naqd Chiqim, write-offs as Xarajat on their own day and the D24 correction; money rules §5 lists the e2e expectations this package met or changed."
```

---

## Open questions (defaults used)

1. **Where Qoldiq starts on a till with history, and the waiter avans already in Chiqimlar**
   (forwarded to Barkamol, with the owner). Default: Qoldiq counts from `waiter_pay_since`, set by the
   migration to the first day of the month this build first runs; earlier months count as paid; not
   editable on a screen in this package. Waiter avans entered before that in Chiqimlar as repayable
   expenses stay as they are — they are not payouts and do not lower Qoldiq; new waiter avans go
   through Maoshlar. One answer settles both: an earlier start date would also have to count those old
   avans against Qoldiq.

## Risks

- **Same-wave overlap with P4** (merge by hand): `expense.service.ts` (`listByDate` operating loop
  and `writeOff`), `expense.repo.ts` (`listForDate` include, `markWrittenOff`), `reports.service.ts`
  (`dailyLedger`'s `Promise.all` and Xarajat line; `monthly`/`summary` loops), `lib/errors.ts`,
  `alert.service.ts` and its test, `schema.prisma` and two migrations (regenerate the client and run
  `prisma migrate deploy` on a fresh template after the merge), `FinanceWorkArea.tsx`,
  `audit-labels.ts`, `gallery/fixtures/{finance,reports}.ts`. If P4 also routes the per-row expense
  rule through a helper, keep one helper.
- **P4's correction service** is pinned to `dayCorrectionService.apply` (P4 T3); Task 7 is the only
  call site and waits for P4's merge. P4's migration must merge before Task 7 (see its precondition).
- **Names from P2 and P3** are pinned (`tradingDayOf`, `tradingDayRange`, `tradingMonthOf`,
  `tradingMonthRange`, `formatDayKeyUZ`; `dayMoney`, the locals `cashOutNaqd`, `DayAgg.cashOutNaqd`,
  `partsOf`). If a wave 1–2 merge renamed any, Task 11's greps and the typecheck catch it. Task 3 test 5
  depends on P2's month range.
- **A past day's Foyda changes after the fact** when a written-off debt is paid (D24 by design). P5
  must recompute closed days, not freeze them.
- **The `updatedAt` encoding** in the migration's setting insert (Task 1 Step 3 checks it).
- **e2e file names** `20-waiter-pay` and `21-write-offs` are reserved for P6 in the cross-plan
  numbering (P2 16, P3 17, P7 18, P4 19, P5 22).
- **Avans write-off category:** the loss counts whatever category the avans was filed under; a
  Mahsulot xaridi avans (P4) would count as Xarajat too — correct for a loss, but say so if P4 disagrees.
