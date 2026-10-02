# Closing the day (P5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin closes each trading day with a cash count. The close saves Ertalab kassada,
Kutilgan, Sanaldi, Farq, Ertaga qoladi and Egasiga berildi with who closed and when, helps find a
shortage before it is saved, survives later corrections, and sends the owner's report — at the
close, or at 05:00 marked "kun yopilmadi", or at the next start when the till was off.

**Architecture:** A close is a drawer count, so it is a moment, not a day. Its Kutilgan sums the
cash ledger over the window from the previous count to this one, through one new
`reportsService.ledgerForRange` that the day ledger now delegates to (same formulas, any window).
Only what the admin typed is stored as the truth (Ertalab kassada on a first close, Sanaldi,
Ertaga qoladi); Kutilgan and Farq are recomputed on every read, so a correction moves them without
anyone rewriting a row. The owner's report is sent after the close commits, logged only when
Telegram accepts it, and a scheduler catches up every ended trading day at 05:00 and at start-up.

**Tech Stack:** Node + Express + Prisma 6.17 on SQLite (one connection, PRD 14 G7), zod 4,
vitest 2 (unit: `pnpm test`; e2e: `vitest.e2e.config.ts`), React 19 + TanStack Query + sonner,
Blocks C1. Docker for every run.

**Spec:** `docs/superpowers/specs/2026-09-30-money-rules-design.md` D12, D21, §3.3, §3.4, §3.13,
§6 (the close-screen question). Package P5 of `feat/money-rules`, wave 4: built after P1, P2, P7
(wave 1), P3 (wave 2), P4 and P6 (wave 3) are merged.

---

## Design

### Decisions covered

- **D12** — the admin closes each trading day with a cash count (§3.3 formulas). The handover to
  the owner is not Chiqim; it only sets the next close's Ertalab kassada.
- **D21** — the owner's report goes out when the day closes, with Kutilgan, Sanaldi, Farq and
  Egasiga berildi; on by default once Telegram is configured; a day not closed by 05:00 is sent at
  05:00 marked "kun yopilmadi"; a till that was off sends at its next start; a report is logged as
  sent only when Telegram accepts it.
- **D13 / D23, as they touch a close** — a correction (P4) to a closed day recomputes that close's
  Kutilgan and Farq; the owner's correction message (P4's `formatDayCorrection`) carries them
  before and after, because P5 fills P4's `DaySnapshot.expected` and `.difference` (Task 6). There
  is one correction message, P4's; P5 adds no second one. `dayCorrectionService.isClosedDay` keeps
  P4's body (any trading day before today's), so every past day stays a correction (Task 6 says
  why).
- **§6 open question** (does the month's Xizmat haqi sit in the drawer until payday?) — the close
  shows unpaid waiter Qoldiq beside "Ertaga qoladi" either way, with a one-tap fill. No rule is
  enforced. Listed under open questions.

### The formulas (money rules §3.3), and the one choice they leave

```
Ertalab kassada  = the previous close's Ertaga qoladi         (typed once, on the very first close)
Kutilgan         = Ertalab kassada + naqd Kirim − naqd Chiqim   over the close's window
Sanaldi          = typed
Farq             = Sanaldi − Kutilgan
Ertaga qoladi    = typed, 0 ≤ Ertaga qoladi ≤ Sanaldi
Egasiga berildi  = Sanaldi − Ertaga qoladi
```

**The window is the time between two counts, not a calendar of trading days.** A close covers
`[windowStart, closedAt)`: `windowStart` is the previous close's `closedAt`, or the start of the
trading day on the first close ever. The next close starts exactly where this one ended. Why:
admins do not read notes, and cash must match the drawer on its own. With a day-shaped window, a
bill paid in cash at 23:30 after a 23:10 count would raise the closed day's Kutilgan (a false
shortage) and be missing from the next day's (a false surplus). With a count-shaped window it
simply belongs to the next count, which is where the cash physically is. A day that was never
closed is covered by the next close's window, so nothing falls between two counts.

The close is **labelled** with the trading day (money rules D11, 05:00 boundary) in which the count
was made, and a trading day has at most one close. A count at 02:00 labels the evening before.

**How a correction propagates** (decided here, the task asked for it):

- A correction (P4) lands in the close whose window holds its `occurredAt`. That close's Kutilgan
  and Farq change, because they are recomputed from the ledger on every read.
- **It never ripples forward.** The next close's Ertalab kassada is the stored, typed Ertaga
  qoladi: that cash was counted and left in the drawer, so no later entry can change it. Neither
  does Egasiga berildi (Sanaldi − Ertaga qoladi, both typed).
- A correction to a closed day N is stamped inside N's window: if its time falls at or after N's
  `closedAt`, it is moved to one second before `closedAt` (Task 6). A day with no close of its own
  lies wholly inside the next close's window, so any time in it is already inside.
