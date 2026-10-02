# Discount and Qaytim (P7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A discount is typed on the ticket, has no cap, and never closes without a reason that the
server stores, audits and sends to the owner. The presets, the Chegirmalar page and "Maksimal" go.
A discount typed after a Karta or Nasiya leg shrinks that leg. The waive-Xizmat-haqi switch goes.
An optional "Olindi" beside Naqd shows the change to hand back.

**Architecture:** One new column (`Order.discountReason`) and one pure server module
(`lib/bill-math.ts`) carry the money rules; billing stops reading presets and settings, so it needs
no repository and no transaction. Two migrations: the first adds the column, the second carries
every preset's name onto the bills that used it, then drops the preset table, the link and the
setting. The ticket gains three pure renderer helpers (`fitLegsToDue`, `confirmBlocker`,
`cashChange`), each unit-tested, and composes existing Blocks C1 primitives only.

**Tech Stack:** Node + Express + Prisma 6.17 on SQLite, zod 4, vitest 2 (unit: `pnpm test`; e2e:
`vitest.e2e.config.ts`), React 19 + TanStack Query in the renderer, Docker for every run.

**Spec:** `docs/superpowers/specs/2026-09-30-money-rules-design.md` D3, D20, §3.8, §3.12, §4 items
(16) and (38), §5 (`03-discount`), §7 slice 7. Parent design: `2026-08-14-money-model-design.md`
§2, §3, §9.

**Package:** P7 discount-qaytim, wave 1, built in parallel with P1 guards-2 and P2 trading-day.
**Merge order in wave 1: P7 first, then P1, then P2.** This package is built and merged off the
wave base; it is never rebased onto P1 or P2. P1 rebases its confirm transaction onto this
package. Read "Risks for the merge" before starting: P1 rewrites the same confirm.

---

## Design

### Decisions covered

| Decision | What this package builds |
|---|---|
| D3 (confirmed) | Free-form discount, no cap, reason mandatory and server-enforced. Presets, `/api/discounts`, the Chegirmalar page and `max_discount_amount` deleted. Reason stored on the bill, in the `ORDER_CONFIRMED` audit row, on Buyurtmalar and Hisobot. |
| §3.8 | The large-discount alert (50 000 or more) carries the reason and who gave it. |
| §4 (16) | A discount typed after a Karta or Nasiya leg shrinks that leg instead of leaving the bill overpaid. |
| §4 (38), money-model §9 | `waiveServiceCharge` is no longer accepted; Xizmat haqi is always charged. |
| D20, §3.12 | "Olindi" beside Naqd; the ticket shows Qaytim = Olindi − Naqd. Not stored, not printed. |

### What the operator sees

**Tasdiqlash ticket** (`OrderTicket.tsx`):

- The `Chegirma` row is unchanged. Once the discount is above 0 a row `Sabab` appears under it,
  showing the typed reason, or `Yozilmagan` while there is none.
- Finishing the discount (Enter, or `Tayyor`) with no reason opens the reason editor in the panel's
  middle: header `Chegirma sababi`, a 48 px text field (placeholder `Masalan: doimiy mijoz`,
  at most 200 characters), and `Tayyor`. Enter in the field is `Tayyor`.
- TASDIQLASH stays disabled while a discount has no reason. The foot, beside `Farq`, says why:
  `Chegirma sababini yozing`. The existing `Qarzdorni tanlang` hint moves into the foot too, so
  both reasons sit beside the disabled button and never scroll away.
- With `+ Karta` or `+ Nasiya` taken first, a discount typed afterwards comes off the newest such
  leg first, once Naqd is at 0; the bill stays balanced and TASDIQLASH stays enabled.
  Raising the discount back puts the difference on Naqd.
- While a Naqd leg holds more than 0, a row under it reads `Olindi —` on the left. Tapping it
  opens the amount editor labelled `Olindi` (hardware keyboard, Enter to finish, and the existing
  `Raqam paneli` toggle). Under the field the change shows live: `Qaytim  5 000 so'm`, or
  `Yetmaydi  5 000 so'm` when less than Naqd was handed over. Back on the row:
  `Olindi 100 000` left, `Qaytim 5 000` right (or `Yetmaydi 5 000`). Olindi never blocks
  TASDIQLASH, is never sent, never stored, never printed.

**Buyurtmalar** (`OrderPanel.tsx`): a closed bill's `Chegirma` row shows the reason under the word.

**Hisobot** (`OrdersSection.tsx`): the order list's `Chegirma` cell shows the reason under the
amount.

**Telegram** (the large-discount alert, unchanged threshold `alert_discount_threshold`):

```
🏷 <b>Katta chegirma qo'llanildi</b>
Buyurtma #K3J9AB
Chegirma: <b>60 000</b> so'm  (jami: 30 000 so'm)
Sabab: Egasining mehmoni
Bergan: Admin
Ofitsiant: Aziz
```

Typed text (reason, names) is HTML-escaped; Telegram parses the message as HTML.

**Gone:** the `Chegirmalar` door in the Sozlamalar hub (and its route), the `Moliyaviy sozlamalar`
group with `Maksimal chegirma summasi (UZS)` in Tizim sozlamalari.

**Server error**, a discount above 0 with a blank or missing reason: 400 `VALIDATION`,
`Chegirma sababini yozing`. Nothing is written.

### Server, schema and API

- `POST /api/orders/:id/confirm` body: `{ discountAmount?, discountReason?, payments, debt? }`.
  `discountReason` is a string of at most 200 characters, trimmed. It is required (non-blank) when
  the discount actually given — the typed amount clamped to the food subtotal — is above 0, and
  ignored (stored as null) otherwise. `discountAmount` becomes `somAmountOrZero` (a whole so'm, as
  a number or a digit string). `discountId` and `waiveServiceCharge` are no longer in the schema;
  zod strips them, so a client that still sends `waiveServiceCharge: true` is charged Xizmat haqi
  and gets `PAYMENT_MISMATCH` if its legs leave it out.
- Order DTO gains `discountReason: string | null`. Hisobot daily `ordersTable[]` gains
  `discountReason: string | null`.
- `billingService.computeTotals(order, { discountAmount })` reads no repository and no setting, so
  it needs no transaction client (P1, merged after this package, calls it inside its transaction
  as it is and drops its own `tx` argument).
- `alertService.largeDiscount` takes `reason` and `givenBy` (the confirming user's `fullName`,
  read from `approvedBy` on the order's final read inside the transaction — the read confirm
  already returns, moved up; no read is added).
- Schema: `Order.discountReason String?` added. `model Discount`, `Order.appliedDiscountId`,
  `User.discountsCreated` removed. `Order.serviceChargeWaived` **stays**: historical bills carry it;
  nothing writes `true` again. `AuditAction` keeps `DISCOUNT_*` and `SERVICE_CHARGE_WAIVED`
  (money-model §2: the audit log is append-only).
- Migration names are pinned so they sort after P1's `20261002120000_order_line_audit_actions` and
  `20261002130000_order_line_counted_qty`, although P1 merges after this package.
- Migration 1 `20261002140000_order_discount_reason`: `ALTER TABLE ADD COLUMN` — no rebuild.
- Migration 2 `20261002150000_drop_discount_presets`: a bill closed against a preset gets the
  preset's name as its `discountReason` (unless it already has one); the `max_discount_amount`
  setting row is deleted; `Order` is rebuilt without `appliedDiscountId`, keeping all six indexes;
  `Discount` is dropped. The amounts on every bill are untouched.
- Deleted: `discount.service.ts`, `discount.repo.ts`, `discounts.controller.ts`,
  `discounts.routes.ts`, `Errors.DiscountCapExceeded`, the `max_discount_amount` entries in
  `settings.service.ts`, `sqlite-bootstrap.ts`, `prisma/seed.ts` and `e2e/seed-like-prod.ts`.

### What deliberately stays

- The bill math itself: `discount = min(typed, food)`, `total = food − discount + service`. A 100 %
  food discount still owes Xizmat haqi (money-model D1). `reports.service.ts` `dailyLedger`, its
  formulas and `cashOut` are untouched; the only reports change is one field on `buildOrdersTable`.
- The receipt layout (`receipt-builder.ts`) — D19 belongs to P3. Only its unused `appliedDiscount`
  type goes. The reason is never printed (money-model §3).
- The `alert_discount_threshold` setting and the alert's 50 000 default.
- Waiter apps: no change. They now receive `discountReason` on closed bills — a reason, not a cost.
- `e2e/prod-forensics.ts`: it reads old databases, which still have `max_discount_amount`; unchanged.
- The stale `scripts/simulate-confirm-flow.ts` and `scripts/simulate-service-flow.ts` still send
  `discountId` / `waiveServiceCharge`; they already fail against current behaviour (CLAUDE.md) and
  are left alone.

---

## Global constraints

- **Where:** worktree `/Users/uzmacbook/dev/lab/project02-money`, branch `feat/money-rules` (or the
  package branch the orchestrator cuts from it). Never commit to `main`, `feat/auto-update` or
  `fix/server-money-guards`; never push, merge, tag or deploy. Never read or write
  `../project02`, `../project02-guards`, `../project02-demo` or `../project02-finance-e2e`.
- **Where things run:** only in the container the orchestrator names, written `CONTAINER` below.
  Never start Electron. Every `docker exec` that runs vitest takes `-e NO_COLOR=1` (the image sets
  `CI=1` and vitest colours the summary lines the greps read).
- **Floors, measured in Task 1** (PRD 14 §9 at `67455a1`; this branch is `cafd82e`, docs only
  since): e2e `Tests 38 failed | 68 passed (106)`; `pnpm test` `Test Files 14 passed (14)`,
  `Tests 142 passed (142)`; `pnpm typecheck` 47; `typecheck:renderer` 0; `typecheck:gallery` 0.
  No task may raise a typecheck count, and no e2e test that passed before a task may fail after
  it. A deletion that removes a pre-existing error lowers the floor; record the new number.
- **The counts below are for this package alone off `cafd82e`.** P7 merges first in wave 1, so it
  is not rebased onto P1 or P2. If the container's Task 1 numbers differ anyway, use them as the
  base and apply the same deltas.
- **Migrations:** the two folders are named by hand, `20261002140000_order_discount_reason` and
  `20261002150000_drop_discount_presets`, never by build-time timestamp.
- **Money:** whole so'm. Display through `formatMoney` (renderer) and `formatUZS` (server) — never
  `Intl` `uz-UZ`, which groups with commas. The printer stays ASCII and is not touched here.
- **Renderer:** compose `components/blocks` and `components/layout` (`Panel`, `Row`, `RowSub`,
  `RowMoney`, `MoneyField`, `AmountField`, `Seam`). Touch targets 48/56/66 px, type floors
  12/13/17 px (money 17), no hover-only route, no new colour, no radius, no border. The panel can
  be as small as 1236 × 623. All text Uzbek (Latin).
- **Code rules** (`docs/agent-plans/00-shared/conventions.md`): TypeScript strict,
  `noUncheckedIndexedAccess`, no `any` outside test files; 2-space indent, single quotes,
  semicolons, trailing commas; Prisma only in `repositories/`; throw `Errors.*`.
- **Tests first.** Every task writes its failing test before the code, runs it and sees it fail.
- **Commits:** conventional, plain, authored as Barkamol. No AI attribution, no `Co-Authored-By`.
  Never commit `apps/master/e2e/.data/`. Never `--no-verify`.

