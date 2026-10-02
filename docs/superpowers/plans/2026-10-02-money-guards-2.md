# Money guards 2 (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Package:** P1 guards-2, wave 1 of `feat/money-rules` (built in parallel with P2 trading-day and P7
discount-qaytim, then merged). **Base:** `feat/money-rules` at `cafd82e` = `fix/server-money-guards`
(slice 1, PRD 14) plus the 2026-10-02 decision docs.

**Spec:** `docs/superpowers/specs/2026-09-30-money-rules-design.md` §4 (17, 24, 35, 36, 37) and
§2 D26, D27; `docs/prd/14-server-money-guards.md` §2 (line-edit race) and §10 "For slice 2";
the slice 1 plan's "Deferred review findings" (`docs/superpowers/plans/2026-09-30-server-money-guards.md`).
D8 and the line-audit shape come from `docs/superpowers/specs/2026-08-14-money-model-design.md` §5.

---

## Design

### Goal

Close what slice 1 left open around a bill: a dish can no longer land on a bill that has closed,
a confirm charges exactly the lines it closes, a Sanoq is never undone by a later cancel, the
cleanup's automatic cancels stop inflating "cancelled", and the small follow-ups the slice 1
reviews deferred are done.

### Decisions covered

| Item | Source | What changes |
|---|---|---|
| Confirm totals from a re-read after the claim | PRD 14 §10 | `computeTotals` and the payment check run again inside the transaction, on the order re-read after `closeIfSent`. `computeTotals` takes `tx` until the rebase onto P7, which removes the need (see Assumes). |
| Line edits check status inside their transaction | PRD 14 §2, §10 | `addLine`, `addCombo`, `updateLineQuantity`, `cancelLine` first write a conditional "hold" on the order (`DRAFT`/`SENT` only). `cancelLine` cancels conditionally; `updateLineQuantity` takes its delta from a re-read. |
| D26 | money rules §2 | A line's portions that the item's latest Sanoq already counted are not returned on cancel or decrease — by hand or by the 12-hour cleanup. |
| D27 | money rules §2 | Cleanup cancels are left out of the waiter's `ordersCanceled`, the day report and Buyurtmalar "Bekor qilingan". Amallar tarixi keeps them. |
| §4 (35) | money rules §4 | A repeat add after a price change is a new line at the new price. |
| §4 (24), D8 | money rules §4, money model §5 | Line changes on a SENT order write an audit row: who, which dish, quantity before/after, so'm change. |
| §4 (17) | money rules §4 | Both waiter apps show the charged total (and its discount) once a bill closes. |
| §4 (36) | money rules §4 | `GET /api/menu/combos` carries each set's price; the admin picker shows it. |
| §4 (37) | money rules §4 | `/omborxona` splits into several Telegram messages, each under 4 096 characters. |
| Deferred findings | slice 1 plan | `orderRepo.setStatus` deleted; the losing confirm answers in Uzbek and the ticket leaves the bill; "no printer chosen" has its own code (`PRINTER_NOT_CONFIGURED`) and the ticket matches it instead of the English text; the mobile client treats a wrong PIN as a wrong PIN; Menyu price and Chiqimlar amount pre-check whole so'm; Qarzlar refetches after a failed repayment; "12 hours" in one constant; `stopScheduler` not interrupting a cleanup in progress recorded as accepted; tests for two simultaneous full repayments, `requireAuth`'s `.catch` and three more `sqlite-url` inputs; CLAUDE.md's stale "Work in flight" block rewritten. |

Not in scope: the PIN reset-on-success weakness (open question, PRD 14 §10); `waiveServiceCharge`
(38) and the discount preset path (P7); `editLineNote` and `transfer` (no money moves).

### What the operator sees (exact Uzbek strings)

**Tasdiqlash (admin).**
- Two stations confirm the same bill: the loser no longer sees "Cannot transition from CLOSED to
  CLOSED". It sees an info toast **"Bu hisob allaqachon yopilgan"** (bottom-centre, as every toast of
  the confirm loop), the bill leaves the ticket, and the queue refetches. It is never shown as
  "Buyurtma tasdiqlandi" on the losing station.
- A waiter added a dish after the admin opened the ticket: Tasdiqlash fails with
  **"To'lovlar 8 000 so'm, hisob esa 16 000 so'm. Hisob o'zgargan bo'lishi mumkin — qayta tekshiring."**
  The ticket reloads the bill so the new line and total are visible; nothing is charged.
- A cancel that loses to a confirm: **"Bu hisob allaqachon yopilgan"**. A bill already cancelled:
  **"Bu buyurtma bekor qilingan"**. Fallback: **"Buyurtma holati o'zgargan — ro'yxatni yangilang"**
  (the string `OrderPanel.tsx:27` already uses).

**Waiter apps and the admin's line edits.**
- Adding, changing or removing a line on a bill that has just closed: **"Bu hisob allaqachon yopilgan"** (409).
- Removing a line someone removed a moment earlier: **"Bu qator allaqachon olib tashlangan"** (409).
- Mobile, closed bill: the summary reads `Ovqat 90 000 so'm`, `Chegirma -10 000 so'm`,
  `✨ Xizmat haqi 15 000 so'm`, `Jami 95 000 so'm` — the charged figures, not the sum of the lines.
- Order app, closed bill: "Jami" shows `95 000 so'm`, and under it `Chegirma: -10 000 so'm` when a
  discount was given. Its table tiles show the same charged total.
- Mobile login: a wrong PIN shows **"Noto'g'ri PIN"** again instead of flipping the connection pill
  to "SESSİYA TUGADI"; an overlapping attempt shows the server's
  **"Oldingi urinish hali tugamadi, biroz kuting"**.

**Amallar tarixi.** Three new actions, in the "Buyurtma" filter group:
**"Hisobga taom qo'shildi"**, **"Hisobda miqdor o'zgardi"**, **"Hisobdan taom olib tashlandi"**.
Each row's Tafsilot carries `summary`, e.g. `Osh: 1 → 2 ta, +45 000 so'm` or
`Xizmat haqi: 3 → 0 ta, -15 000 so'm`, plus `itemName`, `quantityBefore`, `quantityAfter`,
`unitPrice`, `amountChange`. Written only while the bill is SENT; a waiter composing a DRAFT writes none.
Cleanup cancels still appear here as "Buyurtma bekor qilindi" with `automatic: true`.

**Buyurtmalar, Hisobot, waiter stats.** "Bekor qilingan" counts and lists only orders a person
cancelled.

**Menyu, admin picker.** "Kombolar" rows show each set's price (sum of its dishes at today's prices),
where they showed 0 before. Menyu's set list shows the same figure.

**Menyu and Chiqimlar forms.** A typed price or amount is checked before it is sent:
- `""` → **"Summani kiriting"**
- `"abc"` → **"Summa raqam bo'lishi kerak"**
- `"4999.5"` or `"4999,5"` → **"Summa butun so'mda bo'lishi kerak"**
- `"-5000"` → **"Summa manfiy bo'lishi mumkin emas"**
- `"0"` where zero is not allowed (Chiqim) → **"Summa 0 dan katta bo'lishi kerak"**
- `"45 000"` is accepted as 45 000 (spaces and NBSP are stripped).

**Qarzlar.** A failed repayment refetches the list and the panel, so the balance shown is the real one.

**Telegram `/omborxona`.** When the list is longer than one message, it arrives in parts headed
`📦 <b>Omborxona qoldig'i</b> — 1/3`, `— 2/3`, `— 3/3`; the keyboard rides on the last part.
Tan narx in it groups with spaces (`formatUZS`), not `ru-RU`.

### How D26 reads, precisely

Each `OrderLine` gains `countedQty` — "portions of this line that the item's latest Sanoq already
counted out of stock". A Sanoq (`stockService.setCount`) sets `countedQty = quantity` on every live
line of that item on a DRAFT or SENT order. A restore (cancel, decrease, order cancel, cleanup)
returns to stock only the portions above `countedQty`, newest first:

```
removed        = min(portions, quantity)
toStock        = min(removed, quantity − countedQty)
countedQtyAfter = min(countedQty, quantity − removed)     (only a decrease keeps the line)
```

A line added wholly before the latest Sanoq restores nothing (D26 as written). Portions added to
it after the Sanoq (a merge or a `+`) did come out of the counted stock, so they still return.
Worked example (Task 9's test): draft holds 5 somsa, stock 95; Sanoq says 90 (countedQty 5); `+2`
→ quantity 7, stock 88; decrease to 4 → 2 return, stock 90, countedQty 4; cancel → nothing
returns, stock 90. Today's code ends at 95.

Food cost (`cogsSnapshot`) is unchanged: it still shrinks proportionally on a decrease whether or
not portions return (D5 — a shortfall has no money effect).

### How D27 is recognised

By the cancel reason, not a new column: every cleanup reason starts with
`AUTO_CANCEL_REASON_PREFIX = 'Avtomatik bekor qilindi'` (it is `STALE_DRAFT_REASON` today and was in
every build since slice 1). Queries add `NOT_AUTO_CANCELED`:
`{ OR: [{ cancelReason: null }, { NOT: { cancelReason: { startsWith: prefix } } }] }`.
The explicit `cancelReason: null` branch matters: in SQL `NOT (NULL LIKE 'x%')` is NULL, and the
row would silently drop. A column was rejected because P7 may rebuild the `Order` table in the same
wave, and a rebuild generated without the column would delete it.

### Server, schema and API changes

- **Schema (two migrations, both additive):**
  - `AuditAction` += `ORDER_LINE_ADDED`, `ORDER_LINE_CHANGED`, `ORDER_LINE_REMOVED` —
    `20261002120000_order_line_audit_actions`, comment-only (SQLite stores the enum as TEXT), like
    `20260518105500_add_delete_audit_actions`.
  - `OrderLine.countedQty Int @default(0)` — `20261002130000_order_line_counted_qty`, an
    `ALTER TABLE ADD COLUMN` plus a one-time backfill: live lines on open orders created before their
    item's latest `StockEntry(COUNT)` get `countedQty = quantity`.
  - Keep both names exactly. P7's pinned migrations (`20261002140000_order_discount_reason`,
    `20261002150000_drop_discount_presets`) sort after them, so a till applies P1's two first. Neither
    package touches the other's table: P1 writes only `OrderLine` (its backfill reads `Order` and
    `StockEntry`, writes neither); P7 writes only `Order` (an added column, then a rebuild) and drops
    `Discount`. P7's `Order` rebuild therefore needs nothing from P1, and P1 adds no `Order` column.
- **API:** `GET /api/menu/combos` rows gain `price: number`. Error bodies: `ILLEGAL_STATE` keeps its
  code and gains Uzbek messages and `details.status`; `PAYMENT_MISMATCH` gains an Uzbek message and
  `details: { paid, due }`; new `LINE_NOT_LIVE` (409); new `PRINTER_NOT_CONFIGURED` (409, from
  `printBill` and `reprintBill`, which answered `PRINT_FAILED` 500 with English text before). The
  confirm result gains `printErrorCode: string | null` beside `printError`. Nothing else changes shape.
- **New pure modules (unit-tested):** `server/lib/stale-draft.ts`, `server/lib/combo-price.ts`,
  `server/lib/line-audit.ts`, `server/lib/stock-restore.ts`, `server/lib/telegram-chunks.ts`,
  `renderer/lib/som-input.ts`, `confirmErrorOutcome` in `renderer/lib/confirm-result.ts`,
  `apps/order/src/renderer/lib/bill-summary.ts`, `apps/mobile/src/lib/bill-summary.ts`,
  `apps/mobile/src/api/session-loss.ts`.

### What deliberately stays

- The ledger core: `reports.service.ts` `dailyLedger`, the billing math, `cashOut`. D27 changes
  which CANCELED rows feed `canceledCount` and `incidents.cancellations` (no money), nothing else.
- `stockService.restore`'s proportional `cogsSnapshot` formula; Sanoq stays an absolute set.
- `send` (checks inside its own transaction already), `editLineNote`, `transfer` — no claim added.
- The confirm's fast-path checks before the transaction stay: they answer a plainly wrong request
  without taking the write lock. The transaction re-decides.
- The waiter's own order list (`listByWaiter`) still shows their auto-cancelled drafts.
- `billingService`'s preset/`max_discount_amount` path: P7's (D3). This package only threads `tx`,
  and drops it again on the rebase onto P7.
- The PIN reset-on-success weakness: open (PRD 14 §10).
- `stopScheduler` clears the intervals but does not interrupt a `runDraftCleanup` already in its
  loop. Accepted: each `cancelStaleDraft` is its own transaction, so a cancel either lands whole or
  not at all, and a draft the shutdown cut off stays a draft for the next run.

### Assumes (the other wave 1 packages)

Wave 1 merges in this order: **P7 discount-qaytim, then P1 (this package), then P2 trading-day.**

- **P7 merges first in W1.** P7's `billing.service.ts` takes no repository and no setting, and
  `computeTotals(order, { discountAmount })` needs no `tx`. On rebase, take P7's
  `billing.service.ts` whole, drop the `tx` argument Task 4 added (Task 4 Step 3), and call
  `computeTotals(current, { discountAmount: input.discountAmount })` inside the transaction. Task 4's
  `discountRepo.findById(…, tx)` exists only until that rebase. The rebase also takes P7's confirm
  input (`discountReason` in; `discountId` and `waiveServiceCharge` out), `setApproval(id,
  approverId, tx)` and P7's audit keys; this package keeps the transaction's structure (Task 4
  Step 4, and the "At the rebase onto P7" note after Task 4's commit).
- **P2 merges after P1 and deletes the calendar helpers** (`localDayKey`, `localDayRangeFor`,
  `parseLocalDay` and the rest). Until then this package calls `env.svc.time.localDayKey()` in the
  `[D27]` e2e test (Task 10). If P2 is already on `feat/money-rules` when this branch rebases, use
  `env.svc.time.tradingDayOf()` there instead; otherwise P2's rebase renames it (P2's T3/T7 greps).
  Task 16 Step 5 lists the call sites for that handover.

### Recorded defaults

Settled by the decisions or the spec's wording, not open questions:

- **D26, a line that grows after the Sanoq.** Only the portions the Sanoq counted never return;
  portions added afterwards (a merge or a `+`) came out of the counted stock and do return. This is
  D26 as written ("How D26 reads, precisely").
- **The losing confirm.** An info toast "Bu hisob allaqachon yopilgan", the bill leaves the ticket
  and the queue refetches (Task 3).
- **A bill that changed under the ticket.** `PAYMENT_MISMATCH` names both sums; the ticket stays on
  the bill and reloads it; nothing is charged (Tasks 3, 4).
- **Line audit on SENT orders only.** §4 item 24 says "on a sent order"; a waiter composing a DRAFT
  writes no rows (Task 8).
- **A repeat add of a dish that sits in a set** is its own line; it never merges into the set's
  component line (Task 6).
- **D27 is recognised by the cancel reason's prefix**, not a new column ("How D27 is recognised").

---

## Global constraints

- **Where:** worktree `/Users/uzmacbook/dev/lab/project02-money`, on this package's branch off
  `feat/money-rules`. Never commit to `main`, `feat/auto-update` or `feat/money-rules` directly;
  never push, merge, tag or deploy. Never read or write `../project02`, `../project02-guards`,
  `../project02-demo` or `../project02-finance-e2e`.
- **Where things run:** only in the Docker container named at build time, written `CONTAINER`
  below. Never on the host, never Electron. The gate, verbatim:

  ```bash
  docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
  docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
  docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
  docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
  docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
  ```

  One e2e file: append its path, e.g. `... vitest.e2e.config.ts e2e/02-payments.test.ts`.
