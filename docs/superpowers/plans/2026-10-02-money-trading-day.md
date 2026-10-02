# Trading day (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A trading day ends at 05:00 Tashkent, not at midnight. A bill closed at 02:30 belongs to
the evening before in every report, every "today", every Telegram message and every file, while the
bill itself still prints the real date and time.

**Architecture:** One module, `server/lib/time.ts`, decides the trading day. Every day-range query
already goes through that module's helpers, so the change is a new set of trading-day helpers, then
moving every caller onto them in one commit, then deleting the calendar-day helpers so the compiler
proves nothing still uses them. Day keys stay `YYYY-MM-DD`; a "day anchor" `Date` passed between
controllers and services becomes 05:00 Tashkent on that day instead of 00:00. The renderer and the
waiter app get the same rule in their own pure helpers. Past data regroups by computation; nothing
is migrated.

**Tech Stack:** Node + Express + Prisma 6.17 on SQLite, zod 4, vitest 2 (unit: `pnpm test`; e2e:
`vitest.e2e.config.ts`), React 19 + TanStack Query in the renderer, Expo RN in `apps/mobile`, Docker
for every run.

**Spec:** `docs/superpowers/specs/2026-09-30-money-rules-design.md` D11, §3.2, §4 item (34), §5 last
line, §7 slice 4.

---

## Design

### Goal and decisions covered

- **D11** — the trading day ends 05:00 Tashkent; 00:00–05:00 belongs to the evening before. Bills
  keep their real date and time; only grouping changes.