- An undo of an entry (P4's reverse) is not restamped: P4 stamps the REVERSAL row with its
  original's `occurredAt`, so it always sits in the same close's window as its original, which is
  what the ledger's same-window reversal rule needs (Task 6).
- Example (the e2e numbers of Task 6). Day N: Ertalab kassada 200 000, naqd Kirim 110 000, naqd
  Chiqim 40 000 → Kutilgan 270 000; Sanaldi 250 000 → Farq −20 000; Ertaga qoladi 100 000 →
  Egasiga berildi 150 000. Two days later the admin enters the forgotten 20 000 naqd as a
  correction to N: N's Kutilgan 250 000, Farq 0, and the owner is told "Kutilgan: 270 000 →
  250 000 so'm", "Farq: -20 000 → 0 so'm". Day N+1's Ertalab kassada stays 100 000.
- A **mistyped count** is a different thing: the latest close (only the latest — a later close has
  already used its Ertaga qoladi) can be corrected by OWNER or ADMIN; audit row and owner message
  (Task 7).

Stored at close time as well, for the audit and to show that a close was later corrected:
naqd Kirim, naqd Chiqim and Kutilgan as they were (`*AtClose`), and the unpaid waiter Qoldiq.

### What the operator sees

All in **Kunlik moliya** (`/finance`); the nav rail is full (10 slots, `lib/navigation.ts`), so no
destination is added. The day picker already chooses the day; the panel follows it.

1. **The current trading day, not closed.** The Kassa panel (P3's `FinanceDrawerPanel`) keeps its
   rows; its foot gains a 56 px primary button **"Kunni yopish"** under "Kassa o'zgarishi".
2. **Tapping it** swaps the panel for the close form (`DayClosePanel`):
   - Head: **"Kunni yopish"**, under it `29.09.2026 · oldingi sanoqdan beri` (or
     `29.09.2026 · kun boshidan` on the first close ever).
   - Rows: **"Ertalab kassada"**, **"Naqd kirim"** (`+110 000`), **"Naqd chiqim"** (`-40 000`),
     **"Kutilgan"** (bold). On the first close "Ertalab kassada" is an amount field instead.
   - Amount field **"Sanaldi"**, then the row **"Farq"** with its word: **"Kam"** (owed tone),
     **"Ortiqcha"** (live tone) or **"To'g'ri"** (settled tone), e.g. `-20 000 · Kam`.
   - **On a shortage** (Farq < 0), directly under Farq: a 48 px button
     **"Kiritilmagan xarajat qo'shish"** that opens P4's expense form (today, Naqd); on save the
     form refetches and Kutilgan drops. Under it **"Ofitsiantlarga to'lanmagan"** with one row per
     waiter (`Aziz 20 000`); tapping a row opens P6's `WaiterPayPanel` for that waiter.
   - If orders are still open: a row **"Ochiq buyurtmalar: 2 — keyingi yopishga o'tadi"**.
   - Amount field **"Ertaga qoladi"**; beside it, when unpaid Qoldiq is above 0, a row
     **"Ofitsiantlar qoldig'i: 35 000"** with a 48 px chip button **"Shuncha qoldirish"** that
     fills Ertaga qoladi with that amount.
   - Row **"Egasiga berildi"**.
   - Foot (pinned): **"Bekor qilish"** (secondary) and **"Kunni yopish"** (primary, 56 px),
     disabled until Sanaldi has been typed (0 is a valid count once typed) and while
     Ertaga qoladi > Sanaldi, which shows
     **"Ertaga qoladigan pul sanalgan puldan ko'p bo'lishi mumkin emas"**.
   - One keypad shows, under the field that has focus; every field also takes the hardware
     keyboard (AmountField). The middle scrolls; head and foot never do (1236 × 623 floor).
3. **After saving:** toast **"Kun yopildi"** and the panel becomes the summary.
4. **A closed day (any day picked that has a close)** — `DayCloseSummary`: head
   **"Kun yopilgan"**, under it `23:10 · Admin`; the eight figures as rows; a chip
   **"Tuzatildi"** when Kutilgan is no longer what it was at the close; the report line
   **"Hisobot egasiga yuborildi"**, **"Hisobot hali yuborilmadi — 05:00 dan keyin qayta
   yuboriladi"**, or **"Hisobot yuborilmaydi: Telegram sozlanmagan yoki o'chirilgan"**. On the
   latest close only, a 48 px button **"Sanoqni tuzatish"** reopens the form with its values.
5. **A past day without a close** — the Kassa panel with a chip **"Kun yopilmadi"** in its head.

Server refusals the form shows as they come (Uzbek, from the server):
`Bu kun allaqachon yopilgan` (409), `Kassa o'zgardi: Kutilgan endi 176 000. Qayta tekshiring.`
(409, the form refetches), `Faqat oxirgi yopishni tuzatish mumkin` (409),
`Birinchi yopish: ertalab kassada bo'lgan pulni kiriting` (400),
`Ertalab kassada oldingi yopishdan olinadi` (400).

**The owner's Telegram report** is P3's daily report message for the day, with this block
appended (money grouped with spaces by `formatUZS`; the divider is the existing one):

```
━━━━━━━━━━━━━━━━━━━━
<b>Kun yopildi</b> — 23:10, Admin
  Ertalab kassada: <b>200 000</b> so'm
  Naqd kirim: <b>110 000</b> so'm
  Naqd chiqim: <b>40 000</b> so'm
  Kutilgan: <b>270 000</b> so'm
  Sanaldi: <b>250 000</b> so'm
  Farq: <b>-20 000</b> so'm (kam)
  Ertaga qoladi: <b>100 000</b> so'm
  Egasiga berildi: <b>150 000</b> so'm
  Ofitsiantlar qoldig'i: <b>35 000</b> so'm
```

`Davr: 28.09.2026 23:10 — 29.09.2026 23:30` is added under the title when the window covers more
than one trading day; the Qoldiq line only when it is above 0; `(ortiqcha)` on a surplus, nothing
when Farq is 0. A day not closed by 05:00 gets the first line **`<b>Kun yopilmadi</b> — kassa
sanalmadi`** above the day report and no block. A closed day that changed after its count (a bill
at 23:30) gets one more report at 05:00 headed **`<b>Kun yopilgandan keyin o'zgardi</b>`**. A
corrected count sends **`<b>Kun yopilishi tuzatildi</b> — 29.09.2026`** with who, and Sanaldi,
Farq, Ertaga qoladi and Egasiga berildi as `before → after`.

### Server, schema and API

- **Schema:** model `DayClose` (fields in Task 3); `AuditAction` gains `DAY_CLOSED`,
  `DAY_CLOSE_CORRECTED`. No other table changes; enum values need no SQL on SQLite. One migration,
  pinned as `20261005100000_day_close` so it sorts after every wave 1–3 migration (the last is
  P6's `20261004110000_waiter_payouts_and_write_offs`).
- **Ledger:** `reportsService.ledgerForRange(start, end, label)`; `dailyLedger(day)` delegates to
  it. Formulas untouched (Task 2), and everything waves 1–3 put in the body (P1's D27 filter,
  P6's payouts and write-offs, P3's `money` block) moves with it.
- **API** (router `/api/day-close`, OWNER + ADMIN; waiters 403):
  - `GET /api/day-close/current` → `DayClosePreview` (what a close now would say).
  - `GET /api/day-close/day/:day` → `{ close: DayCloseDto | null }`.
  - `POST /api/day-close` `{ counted, carryOver, opening?, expectedSeen }` → `201 { close, report }`.
  - `PATCH /api/day-close/:id` `{ counted, carryOver, opening? }` → `{ close }` (latest close only).
- **Telegram:** `telegramBotService.sendMessage` answers `'SENT' | 'BOT_OFF' | 'FAILED'` instead
  of swallowing the outcome. The 23:30 nightly path (`shouldSendDailyTelegram`,
  `sendDailyTelegramSummary`, `runScheduledDailyTelegram`, setting `daily_report_telegram_time`)
  is replaced by `financeReportService.sendCloseReport(closeId)` and
  `financeReportService.runOwnerDayReports(now)`, which the scheduler runs at start and every
  minute. P5 owns the daily report: P2's monthly trading-clock trigger and its test stay; any
  daily-trigger test P2 left in `16-trading-day` goes with the 23:30 path (Task 10). `daily_report_telegram_enabled` now means "unless set to `false`" — on by default once a
  bot token and an owner chat are set.

### What deliberately stays

- `reportsService.dailyLedger`'s formulas, the billing math, `cashOut` (not `expenseNet`). The
  extraction in Task 2 only lets the same body run over a window; a control test proves the day
  ledger is unchanged.
- Hisobot, the PDF, Excel and `/bugun` do not show the count in this package.
- Waiter apps (mobile, order) are untouched and receive nothing new.
- The monthly report and every push alert keep their paths.
- The till never refuses a sale because a day is closed; money after a count belongs to the next.

---

## Global Constraints

- **Where:** a branch cut from `feat/money-rules` after waves 1–3 are merged (the build harness
  names it, e.g. `feat/money-day-close`). Never commit to `main`, `feat/auto-update` or
  `feat/money-rules`; never push, merge, tag or deploy.
- **Where things run:** only in the container the build gives, written `CONTAINER` below. Never
  start Electron on this Mac. Every `docker exec` that runs vitest takes `-e NO_COLOR=1`.
- **Gates** (each task lists its own subset):

  ```bash
  docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
  docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
  docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'                       # floor 47
  docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS' # 0
  docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'  # 0
  ```

  Task 0 records the e2e and unit floors as built by waves 1–3. No task may raise a typecheck
  count, and no e2e test that passed before a task may fail after it. Tests owned by no package
  that still fail by design stay failing.
- **After a schema change:**
  `docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --name <name>`. The
  migration must only create the new table and its indexes; one that rebuilds an existing table
  must keep every index that table had.
- **Decided values:** the window is `[previous closedAt, closedAt)`; one close per trading day
  (D11 label); Ertaga qoladi between 0 and Sanaldi; amounts are whole so'm (`somAmountOrZero`);
  `expectedSeen` must equal the server's Kutilgan; only the latest close may be corrected; the
  report waits at most 5 s at close; catch-up covers at most 7 ended trading days, oldest first;
  a day with no bill and no money movement gets no "kun yopilmadi" report; a Telegram error is
  retried after 10 minutes, a bot that is not running yet is retried the next minute.
- **Code rules** (`docs/agent-plans/00-shared/conventions.md`): TypeScript strict,
  `noUncheckedIndexedAccess`, no `any` outside test files; 2-space indent, single quotes,
  semicolons, trailing commas; Prisma only in `repositories/`; throw `Errors.*`; **never call
  `getPrisma()` inside a `$transaction` callback** (one connection — compute ledgers before the
  transaction); every user-facing string in Uzbek (Latin); money grouped with `formatUZS`
  (server) or `formatMoney` (renderer), never raw `Intl` `uz-UZ`.
- **Renderer:** compose `components/blocks` and `components/layout` (`Screen`, `Panel`); 48 / 56 /
  66 px targets, 12 / 13 / 17 px type floors; nothing reachable only by hover; check at 1236 × 623.
- **Tests first:** every task writes its failing test before the code and runs it red.
- **Commits:** conventional, plain, authored as Barkamol. No AI attribution, no `Co-Authored-By`.
  Never commit `apps/master/e2e/.data/`. Never `--no-verify`.
- **Line numbers** below are as of `cafd82e` (before waves 1–3). Waves 1–3 move them; find the
  same code by the names given, and Task 0 records what moved.

## Assumed interfaces (Task 0 confirms each; it overrides a name, never a decision)

| From | Assumed | Used in |
|---|---|---|
| P2 | `server/lib/time.ts` exports `tradingDayOf(at?: Date): string`, `tradingDayRange(day: string): { start: Date; end: Date }` (05:00 → 05:00 Tashkent) and `shiftTradingDay(dayKey: string, days: number): string`; `server/lib/format.ts` exports `formatDayKeyUZ('2026-09-29')` → `'29.09.2026'` | Tasks 1, 2, 4, 6, 7, 9, 10 |
| P2 | `dailyLedger(day)` already ranges over `tradingDayRange(day)`; `expenseRepo.listForDate` and `debtRepo.sumOutstandingAsOf` bucket by trading day | Task 2 |
| P2 | `finance-report.service.ts` keeps the monthly trigger on the trading clock (`shouldSendMonthlyTelegram`); `e2e/16-trading-day.test.ts` has its monthly test and, if P2 built them before the cross-check, two daily-trigger tests that call `runScheduledDailyTelegram` (`shouldSendDailyTelegram`) | Task 10 |
| P1 | `dailyLedger`'s CANCELED-order query (`canceledCount`, `incidents.cancellations`) carries `AND: [NOT_AUTO_CANCELED]` (D27, `lib/stale-draft.ts`) | Task 2 |
| P3 | The day ledger carries `money: DayMoney`; the drawer is `money.kirim.naqd` and `money.chiqim.naqd` (D9, cash only), with `money.kassa`, `sales.closedCount` and total Kirim/Chiqim (`money.kirim.jami`, `money.chiqim.jami`) | Tasks 2, 4, 10 |
| P3 | `reportsService.daily(anchor)` + `telegramBotService.formatReportMessage(anchor, report)` still build the owner's day message in the D17 vocabulary | Tasks 9, 10 |
| P3 | `FinanceDrawerPanel` is the cash-only Kassa panel of `/finance` | Task 12 |
| P4 | An expense carries `paymentMethod: 'CASH' \| 'CARD'` (default `CASH`). A correction to a past day is explicit: `POST /api/expenses { amount, reason, paymentMethod: 'CASH', occurredAt: '<day>T12:00 Tashkent, ISO', correction: true }`; `expenseService.create` sends it through `dayCorrectionService.apply`, whose owner message is `formatDayCorrection` | Tasks 4, 5, 6 |
| P4 | `dayCorrectionService.snapshot(tradingDay): Promise<DaySnapshot>` with `DaySnapshot = { profit: string; expected?: string; difference?: string }`; `formatDayCorrection` prints `Kutilgan` and `Farq` lines when both snapshots carry them; `dayCorrectionService.isClosedDay` answers "any trading day before today's"; `createSerialRunner()` in `lib/serial-runner.ts` | Tasks 6, 9 |
| P4 | `expenseService.reverse` stamps the REVERSAL row with its original's `occurredAt` and runs a past-day undo through `dayCorrectionService.apply` | Task 6 |
| P4 | `ExpenseCreateDialog` (or its successor) opens for today with Naqd preset and calls `onCreated` | Task 12 |
| P6 | `POST /api/finance/waiter-payouts { waiterId, amount }`; a payout is naqd Chiqim inside the ledger's `money.chiqim.naqd`; `dailyLedger` reads `waiterPayService.payoutsForRange(dayStart, dayEnd)` and `writeOffService.lossesForRange(dayStart, dayEnd)` | Tasks 2, 4, 5 |
| P6 | `waiterPayService.owedByWaiter(): Promise<Array<{ waiterId: string; waiterName: string; owed: string }>>` — each waiter's unpaid Qoldiq since the setting `waiter_pay_since` (the migration sets it to the first day of the month it ran in), non-zero rows only | Task 5 |
| P6 | `WaiterPayPanel { waiterId, onDone, onClose }` (`components/salaries/WaiterPayPanel.tsx`), the payout panel the close form opens for one waiter | Task 12 |

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/master/src/main/server/lib/day-close.ts` (+ `.test.ts`) | Create | `closeFigures`, `closeInputError`, `reportDaysDue` — pure (day arithmetic is P2's `shiftTradingDay`) |
| `apps/master/src/main/server/lib/day-close-message.ts` (+ `.test.ts`) | Create | The count-correction lines, the Telegram close block, the unclosed and late headers — pure |
| `apps/master/src/main/server/lib/within.ts` (+ `.test.ts`) | Create | `within(promise, ms)` → the value or `'PENDING'` |
| `apps/master/src/main/server/services/reports.service.ts` | Modify | `ledgerForRange`; `dailyLedger` delegates |
| `apps/master/src/main/server/services/expense.service.ts` | Modify | `summaryForRange`; `listByDate` delegates |
| `apps/master/src/main/server/repositories/expense.repo.ts` | Modify | `listForRange`; `listForDate` delegates |
| `apps/master/src/main/server/repositories/debt.repo.ts` | Modify | `sumOutstandingBefore`; `sumOutstandingAsOf` delegates |
| `apps/master/prisma/schema.prisma`, `prisma/migrations/20261005100000_day_close/` | Modify / create | `DayClose`, two audit actions |
| `apps/master/src/main/server/repositories/dayClose.repo.ts` | Create | Every Prisma call on `DayClose` |
| `apps/master/src/main/server/services/day-close.service.ts` | Create | Preview, close, figures, correction hooks, correct |
| `apps/master/src/main/server/controllers/day-close.controller.ts`, `routes/day-close.routes.ts`, `app.ts` | Create / modify | `/api/day-close` |
| `apps/master/src/main/server/lib/errors.ts` | Modify | `DayAlreadyClosed`, `DayCloseStale`, `DayCloseNotLatest` |
| `apps/master/src/main/server/services/alert.service.ts` | Modify | `dayCloseCorrected` owner message |
| `apps/master/src/main/server/services/expense.service.ts` (P4's `create`, correction branch) | Modify | Stamp a correction inside the close's window before `dayCorrectionService.apply` |
| `apps/master/src/main/server/services/day-correction.service.ts` (P4's `snapshot`) | Modify | Fill `expected` (Kutilgan) and `difference` (Farq), so P4's message carries them; `isClosedDay` unchanged |
| `apps/master/src/main/server/services/telegram-bot.service.ts` | Modify | `sendMessage` answers `DeliveryResult` |
| `apps/master/src/main/server/services/finance-report.service.ts` | Modify | `ownerDayReportEnabled`, `sendCloseReport`, `runOwnerDayReports`; the 23:30 path goes |
| `apps/master/src/main/server/lib/scheduler.ts` | Modify | Runs `runOwnerDayReports` at start and every minute |
| `apps/master/src/main/server/services/settings.service.ts`, `prisma/seed.ts` | Modify | Drop `daily_report_telegram_time`; dev seed on |
| `apps/master/e2e/harness.ts` | Modify | `env.svc.dayClose` |
| `apps/master/e2e/22-day-close.test.ts` | Create | D12 end to end, concrete so'm |
| `apps/master/e2e/07-day.test.ts` | Modify | Two `ledgerForRange` controls |
| `apps/master/e2e/09-nightly-report.test.ts` | Rewrite | D21 |
| `apps/master/e2e/16-trading-day.test.ts` | Modify | Delete P2's daily-trigger tests, if present; the monthly test stays |
| `apps/master/src/renderer/api/day-close.ts` | Create | Types and calls |
| `apps/master/src/renderer/lib/day-close-view.ts` (+ `.test.ts`) | Create | Live Kutilgan, Farq word, Egasiga berildi, form gate — pure |
| `apps/master/src/renderer/components/finance/DayClosePanel.tsx`, `DayCloseSummary.tsx` | Create | The form and the closed-day panel |
| `apps/master/src/renderer/components/finance/FinanceDrawerPanel.tsx`, `pages/FinancePage.tsx` | Modify | The button, the panel switch |
| `apps/master/src/renderer/pages/SettingsPage.tsx` | Modify | Toggle label, default on, time field gone |
| `apps/master/src/renderer/lib/audit-labels.ts` | Modify | Two labels, group, tone |
| `apps/master/gallery/fixtures/day-close.ts`, `gallery/mock-server.ts`, `gallery/fixtures/settings.ts` | Create / modify | Preview routes |
| `docs/CURRENT_WORKFLOW.md`, `docs/superpowers/specs/2026-09-30-money-rules-design.md`, this plan | Modify | Say what the code now does |

---

### Task 0: Pre-flight — baselines and the interfaces waves 1–3 actually built

**Files:** none changed; findings go in the ledger and, at Task 13, into "Deviations during
execution" at the end of this plan.

- [ ] **Step 1: Confirm the branch has waves 1–3**

```bash
cd <worktree>   # the build harness gives it
git log --oneline -30 | grep -Ei 'trading|ledger|kassa|expense|payout|write-off|discount|qaytim'
```

Expected: commits from P1, P2, P7, P3, P4 and P6. If any package is missing, stop and report.

- [ ] **Step 2: Record the floors**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
```

Also confirm the migrations end with P6's `20261004110000_waiter_payouts_and_write_offs`
(`ls apps/master/prisma/migrations | tail -3`), so Task 3's pinned name sorts last.

Write down: e2e passed/failed/total (call them `E_PASS`, `E_FAIL`), unit tests and files
(`U_TESTS`, `U_FILES`), and the three typecheck counts (expected 47, 0, 0). Also list by name the
e2e tests that fail, so each later task can show none of them flipped the wrong way.

- [ ] **Step 3: Read every row of "Assumed interfaces" against the code**

For each row, find the real name and shape (`grep -rn` in `apps/master/src` and `apps/master/e2e`)
and write it beside the row in the ledger. In particular:

- the trading-day helpers in `server/lib/time.ts` (`tradingDayOf`, `tradingDayRange`,
  `shiftTradingDay`), `formatDayKeyUZ` in `server/lib/format.ts`, and the renderer's equivalent
  of `tashkentDayKey`;
- the field path of naqd Kirim and naqd Chiqim in `dailyLedger`'s result (`money.kirim.naqd`,
  `money.chiqim.naqd`), and whether waiter payouts (P6) are inside `money.chiqim.naqd` — if not,
  `naqdOf` (Task 4) adds them;
- every place inside `dailyLedger` that takes a day anchor rather than `start`/`end` (Task 2 must
  convert each);
- what `ledgerForRange` must carry over from `dailyLedger`'s body unchanged (Task 2's deep-equal
  control pins every one): P1's D27 where-fragment `AND: [NOT_AUTO_CANCELED]` on the CANCELED
  query; P6's `waiterPayService.payoutsForRange(dayStart, dayEnd)` and
  `writeOffService.lossesForRange(dayStart, dayEnd)` in the `Promise.all`; P3's `money` block
  (`dayMoney({ … cashOutNaqd, cashOutKarta })` and `money,` in the returned object). Write the
  line of each in the ledger;
- P4's correction path: `POST /api/expenses { …, paymentMethod, occurredAt, correction: true }`,
  the correction branch in `expenseService.create` (where `dayCorrectionService.apply` is called),
  `expenseService.reverse` and its stamp, `dayCorrectionService.snapshot` and `isClosedDay`,
  `formatDayCorrection`'s Kutilgan/Farq lines, `createSerialRunner`; P4's expense form component
  and props;
- P6's payout route, `waiterPayService.owedByWaiter()`, how `waiter_pay_since` is set, and
  `WaiterPayPanel`'s props;
- whether P2 left daily-trigger tests in `e2e/16-trading-day.test.ts` (tests that call
  `runScheduledDailyTelegram` or `shouldSendDailyTelegram`); record their number as `P2D` (0 or 2)
  and whether they pass;
- whether `/api/reports/*` and Hisobot are open to ADMIN (D22, P3).

If an assumption is wrong in a way that changes a decision in the Design (not just a name), stop
and report instead of improvising.

No commit.

---

### Task 1: The close formulas, pure

**Files:**
- Create: `apps/master/src/main/server/lib/day-close.ts`
- Test: `apps/master/src/main/server/lib/day-close.test.ts`

**Interfaces:**
- Consumes: P2's `shiftTradingDay(dayKey, days)` (`server/lib/time.ts`) for day arithmetic; no
  second date helper.
- Produces: `closeFigures`, `closeInputError`, `reportDaysDue` (Tasks 4, 7, 10).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { closeFigures, closeInputError, reportDaysDue } from './day-close';

describe('closeFigures (money rules §3.3)', () => {
  it('a shortage: 200 000 in the morning, 110 000 in, 40 000 out, 250 000 counted', () => {
    expect(closeFigures({ opening: 200000, cashIn: 110000, cashOut: 40000, counted: 250000, carryOver: 100000 }))
      .toEqual({ expected: 270000, diff: -20000, handedOver: 150000 });
  });
  it('a count that matches has Farq 0', () => {
    expect(closeFigures({ opening: 100000, cashIn: 76000, cashOut: 25000, counted: 151000, carryOver: 51000 }))
      .toEqual({ expected: 151000, diff: 0, handedOver: 100000 });
  });
  it('a surplus is a positive Farq', () => {
    expect(closeFigures({ opening: 0, cashIn: 45000, cashOut: 0, counted: 50000, carryOver: 0 }).diff).toBe(5000);
  });
  it('Kutilgan can go below zero when more left the till than was in it', () => {
    expect(closeFigures({ opening: 0, cashIn: 0, cashOut: 30000, counted: 0, carryOver: 0 }))
      .toEqual({ expected: -30000, diff: 30000, handedOver: 0 });
  });
  it('leaving everything in the drawer hands the owner 0', () => {
    expect(closeFigures({ opening: 40000, cashIn: 8000, cashOut: 0, counted: 48000, carryOver: 48000 }).handedOver).toBe(0);
  });
});

describe('closeInputError', () => {
  it('refuses leaving more than was counted', () => {
    expect(closeInputError({ counted: 250000, carryOver: 260000, firstClose: false }))
      .toBe("Ertaga qoladigan pul sanalgan puldan ko'p bo'lishi mumkin emas");
  });
  it('a first close needs Ertalab kassada', () => {
    expect(closeInputError({ counted: 250000, carryOver: 100000, firstClose: true }))
      .toBe("Birinchi yopish: ertalab kassada bo'lgan pulni kiriting");
  });
  it('a later close takes Ertalab kassada from the previous one', () => {
    expect(closeInputError({ counted: 1, carryOver: 0, opening: 5, firstClose: false }))
      .toBe('Ertalab kassada oldingi yopishdan olinadi');
  });
  it('accepts a valid close, including Ertaga qoladi equal to Sanaldi', () => {
    expect(closeInputError({ counted: 48000, carryOver: 48000, firstClose: false })).toBeNull();
    expect(closeInputError({ counted: 0, carryOver: 0, opening: 0, firstClose: true })).toBeNull();
  });
});

describe('reportDaysDue (D21 catch-up)', () => {
  it('every ended trading day after the last one done', () => {
    expect(reportDaysDue('2026-09-27', '2026-09-30')).toEqual(['2026-09-28', '2026-09-29']);
  });
  it('nothing when yesterday is done', () => {
    expect(reportDaysDue('2026-09-29', '2026-09-30')).toEqual([]);
  });
  it('a fresh install starts with yesterday only', () => {
    expect(reportDaysDue(null, '2026-09-30')).toEqual(['2026-09-29']);
  });
  it('at most the 7 latest days, oldest first', () => {
    expect(reportDaysDue('2026-09-01', '2026-09-30')).toEqual([
      '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29',
    ]);
  });
  it('crosses a month and a year', () => {
    expect(reportDaysDue('2026-09-30', '2026-10-02')).toEqual(['2026-10-01']);
    expect(reportDaysDue('2026-12-30', '2027-01-01')).toEqual(['2026-12-31']);
  });
});
```

- [ ] **Step 2: Run them red**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/day-close.test.ts 2>&1 | tail -5
```

Expected: fails to import `./day-close`.

- [ ] **Step 3: Implement**

```ts
/**
 * Closing the day (money rules D12, §3.3). Whole so'm in, whole so'm out; no
 * Prisma, no clock, so the formulas are tested on their own.
 */
import { shiftTradingDay } from './time';

export type CloseInput = { opening: number; cashIn: number; cashOut: number; counted: number; carryOver: number };
export type CloseFigures = { expected: number; diff: number; handedOver: number };

export function closeFigures(i: CloseInput): CloseFigures {
  const expected = i.opening + i.cashIn - i.cashOut;
  return { expected, diff: i.counted - expected, handedOver: i.counted - i.carryOver };
}

export function closeInputError(i: { counted: number; carryOver: number; opening?: number; firstClose: boolean }): string | null {
  if (i.firstClose && i.opening === undefined) return "Birinchi yopish: ertalab kassada bo'lgan pulni kiriting";
  if (!i.firstClose && i.opening !== undefined) return 'Ertalab kassada oldingi yopishdan olinadi';
  if (i.carryOver > i.counted) return "Ertaga qoladigan pul sanalgan puldan ko'p bo'lishi mumkin emas";
  return null;
}

/** Trading days that have ended and still owe the owner their report (D21). */
export function reportDaysDue(lastDone: string | null, currentDay: string, cap = 7): string[] {
  const lastEnded = shiftTradingDay(currentDay, -1);
  if (!lastDone) return [lastEnded];
  const days: string[] = [];
  for (let d = shiftTradingDay(lastDone, 1); d <= lastEnded; d = shiftTradingDay(d, 1)) days.push(d);
  return days.slice(-cap);
}
```

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `U_TESTS + 14` in `U_FILES + 1` files, all passing; typecheck at the floor.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/lib/day-close.ts apps/master/src/main/server/lib/day-close.test.ts
git commit -m "feat(day-close): the close formulas, pure" -m "Kutilgan, Farq and Egasiga berildi as money rules 3.3 states them, the input rules, and the trading days that still owe the owner a report."
```

---

### Task 2: The ledger over any window

**Files:**
- Modify: `apps/master/src/main/server/services/reports.service.ts:1075-1078` (`dailyLedger` head),
  `:1116-1120` (the two `expenseService.listByDate(dayAnchor…)` calls), `:1131`
  (`debtRepo.sumOutstandingAsOf(dayAnchor)`), `:1308` (`date: localDay`)
- Modify: `apps/master/src/main/server/services/expense.service.ts:85-86` (`listByDate`)
- Modify: `apps/master/src/main/server/repositories/expense.repo.ts:62-63` (`listForDate`)
- Modify: `apps/master/src/main/server/repositories/debt.repo.ts:124-127` (`sumOutstandingAsOf`)
- Test: `apps/master/e2e/07-day.test.ts` (after the first control, `:65-75`)

**Interfaces:**
- Produces: `reportsService.ledgerForRange(start: Date, end: Date, label: string)` → the same DTO
  as `dailyLedger`, over `[start, end)`; `expenseService.summaryForRange(start, end, opts)`;
  `expenseRepo.listForRange(start, end, tx?)`; `debtRepo.sumOutstandingBefore(end, tx?)`.

A drawer count covers the time since the previous count, not a trading day (Design). This is an
extraction: the body of `dailyLedger` moves into `ledgerForRange` unchanged except that every
day-anchored input becomes `start`/`end`. "Same-day reversal" becomes "same-window reversal",
which is the same rule: a REVERSAL counts against cash out only when its original is in the
fetched window.

- [ ] **Step 1: Write the failing tests**

In `apps/master/e2e/07-day.test.ts`, inside `describe('The day ledger (C29–C39)', …)` after the
first control (use P2's helper name and P3's field names as Task 0 recorded them):

```ts
  it('control: the ledger over the trading day\'s window is the day ledger', async () => {
    const { start, end } = env.svc.time.tradingDayRange(D);
    const [byDay, byWindow] = await Promise.all([
      env.svc.reports.dailyLedger(D),
      env.svc.reports.ledgerForRange(start, end, D),
    ]);
    expect(byWindow).toEqual(byDay);
  });

  it('control: a window inside the day holds only what happened in it', async () => {
    // 10:30–11:30 holds the 11:00 card bill (50 000) and nothing else.
    const part = await env.svc.reports.ledgerForRange(at(`${D}T10:30`), at(`${D}T11:30`), D);
    expect({
      closed: part.sales.closedCount,
      card: n(part.cashflow.orderCard),
      cash: n(part.cashflow.orderCash),
      cashOut: n(part.cashflow.cashOut),
    }).toEqual({ closed: 1, card: 50000, cash: 0, cashOut: 0 });
  });
```

- [ ] **Step 2: Run them red**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/07-day.test.ts 2>&1 | grep -E 'ledgerForRange|✓|×' | head
```

Expected: both new tests fail (`ledgerForRange is not a function`); the rest of the file as at
Task 0.

- [ ] **Step 3: Repositories take a window**

`expense.repo.ts`: add `listForRange(start: Date, end: Date, tx?: Tx)` holding the current
`findMany` (same `where.occurredAt: { gte: start, lt: end }`, same `include`, same `orderBy`), and
make `listForDate(date, tx)` compute its trading-day range and call it.

`debt.repo.ts`: add `sumOutstandingBefore(end: Date, tx?: Tx)` holding the current body from
`const stillOutstandingFilter` on, and make `sumOutstandingAsOf(date, tx)` compute its day's `end`
and call it.

- [ ] **Step 4: The expense summary takes a window**

`expense.service.ts`: rename the body of `listByDate` to
`summaryForRange(start: Date, end: Date, opts: { excludeCategoryIds?: string[] } = {})`, reading
`expenseRepo.listForRange(start, end)`. `listByDate(date, opts)` computes the trading-day range of
`date` and returns `this.summaryForRange(range.start, range.end, opts)`. Change the comment above
`idsInDay` to say "in this window"; nothing else in the loop changes.

- [ ] **Step 5: The ledger takes a window**

`reports.service.ts`:

```ts
  async dailyLedger(localDay: string) {
    const { start, end } = tradingDayRange(localDay);
    return this.ledgerForRange(start, end, localDay);
  },

  /**
   * The day ledger over any half-open window [start, end). A cash count
   * (DayClose) is a moment, not a day: its Kutilgan sums the window from the
   * previous count to this one. Nothing below depends on the window being a
   * day; the cash-out rule's "same day" is "same window".
   */
  async ledgerForRange(start: Date, end: Date, label: string) {
    const dayStart = start;
    const dayEnd = end;
    // … the former body of dailyLedger, unchanged, except:
    //   expenseService.listByDate(dayAnchor)               → expenseService.summaryForRange(start, end)
    //   expenseService.listByDate(dayAnchor, { exclude… })  → expenseService.summaryForRange(start, end, { exclude… })
    //   debtRepo.sumOutstandingAsOf(dayAnchor)             → debtRepo.sumOutstandingBefore(end)
    //   date: localDay                                     → date: label
    //   and every other day-anchored call Task 0 listed    → its range form
  },
```

Remove `dayAnchor` once nothing reads it. Everything Task 0 listed as carried over stays exactly
as it is in the moved body: P1's `AND: [NOT_AUTO_CANCELED]` on the CANCELED query, P6's
`waiterPayService.payoutsForRange(dayStart, dayEnd)` and `writeOffService.lossesForRange(dayStart,
dayEnd)` (they already read `dayStart`/`dayEnd`, which are now the window), and P3's `money`
block. The first control (`toEqual(byDay)`) compares the whole DTO, but once `dailyLedger`
delegates, both sides run the same body: it proves the delegation, not the carry-over. A dropped
D27 filter, a payout or write-off read against the wrong bounds, or a missing `money` is caught by
the tests that own them, which Step 6 requires to stay as at Task 0: P1's `[D27]` test in
`04-stock-cost`, P3's `money` controls in `07-day` and `17-kassa-karta`, P6's `20-waiter-pay` and
`21-write-offs`. Before Step 6, diff the moved body against the old one
(`git diff -U0 -- apps/master/src/main/server/services/reports.service.ts`): the only changed
lines are the ones in the comment block above.

- [ ] **Step 6: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+Tests'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: e2e `E_PASS + 2` passed, `E_FAIL` failed — the same failing names as Task 0, and the
D27, `money`, payout and write-off tests named in Step 5 among the passing; unit and typecheck
unchanged.

- [ ] **Step 7: Commit**

```bash
git add apps/master/src/main/server/services/reports.service.ts apps/master/src/main/server/services/expense.service.ts apps/master/src/main/server/repositories/expense.repo.ts apps/master/src/main/server/repositories/debt.repo.ts apps/master/e2e/07-day.test.ts
git commit -m "refactor(reports): the ledger over any window, the day ledger is one of them" -m "A cash count covers the time since the previous count. The formulas are unchanged; a control test pins the day ledger equal to the ledger over its trading-day window."
```

---

### Task 3: The DayClose table

**Files:**
- Modify: `apps/master/prisma/schema.prisma` — `AuditAction` (`:80-126`, add after
  `ITEM_COST_CHANGED` at `:125`), `User` relations (`:150-180`, after `stockEntries` at `:180`),
  new model after `Setting` (`:817-821`)
- Create: `apps/master/prisma/migrations/20261005100000_day_close/migration.sql` (generated, then
  renamed to the pinned name)
- Create: `apps/master/src/main/server/repositories/dayClose.repo.ts`

**Interfaces:**
- Produces: `DayClose`; `dayCloseRepo.{ latest, findByDay, findById, findCovering, create,
  hasNext, update, markReportSent }`.

- [ ] **Step 1: Schema**

```prisma
// In enum AuditAction, after ITEM_COST_CHANGED:
  DAY_CLOSED
  DAY_CLOSE_CORRECTED

// In model User, after stockEntries:
  dayClosesClosed       DayClose[]           @relation("DayCloser")

// After model Setting:
/// A cash count that closes a trading day (money rules D12). Only what the
/// admin typed is the truth (opening on a first close, counted, carryOver);
/// Kutilgan and Farq are recomputed from the ledger over [windowStart,
/// closedAt) on every read, so a correction moves them. *AtClose keep what
/// the screen showed when the count was saved.
model DayClose {
  id                   String    @id @default(cuid())
  day                  String    @unique // trading day of closedAt, "YYYY-MM-DD"
  windowStart          DateTime  // previous close's closedAt, or the trading day's start on a first close
  closedAt             DateTime  // the moment of the count; the window's end
  previousCloseId      String?   @unique // two closes can never follow the same one
  opening              Decimal   // Ertalab kassada
  cashInAtClose        Decimal   // naqd Kirim over the window, at the count
  cashOutAtClose       Decimal   // naqd Chiqim over the window, at the count
  expectedAtClose      Decimal   // Kutilgan, at the count
  counted              Decimal   // Sanaldi
  carryOver            Decimal   // Ertaga qoladi
  unpaidServiceAtClose Decimal   // waiters' unpaid Qoldiq, at the count
  closedById           String
  reportSentAt         DateTime? // set only when Telegram accepted the report
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  closedBy      User      @relation("DayCloser", fields: [closedById], references: [id])
  previousClose DayClose? @relation("DayCloseChain", fields: [previousCloseId], references: [id])
  nextClose     DayClose? @relation("DayCloseChain")

  @@index([closedAt])
  @@index([windowStart])
}
```

- [ ] **Step 2: Migrate**

The name is pinned so it sorts after every wave 1–3 migration whatever day the build runs:
create it without applying, rename the folder, then apply.

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --create-only --name day_close
docker exec -w /app/apps/master CONTAINER bash -lc 'cd prisma/migrations && mv *_day_close 20261005100000_day_close && ls | tail -3'
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev
cat apps/master/prisma/migrations/20261005100000_day_close/migration.sql
docker exec -w /app/apps/master CONTAINER bash -lc 'rm -f /tmp/p5-shadow.db && pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:/tmp/p5-shadow.db --exit-code; echo "diff exit $?"'
```

Expected: `ls` ends with `20261004110000_waiter_payouts_and_write_offs` then
`20261005100000_day_close`; one `CREATE TABLE "DayClose"` with foreign keys to `User` and to
itself, the unique indexes `DayClose_day_key` and `DayClose_previousCloseId_key`, and the indexes
on `closedAt` and `windowStart`. Nothing else: no `ALTER`, no rebuilt table. `diff exit 0` (the
migrations, applied to a fresh database, match the schema). If anything else appears, stop.

- [ ] **Step 3: Repository**

`dayClose.repo.ts`, in the style of `debt.repo.ts` (`type Tx = Prisma.TransactionClient`,
`(tx ?? getPrisma())`), every read including `closedBy: { select: { id: true, fullName: true } }`:

| Function | Query |
|---|---|
| `latest(tx?)` | `findFirst({ orderBy: { closedAt: 'desc' } })` |
| `findByDay(day)` | `findUnique({ where: { day } })` |
| `findById(id, tx?)` | `findUnique({ where: { id } })` |
| `findCovering(at)` | `findFirst({ where: { windowStart: { lte: at }, closedAt: { gt: at } } })` |
| `create(data, tx)` | `create({ data })` |
| `hasNext(id, tx)` | `count({ where: { previousCloseId: id } }) > 0` |
| `update(id, data, tx)` | `update({ where: { id }, data })` |
| `markReportSent(id, at)` | `updateMany({ where: { id, reportSentAt: null }, data: { reportSentAt: at } })` → `count === 1` |

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
```

Expected: e2e as after Task 2 (the template database now carries the table); typecheck counts
unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/master/prisma/schema.prisma apps/master/prisma/migrations apps/master/src/main/server/repositories/dayClose.repo.ts
git commit -m "feat(day-close): the DayClose table" -m "One row per cash count. What the admin typed is stored as the truth; Kutilgan is kept as it was at the count only to show later that a correction moved it."
```

---

### Task 4: Close the day with a cash count

**Files:**
- Create: `apps/master/src/main/server/services/day-close.service.ts`
- Create: `apps/master/src/main/server/controllers/day-close.controller.ts`,
  `apps/master/src/main/server/routes/day-close.routes.ts`
- Modify: `apps/master/src/main/server/app.ts:10` (import), `:38` (mount after `/api/finance`)
- Modify: `apps/master/src/main/server/lib/errors.ts:13-61` (three errors)
- Modify: `apps/master/e2e/harness.ts:115-124`
- Test: `apps/master/e2e/22-day-close.test.ts` (new)

**Interfaces:**
- Consumes: `closeFigures`, `closeInputError` (Task 1); `ledgerForRange` (Task 2); `dayCloseRepo`
  (Task 3); P2's `tradingDayOf`, `tradingDayRange`; P3's `money.kirim.naqd`, `money.chiqim.naqd`.
- Produces: `dayCloseService.{ preview(), close(input), forDay(day), figures(close), dto(close) }`;
  the routes `GET /current`, `GET /day/:day`, `POST /`; `Errors.DayAlreadyClosed()`,
  `Errors.DayCloseStale(expected: number)`, `Errors.DayCloseNotLatest()` (used in Task 7).

- [ ] **Step 1: Write the failing tests**

In `apps/master/e2e/harness.ts`, inside `svc` (`:115-124`), add:

```ts
    dayClose: (await import('../src/main/server/services/day-close.service')).dayCloseService,
```

Create `apps/master/e2e/22-day-close.test.ts`. Admin sessions last 8 hours, so every test that
moves the clock more than a few hours calls `await w.relogin()` right after `setClock`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// Closing the day with a cash count (money rules D12, §3.3), end to end.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, boot, buildWorld, capturePrints, n, sale, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const D1 = '2026-09-28';
const D2 = '2026-09-29';
const D3 = '2026-09-30';

const preview = () => w.admin.get('/api/day-close/current');
const close = (body: Record<string, unknown>) => w.admin.call('POST', '/api/day-close', body);
const closeOf = async (day: string) => (await w.admin.get(`/api/day-close/day/${day}`)).close;
const figs = (c: any) => ({
  opening: n(c.opening), cashIn: n(c.cashIn), cashOut: n(c.cashOut), expected: n(c.expected),
  counted: n(c.counted), diff: n(c.diff), carryOver: n(c.carryOver), handedOver: n(c.handedOver),
});

beforeAll(async () => {
  setClock(at(`${D1}T09:00`));
  env = await boot('day-close');
  w = await buildWorld(env.base);
  // P6's migration starts Qoldiq at the first of the month it ran in (real time), which is after
  // these days; Task 5 reads Qoldiq from D1 on, as P6's own 20-waiter-pay test does.
  await env.prisma.setting.upsert({ where: { key: 'waiter_pay_since' }, update: { value: '2026-09-01' }, create: { key: 'waiter_pay_since', value: '2026-09-01' } });
  await env.svc.settings.loadAll();
  // D1: cash 110 000 (Osh 2 + Choy 2 + Xizmat 2), card 50 000, Gaz 40 000 naqd.
  // P7: a discount needs discountReason, or confirm answers 400.
  setClock(at(`${D1}T10:00`));
  await sale(w, w.w1, [[w.items.osh, 2], [w.items.choy, 2], [w.items.xizmat, 2]], { payments: [{ method: 'CASH', amount: 110000 }] });
  setClock(at(`${D1}T11:00`));
  await sale(w, w.w2, [[w.items.somsa, 5], [w.items.non, 2], [w.items.xizmat, 2]], { discountAmount: 6000, discountReason: 'Doimiy mijoz', payments: [{ method: 'CARD', amount: 50000 }] });
  setClock(at(`${D1}T14:00`));
  await w.admin.post('/api/expenses', { amount: 40000, reason: 'Gaz', paymentMethod: 'CASH', occurredAt: at(`${D1}T14:00`).toISOString() });
  setClock(at(`${D1}T23:00`));
  await w.relogin();
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('Closing the first day', () => {
  it('[D12] the first close asks for Ertalab kassada, and Kassa is naqd only', async () => {
    const p = await preview();
    expect({ day: p.day, firstClose: p.firstClose, opening: p.opening, cashIn: n(p.cashIn), cashOut: n(p.cashOut), movement: n(p.movement) })
      .toEqual({ day: D1, firstClose: true, opening: null, cashIn: 110000, cashOut: 40000, movement: 70000 });
  });

  it('[D12] Ertaga qoladi above Sanaldi, a missing Ertalab kassada and a stale Kutilgan are refused', async () => {
    const tooMuch = await close({ opening: 200000, counted: 250000, carryOver: 260000, expectedSeen: 270000 });
    const noOpening = await close({ counted: 250000, carryOver: 100000, expectedSeen: 270000 });
    const stale = await close({ opening: 200000, counted: 250000, carryOver: 100000, expectedSeen: 999 });
    expect([tooMuch.status, noOpening.status, stale.status, stale.body.error.code, n(stale.body.error.details.expected)])
      .toEqual([400, 400, 409, 'DAY_CLOSE_STALE', 270000]);
    expect(await env.prisma.dayClose.count()).toBe(0);
  });

  it('[D12] closing saves Kutilgan, Sanaldi, Farq, Ertaga qoladi and Egasiga berildi, with who and when', async () => {
    const before = await env.svc.reports.dailyLedger(D1);
    setClock(at(`${D1}T23:10`));
    const r = await close({ opening: 200000, counted: 250000, carryOver: 100000, expectedSeen: 270000 });
    expect(r.status).toBe(201);
    expect(figs(r.body.close)).toEqual({
      opening: 200000, cashIn: 110000, cashOut: 40000, expected: 270000,
      counted: 250000, diff: -20000, carryOver: 100000, handedOver: 150000,
    });
    expect({ day: r.body.close.day, by: r.body.close.closedBy.fullName, at: r.body.close.closedAt })
      .toEqual({ day: D1, by: 'Admin', at: at(`${D1}T23:10`).toISOString() });
    const audit = await env.prisma.auditLog.findFirstOrThrow({ where: { action: 'DAY_CLOSED' } });
    expect(audit.metadata).toMatchObject({ day: D1, expected: 270000, counted: 250000, diff: -20000, handedOver: 150000 });
    // The handover to the owner is not Chiqim: the day's ledger is the same after the close.
    expect(await env.svc.reports.dailyLedger(D1)).toEqual(before);
  });

  it('[D12] a trading day closes once', async () => {
    const again = await close({ counted: 250000, carryOver: 100000, expectedSeen: 250000 });
    expect([again.status, again.body.error.code]).toEqual([409, 'DAY_ALREADY_CLOSED']);
  });

  it('[D12] a bill paid in cash after the count belongs to the next close', async () => {
    setClock(at(`${D1}T23:30`));
    await sale(w, w.w2, [[w.items.osh, 1], [w.items.xizmat, 1]], { payments: [{ method: 'CASH', amount: 50000 }] });
    expect(figs(await closeOf(D1))).toMatchObject({ expected: 270000, diff: -20000 });
  });

  it('[D12] waiters cannot reach the close', async () => {
    const r = await w.w1.call('GET', '/api/day-close/current');
    expect(r.status).toBe(403);
  });
});

describe('The next day', () => {
  beforeAll(async () => {
    setClock(at(`${D2}T12:00`));
    await w.relogin();
    await sale(w, w.w1, [[w.items.somsa, 2], [w.items.xizmat, 2]], { payments: [{ method: 'CASH', amount: 26000 }] });
  });

  it("[D12] the next close opens with the stored Ertaga qoladi, and its window starts at the last count", async () => {
    setClock(at(`${D2}T20:00`));
    await w.relogin();
    const p = await preview();
    // 50 000 from the 23:30 bill of D1 + 26 000 today.
    expect({ day: p.day, firstClose: p.firstClose, opening: n(p.opening), cashIn: n(p.cashIn), cashOut: n(p.cashOut), expected: n(p.expected), windowStart: p.windowStart })
      .toEqual({ day: D2, firstClose: false, opening: 100000, cashIn: 76000, cashOut: 0, expected: 176000, windowStart: at(`${D1}T23:10`).toISOString() });
  });
});
```

Tasks 5–7 add to this file; the D2 close itself is in Task 5.

- [ ] **Step 2: Run red**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/22-day-close.test.ts 2>&1 | grep -E '^\s+Tests|✓|×'
```

Expected: the file fails to boot (`day-close.service` missing).

- [ ] **Step 3: Errors**

In `errors.ts`, after `ExpenseReversalInvalid`:

```ts
  DayAlreadyClosed: () =>
    new AppError('DAY_ALREADY_CLOSED', 409, 'Bu kun allaqachon yopilgan'),
  DayCloseStale: (expected: number) =>
    new AppError('DAY_CLOSE_STALE', 409, `Kassa o'zgardi: Kutilgan endi ${formatUZS(expected)}. Qayta tekshiring.`, { expected }),
  DayCloseNotLatest: () =>
    new AppError('DAY_CLOSE_NOT_LATEST', 409, 'Faqat oxirgi yopishni tuzatish mumkin'),
```

(import `formatUZS` from `./format`).

- [ ] **Step 4: The service**

`day-close.service.ts`. The subtle parts, in full:

```ts
/** The one place that knows which ledger fields are the drawer (P3's `money`; P6's payouts are inside chiqim.naqd). */
function naqdOf(ledger: Ledger): { cashIn: number; cashOut: number } {
  return { cashIn: Number(ledger.money.kirim.naqd), cashOut: Number(ledger.money.chiqim.naqd) };
}

async function windowCash(start: Date, end: Date, label: string) {
  return naqdOf(await reportsService.ledgerForRange(start, end, label));
}

export const dayCloseService = {
  /** What a close made now would say. Never inside a transaction (one connection). */
  async preview(now = new Date()) {
    const day = tradingDayOf(now);
    const previous = await dayCloseRepo.latest();
    const alreadyClosed = previous?.day === day;
    const windowStart = previous ? previous.closedAt : tradingDayRange(day).start;
    const { cashIn, cashOut } = await windowCash(windowStart, now, day);
    const opening = previous ? Number(previous.carryOver) : null;
    return {
      day, alreadyClosed, firstClose: !previous, windowStart: windowStart.toISOString(),
      opening: opening === null ? null : String(opening),
      cashIn: String(cashIn), cashOut: String(cashOut), movement: String(cashIn - cashOut),
      expected: opening === null ? null : String(opening + cashIn - cashOut),
      // Task 5 fills these two:
      unpaidWaiters: [] as Array<{ waiterId: string; waiterName: string; owed: string }>,
      unpaidTotal: '0', openOrders: 0,
    };
  },

  async close(input: { counted: number; carryOver: number; opening?: number; expectedSeen: number; actorUserId: string }) {
    // The count's moment ends the window. Everything after it — a bill
    // committing a millisecond later included — is the next close's.
    const closedAt = new Date();
    const day = tradingDayOf(closedAt);
    const previous = await dayCloseRepo.latest();
    if (previous?.day === day) throw Errors.DayAlreadyClosed();
    const firstClose = !previous;
    const error = closeInputError({ ...input, firstClose });
    if (error) throw Errors.Validation(error);
    const opening = previous ? Number(previous.carryOver) : input.opening!;
    const windowStart = previous ? previous.closedAt : tradingDayRange(day).start;
    const { cashIn, cashOut } = await windowCash(windowStart, closedAt, day);
    const fig = closeFigures({ opening, cashIn, cashOut, counted: input.counted, carryOver: input.carryOver });
    // The admin counted against the Kutilgan on screen. If money moved since,
    // they must see the new one before the count is saved.
    if (fig.expected !== input.expectedSeen) throw Errors.DayCloseStale(fig.expected);
    const unpaid = await unpaidWaiters(); // Task 5; returns { total: 0 } until then

    let saved;
    try {
      saved = await getPrisma().$transaction(async (tx) => {
        // A correction of the previous close (Task 7) may have changed its
        // Ertaga qoladi since it was read above.
        if (previous) {
          const fresh = await dayCloseRepo.findById(previous.id, tx);
          if (!fresh || Number(fresh.carryOver) !== opening) throw Errors.DayCloseStale(fig.expected);
        }
        // The claim: a second close that read the same `previous` fails on the
        // unique previousCloseId; two first closes fail on the unique day.
        const row = await dayCloseRepo.create({
          day, windowStart, closedAt, previousCloseId: previous?.id ?? null,
          opening, cashInAtClose: cashIn, cashOutAtClose: cashOut, expectedAtClose: fig.expected,
          counted: input.counted, carryOver: input.carryOver, unpaidServiceAtClose: unpaid.total,
          closedById: input.actorUserId,
        }, tx);
        await auditService.log({
          userId: input.actorUserId, action: 'DAY_CLOSED', entityType: 'DayClose', entityId: row.id,
          metadata: { day, windowStart: windowStart.toISOString(), opening, cashIn, cashOut, ...fig,
            counted: input.counted, carryOver: input.carryOver },
        }, tx);
        return row;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw Errors.DayAlreadyClosed();
      throw error;
    }
    // Task 9 sends the owner's report here and returns its outcome.
    return { close: await this.dto(saved), report: 'OFF' as const };
  },

  /** Live figures: the window re-read now, so a correction moves Kutilgan and Farq. */
  async figures(c: DayCloseRow) {
    const { cashIn, cashOut } = await windowCash(c.windowStart, c.closedAt, c.day);
    const fig = closeFigures({ opening: Number(c.opening), cashIn, cashOut, counted: Number(c.counted), carryOver: Number(c.carryOver) });
    return { cashIn, cashOut, ...fig, corrected: fig.expected !== Number(c.expectedAtClose) };
  },

  async dto(c: DayCloseRow) { /* figures + stored fields as strings; isLatest = !(await dayCloseRepo.hasNext(c.id)) */ },

  async forDay(day: string) {
    const c = await dayCloseRepo.findByDay(day);
    return { close: c ? await this.dto(c) : null };
  },
};
```

`DayCloseDto` fields: `id, day, windowStart, closedAt, closedBy { id, fullName }, opening, cashIn,
cashOut, expected, counted, diff, carryOver, handedOver, expectedAtClose, corrected,
unpaidServiceAtClose, reportSentAt, isLatest` — money as strings like the ledger, dates as ISO
strings. `day` must be checked as `YYYY-MM-DD` in the controller.

- [ ] **Step 5: Controller, routes, mount**

```ts
// day-close.controller.ts
const closeBody = z.object({
  counted: somAmountOrZero,
  carryOver: somAmountOrZero,
  opening: somAmountOrZero.optional(),
  expectedSeen: z.number().int(), // Kutilgan may be below zero
});
// preview → res.json(await dayCloseService.preview())
// forDay  → z.string().regex(/^\d{4}-\d{2}-\d{2}$/) on req.params.day
// close   → res.status(201).json(await dayCloseService.close({ ...body, actorUserId: req.user!.id }))
```

`day-close.routes.ts`: `dayCloseRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']))`;
`get('/current')`, `get('/day/:day')`, `post('/')`. In `app.ts`:
`app.use('/api/day-close', dayCloseRouter);` after `/api/finance`.

- [ ] **Step 6: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: e2e `E_PASS + 2 + 7` passed, `E_FAIL` failed; typecheck at the floor.

- [ ] **Step 7: Commit**

```bash
git add apps/master/src/main/server apps/master/e2e/harness.ts apps/master/e2e/22-day-close.test.ts
git commit -m "feat(day-close): close the day with a cash count" -m "The count ends a window that started at the previous count, so a bill paid after it belongs to the next. A stale Kutilgan is refused, a day closes once, and the handover is not Chiqim."
```

---

### Task 5: Name unpaid waiter Qoldiq and open orders on the close; the second close

**Files:**
- Modify: `apps/master/src/main/server/services/day-close.service.ts` (`unpaidWaiters`, `preview`)
- Modify: `apps/master/src/main/server/repositories/order.repo.ts` (a count of DRAFT and SENT
  orders, if none exists; Task 0 checks)
- Test: `apps/master/e2e/22-day-close.test.ts` (in `describe('The next day', …)`)

**Interfaces:**
- Consumes: P6's `waiterPayService.owedByWaiter()` and payout route; P4's Naqd expense
  (`paymentMethod: 'CASH'`).
- Produces: `preview().unpaidWaiters`, `unpaidTotal`, `openOrders`; `unpaidServiceAtClose` saved.

Waiters are paid monthly (D25), so the month's Xizmat haqi can sit in the drawer. The close names
it so a payout made by hand and never entered is entered before the day closes.

- [ ] **Step 1: Write the failing tests**

Earned so far: Aziz 10 000 (D1) + 10 000 (D2) = 20 000; Bekzod 10 000 (D1) + 5 000 (the 23:30
bill) = 15 000. Append inside `describe('The next day', …)`:

```ts
  it('[D12] the close names each waiter\'s unpaid Qoldiq', async () => {
    const p = await preview();
    const rows = p.unpaidWaiters.map((r: any) => [r.waiterName, n(r.owed)]);
    expect({ rows, total: n(p.unpaidTotal) }).toEqual({ rows: [['Aziz', 20000], ['Bekzod', 15000]], total: 35000 });
  });

  it('[D12] a payout entered before closing is naqd Chiqim and leaves the unpaid list', async () => {
    setClock(at(`${D2}T21:00`));
    await w.relogin();
    await w.admin.post('/api/finance/waiter-payouts', { waiterId: w.waiterIds.w1, amount: 20000 });
    const p = await preview();
    expect({ cashOut: n(p.cashOut), expected: n(p.expected), unpaid: p.unpaidWaiters.map((r: any) => r.waiterName), total: n(p.unpaidTotal) })
      .toEqual({ cashOut: 20000, expected: 156000, unpaid: ['Bekzod'], total: 15000 });
  });

  it('[D12] a forgotten expense entered before closing lowers Kutilgan to what the drawer holds', async () => {
    // Counted 151 000 against 156 000 would be Farq −5 000; the ice bought at 18:00 was never entered.
    setClock(at(`${D2}T22:05`));
    await w.relogin();
    await w.admin.post('/api/expenses', { amount: 5000, reason: 'Muz', paymentMethod: 'CASH', occurredAt: at(`${D2}T22:05`).toISOString() });
    expect(n((await preview()).expected)).toBe(151000);
  });

  it('[D12] the close shows orders still open; they belong to the next close', async () => {
    const id = await openOrder(w.w2, w.nextTable(), [[w.items.choy, 1]]);
    expect((await preview()).openOrders).toBe(1);
    await w.admin.call('POST', `/api/orders/${id}/cancel`, { reason: 'Test' });
  });

  it('[D12] two closes at the same moment: exactly one is saved', async () => {
    setClock(at(`${D2}T22:30`));
    await w.relogin();
    const body = { counted: 151000, carryOver: 51000, expectedSeen: 151000 };
    const [a, b] = await Promise.all([close(body), close(body)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const saved = await closeOf(D2);
    expect(figs(saved)).toEqual({
      opening: 100000, cashIn: 76000, cashOut: 25000, expected: 151000,
      counted: 151000, diff: 0, carryOver: 51000, handedOver: 100000,
    });
    expect(n(saved.unpaidServiceAtClose)).toBe(15000);
  });
```

(`openOrder` comes from `./harness`; add it to the import.)

- [ ] **Step 2: Run red**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/22-day-close.test.ts 2>&1 | grep -E '^\s+Tests|×'
```

Expected: the unpaid and open-orders tests fail; the payout, expense and race tests may already
pass (they exercise Tasks 2 and 4 with P4 and P6).

- [ ] **Step 3: Implement**

`unpaidWaiters()`: `await waiterPayService.owedByWaiter()` (`[{ waiterId, waiterName, owed:
string }]`, Qoldiq since `waiter_pay_since`), keep `Number(owed) > 0` (a negative row is an
avans given ahead, not cash owed from the drawer), sort by `waiterName`, and return
`{ rows, total }`. `preview()` fills `unpaidWaiters`, `unpaidTotal`, and `openOrders` (DRAFT +
SENT, through a repository count). `close()` saves `unpaid.total`.

- [ ] **Step 4: Verify**

Same commands as Task 4. Expected: `E_PASS + 14` passed.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server apps/master/e2e/22-day-close.test.ts
git commit -m "feat(day-close): name unpaid waiter Qoldiq and open orders on the close" -m "Waiters are paid monthly, so their Xizmat haqi may sit in the drawer; the close shows it so a payout made by hand is entered before the count."
```

---

### Task 6: A correction to a closed day moves its Kutilgan and Farq

**Files:**
- Modify: `apps/master/src/main/server/services/day-close.service.ts` (`stampInsideClose`,
  `figuresCovering`)
- Modify: `apps/master/src/main/server/services/day-correction.service.ts` (P4's `snapshot`:
  fill `expected` and `difference`; `isClosedDay` is not touched)
- Modify: `apps/master/src/main/server/services/expense.service.ts` (P4's `create`, the
  correction branch: stamp inside the close before `dayCorrectionService.apply`)
- Test: `apps/master/e2e/22-day-close.test.ts` (new `describe('Corrections', …)`)

**Interfaces:**
- Consumes: P4's `dayCorrectionService.snapshot`, `DaySnapshot`, `formatDayCorrection` (its
  Kutilgan and Farq lines), `expenseService.create`'s correction branch; P2's `tradingDayRange`.
- Produces: `dayCloseService.stampInsideClose(day: string, at: Date): Promise<Date>`;
  `dayCloseService.figuresCovering(at: Date): Promise<{ expected: number; diff: number } | null>`;
  `dayCorrectionService.snapshot(tradingDay)` → `{ profit, expected?, difference? }`.

There is one owner message for a correction: P4's `formatDayCorrection`, which already prints
`Kutilgan: … → … so'm` and `Farq: … → … so'm` when both snapshots carry `expected` and
`difference`. This task fills those two fields; it does not append lines or build a second
message path.

**`isClosedDay` keeps P4's body** (`tradingDay < tradingDayOf(new Date())`, any trading day before
today's). It is not narrowed to "has a `DayClose` row", because:

- a day with no close of its own is still counted, by the next close's window, so a change to
  it moves a saved Kutilgan; as an ordinary entry it would move silently, with no owner message
  (D13, D23: every correction messages the owner);
- a past day not yet covered by any close was already reported at 05:00 as "kun yopilmadi"
  (D21), so a change to it changes what the owner was told;
- today stays ordinary even after today's count (`expenseDayRule` never makes today a
  correction): money entered after the count belongs to the next close, which is where the cash
  is.

- [ ] **Step 1: Write the failing e2e tests**

Append to `22-day-close.test.ts`:

```ts
describe('Corrections', () => {
  it('[D13] a correction to a closed day recomputes its Kutilgan and Farq; the next day\'s Ertalab kassada stays', async () => {
    setClock(at(`${D3}T10:00`));
    await w.relogin();
    const spy = vi.spyOn(env.svc.telegram, 'sendMessage').mockResolvedValue('SENT');
    // The 20 000 that left the drawer on D1 and was never entered (P4's explicit correction).
    const r = await w.admin.call('POST', '/api/expenses', {
      amount: 20000, reason: 'Qassob', paymentMethod: 'CASH', occurredAt: at(`${D1}T12:00`).toISOString(), correction: true,
    });
    expect(r.status).toBeLessThan(300);
    const d1 = await closeOf(D1);
    const d2 = await closeOf(D2);
    expect({ d1: figs(d1), corrected: d1.corrected, d2opening: n(d2.opening), d2expected: n(d2.expected) }).toEqual({
      d1: { opening: 200000, cashIn: 110000, cashOut: 60000, expected: 250000, counted: 250000, diff: 0, carryOver: 100000, handedOver: 150000 },
      corrected: true, d2opening: 100000, d2expected: 151000,
    });
    // P4's one correction message carries the count, through formatDayCorrection.
    const msgs = spy.mock.calls.map((c) => String(c[0]));
    spy.mockRestore();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("Kutilgan: 270 000 → 250 000 so'm");
    expect(msgs[0]).toContain("Farq: -20 000 → 0 so'm");
  });

  it('[D13] a correction is booked inside the closed day\'s window, whatever time it was given', async () => {
    const row = await env.prisma.expense.findFirstOrThrow({ where: { reason: 'Qassob' } });
    const c = await env.prisma.dayClose.findUniqueOrThrow({ where: { day: D1 } });
    expect(row.occurredAt.getTime()).toBeLessThan(c.closedAt.getTime());
    expect(row.occurredAt.getTime()).toBeGreaterThanOrEqual(c.windowStart.getTime());
    // A stamp at or after the count (a morning count, or 23:50 here) moves to one second before it.
    const moved = await env.svc.dayClose.stampInsideClose(D1, at(`${D1}T23:50`));
    expect(moved.toISOString()).toBe(new Date(at(`${D1}T23:10`).getTime() - 1000).toISOString());
  });
});
```

(add `vi` to the vitest import).

- [ ] **Step 2: Run red**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/22-day-close.test.ts 2>&1 | grep -E '^\s+Tests|×'
```

Expected: the figures assertion passes already (P4's form stamps 12:00, before the 23:10 count,
and Task 4 recomputes on read); the message assertion fails (no `Kutilgan` line) and the second
test fails (`stampInsideClose is not a function`).

- [ ] **Step 3: Implement**

In `day-close.service.ts`:

```ts
  /**
   * A correction to day N lands in the close that counted N's cash. If N was
   * closed and the stamp falls at or after the count, it moves to one second
   * before it. A day with no close of its own lies wholly inside the next
   * close's window, so its stamps need nothing.
   */
  async stampInsideClose(day: string, at: Date): Promise<Date> {
    const c = await dayCloseRepo.findByDay(day);
    if (!c || at.getTime() < c.closedAt.getTime()) return at;
    return new Date(c.closedAt.getTime() - 1000);
  },

  async figuresCovering(at: Date) {
    const c = await dayCloseRepo.findCovering(at);
    if (!c) return null;
    const f = await this.figures(c);
    return { expected: f.expected, diff: f.diff };
  },
```

In P4's `day-correction.service.ts`, `snapshot` fills the two fields P4 left for this package:

```ts
async function snapshot(tradingDay: string): Promise<DaySnapshot> {
  // Lazy: reports.service imports expense.service, which imports this file; day-close.service
  // imports reports.service.
  const { reportsService } = await import('./reports.service');
  const { dayCloseService } = await import('./day-close.service');
  const ledger = await reportsService.dailyLedger(tradingDay);
  // The close that counted this day's cash covers the day's 05:00: its own close if it has one
  // (whose window runs from the previous count, made on an earlier trading day, to this day's
  // count), else the next close, whose window holds the whole day. None yet: no count to report.
  const count = await dayCloseService.figuresCovering(tradingDayRange(tradingDay).start);
  return count
    ? { profit: ledger.pnl.profit, expected: String(count.expected), difference: String(count.diff) }
    : { profit: ledger.pnl.profit };
}
```

P4's `apply` already takes `before` outside the transaction and `after` after the commit, inside
its serial runner, so the two counts are read on the one connection and in order. A correction
that moves no cash (P6's write-off day corrections) prints Kutilgan and Farq unchanged, which tells
the owner the count did not move.

In P4's `expenseService.create`, in the correction branch only, stamp the entry inside the close
before `dayCorrectionService.apply` (and so before its transaction):

```ts
    if (rule.isCorrection) {
      const { dayCloseService } = await import('./day-close.service'); // lazy, as above
      input.occurredAt = await dayCloseService.stampInsideClose(day, input.occurredAt);
      const { result } = await dayCorrectionService.apply({ /* as P4 */ });
```

`write` reads `input.occurredAt` when it runs, inside `apply`, so it sees the stamped value; if
P4's code copied `occurredAt` into a local before this point, stamp that local instead. `day` is
unchanged by the stamp (it only moves earlier inside day N's own window). An ordinary entry is
never restamped: today's money after the count belongs to the next close.

**`expenseService.reverse` is not restamped.** P4 stamps the REVERSAL row with its original's
`occurredAt`, so the pair always sits in one close's window, which the ledger's same-window
reversal rule needs (Task 2). Moving only the REVERSAL inside N's close when its original sits
after N's count would split the pair: the next close would still count the undone expense as
cash out, and N's close would not net the reversal either.

- [ ] **Step 4: Verify**

Same as Task 4, plus `pnpm test`. Expected: e2e `E_PASS + 16` passed; unit unchanged; P4's own
correction tests (`05-expenses`, `19-day-correction`) and its `formatDayCorrection` unit tests
still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server apps/master/e2e/22-day-close.test.ts
git commit -m "feat(day-close): a correction to a closed day moves its Kutilgan and Farq" -m "Kutilgan is recomputed on every read, and a correction is booked inside the closed day's window. It never ripples into the next day: Ertalab kassada is the cash that was counted and left. The owner's correction message carries Kutilgan and Farq before and after."
```

---

### Task 7: Correct the latest close

**Files:**
- Modify: `apps/master/src/main/server/services/day-close.service.ts` (`correct`)
- Modify: `apps/master/src/main/server/controllers/day-close.controller.ts`,
  `routes/day-close.routes.ts` (`patch('/:id')`)
- Modify: `apps/master/src/main/server/services/alert.service.ts:76` (new `dayCloseCorrected`)
- Create: `apps/master/src/main/server/lib/day-close-message.ts` (+ `.test.ts`) —
  `countChangeLines` in this task; Task 8 adds the rest
- Test: `apps/master/e2e/22-day-close.test.ts`

**Interfaces:**
- Consumes: P2's `formatDayKeyUZ` for the message's date.
- Produces: `PATCH /api/day-close/:id { counted, carryOver, opening? }` → `{ close }`;
  `alertService.dayCloseCorrected(p)`; `countChangeLines(before, after): string[]`.

A mistyped Sanaldi or Ertaga qoladi would otherwise be permanent, and a wrong Ertaga qoladi
would make the next close's Ertalab kassada wrong. Only the latest close can change: a later
close has already started from its Ertaga qoladi.

- [ ] **Step 1: Failing tests**

Unit, a new `day-close-message.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countChangeLines } from './day-close-message';

describe('countChangeLines', () => {
  it('names only the figures that changed', () => {
    expect(countChangeLines(
      { counted: 151000, diff: 0, carryOver: 51000, handedOver: 100000 },
      { counted: 150000, diff: -1000, carryOver: 50000, handedOver: 100000 },
    )).toEqual([
      "Sanaldi: <b>151 000</b> → <b>150 000</b> so'm",
      "Farq: <b>0</b> → <b>-1 000</b> so'm",
      "Ertaga qoladi: <b>51 000</b> → <b>50 000</b> so'm",
    ]);
  });
});
```

e2e, appended inside `describe('Corrections', …)`:

```ts
  it('[D12] the latest close can be corrected; an older one cannot', async () => {
    setClock(at(`${D3}T10:30`));
    const d1 = await closeOf(D1);
    const d2 = await closeOf(D2);
    const spy = vi.spyOn(env.svc.telegram, 'sendMessage').mockResolvedValue('SENT');
    const old = await w.admin.call('PATCH', `/api/day-close/${d1.id}`, { counted: 260000, carryOver: 100000 });
    const r = await w.admin.call('PATCH', `/api/day-close/${d2.id}`, { counted: 150000, carryOver: 50000 });
    const msgs = spy.mock.calls.map((c) => String(c[0]));
    spy.mockRestore();
    expect([old.status, old.body.error?.code, r.status]).toEqual([409, 'DAY_CLOSE_NOT_LATEST', 200]);
    expect(figs(r.body.close)).toMatchObject({ counted: 150000, diff: -1000, carryOver: 50000, handedOver: 100000 });
    const audit = await env.prisma.auditLog.findFirstOrThrow({ where: { action: 'DAY_CLOSE_CORRECTED' } });
    expect(audit.metadata).toMatchObject({ before: { counted: 151000, carryOver: 51000 }, after: { counted: 150000, carryOver: 50000 } });
    expect(msgs.some((m) => m.includes('Kun yopilishi tuzatildi') && m.includes("Sanaldi: <b>151 000</b> → <b>150 000</b> so'm"))).toBe(true);
  });
```

- [ ] **Step 2: Run red**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/22-day-close.test.ts 2>&1 | grep -E '^\s+Tests|×'
```

Expected: the unit file fails to import `./day-close-message`; the PATCH test fails (404).

- [ ] **Step 3: Implement**

```ts
  async correct(input: { id: string; counted: number; carryOver: number; opening?: number; actorUserId: string; actorName: string }) {
    const c = await dayCloseRepo.findById(input.id);
    if (!c) throw Errors.NotFound('DayClose');
    const firstClose = c.previousCloseId === null;
    // On a first close Ertalab kassada was typed, so it may be retyped; otherwise it is the previous Ertaga qoladi.
    const error = closeInputError({ counted: input.counted, carryOver: input.carryOver, opening: firstClose ? input.opening ?? Number(c.opening) : input.opening, firstClose });
    if (error) throw Errors.Validation(error);
    const before = await this.figures(c);                        // before the transaction: one connection
    const opening = firstClose ? input.opening ?? Number(c.opening) : Number(c.opening);
    await getPrisma().$transaction(async (tx) => {
      if (await dayCloseRepo.hasNext(c.id, tx)) throw Errors.DayCloseNotLatest();
      await dayCloseRepo.update(c.id, { counted: input.counted, carryOver: input.carryOver, opening }, tx);
      await auditService.log({ userId: input.actorUserId, action: 'DAY_CLOSE_CORRECTED', entityType: 'DayClose', entityId: c.id,
        metadata: { day: c.day,
          before: { opening: Number(c.opening), counted: Number(c.counted), carryOver: Number(c.carryOver), diff: before.diff, handedOver: before.handedOver },
          after: { opening, counted: input.counted, carryOver: input.carryOver } } }, tx);
    });
    const fresh = (await dayCloseRepo.findById(c.id))!;
    const after = await this.figures(fresh);
    await alertService.dayCloseCorrected({ day: c.day, who: input.actorName, before, after });
    return { close: await this.dto(fresh) };
  },
```

`alertService.dayCloseCorrected` sends `<b>Kun yopilishi tuzatildi</b> — DD.MM.YYYY` (`formatDayKeyUZ(day)`), `Kim: …`,
then `countChangeLines(before, after)` (Sanaldi, Farq, Ertaga qoladi, Egasiga berildi — each only
when it changed). The controller takes `req.user!.id` and the user's full name (as the other
controllers do; Task 0 checks where `fullName` comes from).

- [ ] **Step 4: Verify** (as Task 4). Expected: e2e `E_PASS + 17`; unit `+1`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server apps/master/e2e/22-day-close.test.ts
git commit -m "feat(day-close): correct the latest close" -m "A mistyped Sanaldi or Ertaga qoladi can be fixed while no later close has started from it. Audit row and owner message, as every correction."
```

---

### Task 8: Telegram says whether it accepted a message; the report text

**Files:**
- Modify: `apps/master/src/main/server/services/telegram-bot.service.ts:698-711` (`sendMessage`)
- Create: `apps/master/src/main/server/lib/within.ts` (+ `.test.ts`)
- Modify: `apps/master/src/main/server/lib/day-close-message.ts` (+ test) — `closeBlockLines`,
  `UNCLOSED_HEADER`, `LATE_CHANGE_HEADER`

**Interfaces:**
- Produces: `type DeliveryResult = 'SENT' | 'BOT_OFF' | 'FAILED'`; `sendMessage(text):
  Promise<DeliveryResult>`; `within<T>(p: Promise<T>, ms: number): Promise<T | 'PENDING'>`;
  `closeBlockLines(b: CloseBlock): string[]`.

D21: a report is logged as sent only when Telegram accepts it. Today `sendMessage` returns nothing
whether the bot is off, Telegram refused, or it worked.

- [ ] **Step 1: Failing unit tests**

`within.test.ts` (fake timers): a promise resolving at 1 s within 5 s gives its value; one that
never settles gives `'PENDING'` at 5 s.

`day-close-message.test.ts`:

```ts
  it('closeBlockLines: the close as the owner reads it', () => {
    expect(closeBlockLines({
      closedAt: '23:10', closedBy: 'Admin', windowFrom: null,
      opening: 200000, cashIn: 110000, cashOut: 40000, expected: 270000, counted: 250000,
      diff: -20000, carryOver: 100000, handedOver: 150000, unpaidService: 35000,
    })).toEqual([
      '━━━━━━━━━━━━━━━━━━━━',
      '<b>Kun yopildi</b> — 23:10, Admin',
      "  Ertalab kassada: <b>200 000</b> so'm",
      "  Naqd kirim: <b>110 000</b> so'm",
      "  Naqd chiqim: <b>40 000</b> so'm",
      "  Kutilgan: <b>270 000</b> so'm",
      "  Sanaldi: <b>250 000</b> so'm",
      "  Farq: <b>-20 000</b> so'm (kam)",
      "  Ertaga qoladi: <b>100 000</b> so'm",
      "  Egasiga berildi: <b>150 000</b> so'm",
      "  Ofitsiantlar qoldig'i: <b>35 000</b> so'm",
    ]);
  });

  it('closeBlockLines: a window over several days says so; a surplus says ortiqcha; no Qoldiq line at 0', () => {
    const lines = closeBlockLines({
      closedAt: '23:00', closedBy: 'Admin', windowFrom: '28.09.2026 23:00 — 01.10.2026 23:00',
      opening: 48000, cashIn: 143000, cashOut: 0, expected: 191000, counted: 192000,
      diff: 1000, carryOver: 92000, handedOver: 100000, unpaidService: 0,
    });
    expect(lines[2]).toBe('  Davr: 28.09.2026 23:00 — 01.10.2026 23:00');
    expect(lines).toContain("  Farq: <b>1 000</b> so'm (ortiqcha)");
    expect(lines.some((l) => l.includes('qoldig'))).toBe(false);
  });

  it('the two headers', () => {
    expect(UNCLOSED_HEADER).toBe('<b>Kun yopilmadi</b> — kassa sanalmadi');
    expect(LATE_CHANGE_HEADER).toBe("<b>Kun yopilgandan keyin o'zgardi</b>");
  });
```

- [ ] **Step 2: Run red**, then **Step 3: Implement**

```ts
  async sendMessage(text: string): Promise<DeliveryResult> {
    if (!botInstance) {
      console.warn('[TelegramBot] Xabar yuborib bo\'lmadi: Bot yoqilmagan');
      return 'BOT_OFF';
    }
    const chatId = settingsService.get('owner_telegram_chat_id');
    if (!chatId) return 'BOT_OFF';
    try {
      await botInstance.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
      return 'SENT';
    } catch (error) {
      console.error('[TelegramBot] Xabar yuborishda xatolik:', error);
      return 'FAILED';
    }
  },
```

`alertService.send` keeps working unchanged (it ignores the value). `closeBlockLines` uses
`formatUZS`; Farq `(kam)` below 0, `(ortiqcha)` above 0, nothing at 0.

- [ ] **Step 4: Verify** — `pnpm test` (`+5`), `pnpm typecheck` at the floor, e2e unchanged (the
alert tests still pass).

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server
git commit -m "feat(telegram): say whether Telegram accepted a message" -m "sendMessage answers SENT, BOT_OFF or FAILED instead of swallowing the outcome, so a report can be logged as sent only when it was. The close block of the owner's report, pure."
```

---

### Task 9: Send the owner's report when the day closes

**Files:**
- Modify: `apps/master/src/main/server/services/finance-report.service.ts:43-46` (reuse
  `getOwnerUserId`), new `ownerDayReportEnabled`, `sendCloseReport`, a module-level serial runner
  from P4's `createSerialRunner`
- Modify: `apps/master/src/main/server/services/day-close.service.ts` (`close` returns the outcome)
- Rewrite: `apps/master/e2e/09-nightly-report.test.ts:27-46` (the first two tests; the third is
  Task 10's)

**Interfaces:**
- Consumes: P4's `createSerialRunner` (`lib/serial-runner.ts`); P2's `tradingDayOf`,
  `shiftTradingDay`.
- Produces: `financeReportService.ownerDayReportEnabled(): boolean`;
  `financeReportService.sendCloseReport(closeId): Promise<DeliveryResult | 'OFF'>`; `POST
  /api/day-close` answers `report: 'SENT' | 'BOT_OFF' | 'FAILED' | 'OFF' | 'PENDING'`.

- [ ] **Step 1: Failing e2e tests**

Replace `09-nightly-report.test.ts` from `describe('Nightly report', …)` with the D21 suite
(Task 10 adds the rest). Days: A `2026-09-27`, B `2026-09-28`.

```ts
const A = '2026-09-27';
const B = '2026-09-28';
const setTelegram = async () => {
  await setSetting('telegram_bot_token', '000000:placeholder');
  await setSetting('owner_telegram_chat_id', '42');
};
const closeDay = (body: Record<string, unknown>) => w.admin.call('POST', '/api/day-close', body);

describe("The owner's day report (D21)", () => {
  it('[D21] on by default once Telegram is configured, with nothing seeded', async () => {
    expect(env.svc.financeReport.ownerDayReportEnabled(), 'no token yet').toBe(false);
    await setTelegram();
    expect(env.svc.financeReport.ownerDayReportEnabled(), 'daily_report_telegram_enabled is not seeded on a packaged install').toBe(true);
    await setSetting('daily_report_telegram_enabled', 'false');
    expect(env.svc.financeReport.ownerDayReportEnabled()).toBe(false);
    await setSetting('daily_report_telegram_enabled', '');
  });

  it('[issue 22] a report Telegram did not accept is not recorded as sent', async () => {
    // Configured, but the bot is not running (getMe() failed at start-up).
    setClock(at(`${A}T20:00`));
    await w.relogin();
    await sale(w, w.w1, [[w.items.osh, 1]], { payments: [{ method: 'CASH', amount: 45000 }] });
    setClock(at(`${A}T23:00`));
    const r = await closeDay({ opening: 100000, counted: 140000, carryOver: 40000, expectedSeen: 145000 });
    const row = await env.prisma.dayClose.findUniqueOrThrow({ where: { day: A } });
    const sent = await env.prisma.auditLog.count({ where: { action: 'REPORT_SENT' } });
    expect({ status: r.status, report: r.body.report, reportSentAt: row.reportSentAt, sent })
      .toEqual({ status: 201, report: 'BOT_OFF', reportSentAt: null, sent: 0 });
  });

  it('[D21] closing the day sends the owner the report with the count', async () => {
    setClock(at(`${B}T12:00`));
    await w.relogin();
    await sale(w, w.w1, [[w.items.somsa, 1]], { payments: [{ method: 'CASH', amount: 8000 }] });
    const spy = vi.spyOn(env.svc.telegram, 'sendMessage').mockResolvedValue('SENT');
    setClock(at(`${B}T23:00`));
    await w.relogin();
    const r = await closeDay({ counted: 48000, carryOver: 48000, expectedSeen: 48000 });
    const msgs = spy.mock.calls.map((c) => String(c[0]));
    spy.mockRestore();
    expect(r.body.report).toBe('SENT');
    expect(msgs).toHaveLength(1);
    for (const line of ["Kutilgan: <b>48 000</b> so'm", "Sanaldi: <b>48 000</b> so'm", "Farq: <b>0</b> so'm", "Egasiga berildi: <b>0</b> so'm"]) {
      expect(msgs[0]).toContain(line);
    }
    const row = await env.prisma.dayClose.findUniqueOrThrow({ where: { day: B } });
    expect(row.reportSentAt?.toISOString()).toBe(at(`${B}T23:00`).toISOString());
    const audit = await env.prisma.auditLog.findMany({ where: { action: 'REPORT_SENT' } });
    expect(audit.map((a) => a.metadata)).toEqual([expect.objectContaining({ date: B, kind: 'closed' })]);
  });
});
```

Change the file's header comment to `// The owner's day report (D21) on a production-seeded
install.`, the start clock to `at(\`${A}T09:00\`)`, and import `vi`.

- [ ] **Step 2: Run red.** Expected: the three tests fail (`ownerDayReportEnabled` missing,
`report` is `'OFF'`).

- [ ] **Step 3: Implement**

```ts
import { createSerialRunner } from '../lib/serial-runner'; // P4's, not a second lock

/** One owner report at a time: the close and the 05:00 run must never send the same day twice. */
const serial = createSerialRunner();

  ownerDayReportEnabled(): boolean {
    if (!settingsService.get('telegram_bot_token') || !settingsService.get('owner_telegram_chat_id')) return false;
    return settingsService.get('daily_report_telegram_enabled') !== 'false';
  },

  sendCloseReport(closeId: string): Promise<DeliveryResult | 'OFF'> {
    return serial(async () => {
      if (!this.ownerDayReportEnabled()) return 'OFF';
      const c = await dayCloseRepo.findById(closeId);
      if (!c) return 'OFF';
      if (c.reportSentAt) return 'SENT';
      const result = await telegramBotService.sendMessage(await closeReportText(c));
      await logDelivery(c.day, 'closed', result); // REPORT_SENT on SENT, REPORT_SEND_FAILED otherwise
      if (result === 'SENT') await dayCloseRepo.markReportSent(c.id, new Date());
      return result;
    });
  },
```

`closeReportText(c)`: P3's `formatReportMessage(anchor, await reportsService.daily(anchor))` for
`c.day`, then `closeBlockLines` from `dayCloseService.figures(c)` (live), `closedAt` as Tashkent
`HH:MM`, `closedBy.fullName`, and `windowFrom` (`DD.MM.YYYY HH:MM — DD.MM.YYYY HH:MM`) only when
`tradingDayOf(c.windowStart) < shiftTradingDay(c.day, -1)` — the previous count was made before
yesterday, so a day between them was never closed. `logDelivery` writes the audit row with
`userId` = the active owner (`getOwnerUserId`), `entityType: 'Report'`,
`metadata: { date, kind, channel: 'telegram' }` (plus `reason` on a failure). Here, a person's
action, BOT_OFF writes `REPORT_SEND_FAILED` with reason `bot_off`; the scheduler (Task 10) writes
nothing for BOT_OFF.

In `dayCloseService.close`, replace the placeholder return:

```ts
    const report = await within(financeReportService.sendCloseReport(saved.id), 5_000);
    return { close: await this.dto(saved), report };
```

`within` leaves a slower send running; its outcome still stamps `reportSentAt`.

- [ ] **Step 4: Verify** — e2e: the three new 09 tests pass; the three old 23:30 tests are gone
(the third, `[issue 22] bills closed after the send time…`, is rewritten in Task 10; delete it
here); every other test as after Task 7; typecheck at the floor.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server apps/master/e2e/09-nightly-report.test.ts
git commit -m "feat(day-close): send the owner's report when the day closes" -m "The report carries the count and is logged as sent only when Telegram accepts it. On by default once a bot token and an owner chat are set."
```

---

### Task 10: The report at 05:00 for a day not closed, and at the next start

**Files:**
- Modify: `apps/master/src/main/server/services/finance-report.service.ts:15-34` (drop the unused
  `formatMoney`), `:49-139` (the 23:30 path goes), new `runOwnerDayReports`
- Modify: `apps/master/src/main/server/lib/scheduler.ts:37-39`, `:43-46`
- Modify: `apps/master/src/main/server/services/settings.service.ts:27`, `:46`
  (`daily_report_telegram_time` out of both lists)
- Modify: `apps/master/prisma/seed.ts:120-121` (`'true'`; the time row goes)
- Modify: `apps/master/e2e/16-trading-day.test.ts` (P2's daily-trigger tests go, if present; the
  monthly test stays)
- Test: `apps/master/e2e/09-nightly-report.test.ts` (rest of the D21 suite)

**Interfaces:**
- Consumes: P2's `tradingDayOf`, `tradingDayRange`, and its monthly trigger
  (`shouldSendMonthlyTelegram`, untouched).
- Produces: `financeReportService.runOwnerDayReports(now?: Date): Promise<void>`; setting
  `daily_report_last_sent_date` now means "the last ended trading day whose report duty is done".

- [ ] **Step 1: Failing e2e tests**

Continue the 09 suite. The clock only moves forward, so the first test below goes **between**
Task 9's `[issue 22]` test and its "closing the day sends…" test; the rest go after it. `run` is
declared at the top of the `describe`:

```ts
  const run = async (local: string) => {
    const spy = vi.spyOn(env.svc.telegram, 'sendMessage').mockResolvedValue('SENT');
    setClock(at(local));
    await env.svc.financeReport.runOwnerDayReports();
    const msgs = spy.mock.calls.map((c) => String(c[0]));
    spy.mockRestore();
    return msgs;
  };

  it('[D21] a close whose report Telegram refused is sent after 05:00, once', async () => {
    const first = await run(`${B}T05:01`); // day A ended at 05:00 on B
    const again = await run(`${B}T05:02`);
    const row = await env.prisma.dayClose.findUniqueOrThrow({ where: { day: A } });
    expect({ first: first.length, again: again.length, hasCount: first[0]?.includes("Kutilgan: <b>145 000</b> so'm"), sentAt: !!row.reportSentAt })
      .toEqual({ first: 1, again: 0, hasCount: true, sentAt: true });
  });

  it('[D21] a closed day already reported sends nothing more at 05:00', async () => {
    expect(await run('2026-09-29T05:01')).toEqual([]);
  });

  it('[D21] a day not closed by 05:00 is sent at 05:00, marked "kun yopilmadi"', async () => {
    setClock(at('2026-09-29T13:00'));
    await w.relogin();
    await sale(w, w.w1, [[w.items.osh, 2]], { payments: [{ method: 'CASH', amount: 90000 }] });
    const msgs = await run('2026-09-30T05:01');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.startsWith('<b>Kun yopilmadi</b> — kassa sanalmadi')).toBe(true);
    expect(msgs[0]).toContain('29.09.2026');
  });

  it('[D21] with the till off at 05:00, the report goes at the next start', async () => {
    setClock(at('2026-09-30T12:00'));
    await w.relogin();
    await sale(w, w.w1, [[w.items.somsa, 1]], { payments: [{ method: 'CASH', amount: 8000 }] });
    // No run at 05:00 on 01.10 — the till was off. It starts at 09:00.
    const msgs = await run('2026-10-01T09:00');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('30.09.2026');
  });

  it("[issue 22] a bill closed after the day's count reaches the owner at 05:00", async () => {
    setClock(at('2026-10-01T20:00'));
    await w.relogin();
    await sale(w, w.w1, [[w.items.osh, 1]], { payments: [{ method: 'CASH', amount: 45000 }] });
    // The window runs from B's count (28.09 23:00): 90 000 + 8 000 + 45 000 = 143 000 in; Ertalab kassada 48 000.
    const spy = vi.spyOn(env.svc.telegram, 'sendMessage').mockResolvedValue('SENT');
    setClock(at('2026-10-01T23:00'));
    const r = await closeDay({ counted: 191000, carryOver: 91000, expectedSeen: 191000 });
    spy.mockRestore();
    expect(r.body.report).toBe('SENT');
    setClock(at('2026-10-01T23:30'));
    await sale(w, w.w2, [[w.items.somsa, 1]], { payments: [{ method: 'CASH', amount: 8000 }] });
    const msgs = await run('2026-10-02T05:01');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.startsWith("<b>Kun yopilgandan keyin o'zgardi</b>")).toBe(true);
    expect(msgs[0]).toContain("Kutilgan: <b>191 000</b> so'm"); // the count's window is unchanged
  });

  it('[D21] a day with no bill and no money gets no report', async () => {
    expect(await run('2026-10-03T05:01')).toEqual([]);
    expect(env.svc.settings.get('daily_report_last_sent_date')).toBe('2026-10-02');
  });
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement**

```ts
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;
const retryNotBefore = new Map<string, number>();

  /**
   * D21: every ended trading day owes the owner one report. Runs at start-up
   * (a till that was off catches up) and every minute. A day's duty is done
   * when its report was accepted, or when it needs none; only then does the
   * marker move, so nothing is skipped by a failure.
   */
  runOwnerDayReports(now = new Date()): Promise<void> {
    return serial(async () => {
      if (!this.ownerDayReportEnabled()) return;
      const due = reportDaysDue(settingsService.get('daily_report_last_sent_date') || null, tradingDayOf(now));
      for (const day of due) {
        if ((retryNotBefore.get(day) ?? 0) > now.getTime()) return;
        const result = await dayDuty(day); // 'SENT' | 'NONE' | 'BOT_OFF' | 'FAILED'
        if (result === 'BOT_OFF') return; // the bot is still starting; try next minute
        if (result === 'FAILED') {
          retryNotBefore.set(day, now.getTime() + RETRY_AFTER_FAILURE_MS);
          return;
        }
        retryNotBefore.delete(day);
        await settingRepo.upsert('daily_report_last_sent_date', day);
        await settingsService.loadAll();
      }
    });
  },
```

`dayDuty(day)`:

1. A close exists and `reportSentAt` is null → send the close report (as `sendCloseReport` does,
   without re-entering `serial`), kind `closed`.
2. A close exists and was reported → if the ledger over `[closedAt, tradingDayRange(day).end)`
   has any closed bill or any money in or out, send `LATE_CHANGE_HEADER` + the day report + the
   close block, kind `late`; else `'NONE'`.
3. No close → if the day's ledger has no closed bill and no money in or out, `'NONE'`; else
   `UNCLOSED_HEADER` + the day report, kind `unclosed`.

Every send goes through `logDelivery` (BOT_OFF writes no audit row here: the scheduler would
write one every minute while the bot starts).

Remove `shouldSendDailyTelegram`, `sendDailyTelegramSummary`, `runScheduledDailyTelegram`. In
`scheduler.ts`, replace both `runScheduledDailyTelegram()` calls with `runOwnerDayReports()`, same
`.catch` logging (`[scheduler] owner day report failed:`). The monthly calls stay, and so does
P2's `shouldSendMonthlyTelegram` on the trading clock.

`e2e/16-trading-day.test.ts`: if Task 0 found P2's daily-trigger tests there (`[D11] a nightly
report missed at 23:30 goes out before 05:00, for the evening` and `[D11] after 05:00 the next
report waits for 23:30 and covers the new trading day` — any test that calls
`runScheduledDailyTelegram` or `shouldSendDailyTelegram`), delete them; e2e is not typechecked, so
they would otherwise fail only at run time. Delete the `daily_report_telegram_time` line from that
describe's `beforeAll` too. Keep the describe, the rest of its `beforeAll`, and `[D11] the monthly
report waits for September's last trading day to end`. Then
`grep -rnE 'shouldSendDailyTelegram|runScheduledDailyTelegram|sendDailyTelegramSummary' apps/master/src apps/master/e2e apps/master/scripts`
and `grep -rn daily_report_telegram_time apps/master/src/main apps/master/prisma/seed.ts apps/master/e2e/16-trading-day.test.ts`
print nothing (the renderer's and the gallery's go in Task 12; `e2e/prod-forensics.ts` reads the
key from a till's old database and stays).

`settings.service.ts`: remove `'daily_report_telegram_time'` from the `getAll` filter and the
`canEdit` list. `seed.ts`: `daily_report_telegram_enabled` → `'true'`, drop the time row.

- [ ] **Step 4: Verify** — all gates. Expected: the 09 file is 9 tests, all passing;
`16-trading-day` loses only the `P2D` daily-trigger tests and its monthly test still passes. With
`old09` the number of the three old 09 tests that passed at Task 0: e2e passed = `E_PASS + 17 + 9
− old09 − P2D`, failed = `E_FAIL − (3 − old09)` (if Task 0 saw a P2 daily-trigger test fail, it
comes off failed instead of passed); unit as after Task 8; typecheck at the floor.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server apps/master/prisma/seed.ts apps/master/e2e/09-nightly-report.test.ts apps/master/e2e/16-trading-day.test.ts
git commit -m "feat(report): the owner's report at 05:00 for a day not closed" -m "Every ended trading day owes one report: the close's, or one marked kun yopilmadi, or an update when money moved after the count. A till that was off catches up at start, at most 7 days. The 23:30 report time goes."
```

---

### Task 11: Renderer — the close API and its figures

**Files:**
- Create: `apps/master/src/renderer/api/day-close.ts`
- Create: `apps/master/src/renderer/lib/day-close-view.ts` (+ `.test.ts`)
- Create: `apps/master/gallery/fixtures/day-close.ts`; Modify: `apps/master/gallery/mock-server.ts:1-13`
  (import), `:27-40` (`ROUTES`)

**Interfaces:**
- Produces: `dayCloseApi.{ current(), forDay(day), close(body), correct(id, body) }`, types
  `DayClosePreview`, `DayCloseDto`, `DayCloseReport`; `closeView(input)`.

The server owns the money; the form only shows what the admin's typing does to it before saving,
from the server's `opening` and `movement`.

- [ ] **Step 1: Failing unit tests** (`day-close-view.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { closeView } from './day-close-view';

const base = { opening: 200000, typedOpening: null, movement: 70000, counted: 250000, countedTyped: true, carryOver: 100000 };

describe('closeView', () => {
  it('a shortage', () => {
    expect(closeView(base)).toEqual({ expected: 270000, diff: -20000, diffWord: 'Kam', tone: 'owed', handedOver: 150000, shortage: true, error: null, canClose: true });
  });
  it('a first close takes the typed Ertalab kassada', () => {
    expect(closeView({ ...base, opening: null, typedOpening: 200000 }).expected).toBe(270000);
  });
  it("Farq 0 is To'g'ri", () => {
    expect(closeView({ ...base, counted: 270000 })).toMatchObject({ diff: 0, diffWord: "To'g'ri", tone: 'settled', shortage: false });
  });
  it('a surplus is Ortiqcha', () => {
    expect(closeView({ ...base, counted: 280000 })).toMatchObject({ diff: 10000, diffWord: 'Ortiqcha', tone: 'live' });
  });
  it('nothing typed yet cannot close', () => {
    expect(closeView({ ...base, counted: 0, countedTyped: false })).toMatchObject({ canClose: false, error: null });
  });
  it('leaving more than was counted cannot close', () => {
    expect(closeView({ ...base, carryOver: 260000 })).toMatchObject({
      canClose: false, error: "Ertaga qoladigan pul sanalgan puldan ko'p bo'lishi mumkin emas",
    });
  });
});
```

- [ ] **Step 2: Run red** (`pnpm test`), **Step 3: Implement** `closeView` and `api/day-close.ts`
(`api.get`/`post`/`patch` from `api/client.ts`). The gallery fixture answers `GET
/api/day-close/current` for today (opening 200 000, cashIn 110 000, cashOut 40 000, Aziz 20 000
and Bekzod 15 000 unpaid, 1 open order), `GET /api/day-close/day/<yesterday>` with a corrected
close, `POST` and `PATCH` by echoing a close built from the body; register `dayCloseRoutes` before
`financeRoutes`.

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
```

Expected: `+6` tests in `+1` file; `0`; `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/renderer/api/day-close.ts apps/master/src/renderer/lib/day-close-view.ts apps/master/src/renderer/lib/day-close-view.test.ts apps/master/gallery
git commit -m "feat(renderer): the day close API and what typing does to Farq"
```

---

### Task 12: Renderer — close the day from Kunlik moliya

**Files:**
- Create: `apps/master/src/renderer/components/finance/DayClosePanel.tsx`, `DayCloseSummary.tsx`
- Modify: `apps/master/src/renderer/components/finance/FinanceDrawerPanel.tsx:15`, `:40-48` (an
  optional `action` in the foot and an optional `headChip`)
- Modify: `apps/master/src/renderer/pages/FinancePage.tsx:19-46`
- Modify: `apps/master/src/renderer/pages/SettingsPage.tsx:144-151` (label "Kun yopilganda egasiga
  hisobot", value `getVal(…) !== 'false'`), `:178-189` (the "Hisobot vaqti" field goes)
- Modify: `apps/master/gallery/fixtures/settings.ts:6` (the time key goes)
- Modify: `apps/master/src/renderer/lib/audit-labels.ts:67-70` (`DAY_CLOSED: 'Kun yopildi'`,
  `DAY_CLOSE_CORRECTED: 'Kun yopilishi tuzatildi'`), `:91-94` (into the money group), `:110-127`
  (`DAY_CLOSED` success tone)

**Interfaces:**
- Consumes: Task 11; P4's expense form (`ExpenseCreateDialog`, `onCreated`); P6's
  `WaiterPayPanel { waiterId, onDone, onClose }`.

- [ ] **Step 1: FinancePage chooses the panel**

```tsx
  const preview = useQuery({ queryKey: ['day-close', 'current'], queryFn: dayCloseApi.current, refetchInterval: 30_000 });
  const ofDay = useQuery({ queryKey: ['day-close', 'day', date], queryFn: () => dayCloseApi.forDay(date) });
  const [closing, setClosing] = useState<null | { correcting?: DayCloseDto }>(null);
  const isCurrent = preview.data?.day === date;

  const panel = closing
    ? <DayClosePanel preview={preview.data} correcting={closing.correcting} onDone={() => setClosing(null)} />
    : ofDay.data?.close
      ? <DayCloseSummary close={ofDay.data.close} onCorrect={(c) => setClosing({ correcting: c })} />
      : <FinanceDrawerPanel data={data}
          headChip={!isCurrent && date < (preview.data?.day ?? date) ? <Chip tone="owed">Kun yopilmadi</Chip> : undefined}
          action={isCurrent && !preview.data?.alreadyClosed
            ? <Button size="action" className="w-full" onClick={() => setClosing({})}>Kunni yopish</Button>
            : undefined} />;
```

Changing the date picker resets `closing` to `null`.

- [ ] **Step 2: DayClosePanel** — compose `Panel`, `Row`, `RowMoney`, `RowSub`, `Seam`,
`AmountField`, `ActionBar`, `Button`, `Chip` exactly as the Design's "What the operator sees"
lists, with every string there verbatim. State: `counted`, `countedTyped`, `carryOver`,
`typedOpening`, `active: 'opening' | 'counted' | 'carryOver'` (only the active `AmountField`
shows its keypad, `showKeypad={active === …}`); figures from `closeView`. The middle is one
`min-h-0 flex-1 overflow-auto` scroller; head and foot outside it. On submit: `dayCloseApi.close({
counted, carryOver, opening, expectedSeen: view.expected })` (or `correct(id, …)`); on success
invalidate `['day-close']` and `['finance']`, toast `Kun yopildi` (or `Tuzatildi`) bottom-centre
like the confirm loop, then `onDone()`. On `DAY_CLOSE_STALE`, show the server's message and
refetch the preview. "Kiritilmagan xarajat qo'shish" opens P4's form; its `onCreated` invalidates
`['day-close', 'current']`. An unpaid row swaps the form's middle for P6's
`<WaiterPayPanel waiterId={row.waiterId} onDone={…} onClose={…} />`; `onDone` invalidates
`['day-close', 'current']` and returns to the form with the typed values kept, `onClose` returns
without a change. "Shuncha qoldirish" sets `carryOver` to `unpaidTotal`.

- [ ] **Step 3: DayCloseSummary** — rows for the eight figures, `Tuzatildi` chip when
`close.corrected`, the report line from `reportSentAt` (and `report` when just closed), and on
`close.isLatest` the 48 px "Sanoqni tuzatish" button.

- [ ] **Step 4: Settings and audit labels** — as the file list says.

- [ ] **Step 5: Verify**

```bash
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+Tests'
```

Expected: `0`, `0`, unit unchanged (`lib/navigation.test.ts` still passes: no destination added).

Then open the renderer preview the build harness provides (gallery or the live renderer), at
**1236 × 623**, on Kunlik moliya: (a) the Kassa panel's "Kunni yopish" is fully visible without
scrolling; (b) in the form with the keypad open under Sanaldi, the foot's "Kunni yopish" stays
visible and every row scrolls into view; (c) with a shortage, the expense button and the unpaid
rows are reachable by touch; (d) yesterday shows the summary with "Tuzatildi"; (e) nothing is
clipped horizontally. Record what was checked in the ledger.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/renderer apps/master/gallery
git commit -m "feat(renderer): close the day from Kunlik moliya" -m "The Kassa panel's foot opens the count. Farq shows as it is typed; a shortage offers the forgotten expense and names unpaid waiter Qoldiq. A closed day shows its count, whether it was corrected, and whether the owner got the report."
```

---

### Task 13: Documents

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md`
- Modify: `docs/superpowers/specs/2026-09-30-money-rules-design.md` (§3.3, §3.13, §5, §6)
- Modify: this plan (Deviations during execution)

- [ ] **Step 1: `docs/CURRENT_WORKFLOW.md`**

- §5 Finance vocabulary (`:271-310`): add **Closing the day** — the six formulas, the window
  `[previous closedAt, closedAt)`, one close per trading day, Kutilgan and Farq recomputed on read,
  corrections land in the close that covers them and never change the next Ertalab kassada; the
  handover is not Chiqim. Add `ledgerForRange` beside `dailyLedger` in the opening paragraph.
- §6 API surface (`:312-333`): the `/api/day-close` row (ADMIN + OWNER) and the four endpoints;
  the endpoint count.
- §3 Roles (`:159`): OWNER "Receives daily Telegram summary" → "Receives the day report when the
  day closes, or at 05:00 marked kun yopilmadi".
- §9 Runtime, Telegram bot (`:448-455`): `sendMessage` answers SENT / BOT_OFF / FAILED; the day
  report replaces the 23:30 report. Scheduler (`:457-466`): "polls every 60 seconds for the
  configured send time" → `runOwnerDayReports` at start-up and every minute, catch-up at most 7
  days, retry 10 minutes after a Telegram error, silent days skipped.
- §10 (`:483-500`): "Daily Telegram missing" → `finance-report.service.ts`
  `runOwnerDayReports`, `DayClose.reportSentAt`, the setting `daily_report_last_sent_date`; add
  "Farq looks wrong after a correction" → `day-close.service.ts` `figures`, `stampInsideClose`.

- [ ] **Step 2: Money rules**

- §3.3: append "A close covers the time since the previous count (`[previous closedAt,
  closedAt)`); a bill after the count is the next close's. A correction changes the Kutilgan and
  Farq of the close that covers it and never the next close's Ertalab kassada (the stored Ertaga
  qoladi). The latest close can be corrected." and "Built: P5, `feat/money-rules`."
- §3.13: "Built: P5. A close made after its day's 05:00 report still sends its own; a closed day
  that changed after its count gets one update at 05:00; a till off at 05:00 catches up at most 7
  days at start."
- §5: add `09-nightly-report.test.ts`: the three 23:30 tests are rewritten for D21 (on by default
  once configured; logged only when accepted; the report at close, at 05:00 marked kun
  yopilmadi, at the next start, and an update for a bill after the count). Add
  `22-day-close.test.ts` (new, D12) and the two `ledgerForRange` controls in `07-day.test.ts`.
  If Task 10 deleted P2's daily-trigger tests from `16-trading-day.test.ts`, say so (the daily
  report is D21's now; the monthly trading-clock test stays).
- §6: the close-screen question is answered by showing unpaid Qoldiq beside Ertaga qoladi with a
  one-tap fill; no rule enforced (open question kept for Barkamol).

- [ ] **Step 3: This plan** — add "Deviations during execution": every Task 0 name that differed
from "Assumed interfaces", and every ruling made during the build.

- [ ] **Step 4: Final gates** — all five commands from Global Constraints, then P2's
retired-helper grep (P2 Task 7 Step 3; e2e and scripts are not typechecked, so only this catches
a caller this package added there):

```bash
docker exec -w /app/apps/master CONTAINER grep -rnE 'localDayKey|parseLocalDay|localDayRange|localMonthRangeFor|isSameLocalDay|localToday|localClockMinutes' src e2e scripts
```

Expected: e2e passed `E_PASS + 26 − old09 − P2D` (2 in `07-day`, 15 in `22-day-close`, 9 in
`09-nightly-report` replacing 3, and P2's `P2D` daily-trigger tests gone from `16-trading-day`),
failed `E_FAIL − (3 − old09)`; unit `U_TESTS + 26` (14 + 1 + 5 + 6) in `U_FILES + 4` files;
typecheck 47, 0, 0; the grep prints nothing. Write the measured numbers into the deviations.

- [ ] **Step 5: Commit**

```bash
git add docs/CURRENT_WORKFLOW.md docs/superpowers/specs/2026-09-30-money-rules-design.md docs/superpowers/plans/2026-10-02-money-day-close.md
git commit -m "docs: closing the day and the owner's day report"
```

- [ ] **Step 6: Hand over.** Stop at "ready to merge". Report the commits, the final counts, and
  the checks owed before a till gets the programme's build. Items 1–3 run on copies of the till's
  `%APPDATA%\@chayxana\master\data\master.sqlite` (STATE item 2: copied with the app closed, kept
  under the git-ignored `e2e/.data/prod/`), never on the till's own file; item 4 needs the till's
  printer and is done by a person on site:
  1. **PRD 14 §10 fractional amounts** — run the read-only SQL of
     `docs/prd/14-server-money-guards.md` §10 (`sqlite3 -readonly master.sqlite <
     fractional-amounts.sql`) on the copy taken **before** upgrading (it reads `Discount`, which
     P7 drops). Every count must be 0; any other row is fixed by hand first, because a fractional
     total can no longer be paid.
  2. **P1's `countedQty` backfill** — apply the migrations to a second copy and confirm every live
     line on a DRAFT or SENT order added before its item's latest `StockEntry(COUNT)` has
     `countedQty = quantity`, and every other line 0 (P1,
     `20261002130000_order_line_counted_qty`).
  3. **P7's `Order` rebuild through sql.js** — start the headless server on a third copy so
     `sqlite-bootstrap.ts`'s in-process sql.js migrator applies
     `20261002150000_drop_discount_presets`; confirm the `Order` row count and every `Order`
     index are as before, `Discount` is gone, and `prisma migrate diff` against the schema exits 0.
  4. **P3's till print** — on the till, with the rebuilt `receipt.exe`, print one bill each paid
     Naqd, Naqd + Karta and Nasiya, and check the D19 rows.
  Also owed, from this package: open Kunlik moliya at 1236 × 623 on the live renderer and close a
  day with the keypad open (Task 12's checks a–e on real hardware).
---

## Open questions (for Barkamol; the build uses the default)

- **Counting in the morning.** A count at 09:00 is labelled with that morning's trading day, so
  the evening before is reported at 05:00 as "kun yopilmadi" and the morning close covers both.
  Default: so. Alternative: let a close before noon be labelled the previous trading day.
- **The month's Xizmat haqi in the drawer** (money rules §6). Default: show unpaid Qoldiq beside
  Ertaga qoladi with "Shuncha qoldirish"; enforce nothing.
- **Days with no activity** get no 05:00 report. Default: skip.
- **Correcting a count.** Default: OWNER and ADMIN, latest close only, owner messaged.

Not questions, implementation defaults (Global Constraints, "Decided values"): catch-up after the
till was off covers at most 7 ended trading days, one message each, oldest first; a bill after the
count gets one "Kun yopilgandan keyin o'zgardi" update at 05:00, and its cash counts in the next
close.