- **Floors (Task 1 confirms):** e2e `Tests 38 failed | 68 passed (106)`; `pnpm test`
  `Test Files 14 passed (14)`, `Tests 142 passed (142)`; `pnpm typecheck` 47; renderer 0; gallery 0.
  No task may raise a typecheck count; no e2e test that passed before a task may fail after it.
  The 38 failing e2e tests belong to later packages except the four this package flips:
  `[issue 17]`, `[issue 24]`, `[issue 35]`, `[issue 37]`.
- **Test-first:** every task writes its failing test(s), runs them red, then implements. A test that
  pins already-built behaviour (Task 15's repayment race) is labelled as such and passes on arrival.
- **Determinism for races:** e2e race tests force the interleaving with `vi.spyOn` on the in-process
  repositories/services (the 08 PIN test does the same), never with timing loops. A hook only ever
  waits **outside** a transaction: with one SQLite connection (PRD 14 G7) a wait inside one
  deadlocks until `maxWait`. So the calls the hooks rely on stay outside the transaction:
  `menuRepo.findItemById(input.menuItemId)` in `addLine`, the fast-path
  `billingService.computeTotals(order, opts)` in `confirm`, and `getOrderOrThrow(input.orderId)` at
  the top of `cancelLine`.
- **Code rules** (`docs/agent-plans/00-shared/conventions.md`): TypeScript strict,
  `noUncheckedIndexedAccess`, no `any` outside test files; 2-space indent, single quotes,
  semicolons, trailing commas; Prisma only in `repositories/` (existing exceptions in
  `stock.service.ts`, `reports.service.ts` and `me.controller.ts` are edited in place, not moved);
  throw `Errors.*`; every user-facing string in Uzbek (Latin). Server money text uses `formatUZS`
  (`server/lib/format.ts`, ASCII space); renderer uses `formatMoney` (NBSP); mobile `formatUZS`
  (`mobile/src/lib/format.ts`). Never `Intl` with `uz-UZ` raw. Waiter payloads gain no tan narx or
  food cost.
- **Renderer:** compose Blocks C1 (`components/blocks`, `components/layout`); targets 48/56/66 px,
  type floors 12/13/17 px, no hover-only route; the panel can be 1236 × 623. No nav slot is added.
- **Migrations:** SQLite. A migration that rebuilds a table must recreate every index it had. Read
  the generated SQL before applying it.
- **Commits:** conventional, plain, authored as Barkamol. No AI attribution, no `Co-Authored-By`.
  Never commit `apps/master/e2e/.data/`. Never `--no-verify`.
- **Documents:** do not edit `STATE.md` (the merge step owns it). Task 16 edits the rest.

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/master/src/main/server/lib/stale-draft.ts` (+ `.test.ts`) | Create | `STALE_DRAFT_HOURS`, `STALE_DRAFT_REASON`, `AUTO_CANCEL_REASON_PREFIX`, `staleDraftCutoff`, `isAutoCanceled`, `NOT_AUTO_CANCELED` |
| `apps/master/src/main/server/lib/scheduler.ts:10` | Modify | Cutoff from `staleDraftCutoff` |
| `apps/master/src/main/server/lib/errors.ts:22-23, 41-42` (+ `errors.test.ts`) | Modify / create | `OrderNotOpen`, `LineNotLive`, Uzbek `PaymentMismatch`, `PrinterNotConfigured` |
| `apps/master/src/main/server/services/print.service.ts:130-133, 166-169` | Modify | No printer chosen throws `PrinterNotConfigured` |
| `apps/master/src/main/server/repositories/order.repo.ts:6-8, 112-118, 144-193` | Modify | Delete `setStatus`/`statusFilter`; `holdIfOpen`; D27 filter on CANCELED lists |
| `apps/master/src/main/server/repositories/orderLine.repo.ts:36-45` | Modify | `cancelIfLive`, `settleOpenLinesForCount` |
| `apps/master/src/main/server/services/billing.service.ts:55-69, 91` | Modify | `computeTotals(order, opts, tx?)` until the rebase onto P7, then P7's file whole |
| `apps/master/src/main/server/services/order.service.ts` | Modify | Hold in line edits, in-tx confirm totals, merge rule, line audit, Uzbek errors, `printErrorCode` |
| `apps/master/src/main/server/services/stock.service.ts:106-137, 231-289` | Modify | D26 restore split; Sanoq settles open lines |
| `apps/master/src/main/server/lib/stock-restore.ts` (+ `.test.ts`) | Create | `restoreSplit` |
| `apps/master/src/main/server/lib/line-audit.ts` (+ `.test.ts`) | Create | `lineChangeAudit` |
| `apps/master/src/main/server/lib/combo-price.ts` (+ `.test.ts`) | Create | `comboPrice` |
| `apps/master/src/main/server/services/menu.service.ts:46-68` | Modify | Combo rows carry `price` |
| `apps/master/src/main/server/lib/telegram-chunks.ts` (+ `.test.ts`) | Create | `chunkTelegramLines` |
| `apps/master/src/main/server/services/telegram-bot.service.ts:243-253, 969-984` | Modify | `/omborxona` in parts |
| `apps/master/src/main/server/controllers/me.controller.ts:46-52` | Modify | D27 |
| `apps/master/src/main/server/services/reports.service.ts:280-284, 441-444, 1099-1103` | Modify | D27 |
| `apps/master/src/main/server/middleware/requireAuth.test.ts` | Create | The session-touch `.catch` |
| `apps/master/src/main/server/lib/sqlite-url.test.ts` | Modify | Empty string, trailing `?`, `%20` path |
| `apps/master/prisma/schema.prisma:80-126, 350-380` | Modify | Enum values; `OrderLine.countedQty` |
| `apps/master/prisma/migrations/20261002120000_order_line_audit_actions/` | Create | Comment-only |
| `apps/master/prisma/migrations/20261002130000_order_line_counted_qty/` | Create | Column + backfill |
| `apps/master/src/renderer/lib/confirm-result.ts` (+ test) | Modify | `confirmErrorOutcome`; `printFailureNotice` matches `printErrorCode` |
| `apps/master/src/renderer/api/orders.ts:26-30`, `gallery/fixtures/orders.ts:284` | Modify | `ConfirmResult.printErrorCode` |
| `apps/master/src/renderer/pages/ApprovalQueuePage.tsx:61, 103-136` | Modify | Loser leaves the ticket; mismatch reloads; reprint failure passes its code |
| `apps/master/src/renderer/lib/audit-labels.ts` | Modify | Three labels, group, tones |
| `apps/master/src/renderer/api/menu.ts:37-43`, `components/orders/ItemPicker.tsx:152` | Modify | `Combo.price: number` |
| `apps/master/gallery/fixtures/menu.ts:80-115` | Modify | Set prices = sum of dishes |
| `apps/master/src/renderer/lib/som-input.ts` (+ test) | Create | `parseSom` |
| `apps/master/src/renderer/components/menu/ItemPanel.tsx:61-62, 98-100`, `NewItemPanel.tsx:48-49`, `components/expenses/ExpenseCreateDialog.tsx:50, 66-72` | Modify | Whole so'm pre-check |
| `apps/master/src/renderer/pages/DebtsPage.tsx:73` | Modify | Refetch after a failed repayment |
| `apps/master/vitest.config.ts:17` | Modify | Include the waiter apps' pure tests |
| `apps/order/src/renderer/lib/bill-summary.ts` (+ test), `api/orders.ts:6-41`, `pages/OrderDetailPage.tsx:147-150, 300-312`, `pages/HomePage.tsx:202-205` | Create / modify | Charged total |
| `apps/mobile/src/lib/bill-summary.ts` (+ test), `screens/OrderEditScreen.tsx:141-147, 311-330` | Create / modify | Charged total |
| `apps/mobile/src/api/session-loss.ts` (+ test), `api/client.ts:28-37`, `screens/LoginScreen.tsx:69-80` | Create / modify | Wrong PIN ≠ session loss |
| `apps/master/e2e/{01,02,04,06,08,11}-*.test.ts` | Modify | New and rewritten tests |
| `docs/CURRENT_WORKFLOW.md`, `docs/prd/14-server-money-guards.md`, `docs/superpowers/specs/2026-09-30-money-rules-design.md`, `CLAUDE.md` (Domain rules; "Work in flight") | Modify | Say what the code now does |

Counts after each task (e2e failed | passed (total); unit tests / files):

| After | e2e | unit |
|---|---|---|
| Task 1 | 38 \| 68 (106) | 142 / 14 |
| Task 2 | 38 \| 68 (106) | 144 / 15 |
| Task 3 | 38 \| 69 (107) | 151 / 16 |
| Task 4 | 38 \| 70 (108) | 151 / 16 |
| Task 5 | 38 \| 72 (110) | 151 / 16 |
| Task 6 | 37 \| 73 (110) | 151 / 16 |
| Task 7 | 37 \| 74 (111) | 153 / 17 |
| Task 8 | 36 \| 76 (112) | 156 / 18 |
| Task 9 | 36 \| 79 (115) | 161 / 19 |
| Task 10 | 36 \| 80 (116) | 163 / 19 |
| Task 11 | 35 \| 81 (116) | 169 / 21 |
| Task 12 | 34 \| 82 (116) | 172 / 22 |
| Task 13 | 34 \| 82 (116) | 175 / 23 |
| Task 14 | 34 \| 82 (116) | 181 / 24 |
| Task 15 | 34 \| 83 (117) | 186 / 25 |

If Task 1's baseline differs, shift every row by the same difference and say so in the handover.

---

### Task 1: Baseline

**Files:** none.

**Interfaces:** Produces the floors every later task compares against.

- [ ] **Step 1: Confirm the branch and the base**

```bash
cd /Users/uzmacbook/dev/lab/project02-money
git log --oneline -1 feat/money-rules
git status --short
```

Expected: `feat/money-rules` at `cafd82e` (or a later docs-only commit); the working tree clean
except this plan.

- [ ] **Step 2: Record the gate**

Run the five gate commands (Global constraints). Expected: `Tests  38 failed | 68 passed (106)`;
`Test Files  14 passed (14)`, `Tests  142 passed (142)`; `47`; `0`; `0`.

- [ ] **Step 3: Note the four tests this package flips**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/01-bill.test.ts e2e/08-staff-access.test.ts e2e/11-extras.test.ts -t "issue 17|issue 24|issue 35|issue 37" 2>&1 | grep -E '✓|×|FAIL'
```

Expected: all four fail. No commit.

---

### Task 2: One "12 hours" constant; delete `orderRepo.setStatus`

**Files:**
- Create: `apps/master/src/main/server/lib/stale-draft.ts`, `apps/master/src/main/server/lib/stale-draft.test.ts`
- Modify: `apps/master/src/main/server/lib/scheduler.ts:1-10`, `apps/master/src/main/server/services/order.service.ts:29`
- Modify: `apps/master/src/main/server/repositories/order.repo.ts:6-8, 162-193` (delete)

**Interfaces:**
- Produces: `STALE_DRAFT_HOURS = 12`, `AUTO_CANCEL_REASON_PREFIX = 'Avtomatik bekor qilindi'`,
  `STALE_DRAFT_REASON`, `staleDraftCutoff(now: Date): Date`. Task 10 adds `isAutoCanceled` and
  `NOT_AUTO_CANCELED` to the same file.

`grep -rn "setStatus" apps/master/src/main` finds only the definition (`order.repo.ts:162`); the
renderer hits are an unrelated store. With no caller, the method and its `statusFilter` helper
(`order.repo.ts:6-8`) go entirely, so every transition claims by construction.

`stopScheduler` (`scheduler.ts:53-62`, called by `shutdown.ts:146-147`) clears the intervals but
does not interrupt a `runDraftCleanup` already in its loop. This is accepted, not fixed: each
`cancelStaleDraft` is one transaction, so a cancel lands whole or not at all, and a draft whose
cancel fails after `$disconnect` is logged and stays a draft for the next run. No stop flag is added;
Task 16 records it in `CURRENT_WORKFLOW.md` §9.

- [ ] **Step 1: Write the failing unit test**

`apps/master/src/main/server/lib/stale-draft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STALE_DRAFT_REASON, staleDraftCutoff } from './stale-draft';

describe('stale drafts', () => {
  it('names the 12 hours in the reason the cleanup writes', () => {
    expect(STALE_DRAFT_REASON).toBe('Avtomatik bekor qilindi: 12 soat yuborilmadi');
  });

  it('cuts off drafts created more than 12 hours before now', () => {
    expect(staleDraftCutoff(new Date('2026-10-02T12:00:00.000Z')).toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run it red** — `docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/stale-draft.test.ts` → fails, module not found.

- [ ] **Step 3: Implement**

`apps/master/src/main/server/lib/stale-draft.ts`:

```ts
/** A draft left unsent this long is cancelled by the scheduler (PRD 14 G4). */
export const STALE_DRAFT_HOURS = 12;

/** Every reason the scheduler writes starts with this (money rules D27 reads it). */
export const AUTO_CANCEL_REASON_PREFIX = 'Avtomatik bekor qilindi';

export const STALE_DRAFT_REASON = `${AUTO_CANCEL_REASON_PREFIX}: ${STALE_DRAFT_HOURS} soat yuborilmadi`;

export function staleDraftCutoff(now: Date): Date {
  return new Date(now.getTime() - STALE_DRAFT_HOURS * 60 * 60 * 1000);
}
```

- `order.service.ts:29`: replace the literal with `import { STALE_DRAFT_REASON } from '../lib/stale-draft';`
  and `export { STALE_DRAFT_REASON };` so nothing importing it from the service breaks.
- `scheduler.ts:10`: `const cutoff = staleDraftCutoff(new Date());` with the import.
- `order.repo.ts`: delete `statusFilter` (`:6-8`) and `setStatus` (`:162-193`).

- [ ] **Step 4: Verify** — the gate. Expected: e2e `38 failed | 68 passed (106)` (the `[issue 7]`
test still asserts the same reason string); unit `144` in `15` files; `47`; `0`; `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/lib/stale-draft.ts apps/master/src/main/server/lib/stale-draft.test.ts apps/master/src/main/server/lib/scheduler.ts apps/master/src/main/server/services/order.service.ts apps/master/src/main/server/repositories/order.repo.ts
git commit -m "refactor(orders): one constant for the 12-hour draft cleanup" -m "The hours were written twice, in the scheduler and in the cancel reason. orderRepo.setStatus had no caller and kept an unconditional branch; it is gone, so every status change claims."
```

---

### Task 3: Uzbek order-state errors; the losing confirm leaves the ticket

**Files:**
- Modify: `apps/master/src/main/server/lib/errors.ts:22-23, 41-42`; create `apps/master/src/main/server/lib/errors.test.ts`
- Modify: `apps/master/src/main/server/services/order.service.ts:251, 328, 392, 469, 646, 757, 785, 796`
- Modify: `apps/master/src/main/server/services/order.service.ts:879-891` (`printErrorCode`)
- Modify: `apps/master/src/main/server/services/print.service.ts:130-133, 166-169`
- Modify: `apps/master/src/renderer/lib/confirm-result.ts`, `apps/master/src/renderer/lib/confirm-result.test.ts`
- Modify: `apps/master/src/renderer/api/orders.ts:26-30`, `apps/master/gallery/fixtures/orders.ts:284`
- Modify: `apps/master/src/renderer/pages/ApprovalQueuePage.tsx:55-62, 103-136`
- Test: `apps/master/e2e/02-payments.test.ts` (new test after `[issue 26]`)

**Interfaces:**
- Produces: `Errors.OrderNotOpen(status: string)` → `AppError('ILLEGAL_STATE', 409, <Uzbek>, { status })`;
  `Errors.PaymentMismatch(paid: number, due: number)` → `AppError('PAYMENT_MISMATCH', 400, <Uzbek>, { paid, due })`;
  `Errors.PrinterNotConfigured()` → `AppError('PRINTER_NOT_CONFIGURED', 409, 'Chek printeri tanlanmagan')`;
  `ConfirmResult.printErrorCode: string | null`;
  `printFailureNotice(result: Pick<ConfirmResult, 'billPrinted' | 'printErrorCode'> & BillIdentity)`;
  `confirmErrorOutcome(error): { message: string; leaveTicket: boolean; reloadOrder: boolean }`.
  Tasks 4 and 5 throw these.

The code stays `ILLEGAL_STATE`, so `OrderPanel.tsx:27` and both waiter apps keep working unchanged.

Slice 1 left a second text match in the same file: `printFailureNotice` tells "no printer chosen"
apart by `printError?.includes('not configured')` (`confirm-result.ts:32`), the English message
`print.service.ts` throws as `PRINT_FAILED` 500. It gets its own code, and the notice matches the code.

- [ ] **Step 1: Write the failing e2e test** (in `describe('Payment legs', …)`, after `[issue 26]`)

```ts
  it('[PRD 14 review] the losing confirm of two answers in Uzbek that the bill is already closed', async () => {
    const id = await sentOrder([[w.items.somsa, 1]]); // 8 000
    const body = { payments: [{ method: 'CASH', amount: 8000 }] };
    const answers = await Promise.all([
      w.admin.call('POST', `/api/orders/${id}/confirm`, body),
      w.admin.call('POST', `/api/orders/${id}/confirm`, body),
    ]);
    const loser = answers.find((a) => a.status >= 300);
    expect({
      outcomes: answers.map((a) => (a.status < 300 ? 'ok' : a.status)).sort(),
      code: loser?.body?.error?.code,
      message: loser?.body?.error?.message,
      status: loser?.body?.error?.details?.status,
    }).toEqual({ outcomes: [409, 'ok'], code: 'ILLEGAL_STATE', message: 'Bu hisob allaqachon yopilgan', status: 'CLOSED' });
  });
```

- [ ] **Step 2: Write the failing unit tests**

`apps/master/src/main/server/lib/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Errors } from './errors';