- **§4 (34)** — document dates use Tashkent time whatever the machine clock (the printed bill, the
  PDF's row times and footer).
- **§5** — "Any test that builds a day across midnight uses the 05:00 boundary." No existing e2e
  test crosses midnight (every one runs between 09:00 and 23:55); the new file
  `e2e/16-trading-day.test.ts` pins the boundary instead.
- **Not here:** D21 (when the owner's report goes out) belongs to P5, and so does the daily
  trigger. This package keeps the daily report at its configured time, changes only which day it
  covers, and moves the monthly trigger onto the trading clock (see "Scheduler" below).

### The rule, with numbers

Tashkent is UTC+5 all year. The trading day `2026-09-29` runs from **29.09 05:00** to **30.09
05:00**, half-open. So:

| Instant (Tashkent) | Trading day | Bill prints |
|---|---|---|
| 29.09 22:00 | 2026-09-29 | `Sana: 29.09.2026 22:00` |
| 30.09 02:30 | 2026-09-29 | `Sana: 30.09.2026 02:30` |
| 30.09 04:59 | 2026-09-29 | `Sana: 30.09.2026 04:59` |
| 30.09 05:00 | 2026-09-30 | `Sana: 30.09.2026 05:00` |
| 01.10 02:00 | 2026-09-30 (September) | `Sana: 01.10.2026 02:00` |

A trading month is the trading days whose key falls in that month: September runs from 01.09 05:00
to 01.10 05:00. A useful identity, pinned by a unit test: because the offset and the start hour are
both 5 hours, **the trading day of an instant is its UTC calendar date**. The waiter app relies on
it; the server computes it explicitly.

### What the operator sees

- **Kunlik moliya, Hisobot, Bosh sahifa, Buyurtmalar, Xarajatlar, Xodimlar maoshi** open on the
  current trading day. At 02:00 on 1 October each of them opens on 30.09.2026 and shows the
  evening's bills, including the ones closed after midnight. "Bugun" and "Kecha" in Hisobot mean
  the current and the previous trading day; "Shu hafta", "Shu oy", "O'tgan oy" and
  "Oxirgi 30 kun" count trading days.
- **Kunlik moliya**, between 00:00 and 05:00 only, shows one line beside the date field (13 px,
  muted):
  `05:00 gacha savdo 30.09 kuniga yoziladi` — the date is the current trading day as `DD.MM`.
- **Xarajatlar:** an expense can be undone on the same trading day it was booked (the
  same-day-only rule now means trading day). An expense booked at 23:00 can be undone at 02:00; one
  booked at 02:00 cannot be undone at 06:00. P4 lifts the rule for explicit corrections.
- **Waiter app (Mening kunim):** "Bugun" is the trading day — at 02:00 it shows the evening's
  bills and Xizmat haqi. The home screen's stats already ask the server, which now answers for the
  trading day.
- **Telegram:** `/bugun`, `/kecha`, `/oldin N`, `/hafta`, `/pdf`, `/xarajatlar`, `/ofitsiantlar`,
  `/oylik`, `/umumiy`, `/excel` and the buttons all count trading days; at 02:00 `/bugun` sends
  `30.09.2026 — kunlik moliyaviy hisobot`. `/yordam` gains one line after the header:
  `Savdo kuni 05:00 da tugaydi: 00:00–05:00 dagi savdo oldingi kunga yoziladi.`
- **The printed bill and the PDF's row times** show the real Tashkent date and time even when the
  till's Windows time zone is wrong. The PDF's title date is the trading day.
- **A bad date** in any `date=`/`from=`/`to=` parameter that passes the `YYYY-MM-DD` pattern but is
  not a real day (`2026-02-30`) answers 400 `VALIDATION` with `Sana noto'g'ri: 2026-02-30`
  instead of silently rolling to 2 March. A bad month answers `Oy noto'g'ri: 2026-13`.

### Server, schema and API

- **Schema:** none. **Data migration:** none — every report regroups when computed.
- **API contract (unchanged shapes, new meaning):** every `date=YYYY-MM-DD` names a trading day;
  `from`/`to` are inclusive trading days; `month=YYYY-MM` is a trading month; every `date` field
  in a response (`/api/me/today-stats`, `/api/users/today-stats`, `/api/expenses`, ledgers,
  summaries) is a trading-day key. The default "today" of every endpoint is `tradingDayOf(now)`.
- **`server/lib/time.ts`** — the API later packages use (P5 closes a trading day, P4 corrects a past
  one):

  | Export | Meaning |
  |---|---|
  | `TRADING_DAY_START_HOUR` | `5` |
  | `tradingDayOf(at = now): string` | The trading day containing `at`, `YYYY-MM-DD` |
  | `tradingDayStart(dayKey): Date` | 05:00 Tashkent on `dayKey` — the day anchor services take |
  | `tradingDayRange(dayKey): { start, end }` | `[05:00 dayKey, 05:00 next day)`; use `gte: start, lt: end` |
  | `tradingDayRangeAt(at = now)` | `tradingDayRange(tradingDayOf(at))` |
  | `shiftTradingDay(dayKey, days): string` | Calendar arithmetic on keys |
  | `tradingDayAnchor(daysAgo = 0, now = new Date()): Date` | Start of the trading day `daysAgo` before now's |
  | `isTradingDayKey(s): boolean` | Pattern **and** a real calendar day |
  | `isSameTradingDay(a, b): boolean` | |
  | `tradingMonthOf(at = now): string` | `YYYY-MM` of `tradingDayOf(at)` |
  | `tradingMonthRange(yyyyMm): { start, end }` | `[05:00 on the 1st, 05:00 on the next 1st)` |
  | `tradingMinutes(at = now): number` | Minutes since the trading day began, 0..1439 (05:00 → 0, 23:30 → 1110, 04:59 → 1439) |
  | `clockToTradingMinutes(hh, mm): number` | A wall-clock time on the trading clock (23:30 → 1110, 02:00 → 1260) |

  Invalid keys throw `Errors.Validation` (400). The calendar helpers (`localDayKey`,
  `parseLocalDay`, `localDayRangeFor`, `localDayRange`, `localMonthRangeFor`, `isSameLocalDay`,
  `localToday`, `localClockMinutes`) are deleted in Task 7.
- **Provides — what P4, P5 and P6 rely on after Task 3:**
  - `reportsService.dailyLedger(dayKey: string)` keeps its signature — one `YYYY-MM-DD` trading-day
    key (the parameter is still spelled `localDay` in code) — and ranges over
    `tradingDayRange(dayKey)`.
  - Every service that takes a day as a `Date` takes `tradingDayStart(dayKey)` — 05:00 Tashkent —
    as its anchor: `reportsService.daily(date)`, `.monthly(monthStart)`, `.summary({ from, to })`,
    `financeService.dailyForAdmin(date)`, `.serviceChargeMatrix({ from, to })`,
    `expenseService.listByDate(date)` and the Telegram `format*Message(date, …)`. A 00:00 anchor
    names the trading day before.
  - The retired-helper gate (Task 7 Step 3) is one command; P3, P4, P5 and P6 run it in their final
    verify step.
- **`server/lib/format.ts`** — document dates, Tashkent whatever the machine clock:
  `formatDateTimeUZ(date)` → `30.09.2026 02:30` (fixed), `formatDayMonthTimeUZ(date)` →
  `30.09 02:30`, `formatDayKeyUZ(dayKey)` → `29.09.2026`, `formatDayKeyLongUZ(dayKey)` →
  `29 Sentabr 2026`. All ASCII. `formatUZS` unchanged.
- **Scheduler** (`finance-report.service.ts`; `lib/scheduler.ts` itself is unchanged). The configured
  times (`daily_report_telegram_time`, default `23:30`; `monthly_report_telegram_time`, default
  `09:00`) stay.
  - **Daily:** goes out at 23:30 on the trading day, for that trading day (report day =
    `tradingDayOf(now)`). There is **no catch-up** between 00:00 and 05:00: a report the till
    missed at 23:30 is not sent after midnight, and the new trading day waits for its own 23:30.
    With the default time this is today's behaviour; only the helper names change, so that Task 7
    can delete `localClockMinutes`.
  - **Monthly:** goes out on trading day 1 (from 05:00 on the 1st) once the configured time has
    passed on the **trading clock**, for the previous trading month.
  **Interplay with P5 (D21):** P5 replaces the daily trigger (report at close, 05:00 fallback
  marked "kun yopilmadi") and deletes `shouldSendDailyTelegram`. This package therefore adds no
  daily-trigger test; `09-nightly-report` keeps covering the 23:30 send. P5 keeps reading days
  through `tradingDayOf`/`tradingDayRange`. Bills closed between 23:30 and 05:00 still miss the
  23:30 report until P5 lands — `09-nightly-report` `[issue 22]` "bills closed after the send time
  reach the owner" stays failing, owned by P5.

### Renderer and waiter app

- `src/renderer/lib/trading-day.ts` (new, pure, tested): `tradingDayKey`, `tradingMonthKey`,
  `shiftDayKey`, `isSameTradingDay`, `presetRange`, `nightNote`. `tashkentDayKey` and
  `tashkentMonthKey` leave `lib/format.ts`; every page moves to the new module, as do the three
  pages that still used the machine's own date (`ExpensesPage`, `ExpensePanel`, `SalariesPage`).
- `apps/mobile/src/screens/MyDayScreen.tsx`: today's key is the trading day.
- `apps/order` has no day logic and is untouched. No waiter surface gains tan narx or food cost.

### What deliberately stays

- The ledger formulas (`dailyLedger`, billing math, `cashOut` not `expenseNet`): only the window
  each query uses moves.
- Stored instants (`closedAt`, `occurredAt`, `paidAt`, audit `createdAt`) and every place that
  displays a timestamp: real time.
- The owner's report send times (D21 → P5); the 12-hour draft cleanup; PIN lockout; sessions.
- The Amallar tarixi filter (`audit.controller.ts:21-22`) parses `new Date('YYYY-MM-DD')`, which is
  UTC midnight — already 05:00 Tashkent. It filters an event log, not money; untouched.
- `e2e/prod-forensics.ts` groups by calendar day on purpose: it measures what the old build did to
  the till's data.
- The expense form's `occurredAt` (`ExpenseCreateDialog.tsx:53`, noon of the page's date) — noon is
  inside the trading day either way; P4 rewrites the form.
- Telegram's and the PDF's money grouping (`Intl uz-UZ`, issue 33) — not this package.

---

## Global Constraints

- **Where:** worktree `/Users/uzmacbook/dev/lab/project02-money`, branch `feat/money-rules` (or the
  package branch the orchestrator names, cut from it). Never commit to `main`; never push, merge,
  tag or deploy. Never read or write `../project02`, `../project02-guards`, `../project02-demo` or
  `../project02-finance-e2e`.
- **Where things run:** only in the container the build names; written below as `CONTAINER`. Never
  run gates on the host, never start Electron. Every `docker exec` takes `-e NO_COLOR=1` where it
  greps vitest output.
- **Floors (re-measured in Task 1):** e2e `Tests 38 failed | 68 passed (106)`; `pnpm test` 142 tests
  in 14 files; `pnpm typecheck` 47 errors; `typecheck:renderer` 0; `typecheck:gallery` 0; mobile
  typecheck at the count Task 1 records. No task may raise a typecheck count, and no e2e test that
  passed before a task may fail after it.
- **Decided values:** the boundary is 05:00 Tashkent, UTC+5 fixed, half-open `[05:00, 05:00)`;
  day keys `YYYY-MM-DD`; a day anchor is 05:00 on its day; strings exactly as in the Design.
- **Code rules** (`docs/agent-plans/00-shared/conventions.md`): TypeScript strict,
  `noUncheckedIndexedAccess`, no `any` outside test files; 2-space indent, single quotes,
  semicolons, trailing commas; Prisma only in `repositories/` (the existing direct reads in
  `reports.service.ts` and the two stats controllers stay as they are — only their windows change);
  throw `Errors.*`; every user-facing string in Uzbek. Money on screen through `formatMoney`, on
  paper through `formatUZS`; never raw `Intl uz-UZ`. The printer stays ASCII.
- **Renderer:** compose Blocks C1; type floors 12/13/17 px; no hover-only route; must fit
  1236 × 623. The nav rail is untouched.
- **Commits:** authored as Barkamol, plain conventional messages, no AI trailers or co-author lines.
  Never commit `apps/master/e2e/.data/`. Never `--no-verify`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/master/src/main/server/lib/time.ts` (+ `time.test.ts`) | Modify, then strip (T1, T7) | The trading-day API; the calendar helpers go |
| `apps/master/src/main/server/lib/format.ts` (+ `format.test.ts`) | Modify | Document dates in Tashkent whatever the machine clock |
| `apps/master/src/main/pdf-report.ts` | Modify | Title date is the trading day; row times in Tashkent |
| `apps/master/src/main/index.ts` | Modify | The PDF save IPC anchors its day at 05:00 |
| `apps/master/src/main/server/repositories/{expense,debt,payment}.repo.ts` | Modify | Day windows by trading day |
| `apps/master/src/main/server/services/{reports,finance,order,expense}.service.ts` | Modify | Day and month windows, day buckets, the same-day undo rule |
| `apps/master/src/main/server/controllers/{me,users,reports,finance,debt,expense,orders}.controller.ts` | Modify | Default day and query parsing |
| `apps/master/src/main/server/services/telegram-bot.service.ts` | Modify | Command days, labels, `/yordam` line |
| `apps/master/src/main/server/services/finance-report.service.ts` | Modify | Report day; the monthly trigger on the trading clock |
| `apps/master/e2e/16-trading-day.test.ts` | Create | The 05:00 boundary through every surface, on a UTC machine clock |
| `apps/master/e2e/{00-harness,02-payments,04-stock-cost,05-expenses,07-day,08-staff-access}.test.ts` | Modify | Helper renames only |
| `apps/master/scripts/smoke-*.ts` (6 files) | Modify | Helper renames; the boundary smoke moves to 05:00 |
| `apps/master/src/renderer/lib/trading-day.ts` (+ `.test.ts`) | Create | The rule on the renderer side, presets, the night note |
| `apps/master/src/renderer/lib/format.ts` | Modify | `tashkentDayKey`/`tashkentMonthKey` removed |
| `apps/master/src/renderer/pages/{Orders,Reports,Dashboard,Finance,Expenses,Salaries}Page.tsx`, `components/expenses/ExpensePanel.tsx` | Modify | Open on the trading day |
| `apps/master/gallery/fixtures/util.ts` | Modify | The mock's "today" is the trading day |
| `apps/mobile/src/screens/MyDayScreen.tsx` | Modify | The waiter's "Bugun" is the trading day |
| `docs/CURRENT_WORKFLOW.md`, `docs/superpowers/specs/2026-09-30-money-rules-design.md`, this plan | Modify | Say what the code now does |

---

### Task 1: Baselines and the trading-day API

**Files:**
- Modify: `apps/master/src/main/server/lib/time.ts` (append after line 122; header comment lines 1-15)
- Create: `apps/master/src/main/server/lib/time.test.ts`

**Interfaces:**
- Consumes: `Errors` from `server/lib/errors.ts` (pure module, no Prisma).
- Produces: every export in the Design's `time.ts` table. The old helpers stay until Task 7, so
  nothing else changes in this commit.

- [ ] **Step 1: Record the baselines**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/12-host-clock.test.ts 2>&1 | grep -E '✓|×|FAIL|Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/mobile CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  38 failed | 68 passed (106)`; `[issue 34]` in `12-host-clock` failing (it formats
in the machine's zone and the test sets `TZ=UTC`); `Test Files  14 passed (14)`,
`Tests  142 passed (142)`; `47`; `0`; `0`; write down the mobile count. Any other number becomes
the floor; say so in the Task 8 handover.

- [ ] **Step 2: Write the failing unit tests**

Create `apps/master/src/main/server/lib/time.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';

import {
  clockToTradingMinutes,
  isSameTradingDay,
  isTradingDayKey,
  shiftTradingDay,
  tradingDayAnchor,
  tradingDayOf,
  tradingDayRange,
  tradingDayRangeAt,
  tradingDayStart,
  tradingMinutes,
  tradingMonthOf,
  tradingMonthRange,
} from './time';

/** Tashkent wall-clock time, e.g. at('2026-09-30T02:30'). */
const at = (local: string): Date => new Date(`${local}:00+05:00`);
const iso = (d: Date) => d.toISOString();

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('tradingDayOf', () => {
  it.each([
    ['2026-09-29T05:00', '2026-09-29'],
    ['2026-09-29T23:59', '2026-09-29'],
    ['2026-09-30T00:00', '2026-09-29'],
    ['2026-09-30T02:30', '2026-09-29'],
    ['2026-09-30T04:59', '2026-09-29'],
    ['2026-09-30T05:00', '2026-09-30'],
    ['2026-10-01T02:00', '2026-09-30'],
    ['2027-01-01T04:00', '2026-12-31'],
    ['2028-03-01T03:00', '2028-02-29'],
  ])('a moment at %s Tashkent belongs to the trading day %s', (local, key) => {
    expect(tradingDayOf(at(local))).toBe(key);
  });

  it('does not depend on the machine time zone', () => {
    for (const tz of ['UTC', 'Asia/Tashkent', 'America/New_York', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      expect([
        tradingDayOf(at('2026-09-30T02:30')),
        tradingDayOf(at('2026-09-30T04:59')),
        tradingDayOf(at('2026-09-30T05:00')),
      ], tz).toEqual(['2026-09-29', '2026-09-29', '2026-09-30']);
    }
  });

  it('is the UTC date of the instant, which the waiter app relies on', () => {
    for (let t = Date.parse('2026-01-01T00:00:00Z'); t < Date.parse('2027-01-01T00:00:00Z'); t += 3_600_000) {
      const d = new Date(t);
      expect(tradingDayOf(d)).toBe(d.toISOString().slice(0, 10));
    }
  });
});

describe('tradingDayStart and tradingDayRange', () => {
  it('starts the trading day at 05:00 Tashkent', () => {
    expect(iso(tradingDayStart('2026-09-29'))).toBe('2026-09-29T00:00:00.000Z');
  });

  it('is half-open: 04:59:59.999 the next morning is inside, 05:00 is not', () => {
    const { start, end } = tradingDayRange('2026-09-29');
    expect({ start: iso(start), end: iso(end) }).toEqual({
      start: '2026-09-29T00:00:00.000Z',
      end: '2026-09-30T00:00:00.000Z',
    });
    expect(new Date('2026-09-30T04:59:59.999+05:00') < end).toBe(true);
    expect(at('2026-09-30T05:00') < end).toBe(false);
  });

  it('round-trips every day of 2026 and of the leap year 2028', () => {
    for (const year of [2026, 2028]) {
      for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86_400_000) {
        const key = new Date(t).toISOString().slice(0, 10);
        expect(tradingDayOf(tradingDayStart(key))).toBe(key);
      }
    }
  });

  it.each(['2026-9-29', '2026-02-30', '2026-13-01', '29.09.2026', ''])('refuses %j with a 400', (key) => {
    expect(isTradingDayKey(key)).toBe(false);
    expect(() => tradingDayStart(key)).toThrow(expect.objectContaining({ code: 'VALIDATION', httpStatus: 400 }));
  });
});

describe('tradingDayRangeAt', () => {
  it('gives the range of the trading day an instant falls in', () => {
    expect(tradingDayRangeAt(at('2026-09-30T02:30'))).toEqual(tradingDayRange('2026-09-29'));
  });
});

describe('shiftTradingDay', () => {
  it.each([
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-09-30', 0, '2026-09-30'],
  ])('%s shifted by %i is %s', (key, days, expected) => {
    expect(shiftTradingDay(key, days)).toBe(expected);
  });
});

describe('tradingDayAnchor', () => {
  it('counts back from the trading day in progress, not the calendar day', () => {
    const now = at('2026-10-01T02:00');
    expect([0, 1, -1].map((n) => iso(tradingDayAnchor(n, now)))).toEqual([
      '2026-09-30T00:00:00.000Z',
      '2026-09-29T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    ]);
  });
});

describe('isSameTradingDay', () => {
  it('joins 23:00 and the 04:00 after it, and splits 04:59 from 05:00', () => {
    expect(isSameTradingDay(at('2026-09-29T23:00'), at('2026-09-30T04:00'))).toBe(true);
    expect(isSameTradingDay(at('2026-09-30T04:59'), at('2026-09-30T05:00'))).toBe(false);
  });
});

describe('trading months', () => {
  it('puts 02:00 on the 1st in the month before', () => {
    expect(tradingMonthOf(at('2026-10-01T02:00'))).toBe('2026-09');
    expect(tradingMonthOf(at('2026-10-01T05:00'))).toBe('2026-10');
  });

  it('runs from 05:00 on the 1st to 05:00 on the next 1st', () => {
    const sep = tradingMonthRange('2026-09');
    const dec = tradingMonthRange('2026-12');
    expect([iso(sep.start), iso(sep.end), iso(dec.end)]).toEqual([
      '2026-09-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
    ]);
  });

  it('refuses a month that does not exist with a 400', () => {
    expect(() => tradingMonthRange('2026-13')).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });
});

describe('the trading clock', () => {
  it.each([
    ['2026-09-29T05:00', 0],
    ['2026-09-29T23:30', 1110],
    ['2026-09-30T00:30', 1170],
    ['2026-09-30T04:59', 1439],
  ])('%s is minute %i of its trading day', (local, minutes) => {
    expect(tradingMinutes(at(local))).toBe(minutes);
  });

  it('places a configured wall-clock time on the trading clock', () => {
    expect([
      clockToTradingMinutes(23, 30),
      clockToTradingMinutes(2, 0),
      clockToTradingMinutes(5, 0),
      clockToTradingMinutes(4, 59),
    ]).toEqual([1110, 1260, 0, 1439]);
  });
});
```

That is 35 tests (9 + 2 + 3 + 5 + 1 + 5 + 1 + 1 + 3 + 4 + 1 — each `it.each` row counts as one).

- [ ] **Step 3: Run them to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/time.test.ts 2>&1 | tail -5
```

Expected: the file fails to import (`tradingDayOf` and the rest are not exported).

- [ ] **Step 4: Add the trading-day API**

In `apps/master/src/main/server/lib/time.ts`, add `import { Errors } from './errors';` at the top
and append after line 122:

```ts
// ─── The trading day (money rules D11) ───────────────────────────────────
//
// A trading day runs from 05:00 Tashkent to 05:00 the next morning: a bill
// closed at 02:30 belongs to the evening before. Every day-range query and
// every "today" goes through these helpers. Stored instants and printed
// timestamps keep the real time; only grouping uses the trading day.

/** Tashkent is UTC+5 all year (no daylight saving since 1992). */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
export const TRADING_DAY_START_HOUR = 5;
const TRADING_DAY_START_MS = TRADING_DAY_START_HOUR * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

/** UTC midnight of `key` read as a calendar date, in ms. NaN when malformed. */
function utcMidnightMs(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`);
}

/** "YYYY-MM-DD" that names a real calendar day ("2026-02-30" does not). */
export function isTradingDayKey(key: string): boolean {
  if (!ISO_DAY.test(key)) return false;
  const ms = utcMidnightMs(key);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === key;
}

function assertTradingDayKey(key: string): void {
  if (!isTradingDayKey(key)) throw Errors.Validation(`Sana noto'g'ri: ${key}`);
}

/**
 * The trading day containing `at`, as "YYYY-MM-DD". Shift into Tashkent wall
 * time, then back by the 05:00 start: what is left is a UTC calendar date that
 * names the trading day. Both shifts are 5 h, so this is also the instant's own
 * UTC date — the identity `apps/mobile` relies on; `time.test.ts` pins it.
 */
export function tradingDayOf(at: Date = new Date()): string {
  return new Date(at.getTime() + TASHKENT_OFFSET_MS - TRADING_DAY_START_MS).toISOString().slice(0, 10);
}

/** 05:00 Tashkent on `dayKey` — the day anchor every Date-taking service expects. */
export function tradingDayStart(dayKey: string): Date {
  assertTradingDayKey(dayKey);
  return new Date(utcMidnightMs(dayKey) - TASHKENT_OFFSET_MS + TRADING_DAY_START_MS);
}

/** Half-open [05:00 dayKey, 05:00 the next day). Use `gte: start, lt: end`. */
export function tradingDayRange(dayKey: string): { start: Date; end: Date } {
  const start = tradingDayStart(dayKey);
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
}

/** The range of the trading day `at` falls in. */
export function tradingDayRangeAt(at: Date = new Date()): { start: Date; end: Date } {
  return tradingDayRange(tradingDayOf(at));
}

/** `dayKey` moved by `days` calendar days. */
export function shiftTradingDay(dayKey: string, days: number): string {
  assertTradingDayKey(dayKey);
  return new Date(utcMidnightMs(dayKey) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Start of the trading day `daysAgo` before the one in progress at `now`. */
export function tradingDayAnchor(daysAgo = 0, now: Date = new Date()): Date {
  return tradingDayStart(shiftTradingDay(tradingDayOf(now), -daysAgo));
}

export function isSameTradingDay(a: Date, b: Date): boolean {
  return tradingDayOf(a) === tradingDayOf(b);
}

/** "YYYY-MM" of the trading day containing `at`. */
export function tradingMonthOf(at: Date = new Date()): string {
  return tradingDayOf(at).slice(0, 7);
}

/** Half-open [05:00 on the 1st, 05:00 on the next month's 1st). */
export function tradingMonthRange(yyyyMm: string): { start: Date; end: Date } {
  if (!ISO_MONTH.test(yyyyMm)) throw Errors.Validation(`Oy noto'g'ri: ${yyyyMm}`);
  const year = Number(yyyyMm.slice(0, 4));
  const month = Number(yyyyMm.slice(5, 7)); // 1..12
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return { start: tradingDayStart(`${yyyyMm}-01`), end: tradingDayStart(`${next}-01`) };
}

/** Minutes since the trading day began, 0..1439: 05:00 → 0, 23:30 → 1110, 04:59 → 1439. */
export function tradingMinutes(at: Date = new Date()): number {
  const ms = at.getTime() + TASHKENT_OFFSET_MS - TRADING_DAY_START_MS;
  return Math.floor((((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / 60_000);
}

/** A wall-clock time on the trading clock: 23:30 → 1110, 02:00 → 1260. */
export function clockToTradingMinutes(hh: number, mm: number): number {
  const minutes = hh * 60 + mm - TRADING_DAY_START_HOUR * 60;
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
```

`ISO_DAY`, `ISO_MONTH` and `MS_PER_DAY` already exist at lines 19 and 35-36. Replace the header
comment (lines 1-15) with one that names both halves: the trading-day helpers are the rule, the
calendar helpers above them are being retired (Task 7).

- [ ] **Step 5: Run the unit tests and the gates**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/time.test.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  35 passed (35)`; `Test Files  15 passed (15)`, `Tests  177 passed (177)`; `47`.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/main/server/lib/time.ts apps/master/src/main/server/lib/time.test.ts
git commit -m "feat(time): trading-day helpers, the day ends at 05:00 Tashkent" -m "Money rules D11. Additive: callers move in a later commit."
```

---

### Task 2: Document dates in Tashkent time whatever the machine clock (issue 34)

**Files:**
- Modify: `apps/master/src/main/server/lib/format.ts:23-30`
- Create: `apps/master/src/main/server/lib/format.test.ts`
- Modify: `apps/master/src/main/pdf-report.ts:42-54` (formatters), `:340-341` (title date, footer time)

**Interfaces:**
- Consumes: `localDayKey` (the old helper, still present; Task 3 swaps it).
- Produces: `formatDateTimeUZ`, `formatDayMonthTimeUZ`, `formatDayKeyUZ`, `formatDayKeyLongUZ`.

- [ ] **Step 1: Write the failing unit tests**

Create `apps/master/src/main/server/lib/format.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';

import { formatDateTimeUZ, formatDayKeyLongUZ, formatDayKeyUZ, formatDayMonthTimeUZ, formatUZS } from './format';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('dates on paper', () => {
  it('a bill printed at 00:30 Tashkent shows 30.09.2026 00:30 whatever the machine zone', () => {
    for (const tz of ['Asia/Tashkent', 'UTC', 'America/New_York']) {
      process.env.TZ = tz;
      expect(formatDateTimeUZ(new Date('2026-09-30T00:30:00+05:00')), tz).toBe('30.09.2026 00:30');
    }
  });

  it('the PDF row time is day, month and Tashkent time', () => {
    process.env.TZ = 'UTC';
    expect(formatDayMonthTimeUZ(new Date('2026-09-30T02:30:00+05:00'))).toBe('30.09 02:30');
  });

  it('a day key prints as DD.MM.YYYY', () => {
    expect(formatDayKeyUZ('2026-09-29')).toBe('29.09.2026');
  });

  it('a day key prints long, with the Uzbek month', () => {
    expect([formatDayKeyLongUZ('2026-09-29'), formatDayKeyLongUZ('2026-01-05')]).toEqual(['29 Sentabr 2026', '5 Yanvar 2026']);
  });

  it("so'm on paper stay grouped with an ASCII space", () => {
    expect(formatUZS(1673000)).toBe('1 673 000');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/format.test.ts 2>&1 | tail -5
```

Expected: fails — the three new formatters do not exist, and `formatDateTimeUZ` gives
`29.09.2026 19:30` under `UTC`.

- [ ] **Step 3: Implement**

In `apps/master/src/main/server/lib/format.ts`, replace `formatDateTimeUZ` (lines 23-30) with:

```ts
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5 all year
const UZBEK_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
] as const;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Tashkent wall-clock parts of an instant, read through UTC getters so the
 * machine's own time zone never matters (issue 34: a till set to UTC printed
 * 19:30 on a bill closed at 00:30).
 */
function tashkentParts(value: Date) {
  const t = new Date(value.getTime() + TASHKENT_OFFSET_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate(), hours: t.getUTCHours(), minutes: t.getUTCMinutes() };
}

/** "30.09.2026 02:30" — the real Tashkent date and time, for paper. */
export function formatDateTimeUZ(value: Date): string {
  const p = tashkentParts(value);
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hours)}:${pad(p.minutes)}`;
}

/** "30.09 02:30" — a row time on the PDF. */
export function formatDayMonthTimeUZ(value: Date): string {
  const p = tashkentParts(value);
  return `${pad(p.day)}.${pad(p.month)} ${pad(p.hours)}:${pad(p.minutes)}`;
}

/** "29.09.2026" for a day key. */
export function formatDayKeyUZ(dayKey: string): string {
  const [yyyy, mm, dd] = dayKey.split('-');
  return `${dd}.${mm}.${yyyy}`;
}

/** "29 Sentabr 2026" for a day key. */
export function formatDayKeyLongUZ(dayKey: string): string {
  const [yyyy, mm, dd] = dayKey.split('-');
  return `${Number(dd)} ${UZBEK_MONTHS[Number(mm) - 1] ?? mm} ${yyyy}`;
}
```

In `apps/master/src/main/pdf-report.ts`: delete `fmtDateUz` and `fmtDateTimeShort` (lines 42-54)
and their `UZBEK_MONTHS` (lines 16-19) if nothing else uses it; import
`formatDayKeyLongUZ, formatDayMonthTimeUZ` from `./server/lib/format` and `localDayKey` from
`./server/lib/time`; replace each `fmtDateTimeShort(x)` (lines 341, 490, 539, 661, 695) with
`x ? formatDayMonthTimeUZ(new Date(x)) : '—'` (keep the `'—'` for null as today), and line 340 with
`const dateLabel = formatDayKeyLongUZ(localDayKey(opts.date));`.

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/format.test.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/12-host-clock.test.ts e2e/01-bill.test.ts 2>&1 | grep -E '✓|×|Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  5 passed (5)`; both `12-host-clock` tests pass (`[issue 34]` flips); `01-bill`
unchanged from baseline; `Test Files  16 passed (16)`, `Tests  182 passed (182)`; `47`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/lib/format.ts apps/master/src/main/server/lib/format.test.ts apps/master/src/main/pdf-report.ts
git commit -m "fix(format): document dates in Tashkent time whatever the machine clock" -m "Money rules §4 (34). The bill and the PDF's row times read the Tashkent wall clock through UTC getters."
```

---

### Task 3: Every day range and every "today" by trading day

One commit, because a day anchor is shared: once a service reads `tradingDayOf(anchor)`, an anchor
still built at 00:00 names the day before. Every caller that builds an anchor moves in this task.

**Files:**
- Create: `apps/master/e2e/16-trading-day.test.ts`
- Modify (server, mapping below): `repositories/expense.repo.ts:3,63`;
  `repositories/debt.repo.ts:3,54,90,127,166,196`; `repositories/payment.repo.ts:3,51`;
  `services/reports.service.ts:6-12,72-74,257-259,423-424,533,547,552,557,566,580,582,662,786-793,1003-1004,1076-1077`;
  `services/finance.service.ts:8,39-40,307,319,366`; `services/order.service.ts:12,166,172`;
  `services/expense.service.ts:7,168,420`; `controllers/me.controller.ts:5,26-27,92,95,127,135-140`;
  `controllers/users.controller.ts:8,83-84`; `controllers/reports.controller.ts:5,18,28-30,41-42`;
  `controllers/finance.controller.ts:4-9,27,40,44,46,51-53`; `controllers/debt.controller.ts:6,30`;
  `controllers/expense.controller.ts:5,55,70-71`; `controllers/orders.controller.ts:6,92`;
  `services/telegram-bot.service.ts:6-11,26-40,145,180-182,200,232-233,315,320,330-332,338,549-641,557,633`;
  `services/finance-report.service.ts:8-22,36-41,80-81,131,152` (all under
  `apps/master/src/main/server/`); `apps/master/src/main/pdf-report.ts` (Task 2's `localDayKey`);
  `apps/master/src/main/index.ts:397-400`
- Modify (e2e callers): `e2e/00-harness.test.ts:22`, `e2e/02-payments.test.ts:38`,
  `e2e/04-stock-cost.test.ts:133`, `e2e/05-expenses.test.ts:55-56`,
  `e2e/07-day.test.ts:131-132,140-141,146`, `e2e/08-staff-access.test.ts:62,76,81`

**Interfaces:**
- Consumes: Task 1's API, Task 2's formatters.
- Produces: the API contract in the Design (every `date`/`from`/`to`/`month` is a trading day; day
  anchors are 05:00), and the Design's "Provides" (`dailyLedger(dayKey: string)` over
  `tradingDayRange(dayKey)`; Date-taking services take `tradingDayStart(dayKey)`).
  `localClockMinutes` is still called by `finance-report.service.ts:64,162` until Task 4.

- [ ] **Step 1: Write the failing e2e tests**

Create `apps/master/e2e/16-trading-day.test.ts`. The server runs on a machine clock set to UTC, the
way a till with a wrong Windows time zone would; every expectation below holds anyway.

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// The trading day ends at 05:00 Tashkent (money rules D11): a bill closed at
// 02:30 belongs to the evening before in every report, while the bill itself
// keeps its real date and time.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { at, boot, buildWorld, capturePrints, n, openOrder, sale, sendOrder, setClock, type Env, type World } from './harness';

const printer = capturePrints();
let env: Env;
let w: World;
const EVE = '2026-09-29';
const NEXT = '2026-09-30';
const OCT1 = '2026-10-01';
const ids: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', string> = { A: '', B: '', C: '', D: '', E: '', F: '' };
const cash = (amount: number) => ({ payments: [{ method: 'CASH', amount }] });

async function clock(local: string) {
  setClock(at(local));
  await w.relogin(); // admin sessions last 8 hours
}

// Hand-computed truth, by trading day.
//   A 29.09 22:00 Aziz   Osh 2 + Xizmat 2   Naqd  100 000  (food 90 000, xizmat 10 000, tan narx 50 000)
//   E 30.09 00:40 Aziz   Choy 1, sent, cancelled by the admin at 01:00
//   B 30.09 02:30 Aziz   Somsa 2 + Xizmat 1 Karta  21 000  (food 16 000, xizmat  5 000, tan narx  8 000)
//     30.09 03:00        Gaz expense                15 000
//   C 30.09 04:59 Bekzod Choy 2             Naqd   10 000  (food 10 000,                 tan narx  2 000)
//   D 30.09 05:00 Bekzod Osh 1              Naqd   45 000  (food 45 000,                 tan narx 25 000)
//   F 01.10 02:00 Aziz   Somsa 1            Naqd    8 000  (food  8 000,                 tan narx  4 000)
const EVE_TRUTH = {
  closed: 3, canceled: 1, netSales: 116000, service: 15000, cash: 110000, card: 21000,
  cogs: 60000, operating: 15000, profit: 41000, cashOut: 15000, moneyIn: 131000, drawer: 116000,
};
const NEXT_TRUTH = {
  closed: 2, canceled: 0, netSales: 53000, service: 0, cash: 53000, card: 0,
  cogs: 29000, operating: 0, profit: 24000, cashOut: 0, moneyIn: 53000, drawer: 53000,
};
const figures = (l: any) => ({
  closed: l.sales.closedCount, canceled: l.sales.canceledCount, netSales: n(l.sales.netSales),
  service: n(l.sales.serviceCharge), cash: n(l.cashflow.orderCash), card: n(l.cashflow.orderCard),
  cogs: n(l.pnl.cogs), operating: n(l.pnl.operatingExpense), profit: n(l.pnl.profit),
  cashOut: n(l.cashflow.cashOut), moneyIn: n(l.cashflow.realCashIn), drawer: n(l.cashflow.drawerMovement),
});

beforeAll(async () => {
  process.env.TZ = 'UTC';
  setClock(at(`${EVE}T09:00`));
  env = await boot('trading-day');
  w = await buildWorld(env.base);
  await clock(`${EVE}T22:00`);
  ids.A = (await sale(w, w.w1, [[w.items.osh, 2], [w.items.xizmat, 2]], cash(100000))).id;
  await clock(`${NEXT}T00:40`);
  ids.E = await openOrder(w.w1, w.nextTable(), [[w.items.choy, 1]]);
  await sendOrder(w.w1, ids.E);
  await clock(`${NEXT}T01:00`);
  await w.admin.post(`/api/orders/${ids.E}/cancel`, { reason: 'Mehmon ketdi' });
  await clock(`${NEXT}T02:30`);
  ids.B = (await sale(w, w.w1, [[w.items.somsa, 2], [w.items.xizmat, 1]], { payments: [{ method: 'CARD', amount: 21000 }] })).id;
  await clock(`${NEXT}T03:00`);
  await w.admin.post('/api/expenses', { amount: 15000, reason: 'Gaz', occurredAt: at(`${NEXT}T03:00`).toISOString() });
  await clock(`${NEXT}T04:59`);
  ids.C = (await sale(w, w.w2, [[w.items.choy, 2]], cash(10000))).id;
  await clock(`${NEXT}T05:00`);
  ids.D = (await sale(w, w.w2, [[w.items.osh, 1]], cash(45000))).id;
  await clock(`${OCT1}T02:00`);
  ids.F = (await sale(w, w.w1, [[w.items.somsa, 1]], cash(8000))).id;
});
afterAll(async () => {
  printer.restore();
  await env?.close();
});

describe('The trading day ends at 05:00 (D11)', () => {
  it('[D11] bills closed between 00:00 and 05:00 belong to the evening before', async () => {
    expect({
      [EVE]: figures(await env.svc.reports.dailyLedger(EVE)),
      [NEXT]: figures(await env.svc.reports.dailyLedger(NEXT)),
    }).toEqual({ [EVE]: EVE_TRUTH, [NEXT]: NEXT_TRUTH });
  });

  it('[D11] 04:59 is the evening before, 05:00 is the new day', async () => {
    const billsOf = async (day: string) =>
      (await env.svc.reports.dailyLedger(day)).lines.closedOrders.map((o: any) => o.orderId).sort();
    expect({ [EVE]: await billsOf(EVE), [NEXT]: await billsOf(NEXT) }).toEqual({
      [EVE]: [ids.A, ids.B, ids.C].sort(),
      [NEXT]: [ids.D, ids.F].sort(),
    });
  });

  it('[D11] owner daily, admin daily, the month and the period report agree on the trading day', async () => {
    const daily = await w.owner.get(`/api/reports/daily?date=${EVE}`);
    const admin = await w.admin.get(`/api/finance/daily?date=${EVE}`);
    const month = await w.owner.get(`/api/reports/monthly?month=${EVE.slice(0, 7)}`);
    const row = month.daily.find((r: any) => r.date === EVE);
    const period = await w.owner.get(`/api/reports/summary?from=${EVE}&to=${EVE}`);
    const periodNext = await w.owner.get(`/api/reports/summary?from=${NEXT}&to=${NEXT}`);
    expect({
      ownerProfit: n(daily.results.salesBasedProfit), adminProfit: n(admin.pnl.profit),
      monthProfit: n(row.pnl.profit), periodProfit: n(period.pnl.profit), nextPeriodProfit: n(periodNext.pnl.profit),
      ownerDrawer: n(daily.results.cashflowBasedNet), adminDrawer: n(admin.drawer.movement),
      monthDrawer: n(row.results.cashflowBasedNet), periodDrawer: n(period.cash.farq),
    }).toEqual({
      ownerProfit: 41000, adminProfit: 41000, monthProfit: 41000, periodProfit: 41000, nextPeriodProfit: 24000,
      ownerDrawer: 116000, adminDrawer: 116000, monthDrawer: 116000, periodDrawer: 116000,
    });
  });

  it("[D11] an expense paid at 03:00 is the evening before's", async () => {
    const eve = await w.admin.get(`/api/expenses?date=${EVE}`);
    const next = await w.admin.get(`/api/expenses?date=${NEXT}`);
    expect({
      eveDate: eve.date,
      eve: eve.items.map((e: any) => [e.reason, n(e.amount)]),
      next: next.items.length,
    }).toEqual({ eveDate: EVE, eve: [['Gaz', 15000]], next: 0 });
  });

  it('[D11] a bill at 02:00 on 1 October is September\'s', async () => {
    const sep = await w.owner.get('/api/reports/monthly?month=2026-09');
    const oct = await w.owner.get('/api/reports/monthly?month=2026-10');
    expect({
      sepNetSales: n(sep.totals.netSales),
      sep30: n(sep.daily.find((r: any) => r.date === NEXT).sales.netSales),
      octBills: oct.totals.closedOrders,
    }).toEqual({ sepNetSales: 169000, sep30: 53000, octBills: 0 });
  });

  it('[D11] Buyurtmalar lists the trading day\'s closed and cancelled bills', async () => {
    const closed = await w.admin.get(`/api/orders?status=CLOSED&date=${EVE}`);
    const canceled = await w.admin.get(`/api/orders?status=CANCELED&date=${EVE}`);
    expect({
      closed: closed.map((o: any) => o.id).sort(),
      canceled: canceled.map((o: any) => o.id),
    }).toEqual({ closed: [ids.A, ids.B, ids.C].sort(), canceled: [ids.E] });
  });

  it('[D11] Xodimlar maoshi puts Xizmat haqi on its trading day', async () => {
    const m = await w.admin.get(`/api/finance/service-charge?from=${EVE}&to=${NEXT}`);
    const aziz = m.waiters.find((r: any) => r.waiterName === 'Aziz');
    expect({ days: m.dayLabels.map((d: any) => d.key), aziz: aziz.daily.map(n), total: n(aziz.total) })
      .toEqual({ days: [EVE, NEXT], aziz: [15000, 0], total: 15000 });
  });

  it('[D11] the bill printed at 02:30 keeps its real date and time', () => {
    expect(printer.billFor(ids.B).info).toContain('Sana: 30.09.2026 02:30');
  });

  it('[D11] the Telegram day report names the trading day and counts its bills', async () => {
    const anchor = env.svc.time.tradingDayStart(EVE);
    const msg: string = env.svc.telegram.formatReportMessage(anchor, await env.svc.reports.daily(anchor));
    expect({
      title: msg.includes('29.09.2026 — kunlik moliyaviy hisobot'),
      bills: msg.match(/Yopilgan buyurtmalar: <b>(\d+)<\/b>/)?.[1],
    }).toEqual({ title: true, bills: '3' });
  });
});

describe('"Today" at 02:45 is the evening before (D11)', () => {
  beforeAll(async () => {
    await clock(`${NEXT}T02:45`);
  });

  it("[D11] a waiter's today, asked at 02:45, is the evening's", async () => {
    const s = await w.w1.get('/api/me/today-stats');
    expect({
      date: s.date, ordersClosed: s.ordersClosed, ordersCanceled: s.ordersCanceled,
      foodRevenue: n(s.foodRevenue), serviceEarned: n(s.serviceEarned), totalBilled: n(s.totalBilled),
    }).toEqual({ date: EVE, ordersClosed: 2, ordersCanceled: 1, foodRevenue: 106000, serviceEarned: 15000, totalBilled: 121000 });
  });

  it("[D11] the admin's waiter list, asked at 02:45, is the evening's", async () => {
    const s = await w.admin.get('/api/users/today-stats');
    expect({ date: s.date, orders: Object.fromEntries(s.items.map((r: any) => [r.waiterName, r.orders])) })
      .toEqual({ date: EVE, orders: { Aziz: 2, Bekzod: 1 } });
  });

  it("[D11] the waiter's calendar puts each bill on its trading day", async () => {
    const r = await w.w1.get(`/api/me/range-stats?from=${EVE}&to=${NEXT}`);
    expect(r.days.map((d: any) => [d.date, d.ordersClosed, n(d.serviceEarned)]))
      .toEqual([[EVE, 2, 15000], [NEXT, 1, 0]]);
  });

  it('[D11] an expense booked at 23:00 can still be undone at 02:00', async () => {
    await clock(`${EVE}T23:00`);
    const svet = await w.admin.post('/api/expenses', { amount: 5000, reason: 'Svet', occurredAt: at(`${EVE}T23:00`).toISOString() });
    await clock(`${NEXT}T02:00`);
    const undo = await w.admin.call('POST', `/api/expenses/${svet.id}/reverse`, { note: "Noto'g'ri kiritildi" });
    const after = figures(await env.svc.reports.dailyLedger(EVE));
    expect({ undo: undo.status < 300, cashOut: after.cashOut, operating: after.operating })
      .toEqual({ undo: true, cashOut: 15000, operating: 15000 });
  });
});
```

Then rename the old helpers in the e2e callers: in `00-harness.test.ts:22`,
`02-payments.test.ts:38`, `04-stock-cost.test.ts:133` and `08-staff-access.test.ts:62,76,81`
replace `env.svc.time.localDayKey()` with `env.svc.time.tradingDayOf()`; in
`05-expenses.test.ts:55-56` and `07-day.test.ts:131-132,140-141,146` replace
`env.svc.time.parseLocalDay(` with `env.svc.time.tradingDayStart(`. Each of those tests builds its
day between 09:00 and 23:55, so its expectation is unchanged; the rename keeps them right when the
suite runs between 00:00 and 05:00.

- [ ] **Step 2: Run the new file to verify it fails**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/16-trading-day.test.ts 2>&1 | grep -E '✓|×|Tests'
```

Expected: 12 of 13 fail, each with the calendar-day figure (`EVE` shows 1 bill, A alone; the
waiter's `date` is `2026-09-30`; the undo answers `EXPENSE_REVERSAL_SAME_DAY_ONLY`). The receipt
test passes already (Task 2).

- [ ] **Step 3: Move the server onto the trading day**

Apply this mapping at every line listed under **Files**; nothing else in those lines changes:

| Old | New |
|---|---|
| `localDayKey(x)` / `localDayKey()` | `tradingDayOf(x)` / `tradingDayOf()` |
| `localDayKey(x).slice(0, 7)` | `tradingMonthOf(x)` |
| `parseLocalDay(key)` | `tradingDayStart(key)` |
| `localDayRangeFor(key)` | `tradingDayRange(key)` |
| `localDayRange(date)` | `tradingDayRangeAt(date)` |
| `localMonthRangeFor(month)` | `tradingMonthRange(month)` |
| `isSameLocalDay(a, b)` | `isSameTradingDay(a, b)` |

Specific places that need more than the mapping:

- `reports.service.ts:72-74` — `dayBounds` has no caller; delete it.
- `reports.service.ts:786` — the summary comment says
  `Range is local-day inclusive: [from 00:00, to 23:59]`; make it
  `Range is trading-day inclusive: [from 05:00, the day after to 05:00)`.
- `me.controller.ts:135-137` — the comment about walking "Tashkent midnight"s becomes "trading-day
  starts (05:00)"; the 24 h step stays exact (no DST).
- `finance.controller.ts:15-16,48-49` — comments say "calendar month" and "Last day of the month,
  expressed as a day-start instant": say "trading month" and "the last trading day's 05:00 anchor".
  The arithmetic (`range.end − 24 h`) stays.
- `telegram-bot.service.ts:32-40` — replace `tashkentTodayAnchor()` with `tradingDayAnchor()` and
  `tashkentDaysAgoAnchor(n)` with `tradingDayAnchor(n)` at every call site (lines 200, 233, 320,
  549, 551, 597, 603, 609, 629-630, 639-641) and delete both functions; `formatDateLabel` (26-30)
  becomes `formatDayKeyUZ(tradingDayOf(date))` from `../lib/format`; `/oylik` and the month button
  (557, 633) take `tradingMonthOf().split('-')`; `parseRangeArgs` (330-332) defaults to
  `tradingMonthRange(tradingMonthOf()).start` and `tradingDayAnchor()`. Leave its money formatter
  alone (issue 33 is not this package).
- `finance-report.service.ts:15-22` — `previousMonthKey(now)` becomes
  `tradingMonthOf(new Date(tradingMonthRange(tradingMonthOf(now)).start.getTime() - 1))`; delete the
  unused `formatDateLabel` (36-41); `:80-81` become `tradingDayOf(date)` / `tradingDayStart(...)`;
  `:131` and `:152` use `tradingDayOf(now)`. Keep `localClockMinutes` at 64 and 162 (Task 4).
- `apps/master/src/main/index.ts:397-400` — the save-PDF IPC parsed the key as the machine's local
  midnight, which is now the day before. Replace the comment and the two lines that build `date`
  with
  `const date = tradingDayStart(payload.date);` (import from `./server/lib/time`); keep the
  `invalid-date` guard above it, and catch a `VALIDATION` throw as `invalid-date` too.
- `pdf-report.ts` — Task 2's `localDayKey(opts.date)` becomes `tradingDayOf(opts.date)`.

Afterwards this mapping grep must print nothing but `lib/time.ts` itself, the two
`localClockMinutes` lines in `finance-report.service.ts` (Task 4 moves them) and the two comments in
`src/renderer/lib/format.ts` (`:26`, `:91`; Task 5 deletes them). `scripts/` is Task 7's:

```bash
docker exec -w /app CONTAINER grep -rnE 'localDayKey|localClockMinutes|parseLocalDay|localDayRange|localMonthRangeFor|isSameLocalDay|localToday' apps/master/src apps/master/e2e
```

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/16-trading-day.test.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  13 passed (13)`; whole suite `Tests  37 failed | 82 passed (119)` — the 13 new
tests pass, `[issue 34]` passed since Task 2, every other test keeps its baseline status (compare
the failing names against Task 1's list, not just the count); `Tests  182 passed (182)`; `47`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main apps/master/e2e/16-trading-day.test.ts apps/master/e2e/00-harness.test.ts apps/master/e2e/02-payments.test.ts apps/master/e2e/04-stock-cost.test.ts apps/master/e2e/05-expenses.test.ts apps/master/e2e/07-day.test.ts apps/master/e2e/08-staff-access.test.ts
git status --short | grep '\.data' && echo 'STOP: .data is staged' || echo 'clean'
git commit -m "feat(reports): every day range and every today is the trading day" -m "Money rules D11. A bill closed at 02:30 belongs to the evening before in every report, the waiter's day, Telegram, the PDF and Excel. Day anchors are 05:00 Tashkent. Past data regroups when computed; nothing is migrated."
```

---

### Task 4: The monthly report runs on the trading clock

The daily trigger is P5's (D21 replaces it), so this task moves only what P5 does not touch: the
monthly trigger goes onto the trading clock, and `/yordam` names the rule. The daily trigger keeps
its behaviour — 23:30 on the trading day, no catch-up between 00:00 and 05:00 — and changes only its
helper names, so that Task 7 can delete `localClockMinutes`. No daily-trigger test is added here:
P5 deletes `shouldSendDailyTelegram`, and `09-nightly-report` already pins the 23:30 send.

**Files:**
- Modify: `apps/master/src/main/server/services/finance-report.service.ts:62-67` (daily trigger,
  helper names only), `:162-164` (monthly trigger), imports `:8-13`
- Modify: `apps/master/src/main/server/services/telegram-bot.service.ts:282-283` (`/yordam` text)
- Modify: `apps/master/e2e/16-trading-day.test.ts` (one new `describe` at the end)

**Interfaces:**
- Consumes: `tradingMinutes`, `clockToTradingMinutes`, `tradingDayOf`.
- Produces: `shouldSendMonthlyTelegram(now)` on the trading clock. `shouldSendDailyTelegram(now)`
  keeps its wall-clock window (P5 replaces it).

- [ ] **Step 1: Write the failing e2e test**

Append to `apps/master/e2e/16-trading-day.test.ts`:

```ts
describe("The owner's monthly report runs on the trading clock (D11)", () => {
  async function setSetting(key: string, value: string) {
    await env.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await env.svc.settings.loadAll();
  }

  it("[D11] the monthly report waits for the configured time on trading day 1's clock", async () => {
    await setSetting('monthly_report_telegram_enabled', 'true');
    await setSetting('monthly_report_telegram_time', '03:00');
    expect({
      oct1At0400: env.svc.financeReport.shouldSendMonthlyTelegram(at(`${OCT1}T04:00`)),
      oct1At0600: env.svc.financeReport.shouldSendMonthlyTelegram(at(`${OCT1}T06:00`)),
      oct2At0300: env.svc.financeReport.shouldSendMonthlyTelegram(at('2026-10-02T03:00')),
    }).toEqual({ oct1At0400: false, oct1At0600: false, oct2At0300: true });
  });
});
```

`03:00` on the trading clock is the night at the end of trading day 1: 04:00 on 1 October is still
September's last trading day, so the month has not ended; at 06:00 on 1 October trading day 1 has
begun but its clock has not reached 03:00; 03:00 on 2 October is trading day 1 October. With the
default `09:00` the wall clock and the trading clock agree, which is why the test sets `03:00`.

- [ ] **Step 2: Run to verify it fails**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/16-trading-day.test.ts -t "trading clock" 2>&1 | grep -E '✓|×|Tests'
```

Expected: 1 failed — `oct1At0600` is `true`. After Task 3 the day-1 check already reads
`tradingDayOf(now)`, so `oct1At0400` and `oct2At0300` pass; only the clock comparison is still on
the wall clock (360 ≥ 180).

- [ ] **Step 3: Implement**

In `finance-report.service.ts`, in `shouldSendDailyTelegram` replace lines 62-67 with:

```ts
    // 23:30 on the trading day (money rules D11), for that trading day. No
    // catch-up after midnight: a report the till missed at 23:30 is not sent
    // between 00:00 and 05:00. P5 replaces this trigger (D21).
    const nowMinutes = tradingMinutes(now);
    const targetMinutes = clockToTradingMinutes(hh, mm);
    const midnight = clockToTradingMinutes(0, 0);
    return nowMinutes >= targetMinutes && (targetMinutes >= midnight || nowMinutes < midnight);
```

With the default `23:30` this is exactly the old wall-clock rule (23:30–23:59); a time set between
00:00 and 05:00 sends that night, for the evening it belongs to, and not again at 05:00 for the new
trading day.

In `shouldSendMonthlyTelegram` keep the day-1 check (`tradingDayOf(now).endsWith('-01')`, from
Task 3) and replace lines 162-164 with:

```ts
    // On the trading clock (D11): trading day 1 runs 05:00 on the 1st to 05:00 on the 2nd.
    return tradingMinutes(now) >= clockToTradingMinutes(hh, mm);
```

Drop `localClockMinutes` from the imports and add `clockToTradingMinutes, tradingMinutes`. In
`telegram-bot.service.ts:282`, after the header line, add
`'<i>Savdo kuni 05:00 da tugaydi: 00:00–05:00 dagi savdo oldingi kunga yoziladi.</i>\n\n' +`.

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/16-trading-day.test.ts e2e/09-nightly-report.test.ts 2>&1 | grep -E '✓|×|Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: all 14 in `16-trading-day` pass; `09-nightly-report` exactly as at baseline (it sends at
23:31 and 23:55, inside the unchanged window; its three `[issue 22]` tests belong to P5 — the 23:45
bill still misses the 23:30 report); whole suite `Tests  37 failed | 83 passed (120)`; `47`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/services/finance-report.service.ts apps/master/src/main/server/services/telegram-bot.service.ts apps/master/e2e/16-trading-day.test.ts
git commit -m "feat(reports): the monthly report runs on the trading clock" -m "The monthly report waits for the configured time on trading day 1's clock; /yordam says the day ends at 05:00. The daily report keeps 23:30 with no catch-up after midnight (D21 replaces it in a later slice)."
```

---

### Task 5: The renderer opens on the trading day

**Files:**
- Create: `apps/master/src/renderer/lib/trading-day.ts`, `apps/master/src/renderer/lib/trading-day.test.ts`
- Modify: `apps/master/src/renderer/lib/format.ts:26-33,88-102` (remove `dayKeyFormatter`,
  `tashkentDayKey`, `tashkentMonthKey`)
- Modify: `pages/OrdersPage.tsx:6,41-45`; `pages/ReportsPage.tsx:36,45-48,68-87,480-481,574-575`;
  `pages/DashboardPage.tsx:11,53`; `pages/FinancePage.tsx:10,21-22,33-41`;
  `pages/ExpensesPage.tsx:19-22,35`; `components/expenses/ExpensePanel.tsx:10-18,68`;
  `pages/SalariesPage.tsx:24-25` (all under `apps/master/src/renderer/`)
- Modify: `apps/master/gallery/fixtures/util.ts:55-79`

**Interfaces:**
- Consumes: nothing from the server; the same rule, in the renderer's own pure module.
- Produces: `tradingDayKey(at?)`, `tradingMonthKey(at?)`, `shiftDayKey(key, days)`,
  `isSameTradingDay(a, b?)`, `presetRange(preset, now?)`, `nightNote(now?)`.

- [ ] **Step 1: Write the failing unit tests**

Create `apps/master/src/renderer/lib/trading-day.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { isSameTradingDay, nightNote, presetRange, shiftDayKey, tradingDayKey, tradingMonthKey } from './trading-day';

const at = (local: string): Date => new Date(`${local}:00+05:00`);

describe('tradingDayKey', () => {
  it.each([
    ['2026-09-30T04:59', '2026-09-29'],
    ['2026-09-30T05:00', '2026-09-30'],
    ['2026-10-01T02:00', '2026-09-30'],
    ['2027-01-01T04:00', '2026-12-31'],
  ])('%s Tashkent is the trading day %s, as on the server', (local, key) => {
    expect(tradingDayKey(at(local))).toBe(key);
  });
});

describe('the rest of the helpers', () => {
  it('puts 02:00 on 1 October in September', () => {
    expect(tradingMonthKey(at('2026-10-01T02:00'))).toBe('2026-09');
  });

  it('shifts day keys across months and years', () => {
    expect([shiftDayKey('2026-03-01', -1), shiftDayKey('2026-12-31', 1)]).toEqual(['2026-02-28', '2027-01-01']);
  });

  it('treats 23:00 and the 04:00 after it as one trading day', () => {
    expect(isSameTradingDay('2026-09-29T18:00:00.000Z', at('2026-09-30T04:00'))).toBe(true);
    expect(isSameTradingDay(at('2026-09-30T04:59'), at('2026-09-30T05:00'))).toBe(false);
  });
});

describe('presetRange at 02:00 on Thursday 1 October (trading day Wednesday 30 September)', () => {
  const now = at('2026-10-01T02:00');
  it.each([
    ['today', '2026-09-30', '2026-09-30'],
    ['yesterday', '2026-09-29', '2026-09-29'],
    ['this-week', '2026-09-28', '2026-09-30'],
    ['this-month', '2026-09-01', '2026-09-30'],
    ['last-month', '2026-08-01', '2026-08-31'],
    ['last-30', '2026-09-01', '2026-09-30'],
  ] as const)('%s runs from %s to %s', (preset, from, to) => {
    expect(presetRange(preset, now)).toEqual({ from, to });
  });
});

describe('presetRange from 05:00 on 1 October', () => {
  it('starts October', () => {
    const now = at('2026-10-01T05:00');
    expect({
      today: presetRange('today', now),
      week: presetRange('this-week', now),
      month: presetRange('this-month', now),
      last: presetRange('last-month', now),
    }).toEqual({
      today: { from: '2026-10-01', to: '2026-10-01' },
      week: { from: '2026-09-28', to: '2026-10-01' },
      month: { from: '2026-10-01', to: '2026-10-01' },
      last: { from: '2026-09-01', to: '2026-09-30' },
    });
  });
});

describe('nightNote', () => {
  it('names the evening between 00:00 and 05:00, and is silent otherwise', () => {
    expect([
      nightNote(at('2026-10-01T00:00')),
      nightNote(at('2026-10-01T02:00')),
      nightNote(at('2026-10-01T05:00')),
      nightNote(at('2026-09-30T23:59')),
    ]).toEqual([
      '05:00 gacha savdo 30.09 kuniga yoziladi',
      '05:00 gacha savdo 30.09 kuniga yoziladi',
      null,
      null,
    ]);
  });
});
```

15 tests. Run them to see them fail (module missing):

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/renderer/lib/trading-day.test.ts 2>&1 | tail -5
```

- [ ] **Step 2: Implement the module**

Create `apps/master/src/renderer/lib/trading-day.ts`:

```ts
/**
 * The trading day on the renderer side (money rules D11): it runs from 05:00
 * Tashkent to 05:00 the next morning, so at 02:00 "today" is the evening
 * before. Same rule as the server's `lib/time.ts` `tradingDayOf`; both test
 * files pin the same instants. Tashkent is UTC+5 all year.
 */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const TRADING_DAY_START_MS = 5 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

export type RangePreset = 'today' | 'yesterday' | 'this-week' | 'this-month' | 'last-month' | 'last-30';

/** "YYYY-MM-DD" of the trading day containing `at`. */
export function tradingDayKey(at: Date = new Date()): string {
  return new Date(at.getTime() + TASHKENT_OFFSET_MS - TRADING_DAY_START_MS).toISOString().slice(0, 10);
}

export function tradingMonthKey(at: Date = new Date()): string {
  return tradingDayKey(at).slice(0, 7);
}

export function shiftDayKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isSameTradingDay(a: string | Date, b: Date = new Date()): boolean {
  return tradingDayKey(new Date(a)) === tradingDayKey(b);
}

/** Inclusive trading-day range for a preset button. Weeks start on Monday. */
export function presetRange(preset: RangePreset, now: Date = new Date()): { from: string; to: string } {
  const today = tradingDayKey(now);
  const month = today.slice(0, 7);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = shiftDayKey(today, -1);
      return { from: y, to: y };
    }
    case 'this-week': {
      const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
      return { from: shiftDayKey(today, -((dow + 6) % 7)), to: today };
    }
    case 'this-month':
      return { from: `${month}-01`, to: today };
    case 'last-month': {
      const lastDay = shiftDayKey(`${month}-01`, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
    case 'last-30':
      return { from: shiftDayKey(today, -29), to: today };
  }
}

/**
 * Between 00:00 and 05:00 the sales still go to the evening's trading day;
 * Kunlik moliya says so beside its date. Null the rest of the day.
 */
export function nightNote(now: Date = new Date()): string | null {
  const tashkentHour = new Date(now.getTime() + TASHKENT_OFFSET_MS).getUTCHours();
  if (tashkentHour >= 5) return null;
  const [, mm, dd] = tradingDayKey(now).split('-');
  return `05:00 gacha savdo ${dd}.${mm} kuniga yoziladi`;
}
```

- [ ] **Step 3: Move the pages onto it**

- `lib/format.ts`: delete `dayKeyFormatter` (26-33), `tashkentDayKey` and `tashkentMonthKey`
  (88-102). The typechecker then lists every caller.
- `OrdersPage.tsx:6,45`, `DashboardPage.tsx:11,53`, `FinancePage.tsx:10,22`: import
  `tradingDayKey` from `@/lib/trading-day` and call it where `tashkentDayKey()` was; fix the
  comments that say "Tashkent day" to "trading day".
- `ReportsPage.tsx`: `localDateString`/`localMonthString` (47-48) become `tradingDayKey` /
  `tradingMonthKey`; delete `tashkentPreset` (68-87) and call `presetRange(key)` at 575 and 649
  (its keys are a subset of `RangePreset`); `summaryFrom` (480) becomes
  `presetRange('this-month').from`; `todayKey` (574) becomes `tradingDayKey()`.
- `ExpensesPage.tsx:19-22,35`: delete `localDateString`; `useState(() => tradingDayKey())`.
- `ExpensePanel.tsx:10-18,68`: delete `isToday`; `isSameTradingDay(item.occurredAt)`. Same rule as
  the server's undo window (Task 3).
- `SalariesPage.tsx:24-25`: change only the `today` key inside `shortcut` — import
  `tradingDayKey` from `@/lib/trading-day` and replace the two lines that build `today` from the
  machine's date with

  ```ts
    // Local midnight of the trading day; the presets below count from it.
    const today = new Date(`${tradingDayKey()}T00:00:00`);
  ```

  `isoDate`, `PresetKey`, the preset arithmetic and `PRESETS` stay as they are: P6 Task 9 removes
  the date-range presets (D25), so they are not reworked here. `DailyMatrix.tsx` keeps its own
  calendar `isoDate`.
- `FinancePage.tsx` status (33-41): put the note before the date field —

```tsx
      status={
        <>
          {note ? <span className="text-[13px] text-muted-foreground">{note}</span> : null}
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
            aria-label="Sana"
          />
        </>
      }
```

  with `const note = nightNote();` beside the `date` state. Plain text, no hover, 13 px floor; the
  status row already wraps (`flex-wrap`, `Screen.tsx:40`).
- `gallery/fixtures/util.ts:55-79`: delete `TASHKENT_DAY_FORMATTER`; `dayKey(days)` returns
  `tradingDayKey(new Date(NOW - days * 86_400_000))` imported from `@/lib/trading-day`; fix the
  comment that names `tashkentDayKey`.

- [ ] **Step 4: Verify**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER grep -rn 'tashkentDayKey\|tashkentMonthKey\|now\.getDate()' src/renderer/pages src/renderer/lib gallery/fixtures/util.ts src/renderer/components/expenses
```

Expected: `Test Files  17 passed (17)`, `Tests  197 passed (197)`; `0`; `0`; the grep prints
nothing (`now.getDate()` is the machine's own "today"; `SalariesPage`'s remaining
`today.getDate()` works on the trading-day `today` and goes with P6 Task 9). If the browser harness from the project memory ("Run the renderer in a browser") is up,
open Kunlik moliya with the clock at 02:00 at 1236 × 623 and check the note sits beside the date on
one line; this is a manual check, not a gate.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/renderer apps/master/gallery/fixtures/util.ts
git commit -m "feat(renderer): every screen opens on the trading day" -m "At 02:00 Kunlik moliya, Hisobot, Bosh sahifa, Buyurtmalar, Xarajatlar and Xodimlar maoshi show the evening before, and Kunlik moliya says why. Three pages that read the machine's own date now use the same rule."
```

---

### Task 6: The waiter's "Bugun" is the trading day

**Files:**
- Modify: `apps/mobile/src/screens/MyDayScreen.tsx:27-33`

**Interfaces:**
- Consumes: the identity pinned in `time.test.ts` ("is the UTC date of the instant").
- Produces: nothing new; the server already answers `/api/me/today-stats` without a date for the
  trading day (Task 3).

`apps/mobile` has no test runner. The rule it uses is the one-line identity the server's unit test
proves for every hour of 2026, so the check here is the mobile typecheck plus that test.

- [ ] **Step 1: Implement**

Replace `todayLocalKey` (lines 31-33) with:

```ts
/**
 * Today's trading day (money rules D11): 00:00–05:00 Tashkent still belongs
 * to the evening before. Tashkent is UTC+5 all year and the day starts at
 * 05:00 there, which is 00:00 UTC — so the trading day is the UTC date, on a
 * phone set to any time zone. The server's `tradingDayOf` pins this identity
 * in `apps/master/src/main/server/lib/time.test.ts`.
 */
function todayLocalKey(): string {
  return new Date().toISOString().slice(0, 10);
}
```

`dayKey`, `parseKey`, `addDays`, `monthStartKey` and `monthEndKey` stay: they do calendar arithmetic
on keys, which is the same for both kinds of day.

- [ ] **Step 2: Verify**

```bash
docker exec -w /app/apps/mobile CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: the count Task 1 recorded.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/MyDayScreen.tsx
git commit -m "feat(mobile): the waiter's Bugun is the trading day" -m "At 02:00 Mening kunim shows the evening's bills and Xizmat haqi, as the server counts them."
```

---

### Task 7: Retire the calendar-day helpers

**Files:**
- Modify: `apps/master/src/main/server/lib/time.ts` (delete lines 17-122's calendar helpers and their
  Intl formatters; keep `ISO_DAY`, `ISO_MONTH`, `MS_PER_DAY`)
- Modify: `apps/master/scripts/smoke-prd13-boundary.ts`, `smoke-prd13-monthly-outstanding.ts`,
  `smoke-prd13-monthly-perf.ts`, `smoke-cashflow-reversal.ts`, `smoke-prd13-parity.ts`,
  `smoke-prd13-telegram.ts`, `smoke-telegram-files.ts`

**Interfaces:**
- Consumes: Tasks 3-4 (no caller left in `src` or `e2e`).
- Produces: `time.ts` exporting only the trading-day API; the compiler refuses any new caller of the
  old names.

- [ ] **Step 1: Delete the old helpers**

Delete `localDayKey`, `localClockMinutes`, `parseLocalDay`, `localDayRangeFor`,
`localMonthRangeFor`, `isSameLocalDay`, `localToday`, `localDayRange`, `dayKeyFormatter`,
`clockFormatter`, `TASHKENT_TZ` and `TASHKENT_OFFSET` (the string) from `time.ts`, and rewrite the
header comment Task 1 wrote so it describes only the trading-day API and names no retired helper
(the gate below matches comments too).

- [ ] **Step 2: Port the scripts**

`scripts/` is not typechecked (`tsc -b` lists no file under it), so grep instead. Apply Task 3's
mapping in the six import-only scripts. In `smoke-prd13-boundary.ts`, move the two synthetic bills
to the new boundary and rewrite the header comment and messages to match:

- 04:30 Tashkent on `nextDay` (`${testDay}T23:30:00.000Z`) → must be in `testDay`;
- 05:30 Tashkent on `nextDay` (`${nextDay}T00:30:00.000Z`) → must be in `nextDay`;
- the key checks use `tradingDayOf`, the legacy-daily checks `tradingDayStart`.

Do not run any script: several write to whatever `DATABASE_URL` names, and
`smoke-cashflow-reversal.ts` deletes every row of five tables (CLAUDE.md). The rename there is the
import line and `localDayKey(today)` only.

- [ ] **Step 3: Verify**

The first command is the **retired-helper gate**. `apps/master/e2e` and `apps/master/scripts` are
outside every tsconfig, so a call to a deleted helper there fails only at run time; this grep is
the check. It is published as one command so later packages paste it unchanged (it runs in the
package's own container from `/app`), and it must print nothing:

```bash
docker exec -w /app CONTAINER grep -rnE 'localDayKey|localClockMinutes|parseLocalDay|localDayRange|localMonthRangeFor|isSameLocalDay|localToday' apps/master/src apps/master/e2e apps/master/scripts
```

```bash
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
```

Expected: the gate prints nothing; `47`; `Tests  197 passed (197)`; `Tests  37 failed | 83 passed (120)`.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/main/server/lib/time.ts apps/master/scripts
git commit -m "refactor(time): remove the calendar-day helpers" -m "Every day range goes through the trading-day API; the compiler now refuses the old names. The boundary smoke checks 04:30 and 05:30."
```

---

### Task 8: Documents and handover

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md` §5 (`:271-274`), §9 Telegram and Scheduler paragraphs
  (`:448-465`), §10 table (`:483-500`), §13 test counts (`:665-672`), the header's "Updated" line
  (`:4-5`)
- Modify: `docs/superpowers/specs/2026-09-30-money-rules-design.md` §5 last line (`:181`), §7 item 4
  (`:229`)
- Modify: this plan (append "Deviations during execution" if any)

- [ ] **Step 1: CURRENT_WORKFLOW.md**

- §5, opening paragraph: the windows are **trading days**, `[05:00, 05:00)` Tashkent, from
  `lib/time.ts` (`tradingDayRange`, `tradingMonthRange`); a bill closed at 02:30 is the evening
  before's; receipts and stored timestamps keep the real time; past data regrouped by computation
  on this change, nothing migrated. Name the API table from this plan's Design in three lines.
- §9 Telegram: commands and buttons count trading days; `/yordam` says so.
- §9 Scheduler: the daily report goes out at 23:30 on the trading day, for that trading day, with
  no catch-up between 00:00 and 05:00; the monthly send time is read on the trading clock
  (`tradingMinutes`) on trading day 1. Bills closed after 23:30 still miss that night's report
  (P5, D21, replaces the daily trigger).
- §9 Printing (or a new line under it): the bill and the PDF read the Tashkent wall clock through
  UTC getters (`lib/format.ts`), so a till with the wrong Windows time zone still prints the right
  date (issue 34).
- §10: add a row — "A bill from 02:00 is missing from today's report" → expected: it belongs to the
  trading day before (`lib/time.ts`, D11).
- §13: `pnpm test` 197 tests in 17 files; the e2e suite 120 tests, 37 of them failing on purpose.
- Header: "Updated 2026-10-02 for the trading day (money rules D11): §5, §9, §10, §13."

- [ ] **Step 2: Money rules**

- §5 last line becomes: "No test built a day across midnight. `16-trading-day.test.ts` pins the
  05:00 boundary through every report, the waiter's day, the receipt and the monthly report's
  trading clock (D11, built 2026-10-02)."
- §7 item 4: append " — built on `feat/money-rules` (P2)."

- [ ] **Step 3: Final verification**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/mobile CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  37 failed | 83 passed (120)`; `Test Files  17 passed (17)`,
`Tests  197 passed (197)`; `47`; `0`; `0`; the mobile baseline. The 37 failures are the baseline's
38 less `[issue 34]`; name them in the handover.

Run the retired-helper gate (Task 7 Step 3) once more; it must print nothing.

- [ ] **Step 4: Commit**

```bash
git add docs/CURRENT_WORKFLOW.md docs/superpowers/specs/2026-09-30-money-rules-design.md docs/superpowers/plans/2026-10-02-money-trading-day.md
git commit -m "docs: the trading day ends at 05:00, built"
```

Stop at "ready to merge". Report the branch, the final counts and the merge notes below. The
handover carries this line verbatim, with the gate command under it:

> P3, P4, P5 and P6 run the retired-helper gate in their final verify step; it must print nothing.
>
> `docker exec -w /app CONTAINER grep -rnE 'localDayKey|localClockMinutes|parseLocalDay|localDayRange|localMonthRangeFor|isSameLocalDay|localToday' apps/master/src apps/master/e2e apps/master/scripts`

---

## Merge notes for the wave

- **W1 merge order: P7, then P1, then P2 last.** P2 is the rename package, so it lands on top of
  both. Before merging P2:
  1. Rebase this branch onto the W1 branch that already holds P7 and P1.
  2. Re-run Task 3 Step 3's mapping grep over `src` and `e2e`, and apply Task 3's table to every
     new hit P1 or P7 added.
  3. Rename P1's `env.svc.time.localDayKey()` in `e2e/04-stock-cost.test.ts` (the `[D27]` cleanup
     test, `guards-2.md:1353`) to `env.svc.time.tradingDayOf()`.
  4. Run the retired-helper gate (Task 7 Step 3) over `src`, `e2e` and `scripts`; it must print
     nothing. Then re-run Task 8 Step 3 and re-measure every count.
- **Same-wave files.** P1 and P7 also edit `services/order.service.ts` (this plan touches only the
  import at :12 and `list()` at :166, :172), `services/reports.service.ts` and
  `controllers/me.controller.ts` (D27's cancelled-order count sits next to lines this plan changes:
  `reports.service.ts:442-447,545-548,1099-1103`, `me.controller.ts:46-52`; P7's
  `buildOrdersTable` at `reports.service.ts:114-135`), `controllers/orders.controller.ts`,
  `services/telegram-bot.service.ts` (`/omborxona`, money format), `e2e/02-payments`,
  `e2e/04-stock-cost`, `e2e/07-day`, `e2e/08-staff-access` (one-line renames here) and
  `docs/CURRENT_WORKFLOW.md`. Resolve by keeping both: their logic, this plan's helper names. W1
  packages edit `CURRENT_WORKFLOW.md` sections without renumbering §11; if the merged document
  needs renumbering, do it once, in this package's Task 8.
- **Later packages.** P3, P4, P5 and P6 run the retired-helper gate in their final verify step.
  They use `formatDayKeyUZ` (Task 2) for a day key on paper and `shiftTradingDay` (Task 1) for day
  arithmetic, rather than new copies.
- **Counts after merge** are the sum of the packages' changes; re-measure, don't add.