### Gate commands

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app CONTAINER pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master CONTAINER pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
```

Called "the gates" below. One e2e file: append its path after `vitest.e2e.config.ts`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/master/prisma/schema.prisma` | Modify | `Order.discountReason`; `Discount`, `appliedDiscountId`, `User.discountsCreated` removed |
| `apps/master/prisma/migrations/20261002140000_order_discount_reason/` | Create | Add the column |
| `apps/master/prisma/migrations/20261002150000_drop_discount_presets/` | Create | Backfill preset names, drop the presets, the link and the setting |
| `apps/master/src/main/server/lib/bill-math.ts` (+ `.test.ts`) | Create | `discountReasonFor`, `billTotals` — the bill and reason rules, Prisma-free |
| `apps/master/src/main/server/services/billing.service.ts` | Modify | Wraps `billTotals`; no preset, no cap, no waive |
| `apps/master/src/main/server/services/order.service.ts` | Modify | Confirm takes and stores the reason; no `discountId`, no waive; alert gets reason and giver |
| `apps/master/src/main/server/controllers/orders.controller.ts` | Modify | `confirmSchema` |
| `apps/master/src/main/server/repositories/order.repo.ts` | Modify | `applyTotals` writes the reason; `setApproval` loses two params; no `appliedDiscount` include |
| `apps/master/src/main/server/services/alert.service.ts` (+ `.test.ts`) | Modify | `largeDiscount` with reason and giver, HTML-escaped |
| `apps/master/src/main/server/services/reports.service.ts` | Modify | `buildOrdersTable` row carries `discountReason` |
| `apps/master/src/main/server/{services/discount.service,repositories/discount.repo,controllers/discounts.controller,routes/discounts.routes}.ts` | Delete | Presets |
| `apps/master/src/main/server/app.ts`, `lib/errors.ts`, `services/settings.service.ts`, `services/print.service.ts`, `printer/receipt-builder.ts`, `lib/money-input.ts` | Modify | Remove preset and cap references |
| `apps/master/src/main/sqlite-bootstrap.ts`, `apps/master/prisma/seed.ts` | Modify | Stop seeding presets and `max_discount_amount` |
| `apps/master/src/renderer/lib/ticket-gate.ts` (+ `.test.ts`) | Create | `confirmBlocker` |
| `apps/master/src/renderer/lib/payment-legs.ts` (+ `.test.ts`) | Modify | `fitLegsToDue` |
| `apps/master/src/renderer/lib/cash-change.ts` (+ `.test.ts`) | Create | `cashChange` |
| `apps/master/src/renderer/components/approval/OrderTicket.tsx` | Modify | Sabab row and editor, foot blocker, leg fitting, Olindi/Qaytim |
| `apps/master/src/renderer/components/orders/OrderPanel.tsx` | Modify | Reason under Chegirma |
| `apps/master/src/renderer/components/reports/OrdersSection.tsx` | Modify | Reason under the discount |
| `apps/master/src/renderer/api/{orders,reports}.ts` | Modify | `ConfirmBody`, `Order`, `ordersTable` types |
| `apps/master/src/renderer/lib/navigation.ts` (+ `.test.ts`) | Modify | Chegirmalar out of the hub; 14 destinations |
| `apps/master/src/renderer/{App.tsx,components/layout/NavRail.tsx,pages/SettingsPage.tsx}` | Modify | Route, icon, Maksimal field |
| `apps/master/src/renderer/{pages/DiscountsPage.tsx,components/discounts/*,api/discounts.ts}` | Delete | The Chegirmalar page |
| `apps/master/gallery/{main.tsx,mock-server.ts,fixtures/orders.ts,fixtures/reports.ts,fixtures/settings.ts}` | Modify | Fixtures follow the API |
| `apps/master/gallery/fixtures/discounts.ts` | Delete | Preset fixtures |
| `apps/master/e2e/03-discount.test.ts` | Modify | §5: Maksimal tests withdrawn; reason, storage, alert, Hisobot, no presets |
| `apps/master/e2e/18-discount-history.test.ts` | Create | The preset migration keeps old bills readable |
| `apps/master/e2e/{01-bill,07-day,14-forensics}.test.ts`, `e2e/seed-ui-day.ts`, `e2e/seed-like-prod.ts` | Modify | Discounted sales carry a reason; no `max_discount_amount` seed |
| `apps/master/e2e/10-ticket-unit.test.ts` | Modify | The mirror uses `fitLegsToDue`; a Nasiya case |
| `apps/master/e2e/11-extras.test.ts` | Modify | `[issue 38]` rewritten: the switch is gone |
| `docs/CURRENT_WORKFLOW.md`, `docs/superpowers/specs/2026-09-30-money-rules-design.md`, `docs/superpowers/specs/2026-08-14-money-model-design.md` | Modify | Say what the code now does |

---

### Task 1: Baselines

**Files:** none.

**Interfaces:**
- Consumes: the container `CONTAINER`, up and ready.
- Produces: the floors every later task compares against.

- [ ] **Step 1: Confirm the branch**

```bash
cd ~/dev/lab/project02-money
git status --short
git log --oneline -1
```