describe('order errors', () => {
  it('a closed bill answers 409 in Uzbek and names its status', () => {
    const e = Errors.OrderNotOpen('CLOSED');
    expect({ code: e.code, http: e.httpStatus, message: e.message, details: e.details })
      .toEqual({ code: 'ILLEGAL_STATE', http: 409, message: 'Bu hisob allaqachon yopilgan', details: { status: 'CLOSED' } });
  });

  it('a cancelled order says so', () => {
    expect(Errors.OrderNotOpen('CANCELED').message).toBe('Bu buyurtma bekor qilingan');
  });

  it('a payment mismatch states both sums with spaces', () => {
    const e = Errors.PaymentMismatch(8000, 16000);
    expect({ code: e.code, http: e.httpStatus, message: e.message, details: e.details }).toEqual({
      code: 'PAYMENT_MISMATCH',
      http: 400,
      message: "To'lovlar 8 000 so'm, hisob esa 16 000 so'm. Hisob o'zgargan bo'lishi mumkin — qayta tekshiring.",
      details: { paid: 8000, due: 16000 },
    });
  });
});
```

Append to `apps/master/src/renderer/lib/confirm-result.test.ts`:

```ts
describe('confirmErrorOutcome', () => {
  it('a bill another station closed leaves the ticket and reloads the queue', () => {
    expect(confirmErrorOutcome({ code: 'ILLEGAL_STATE', message: 'Bu hisob allaqachon yopilgan' }))
      .toEqual({ message: 'Bu hisob allaqachon yopilgan', leaveTicket: true, reloadOrder: true });
  });
  it('a bill that changed stays on the ticket and reloads it', () => {
    expect(confirmErrorOutcome({ code: 'PAYMENT_MISMATCH', message: "To'lovlar 8 000 so'm, hisob esa 16 000 so'm." }))
      .toEqual({ message: "To'lovlar 8 000 so'm, hisob esa 16 000 so'm.", leaveTicket: false, reloadOrder: true });
  });
  it('any other error stays on the ticket as it is', () => {
    expect(confirmErrorOutcome({ code: 'VALIDATION', message: "Nasiya summasi 0 dan katta bo'lishi kerak" }))
      .toEqual({ message: "Nasiya summasi 0 dan katta bo'lishi kerak", leaveTicket: false, reloadOrder: false });
  });
});
```

In the same file's `describe('printFailureNotice', …)`, the existing tests pass a code instead of
English text: `printError: null` → `printErrorCode: null`; `printError: 'Command failed: receipt.exe'`
→ `printErrorCode: 'PRINT_FAILED'`; `printError: 'Admin printer not configured'` →
`printErrorCode: 'PRINTER_NOT_CONFIGURED'` (both places). Add one test:

```ts
  it('a failure with no code is a printer fault, not a missing printer', () => {
    const notice = printFailureNotice({ ...atTable, billPrinted: false, printErrorCode: null });
    expect({ fix: notice?.description.includes('Printerni tekshiring'), settings: notice?.description.includes('Sozlamalarda') })
      .toEqual({ fix: true, settings: false });
  });
```

- [ ] **Step 3: Run red** — the e2e test (`-t "losing confirm"`) reports the English message; the
unit files fail on missing exports, and `typecheck:renderer` flags `printErrorCode` as unknown.

- [ ] **Step 4: Implement the server side**

In `errors.ts` add `import { formatUZS } from './format';` and:

```ts
const ORDER_NOT_OPEN: Record<string, string> = {
  CLOSED: 'Bu hisob allaqachon yopilgan',
  CANCELED: 'Bu buyurtma bekor qilingan',
};
// in Errors:
  OrderNotOpen: (status: string) =>
    new AppError('ILLEGAL_STATE', 409, ORDER_NOT_OPEN[status] ?? "Buyurtma holati o'zgargan — ro'yxatni yangilang", { status }),
  PaymentMismatch: (paid: number, due: number) =>
    new AppError(
      'PAYMENT_MISMATCH',
      400,
      `To'lovlar ${formatUZS(paid)} so'm, hisob esa ${formatUZS(due)} so'm. Hisob o'zgargan bo'lishi mumkin — qayta tekshiring.`,
      { paid, due },
    ),
```

(The old `PaymentMismatch(msg)` has one caller, `order.service.ts:785`.) In `order.service.ts`
replace `Errors.IllegalStateTransition(…)` with `Errors.OrderNotOpen(<the status>)` at `:251`, `:328`,
`:392`, `:469` (`order.status`), `:646` and `:796` (`current?.status ?? order.status`), `:757`
(`order.status`); and `:785` with `Errors.PaymentMismatch(totalPaid, totalDue)`. `send`, `transfer`,
`editLineNote` and `reprintBill` keep `IllegalStateTransition`.

The printer: in `Errors` add
`PrinterNotConfigured: () => new AppError('PRINTER_NOT_CONFIGURED', 409, 'Chek printeri tanlanmagan'),`.
`print.service.ts` throws it in place of `Errors.PrintFailed('Admin printer not configured')` in
both `printBill` (`:132`) and `reprintBill` (`:168`). In `confirm`'s print step (`:879-891`) add
`let printErrorCode: string | null = null;`, set
`printErrorCode = error instanceof AppError ? error.code : null;` in the `catch` (import `AppError`
from `'../lib/errors'`), and return `{ ...mapToDto(closedOrder), billPrinted: printError === null, printError, printErrorCode }`.
A reprint without a printer now answers 409 instead of 500; the e2e reprint tests set a printer and
assert only `< 300`.

- [ ] **Step 5: Implement the renderer side**

`confirm-result.ts`:

```ts
export type ConfirmErrorOutcome = { message: string; leaveTicket: boolean; reloadOrder: boolean };

/**
 * What the ticket does with a failed Tasdiqlash. A bill another station closed
 * or cancelled is done: the ticket lets it go. A bill whose lines changed stays,
 * and is reloaded so the admin sees the new total before paying it.
 */
export function confirmErrorOutcome(error: { code?: string; message?: string }): ConfirmErrorOutcome {
  if (error.code === 'ILLEGAL_STATE') {
    return { message: error.message || "Buyurtma holati o'zgargan — ro'yxatni yangilang", leaveTicket: true, reloadOrder: true };
  }
  if (error.code === 'PAYMENT_MISMATCH') {
    return { message: error.message || "Hisob o'zgargan — qayta tekshiring", leaveTicket: false, reloadOrder: true };
  }
  return { message: error.message || "Tasdiqlab bo'lmadi", leaveTicket: false, reloadOrder: false };
}
```

`ApprovalQueuePage.tsx`: the mutation takes the bill it confirms, so an error is matched to it:

- `mutationFn: ({ id, body }: { id: string; body: ConfirmBody }) => ordersApi.confirm(id, body)`;
  `onConfirm={(body) => confirmMutation.mutate({ id: ticketOrder.id, body })}`.
- `onError: (err: Error & { code?: string }, { id }) => { const outcome = confirmErrorOutcome(err); if (outcome.reloadOrder) queryClient.invalidateQueries({ queryKey: ['orders'] }); if (outcome.leaveTicket) { setSelectedId((current) => (current === id ? null : current)); toast.info(outcome.message, { position: TOAST_POSITION }); return; } toast.error(outcome.message, { position: TOAST_POSITION }); }`
- `error={confirmMutation.variables?.id === ticketOrder.id ? confirmMutation.error?.message ?? null : null}`
  so a stale error never shows on the next bill.

The printer notice matches the code, not the text:

- `api/orders.ts` `ConfirmResult`: add `printErrorCode: string | null;` after `printError`.
- `confirm-result.ts` `printFailureNotice`: the parameter becomes
  `Pick<ConfirmResult, 'billPrinted' | 'printErrorCode'> & BillIdentity`, and the test becomes
  `if (result.printErrorCode === 'PRINTER_NOT_CONFIGURED')`. The two descriptions are unchanged.
- `ApprovalQueuePage.tsx:55-62`, the reprint's `.catch`: type the error as
  `Error & { code?: string }` (the API client sets `code`, `api/client.ts:23-26`) and pass
  `printErrorCode: error.code ?? null` instead of `printError: error.message`.
- `gallery/fixtures/orders.ts:284`: add `printErrorCode: null` to the confirm answer.

- [ ] **Step 6: Verify** — the gate. Expected: e2e `38 failed | 69 passed (107)`; unit `151` in `16`; `47`; `0`; `0`.
`grep -rn "not configured" apps/master/src` → no hits.

- [ ] **Step 7: Commit**

```bash
git add apps/master/src/main/server/lib/errors.ts apps/master/src/main/server/lib/errors.test.ts apps/master/src/main/server/services/order.service.ts apps/master/src/main/server/services/print.service.ts apps/master/src/renderer/lib/confirm-result.ts apps/master/src/renderer/lib/confirm-result.test.ts apps/master/src/renderer/api/orders.ts apps/master/src/renderer/pages/ApprovalQueuePage.tsx apps/master/gallery/fixtures/orders.ts apps/master/e2e/02-payments.test.ts
git commit -m "fix(orders): answer a closed or changed bill in Uzbek" -m "The losing confirm of two read 'Cannot transition from CLOSED to CLOSED' and the ticket kept the bill as if still waiting. It now says the bill is already closed and the ticket lets it go; a payment mismatch names both sums and reloads the bill. A missing printer has its own code, PRINTER_NOT_CONFIGURED, and the ticket's notice matches it instead of the English text."
```

---

### Task 4: Confirm computes its totals inside the transaction, after the claim

**Files:**
- Modify: `apps/master/src/main/server/services/billing.service.ts:55-69, 91`
- Modify: `apps/master/src/main/server/services/order.service.ts:776-865` (`confirm`)
- Test: `apps/master/e2e/02-payments.test.ts`

**Interfaces:**
- Consumes: `Errors.PaymentMismatch` (Task 3).
- Produces: `billingService.computeTotals(order, opts, tx?: Prisma.TransactionClient)` until the
  rebase onto P7 (Step 6), then P7's `computeTotals(order, { discountAmount })`; the order re-read
  inside the transaction, `current`, which carries `approvedBy` for P7's alert.

Today confirm runs `computeTotals` on a read taken before the transaction (`:776`) and closes with
it. A dish added between that read and the claim at `:794` is on the order but in no total.

- [ ] **Step 1: Write the failing test** (02, new `describe('A bill that changes while it closes', …)`)

```ts
  it('[PRD 14 §10] a dish added while the admin confirms is never left out of the bill', async () => {
    const id = await sentOrder([[w.items.somsa, 1]]); // 8 000
    const { billingService } = await import('../src/main/server/services/billing.service');
    const original = billingService.computeTotals.bind(billingService);
    let armed = true;
    // The confirm's first totals call is the fast path, outside its transaction; the waiter's add
    // lands right after it. Armed by call order, not by a tx argument, so the test survives the
    // rebase onto P7, whose computeTotals takes none.
    const spy = vi.spyOn(billingService, 'computeTotals').mockImplementation(async (...args: any[]) => {
      const totals = await (original as any)(...args);
      if (armed) {
        armed = false;
        await w.w1.post(`/api/orders/${id}/items`, { menuItemId: w.items.somsa, quantity: 1 }); // now 16 000
      }
      return totals;
    });
    let first;
    try {
      first = await w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 8000 }] });
    } finally {
      spy.mockRestore();
    }
    const afterFirst = await env.prisma.order.findUniqueOrThrow({ where: { id } });
    const second = await w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 16000 }] });
    expect({
      first: first.status,
      firstCode: first.body?.error?.code,
      statusAfterFirst: afterFirst.status,
      second: second.status,
      charged: second.body?.totalSnapshot,
    }).toEqual({ first: 400, firstCode: 'PAYMENT_MISMATCH', statusAfterFirst: 'SENT', second: 200, charged: 16000 });
  });
```

Add `vi` to the file's vitest import.

- [ ] **Step 2: Run red** — `first` is 200, the order CLOSED at 8 000 with two somsa on it.

- [ ] **Step 3: Thread `tx` through `computeTotals`**

`billing.service.ts`: add a third parameter `tx?: Prisma.TransactionClient` and pass it at `:91`:
`discountRepo.findById(opts.discountId, tx)`. Without it the preset path would call `getPrisma()`
inside the confirm's transaction and, on one connection, wait until P2028 (slice 1 deviation, Task 3).

- [ ] **Step 4: Recompute inside the transaction**

In `confirm`, keep the fast path at `:776-786` (it refuses a plainly wrong body before taking the
write lock, and Step 1's hook depends on it running outside). Inside the transaction, move the
`orderRepo.setApproval(…)` call (`:799-805`) up to directly after the claim (`:794-797`), then
re-read and recompute:

```ts
        // The bill as it stands now, after the claim: a line added or removed since
        // the read above is in it. The totals and the payment check are decided
        // here; the ones above were only a fast path (PRD 14 §10). This is the
        // one re-read: setApproval ran first, so approvedBy is on it too
        // (findByIdWithDetails includes it, order.repo.ts:69-74).
        const current = await getOrderOrThrow(order.id, tx);
        const totals = await billingService.computeTotals(current, {
          discountId: input.discountId ?? null,
          discountAmount: input.discountAmount ?? null,
          serviceChargeWaived: input.waiveServiceCharge ?? false,
        }, tx);
        const totalDue = totals.total.toNumber();
        if (totalPaid !== totalDue) {
          // Throwing rolls the claim back: the bill stays SENT and nothing is charged.
          throw Errors.PaymentMismatch(totalPaid, totalDue);
        }
```

Rename the fast-path variables to `quickTotals` / `quickDue` so the transaction uses only the inner
`totals` and `totalDue` (the `applyTotals`, audit `total` and `largeDiscount` alert at `:806-857`).
Moving `setApproval` above the re-read changes nothing else: a mismatch rolls it back with the claim.
`current` is the only re-read added. The transaction's closing `return getOrderOrThrow(order.id, tx)`
(`:859`) is not a second one: it exists today and stays, because the response and the receipt need
the snapshots and payments written after `current` was read.

- [ ] **Step 5: Verify** — the gate. Expected: e2e `38 failed | 70 passed (108)`; unit `151` / `16`; `47`; `0`; `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/main/server/services/billing.service.ts apps/master/src/main/server/services/order.service.ts apps/master/e2e/02-payments.test.ts
git commit -m "fix(orders): total the bill from what it holds when it closes" -m "Confirm computed its totals before its transaction claimed the bill, so a dish added in between closed on the bill with no price in the total. Totals and the payment check now run again inside the transaction; a changed bill is refused and stays open."
```

**At the rebase onto P7** (after Task 16, while resolving the rebase; skip while building):

P7 merges first (Assumes). When this branch rebases onto it:

- `billing.service.ts`: take P7's file whole. Drop the `tx` argument from every `computeTotals`
  call; `discountRepo.findById(…, tx)` goes with P7's deletion of the preset branch. Step 1's spy
  needs no change: it forwards whatever arguments it gets.
- Inside the transaction: `const totals = await billingService.computeTotals(current, { discountAmount: input.discountAmount });`
  and the fast path `computeTotals(order, { discountAmount: input.discountAmount })`.
- P7's `discountReasonFor` runs twice: on `quickTotals` in the fast path (an early 400 before the
  write lock), and again on the in-transaction `totals` — the value `applyTotals`, the
  `ORDER_CONFIRMED` metadata and the alert use, since a line removed in between can clamp the
  discount to 0.
- P7's alert reads `givenBy: current.approvedBy?.fullName ?? null`. Do not keep P7's own
  `const closed = await getOrderOrThrow(order.id, tx)` as a second read for it; the closing read
  stays only as the transaction's return value.
- `setApproval` takes P7's signature `(id, approverId, tx)`, still called before `current`.
- Re-run the gate on the rebased branch; the counts must be Task 16's final counts plus whatever
  P7 added, and no typecheck count may rise.

---

### Task 5: Line edits check the order's status inside their own transaction

**Files:**
- Modify: `apps/master/src/main/server/repositories/order.repo.ts` (add `holdIfOpen`)
- Modify: `apps/master/src/main/server/repositories/orderLine.repo.ts:36-45` (`cancel` → `cancelIfLive`)
- Modify: `apps/master/src/main/server/lib/errors.ts` (add `LineNotLive`)
- Modify: `apps/master/src/main/server/services/order.service.ts:134-147, 229-427, 458-505`
- Test: `apps/master/e2e/02-payments.test.ts`

**Interfaces:**
- Consumes: `Errors.OrderNotOpen` (Task 3).
- Produces: `orderRepo.holdIfOpen(id: string, tx: Tx): Promise<OrderStatus | null>`;
  `orderLineRepo.cancelIfLive(id: string, reason: string, tx: Tx): Promise<boolean>`;
  `Errors.LineNotLive()` → `Business('LINE_NOT_LIVE', "Bu qator allaqachon olib tashlangan", 409)`;
  a service helper `holdOpenOrder(orderId, tx): Promise<OrderStatus>` (the status the edit runs
  under — Task 8 audits only when it is SENT).

`addLine`, `addCombo`, `updateLineQuantity` and `cancelLine` check `order.status` before their
transactions (`:250`, `:327`, `:391`, `:468`). Two more gaps from the same cause: `cancelLine`
cancels unconditionally and restores from the line read outside (`:472`, `:496-497`), so two taps
restore twice; `updateLineQuantity` takes its delta from a read outside (`:387`, `:398`).

- [ ] **Step 1: Write the failing tests** (02, in the Task 4 describe)

```ts
  it('[PRD 14 §2] a dish added as the bill closes never lands on the closed bill', async () => {
    const before = (await itemState(env, w.items.somsa)).stock!;
    const id = await sentOrder([[w.items.somsa, 1]]); // 8 000
    const { menuRepo } = await import('../src/main/server/repositories/menu.repo');
    const original = menuRepo.findItemById.bind(menuRepo);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let reached!: () => void;
    const atGate = new Promise<void>((resolve) => { reached = resolve; });
    let held = false;
    // The add passes its status check, then waits here — outside any transaction — while the bill closes.
    const spy = vi.spyOn(menuRepo, 'findItemById').mockImplementation(async (itemId: string, tx?: any) => {
      if (!held && !tx && itemId === w.items.somsa) { held = true; reached(); await gate; }
      return original(itemId, tx);
    });
    let add;
    let confirm;
    try {
      const adding = w.w1.call('POST', `/api/orders/${id}/items`, { menuItemId: w.items.somsa, quantity: 1 });
      await atGate;
      confirm = await w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 8000 }] });
      release();
      add = await adding;
    } finally {
      spy.mockRestore();
    }
    const o = await env.prisma.order.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    const live = o.lines.filter((l) => !l.isCanceled);
    expect({
      confirm: confirm.status,
      add: add.status,
      addMessage: add.body?.error?.message,
      liveLines: live.length,
      charged: Number(o.totalSnapshot),
      portionsTaken: before - (await itemState(env, w.items.somsa)).stock!,
    }).toEqual({ confirm: 200, add: 409, addMessage: 'Bu hisob allaqachon yopilgan', liveLines: 1, charged: 8000, portionsTaken: 1 });
  });

  it('[PRD 14 §2] removing the same line twice at once returns its portions once', async () => {
    const id = await sentOrder([[w.items.somsa, 3]]);
    const line = await env.prisma.orderLine.findFirstOrThrow({ where: { orderId: id } });
    const before = (await itemState(env, w.items.somsa)).stock!;
    const { orderRepo } = await import('../src/main/server/repositories/order.repo');
    const original = orderRepo.findByIdWithDetails.bind(orderRepo);
    let readers = 0;
    let open!: () => void;
    const bothRead = new Promise<void>((resolve) => { open = resolve; });
    // Both requests read the order before either writes (outside any transaction).
    const spy = vi.spyOn(orderRepo, 'findByIdWithDetails').mockImplementation(async (orderId: string, tx?: any) => {
      const row = await original(orderId, tx);
      if (!tx && orderId === id && readers < 2) { readers += 1; if (readers === 2) open(); await bothRead; }
      return row;
    });
    let answers;
    try {
      const remove = () => w.w1.call('POST', `/api/orders/${id}/lines/${line.id}/cancel`, {});
      answers = await Promise.all([remove(), remove()]);
    } finally {
      spy.mockRestore();
    }
    expect({
      outcomes: answers.map((a) => (a.status < 300 ? 'ok' : `${a.status} ${a.body?.error?.code}`)).sort(),
      returned: (await itemState(env, w.items.somsa)).stock! - before,
    }).toEqual({ outcomes: ['409 LINE_NOT_LIVE', 'ok'], returned: 3 });
  });
```

Add `itemState` to the harness import.

- [ ] **Step 2: Run red** — the first: `add` 201 and `liveLines` 2, `portionsTaken` 2; the second:
both `ok`, `returned` 6.

- [ ] **Step 3: Repository methods**

`order.repo.ts`, after `cancelIfIn`:

```ts
  /**
   * The first write of a line edit: touches the order only while it is DRAFT or
   * SENT, so an edit and a confirm or cancel cannot both win (PRD 14 §2). The
   * status the edit runs under, or null when the order has left DRAFT/SENT.
   */
  async holdIfOpen(id: string, tx: Tx): Promise<OrderStatus | null> {
    const held = await tx.order.updateMany({
      where: { id, status: { in: [OrderStatus.DRAFT, OrderStatus.SENT] } },
      data: { updatedAt: new Date() },
    });
    if (held.count !== 1) return null;
    const row = await tx.order.findUnique({ where: { id }, select: { status: true } });
    return row?.status ?? null;
  },
```

`orderLine.repo.ts`: replace `cancel` (its only caller is `cancelLine`) with

```ts
  /** Marks a live line cancelled, as one conditional statement. False when it already was. */
  async cancelIfLive(id: string, reason: string, tx: Tx): Promise<boolean> {
    const result = await tx.orderLine.updateMany({
      where: { id, isCanceled: false },
      data: { isCanceled: true, canceledAt: new Date(), canceledReason: reason },
    });
    return result.count === 1;
  },
```

`errors.ts`: `LineNotLive: () => new AppError('LINE_NOT_LIVE', 409, "Bu qator allaqachon olib tashlangan"),`.

- [ ] **Step 4: Hold the order in every line edit**

In `order.service.ts` add, next to `getOrderOrThrow`:

```ts
/** Holds the order for a line edit, or answers why it cannot be edited. */
async function holdOpenOrder(orderId: string, tx: Tx): Promise<OrderStatus> {
  const status = await orderRepo.holdIfOpen(orderId, tx);
  if (status) return status;
  const current = await orderRepo.findById(orderId, tx);
  throw Errors.OrderNotOpen(current?.status ?? 'UNKNOWN');
}
```

- `addLine` (`:267`) and `addCombo` (`:338`): first statement of the transaction
  `const heldStatus = await holdOpenOrder(order.id, tx);` (`heldStatus` is used by Task 8; until
  then name it `_heldStatus` or call without binding). The pre-checks at `:250` and `:327` stay as
  fast paths. `menuRepo.findItemById(input.menuItemId)` (`:254`) stays outside the transaction.
- `updateLineQuantity` (`:401`): first `holdOpenOrder`, then re-read
  `const live = await orderLineRepo.findById(input.lineId, tx);` and refuse with
  `Errors.LineNotLive()` unless `live && live.orderId === order.id && !live.isCanceled`; compute
  `delta` from `live.quantity`, and consume/restore against `live`. Keep the pre-transaction read at
  `:387` as the fast-path 404.
- `cancelLine` (`:495`): first `holdOpenOrder`, then the same re-read of `live`; then
  `if (!(await orderLineRepo.cancelIfLive(live.id, input.reason ?? '', tx))) throw Errors.LineNotLive();`
  then `maybeRestoreLineStock(live, …)`. Return `orderLineRepo.findById(live.id, tx)`.
- `maybeRestoreLineStock` (`:134-147`): narrow its line parameter to
  `{ id: string; menuItemId: string | null; quantity: number; isCanceled: boolean }`, which both the
  detailed lines and a bare `OrderLine` satisfy.

- [ ] **Step 5: Verify** — the gate. Expected: e2e `38 failed | 72 passed (110)`; unit `151` / `16`; `47`; `0`; `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/main/server/repositories/order.repo.ts apps/master/src/main/server/repositories/orderLine.repo.ts apps/master/src/main/server/lib/errors.ts apps/master/src/main/server/services/order.service.ts apps/master/e2e/02-payments.test.ts
git commit -m "fix(orders): check a bill is open inside every line edit" -m "Adding, changing and removing a line checked the status before its transaction, so a dish could land on a bill that had just closed, its stock taken and its price in no total. Each edit now holds the order first; removing a line is conditional, and a quantity change works from the line as it is."
```

---

### Task 6: A repeat add after a price change is a new line (§4, 35)

**Files:**
- Modify: `apps/master/src/main/server/services/order.service.ts:268-290` (`addLine` merge)
- Test: `apps/master/e2e/11-extras.test.ts` (`[issue 35]`, unchanged)

`addLine` merges into any live line of the same dish (`:268-274`), so the second somsa is billed at
the first line's 8 000 snapshot. It also merges into a set's component line. Merge only into a plain
line at today's price.

- [ ] **Step 1: Run the existing test red** — `-t "issue 35"` → `totalAmount` 16 000, expected 18 000.

- [ ] **Step 2: Implement**

Replace the `existingMergeable` lookup with:

```ts
        // A repeat add merges only into a plain line (not part of a set) at the
        // dish's current price. After a price change it is a new line at the new
        // price, so the bill charges what the menu says now (money rules §4, 35).
        const candidates = await tx.orderLine.findMany({
          where: { orderId: input.orderId, menuItemId: input.menuItemId, isCanceled: false, comboGroupId: null },
        });
        const existingMergeable = candidates.find((line) => line.unitPriceSnapshot.equals(item.price)) ?? null;
```

(`unitPriceSnapshot` and `item.price` are both `Prisma.Decimal`.)

- [ ] **Step 3: Verify** — the gate. Expected: e2e `37 failed | 73 passed (110)`; unit `151` / `16`; `47`; `0`; `0`.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/main/server/services/order.service.ts
git commit -m "fix(orders): bill a repeat add at the dish's current price" -m "A second add of the same dish merged into the first line and kept its old price. It now merges only into a line at the current price and outside a set; otherwise it is a new line."
```

---

### Task 7: Sets show their price (§4, 36)

**Files:**
- Create: `apps/master/src/main/server/lib/combo-price.ts`, `apps/master/src/main/server/lib/combo-price.test.ts`
- Modify: `apps/master/src/main/server/services/menu.service.ts:54-67`
- Modify: `apps/master/src/renderer/api/menu.ts:40`, `apps/master/src/renderer/components/orders/ItemPicker.tsx:152`
- Modify: `apps/master/gallery/fixtures/menu.ts:80-115`
- Test: `apps/master/e2e/11-extras.test.ts`

**Interfaces:** Produces `comboPrice(components)`; Task 8 uses it for a set's audit row.

`GET /api/menu/combos` never carried a price, so `ItemPicker.tsx:152` shows `combo.price ?? 0` = 0
and `ComboList.tsx:38` shows "—". A set is billed as its components at their current prices
(`addCombo`, `:340-356`); its price is that sum.

- [ ] **Step 1: Write the failing tests**

`combo-price.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { comboPrice } from './combo-price';

describe('comboPrice', () => {
  it('is each dish at its price, times its quantity', () => {
    expect(comboPrice([
      { quantity: 1, menuItem: { price: '45000' } },
      { quantity: 2, menuItem: { price: 5000 } },
    ])).toBe(55000);
  });
  it('is 0 for a set with no dishes', () => {
    expect(comboPrice([])).toBe(0);
  });
});
```

e2e, `11-extras.test.ts`, in `describe('Billing edge cases', …)`:

```ts
  it('[issue 36] a set shows its price, the sum of its dishes, and the bill charges the same', async () => {
    const combo = await w.admin.post('/api/menu/combos', {
      name: 'Tushlik',
      components: [{ menuItemId: w.items.osh, quantity: 1 }, { menuItemId: w.items.choy, quantity: 2 }],
    });
    const listed = (await w.admin.get('/api/menu/combos')).find((c: any) => c.id === combo.id);
    const id = await openOrder(w.w1, w.nextTable(), []);
    await w.w1.post(`/api/orders/${id}/combos`, { comboId: combo.id });
    const o = await w.w1.get(`/api/orders/${id}`);
    expect({ listed: listed?.price, billed: o.totalAmount }).toEqual({ listed: 55000, billed: 55000 });
  });
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement**

```ts
/** A set's price: what addCombo will bill — each dish at its current price × its quantity. */
export function comboPrice(components: Array<{ quantity: number; menuItem: { price: { toString(): string } | number | string } }>): number {
  return components.reduce((sum, c) => sum + Number(String(c.menuItem.price)) * c.quantity, 0);
}
```

`menu.service.ts` `listCombos`: add `price: comboPrice(combo.components),` to each row (the
whitelist stays: no cost, no count). `api/menu.ts:40`: `price: number;`. `ItemPicker.tsx:152`:
`formatMoney(combo.price)`. Gallery: give `combos` prices equal to the sum of their resolved
components (`resolveComponents` already attaches `menuItem`), through a small local
`sumOf(components)`; `combo-summer` gets its sum, not `null`.

- [ ] **Step 4: Verify** — the gate. Expected: e2e `37 failed | 74 passed (111)`; unit `153` / `17`; `47`; `0`; `0`.
Open the gallery's Tasdiqlash ticket "Kombolar" tab (`pnpm gallery:page` in the container) and
check the prices read e.g. `55 000`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/lib/combo-price.ts apps/master/src/main/server/lib/combo-price.test.ts apps/master/src/main/server/services/menu.service.ts apps/master/src/renderer/api/menu.ts apps/master/src/renderer/components/orders/ItemPicker.tsx apps/master/gallery/fixtures/menu.ts apps/master/e2e/11-extras.test.ts
git commit -m "feat(menu): show each set's price" -m "The sets list carried no price, so the admin picker showed 0. It now carries the sum of its dishes at their current prices, which is what adding the set bills."
```

---

### Task 8: Line changes on a sent bill write an audit row (§4, 24; D8)

**Files:**
- Modify: `apps/master/prisma/schema.prisma:125` (enum)
- Create: `apps/master/prisma/migrations/20261002120000_order_line_audit_actions/migration.sql`
- Create: `apps/master/src/main/server/lib/line-audit.ts`, `apps/master/src/main/server/lib/line-audit.test.ts`
- Modify: `apps/master/src/main/server/services/order.service.ts` (the four line verbs)
- Modify: `apps/master/src/renderer/lib/audit-labels.ts`
- Test: `apps/master/e2e/08-staff-access.test.ts`

**Interfaces:**
- Consumes: `heldStatus` from `holdOpenOrder` (Task 5), `comboPrice` (Task 7).
- Produces: `AuditAction.ORDER_LINE_ADDED | ORDER_LINE_CHANGED | ORDER_LINE_REMOVED`;
  `lineChangeAudit({ itemName, unitPrice, quantityBefore, quantityAfter })`.

- [ ] **Step 1: Write the failing tests**

`line-audit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lineChangeAudit } from './line-audit';

describe('lineChangeAudit', () => {
  it('an add says what came on and for how much', () => {
    expect(lineChangeAudit({ itemName: 'Somsa', unitPrice: 8000, quantityBefore: 0, quantityAfter: 2 })).toEqual({
      itemName: 'Somsa', unitPrice: 8000, quantityBefore: 0, quantityAfter: 2, amountChange: 16000,
      summary: "Somsa: 0 → 2 ta, +16 000 so'm",
    });
  });
  it('a quantity change counts only the difference', () => {
    expect(lineChangeAudit({ itemName: 'Osh', unitPrice: 45000, quantityBefore: 1, quantityAfter: 2 }).summary)
      .toBe("Osh: 1 → 2 ta, +45 000 so'm");
  });
  it('a removal is negative', () => {
    const row = lineChangeAudit({ itemName: 'Xizmat haqi', unitPrice: 5000, quantityBefore: 3, quantityAfter: 0 });
    expect({ amountChange: row.amountChange, summary: row.summary }).toEqual({ amountChange: -15000, summary: "Xizmat haqi: 3 → 0 ta, -15 000 so'm" });
  });
});
```

e2e, `08-staff-access.test.ts`, in `describe('Waiter pay and line edits', …)`:

```ts
  it('[D8] line changes on a sent bill record who, which dish and how much; a draft records none', async () => {
    const LINE_ACTIONS = ['ORDER_LINE_ADDED', 'ORDER_LINE_CHANGED', 'ORDER_LINE_REMOVED'] as any;
    const adminId = (await env.prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1], [w.items.xizmat, 3]]);
    const draftRows = await env.prisma.auditLog.count({ where: { entityId: id, action: { in: LINE_ACTIONS } } });
    await sendOrder(w.w1, id);
    const osh = await env.prisma.orderLine.findFirstOrThrow({ where: { orderId: id, menuItemId: w.items.osh } });
    const xizmat = await env.prisma.orderLine.findFirstOrThrow({ where: { orderId: id, menuItemId: w.items.xizmat } });
    await w.admin.patch(`/api/orders/${id}/lines/${osh.id}/quantity`, { quantity: 2 });
    await w.w1.post(`/api/orders/${id}/lines/${xizmat.id}/cancel`, {});
    await w.admin.post(`/api/orders/${id}/items`, { menuItemId: w.items.somsa, quantity: 2 });
    const rows = await env.prisma.auditLog.findMany({ where: { entityId: id, action: { in: LINE_ACTIONS } } });
    const seen = rows
      .map((r) => {
        const m = r.metadata as any;
        return { action: r.action, who: r.userId, itemName: m.itemName, quantityBefore: m.quantityBefore, quantityAfter: m.quantityAfter, amountChange: m.amountChange };
      })
      .sort((a, b) => a.action.localeCompare(b.action));
    expect({ draftRows, seen }).toEqual({
      draftRows: 0,
      seen: [
        { action: 'ORDER_LINE_ADDED', who: adminId, itemName: 'Somsa', quantityBefore: 0, quantityAfter: 2, amountChange: 16000 },
        { action: 'ORDER_LINE_CHANGED', who: adminId, itemName: 'Osh', quantityBefore: 1, quantityAfter: 2, amountChange: 45000 },
        { action: 'ORDER_LINE_REMOVED', who: w.waiterIds.w1, itemName: 'Xizmat haqi', quantityBefore: 3, quantityAfter: 0, amountChange: -15000 },
      ],
    });
  });
```

- [ ] **Step 2: Run red** — `[issue 24]` and `[D8]` fail (no rows); the unit file fails to import.

- [ ] **Step 3: Schema and migration**

Add after `ITEM_COST_CHANGED` (`schema.prisma:125`): `ORDER_LINE_ADDED`, `ORDER_LINE_CHANGED`,
`ORDER_LINE_REMOVED`. Create
`prisma/migrations/20261002120000_order_line_audit_actions/migration.sql` by hand:

```sql
-- Schema-only change: adds ORDER_LINE_ADDED, ORDER_LINE_CHANGED and
-- ORDER_LINE_REMOVED to the AuditAction enum in schema.prisma (money rules §4
-- item 24, D8). SQLite stores Prisma enums as TEXT, so this migration carries no
-- DDL; it keeps the migration history in step with schema.prisma.
```

Apply and regenerate:

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev
```

Expected: it applies `20261002120000_order_line_audit_actions`, creates no other migration, and
generates the client. If it offers to create a migration, stop: the schema has drifted. Keep the
name exactly: P7's pinned migrations (`20261002140000…`, `20261002150000…`) sort after it, and this
one touches no table.

- [ ] **Step 4: The pure helper**

`line-audit.ts`:

```ts
import { formatUZS } from './format';

export type LineChange = { itemName: string; unitPrice: number; quantityBefore: number; quantityAfter: number };

/** The audit metadata for one line change on a sent bill: who is the row's actor; this is what and how much. */
export function lineChangeAudit(change: LineChange) {
  const amountChange = (change.quantityAfter - change.quantityBefore) * change.unitPrice;
  const sign = amountChange > 0 ? '+' : '';
  return {
    ...change,
    amountChange,
    summary: `${change.itemName}: ${change.quantityBefore} → ${change.quantityAfter} ta, ${sign}${formatUZS(amountChange)} so'm`,
  };
}
```

(`formatUZS(-15000)` is `-15 000`.) Key order in the returned object does not matter to `toEqual`.

- [ ] **Step 5: Write the rows**

In `order.service.ts`, a helper beside `holdOpenOrder`:

```ts
type LineAuditAction = 'ORDER_LINE_ADDED' | 'ORDER_LINE_CHANGED' | 'ORDER_LINE_REMOVED';

/** D8: on a SENT bill every line change is recorded; a waiter composing a DRAFT is not. */
async function auditSentLineChange(
  heldStatus: OrderStatus, orderId: string, lineId: string | null, actorUserId: string,
  action: LineAuditAction, change: LineChange, tx: Tx,
) {
  if (heldStatus !== OrderStatus.SENT) return;
  await auditService.log({
    userId: actorUserId, action, entityType: 'Order', entityId: orderId,
    metadata: { orderId, lineId, ...lineChangeAudit(change) },
  }, tx);
}
```

Call it inside each transaction, after the line write:
- `addLine`: `ORDER_LINE_ADDED`, `itemName: item.name`, `unitPrice: item.price.toNumber()`,
  `quantityBefore: existingMergeable?.quantity ?? 0`, `quantityAfter: line.quantity`.
- `addCombo`: one row for the set, `ORDER_LINE_ADDED`, `lineId: null`, `itemName: combo.name`,
  `unitPrice: comboPrice(combo.components)`, `0 → 1`.
- `updateLineQuantity`: `ORDER_LINE_CHANGED`, `live.nameSnapshot`, `live.unitPriceSnapshot.toNumber()`,
  `live.quantity → input.quantity`.
- `cancelLine`: `ORDER_LINE_REMOVED`, `live.nameSnapshot`, `live.unitPriceSnapshot.toNumber()`,
  `live.quantity → 0`.

- [ ] **Step 6: Labels for Amallar tarixi**

`audit-labels.ts`: in `AUDIT_LABELS` after `ORDER_CANCELED`:
`ORDER_LINE_ADDED: "Hisobga taom qo'shildi"`, `ORDER_LINE_CHANGED: "Hisobda miqdor o'zgardi"`,
`ORDER_LINE_REMOVED: "Hisobdan taom olib tashlandi"`; add the three to the "Buyurtma" group's
`values`; tone: `ORDER_LINE_REMOVED` → `'warning'`, the other two → `'info'`.

- [ ] **Step 7: Verify** — the gate. Expected: e2e `36 failed | 76 passed (112)`; unit `156` / `18`; `47`; `0`; `0`.

- [ ] **Step 8: Commit**

```bash
git add apps/master/prisma/schema.prisma apps/master/prisma/migrations/20261002120000_order_line_audit_actions apps/master/src/main/server/lib/line-audit.ts apps/master/src/main/server/lib/line-audit.test.ts apps/master/src/main/server/services/order.service.ts apps/master/src/renderer/lib/audit-labels.ts apps/master/e2e/08-staff-access.test.ts
git commit -m "feat(orders): record every line change on a sent bill" -m "Adding, changing or removing a line on a sent bill left no trace, so Xizmat haqi could be taken off silently. Each change now writes an audit row with who, which dish, the quantity before and after, and the so'm difference. Drafts are not recorded."
```

---

### Task 9: D26 — a Sanoq is never undone by a later cancel

**Files:**
- Modify: `apps/master/prisma/schema.prisma:350-380` (`OrderLine`)
- Create: `apps/master/prisma/migrations/20261002130000_order_line_counted_qty/migration.sql`
- Create: `apps/master/src/main/server/lib/stock-restore.ts`, `apps/master/src/main/server/lib/stock-restore.test.ts`
- Modify: `apps/master/src/main/server/repositories/orderLine.repo.ts` (add `settleOpenLinesForCount`)
- Modify: `apps/master/src/main/server/services/stock.service.ts:106-137` (`restore`), `:244-284` (`setCount`)
- Test: `apps/master/e2e/04-stock-cost.test.ts`

**Interfaces:**
- Produces: `OrderLine.countedQty: Int @default(0)`; `restoreSplit(line, portions)`;
  `orderLineRepo.settleOpenLinesForCount(menuItemId, tx): Promise<number>`; the `STOCK_COUNT_SET`
  audit metadata gains `heldByOpenOrders`.

Every restore path — cancel by hand, decrease, order cancel, the cleanup — goes through
`stockService.restore`, so D26 lives there once.

- [ ] **Step 1: Write the failing tests**

`stock-restore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { restoreSplit } from './stock-restore';

describe('restoreSplit (D26)', () => {
  it('a line never counted returns everything', () => {
    expect(restoreSplit({ quantity: 5, countedQty: 0 }, 5)).toEqual({ toStock: 5, countedQtyAfter: 0 });
  });
  it('a line the Sanoq counted returns nothing', () => {
    expect(restoreSplit({ quantity: 5, countedQty: 5 }, 5)).toEqual({ toStock: 0, countedQtyAfter: 0 });
  });
  it('a decrease returns the portions added after the Sanoq first', () => {
    expect(restoreSplit({ quantity: 7, countedQty: 5 }, 3)).toEqual({ toStock: 2, countedQtyAfter: 4 });
  });
  it('a small decrease within the new portions keeps the counted ones', () => {
    expect(restoreSplit({ quantity: 7, countedQty: 5 }, 1)).toEqual({ toStock: 1, countedQtyAfter: 5 });
  });
  it('never returns more than the line holds', () => {
    expect(restoreSplit({ quantity: 2, countedQty: 0 }, 9)).toEqual({ toStock: 2, countedQtyAfter: 0 });
  });
});
```

e2e, `04-stock-cost.test.ts`, a new `describe('A Sanoq, then a cancel (D26)', …)` at the end of the
file. Its `beforeAll` calls `await w.relogin()` (earlier tests moved the clock 26 hours). Each test
sets the count absolutely, so the stock left by earlier tests does not matter.

```ts
  const somsa = () => itemState(env, w.items.somsa).then((s) => s.stock!);
  const count = (countedQty: number) => w.admin.post(`/api/stock/${w.items.somsa}/count`, { countedQty });
  const lineOf = (orderId: string) => env.prisma.orderLine.findFirstOrThrow({ where: { orderId, isCanceled: false } });

  it('[D26] a line added before the Sanoq returns nothing when removed by hand', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.somsa, 5]]);
    await count(90);
    await w.w1.post(`/api/orders/${id}/lines/${(await lineOf(id)).id}/cancel`, {});
    expect(await somsa()).toBe(90); // was 95
  });

  it('[D26] the 12-hour cleanup after a Sanoq returns nothing', async () => {
    const id = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 5]]);
    await count(90);
    setClock(new Date(Date.now() + 13 * 60 * 60 * 1000));
    await w.relogin();
    await env.svc.scheduler.runDraftCleanup();
    const draft = await env.prisma.order.findUniqueOrThrow({ where: { id } });
    expect({ status: draft.status, stock: await somsa() }).toEqual({ status: 'CANCELED', stock: 90 }); // was 95
  });

  it('[D26] portions added after the Sanoq still come back; the counted ones do not', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.somsa, 5]]);
    await count(90);
    await w.w1.post(`/api/orders/${id}/items`, { menuItemId: w.items.somsa, quantity: 2 }); // merges: 7 on the line
    const line = await lineOf(id);
    const afterAdd = await somsa();
    await w.w1.patch(`/api/orders/${id}/lines/${line.id}/quantity`, { quantity: 4 });
    const decreased = await env.prisma.orderLine.findUniqueOrThrow({ where: { id: line.id } });
    const afterDecrease = await somsa();
    await w.w1.post(`/api/orders/${id}/lines/${line.id}/cancel`, {});
    expect({
      quantityAfterAdd: line.quantity, afterAdd, afterDecrease,
      cogsAfterDecrease: Number(decreased.cogsSnapshot), afterCancel: await somsa(),
    }).toEqual({ quantityAfterAdd: 7, afterAdd: 88, afterDecrease: 90, cogsAfterDecrease: 16000, afterCancel: 90 }); // was 91, then 95
  });