Expected: a clean tree (or only the orchestrator's files) and `cafd82e docs: record the money
answers of 2026-10-02 (D22-D27, D5 confirmed)` or a later commit of this package's base.

- [ ] **Step 2: Record the gates**

Run the five gate commands. Expected: `Tests  38 failed | 68 passed (106)`;
`Test Files  14 passed (14)` and `Tests  142 passed (142)`; `47`; `0`; `0`. If any differs, the
container's numbers are the floors and every expected count below shifts by the same difference;
say so in the Task 11 handover.

- [ ] **Step 3: Note which discount tests fail now**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/03-discount.test.ts e2e/10-ticket-unit.test.ts e2e/11-extras.test.ts 2>&1 | grep -E '✓|×|FAIL|Tests'
```

Expected failing: `[issue 15] a typed discount above "Maksimal"`, `[issue 15] a discount cannot
be given without a reason`, `[issue 16] + Karta first, then a discount`, `[issue 38] when the
waive switch zeroes Xizmat haqi`. These four are this package's; the rest of the 38 belong to
other packages and must keep failing for their own reasons.

No commit.

---

### Task 2: The server refuses a discount without a reason, and stores it

**Files:**
- Create: `apps/master/src/main/server/lib/bill-math.ts`, `apps/master/src/main/server/lib/bill-math.test.ts`
- Modify: `apps/master/prisma/schema.prisma:313` (after `discountAmountSnapshot`)
- Create: `apps/master/prisma/migrations/20261002140000_order_discount_reason/migration.sql` (generated, folder renamed)
- Modify: `apps/master/src/main/server/controllers/orders.controller.ts:45-61` (`confirmSchema`), `:215-229` (`confirm`)
- Modify: `apps/master/src/main/server/services/order.service.ts:738-751` (input), `:776-780` (after `computeTotals`), `:806-811` (`applyTotals`), `:828-840` (audit metadata)
- Modify: `apps/master/src/main/server/repositories/order.repo.ts:195-209` (`applyTotals`)
- Test: `apps/master/e2e/03-discount.test.ts:53-71` (replace the two `[issue 15]` tests), `:73-82` (reasons in the control)
- Modify (bodies only): `apps/master/e2e/01-bill.test.ts:15-18`, `apps/master/e2e/07-day.test.ts:45`, `apps/master/e2e/14-forensics.test.ts:87-88`, `apps/master/e2e/seed-ui-day.ts:55`

**Interfaces:**
- Consumes: `somAmountOrZero` (`lib/money-input.ts`), `Errors.Validation`.
- Produces: `discountReasonFor(discountGiven: number, reason: string | null | undefined): string | null`;
  `Order.discountReason`; confirm body field `discountReason`; the audit metadata key
  `discountReason`.

Every e2e sale with a discount must now send a reason, or its `beforeAll` throws and takes whole
files down. Those bodies change in this task, not later.

- [ ] **Step 1: Write the failing unit test**

Create `apps/master/src/main/server/lib/bill-math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { discountReasonFor } from './bill-math';

describe('discountReasonFor (money rules D3)', () => {
  it('needs no reason when nothing is taken off', () => {
    expect(discountReasonFor(0, undefined)).toBeNull();
    expect(discountReasonFor(0, 'Doimiy mijoz')).toBeNull();
  });

  it('keeps the reason, trimmed, when a discount is given', () => {
    expect(discountReasonFor(10000, '  Doimiy mijoz ')).toBe('Doimiy mijoz');
  });

  it.each([undefined, null, '', '   '])('refuses a 5 000 discount with reason %j', (reason) => {
    expect(() => discountReasonFor(5000, reason)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION', message: 'Chegirma sababini yozing' }),
    );
  });
});
```

- [ ] **Step 2: Rewrite the discount e2e tests to the decided rule**

In `apps/master/e2e/03-discount.test.ts`, replace both tests that start
`it('[issue 15] a typed discount above "Maksimal"` and `it('[issue 15] a discount cannot be given
without a reason` with:

```ts
  it('[D3] there is no cap: 150 000 off a 200 000 bill closes at 50 000 when a reason is given', async () => {
    const id = await sentOrder([[w.items.osh, 4], [w.items.salat, 1]]); // 200 000
    const closed = await w.admin.post(`/api/orders/${id}/confirm`, {
      discountAmount: 150000,
      discountReason: 'Egasining mehmoni',
      payments: [{ method: 'CASH', amount: 50000 }],
    });
    expect({ discount: closed.discountAmountSnapshot, total: closed.totalSnapshot, status: closed.status })
      .toEqual({ discount: 150000, total: 50000, status: 'CLOSED' });
  });

  it('[issue 15] a discount cannot be given without a reason (decision D3)', async () => {
    const id = await sentOrder([[w.items.osh, 1]]); // 45 000
    const body = { discountAmount: 5000, payments: [{ method: 'CASH', amount: 40000 }] };
    const none = await w.admin.call('POST', `/api/orders/${id}/confirm`, body);
    const blank = await w.admin.call('POST', `/api/orders/${id}/confirm`, { ...body, discountReason: '   ' });
    const payments = await env.prisma.payment.count({ where: { orderId: id } });
    const order = await env.prisma.order.findUniqueOrThrow({ where: { id } });
    expect(
      { none: none.status, code: none.body?.error?.code, message: none.body?.error?.message, blank: blank.status, payments, status: order.status },
      JSON.stringify([none.body, blank.body]),
    ).toEqual({ none: 400, code: 'VALIDATION', message: 'Chegirma sababini yozing', blank: 400, payments: 0, status: 'SENT' });
  });

  it('[D3] the reason is stored on the bill and in its confirm audit; a bill with no discount stores none', async () => {
    const id = await sentOrder([[w.items.osh, 2]]); // 90 000
    const closed = await w.admin.post(`/api/orders/${id}/confirm`, {
      discountAmount: 10000,
      discountReason: '  Doimiy mijoz ',
      payments: [{ method: 'CASH', amount: 80000 }],
    });
    const audit = await env.prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'ORDER_CONFIRMED' } });
    const plainId = await sentOrder([[w.items.osh, 1]]); // 45 000, no discount
    const plain = await w.admin.post(`/api/orders/${plainId}/confirm`, {
      discountReason: 'Bekorga',
      payments: [{ method: 'CASH', amount: 45000 }],
    });
    expect({
      reason: closed.discountReason,
      total: closed.totalSnapshot,
      audit: (audit.metadata as any).discountReason,
      plain: plain.discountReason,
    }).toEqual({ reason: 'Doimiy mijoz', total: 80000, audit: 'Doimiy mijoz', plain: null });
  });
```

In the test `control: the owner is alerted about a discount of 50 000 or more, not below`, add
`discountReason: 'Egasining mehmoni',` to the 60 000 confirm body and
`discountReason: 'Doimiy mijoz',` to the 40 000 one.

- [ ] **Step 3: Give every other discounted e2e sale a reason**

- `apps/master/e2e/01-bill.test.ts:16`: after `discountAmount: 10000,` add `discountReason: 'Doimiy mijoz',`.
- `apps/master/e2e/07-day.test.ts:45`: `{ discountAmount: 6000, discountReason: 'Doimiy mijoz', payments: [...] }`.
- `apps/master/e2e/14-forensics.test.ts:87-88`: change the comment to
  `// a large discount; a count lower than the system expected` and add
  `discountReason: 'Egasining mehmoni',` after `discountAmount: 150000,`.
- `apps/master/e2e/seed-ui-day.ts:55`: add `discountReason: 'Doimiy mijoz',` after `discountAmount: 6000,`.

- [ ] **Step 4: Run the tests to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/bill-math.test.ts 2>&1 | tail -5
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/03-discount.test.ts 2>&1 | grep -E '✓|×|Tests'
```

Expected: the unit run fails with `Failed to resolve import "./bill-math"`. In `03-discount`:
`[issue 15] a discount cannot be given without a reason` and `[D3] the reason is stored` fail
(200 instead of 400; `discountReason` undefined). `[D3] there is no cap` already passes — the cap
never applied to a typed discount; it pins that nothing reintroduces one.

- [ ] **Step 5: Write `bill-math.ts`**

Create `apps/master/src/main/server/lib/bill-math.ts`:

```ts
import { Errors } from './errors';

/**
 * The reason kept with a discount (money rules D3): a discount is free-form and
 * uncapped, so the reason is the only control on it. Required, trimmed, when the
 * discount actually given is above 0; null when nothing was taken off, whatever
 * the client sent.
 */
export function discountReasonFor(
  discountGiven: number,
  reason: string | null | undefined,
): string | null {
  if (discountGiven <= 0) return null;
  const trimmed = reason?.trim() ?? '';
  if (!trimmed) {
    throw Errors.Validation('Chegirma sababini yozing');
  }
  return trimmed;
}
```

- [ ] **Step 6: Add the column**

In `apps/master/prisma/schema.prisma`, inside `model Order`, after
`  discountAmountSnapshot Decimal?` add:

```prisma
  /// Why the discount was given (money rules D3). Confirm refuses a discount
  /// above 0 without one; null on a bill with no discount.
  discountReason         String?
```

Then:

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --create-only --name order_discount_reason
```

Rename the created folder to `20261002140000_order_discount_reason` (the name is pinned so it
sorts after P1's `20261002130000_order_line_counted_qty`; a build-time timestamp would not), then:

```bash
cat apps/master/prisma/migrations/20261002140000_order_discount_reason/migration.sql
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev
```

Expected: one statement, `ALTER TABLE "Order" ADD COLUMN "discountReason" TEXT;`. SQLite adds a
column in place, so no index is touched. `migrate dev` applies it, creates no other migration and
regenerates the client; if it offers to create one, stop: the schema has drifted.

- [ ] **Step 7: Accept, check and store the reason**

`orders.controller.ts`, in `confirmSchema` replace
`  discountAmount: z.number().int().nonnegative().nullable().optional(),` (and its two comment
lines above) with:

```ts
  // A typed so'm amount; no cap (money rules D3). The reason is required by
  // the service when the discount given is above 0.
  discountAmount: somAmountOrZero.nullable().optional(),
  discountReason: z.string().max(200).nullable().optional(),
```

and in `confirm` pass `discountReason: body.discountReason ?? null,` after `discountAmount`.

`order.repo.ts` `applyTotals`: add `discountReason?: string | null;` to the `totals` type. The
`data: totals` line writes it unchanged.

`order.service.ts` `confirm`:

1. Input type: add `discountReason?: string | null;` after `discountAmount`.
2. Import `discountReasonFor` from `'../lib/bill-math'`.
3. Directly after the `computeTotals` call (`:776-780`), before `totalPaid`:

```ts
      // A discount is never given without a reason (money rules D3). Checked
      // against the discount actually given — the typed amount clamped to the
      // food — so a discount on a service-only bill needs none.
      const discountReason = discountReasonFor(totals.discountAmount.toNumber(), input.discountReason);
```

4. In `applyTotals(...)` add `discountReason,` after `totalSnapshot: totals.total,`.
5. In the `ORDER_CONFIRMED` metadata add `discountReason,` after `discountAmount`.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/bill-math.test.ts 2>&1 | grep -E '^\s+Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/03-discount.test.ts e2e/01-bill.test.ts e2e/07-day.test.ts e2e/14-forensics.test.ts 2>&1 | grep -E '×|Tests'
```

Expected: `Tests  7 passed (7)`. In the e2e run the only failures are ones that failed in Task 1
in those four files (`01-bill`'s `[issue 1]` tests, `07-day`'s and the forensics' own), none in
`03-discount`.

- [ ] **Step 9: Gates**

Expected: e2e `Tests  36 failed | 71 passed (107)`; `Test Files  15 passed (15)`,
`Tests  149 passed (149)`; `47`; `0`; `0`.

(Unit: 142 + 7 — the `it.each` counts four.)

- [ ] **Step 10: Commit**

```bash
cd ~/dev/lab/project02-money
git add apps/master/prisma/schema.prisma apps/master/prisma/migrations apps/master/src/main/server/lib/bill-math.ts apps/master/src/main/server/lib/bill-math.test.ts apps/master/src/main/server/controllers/orders.controller.ts apps/master/src/main/server/services/order.service.ts apps/master/src/main/server/repositories/order.repo.ts apps/master/e2e/03-discount.test.ts apps/master/e2e/01-bill.test.ts apps/master/e2e/07-day.test.ts apps/master/e2e/14-forensics.test.ts apps/master/e2e/seed-ui-day.ts
git commit -m "feat(discount): a discount needs a reason, stored on the bill" -m "Money rules D3: a discount is free-form and uncapped, so its reason is the control. Confirm refuses a discount above 0 without a non-blank reason (400 VALIDATION), stores it trimmed on Order.discountReason and in the ORDER_CONFIRMED audit row."
```

---

### Task 3: The ticket asks for the reason

**Files:**
- Create: `apps/master/src/renderer/lib/ticket-gate.ts`, `apps/master/src/renderer/lib/ticket-gate.test.ts`
- Modify: `apps/master/src/renderer/api/orders.ts:12-24` (`ConfirmBody`)
- Modify: `apps/master/src/renderer/components/approval/OrderTicket.tsx` — `Editing` `:21`, state `:101-111`, `submit` `:235-244`, foot `:258-276`, editor branch `:278-376`, bottom stack `:395-471`

**Interfaces:**
- Consumes: Task 2's confirm field `discountReason`.
- Produces: `confirmBlocker({ discount, discountReason, needsDebtor }): string | null`;
  `ConfirmBody.discountReason`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/master/src/renderer/lib/ticket-gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { confirmBlocker } from './ticket-gate';

describe('confirmBlocker', () => {
  it('lets a plain bill through', () => {
    expect(confirmBlocker({ discount: 0, discountReason: '', needsDebtor: false })).toBeNull();
  });

  it('holds a 5 000 discount until it has a reason', () => {
    expect(confirmBlocker({ discount: 5000, discountReason: '   ', needsDebtor: false })).toBe('Chegirma sababini yozing');
    expect(confirmBlocker({ discount: 5000, discountReason: 'Doimiy mijoz', needsDebtor: false })).toBeNull();
  });

  it('holds a nasiya until it has a debtor', () => {
    expect(confirmBlocker({ discount: 5000, discountReason: 'Doimiy mijoz', needsDebtor: true })).toBe('Qarzdorni tanlang');
  });

  it('asks for the reason first: it is the field the operator just left', () => {
    expect(confirmBlocker({ discount: 5000, discountReason: '', needsDebtor: true })).toBe('Chegirma sababini yozing');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/renderer/lib/ticket-gate.test.ts 2>&1 | tail -5
```

Expected: `Failed to resolve import "./ticket-gate"`.

- [ ] **Step 3: Write `ticket-gate.ts`**

```ts
/**
 * Why TASDIQLASH is disabled, in the operator's words, or null when nothing
 * but the balance holds it (Farq is shown on its own). A discount needs a
 * reason (money rules D3) and a nasiya needs a debtor; the server refuses
 * both, so the ticket says so before the tap.
 */
export function confirmBlocker(ticket: {
  discount: number;
  discountReason: string;
  needsDebtor: boolean;
}): string | null {
  if (ticket.discount > 0 && ticket.discountReason.trim() === '') return 'Chegirma sababini yozing';
  if (ticket.needsDebtor) return 'Qarzdorni tanlang';
  return null;
}
```

- [ ] **Step 4: The body type**

`api/orders.ts` `ConfirmBody`: after `discountAmount` add

```ts
  /** Required when discountAmount > 0 (money rules D3); at most 200 characters. */
  discountReason?: string | null;
```

- [ ] **Step 5: The ticket**

In `OrderTicket.tsx`:

1. `Editing` (`:21`): add `| { kind: 'reason' }`.
2. State: `const [discountReason, setDiscountReason] = useState('');`.
3. After `needsDebtor` (`:170`): `const blocker = confirmBlocker({ discount, discountReason, needsDebtor });`.
4. Finishing the discount: a helper used by both the `AmountField`'s `onDone` and the editor's
   `Tayyor` button —

```ts
  // Leaving the discount with no reason goes straight to the reason: the bill
  // cannot close without one (D3), as a nasiya cannot without a debtor.
  const finishEditing = () => {
    if (editing?.kind === 'discount' && discount > 0 && discountReason.trim() === '') {
      setEditing({ kind: 'reason' });
      return;
    }
    setEditing(null);
  };
```

5. `submit`: `discountAmount: discount > 0 ? discount : null,` then
   `discountReason: discount > 0 ? discountReason.trim() : null,`.
6. Foot: after the `Farq` block add
   `{blocker ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{blocker}</div> : null}`,
   and TASDIQLASH becomes `disabled={!balanced || blocker !== null || submitting}`.
   Delete the `needsDebtor` hint in the bottom stack (`:456-460`): it now lives in the foot.
7. Middle: a `reason` branch before the amount editor, built like the new-debtor field
   (`:284-312`):

```tsx
      ) : editing?.kind === 'reason' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-seam">
          <RowHeader className="shrink-0">Chegirma sababi</RowHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-seam bg-field-raised p-seam">
            <Input
              autoFocus
              maxLength={200}
              value={discountReason}
              onChange={(event) => setDiscountReason(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  setEditing(null);
                }
              }}
              placeholder="Masalan: doimiy mijoz"
              aria-label="Chegirma sababi"
            />
            <div className="flex flex-1 items-end">
              <Button className="w-full" onClick={() => setEditing(null)}>
                Tayyor
              </Button>
            </div>
          </div>
        </div>
```

8. Bottom stack, directly after the `Chegirma` row (`:396-399`):

```tsx
        {discount > 0 ? (
          <Row columns="1fr 1fr" onClick={() => setEditing({ kind: 'reason' })}>
            <span>Sabab</span>
            <span className={cn('min-w-0 truncate text-right font-semibold', !discountReason.trim() && 'text-owed')}>
              {discountReason.trim() || 'Yozilmagan'}
            </span>
          </Row>
        ) : null}
```

   (`cn` from `@/lib/utils`.)
9. The `AmountField`'s `onDone` and the editor's `Tayyor` call `finishEditing` instead of
   `setEditing(null)`.
10. **Room at 1236 × 623.** The bottom stack (`:395`, `Seam className="shrink-0 content-start"`)
    becomes `className="min-h-0 content-start overflow-auto"`, so with many rows it scrolls rather
    than being cut by the panel's `overflow-hidden`. The amount and reason editors' containers get
    `min-h-[152px]` (label 34 + 56 px field + 48 px button + seams), so an editor never collapses to
    nothing under a tall stack.

- [ ] **Step 6: Run the tests and the gates**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/renderer/lib/ticket-gate.test.ts 2>&1 | grep -E '^\s+Tests'
```

Expected: `Tests  4 passed (4)`. Gates: e2e unchanged `36 failed | 71 passed (107)`;
`Test Files  16 passed (16)`, `Tests  153 passed (153)`; `47`; `0`; `0`.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/lab/project02-money
git add apps/master/src/renderer/lib/ticket-gate.ts apps/master/src/renderer/lib/ticket-gate.test.ts apps/master/src/renderer/api/orders.ts apps/master/src/renderer/components/approval/OrderTicket.tsx
git commit -m "feat(ticket): ask for the discount reason before Tasdiqlash" -m "A discount above 0 shows a Sabab row and, when the discount is finished without one, opens the reason field. TASDIQLASH stays disabled with 'Chegirma sababini yozing' beside it until a reason is typed; the debtor hint moves into the foot beside it."
```

---

### Task 4: The large-discount alert names the reason and who gave it

**Files:**
- Modify: `apps/master/src/main/server/services/alert.service.ts:28-30` (helpers), `:78-92` (`largeDiscount`)
- Modify: `apps/master/src/main/server/services/order.service.ts:845-865` (the deferred alerts and the re-read)
- Test: `apps/master/src/main/server/services/alert.service.test.ts` (new `describe`), `apps/master/e2e/03-discount.test.ts` (new test)

**Interfaces:**
- Consumes: Task 2's `discountReason`; `approvedBy` on `orderRepo.findByIdWithDetails` (`order.repo.ts:69-74`).
- Produces: `alertService.largeDiscount({ orderNumber, discount, total, waiterName, reason, givenBy })`;
  a module-local `escapeHtml(text)` in `alert.service.ts` that P4/P6's owner messages can reuse.

- [ ] **Step 1: Write the failing unit tests**

Append to `apps/master/src/main/server/services/alert.service.test.ts`:

```ts
describe('alertService.largeDiscount (money rules §3.8)', () => {
  beforeAll(async () => {
    await import('./telegram-bot.service');
  });

  afterEach(() => {
    telegram.sendMessage.mockReset();
  });

  const big = { orderNumber: 'K3J9AB', discount: 60000, total: 30000, waiterName: 'Aziz', givenBy: 'Admin' };

  it('names the reason and who gave the discount', async () => {
    telegram.sendMessage.mockResolvedValue(undefined);
    await alertService.largeDiscount({ ...big, reason: 'Egasining mehmoni' });
    const text = telegram.sendMessage.mock.calls[0]?.[0] ?? '';
    expect(text).toContain("Chegirma: <b>60 000</b> so'm");
    expect(text).toContain('Sabab: Egasining mehmoni');
    expect(text).toContain('Bergan: Admin');
    expect(text).toContain('Ofitsiant: Aziz');
  });

  it('escapes typed text, so Telegram does not refuse the message', async () => {
    telegram.sendMessage.mockResolvedValue(undefined);
    await alertService.largeDiscount({ ...big, reason: "Mehmon <VIP> & do'st" });
    expect(telegram.sendMessage.mock.calls[0]?.[0]).toContain("Sabab: Mehmon &lt;VIP&gt; &amp; do'st");
  });
});
```

- [ ] **Step 2: Write the failing e2e test**

In `apps/master/e2e/03-discount.test.ts`, after the `control: the owner is alerted` test:

```ts
  it('[D3] the large-discount alert names the reason and who gave it', async () => {
    const spy = vi.spyOn(env.svc.telegram, 'sendMessage');
    const id = await sentOrder([[w.items.osh, 2]]); // 90 000
    await w.admin.post(`/api/orders/${id}/confirm`, {
      discountAmount: 60000,
      discountReason: 'Egasining mehmoni',
      payments: [{ method: 'CASH', amount: 30000 }],
    });
    const alert = spy.mock.calls.map((c) => String(c[0])).find((t) => t.includes('chegirma')) ?? '';
    spy.mockRestore();
    expect(
      { reason: alert.includes('Sabab: Egasining mehmoni'), giver: alert.includes('Bergan: Admin'), amount: alert.includes('Chegirma: <b>60 000</b>') },
      alert,
    ).toEqual({ reason: true, giver: true, amount: true });
  });
```

- [ ] **Step 3: Run them to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/services/alert.service.test.ts 2>&1 | grep -E '×|Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/03-discount.test.ts -t "names the reason" 2>&1 | grep -E '×|Tests'
```

Expected: 2 unit failures (no `Sabab:` line) — and a type error in the test file is fine at this
step; 1 e2e failure.

- [ ] **Step 4: The alert**

In `alert.service.ts`, after `const money = formatUZS;`:

```ts
/**
 * Every alert is sent with parse_mode HTML, so typed text — a discount reason,
 * a name — must not be read as markup: a stray "<" makes Telegram refuse the
 * whole message and the owner hears nothing.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

Replace `largeDiscount` with:

```ts
  /**
   * Discount applied at confirm, alerts only when >= alert_discount_threshold.
   * The discount has no cap (money rules D3), so this is its control: it says
   * why, and who gave it (§3.8).
   */
  async largeDiscount(p: {
    orderNumber: string;
    discount: number;
    total: number;
    waiterName: string | null;
    reason: string | null;
    givenBy: string | null;
  }): Promise<void> {
    const threshold = settingsService.getInt('alert_discount_threshold', 50_000);
    if (p.discount <= 0 || p.discount < threshold) return;
    const lines = [
      `🏷 <b>Katta chegirma qo'llanildi</b>`,
      `Buyurtma #${p.orderNumber}`,
      `Chegirma: <b>${money(p.discount)}</b> so'm  (jami: ${money(p.total)} so'm)`,
    ];
    if (p.reason) lines.push(`Sabab: ${escapeHtml(p.reason)}`);
    if (p.givenBy) lines.push(`Bergan: ${escapeHtml(p.givenBy)}`);
    if (p.waiterName) lines.push(`Ofitsiant: ${escapeHtml(p.waiterName)}`);
    await send(lines.join('\n'));
  },
```

- [ ] **Step 5: Confirm passes the reason and the giver**

In `order.service.ts` `confirm`, replace the closing part of the transaction callback, from
`        const orderNumber = order.id.slice(-6).toUpperCase();` down to and including
`        return getOrderOrThrow(order.id, tx);`, with:

```ts
        // Re-read once: the receipt prints from it, and approvedBy names who gave
        // the discount for the owner's alert (money rules §3.8).
        const closed = await getOrderOrThrow(order.id, tx);
        const orderNumber = order.id.slice(-6).toUpperCase();
        deferAfterCommit(() =>
          alertService.largeDiscount({
            orderNumber,
            discount: totals.discountAmount.toNumber(),
            total: totalDue,
            waiterName: order.waiter?.fullName ?? null,
            reason: discountReason,
            givenBy: closed.approvedBy?.fullName ?? null,
          }),
        );
        if (debtPayment && input.debt) {
          const debtorName = input.debt.debtorName;
          const debtAmount = debtPayment.amount;
          deferAfterCommit(() =>
            alertService.debtSale({ orderNumber, debtorName, amount: debtAmount }),
          );
        }

        return closed;
```

Keep the comment that stood above `orderNumber` ("Owner alerts — queued here, fired last …") above
the new block.

`closed` is not a new read. It is the `return getOrderOrThrow(order.id, tx)` that confirm already
ends with, moved above the alert so the alert can name the giver. The transaction makes the same
number of reads as before.

**For P1's rebase (P1 merges after this package).** P1 T4 adds one in-transaction re-read,
`current`, after `closeIfSent` and before `setApproval`, and recomputes the totals from it. Keep
that read, and don't add another for `approvedBy`. Don't take `givenBy` from `current`: it is read
before `setApproval`, so its `approvedBy` is still null and the alert would lose `Bergan:`. `closed`
stays as confirm's final read. The receipt and the response need it after `applyTotals`, the
payments and the debt are written. So after the merge the transaction makes exactly two reads:
P1's `current` for the totals and this `closed` for the receipt and `givenBy`. P1 then feeds
`totals` and `totalDue` from `current` into this alert, and runs `discountReasonFor` against
those in-transaction totals. The check after the fast-path `computeTotals` stays, so a missing
reason still gets an early 400.

- [ ] **Step 6: Run the tests and the gates**

Expected: the two unit tests and the e2e test pass. Gates: e2e `36 failed | 72 passed (108)`;
`Test Files  16 passed (16)`, `Tests  155 passed (155)`; `47`; `0`; `0`.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/lab/project02-money
git add apps/master/src/main/server/services/alert.service.ts apps/master/src/main/server/services/alert.service.test.ts apps/master/src/main/server/services/order.service.ts apps/master/e2e/03-discount.test.ts
git commit -m "feat(alerts): the large-discount alert names the reason and who gave it" -m "With no cap on a discount the owner's alert is its control. It now carries the reason and the admin who confirmed the bill, HTML-escaped, since Telegram refuses a message whose typed text reads as markup."
```

---

### Task 5: The reason shows where the discount shows

**Files:**
- Modify: `apps/master/src/main/server/services/reports.service.ts:114-135` (`buildOrdersTable`)
- Modify: `apps/master/src/renderer/api/orders.ts:50-80` (`Order`), `apps/master/src/renderer/api/reports.ts:219-233` (`ordersTable`)
- Modify: `apps/master/src/renderer/components/orders/OrderPanel.tsx:298-303`
- Modify: `apps/master/src/renderer/components/reports/OrdersSection.tsx:57-62`
- Modify: `apps/master/gallery/fixtures/orders.ts:20-30, 63-90, 150-160, 208-218, 270-285`, `apps/master/gallery/fixtures/reports.ts:71-90`
- Test: `apps/master/e2e/03-discount.test.ts` (new last `describe`)

**Interfaces:**
- Consumes: Task 2's column.
- Produces: `Order.discountReason` in the renderer type; `ordersTable[].discountReason` on the
  daily report.

- [ ] **Step 1: Write the failing e2e test**

At the end of `apps/master/e2e/03-discount.test.ts` (it moves the clock, so it goes last), and add
`at` and `setClock` to the harness import:

```ts
describe('Where the reason shows', () => {
  it('[D3] Hisobot lists the reason beside the discount', async () => {
    setClock(at('2026-09-28T12:00'));
    await w.relogin();
    const id = await sentOrder([[w.items.somsa, 5]]); // 40 000
    await w.admin.post(`/api/orders/${id}/confirm`, {
      discountAmount: 4000,
      discountReason: 'Ofitsiant xatosi',
      payments: [{ method: 'CASH', amount: 36000 }],
    });
    const report = await w.owner.get('/api/reports/daily?date=2026-09-28');
    const row = report.ordersTable.find((r: any) => r.orderId === id);
    expect({ discount: row?.discount, reason: row?.discountReason }).toEqual({ discount: '4000', reason: 'Ofitsiant xatosi' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: `reason: undefined`.

- [ ] **Step 3: The report row**

In `buildOrdersTable`, after `discount: decStr(discount),` add
`discountReason: order.discountReason ?? null,`. `ReportOrder` already includes every scalar.
Nothing in `dailyLedger` changes.

- [ ] **Step 4: The renderer types and screens**

- `api/orders.ts` `Order`: replace `discountId: string | null;` (the server never sent it) with
  `discountReason: string | null;`.
- `api/reports.ts` `ordersTable`: add `discountReason: string | null;` after `discount`.
- `OrderPanel.tsx` (`:298-303`): the closed bill's Chegirma row becomes

```tsx
          <Row columns="1fr 130px">
            <span className="min-w-0">
              Chegirma
              {order.discountReason ? <RowSub>{order.discountReason}</RowSub> : null}
            </span>
            <RowMoney className="text-owed">−{formatMoney(discount)}</RowMoney>
          </Row>
```

- `OrdersSection.tsx` discount column cell:

```tsx
      cell: (row) => (
        <span className="min-w-0 text-right">
          <RowMoney className="block text-muted-foreground">{formatMoney(row.discount)}</RowMoney>
          {row.discountReason ? <RowSub>{row.discountReason}</RowSub> : null}
        </span>
      ),
```

- [ ] **Step 5: The gallery**

- `fixtures/orders.ts`: `OrderSpec` gains `discountReason?: string;`; `buildOrder` sets
  `discountReason: spec.discountReason ?? null` in place of `discountId: null`;
  `ord-closed-02` gets `discountReason: 'Doimiy mijoz'`, `ord-closed-12`
  `discountReason: "Tug'ilgan kun"`; the confirm mock sets
  `discountReason: confirmBody.discountReason ?? null`.
- `fixtures/reports.ts` `ordersTable` rows: `discountReason: o.discountReason ?? null`.

- [ ] **Step 6: Run the test and the gates**

Expected: the test passes. Gates: e2e `36 failed | 73 passed (109)`; unit unchanged `155`;
`47`; `0`; `0`.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/lab/project02-money
git add apps/master/src/main/server/services/reports.service.ts apps/master/src/renderer/api/orders.ts apps/master/src/renderer/api/reports.ts apps/master/src/renderer/components/orders/OrderPanel.tsx apps/master/src/renderer/components/reports/OrdersSection.tsx apps/master/gallery/fixtures/orders.ts apps/master/gallery/fixtures/reports.ts apps/master/e2e/03-discount.test.ts
git commit -m "feat(discount): show the reason on Buyurtmalar and Hisobot" -m "Money-model §3: the reason is shown next to the discount. A closed bill's Chegirma row and Hisobot's order list carry it under the amount; the receipt does not."
```

---

### Task 6: The Chegirmalar page and the Maksimal field go

**Files:**
- Delete: `apps/master/src/renderer/pages/DiscountsPage.tsx`, `apps/master/src/renderer/components/discounts/DiscountList.tsx`, `apps/master/src/renderer/components/discounts/DiscountPanel.tsx`, `apps/master/src/renderer/api/discounts.ts`, `apps/master/gallery/fixtures/discounts.ts`
- Modify: `apps/master/src/renderer/lib/navigation.ts:20-23, 84`, `apps/master/src/renderer/lib/navigation.test.ts:46-48`
- Modify: `apps/master/src/renderer/App.tsx:13, 41`, `apps/master/src/renderer/components/layout/NavRail.tsx:4, 37, 80`
- Modify: `apps/master/src/renderer/pages/SettingsPage.tsx:4, 99-111`
- Modify: `apps/master/gallery/main.tsx:24, 70, 158`, `apps/master/gallery/mock-server.ts:3, 35`, `apps/master/gallery/fixtures/settings.ts:4`

**Interfaces:**
- Consumes: nothing.
- Produces: a Sozlamalar hub of five doors, fourteen destinations in all. P3 (D22, Hisobot for
  ADMIN) changes `RAIL_DESTINATIONS` on top of this; the ADMIN rail then has 10 slots, the ceiling.

The renderer goes first so no screen ever calls a route that Task 8 deletes.

- [ ] **Step 1: Write the failing tests**

In `navigation.test.ts` replace

```ts
  it('keeps all fifteen destinations the rail used to carry', () => {
    expect(RAIL_DESTINATIONS.length + HUB_DESTINATIONS.length).toBe(15);
  });
```

with

```ts
  it('keeps the fourteen destinations: fifteen less Chegirmalar', () => {
    expect(RAIL_DESTINATIONS.length + HUB_DESTINATIONS.length).toBe(14);
  });

  it('has no Chegirmalar: a discount is typed on the ticket, never picked (money rules D3)', () => {
    const all = [...RAIL_DESTINATIONS, ...HUB_DESTINATIONS].map((d) => d.to);
    expect(all).not.toContain('/discounts');
  });
```

Run: `docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/renderer/lib/navigation.test.ts`.
Expected: 2 failed (15 received; `/discounts` found).

- [ ] **Step 2: Remove the door and the page**

- `navigation.ts`: delete the `/discounts` line (`:84`); in the header comment (`:20-23`) "fifteen
  destinations. Nine are daily service; the other six" → "fourteen destinations. Nine are daily
  service; the other five".
- `App.tsx`: delete the `DiscountsPage` import and route.
- `NavRail.tsx`: delete `discounts: <Percent size={ICON} />,` and `Percent` from the import; in the
  comment at `:80` "Xodimlar or Chegirmalar" → "Xodimlar or Maoshlar".
- Delete the five files listed above.
- `gallery/main.tsx`: delete the `DiscountsPage` import, the `chegirmalar` view and its route.
- `gallery/mock-server.ts`: delete the `discountsRoutes` import and entry.

- [ ] **Step 3: Remove the Maksimal field**

In `SettingsPage.tsx` delete the whole `<SettingsGroup title="Moliyaviy sozlamalar" icon={Coins}>`
block (`:99-111`, it holds only that field) and `Coins` from the lucide import if nothing else uses
it. In `gallery/fixtures/settings.ts` delete `max_discount_amount: '100000',`.

- [ ] **Step 4: Check nothing still names the page**

```bash
cd ~/dev/lab/project02-money/apps/master
grep -rn "DiscountsPage\|api/discounts\|components/discounts\|fixtures/discounts\|max_discount_amount\|'chegirmalar'" src/renderer gallery
```

Expected: no output.

- [ ] **Step 5: Gates**

Expected: e2e unchanged `36 failed | 73 passed (109)`; `Test Files  16 passed (16)`,
`Tests  156 passed (156)`; `47`; `0`; `0`.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/lab/project02-money
git add -A apps/master/src/renderer apps/master/gallery
git commit -m "feat(settings): remove the Chegirmalar page and the Maksimal field" -m "Money rules D3: a discount is typed on the ticket, uncapped. The preset page, its hub door and the Maksimal chegirma summasi setting go; the hub keeps five doors."
```

(`git add -A` on those two directories stages the deletions; check `git status --short` first —
only files named in this task may appear.)

---

### Task 7: The waive-Xizmat-haqi switch goes

**Files:**
- Modify: `apps/master/src/main/server/controllers/orders.controller.ts:50, 223`
- Modify: `apps/master/src/main/server/services/order.service.ts:743, 779, 799-805, 836`
- Modify: `apps/master/src/main/server/services/billing.service.ts:20-22, 67, 108-112`
- Modify: `apps/master/src/main/server/repositories/order.repo.ts:211-236` (`setApproval`)
- Modify: `apps/master/src/renderer/api/orders.ts:17`, `apps/master/gallery/fixtures/orders.ts:281`
- Test: `apps/master/e2e/11-extras.test.ts:61-68`

**Interfaces:**
- Consumes: nothing.
- Produces: confirm no longer reads `waiveServiceCharge`; `setApproval(id, approverId, discountId, tx)`
  (the `discountId` parameter goes in Task 8). `Order.serviceChargeWaived` stays in the schema and
  the DTO for historical bills; nothing writes `true`.

- [ ] **Step 1: Rewrite the test to the decided rule**

In `11-extras.test.ts` replace the test that starts
`it('[issue 38] when the waive switch zeroes Xizmat haqi` with:

```ts
  it('[issue 38] Xizmat haqi cannot be waived: it is charged, printed, and the bill adds up', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1], [w.items.xizmat, 2]]); // 45 000 + 10 000
    await sendOrder(w.w1, id);
    const waived = await w.admin.call('POST', `/api/orders/${id}/confirm`, { waiveServiceCharge: true, payments: [{ method: 'CASH', amount: 45000 }] });
    const closed = await w.admin.post(`/api/orders/${id}/confirm`, { waiveServiceCharge: true, payments: [{ method: 'CASH', amount: 55000 }] });
    const bill = printer.billFor(id);
    const printed = bill.lines.reduce((s, l) => s + l.amount, 0);
    expect(
      { waived: waived.status, service: closed.serviceChargeSnapshot, total: closed.totalSnapshot, printed, umumiy: bill.umumiy },
      JSON.stringify(waived.body),
    ).toEqual({ waived: 400, service: 10000, total: 55000, printed: 55000, umumiy: 55000 });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Expected: `waived: 200` (the switch zeroed the charge) and the second confirm then answers 409.

- [ ] **Step 3: Remove the switch**

- `orders.controller.ts`: delete `waiveServiceCharge: z.boolean().optional(),` and
  `waiveServiceCharge: body.waiveServiceCharge ?? false,`.
- `order.service.ts` `confirm`: delete the `waiveServiceCharge?: boolean;` input, the
  `serviceChargeWaived:` option to `computeTotals`, the `input.waiveServiceCharge ?? false,`
  argument to `setApproval`, and the `waiveServiceCharge:` key in the audit metadata.
- `billing.service.ts`: delete the `serviceChargeWaived: boolean;` option, the doc paragraph at
  `:20-22`, the comment at `:109-110`, and set `const serviceCharge = serviceChargeFromLines;`.
- `order.repo.ts` `setApproval`: delete the `serviceChargeWaived` parameter and the
  `serviceChargeWaived,` line in `data`.
- `api/orders.ts`: delete `waiveServiceCharge?: boolean;` from `ConfirmBody` (keep
  `serviceChargeWaived: boolean` on `Order`).
- `gallery/fixtures/orders.ts:281`: `serviceChargeSnapshot: order.serviceChargeSnapshot,`.

- [ ] **Step 4: Run the test and the gates**

```bash
cd ~/dev/lab/project02-money/apps/master
grep -rn "waiveServiceCharge" src gallery
```

Expected: no output; the test passes. Gates: e2e `35 failed | 74 passed (109)`; unit `156`;
`47`; `0`; `0`.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/lab/project02-money
git add apps/master/src/main/server/controllers/orders.controller.ts apps/master/src/main/server/services/order.service.ts apps/master/src/main/server/services/billing.service.ts apps/master/src/main/server/repositories/order.repo.ts apps/master/src/renderer/api/orders.ts apps/master/gallery/fixtures/orders.ts apps/master/e2e/11-extras.test.ts
git commit -m "fix(confirm): Xizmat haqi can no longer be waived" -m "Money rules §4 (38), money-model §9: the waiter's pay survives every bill. Confirm stops reading waiveServiceCharge; serviceChargeWaived stays on the order for historical bills."
```

---

### Task 8: The presets, the cap and their table go

**Files:**
- Delete: `apps/master/src/main/server/services/discount.service.ts`, `apps/master/src/main/server/repositories/discount.repo.ts`, `apps/master/src/main/server/controllers/discounts.controller.ts`, `apps/master/src/main/server/routes/discounts.routes.ts`
- Modify: `apps/master/src/main/server/lib/bill-math.ts`, `apps/master/src/main/server/lib/bill-math.test.ts` (add `billTotals`)
- Modify: `apps/master/src/main/server/services/billing.service.ts` (whole body)
- Modify: `apps/master/src/main/server/app.ts:7, 34`, `apps/master/src/main/server/lib/errors.ts:35-36`
- Modify: `apps/master/src/main/server/services/order.service.ts:739-741, 777, 802, 834`, `apps/master/src/main/server/controllers/orders.controller.ts:46, 221`
- Modify: `apps/master/src/main/server/repositories/order.repo.ts:68, 211-236`
- Modify: `apps/master/src/main/server/services/print.service.ts:31-34`, `apps/master/src/main/server/printer/receipt-builder.ts:1, 4-8`
- Modify: `apps/master/src/main/server/services/settings.service.ts:44`, `apps/master/src/main/server/lib/money-input.ts:18-22`
- Modify: `apps/master/src/main/sqlite-bootstrap.ts:166`, `apps/master/prisma/seed.ts:119, 265-295`, `apps/master/e2e/seed-like-prod.ts:20`
- Modify: `apps/master/prisma/schema.prisma:165, 317, 336, 384-404`
- Create: `apps/master/prisma/migrations/20261002150000_drop_discount_presets/migration.sql`
- Create: `apps/master/e2e/18-discount-history.test.ts`
- Test: `apps/master/e2e/03-discount.test.ts:26-51` (the two preset tests)

**Interfaces:**
- Consumes: Task 2's `discountReason` column (the backfill target).
- Produces: `billTotals(lines, typedDiscount)`; `billingService.computeTotals(order, { discountAmount })`
  with no repository or settings read; `setApproval(id, approverId, tx)`. No `/api/discounts`, no
  `Discount` model, no `max_discount_amount`, no `DISCOUNT_CAP_EXCEEDED`.

- [ ] **Step 1: Write the failing unit tests for the bill**

Append to `apps/master/src/main/server/lib/bill-math.test.ts` (and add `billTotals` to its import):

```ts
describe('billTotals (money-model §3)', () => {
  const osh = (quantity: number, isCanceled = false) => ({ kind: 'FOOD' as const, unitPrice: 45000, quantity, isCanceled });
  const xizmat = (quantity: number) => ({ kind: 'SERVICE' as const, unitPrice: 5000, quantity, isCanceled: false });

  it('food 90 000 + Xizmat haqi 15 000 − Chegirma 10 000 = 95 000', () => {
    expect(billTotals([osh(2), xizmat(3)], 10000)).toEqual({ subtotal: 90000, discountAmount: 10000, serviceCharge: 15000, total: 95000 });
  });

  it('has no cap: 150 000 off 200 000 of food leaves 50 000 (D3)', () => {
    const food = [{ kind: 'FOOD' as const, unitPrice: 200000, quantity: 1, isCanceled: false }];
    expect(billTotals(food, 150000).total).toBe(50000);
  });

  it('stops at the food: Xizmat haqi is still owed on a comped meal', () => {
    const food = [{ kind: 'FOOD' as const, unitPrice: 100000, quantity: 1, isCanceled: false }];
    expect(billTotals([...food, { kind: 'SERVICE' as const, unitPrice: 6000, quantity: 1, isCanceled: false }], 150000))
      .toEqual({ subtotal: 100000, discountAmount: 100000, serviceCharge: 6000, total: 6000 });
  });

  it('does not bill a cancelled line', () => {
    expect(billTotals([osh(1), osh(3, true)], null).total).toBe(45000);
  });

  it('refuses a negative discount', () => {
    expect(() => billTotals([osh(1)], -5000)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }));
  });
});
```

- [ ] **Step 2: Rewrite the preset e2e tests**

In `03-discount.test.ts`, replace the tests `control: a preset above "Maksimal" (100 000) cannot be
created` and `[PRD 14 G3] a preset must be whole so'm` with:

```ts
  it('[D3] the presets are gone: /api/discounts answers 404', async () => {
    const list = await w.admin.call('GET', '/api/discounts');
    const create = await w.admin.call('POST', '/api/discounts', { name: 'Katta', value: 150000 });
    expect({ list: list.status, create: create.status }).toEqual({ list: 404, create: 404 });
  });

  it('[D3] "Maksimal" is gone: no setting carries it and the owner cannot set it', async () => {
    const settings = await w.owner.get('/api/settings');
    const set = await w.owner.call('PATCH', '/api/settings', { key: 'max_discount_amount', value: '1' });
    expect({ listed: 'max_discount_amount' in settings, set: set.status }).toEqual({ listed: false, set: 403 });
  });

  it("[PRD 14 G3] a typed discount is whole so'm: a negative or fractional one is refused", async () => {
    const id = await sentOrder([[w.items.osh, 1]]); // 45 000
    const negative = await w.admin.call('POST', `/api/orders/${id}/confirm`, {
      discountAmount: -5000, discountReason: 'Xato', payments: [{ method: 'CASH', amount: 50000 }],
    });
    const fractional = await w.admin.call('POST', `/api/orders/${id}/confirm`, {
      discountAmount: 2500.5, discountReason: 'Xato', payments: [{ method: 'CASH', amount: 42500 }],
    });
    const order = await env.prisma.order.findUniqueOrThrow({ where: { id } });
    expect({ negative: negative.status, code: negative.body?.error?.code, fractional: fractional.status, status: order.status })
      .toEqual({ negative: 400, code: 'VALIDATION', fractional: 400, status: 'SENT' });
  });
```

Delete `n` from the harness import if no test uses it any more.

- [ ] **Step 3: Write the migration's regression test**

Create `apps/master/e2e/18-discount-history.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// A till that used discount presets keeps what its bills said (money rules D3).
// Builds a database at the migration before drop_discount_presets, plants a
// preset and the bills that used it, then applies that one migration.
// Every INSERT names its columns, so a column a later-sorting-earlier migration
// adds with a default (P1's OrderLine.countedQty) is filled by that default.
import { execSync } from 'child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const APP = join(__dirname, '..');
const MIGRATIONS = join(APP, 'prisma', 'migrations');
const DATA = join(__dirname, '.data');
const DB = join(DATA, 't-discount-history.db');
const URL = `file:${DB}`;

const run = (file: string) =>
  execSync(`pnpm exec prisma db execute --url "${URL}" --file "${file}"`, { cwd: APP, stdio: 'pipe' });

const PLANT = `
INSERT INTO "User" ("id", "fullName", "role", "updatedAt") VALUES ('u-owner', 'Owner', 'OWNER', CURRENT_TIMESTAMP);
INSERT INTO "Discount" ("id", "name", "value", "isActive", "createdById", "updatedAt")
  VALUES ('d-vip', 'Doimiy mijoz chegirmasi', 10000, 1, 'u-owner', CURRENT_TIMESTAMP);
INSERT INTO "Order" ("id", "orderType", "status", "waiterId", "subtotalSnapshot", "discountAmountSnapshot",
  "serviceChargeSnapshot", "totalSnapshot", "appliedDiscountId", "discountReason", "closedAt", "updatedAt") VALUES
  ('o-preset', 'TAKEAWAY', 'CLOSED', 'u-owner', 90000, 10000, 0, 80000, 'd-vip', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('o-typed', 'TAKEAWAY', 'CLOSED', 'u-owner', 45000, 5000, 0, 40000, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('o-both', 'TAKEAWAY', 'CLOSED', 'u-owner', 45000, 5000, 0, 40000, 'd-vip', 'Tug''ilgan kun', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES
  ('max_discount_amount', '100000', CURRENT_TIMESTAMP), ('alert_discount_threshold', '50000', CURRENT_TIMESTAMP);
INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "metadata")
  VALUES ('a-1', 'u-owner', 'DISCOUNT_CREATED', 'Discount', 'd-vip', '{"name":"Doimiy mijoz chegirmasi","value":10000}');
INSERT INTO "Category" ("id", "name", "updatedAt") VALUES ('c-1', 'Taomlar', CURRENT_TIMESTAMP);
INSERT INTO "MenuItem" ("id", "categoryId", "name", "price", "updatedAt") VALUES ('m-osh', 'c-1', 'Osh', 45000, CURRENT_TIMESTAMP);
INSERT INTO "OrderLine" ("id", "orderId", "menuItemId", "nameSnapshot", "unitPriceSnapshot", "quantity", "updatedAt") VALUES
  ('l-both', 'o-both', 'm-osh', 'Osh', 45000, 1, CURRENT_TIMESTAMP),
  ('l-preset', 'o-preset', 'm-osh', 'Osh', 45000, 2, CURRENT_TIMESTAMP),
  ('l-typed', 'o-typed', 'm-osh', 'Osh', 45000, 1, CURRENT_TIMESTAMP);
`;

let prisma: PrismaClient;

beforeAll(() => {
  mkdirSync(DATA, { recursive: true });
  rmSync(DB, { force: true });
  const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const drop = dirs.find((d) => d.endsWith('_drop_discount_presets'));
  if (!drop) throw new Error('drop_discount_presets migration not found');
  for (const dir of dirs.slice(0, dirs.indexOf(drop))) run(join(MIGRATIONS, dir, 'migration.sql'));
  const plant = join(DATA, 'discount-history-plant.sql');
  writeFileSync(plant, PLANT);
  run(plant);
  run(join(MIGRATIONS, drop, 'migration.sql'));
  prisma = new PrismaClient({ datasources: { db: { url: URL } } });
});
afterAll(async () => {
  await prisma?.$disconnect();
});

describe('Bills from before 2026-10-02 (drop_discount_presets)', () => {
  it("a bill closed against a preset keeps the preset's name as its reason, and its amounts", async () => {
    const rows = await prisma.order.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((o) => [o.id, o.discountReason, Number(o.discountAmountSnapshot), Number(o.totalSnapshot)])).toEqual([
      ['o-both', "Tug'ilgan kun", 5000, 40000],
      ['o-preset', 'Doimiy mijoz chegirmasi', 10000, 80000],
      ['o-typed', null, 5000, 40000],
    ]);
  });

  it('the presets, the link and Maksimal are gone; the Order indexes, its lines and the audit trail stay', async () => {
    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Discount'`,
    );
    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("Order")`);
    const indexes = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'Order' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const audit = await prisma.auditLog.findMany({ where: { action: 'DISCOUNT_CREATED' } });
    // Raw, so the check does not depend on which OrderLine columns this build's client knows.
    // OrderLine cascades on Order: the rebuild drops "Order" with foreign keys off, and a line
    // lost here means that PRAGMA did not take effect.
    const lines = await prisma.$queryRawUnsafe<Array<{ id: string; orderId: string }>>(
      `SELECT "id", "orderId" FROM "OrderLine" ORDER BY "id"`,
    );
    const broken = await prisma.$queryRawUnsafe<unknown[]>(`PRAGMA foreign_key_check`);
    expect({
      discountTable: tables.length,
      link: columns.some((c) => c.name === 'appliedDiscountId'),
      indexes: indexes.map((i) => i.name),
      settings: settings.map((s) => s.key),
      audit: (audit[0]?.metadata as any)?.name,
      lines: lines.map((l) => `${l.id}:${l.orderId}`),
      broken: broken.length,
    }).toEqual({
      discountTable: 0,
      link: false,
      indexes: ['Order_closedAt_idx', 'Order_createdAt_idx', 'Order_sentAt_idx', 'Order_status_idx', 'Order_tableId_idx', 'Order_waiterId_idx'],
      settings: ['alert_discount_threshold'],
      audit: 'Doimiy mijoz chegirmasi',
      lines: ['l-both:o-both', 'l-preset:o-preset', 'l-typed:o-typed'],
      broken: 0,
    });
  });
});
```

Every migration that sorts before `20261002150000_drop_discount_presets` builds the "pre-migration
database". P7 merges first, so while it is being built that is only the migrations already on the
base plus `20261002140000_order_discount_reason`. Once P1 merges, P1's `20261002120000` and
`20261002130000` sort before it too, and `OrderLine` then has `countedQty INTEGER NOT NULL DEFAULT 0`.
The plant names its columns and leaves `countedQty` out, so the default fills it and the same
`PLANT` works before and after P1. If a later migration that sorts earlier adds a NOT NULL column
with no default to a planted table, add that column to the `PLANT` row.

- [ ] **Step 4: Run them to verify they fail**

```bash
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run src/main/server/lib/bill-math.test.ts 2>&1 | grep -E '×|Tests'
docker exec -e NO_COLOR=1 -w /app/apps/master CONTAINER pnpm exec vitest run --config vitest.e2e.config.ts e2e/03-discount.test.ts e2e/18-discount-history.test.ts 2>&1 | grep -E '×|Tests'
```

Expected: the unit file fails to compile (`billTotals` is not exported). In e2e: `/api/discounts`
answers 200 and 201; `max_discount_amount` is listed and settable; `18-discount-history` throws
`drop_discount_presets migration not found`. The G3 typed-discount test already passes (zod refuses
both) and pins it.

- [ ] **Step 5: `billTotals`**

Append to `bill-math.ts`:

```ts
export type BillLine = {
  kind: 'FOOD' | 'SERVICE';
  unitPrice: number;
  quantity: number;
  isCanceled: boolean;
};

/**
 * The bill (money-model §3, money rules D3):
 *
 *   subtotal = Σ qty × price over FOOD lines   Xizmat haqi is the waiter's pay, never discounted
 *   discount = min(typed, subtotal)            no cap: the "Maksimal" setting is gone
 *   total    = subtotal − discount + Xizmat haqi
 *
 * A discount larger than the food stops at the food, so a fully comped meal
 * still owes Xizmat haqi (money-model D1).
 */
export function billTotals(lines: BillLine[], typedDiscount: number | null | undefined) {
  const active = lines.filter((line) => !line.isCanceled);
  const sum = (kind: BillLine['kind']) =>
    active
      .filter((line) => line.kind === kind)
      .reduce((total, line) => total + line.unitPrice * line.quantity, 0);

  const subtotal = sum('FOOD');
  const serviceCharge = sum('SERVICE');
  const typed = typedDiscount ?? 0;
  if (typed < 0) {
    throw Errors.Validation("Chegirma manfiy bo'lishi mumkin emas");
  }
  const discountAmount = Math.min(typed, subtotal);

  return { subtotal, discountAmount, serviceCharge, total: subtotal - discountAmount + serviceCharge };
}
```

- [ ] **Step 6: Billing without presets**

Replace the body of `billing.service.ts` from `function decimalToInt` to the end with a version
that keeps `decimalToInt` and `toDecimal`, drops the `discountRepo` and `settingsService` imports,
and computes through `billTotals`:

```ts
export const billingService = {
  /**
   * The bill as Decimals, from the order's lines and the typed discount. Reads
   * nothing else — no preset, no setting — so it can run inside a transaction
   * without a client of its own.
   */
  async computeTotals(order: OrderForBilling, opts: { discountAmount?: number | string | null }) {
    const totals = billTotals(
      order.lines.map((line) => ({
        kind: line.menuItem.kind === MenuItemKind.SERVICE ? 'SERVICE' : 'FOOD',
        unitPrice: decimalToInt(line.unitPriceSnapshot),
        quantity: line.quantity,
        isCanceled: line.isCanceled,
      })),
      opts.discountAmount === undefined || opts.discountAmount === null ? null : decimalToInt(opts.discountAmount),
    );
    return {
      subtotal: toDecimal(totals.subtotal),
      discountAmount: toDecimal(totals.discountAmount),
      serviceCharge: toDecimal(totals.serviceCharge),
      total: toDecimal(totals.total),
    };
  },
};
```

Rewrite the module comment at the top to the three-line formula of `billTotals` plus "Service
charge comes from SERVICE lines; there is no setting, no preset and no cap (money rules D3)."

- [ ] **Step 7: Remove the preset path everywhere**

- Delete the four server files listed above.
- `app.ts`: delete the `discountsRouter` import and `app.use('/api/discounts', …)`.
- `errors.ts`: delete `DiscountCapExceeded`.
- `orders.controller.ts`: delete `discountId: z.string().min(1).nullable().optional(),` and
  `discountId: body.discountId ?? null,`.
- `order.service.ts` `confirm`: delete the `discountId` input and its comment, the `discountId:`
  option to `computeTotals`, the `input.discountId ?? null,` argument to `setApproval`, and the
  `discountId:` audit key.
- `order.repo.ts`: delete `appliedDiscount: true,` from `findByIdWithDetails`; `setApproval`
  becomes `(id, approverId, tx?)` and writes only `approvedAt` and `approvedBy`.
- `print.service.ts`: delete `appliedDiscount` from `PrintableOrder`.
- `receipt-builder.ts`: drop `Discount` from the type import and `appliedDiscount` from
  `OrderForReceipt`. Nothing else in the file changes (D19 is P3's).
- `settings.service.ts`: delete `'max_discount_amount',` from `canEdit`.
- `money-input.ts`: the `somAmountOrZero` comment's last line becomes "a menu price, a typed
  discount."
- `sqlite-bootstrap.ts:166`, `e2e/seed-like-prod.ts:20`, `prisma/seed.ts:119`: delete the
  `max_discount_amount` setting. `prisma/seed.ts:265-295`: delete both `prisma.discount.upsert`
  calls.

- [ ] **Step 8: The schema and the migration**

In `schema.prisma`: delete `appliedDiscountId String?` and the `appliedDiscount` relation from
`Order`, `discountsCreated` from `User`, and `model Discount` with its section comment
(`// DISCOUNTS, PAYMENTS` becomes `// PAYMENTS`). Then create the migration without applying it:

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev --create-only --name drop_discount_presets
```

Rename the created folder to `20261002150000_drop_discount_presets`.

Replace the generated `migration.sql` with the SQL below. Keep Prisma's own `CREATE TABLE
"new_Order"` column list and constraints if they differ from these in anything but order — the
check in Step 9 decides. What must hold: the backfill and the setting delete run before the
rebuild; `Discount` is dropped after it (Prisma may emit `DROP TABLE "Discount"` first, which
would break the backfill); all six indexes are recreated.

```sql
/*
  Drops the discount presets (money rules D3): the Discount table, Order.appliedDiscountId
  and the max_discount_amount setting. A discount is now typed on the ticket, uncapped, and
  carries its own reason.

  A bill closed against a preset gets the preset's name as its discountReason, unless it
  already has a reason, so nothing a screen or a report could show is lost. Amounts are not
  touched. DISCOUNT_* audit rows keep their own copy of the name.
*/

UPDATE "Order"
SET "discountReason" = (SELECT "name" FROM "Discount" WHERE "Discount"."id" = "Order"."appliedDiscountId")
WHERE "appliedDiscountId" IS NOT NULL AND "discountReason" IS NULL;

DELETE FROM "Setting" WHERE "key" = 'max_discount_amount';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tableId" TEXT,
    "waiterId" TEXT NOT NULL,
    "subtotalSnapshot" DECIMAL,
    "discountAmountSnapshot" DECIMAL,
    "discountReason" TEXT,
    "serviceChargeSnapshot" DECIMAL,
    "serviceChargeWaived" BOOLEAN NOT NULL DEFAULT false,
    "totalSnapshot" DECIMAL,
    "sentAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "closedAt" DATETIME,
    "canceledAt" DATETIME,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("approvedAt", "approvedById", "cancelReason", "canceledAt", "closedAt", "createdAt", "discountAmountSnapshot", "discountReason", "id", "orderType", "sentAt", "serviceChargeSnapshot", "serviceChargeWaived", "status", "subtotalSnapshot", "tableId", "totalSnapshot", "updatedAt", "waiterId")
SELECT "approvedAt", "approvedById", "cancelReason", "canceledAt", "closedAt", "createdAt", "discountAmountSnapshot", "discountReason", "id", "orderType", "sentAt", "serviceChargeSnapshot", "serviceChargeWaived", "status", "subtotalSnapshot", "tableId", "totalSnapshot", "updatedAt", "waiterId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_waiterId_idx" ON "Order"("waiterId");
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_closedAt_idx" ON "Order"("closedAt");
CREATE INDEX "Order_sentAt_idx" ON "Order"("sentAt");
DROP TABLE "Discount";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
```

The packaged till applies this through `sqlite-bootstrap.ts`'s in-process migrator (`db.exec`),
the same way it applied `20260814120000_drop_walkout`, which rebuilt `Order` the same way.

- [ ] **Step 9: Apply it and prove the schema matches**

```bash
docker exec -w /app/apps/master CONTAINER pnpm exec prisma migrate dev
docker exec -w /app/apps/master CONTAINER bash -lc 'rm -f /tmp/p7-shadow.db && pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:/tmp/p7-shadow.db --exit-code; echo "diff exit $?"'
```

Expected: the migration applies; `diff exit 0` (no difference between the migrations and the
schema). Exit 2 means the hand-written DDL drifted: take Prisma's column list from a fresh
`--create-only` and keep only the backfill, the setting delete and the `DROP TABLE` placement from
above.

- [ ] **Step 10: Check nothing still names a preset**

```bash
cd ~/dev/lab/project02-money/apps/master
grep -rn "discountRepo\|discountService\|discountsRouter\|appliedDiscount\|DiscountCapExceeded\|max_discount_amount\|prisma.discount\b\|discountId" src prisma/seed.ts e2e/seed-like-prod.ts
```

Expected: no output.

- [ ] **Step 11: Run the tests and the gates**

Expected: unit `bill-math.test.ts` 12 passed; `03-discount` all pass; `18-discount-history` 2
passed. Gates: e2e `35 failed | 77 passed (112)`; `Test Files  16 passed (16)`,
`Tests  161 passed (161)`; `pnpm typecheck` 47 or lower (record it); `0`; `0`.

- [ ] **Step 12: Commit**

```bash
cd ~/dev/lab/project02-money
git add -A apps/master/src/main apps/master/prisma apps/master/e2e
git status --short
git commit -m "feat(discount): remove the presets, the cap and the Discount table" -m "Money rules D3: a discount is typed, uncapped, with a reason. /api/discounts, the Discount model, Order.appliedDiscountId and max_discount_amount go; billing reads no preset and no setting. The migration carries each preset's name onto the bills that used it as their reason and keeps every Order index."
```

(`git status --short` before the commit: only files named in this task, and no `e2e/.data/`.)

---

### Task 9: A discount after Karta or Nasiya shrinks that leg

**Files:**
- Modify: `apps/master/src/renderer/lib/payment-legs.ts` (add `fitLegsToDue`), `apps/master/src/renderer/lib/payment-legs.test.ts`
- Modify: `apps/master/src/renderer/components/approval/OrderTicket.tsx:143-165` (the effect)
- Test: `apps/master/e2e/10-ticket-unit.test.ts:3-45`

**Interfaces:**
- Consumes: `Leg`, `addLeg`.
- Produces: `fitLegsToDue(legs: Leg[], due: number, balancingIndex: number): Leg[]` — returns
  `legs` itself when nothing moves.

- [ ] **Step 1: Write the failing unit tests**

Append to `payment-legs.test.ts` (and add `fitLegsToDue` to its import):

```ts
describe('fitLegsToDue (Money Map issue 16)', () => {
  it('a 20 000 discount after + Karta comes off the card: 106 000 → 86 000', () => {
    const legs: Leg[] = [cash(0), { method: 'CARD', amount: 106_000 }];
    expect(fitLegsToDue(legs, 86_000, 0)).toEqual([cash(0), { method: 'CARD', amount: 86_000 }]);
  });

  it('a drop the cash leg can absorb leaves a typed card amount alone', () => {
    const legs: Leg[] = [cash(30_000), { method: 'CARD', amount: 76_000 }];
    expect(fitLegsToDue(legs, 86_000, 0)).toEqual([cash(10_000), { method: 'CARD', amount: 76_000 }]);
  });

  it('takes the excess off the newest leg first: Nasiya, then Karta', () => {
    const legs: Leg[] = [cash(0), { method: 'CARD', amount: 50_000 }, { method: 'DEBT', amount: 56_000 }];
    expect(fitLegsToDue(legs, 26_000, 0)).toEqual([
      cash(0),
      { method: 'CARD', amount: 26_000 },
      { method: 'DEBT', amount: 0 },
    ]);
  });

  it('puts a rise back on the cash leg', () => {
    const legs: Leg[] = [cash(0), { method: 'CARD', amount: 86_000 }];
    expect(fitLegsToDue(legs, 106_000, 0)).toEqual([cash(20_000), { method: 'CARD', amount: 86_000 }]);
  });

  it('returns the same array when nothing moves, so a state update can bail out', () => {
    const legs: Leg[] = [cash(20_000), { method: 'CARD', amount: 86_000 }];
    expect(fitLegsToDue(legs, 106_000, 0)).toBe(legs);
  });
});
```

- [ ] **Step 2: Point the e2e mirror at it, and add the Nasiya case**

In `e2e/10-ticket-unit.test.ts`: import `{ addLeg, fitLegsToDue, type Leg }`; the doc comment
becomes "Mirrors OrderTicket.tsx: `due` and the effect that fits the legs to it whenever `due`
changes (`fitLegsToDue`). The seeded CASH leg (index 0) is the balancing leg."; the mirror's
`rebalance` body becomes `legs = fitLegsToDue(legs, due(), balancingIndex);`; the mirror gains
`addNasiya() { legs = addLeg(legs, 'DEBT', due(), balancingIndex); },`; after the `[issue 16]`
test add:

```ts
  it('[issue 16] + Nasiya first, then a discount — the debt is what is owed, not more', () => {
    const t = ticket(100000, 6000);
    t.addNasiya();
    t.setDiscount(20000);
    const s = t.state();
    expect({ balanced: s.balanced, legs: s.legs }).toEqual({
      balanced: true,
      legs: [{ method: 'CASH', amount: 0 }, { method: 'DEBT', amount: 86000 }],
    });
  });
```

- [ ] **Step 3: Run them to verify they fail**

Expected: the unit file fails to compile (`fitLegsToDue` is not exported); the e2e file fails the
same way.

- [ ] **Step 4: `fitLegsToDue`**

Append to `payment-legs.ts`:

```ts
/**
 * Fit the legs to a new `due` — what the ticket does when a discount is typed
 * or changed. A rise goes onto the balancing leg. A fall comes off the
 * balancing leg first; what it cannot absorb comes off the other legs, newest
 * first. Before this, a discount typed after `+ Karta` or `+ Nasiya` left those
 * legs at the old total: the bill read overpaid and TASDIQLASH stayed disabled
 * with nothing to say why (Money Map issue 16).
 *
 * Returns `legs` itself when no amount moves.
 */
export function fitLegsToDue(legs: Leg[], due: number, balancingIndex: number): Leg[] {
  const others = legs.reduce(
    (sum, leg, index) => (index === balancingIndex ? sum : sum + leg.amount),
    0,
  );
  const amounts = legs.map((leg, index) =>
    index === balancingIndex ? Math.max(due - others, 0) : leg.amount,
  );
  let excess = Math.max(others - due, 0);
  for (let index = amounts.length - 1; index >= 0 && excess > 0; index -= 1) {
    if (index === balancingIndex) continue;
    const amount = amounts[index] ?? 0;
    const cut = Math.min(amount, excess);
    amounts[index] = amount - cut;
    excess -= cut;
  }
  if (amounts.every((amount, index) => amount === legs[index]?.amount)) return legs;
  return legs.map((leg, index) => ({ ...leg, amount: amounts[index] ?? leg.amount }));
}
```

- [ ] **Step 5: The ticket uses it**

In `OrderTicket.tsx`, replace the effect body (`:151-165`) with

```ts
  useEffect(() => {
    setLegs((current) => fitLegsToDue(current, due, balancingIndex));
  }, [due, balancingIndex]);
```

and replace the comment above it (`:143-150`) with: "When `due` moves — a discount typed or
changed — the legs follow it: a rise lands on Naqd, a fall comes off Naqd and then off the newest
other leg (`fitLegsToDue`, Money Map issue 16)."

- [ ] **Step 6: Run the tests and the gates**

Expected: 5 unit and both `[issue 16]` e2e tests pass. Gates: e2e `34 failed | 79 passed (113)`;
`Test Files  16 passed (16)`, `Tests  166 passed (166)`; typecheck at the Task 8 number; `0`; `0`.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/lab/project02-money
git add apps/master/src/renderer/lib/payment-legs.ts apps/master/src/renderer/lib/payment-legs.test.ts apps/master/src/renderer/components/approval/OrderTicket.tsx apps/master/e2e/10-ticket-unit.test.ts
git commit -m "fix(ticket): a discount after Karta or Nasiya shrinks that leg" -m "Money rules §4 (16). The ticket re-balanced only the cash leg, so a discount typed after + Karta or + Nasiya left the bill overpaid and TASDIQLASH disabled. The fall now comes off the newest other leg once Naqd is at 0."
```

---

### Task 10: Olindi and Qaytim

**Files:**
- Create: `apps/master/src/renderer/lib/cash-change.ts`, `apps/master/src/renderer/lib/cash-change.test.ts`
- Modify: `apps/master/src/renderer/components/approval/OrderTicket.tsx` — `Editing`, state, `editingValue`/`editingLabel` (`:184-196`), `setEditingValue` (`:200-209`), the amount editor (`:346-376`), the legs map (`:411-439`)

**Interfaces:**
- Consumes: `AmountField`, `MoneyField`, the `showPad` toggle (hotfix Task 4).
- Produces: `cashChange(received: number, cash: number): CashChange` where
  `CashChange = { kind: 'none' } | { kind: 'change'; amount: number } | { kind: 'short'; amount: number }`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/master/src/renderer/lib/cash-change.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { cashChange } from './cash-change';

describe('cashChange (money rules D20)', () => {
  it('100 000 handed over for 95 000 in cash: Qaytim 5 000', () => {
    expect(cashChange(100_000, 95_000)).toEqual({ kind: 'change', amount: 5_000 });
  });

  it('the exact amount: Qaytim 0', () => {
    expect(cashChange(95_000, 95_000)).toEqual({ kind: 'change', amount: 0 });
  });

  it('90 000 for 95 000: 5 000 short', () => {
    expect(cashChange(90_000, 95_000)).toEqual({ kind: 'short', amount: 5_000 });
  });

  it('nothing typed: nothing to show', () => {
    expect(cashChange(0, 95_000)).toEqual({ kind: 'none' });
  });

  it('counts against the Naqd leg only: 50 000 for a 30 000 Naqd leg of a mixed bill', () => {
    expect(cashChange(50_000, 30_000)).toEqual({ kind: 'change', amount: 20_000 });
  });
});
```

Run it; expected: `Failed to resolve import "./cash-change"`.

- [ ] **Step 2: `cash-change.ts`**

```ts
export type CashChange =
  | { kind: 'none' }
  | { kind: 'change'; amount: number }
  | { kind: 'short'; amount: number };

/**
 * Qaytim = Olindi − Naqd (money rules D20): what the admin hands back from the
 * cash the customer gave. Display only — never sent, stored or printed, and it
 * never blocks Tasdiqlash. Counted against the Naqd leg alone, so a mixed bill
 * gives change only on its cash part.
 */
export function cashChange(received: number, cash: number): CashChange {
  if (received <= 0) return { kind: 'none' };
  const difference = received - cash;
  return difference >= 0
    ? { kind: 'change', amount: difference }
    : { kind: 'short', amount: -difference };
}
```

- [ ] **Step 3: The ticket**

In `OrderTicket.tsx`:

1. `Editing`: add `| { kind: 'received' }`. State: `const [received, setReceived] = useState(0);`.
2. Derived: `const cashLeg = legs.find((leg) => leg.method === 'CASH');` and
   `const change = cashChange(received, cashLeg?.amount ?? 0);`.
3. `editingValue`: `editing?.kind === 'received' ? received : …`; `editingLabel`:
   `editing?.kind === 'received' ? 'Olindi' : …`; `setEditingValue`: when
   `editing.kind === 'received'`, `setReceived(next)` and return.
4. In the amount editor, between `AmountField` and the `Raqam paneli` button:

```tsx
          {editing.kind === 'received' && change.kind !== 'none' ? (
            <MoneyField
              size="compact"
              tone={change.kind === 'change' ? 'settled' : 'owed'}
              label={change.kind === 'change' ? 'Qaytim' : 'Yetmaydi'}
              value={formatMoney(change.amount)}
              unit="so'm"
              className="shrink-0"
            />
          ) : null}
```

5. In the legs map, after a CASH leg's row wrapper, while its amount is above 0:

```tsx
            {leg.method === 'CASH' && leg.amount > 0 ? (
              <Row columns="1fr 1fr" onClick={() => setEditing({ kind: 'received' })}>
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[13px] text-muted-foreground">Olindi</span>
                  <span className="text-[17px] font-semibold tabular-nums">{received > 0 ? formatMoney(received) : '—'}</span>
                </span>
                {change.kind === 'none' ? <span /> : (
                  <span className={cn('flex min-w-0 items-baseline justify-end gap-2', change.kind === 'short' && 'text-owed')}>
                    <span className="text-[13px]">{change.kind === 'change' ? 'Qaytim' : 'Yetmaydi'}</span>
                    <span className="text-[17px] font-semibold tabular-nums">{formatMoney(change.amount)}</span>
                  </span>
                )}
              </Row>
            ) : null}
```

   The map now returns a fragment keyed `${leg.method}-${index}` holding the existing wrapper and
   this row.
6. Removing the CASH leg (the `×` handler) also calls `setReceived(0)`.
7. `submit` sends nothing new: Olindi is not part of `ConfirmBody`.

- [ ] **Step 4: Browser pass at 1236 × 623**

This needs host ports 4020 and 5199 to itself; ask the orchestrator before starting if another
package's container may hold them.

```bash
docker exec -w /app/apps/master CONTAINER bash -lc 'rm -f e2e/.data/server.db && pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts'
docker exec -d -w /app/apps/master CONTAINER pnpm exec tsx scripts/serve-headless.ts
docker exec -d -w /app/apps/master CONTAINER pnpm exec vite --config vite.e2e.config.ts
docker exec -w /app/apps/master CONTAINER pnpm exec tsx e2e/seed-ui-day.ts
```

Open `http://localhost:5199` in Chrome with the window's viewport at 1236 × 623, log in as
`admin` / `admin123`, open Tasdiqlash and the open bill. Check, and record each result in the
handover:

1. Chegirma 20 000 → Enter → the reason field opens; TASDIQLASH disabled with
   `Chegirma sababini yozing` in the foot; type `Doimiy mijoz`, Enter → Sabab shows it, TASDIQLASH
   enabled.
2. `+ Karta` first, then Chegirma 20 000: the card leg drops by 20 000, no Farq, TASDIQLASH enabled.
3. Naqd only: tap Olindi, type `100000` on the keyboard, Enter → `Qaytim` with the right amount; then
   turn on `Raqam paneli` and edit with the pad: the pad's bottom row (`0`, backspace) is reachable.
4. Worst case — Chegirma + Sabab + Naqd + Olindi + Karta + Nasiya + Qarzdor: To'lanadi and
   TASDIQLASH visible; every row reachable by scrolling the stack; while editing Olindi its label
   and field are visible without scrolling.
5. Nothing in the panel needs a hover; every tappable row is 48 px.

If 4 fails, raise the editors' `min-h` floor or move rows, then repeat 1–5. Stop the two
background processes afterwards:
`docker exec CONTAINER bash -lc "pkill -f serve-headless; pkill -f 'vite --config'"` (run the
`pkill` through `bash -lc` with a pattern that does not match the `bash` command itself — a bare
`pkill -f` inside `docker exec` can kill its own shell).

- [ ] **Step 5: Gates**

Expected: e2e `34 failed | 79 passed (113)`; `Test Files  17 passed (17)`,
`Tests  171 passed (171)`; typecheck at the Task 8 number; `0`; `0`.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/lab/project02-money
git add apps/master/src/renderer/lib/cash-change.ts apps/master/src/renderer/lib/cash-change.test.ts apps/master/src/renderer/components/approval/OrderTicket.tsx
git commit -m "feat(ticket): Olindi beside Naqd shows the Qaytim" -m "Money rules D20. An optional amount the customer handed over, typed or tapped, shows the change against the Naqd leg, or how much is short. It is never sent, stored or printed, and never blocks Tasdiqlash."
```

---

### Task 11: Documents and handover

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md` — §2 (`:57-59`, `:75-104`, `:106-135`, `:137-153`), §3 (`:160`), §6 (`:326`, `:328`), §9 (`:449-450`), §11 (`:520-523` #2, `:575-576` #12), §13 (a new dated entry)
- Modify: `docs/superpowers/specs/2026-09-30-money-rules-design.md` §4 (`:188`, `:192`), §5 (`:204-205`)
- Modify: `docs/superpowers/specs/2026-08-14-money-model-design.md:3` (status)

**Interfaces:**
- Consumes: Tasks 2–10.
- Produces: documents that match the code, and the handover.

- [ ] **Step 1: CURRENT_WORKFLOW.md**

Re-read each cited range first (other wave-1 packages edit the same file; match by text, not line).

- §2 intro (`:57-59`): "or as a full discount" → "or as a full discount with a reason".
- §2 "Confirm, step by step": after `billingService.computeTotals` insert "→ require a non-blank
  `discountReason` when the discount given is above 0 (400 `VALIDATION`, `Chegirma sababini
  yozing`)"; in the transaction list, the snapshot write also stores `discountReason`; the
  `ORDER_CONFIRMED` audit carries it; the large-discount alert names the reason and the confirming
  admin (`approvedBy`). `waiveServiceCharge` and `discountId` are no longer read.
- §2 "Bill math": replace the formula block's discount line with
  `discount      = min(typed so'm amount, subtotal)   — no cap, no preset (money rules D3)`; point
  the heading at `lib/bill-math.ts` (`billTotals`) and `billing.service.ts`; replace the
  `serviceChargeWaived` sentences with "`Order.serviceChargeWaived` survives for historical bills;
  confirm no longer accepts a waiver (money rules §4 (38)), so Xizmat haqi is always charged";
  replace the paragraph from "**A discount is always a whole so'm amount.**" through "…or the page
  should go." with:

```markdown
**A discount is a typed whole so'm amount with a reason** (money rules D3, built on
`feat/money-rules`). There is no cap and no preset: `max_discount_amount`, the `Discount` table,
`Order.appliedDiscountId`, `/api/discounts` and the Chegirmalar page are gone (migration
`20261002150000_drop_discount_presets`; a bill closed against a preset got the preset's name as its
reason). Confirm refuses a discount above 0 without a non-blank `discountReason` (at most 200
characters), stores it on `Order.discountReason`, and Buyurtmalar and Hisobot show it under the
amount; the receipt does not. The large-discount alert (`alert_discount_threshold`, 50 000) carries the reason
and who gave it.
```

  and add after the Payments paragraph: "On the ticket a discount typed after a Karta or Nasiya leg
  comes off the newest such leg once Naqd is at 0 (`fitLegsToDue`). An optional **Olindi** beside
  Naqd shows **Qaytim** = Olindi − Naqd (`cashChange`); it is display only — never sent, stored or
  printed (D20)."
- §2 "Closing an unpaid order": TASDIQLASH's blockers (`confirmBlocker`, `lib/ticket-gate.ts`) —
  a missing reason and a missing debtor — show in the foot beside the button.
- §3 ADMIN row: "discounts CRUD" → delete.
- §6: drop `/discounts` from the row; recount the error codes in `lib/errors.ts` and correct
  "(20 codes)".
- §9 Telegram: "large discount" → "large discount (with its reason and who gave it)".
- §11 #2: do **not** renumber (P1 and P2 edit §11 in the same wave). Replace the entry's body with
  "**Closed by decision (money rules D3), `feat/money-rules` P7.** There is no cap to bypass: the
  presets and `max_discount_amount` are deleted, and every discount carries a mandatory reason.
  Remove this entry at the next renumbering pass." In #12 delete the sentence about the
  maximum-discount value.
- §13: add a dated entry (2026-10-02, P7) saying what changed above and that #2 awaits removal.

- [ ] **Step 2: The money rules**

In `2026-09-30-money-rules-design.md` §5 replace the `03-discount.test.ts` bullet with:

```markdown
- `03-discount.test.ts`: "a typed discount above Maksimal is refused" and "a preset above
  Maksimal cannot be created" are withdrawn (D3). The reason test stays. **Done (P7):** replaced by
  "there is no cap", "the presets are gone", "Maksimal is gone", the whole-so'm typed-discount
  test, and tests that the reason is stored, audited, alerted with its giver and listed on
  Hisobot. `11-extras` `[issue 38]` now asserts the waiver is gone; `10-ticket-unit` `[issue 16]`
  passes; `18-discount-history` pins the preset migration.
```

In §4 append " — built (P7)." to the (16) line and the (38) line.

- [ ] **Step 3: The money model**

In `2026-08-14-money-model-design.md:3` append to the status: "; slice 2 (discount) built on
`feat/money-rules` 2026-10-02 as P7 of the money rules, with the waive switch of §9".

- [ ] **Step 4: Final verification**

Run the five gates. Expected: e2e `Tests  34 failed | 79 passed (113)`;
`Test Files  17 passed (17)`, `Tests  171 passed (171)`; `pnpm typecheck` at or below 47 (the
Task 8 number); `0`; `0`. None of the 34 failures is in `03-discount`, `10-ticket-unit`
`[issue 16]`, `11-extras` `[issue 38]` or `18-discount-history`.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/lab/project02-money
git add docs/CURRENT_WORKFLOW.md docs/superpowers/specs/2026-09-30-money-rules-design.md docs/superpowers/specs/2026-08-14-money-model-design.md
git commit -m "docs: discount with a reason, no presets, Qaytim (money rules D3, D20)"
```

- [ ] **Step 6: Hand over**

Stop at "ready to merge". Report: the branch and its commits, the final gate numbers, the Task 10
browser results, the typecheck floor if it dropped, and the merge notes below. Nothing reaches a
till until the update feed is restored and a version is cut (STATE items 4–5).

---

## Risks for the merge

**Wave 1 merge order: P7 (this package) first, then P1, then P2.** This package merges as built.
The rebases below belong to P1 and P2. They are written here so the rebasing worker knows what
this package expects to survive.

- **`order.service.ts` `confirm` — P1 (guards-2) rebases its confirm transaction onto this
  package** (PRD 14 §10: totals and payment checks from a re-read inside the transaction, after
  the claim). This package owns the confirm input (`discountReason` in; `discountId`,
  `waiveServiceCharge` out), the reason check, `applyTotals` with the reason, `setApproval(id,
  approverId, tx)`, the audit metadata and the alert's `reason` and `givenBy`. P1 owns the shape
  of the transaction. On rebase, P1 keeps its one in-transaction re-read `current` and its
  recompute, calling `computeTotals(current, { discountAmount: input.discountAmount ?? null })`
  with no `tx`. It runs `discountReasonFor` against those in-transaction totals and keeps this
  package's fast-path check for the early 400. It adds no second read for `approvedBy`: `givenBy`
  comes from `closed`, confirm's existing final read (Task 4 Step 5 says why `current` cannot
  supply it).
- **`billing.service.ts`, `order.repo.ts`** — P1 takes this package's `billing.service.ts` whole
  and drops its own `tx` parameter. Its `discountRepo.findById(…, tx)` branch no longer exists,
  and `computeTotals` reads nothing. The `order.repo.ts` edits are in different functions (P1:
  `holdIfOpen` and the CANCELED lists; P7: `applyTotals`, `setApproval` and the
  `findByIdWithDetails` include). `lib/errors.ts`: P1 adds three errors after this package has
  removed `DiscountCapExceeded`.
- **Migrations** — the names are pinned: P1 `20261002120000_order_line_audit_actions` and
  `20261002130000_order_line_counted_qty`, then this package's
  `20261002140000_order_discount_reason` and `20261002150000_drop_discount_presets`. P1's
  migrations merge after this package's but sort before them. That is safe: `sqlite-bootstrap.ts`
  records each migration by id, a till receives all four at once, and a dev database that already
  applied P7's two gets P1's two as pending. Neither of P1's migrations rebuilds `Order`;
  `20261002130000` adds `OrderLine.countedQty` with a default. After P1 merges, re-run Task 8 Step 9's `migrate diff --exit-code` on a fresh database, and run
  `18-discount-history`: its pre-migration database now includes `countedQty`, and the explicit
  column lists in `PLANT` let the default fill it.
- **E2e confirms in later packages** — any e2e confirm with `discountAmount` above 0 must send
  `discountReason`, or it gets 400 `VALIDATION`. As written, the plans' one such call is P5's
  `16-day-close` sale (`2026-10-02-money-day-close.md:766`, `discountAmount: 6000`); P5's amendment
  covers it. A package that adds another one sends a reason with it.
- **Shared e2e files** — `07-day.test.ts:45` (P2 moves days to the 05:00 boundary),
  `14-forensics.test.ts:87-88`, `seed-ui-day.ts:55`, `01-bill.test.ts` (P1 T11) and
  `11-extras.test.ts` (P1 T7/T12): this package only adds `discountReason` to one body each in
  the first four and rewrites only `[issue 38]` in `11-extras`. P1 and P2, rebasing after it, keep
  both sides. The new e2e file is `18-discount-history`, not `16-`: P2's `16-trading-day` lands in
  the same wave.
- **`reports.service.ts`** — P2 changes its day ranges; this package touches only
  `buildOrdersTable` (`:114-135`).
- **Docs** — P1 and P2 also edit `CURRENT_WORKFLOW.md` §2/§6/§9/§11/§13 and money-rules §4/§5.
  §11 is deliberately not renumbered here; P2 renumbers it once, in its T8.
- **Ports** — the Task 10 browser pass binds host ports 4020 and 5199, as every package's e2e
  compose does; run it alone.
- **Data** — historical preset bills read the preset's name as their reason. This is a label, not
  money; amounts are untouched and `18-discount-history` pins it.

## Deferred, not in this package

- `debtSale` and `debtWriteOff` alerts interpolate typed names without escaping; `escapeHtml` now
  exists in `alert.service.ts` for P6 to use.
- `e2e/prod-forensics.ts` still says "No reason is recorded for any of them" of discounts; true for
  databases from before this build, and the diagnostic reads those.
- The success toast after Tasdiqlash could repeat the Qaytim; not asked for.