```

Add `setClock` to the file's harness import if missing.

- [ ] **Step 2: Run red** — 95, 95, and `afterDecrease` 91 / `afterCancel` 95.

- [ ] **Step 3: Schema and migration**

In `model OrderLine`, after `cogsSnapshot`:

```prisma
  // Portions of this line the item's latest Sanoq already counted out of stock
  // (money rules D26). A restore returns only the portions above it.
  countedQty            Int       @default(0)
```

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --create-only --name order_line_counted_qty
```

Rename the created folder to `20261002130000_order_line_counted_qty` (this exact name: it must sort
before P7's `20261002140000_order_discount_reason` and `20261002150000_drop_discount_presets`) and
read its SQL. It writes only `OrderLine`; P7's two write only `Order` and `Discount`. Expected:
one `ALTER TABLE "OrderLine" ADD COLUMN "countedQty" INTEGER NOT NULL DEFAULT 0;`. If Prisma
instead redefines the table, check the new SQL recreates both `OrderLine_orderId_idx` and
`OrderLine_comboGroupId_idx`. Append the one-time backfill, so lines open at upgrade follow D26:

```sql
-- D26 for lines already open when this build is installed: a live line on a
-- DRAFT or SENT order, added before its item's latest Sanoq, was counted by it.
UPDATE "OrderLine" SET "countedQty" = "quantity"
WHERE "isCanceled" = 0
  AND "orderId" IN (SELECT "id" FROM "Order" WHERE "status" IN ('DRAFT', 'SENT'))
  AND "createdAt" < (
    SELECT MAX(s."createdAt") FROM "StockEntry" s
    WHERE s."menuItemId" = "OrderLine"."menuItemId" AND s."kind" = 'COUNT'
  );
```

Then `docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev` (applies and
generates; creates nothing new).

- [ ] **Step 4: The pure split**

`stock-restore.ts`:

```ts
/**
 * How many of `portions` leaving a line go back to stock (money rules D26).
 * The latest Sanoq counted `countedQty` of the line's portions; those are
 * gone from the count already and never return. The rest came out of the
 * counted stock and do, newest first.
 */
export function restoreSplit(line: { quantity: number; countedQty: number }, portions: number) {
  const removed = Math.min(Math.max(portions, 0), line.quantity);
  const restorable = Math.max(line.quantity - line.countedQty, 0);
  return {
    toStock: Math.min(removed, restorable),
    countedQtyAfter: Math.min(line.countedQty, line.quantity - removed),
  };
}
```

- [ ] **Step 5: `restore` uses it**

Rewrite `stockService.restore` (`:106-137`) so it reads the line before touching the count:

```ts
  async restore(line: LineRef, portions: number, tx: Tx) {
    if (portions <= 0) return;
    const item = await menuRepo.findItemById(line.menuItemId, tx);
    if (!item) throw Errors.NotFound('Menu item');
    if (item.kind === MenuItemKind.SERVICE) return;

    const fresh = await tx.orderLine.findUnique({
      where: { id: line.id },
      select: { quantity: true, countedQty: true, cogsSnapshot: true, isCanceled: true },
    });
    if (!fresh) return;
    const { toStock, countedQtyAfter } = restoreSplit(fresh, portions);

    if (item.counted && toStock > 0) {
      // unchanged: read before, incrementStockCounted(item.id, toStock, tx), the two emits
    }

    // A cancelled line keeps its snapshot (reports filter it). A decrease keeps the
    // line: countedQty follows the quantity down, and cogs shrinks in proportion
    // whether or not portions came back (D5: a shortfall has no money effect).
    if (fresh.isCanceled) return;
    const cogs = fresh.cogsSnapshot ?? new Prisma.Decimal(0);
    const remainingQty = Math.max(fresh.quantity - portions, 0);
    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        countedQty: countedQtyAfter,
        ...(cogs.eq(0) || fresh.quantity <= 0 ? {} : { cogsSnapshot: cogs.mul(remainingQty).div(fresh.quantity) }),
      },
    });
  },
```

The call order the callers rely on is unchanged: `updateLineQuantity` restores before writing the
new quantity; `cancelLine` marks the line cancelled before restoring (so `fresh.isCanceled` is
true and only the count moves); `cancelOrder` and `cancelStaleDraft` restore lines that stay live
on a cancelled order.

- [ ] **Step 6: The Sanoq settles open lines**

`orderLine.repo.ts`:

```ts
  /**
   * A Sanoq counted what was on the shelf, so every portion an open order held
   * is already out of that count (D26). Returns how many portions that was.
   */
  async settleOpenLinesForCount(menuItemId: string, tx: Tx): Promise<number> {
    const open = await tx.orderLine.findMany({
      where: { menuItemId, isCanceled: false, order: { status: { in: [OrderStatus.DRAFT, OrderStatus.SENT] } } },
      select: { id: true, quantity: true },
    });
    for (const line of open) {
      await tx.orderLine.update({ where: { id: line.id }, data: { countedQty: line.quantity } });
    }
    return open.reduce((sum, line) => sum + line.quantity, 0);
  },
```

In `setCount`'s transaction, after `menuRepo.setStock` (`:250`):
`const heldByOpenOrders = await orderLineRepo.settleOpenLinesForCount(item.id, tx);` and add
`heldByOpenOrders` to the `STOCK_COUNT_SET` metadata (`:268-273`).

- [ ] **Step 7: Verify** — the gate. Expected: e2e `36 failed | 79 passed (115)` (`[issue 7]` still
passes: its draft was never counted); unit `161` / `19`; `47`; `0`; `0`.

- [ ] **Step 8: Commit**

```bash
git add apps/master/prisma/schema.prisma apps/master/prisma/migrations/20261002130000_order_line_counted_qty apps/master/src/main/server/lib/stock-restore.ts apps/master/src/main/server/lib/stock-restore.test.ts apps/master/src/main/server/repositories/orderLine.repo.ts apps/master/src/main/server/services/stock.service.ts apps/master/e2e/04-stock-cost.test.ts
git commit -m "fix(stock): a Sanoq is not undone by cancelling an older line" -m "Portions an open order held were already out of the count the owner took, but cancelling the line later added them back, so the count read high. Each line now remembers how much of it the latest Sanoq counted, and only the portions added after it return (money rules D26)."
```

---

### Task 10: D27 — automatic cancels are not counted as cancelled orders

**Files:**
- Modify: `apps/master/src/main/server/lib/stale-draft.ts`, `apps/master/src/main/server/lib/stale-draft.test.ts`
- Modify: `apps/master/src/main/server/controllers/me.controller.ts:46-52`
- Modify: `apps/master/src/main/server/services/reports.service.ts:280-284, 441-444, 1099-1103`
- Modify: `apps/master/src/main/server/repositories/order.repo.ts:112-118, 144-160`
- Test: `apps/master/e2e/04-stock-cost.test.ts`

**Interfaces:** Produces `isAutoCanceled(reason)` and `NOT_AUTO_CANCELED` (a `Prisma.OrderWhereInput`).

- [ ] **Step 1: Write the failing tests**

Append to `stale-draft.test.ts`:

```ts
  it('knows a cancel the cleanup made, whatever its hours said', () => {
    expect([STALE_DRAFT_REASON, 'Avtomatik bekor qilindi: 24 soat yuborilmadi'].map(isAutoCanceled)).toEqual([true, true]);
  });
  it('does not mistake a person\'s cancel, or none, for it', () => {
    expect(['Mehmon ketdi', '', null, undefined].map(isAutoCanceled)).toEqual([false, false, false, false]);
  });
```

e2e, `04-stock-cost.test.ts`, in the Task 9 describe:

```ts
  it('[D27] drafts the cleanup cancels are not counted as cancelled orders, and stay in Amallar tarixi', async () => {
    const drafts = [
      await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 1]]),
      await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 1]]),
    ];
    setClock(new Date(Date.now() + 13 * 60 * 60 * 1000));
    await w.relogin();
    // P2 replaces this with env.svc.time.tradingDayOf() (Assumes; Task 16 Step 5).
    const day = env.svc.time.localDayKey();
    const counts = async () => ({
      waiter: (await w.w2.get(`/api/me/today-stats?date=${day}`)).ordersCanceled,
      dayReport: (await env.svc.reports.dailyLedger(day)).sales.canceledCount,
    });
    const before = await counts();
    await env.svc.scheduler.runDraftCleanup();
    const byHand = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 1]]);
    await w.w2.post(`/api/orders/${byHand}/cancel`, { reason: 'Mehmon ketdi' });
    const after = await counts();
    const listed = (await w.admin.get(`/api/orders?status=CANCELED&date=${day}`)).map((o: any) => o.id);
    const audited = await env.prisma.auditLog.count({ where: { action: 'ORDER_CANCELED', entityId: { in: drafts } } });
    expect({
      waiter: after.waiter - before.waiter,
      dayReport: after.dayReport - before.dayReport,
      listedByHand: listed.includes(byHand),
      listedAutomatic: drafts.filter((d) => listed.includes(d)).length,
      audited,
    }).toEqual({ waiter: 1, dayReport: 1, listedByHand: true, listedAutomatic: 0, audited: 2 });
  });
```

If P2 is already on `feat/money-rules` when this task runs
(`grep -c "export function tradingDayOf" apps/master/src/main/server/lib/time.ts` → `1`), write
`env.svc.time.tradingDayOf()` instead and drop the comment.

- [ ] **Step 2: Run red** — `waiter` 3, `dayReport` 3, `listedAutomatic` 2.

- [ ] **Step 3: Implement**

`stale-draft.ts` (add `import type { Prisma } from '@prisma/client';` — type only, so the module
stays testable without Prisma):

```ts
export function isAutoCanceled(cancelReason: string | null | undefined): boolean {
  return typeof cancelReason === 'string' && cancelReason.startsWith(AUTO_CANCEL_REASON_PREFIX);
}

/**
 * Orders a person cancelled: money rules D27 leaves the cleanup's cancels out of
 * every cancelled count. The null branch is required — in SQL
 * NOT (NULL LIKE 'x%') is NULL, which would drop the row.
 */
export const NOT_AUTO_CANCELED = {
  OR: [
    { cancelReason: null },
    { NOT: { cancelReason: { startsWith: AUTO_CANCEL_REASON_PREFIX } } },
  ],
} satisfies Prisma.OrderWhereInput;
```

Add `AND: [NOT_AUTO_CANCELED]` to these CANCELED queries (and nothing else in them):
`me.controller.ts:46-52` (the `ordersCanceled` count); `reports.service.ts:281` (daily legacy
`canceledOrders`), `:442` (month), `:1100` (`dailyLedger` — feeds `canceledCount` and
`incidents.cancellations` only; no money figure reads it); `order.repo.ts` `listByStatus` and
`listByStatusAndDateRange`, only when `status === OrderStatus.CANCELED`.
`listByWaiter`, `listActive` and the audit list are untouched.

- [ ] **Step 4: Verify** — the gate. Expected: e2e `36 failed | 80 passed (116)`; unit `163` / `19`; `47`; `0`; `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/main/server/lib/stale-draft.ts apps/master/src/main/server/lib/stale-draft.test.ts apps/master/src/main/server/controllers/me.controller.ts apps/master/src/main/server/services/reports.service.ts apps/master/src/main/server/repositories/order.repo.ts apps/master/e2e/04-stock-cost.test.ts
git commit -m "fix(reports): leave the cleanup's cancels out of cancelled orders" -m "A waiter who left three drafts overnight showed three cancelled orders the next morning, in their stats, the day report and Buyurtmalar. Drafts the 12-hour cleanup cancels are no longer counted there; Amallar tarixi still lists them (money rules D27)."
```

---

### Task 11: Both waiter apps show the charged total once a bill closes (§4, 17)

**Files:**
- Create: `apps/order/src/renderer/lib/bill-summary.ts`, `apps/order/src/renderer/lib/bill-summary.test.ts`
- Create: `apps/mobile/src/lib/bill-summary.ts`, `apps/mobile/src/lib/bill-summary.test.ts`
- Modify: `apps/master/vitest.config.ts:17`
- Modify: `apps/order/src/renderer/api/orders.ts:6-41`, `pages/OrderDetailPage.tsx:147-150, 300-312`, `pages/HomePage.tsx:202-205`
- Modify: `apps/mobile/src/screens/OrderEditScreen.tsx:141-147, 311-330`
- Test: `apps/master/e2e/01-bill.test.ts` (`[issue 17]` rewritten)

**Interfaces:** Produces `billSummary(order): { food; discount; service; total; charged }` in each app
(identical code; the apps share no package).

The waiter apps sum the lines (`OrderDetailPage.tsx:147`, `HomePage.tsx:202`,
`OrderEditScreen.tsx:145-147`), so a closed bill with a discount shows 105 000 where 95 000 was
charged. Neither app has a test runner; `apps/master`'s `pnpm test` runs their pure tests.

- [ ] **Step 1: Rewrite `[issue 17]` to test what the apps compute**

Replace the `[issue 17]` test in `01-bill.test.ts` with:

```ts
  it("[issue 17] after the bill closes, both waiter apps show what was charged", async () => {
    const o = await w.w1.get(`/api/orders/${order.id}`);
    const { billSummary: orderApp } = await import('../../order/src/renderer/lib/bill-summary');
    const { billSummary: mobileApp } = await import('../../mobile/src/lib/bill-summary');
    const charged = { food: 90000, discount: 10000, service: 15000, total: 95000, charged: true };
    expect({ orderApp: orderApp(o), mobileApp: mobileApp(o) }).toEqual({ orderApp: charged, mobileApp: charged });
  });
```

- [ ] **Step 2: Write the unit tests** (the same three cases in both apps' test files)

```ts
import { describe, expect, it } from 'vitest';
import { billSummary } from './bill-summary';

const lines = [
  { price: 45000, quantity: 2, isCanceled: false, menuItemKind: 'FOOD' as const },
  { price: 5000, quantity: 3, isCanceled: false, menuItemKind: 'SERVICE' as const },
  { price: 8000, quantity: 1, isCanceled: true, menuItemKind: 'FOOD' as const },
];

describe('billSummary', () => {
  it('a closed bill shows what was charged, discount included', () => {
    expect(billSummary({ status: 'CLOSED', lines, subtotalSnapshot: 90000, discountAmountSnapshot: 10000, serviceChargeSnapshot: 15000, totalSnapshot: 95000 }))
      .toEqual({ food: 90000, discount: 10000, service: 15000, total: 95000, charged: true });
  });
  it('an open bill adds up its live lines', () => {
    expect(billSummary({ status: 'SENT', lines })).toEqual({ food: 90000, discount: 0, service: 15000, total: 105000, charged: false });
  });
  it('a closed bill with no discount shows 0 for it', () => {
    expect(billSummary({ status: 'CLOSED', lines, subtotalSnapshot: 90000, discountAmountSnapshot: null, serviceChargeSnapshot: 15000, totalSnapshot: 105000 }).discount).toBe(0);
  });
});
```

`apps/master/vitest.config.ts`, `include`: add `'../order/src/renderer/lib/**/*.test.ts'` and
`'../mobile/src/lib/**/*.test.ts'` (keep the comment about pure modules; extend it to say these two
apps have no runner of their own).

- [ ] **Step 3: Run red** — the e2e test fails to import; `pnpm test` fails on the two new files.
Confirm both new files are collected:
`docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test -- --reporter=verbose 2>&1 | grep -c bill-summary`
→ at least `2`. If `0`, vitest is not collecting outside its root: use
`resolve(__dirname, '../order/src/renderer/lib') + '/**/*.test.ts'` (and the same for mobile) and re-check.

- [ ] **Step 4: Implement the helper** (`apps/order/src/renderer/lib/bill-summary.ts`; the mobile
file is the same code)

```ts
export type BillSummaryInput = {
  status: string;
  lines: Array<{ price: number; quantity: number; isCanceled: boolean; menuItemKind?: 'FOOD' | 'SERVICE' }>;
  subtotalSnapshot?: number | null;
  discountAmountSnapshot?: number | null;
  serviceChargeSnapshot?: number | null;
  totalSnapshot?: number | null;
};

export type BillSummary = { food: number; discount: number; service: number; total: number; charged: boolean };

/**
 * The bill as the waiter should read it. Once closed it is what was charged —
 * the server's snapshots, discount included (money rules §4, 17). Before that it
 * is the live lines: food, then Xizmat haqi.
 */
export function billSummary(order: BillSummaryInput): BillSummary {
  if (order.status === 'CLOSED' && order.totalSnapshot != null) {
    return {
      food: order.subtotalSnapshot ?? 0,
      discount: order.discountAmountSnapshot ?? 0,
      service: order.serviceChargeSnapshot ?? 0,
      total: order.totalSnapshot,
      charged: true,
    };
  }
  let food = 0;
  let service = 0;
  for (const line of order.lines) {
    if (line.isCanceled) continue;
    if (line.menuItemKind === 'SERVICE') service += line.price * line.quantity;
    else food += line.price * line.quantity;
  }
  return { food, discount: 0, service, total: food + service, charged: false };
}
```

- [ ] **Step 5: Use it in the screens**

- Order app `api/orders.ts`: `OrderLine` gains `menuItemKind?: 'FOOD' | 'SERVICE'`; `Order` gains
  `subtotalSnapshot`, `discountAmountSnapshot`, `serviceChargeSnapshot` (`number | null`) — the
  server already sends them. No cost field is added.
- `OrderDetailPage.tsx:147-150`: `const bill = useMemo(() => (order ? billSummary(order) : null), [order]);`;
  "Jami" (`:310`) shows `bill.total`; under it, when `bill.charged && bill.discount > 0`,
  `<div className="text-[12px] text-muted-foreground">Chegirma: -{formatMoney(bill.discount)} so&apos;m</div>`.
- `HomePage.tsx:202-205`: `lineTotal(o)` returns `billSummary(o).total`.
- Mobile `OrderEditScreen.tsx:141-147`: `const bill = billSummary(order);` replaces
  `foodSubtotal`/`serviceTotal`/`subtotal`; the summary (`:311-330`) shows Ovqat `bill.food`, then
  a "Chegirma" row `-{formatUZS(bill.discount)} so'm` when `bill.discount > 0`, Xizmat haqi
  `bill.service` (when > 0), Jami `bill.total`. `OrderCard.tsx:39` already shows `totalAmount`,
  which the server sets to the charged total; it stays.

- [ ] **Step 6: Verify** — the gate. Expected: e2e `35 failed | 81 passed (116)`; unit `169` / `21`;
`pnpm typecheck` `47` (root `pnpm -r typecheck` also checks mobile; the test files' `vitest` import
resolves from the hoisted root `node_modules`); `0`; `0`.

- [ ] **Step 7: Commit**

```bash
git add apps/order/src/renderer/lib/bill-summary.ts apps/order/src/renderer/lib/bill-summary.test.ts apps/order/src/renderer/api/orders.ts apps/order/src/renderer/pages/OrderDetailPage.tsx apps/order/src/renderer/pages/HomePage.tsx apps/mobile/src/lib/bill-summary.ts apps/mobile/src/lib/bill-summary.test.ts apps/mobile/src/screens/OrderEditScreen.tsx apps/master/vitest.config.ts apps/master/e2e/01-bill.test.ts
git commit -m "fix(waiter): show the charged total once a bill closes" -m "Both waiter apps added up the lines, so a closed bill with a discount showed more than was charged. A closed bill now shows the server's figures: food, discount, Xizmat haqi and the total paid."
```

---

### Task 12: `/omborxona` in several messages (§4, 37)

**Files:**
- Create: `apps/master/src/main/server/lib/telegram-chunks.ts`, `apps/master/src/main/server/lib/telegram-chunks.test.ts`
- Modify: `apps/master/src/main/server/services/telegram-bot.service.ts:243-253, 969-984`
- Test: `apps/master/e2e/11-extras.test.ts` (`[issue 37]` rewritten)

**Interfaces:** Produces `TELEGRAM_MESSAGE_LIMIT = 4096`, `chunkTelegramLines(header, lines, limit?): string[]`;
`formatStockMessage` now returns `string[]`.

- [ ] **Step 1: Rewrite `[issue 37]`**

Keep the 78 creates; replace the last three lines with:

```ts
    const messages: string[] = env.svc.telegram.formatStockMessage(items as any);
    const all = messages.join('\n');
    const missing = items.filter((i) => all.split(`<b>${i.name}</b>`).length !== 2).map((i) => i.name);
    expect({
      fits: messages.every((m) => m.length <= 4096),
      parts: messages.length > 1,
      missing,
    }, `${items.length} counted dishes → ${messages.map((m) => m.length).join(' + ')} characters`).toEqual({ fits: true, parts: true, missing: [] });
```

and rename it `'[issue 37] /omborxona sends 80 counted dishes in parts, each within Telegram's 4 096 characters'`.

- [ ] **Step 2: Write the unit tests**

```ts
import { describe, expect, it } from 'vitest';
import { chunkTelegramLines } from './telegram-chunks';

const HEADER = "📦 <b>Omborxona qoldig'i</b>";

describe('chunkTelegramLines', () => {
  it('what fits is one message with the header and no part number', () => {
    expect(chunkTelegramLines(HEADER, ['a', 'b'])).toEqual([`${HEADER}\n\na\nb`]);
  });
  it('a long list splits into numbered parts, each within the limit, every line once', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `${String(i).padStart(2, '0')}${'x'.repeat(38)}`);
    const parts = chunkTelegramLines(HEADER, lines, 300);
    const body = parts.map((p) => p.split('\n\n')[1]).join('\n').split('\n');
    expect({
      several: parts.length > 1,
      fit: parts.every((p) => p.length <= 300),
      firstHeader: parts[0]!.startsWith(`${HEADER} — 1/${parts.length}\n\n`),
      lines: body,
    }).toEqual({ several: true, fit: true, firstHeader: true, lines });
  });
  it('a single line longer than the limit is cut, never sent over it', () => {
    expect(chunkTelegramLines(HEADER, ['y'.repeat(500)], 200).every((p) => p.length <= 200)).toBe(true);
  });
});
```

- [ ] **Step 3: Run red.**

- [ ] **Step 4: Implement**

```ts
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/**
 * Packs lines into as few Telegram messages as fit under `limit`, in order.
 * With more than one, each header gains " — k/n" so the owner can tell they
 * belong together. Measured on the raw HTML, which is never shorter than what
 * Telegram counts, so a part never comes back as too long.
 */
export function chunkTelegramLines(header: string, lines: string[], limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  const budget = limit - header.length - ' — 99/99'.length - 2; // "\n\n" after the header
  const parts: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const raw of lines) {
    const line = raw.length > budget ? raw.slice(0, budget) : raw;
    const cost = (current.length > 0 ? 1 : 0) + line.length;
    if (current.length > 0 && size + cost > budget) {
      parts.push(current);
      current = [];
      size = 0;
    }
    size += (current.length > 0 ? 1 : 0) + line.length;
    current.push(line);
  }
  parts.push(current);
  return parts.map((part, i) => `${parts.length > 1 ? `${header} — ${i + 1}/${parts.length}` : header}\n\n${part.join('\n')}`);
}
```

`formatStockMessage` (`:969-984`) returns `string[]`: the empty case
`['📦 <b>Omborxona</b>\n\nSanaladigan taom yo\'q.']`, otherwise
`chunkTelegramLines("📦 <b>Omborxona qoldig'i</b>", lines)`; tan narx uses
`formatUZS(Number(i.costPrice))` (`import { formatUZS } from '../lib/format'`) instead of
`toLocaleString('ru-RU')`. `sendLowStock` (`:243-253`) replies with each part in order, passing
`mainMenu` only with the last.

- [ ] **Step 5: Verify** — the gate. Expected: e2e `34 failed | 82 passed (116)`; unit `172` / `22`; `47`; `0`; `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/main/server/lib/telegram-chunks.ts apps/master/src/main/server/lib/telegram-chunks.test.ts apps/master/src/main/server/services/telegram-bot.service.ts apps/master/e2e/11-extras.test.ts
git commit -m "fix(telegram): send /omborxona in parts when it is long" -m "With about 80 counted dishes the stock list passed Telegram's 4 096-character limit and the owner got nothing. It now arrives in numbered parts, each within the limit."
```

---

### Task 13: Mobile — a wrong PIN is a wrong PIN, not a lost session

**Files:**
- Create: `apps/mobile/src/api/session-loss.ts`, `apps/mobile/src/api/session-loss.test.ts`
- Modify: `apps/mobile/src/api/client.ts:28-37`, `apps/mobile/src/screens/LoginScreen.tsx:69-80`
- Modify: `apps/master/vitest.config.ts` (include `'../mobile/src/api/**/*.test.ts'`)

`client.ts:33-37` treats every 401 as session loss: a wrong PIN on `login-pin` flips the pill to
"SESSİYA TUGADI" and calls the logout handler. The order app already guards with `&& token`
(`apps/order/src/renderer/api/client.ts:29`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { isSessionLoss } from './session-loss';

describe('isSessionLoss', () => {
  it('a 401 to a request that carried a session ends it', () => {
    expect(isSessionLoss(401, true)).toBe(true);
  });
  it('a 401 to a login without a session is a wrong PIN', () => {
    expect(isSessionLoss(401, false)).toBe(false);
  });
  it('another refusal is not session loss', () => {
    expect(isSessionLoss(403, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement**

```ts
/**
 * A 401 ends the session only when one was sent. A 401 to a request without
 * one — a wrong PIN on login-pin — is the server's answer, not a lost session.
 */
export function isSessionLoss(status: number, sentToken: boolean): boolean {
  return status === 401 && sentToken;
}
```

`client.ts`: `const sentToken = authToken !== null;` before the fetch; `if (isSessionLoss(response.status, sentToken))`
replaces `if (response.status === 401)`. A tokenless 401 then falls through to the JSON body and
throws `data.error` (`UNAUTHORIZED`), which `LoginScreen` already shows as "Noto'g'ri PIN".
`LoginScreen.tsx`: before the generic branch, `else if (err.code === 'CONFLICT') { haptics.error(); setError(err.message); }`
— "Oldingi urinish hali tugamadi, biroz kuting" (PRD 14 G5) instead of "Noto'g'ri PIN".

- [ ] **Step 4: Verify** — the gate. Expected: e2e unchanged `34 failed | 82 passed (116)`; unit `175` / `23`; `47`; `0`; `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/api/session-loss.ts apps/mobile/src/api/session-loss.test.ts apps/mobile/src/api/client.ts apps/mobile/src/screens/LoginScreen.tsx apps/master/vitest.config.ts
git commit -m "fix(mobile): treat a wrong PIN as a wrong PIN" -m "Every 401 counted as a lost session, so a mistyped PIN on the login screen showed the session as ended. Only a request that carried a session can lose one now."
```

---

### Task 14: Whole so'm before sending; Qarzlar refetches after a failed repayment

**Files:**
- Create: `apps/master/src/renderer/lib/som-input.ts`, `apps/master/src/renderer/lib/som-input.test.ts`
- Modify: `apps/master/src/renderer/components/menu/ItemPanel.tsx:61-62, 74-80, 98-100`
- Modify: `apps/master/src/renderer/components/menu/NewItemPanel.tsx:48-49`
- Modify: `apps/master/src/renderer/components/expenses/ExpenseCreateDialog.tsx:50, 66-72`
- Modify: `apps/master/src/renderer/pages/DebtsPage.tsx:73`

**Interfaces:** Produces `parseSom(text, { allowZero }): { ok: true; value: number } | { ok: false; message: string }`.

The server refuses a fraction (PRD 14 G3) with the generic "So'rov ma'lumotlari noto'g'ri"; the forms
let `4999.5` through (`ItemPanel.tsx:62`, `NewItemPanel.tsx:49`, `ExpenseCreateDialog.tsx:70`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseSom } from './som-input';

const any = { allowZero: true };
const positive = { allowZero: false };

describe('parseSom', () => {
  it('reads whole so\'m', () => {
    expect(parseSom('45000', any)).toEqual({ ok: true, value: 45000 });
  });
  it('reads a grouped figure', () => {
    expect([parseSom('45 000', any), parseSom('45 000', any)]).toEqual([{ ok: true, value: 45000 }, { ok: true, value: 45000 }]);
  });
  it('refuses a fraction with either separator', () => {
    const fraction = { ok: false, message: "Summa butun so'mda bo'lishi kerak" };
    expect([parseSom('4999.5', any), parseSom('4999,5', any)]).toEqual([fraction, fraction]);
  });
  it('refuses a negative amount', () => {
    expect(parseSom('-5000', any)).toEqual({ ok: false, message: "Summa manfiy bo'lishi mumkin emas" });
  });
  it('allows 0 only where zero is allowed', () => {
    expect([parseSom('0', any), parseSom('0', positive)])
      .toEqual([{ ok: true, value: 0 }, { ok: false, message: "Summa 0 dan katta bo'lishi kerak" }]);
  });
  it('asks for a number', () => {
    expect([parseSom('', any), parseSom('abc', any)])
      .toEqual([{ ok: false, message: 'Summani kiriting' }, { ok: false, message: "Summa raqam bo'lishi kerak" }]);
  });
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement**

```ts
export type SomParse = { ok: true; value: number } | { ok: false; message: string };

/**
 * A typed so'm amount, checked the way the server checks it (PRD 14 G3): whole,
 * not negative, and above 0 unless zero is allowed. Group spaces are ignored.
 */
export function parseSom(text: string, opts: { allowZero: boolean }): SomParse {
  const raw = text.replace(/[\s ]/g, '');
  if (raw === '') return { ok: false, message: 'Summani kiriting' };
  if (/^-?\d+[.,]\d+$/.test(raw)) return { ok: false, message: "Summa butun so'mda bo'lishi kerak" };
  if (!/^-?\d+$/.test(raw)) return { ok: false, message: "Summa raqam bo'lishi kerak" };
  const value = Number(raw);
  if (value < 0) return { ok: false, message: "Summa manfiy bo'lishi mumkin emas" };
  if (value === 0 && !opts.allowZero) return { ok: false, message: "Summa 0 dan katta bo'lishi kerak" };
  return { ok: true, value };
}
```

- `ItemPanel.tsx`: `const priceParse = parseSom(price, { allowZero: true });`
  `priceValid = priceParse.ok`; `save` sends `priceParse.value`; the error line at `:98-100` shows
  `priceParse.message` instead of the fixed "Sotuv narxi noto'g'ri".
- `NewItemPanel.tsx:48-49`: `const parsed = parseSom(price, { allowZero: true }); if (!parsed.ok) return setFormError(parsed.message);` and `price: parsed.value`.
- `ExpenseCreateDialog.tsx:66-72`: keep the empty-reason check ("Summa va sababni to'ldiring");
  replace the `Number(amount) <= 0` check with `parseSom(amount, { allowZero: false })`, show its
  message, and send its `value` at `:50`. (P4 rewrites this form in wave 3; this is the minimal edit.)
- `DebtsPage.tsx:73`: `onError: (err: Error) => { queryClient.invalidateQueries({ queryKey: ['debts'] }); toast.error(err.message || "Qarz to'lovini saqlab bo'lmadi"); }`
  — the list and the panel's detail (`['debts', 'detail', id]`) both refetch, so the balance is the real one.

- [ ] **Step 4: Verify** — the gate. Expected: e2e unchanged; unit `181` / `24`; `47`; `0`; `0`. In
the browser against the container's server (memory "Run the renderer in a browser"), at
1236 × 623: Menyu → a dish → price `4999.5` → the error line reads "Summa butun so'mda bo'lishi
kerak" and Saqlash is disabled; Chiqimlar → new → `0` → "Summa 0 dan katta bo'lishi kerak".
(No component tests exist; DebtsPage is checked by typecheck and this manual pass.)

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/renderer/lib/som-input.ts apps/master/src/renderer/lib/som-input.test.ts apps/master/src/renderer/components/menu/ItemPanel.tsx apps/master/src/renderer/components/menu/NewItemPanel.tsx apps/master/src/renderer/components/expenses/ExpenseCreateDialog.tsx apps/master/src/renderer/pages/DebtsPage.tsx
git commit -m "fix(admin): check whole so'm before sending; refresh Qarzlar after a failed payment" -m "A typed fraction reached the server and came back as a generic error. Menyu prices and Chiqim amounts are now checked first, with a message that says what is wrong. A failed repayment refetches the debt so its balance is current."
```

---

### Task 15: The missing tests — two full repayments at once; `requireAuth`'s `.catch`; `sqlite-url` inputs

**Files:**
- Test: `apps/master/e2e/06-debts.test.ts`
- Create: `apps/master/src/main/server/middleware/requireAuth.test.ts`
- Modify: `apps/master/src/main/server/lib/sqlite-url.test.ts`

All three pin behaviour slice 1 built (`debt.service.ts:162-168`, `requireAuth.ts:37-39`,
`sqlite-url.ts:7-14`). They pass on arrival; to see them catch a regression, revert the line each
one names, run it red, and restore.

- [ ] **Step 1: e2e** (in `describe('Nasiya', …)`, after the `[PRD 14 G2]` overpay test)

```ts
  it('[PRD 14 review] two full repayments at the same moment: one lands, the other answers 409', async () => {
    const lines: string[] = [];
    let wrong = 0;
    for (let i = 1; i <= 3; i += 1) {
      const name = `To'liq ${i}`;
      await sale(w, w.w1, [[w.items.osh, 1]], { payments: [{ method: 'DEBT', amount: 45000 }], debt: { debtorName: name } });
      const debt = await debtByName(name);
      const pay = () => w.admin.call('POST', `/api/debts/${debt.id}/repayments`, { amount: 45000, method: 'CASH' });
      const answers = await Promise.all([pay(), pay()]);
      const after = await env.prisma.debt.findUniqueOrThrow({ where: { id: debt.id }, include: { repayments: true } });
      const got = {
        outcomes: answers.map((a) => (a.status === 201 ? '201' : `${a.status} ${a.body?.error?.code}`)).sort(),
        rows: after.repayments.length,
        status: after.status,
        left: Number(after.remainingAmount),
      };
      lines.push(`debt ${i}: ${JSON.stringify(got)}`);
      if (JSON.stringify(got) !== JSON.stringify({ outcomes: ['201', '409 DEBT_NOT_OPEN'], rows: 1, status: 'PAID', left: 0 })) wrong += 1;
    }
    expect(wrong, lines.join('\n')).toBe(0);
  });
```

Regression check: in `debt.service.ts:164`, temporarily make `applyRepayment`'s failure always
`throw Errors.DebtOverpay()` → the test fails on `409 DEBT_NOT_OPEN`; restore.

- [ ] **Step 2: Unit**

```ts
import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const touch = vi.hoisted(() => vi.fn<(id: string) => Promise<unknown>>());
vi.mock('../repositories/session.repo', () => ({ sessionRepo: { touchLastUsed: touch } }));
vi.mock('../services/auth.service', () => ({
  authService: {
    validateSession: vi.fn(async () => ({ id: 's1', token: 't', user: { id: 'u1', role: 'ADMIN', fullName: 'Admin' } })),
  },
}));

import { requireAuth } from './requireAuth';

const request = (authorization?: string) =>
  ({ header: (name: string) => (name === 'Authorization' ? authorization : undefined) }) as unknown as Request;

describe('requireAuth', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a failed session touch is logged, never an unhandled rejection, and the request goes on', async () => {
    touch.mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const next = vi.fn() as unknown as NextFunction;
    try {
      await requireAuth(request('Bearer t'), {} as Response, next);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('unhandledRejection', unhandled);
    }
    expect({
      next: (next as unknown as ReturnType<typeof vi.fn>).mock.calls,
      logged: logged.mock.calls.map((call) => call[0]),
      unhandled: unhandled.mock.calls.length,
    }).toEqual({ next: [[]], logged: ['[requireAuth] session touch failed'], unhandled: 0 });
  });

  it('no token answers 401', async () => {
    const next = vi.fn() as unknown as NextFunction;
    await requireAuth(request(undefined), {} as Response, next);
    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ httpStatus: 401, code: 'UNAUTHORIZED' });
  });
});
```

Regression check: delete the `.catch` at `requireAuth.ts:37-39` → the first test fails
(`unhandled: 1`, nothing logged); restore.

- [ ] **Step 3: `sqlite-url` inputs** (append to `describe('singleConnectionUrl', …)`)

```ts
  it('leaves an empty URL to Prisma', () => {
    expect(singleConnectionUrl('')).toBe('');
  });

  it('a trailing ? adds the limit without an empty parameter', () => {
    expect(singleConnectionUrl('file:./dev.db?')).toBe('file:./dev.db?connection_limit=1');
  });

  it('keeps a %20 in the path as it is', () => {
    expect(singleConnectionUrl('file:C:/Users/till/My%20Data/master.sqlite'))
      .toBe('file:C:/Users/till/My%20Data/master.sqlite?connection_limit=1');
  });
```

Regression checks: change `if (!url)` to `if (url === undefined)` → the first fails (`'?connection_limit=1'`);
pass the path through `new URL(...)` or `decodeURIComponent` → the third fails; restore.

- [ ] **Step 4: Verify** — the gate. Expected: e2e `34 failed | 83 passed (117)`; unit `186` / `25`; `47`; `0`; `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/master/e2e/06-debts.test.ts apps/master/src/main/server/middleware/requireAuth.test.ts apps/master/src/main/server/lib/sqlite-url.test.ts
git commit -m "test: pin two simultaneous full repayments, the session-touch catch and three database URLs" -m "All were built in slice 1 without a test: the second of two full repayments answers 409, a failed session touch is logged instead of becoming an unhandled rejection, and the one-connection URL handles an empty string, a trailing '?' and a %20 path."
```

---

### Task 16: Documents

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md`
- Modify: `docs/superpowers/specs/2026-09-30-money-rules-design.md` (§5, status line)
- Modify: `docs/prd/14-server-money-guards.md` (§2 non-goal, §10)
- Modify: `CLAUDE.md` (Domain rules; "Work in flight")

Each edit says what the code does now, in the file's own style. Re-check every line number this
plan cites in these documents against the code at this task's HEAD; they moved.

- [ ] **Step 1: `docs/CURRENT_WORKFLOW.md`**

- §2 state machine, the sentence ending "Line edits do not claim the order; see §11 #1": line edits
  hold the order with a conditional `updateMany` on DRAFT/SENT as their first write
  (`orderRepo.holdIfOpen`); a line removed twice at once is removed once (`cancelIfLive`); a
  quantity change works from the line re-read inside its transaction.
- §2 "Confirm, step by step": totals and the payment check are a fast path before the transaction
  and are decided again inside it, on the order re-read after the claim; a bill that changed answers
  `PAYMENT_MISMATCH` (Uzbek, both sums) and stays SENT. The losing confirm answers `ILLEGAL_STATE`
  "Bu hisob allaqachon yopilgan" and the ticket lets the bill go. A failed print returns
  `printErrorCode` beside `printError`; no printer chosen is `PRINTER_NOT_CONFIGURED` (409, also from
  `reprint-bill`), and the ticket's notice reads the code.
- §2 line mutations: a repeat add merges only into a plain line at the dish's current price.
  New: line changes on a SENT bill write `ORDER_LINE_ADDED/CHANGED/REMOVED` audit rows (who, dish,
  before/after, so'm), none on a DRAFT.
- §4 "Sale and restore": "Every cancellation restores" becomes the D26 rule (`countedQty`,
  `restoreSplit`, newest portions first; cogs unchanged). Replace the "Sanoq and open orders"
  paragraph (it calls this an open question) with D26 as built, including the migration backfill.
- §6: `GET /api/menu/combos` carries `price`.
- §9 Scheduler: the 12 hours live in `lib/stale-draft.ts`; replace "Cancelled drafts appear
  wherever CANCELED orders do…" with D27: not in Buyurtmalar "Bekor qilingan", the day report or the
  waiter's `ordersCanceled`; still in Amallar tarixi; recognised by the reason prefix. Add one
  sentence: `stopScheduler` does not interrupt a cleanup already running; accepted, because each
  cancel is atomic and a draft left uncancelled is retried on the next run. §9 Telegram:
  `/omborxona` arrives in numbered parts.
- §11: delete defect #1 (fixed) and renumber, re-checking every `§11 #N` reference; in "Dead code
  worth knowing" drop `orderRepo.setStatus`.
- §13: `pnpm test` 186 tests in 25 files (including the waiter apps' pure tests); the e2e suite 117
  tests, 34 failing on purpose.

- [ ] **Step 2: money rules spec**

- Status line: add "P1 (guards-2) built on its branch" in the file's form.
- §5, append:
  - `01-bill.test.ts`: `[issue 17]` now asserts both waiter apps' `billSummary` of the closed bill
    (food 90 000, Chegirma 10 000, Xizmat haqi 15 000, Jami 95 000), not the sum of its lines.
  - `11-extras.test.ts`: `[issue 37]` now asserts `/omborxona` arrives in parts, each within 4 096
    characters, every dish once — not one message.
  - New, P1: `02-payments` (losing confirm in Uzbek; a dish added while confirming; a dish added as
    the bill closes; a line removed twice), `04-stock-cost` (`[D26]` ×3, `[D27]`), `06-debts` (two
    full repayments), `08-staff-access` (`[D8]` line audit), `11-extras` (`[issue 36]`).
  - The `[D26]` tests count absolute stock after a Sanoq; P2's 05:00 day does not touch them. The
    `[D27]` test reads the day through `env.svc.time.localDayKey()` until P2 merges after this
    package and renames it to `env.svc.time.tradingDayOf()`.

- [ ] **Step 3: PRD 14**

- §2 non-goals, the "Line edits, found while planning…" bullet: built in P1 (money rules
  wave 1), with the test names.
- §10 "For slice 2": mark the first two bullets done in P1 (confirm totals inside the transaction;
  line edits hold the order); the two D14 bullets stay (P6). "Questions for Barkamol": D26 and D27
  are built.

- [ ] **Step 4: `CLAUDE.md`, "Domain rules to respect" and "Work in flight"**

In "Stock moves at line-add time…", after "every cancellation restores": "— except portions the
item's latest Sanoq already counted (`OrderLine.countedQty`, money rules D26), which never return".

Rewrite "Work in flight — read this first (2026-08-18)". It still names `feat/remove-walkout` as
the build the customer runs and `fix/customer-feedback` as active work. Replace the heading date
and the whole block, down to the line before "### The hardware, corrected", with what is true at
this task's HEAD, checked with `git branch -a` and the documents, not recalled:

- `feat/auto-update` — v0.1.4, the build the customer runs (money rules spec, "Base"); not pushed
  while the update feed is down (`docs/UPDATE_FEED_RUNBOOK.md` §2.5).
- `fix/server-money-guards` — slice 1, PRD 14; `feat/money-rules` is built on it.
- `feat/money-rules` — the money rules programme (`docs/superpowers/specs/2026-09-30-money-rules-design.md`
  §7): wave 1 is P7 discount-qaytim, P1 guards-2, P2 trading-day, merged in that order; the plans
  are `docs/superpowers/plans/2026-10-02-money-*.md`.
- `feat/web-platform` — unchanged: Electron → web, `apps/master` does not build there; the demo
  runs from `../project02-demo`.
- `main` — behind everything; do not target.

Keep the Prisma-client warning, with its floor updated to `pnpm typecheck` 47, and the demo
paragraph. Drop the customer-feedback hotfix narrative and the 2026-08-18 audit paragraph (that
work is merged into the branches above). Do not touch the file's top block, the `@STATE.md` and
`@docs/UI_UX_RULES.md` imports: it is Barkamol's and uncommitted in the main checkout, so it is
absent in this worktree.

- [ ] **Step 5: Hand P2 its day-helper call sites**

```bash
grep -rn "localDayKey\|parseLocalDay" apps/master/e2e
```

If P2 is not yet on `feat/money-rules`, the hits are expected; put this package's own new one (the
`[D27]` test in `04-stock-cost.test.ts`) in the handover for P2's rebase, which renames it to
`tradingDayOf()` (and any `parseLocalDay(` to `tradingDayStart(`). If P2 is already there
(`grep -c "export function tradingDayOf" apps/master/src/main/server/lib/time.ts` → `1`), expected:
no hits; rename any before merging. The e2e files are in no tsconfig, so only this grep or a run
catches a call to a deleted helper.

- [ ] **Step 6: Final verification** — the gate. Expected: e2e `Tests  34 failed | 83 passed (117)`;
`Test Files  25 passed (25)`, `Tests  186 passed (186)`; `47`; `0`; `0`. The 34 failures are
tests later packages own; none is `[issue 17]`, `[issue 24]`, `[issue 35]` or `[issue 37]`.

- [ ] **Step 7: Commit**

```bash
git add docs/CURRENT_WORKFLOW.md docs/superpowers/specs/2026-09-30-money-rules-design.md docs/prd/14-server-money-guards.md CLAUDE.md
git commit -m "docs: money guards 2 built (line edits, confirm totals, D26, D27)"
```

Stop at "ready to merge". Report the branch, the final counts, the two migrations (both additive;
the second backfills open lines; both sort before P7's), Step 5's call sites for P2, and the
rebase onto P7 owed first (the note after Task 4). Hand over the merge instruction for the
checkout that holds Barkamol's uncommitted `CLAUDE.md` top block: set it aside before the merge and
restore it after, never committing it —
`git stash push -m pre-merge CLAUDE.md STATE.md && git merge --no-ff <branch> && git stash pop`;
if the pop conflicts in `CLAUDE.md`, keep both this branch's "Work in flight" and his top block.
