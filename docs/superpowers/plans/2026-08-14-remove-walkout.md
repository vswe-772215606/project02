# Remove WALKOUT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the WALKOUT order state from Chayxana POS entirely, across all three apps, so the order lifecycle is `DRAFT → SENT → CLOSED` with `DRAFT|SENT → CANCELED` as the only terminal branch.

**Architecture:** Pure deletion, no new behaviour. Work outward-in: first remove the ability to create a walkout and convert the rows that exist, then delete the now-unreachable display and reporting code, then drop the schema. Every commit leaves the tree compiling and the data consistent.

**Tech Stack:** TypeScript strict, Prisma + SQLite, Express, React 19 + Vite + Tailwind (master renderer), Electron (master, order), Expo React Native (mobile), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-14-money-model-design.md` §7. This is slice 1 of 5.

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any`; use `unknown` and narrow.
- 2-space indent, single quotes, semicolons, trailing commas.
- Files `kebab-case.ts`, React components `PascalCase.tsx`.
- All user-facing text is in **Uzbek**. No i18n library.
- Master backend (`src/main`) is **CommonJS**; everywhere else is ES modules.
- All Prisma calls live in `repositories/`. Services orchestrate; controllers stay thin.
- **No AI fingerprints** in commit messages — no assistant self-attribution, no co-authorship trailers, no robot emoji. Author as the human, plainly.
- Never force-push, never rewrite history, never `git clean`.
- Target hardware is a **1366×768 touchscreen — no mouse, no hover, no keyboard**. Any change assuming a pointer is wrong.
- Renderer follows **Blocks C1** (`docs/design/BLOCKS_C1.md`): no borders, no radius, no shadows, no accent bars, no hover. Separation is a 2px seam; state is the fill. Type floors 12px labels / 13px text / 17px money.

## There is no test runner

This repo has no unit test framework configured. `docs/agent-plans` and the root CLAUDE.md both confirm verification is by typecheck, the `scripts/smoke-*.ts` family, and the browser gallery. **Do not go looking for a test runner and do not add one in this slice.** Every task below ends with concrete verification commands and their expected output.

### Baseline captured 2026-08-14 — memorise this

```bash
cd apps/master && npx tsc -b 2>&1 | grep -cE "error TS"
# → 51
```

All 51 are pre-existing and live in `src/main`. **Two of them are in files this slice touches:**

| File | Pre-existing errors |
|---|---|
| `src/main/server/controllers/orders.controller.ts` | 15 |
| `src/main/pdf-report.ts` | 9 |

After every task the count must still be **51 or lower** — never higher. It drops to 49 in Task 5 when `pdf-report.ts` walkout code goes, and may drop further in Task 1. Record the number in each commit body.

`tsc -b` must be run from `apps/master`. From the repo root use `pnpm typecheck` (which is `pnpm -r typecheck`); a bare `npx tsc -b` at the root fails with `TS5083` because there is no root `tsconfig.json`.

### Every task must also sweep the Uzbek phrasing

Grepping for `walkout` finds the code and misses the product. The user-facing concept is spelled **"to'lamay ketgan"**, **"to'lamagan"**, **"to'lamay"** — and the apostrophe varies: a plain `'`, a backslash-escaped `\'` inside a single-quoted string, or the typographic `’` (U+2018). A naive pattern catches one form and silently passes the other two.

Run this over the trees your task touched, every time:

```bash
grep -rniE "to.{0,2}lama" --include="*.ts" --include="*.tsx" <your trees>
```

Task 2 shipped, passed an English-only sweep, and still left two visible section titles and one routine empty-state string promising a feature that had been deleted. Expect the same in any file that renders or prints text.

### The other two gates

```bash
cd apps/master
pnpm run typecheck:renderer   # must be clean — zero errors, always
pnpm run typecheck:gallery    # must be clean — zero errors, always
```

`tsconfig.renderer.json` does **not** cover `gallery/`. `tsconfig.gallery.json` covers both trees. A renderer type change that breaks a fixture only shows up in the second command — always run both.

### The smokes are cumulative — re-seed before comparing numbers

`scripts/smoke-finance-pnl.ts` and its siblings **seed their own fixtures into the running database on every run** and do not clean up. Run one twice against the same database and every figure doubles; three times and it triples. The smoke still *passes* either way, because its assertions are internally consistent — only the absolute numbers move.

Measured during Task 4: baseline `270000 − 55200 − 30000 = 184800`, then an immediate second run of the same unchanged code reported `540000 − 110400 − 60000 = 369600`. Exactly 2×, nothing wrong with the code.

So **a smoke's numbers only mean something against a freshly seeded database.** Before any run whose figures you intend to compare:

```bash
docker compose -f compose.dev.yaml exec -T master-dev bash -lc \
  "rm -f apps/master/prisma/dev.db \
   && pnpm --filter @chayxana/master exec prisma migrate deploy \
   && pnpm --filter @chayxana/master exec tsx prisma/seed.ts"
docker compose -f compose.dev.yaml restart master-dev
```

Then wait for `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health` to return 200. Use `exec -T` throughout — plain `exec` fails in a non-interactive shell.

### Server smokes need Docker

Electron does not run on the dev Mac. For any task whose verification runs an HTTP smoke:

```bash
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml exec master-dev bash -lc \
  "rm -f apps/master/prisma/dev.db && pnpm --filter @chayxana/master exec prisma migrate deploy && pnpm --filter @chayxana/master exec tsx prisma/seed.ts"
docker compose -f compose.dev.yaml restart master-dev
# ... run smokes ...
docker compose -f compose.dev.yaml down
```

## File Structure

47 files. Nothing is created except one migration; everything else is modified or deleted.

**Deleted outright**
- `apps/master/src/renderer/components/approval/WalkoutOrderDialog.tsx`
- `apps/master/scripts/smoke-prd13-walkout.ts`

**Created**
- `apps/master/prisma/migrations/<ts>_convert_walkout_orders/migration.sql` (Task 1)
- `apps/master/prisma/migrations/<ts>_drop_walkout/migration.sql` (Task 7)

**Modified — server (`apps/master/src/main`)**
`server/routes/orders.routes.ts` · `server/controllers/orders.controller.ts` · `server/controllers/me.controller.ts` · `server/services/order.service.ts` · `server/services/alert.service.ts` · `server/services/reports.service.ts` · `server/services/finance.service.ts` · `server/services/telegram-bot.service.ts` · `server/services/stock.service.ts` (comment only) · `server/repositories/order.repo.ts` · `server/repositories/table.repo.ts` · `pdf-report.ts`

**Modified — master renderer (`apps/master/src/renderer`)**
`pages/ApprovalQueuePage.tsx` · `pages/OrdersPage.tsx` · `pages/ReportsPage.tsx` · `components/approval/OrderTicket.tsx` · `components/orders/OrderPanel.tsx` · `components/orders/CancelOrderDialog.tsx` (comment only) · `components/dashboard/RecentOrdersList.tsx` · `components/reports/IncidentsSection.tsx` · `components/reports/SalesSummary.tsx` · `components/reports/GrandSummarySection.tsx` · `components/reports/report-helpers.tsx` · `api/orders.ts` · `api/reports.ts` · `api/finance.ts` · `hooks/useSocket.ts` · `lib/audit-labels.ts`

**Modified — gallery (`apps/master/gallery`)**
`fixtures/orders.ts` · `fixtures/finance.ts` · `fixtures/reports.ts` · `fixtures/audit.ts`

**Modified — order app (`apps/order/src`)**
`renderer/pages/HomePage.tsx` · `renderer/pages/OrderDetailPage.tsx` · `renderer/api/orders.ts` · `renderer/hooks/useSocket.ts`

**Modified — mobile app (`apps/mobile/src`)**
`api/orders.ts` · `api/me.ts` · `screens/OrderEditScreen.tsx` · `screens/MyDayScreen.tsx` · `hooks/useSocket.ts`

**Modified — scripts and schema**
`apps/master/prisma/schema.prisma` · `apps/master/scripts/simulate-confirm-flow.ts` · `apps/master/scripts/simulate-debts-avans-flow.ts` · `apps/master/scripts/smoke-prd13-clock-isolation.ts`

**Modified — docs (Task 8)**
`CLAUDE.md` · `docs/CURRENT_WORKFLOW.md` · `docs/agent-plans/00-shared/decisions.md`

---

### Task 1: Stop new walkouts and convert the rows that exist

The whole entry point dies together — the button, the API client method, the route, the controller action, the service method, the repo method, the Telegram alert — plus a data migration that leaves zero `WALKOUT` rows behind. After this task a walkout can neither be created nor exist, so every later task is deleting provably dead code.

The renderer goes first inside this task so there is never a moment where a live button calls a deleted endpoint.

**Files:**
- Delete: `apps/master/src/renderer/components/approval/WalkoutOrderDialog.tsx`
- Modify: `apps/master/src/renderer/pages/ApprovalQueuePage.tsx:11,24,74,88-91`
- Modify: `apps/master/src/renderer/components/approval/OrderTicket.tsx:42,48,195-197`
- Modify: `apps/master/src/renderer/api/orders.ts:105-106`
- Modify: `apps/master/src/main/server/routes/orders.routes.ts:22`
- Modify: `apps/master/src/main/server/controllers/orders.controller.ts:62,235-243`
- Modify: `apps/master/src/main/server/services/order.service.ts:776-825,120-121`
- Modify: `apps/master/src/main/server/repositories/order.repo.ts:205-220`
- Modify: `apps/master/src/main/server/services/alert.service.ts:4,46-62`
- Create: `apps/master/prisma/migrations/<timestamp>_convert_walkout_orders/migration.sql`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `POST /api/orders/:id/mark-walkout` no longer exists. `ordersApi.markWalkout` no longer exists. `orderService.markWalkout` and `orderRepo.setWalkout` no longer exist. `alertService.orderWalkout` no longer exists. `OrderTicket` no longer accepts an `onWalkout` prop — its props are now `{ order, submitting, error, onConfirm }`. The `order:walkout` socket event is no longer emitted by the server (listeners are removed in Tasks 2 and 3). Zero rows have `status = 'WALKOUT'`.

- [ ] **Step 1: Delete the walkout dialog**

```bash
cd /Users/uzmacbook/dev/lab/project02
git rm apps/master/src/renderer/components/approval/WalkoutOrderDialog.tsx
```

- [ ] **Step 2: Unwire it from ApprovalQueuePage**

In `apps/master/src/renderer/pages/ApprovalQueuePage.tsx`, delete the import on line 11, the state on line 24, the `onWalkout` prop passed on line 74, and the whole `<WalkoutOrderDialog ... />` element at lines 88-91.

Remove:
```tsx
import { WalkoutOrderDialog } from '@/components/approval/WalkoutOrderDialog';
```
```tsx
const [walkoutOrder, setWalkoutOrder] = useState<Order | null>(null);
```
```tsx
onWalkout={() => setWalkoutOrder(ticketOrder)}
```
```tsx
<WalkoutOrderDialog
  order={walkoutOrder}
  open={!!walkoutOrder}
  onClose={() => setWalkoutOrder(null)}
/>
```

If `useState` is now unused in this file, drop it from the React import. If `Order` is now unused, drop it from the `@/api/orders` import.

- [ ] **Step 3: Remove the prop and button from OrderTicket**

In `apps/master/src/renderer/components/approval/OrderTicket.tsx`, delete `onWalkout,` from the destructured props (line 42) and `onWalkout: () => void;` from the props type (line 48).

Then replace the button strip at lines 187-198. It currently reads:

```tsx
<div className="flex gap-seam bg-field px-pad py-2">
  {(['CARD', 'DEBT'] as const)
    .filter((method) => !legs.some((leg) => leg.method === method))
    .map((method) => (
      <Button key={method} variant="secondary" size="sm" onClick={() => addLeg(method)}>
        + {METHOD_LABEL[method]}
      </Button>
    ))}
  <Button variant="ghost" size="sm" className="ml-moat text-owed" onClick={onWalkout}>
    To'lamay ketdi
  </Button>
</div>
```

Replace with:

```tsx
<div className="flex gap-seam bg-field px-pad py-2">
  {(['CARD', 'DEBT'] as const)
    .filter((method) => !legs.some((leg) => leg.method === method))
    .map((method) => (
      <Button key={method} variant="secondary" size="sm" onClick={() => addLeg(method)}>
        + {METHOD_LABEL[method]}
      </Button>
    ))}
</div>
```

- [ ] **Step 4: Remove the API client method**

In `apps/master/src/renderer/api/orders.ts`, delete lines 105-106:

```ts
markWalkout: (id: string, reason: string) =>
  api.post<Order>(`/api/orders/${id}/mark-walkout`, { reason }),
```

Leave the `'WALKOUT'` member of the `status` union on line 51 — Task 2 removes it, after the data migration in this task guarantees no such row is returned.

- [ ] **Step 5: Verify the renderer still compiles**

```bash
cd apps/master && pnpm run typecheck:renderer && pnpm run typecheck:gallery
```
Expected: both clean, zero errors. If `typecheck:gallery` complains that `mark-walkout` is unreachable, ignore — the fixture handler is removed in Task 2 and an unused handler is not a type error.

- [ ] **Step 6: Remove the route**

In `apps/master/src/main/server/routes/orders.routes.ts`, delete line 22:

```ts
ordersRouter.post('/:id/mark-walkout', requireRole(['ADMIN', 'OWNER']), ordersController.markWalkout);
```

- [ ] **Step 7: Remove the controller action and its schema**

In `apps/master/src/main/server/controllers/orders.controller.ts`, delete the `markWalkoutSchema` declaration at line 62 and the whole `markWalkout` method at lines 235-243.

- [ ] **Step 8: Remove the service method**

In `apps/master/src/main/server/services/order.service.ts`, delete the entire `markWalkout` method, lines 776-825 (from `async markWalkout(input: {` through its closing `},`).

Then fix the stale comment at lines 120-121. It currently reads:

```ts
 * omborga qaytariladi. WALKOUT bu yo'lga kirmaydi (mehmon taom yegan deb
 * hisoblanadi) — markWalkout shu funksiyani chaqirmaydi.
```

Replace those two lines with:

```ts
 * omborga qaytariladi — DRAFT va SENT ikkalasida ham.
```

Also fix the comment at line 424, which reads `// Notes can be edited any time before the order is closed/walkout/canceled.` — change to:

```ts
// Notes can be edited any time before the order is closed or canceled.
```

- [ ] **Step 9: Remove the repo method**

In `apps/master/src/main/server/repositories/order.repo.ts`, delete the `setWalkout` method and its doc comment, lines 205-220.

Leave line 74 (`notIn: [OrderStatus.CLOSED, OrderStatus.WALKOUT, OrderStatus.CANCELED]`) alone — it still compiles and Task 7 removes the enum member.

- [ ] **Step 10: Remove the Telegram alert**

In `apps/master/src/main/server/services/alert.service.ts`, delete the `orderWalkout` method (the doc comment `/** Customer left a SENT order without paying. Always alerts (no threshold). */` through the closing `},` — lines 46-62).

Then fix the file header comment on line 4, which reads:

```ts
 * Owner-facing Telegram alerts for notable business events: walkout, large
```

Replace with:

```ts
 * Owner-facing Telegram alerts for notable business events: large
```

- [ ] **Step 11: Write the data migration**

```bash
cd apps/master
mkdir -p "prisma/migrations/$(date +%Y%m%d%H%M%S)_convert_walkout_orders"
```

Create `migration.sql` in that directory with exactly:

```sql
-- Walkout is removed from the product. Any order still parked in WALKOUT
-- becomes a cancellation carrying an explicit reason, so no row is left
-- holding a status the enum will no longer contain.
--
-- Stock is deliberately NOT restored: a walkout meant the food was consumed,
-- and restoring it now would invent inventory that does not exist.
UPDATE "Order"
SET "status"       = 'CANCELED',
    "canceledAt"   = COALESCE("canceledAt", "walkoutAt", "updatedAt"),
    "cancelReason" = COALESCE(NULLIF("cancelReason", ''), 'Hisob to''lanmagan (eski yozuv)')
WHERE "status" = 'WALKOUT';
```

- [ ] **Step 12: Apply the migration and confirm zero rows remain**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml exec master-dev bash -lc \
  "pnpm --filter @chayxana/master exec prisma migrate deploy"
```

Then confirm zero rows remain. `prisma db execute` cannot do this — it needs `--schema`/`--url` and never prints query output — so use a throwaway script. Create `apps/master/scripts/tmp-count-walkouts.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
  `SELECT COUNT(*) AS n FROM "Order" WHERE status = 'WALKOUT'`,
);
console.log('walkout rows:', rows[0]?.n ?? 'unknown');
await prisma.$disconnect();
```

```bash
docker compose -f compose.dev.yaml exec master-dev \
  pnpm --filter @chayxana/master exec tsx scripts/tmp-count-walkouts.ts
rm apps/master/scripts/tmp-count-walkouts.ts
```
Expected: the migration applies cleanly and the count is `0`. Delete the probe before committing.

Because a freshly-seeded database has no walkout rows to convert, the count being zero does not by itself prove the SQL works. Also prove the conversion path: insert a synthetic `WALKOUT` order, re-run the `UPDATE` statement, confirm it lands as `CANCELED` with a populated `canceledAt` and `cancelReason`, then delete the synthetic row.

- [ ] **Step 13: Verify the whole tree**

```bash
cd apps/master
npx tsc -b 2>&1 | grep -cE "error TS"
pnpm run typecheck:renderer
pnpm run typecheck:gallery
```
Expected: error count **≤ 51** (deleting `markWalkout` from `orders.controller.ts` may clear some of that file's 15), and both renderer gates clean.

- [ ] **Step 14: Confirm the entry point is gone**

```bash
cd /Users/uzmacbook/dev/lab/project02
grep -rn "mark-walkout\|markWalkout\|setWalkout\|orderWalkout" apps/master/src apps/order/src apps/mobile/src
```
Expected: **no matches in `src`**. (`apps/master/scripts/` still matches — that is Task 6.)

- [ ] **Step 15: Commit**

```bash
cd /Users/uzmacbook/dev/lab/project02
git add -A
git commit -m "feat(orders): remove the walkout action and convert existing rows

An unpaid bill is closed by the admin as nasiya or as a full discount with a
reason, so the separate WALKOUT transition has no job left. Deletes the button,
the dialog, the API client method, the route, the controller action, the
service and repo methods, and the Telegram alert.

The migration converts any order still sitting in WALKOUT to CANCELED with an
explicit reason. Stock is deliberately not restored — the food was consumed.

Reads and reporting still carry walkout branches; they are removed next, now
that no such row can be created or exist.

tsc -b: 51 pre-existing errors, none new."
```

---

### Task 2: Remove walkout from the master renderer and gallery fixtures

The renderer's display paths and the fixtures that feed them change together — `typecheck:gallery` covers both trees, so a type removed in `api/reports.ts` breaks the fixture that supplies it in the same run.

**Files:**
- Modify: `apps/master/src/renderer/api/orders.ts:51`
- Modify: `apps/master/src/renderer/api/reports.ts:17,67-71,141,225-229,247,291,335`
- Modify: `apps/master/src/renderer/api/finance.ts:10,16`
- Modify: `apps/master/src/renderer/hooks/useSocket.ts:79`
- Modify: `apps/master/src/renderer/lib/audit-labels.ts:16,74,107`
- Modify: `apps/master/src/renderer/pages/OrdersPage.tsx:12,14,19,35`
- Modify: `apps/master/src/renderer/pages/ReportsPage.tsx:178,246`
- Modify: `apps/master/src/renderer/components/orders/OrderPanel.tsx:249`
- Modify: `apps/master/src/renderer/components/orders/CancelOrderDialog.tsx:25`
- Modify: `apps/master/src/renderer/components/dashboard/RecentOrdersList.tsx:9,17`
- Modify: `apps/master/src/renderer/components/reports/IncidentsSection.tsx:9,37-38,87-96`
- Modify: `apps/master/src/renderer/components/reports/SalesSummary.tsx:13-14`
- Modify: `apps/master/src/renderer/components/reports/GrandSummarySection.tsx:31,98`
- Modify: `apps/master/src/renderer/components/reports/report-helpers.tsx:135,148`
- Modify: `apps/master/src/renderer/pages/SettingsPage.tsx:203`
- Modify: `apps/master/gallery/fixtures/orders.ts:232-246,304-311`
- Modify: `apps/master/gallery/fixtures/finance.ts:21,96,160-165,219,232,254,267,286,298,338,355,357,395,401,508,518`
- Modify: `apps/master/gallery/fixtures/reports.ts:18,45,89-91,135,190-191,217,248`
- Modify: `apps/master/gallery/fixtures/audit.ts:38-40,85`

**Interfaces:**
- Consumes: Task 1 — no walkout can be created and no `WALKOUT` row exists.
- Produces: the renderer `Order['status']` union is `'DRAFT' | 'SENT' | 'CLOSED' | 'CANCELED'`. `DailyReport` no longer has `walkouts`; `sales`/`totals` objects no longer have `walkoutOrders` or `walkoutCount`; `FinanceDaily.sales` no longer has `walkoutOrders` or `walkoutLoss`. The server still sends those JSON fields until Tasks 4 and 5 — extra fields on the wire are harmless.

- [ ] **Step 1: Narrow the status unions and drop the socket listener**

In `apps/master/src/renderer/api/orders.ts` line 51, change:
```ts
status: 'DRAFT' | 'SENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';
```
to:
```ts
status: 'DRAFT' | 'SENT' | 'CLOSED' | 'CANCELED';
```

In `apps/master/src/renderer/hooks/useSocket.ts`, delete line 79:
```ts
nextSocket.on('order:walkout', orderChanged);
```

- [ ] **Step 2: Strip walkout from the report and finance API types**

In `apps/master/src/renderer/api/reports.ts` remove: `walkoutCount` (line 17), the whole `walkouts: Array<{ ... }>` block (lines 67-71), `walkoutOrders` (line 141), the whole `walkouts: Array<{ ... }>` block including its `markedBy` legacy comment (lines 225-229), `'WALKOUT'` from the status union on line 247, and `walkoutOrders` on lines 291 and 335.

In `apps/master/src/renderer/api/finance.ts` remove `walkoutOrders` (line 10) and `walkoutLoss` (line 16).

- [ ] **Step 3: Remove the audit label and filter entries**

In `apps/master/src/renderer/lib/audit-labels.ts`, remove `'WALKOUT_MARKED'` from the `values` array on line 74 and from the array on line 107 — those two arrays drive filter chips for actions a user can still cause, and nothing can produce a walkout any more.

**Keep the `WALKOUT_MARKED: 'To'lamay ketdi',` label on line 16.** `AUDIT_LABELS` is typed `Record<string, string>`, so a missing key resolves to `undefined` at the call site. Historical `AuditLog` rows still carry `WALKOUT_MARKED` — Task 7 deliberately keeps that enum member for exactly this reason — and removing the label would render those rows blank in Amallar tarixi. Add this comment directly above the entry:

```ts
  // Historical only — walkout was removed 2026-08-14. Kept so old audit rows
  // still render a name. Do not add it back to the filter arrays below.
  WALKOUT_MARKED: 'To‘lamay ketdi',
```

- [ ] **Step 4: Remove the Buyurtmalar filter tab**

In `apps/master/src/renderer/pages/OrdersPage.tsx`:

Line 12 — change:
```ts
type HistoryStatus = 'SENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';
```
to:
```ts
type HistoryStatus = 'SENT' | 'CLOSED' | 'CANCELED';
```

Line 14 — change:
```ts
const FILTER_TABS: HistoryStatus[] = ['SENT', 'CLOSED', 'WALKOUT', 'CANCELED'];
```
to:
```ts
const FILTER_TABS: HistoryStatus[] = ['SENT', 'CLOSED', 'CANCELED'];
```

Line 19 — delete the `WALKOUT: "To'lamay ketdi",` label entry.

Line 35 — the comment reads `asks for a reason in a dialog — mirrors Tasdiqlash's walkout flow.` Change to `asks for a reason in a dialog.`

- [ ] **Step 5: Fix the remaining renderer display sites**

`components/orders/OrderPanel.tsx` line 249 — change:
```tsx
{order.status === 'CLOSED' || order.status === 'WALKOUT' ? (
```
to:
```tsx
{order.status === 'CLOSED' ? (
```

`components/orders/CancelOrderDialog.tsx` line 25 — the comment reads `Tasdiqlash's walkout dialog: a mandatory reason, then confirm.` Change to `A mandatory reason, then confirm.`

`components/dashboard/RecentOrdersList.tsx` — delete the `WALKOUT` entries from both maps (lines 9 and 17).

`components/reports/report-helpers.tsx` — delete the `WALKOUT` entries from both maps (lines 135 and 148).

`components/reports/SalesSummary.tsx` lines 13-14 — change:
```tsx
report.sales.canceledOrders + report.sales.walkoutOrders > 0
  ? `${report.sales.canceledOrders} bekor · ${report.sales.walkoutOrders} to'lamagan`
```
to:
```tsx
report.sales.canceledOrders > 0
  ? `${report.sales.canceledOrders} bekor`
```

`components/reports/GrandSummarySection.tsx` — delete the `walkoutTotal` const on line 31 and the entire `{ label: "To'lamay ketgan", ... }` tile on line 98.

`pages/ReportsPage.tsx` line 178 — change:
```tsx
count={`${report.cancellations.length + report.walkouts.length} ta hodisa`}
```
to:
```tsx
count={`${report.cancellations.length} ta hodisa`}
```
Line 246 — change:
```tsx
hint={`${report.totals.canceledOrders} bekor · ${report.totals.walkoutOrders} to'lamagan`}
```
to:
```tsx
hint={`${report.totals.canceledOrders} bekor`}
```

- [ ] **Step 6: Reduce IncidentsSection to cancellations only**

In `apps/master/src/renderer/components/reports/IncidentsSection.tsx`, delete the `WalkoutRow` type alias (line 9), the `walkoutTotal` const (line 37), the `walkoutCols` column definitions (line 38 and its array body), and the whole walkout `<DataTable>` block including its heading (lines 87-96).

The section now renders only the cancellations table. If removing the walkout block leaves the component rendering a single child where it previously had two, keep the existing `Seam` / section wrapper — do not restructure the layout. Blocks C1 rules apply: no borders, no radius, no hover.

- [ ] **Step 6b: Correct the Telegram alert setting's description**

Task 1 deleted `alertService.orderWalkout`, so the Sozlamalar copy now promises an alert that can never fire. In `apps/master/src/renderer/pages/SettingsPage.tsx:203`, change:

```tsx
description="Muhim hodisalarda darhol xabar: to'lamay ketish, katta chegirma/chiqim, nasiya sotuv, qarz yo'qotish, mahsulot tugashi"
```
to:
```tsx
description="Muhim hodisalarda darhol xabar: katta chegirma/chiqim, nasiya sotuv, qarz yo'qotish, mahsulot tugashi"
```

There is no separate settings key to remove — the walkout alert was unconditional, with no threshold of its own. Only this string is stale.

- [ ] **Step 6c: Retitle the three Uzbek strings that still name walkout**

English greps miss these — the concept is spelled "to'lamay ketgan" / "to'lamagan" in the UI. All three stay visible after the feature is gone.

`components/reports/IncidentsSection.tsx:36` — the section now renders only cancellations:
```tsx
<Section title="Bekor va to'lamay ketgan">
```
becomes
```tsx
<Section title="Bekor qilingan">
```

`pages/ReportsPage.tsx:177` — the `Collapsible` wrapping it (its `count` prop one line below is handled in Step 5):
```tsx
title="Bekor / To'lamay ketgan"
```
becomes
```tsx
title="Bekor qilingan"
```

`components/reports/SalesSummary.tsx:15` — the empty-state fallback of the tile whose true-branch Step 5 already simplified. This renders on any day with zero cancellations, which is routine, not an edge case:
```tsx
: 'Bekor yoki to\'lamagan yo\'q'
```
becomes
```tsx
: 'Bekor yo\'q'
```

- [ ] **Step 7: Strip walkout from the gallery fixtures**

`gallery/fixtures/orders.ts` — delete the three seeded WALKOUT orders (lines 232-246, the block starting at the `// ── WALKOUT — left without paying ──` comment) and the `mark-walkout` route handler (lines 304-311).

`gallery/fixtures/finance.ts` — delete `walkoutToday` (line 21), `walkoutLoss` (line 96), `WALKOUT_HANDLERS` and `incidentWalkouts` (lines 160-165), and every `walkoutOrders` / `walkoutCount` / `walkoutLoss` property and its value throughout (lines 219, 232, 254, 267, 298, 355, 357, 395, 401). Change `incidents: { walkouts: [], cancellations: [] }` on line 286 to `incidents: { cancellations: [] }` and `incidents: { walkouts: incidentWalkouts, cancellations: incidentCancellations }` on line 338 to `incidents: { cancellations: incidentCancellations }`. Remove `walkoutToday` and `walkoutLoss` from the export block (lines 508, 518).

`gallery/fixtures/reports.ts` — delete `walkoutOrders` on lines 18, 135, 217, 248; delete `walkouts: []` on line 45; delete the `...f.walkoutToday.map(...)` spread on lines 89-91; delete the `walkouts: ledger.incidents.walkouts.map(...)` block on lines 190-191.

`gallery/fixtures/audit.ts` — delete the `if (o.status === 'WALKOUT') { ... }` block that emits `WALKOUT_MARKED` rows (lines 38-40). On line 85, the `SERVICE_CHARGE_WAIVED` row references the now-deleted order id `'ord-walkout-03'` — repoint it at any surviving closed order id from `fixtures/orders.ts`.

- [ ] **Step 8: Verify both renderer gates**

```bash
cd apps/master
pnpm run typecheck:renderer && pnpm run typecheck:gallery
```
Expected: both clean, zero errors. A leftover `walkout` reference in either tree fails here — that is the point of running both.

- [ ] **Step 9: Look at every screen**

```bash
cd apps/master && pnpm gallery:page
```
Open `gallery-dist/blocks-c1-gallery.html` and check, at 1366×768: **Tasdiqlash** (no "To'lamay ketdi" button, the CARD/DEBT strip still lays out correctly), **Buyurtmalar** (three filter tabs, no gap where the fourth was), **Bugun** (recent orders render), **Moliyaviy hisobot** (Hodisalar shows cancellations only and does not look broken with one table, Yakuniy hisobot has no walkout tile leaving a hole in the grid), **Kunlik moliya**.

- [ ] **Step 10: Confirm the renderer is clean**

```bash
cd /Users/uzmacbook/dev/lab/project02
grep -rn "WALKOUT" apps/master/src/renderer apps/master/gallery
```
Expected: **exactly one match** — the deliberately-kept `WALKOUT_MARKED` label in `lib/audit-labels.ts`.

Grep case-**sensitively** here. A case-insensitive sweep also catches the explanatory comment Step 3 mandates above that label, so it can never return one line and tells you nothing.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(renderer): drop walkout from every master screen and fixture

Removes the status from the order union, the Buyurtmalar filter tab, the
Hodisalar walkout table, the Yakuniy hisobot tile, the socket listener and the
audit filter entries. Report and finance API types lose their walkout fields;
the gallery fixtures lose the three seeded walkout orders and the mark-walkout
handler.

typecheck:renderer and typecheck:gallery both clean. All 15 screens checked in
the gallery at 1366x768."
```

---

### Task 3: Remove walkout from the order and mobile apps

Both waiter clients only ever displayed the status — neither could create a walkout. This is label and union cleanup plus two dead socket listeners.

**Files:**
- Modify: `apps/order/src/renderer/api/orders.ts:3,76`
- Modify: `apps/order/src/renderer/pages/HomePage.tsx:26,34`
- Modify: `apps/order/src/renderer/pages/OrderDetailPage.tsx:28`
- Modify: `apps/order/src/renderer/hooks/useSocket.ts:120`
- Modify: `apps/mobile/src/api/orders.ts:3,81`
- Modify: `apps/mobile/src/api/me.ts:9`
- Modify: `apps/mobile/src/screens/OrderEditScreen.tsx:32`
- Modify: `apps/mobile/src/screens/MyDayScreen.tsx:196`
- Modify: `apps/mobile/src/hooks/useSocket.ts:88`

**Interfaces:**
- Consumes: Task 1 — the server no longer emits `order:walkout`.
- Produces: both apps' `OrderStatus` type is `'DRAFT' | 'SENT' | 'CLOSED' | 'CANCELED'`. `TodayStats` in mobile no longer has `ordersWalkout`. The server still returns `ordersWalkout` from `/api/me/today-stats` until Task 5 — an extra JSON field is harmless.

- [ ] **Step 1: Order app**

`apps/order/src/renderer/api/orders.ts` line 3 — change:
```ts
export type OrderStatus = 'DRAFT' | 'SENT' | 'CLOSED' | 'WALKOUT' | 'CANCELED';
```
to:
```ts
export type OrderStatus = 'DRAFT' | 'SENT' | 'CLOSED' | 'CANCELED';
```
Line 76 — delete the `WALKOUT: "To'lamay ketdi",` label entry.

`apps/order/src/renderer/pages/HomePage.tsx` — delete the `WALKOUT` entries from both maps (lines 26 and 34).

`apps/order/src/renderer/pages/OrderDetailPage.tsx` — delete the `WALKOUT: 'destructive',` entry (line 28).

`apps/order/src/renderer/hooks/useSocket.ts` — delete the listener at line 120:
```ts
nextSocket.on('order:walkout', () => {
```
Remove the whole handler including its body and closing `});`.

- [ ] **Step 2: Mobile app**

`apps/mobile/src/api/orders.ts` line 3 — same union narrowing as above. Line 81 — delete the `WALKOUT: "To'lamay ketdi",` label entry.

`apps/mobile/src/api/me.ts` line 9 — delete `ordersWalkout: number;`.

`apps/mobile/src/screens/OrderEditScreen.tsx` line 32 — delete the `WALKOUT: 'danger',` entry.

`apps/mobile/src/screens/MyDayScreen.tsx` line 196 — change:
```tsx
hint={`${dayStats?.ordersCanceled ?? 0} bekor · ${dayStats?.ordersWalkout ?? 0} to'lamagan`}
```
to:
```tsx
hint={`${dayStats?.ordersCanceled ?? 0} bekor`}
```

`apps/mobile/src/hooks/useSocket.ts` line 88 — delete:
```ts
socket.on('order:walkout', () => qc.invalidateQueries({ queryKey: ['orders'] }));
```

- [ ] **Step 3: Verify both apps typecheck**

```bash
cd /Users/uzmacbook/dev/lab/project02
pnpm --filter @chayxana/order typecheck
pnpm --filter @chayxana/mobile typecheck
```
Expected: both clean. If either package has no `typecheck` script, run `npx tsc --noEmit -p apps/<app>/tsconfig.json` from the repo root instead and record which you used.

- [ ] **Step 4: Confirm both apps are clean**

```bash
grep -rin "walkout" apps/order/src apps/mobile/src
```
Expected: **no matches.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(clients): drop walkout from the order and mobile apps

Status unions, badge tone maps, Uzbek labels, the mobile day-stats hint and two
dead order:walkout socket listeners. Neither client could ever create a
walkout; this is display cleanup."
```

---

### Task 4: Remove walkout from reports.service.ts

The largest single file, 34 references across three separate report builders: the daily report, the monthly `dailyLedger`, and the range report. Do them one at a time and typecheck between.

**Files:**
- Modify: `apps/master/src/main/server/services/reports.service.ts:30,121,273-274,292-294,330-336,344,417-421,452,468-469,515,534,578-580,651,720,759,792,1121,1143-1145,1340,1391-1398`

**Interfaces:**
- Consumes: Task 1 (no walkout rows), Task 2 (renderer no longer reads these fields).
- Produces: `dailyLedger` returns `sales` without `walkoutCount` and `incidents` without `walkouts` — `incidents` now has only `cancellations`. The daily report DTO loses `walkouts` and `sales.walkoutOrders`. The range report loses `totals.walkoutOrders`. `buildOrdersTable` accepts `'CLOSED' | 'CANCELED'`.

- [ ] **Step 1: Narrow the shared helpers**

Line 30 — delete the `walkoutBy: { ... }` selection from the `ReportOrder` select shape.

Line 121 — change:
```ts
function buildOrdersTable(orders: ReportOrder[], status: 'CLOSED' | 'CANCELED' | 'WALKOUT') {
```
to:
```ts
function buildOrdersTable(orders: ReportOrder[], status: 'CLOSED' | 'CANCELED') {
```

- [ ] **Step 2: Clean the daily report builder**

Lines 273-274 — drop `walkoutOrders` from the destructured `Promise.all` result and delete its query (lines 292-294, the `prisma.order.findMany` with `status: 'WALKOUT'`).

Lines 330-336 — delete `...buildOrdersTable(walkoutOrders, 'WALKOUT'),` from the joined `ordersTable` spread, and update the comment above it (lines 330-331) which currently mentions `closed + canceled + walkout` and `closedAt / canceledAt / walkoutAt`. Rewrite as:

```ts
// ordersTable joined view: closed + canceled, sorted by terminal
// moment (closedAt / canceledAt) so the renderer can show a
```

Line 344 — delete `walkoutOrders: ledger.sales.walkoutCount,`.

Lines 417-421 — delete the whole `walkouts: ledger.incidents.walkouts.map(...)` block.

- [ ] **Step 3: Clean `monthly()`**

> **Function names in Steps 3 and 4 were wrong in the first version of this plan** and are corrected here. This step's target is `monthly()`, not `dailyLedger()`. Step 4's target is `dailyLedger()`, not "the range report builder". The actual range report is `summary()` — it never held a walkout reference and is not touched by this task at all. Work from the line numbers, which were always correct.


Line 452 — drop `walkoutOrders` from the destructured `Promise.all` result and delete its query (lines 468-469).

Line 515 — delete `walkoutCount: number;` from the per-day aggregate type. Line 534 — delete `walkoutCount: 0,` from its initialiser.

Lines 578-580 — delete the whole loop:
```ts
for (const order of walkoutOrders) {
  if (!order.walkoutAt) continue;
  getDay(localDayKey(order.walkoutAt)).walkoutCount += 1;
}
```

Line 651 — delete `walkoutOrders: number;` from the returned `sales` type. Line 720 — delete `walkoutOrders: agg.walkoutCount,`. Line 759 — delete `totals.walkoutCount += agg.walkoutCount;`. Line 792 — delete `walkoutOrders: totals.walkoutCount,`.

- [ ] **Step 4: Clean `dailyLedger()`**

Line 1121 — drop `walkoutOrders` from the destructured result and delete its query (lines 1143-1145).

Line 1340 — delete `walkoutCount: walkoutOrders.length,`.

Lines 1391-1398 — delete the whole `walkouts: walkoutOrders.map(...)` block from `incidents`, leaving `incidents` with only `cancellations`.

- [ ] **Step 5: Verify**

```bash
cd apps/master
npx tsc -b 2>&1 | grep -E "reports\.service"
npx tsc -b 2>&1 | grep -E "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn
```

Expected: **no errors mentioning `reports.service`** — that file must come out clean.

**The total WILL rise, and that is correct here.** This task trims DTOs that `pdf-report.ts`, `finance.service.ts`, `me.controller.ts` and `telegram-bot.service.ts` still read; Task 5 removes those readers. Measured on the real run: 50 → **57**, with `pdf-report.ts` 9 → 15 (+6) and `finance.service.ts` 0 → 1 (+1), every new error naming a field this task deleted.

Judge the **per-file breakdown**, not the total. A new error in any file other than those four means you deleted something you shouldn't have — stop and investigate. Task 5 brings the count back down.

- [ ] **Step 6: Run the report smokes against a live server**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml exec master-dev bash -lc \
  "rm -f apps/master/prisma/dev.db && pnpm --filter @chayxana/master exec prisma migrate deploy && pnpm --filter @chayxana/master exec tsx prisma/seed.ts"
docker compose -f compose.dev.yaml restart master-dev
docker compose -f compose.dev.yaml exec master-dev \
  pnpm --filter @chayxana/master exec tsx scripts/smoke-summary-report.ts
docker compose -f compose.dev.yaml exec master-dev \
  pnpm --filter @chayxana/master exec tsx scripts/smoke-finance-pnl.ts
```
Expected: both pass. If `smoke-summary-report.ts` asserts on a walkout field, fix the assertion here rather than deferring — record it in the commit body.

**Run them in that order, and never `smoke-summary-report.ts` alone.** A bare seed has no closed orders, so on its own the summary smoke passes with every figure at zero and its identity assertions (`profit=0`, `cash farq=0`) hold trivially — a green run that proves nothing. `smoke-finance-pnl.ts` creates the closed orders it needs. Measured on the real sequence after this task: `per-category revenue = 270000`, `7-day P&L profit = 184800`, 1 menu-category row, 1 expense-category row, 2 cash rows. Those figures agreeing with the daily P&L is the actual evidence that the builders still compute correctly.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(reports): remove walkout from all three report builders

The daily report, dailyLedger and the range report each carried their own
walkout query, counter and incidents block. incidents now holds only
cancellations, and the joined ordersTable is closed plus canceled.

smoke-summary-report and smoke-finance-pnl pass against the Docker harness."
```

---

### Task 5: Remove walkout from finance, me, telegram and the PDF report

Everything left that reads walkout on the server.

**Files:**
- Modify: `apps/master/src/main/server/services/finance.service.ts:53,73,109-112,127,133`
- Modify: `apps/master/src/main/server/controllers/me.controller.ts:31,53-59,80`
- Modify: `apps/master/src/main/server/services/telegram-bot.service.ts:729,774-775,841-842,1047,1059,1070,1083`
- Modify: `apps/master/src/main/pdf-report.ts:59,428,648,672-674,685`
- Modify: `apps/master/src/main/server/services/stock.service.ts:101`
- Modify: `apps/master/src/main/server/repositories/table.repo.ts:8`

**Interfaces:**
- Consumes: Task 4 — `ledger.sales` no longer has `walkoutCount`, `ledger.incidents` no longer has `walkouts`.
- Produces: `financeService.dailyForAdmin` returns `sales` without `walkoutOrders` or `walkoutLoss`. `/api/me/today-stats` no longer returns `ordersWalkout`. The PDF report has no walkout section. `table.repo`'s terminal-status list is `[CLOSED, CANCELED]`.

- [ ] **Step 1: finance.service.ts**

Drop `walkoutOrderRows` from the destructured `Promise.all` (line 53) and delete its query (lines 72-75). Delete the `walkoutLoss` reduce (lines 109-112). Delete `walkoutOrders: ledger.sales.walkoutCount,` (line 127) and `walkoutLoss: decStr(walkoutLoss),` (line 133).

- [ ] **Step 2: me.controller.ts**

Line 31 — change the destructure from:
```ts
const [closedOrders, canceledOrders, walkoutOrders] = await Promise.all([
```
to:
```ts
const [closedOrders, canceledOrders] = await Promise.all([
```
Delete the third `getPrisma().order.count({ ... status: OrderStatus.WALKOUT ... })` query entirely (lines 53-59, including its trailing comma). Delete `ordersWalkout: walkoutOrders,` from the response (line 80).

- [ ] **Step 3: telegram-bot.service.ts**

Line 729 — delete `walkoutOrders: L.sales.walkoutCount,`.

Lines 774-775 — delete:
```ts
if (sales.walkoutOrders > 0) {
  lines.push(`  ⚠ To'lamay ketgan: <b>${sales.walkoutOrders}</b> ta`);
}
```
(including the closing brace).

Lines 841-842 — delete the identical block keyed on `totals.walkoutOrders`.

Line 1047 — delete `let totalWalkouts = 0;`. Line 1059 — delete the `const walkouts = ...` assignment. Line 1070 — delete `totalWalkouts += walkouts;`.

Line 1083 — change:
```ts
lines.push(`  Buyurtmalar: <b>${totalOrders}</b> ta` + (totalWalkouts > 0 ? ` · to'lamay ketgan: ${totalWalkouts}` : ''));
```
to:
```ts
lines.push(`  Buyurtmalar: <b>${totalOrders}</b> ta`);
```

**No separate type declaration to chase in this file.** `sales` at line 726 is an inline object literal built from the ledger with `: report.sales` as its fallback branch, and `totals` is the range report's own object — both are inferred, and Task 4 already removed `walkoutOrders` from the DTOs feeding them. Deleting the lines listed above is the whole change.

- [ ] **Step 4: pdf-report.ts**

Line 59 — delete the `WALKOUT: "To'lamagan",` label entry.

Line 428 — delete the whole `{ label: 'To\'lamay ketgan', value: ... }` summary tile.

Section 8 renders cancellations first, then walkouts. Delete **only the walkout half — lines 671 through 692 inclusive**, which is the contiguous block starting at `doc.moveDown(0.3);` (the one immediately after the cancellations `table(...)` call closes) and ending at the `);` that closes the walkout `table(...)` call. That block is:

```ts
  doc.moveDown(0.3);
  const walkoutTotal = sumStrings(data.walkouts.map((w) => w.amount));
  doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(9)
    .text(`To'lamay ketgan — ${data.walkouts.length} ta · Yo'qotilgan summa: ${fmtUZSDecimal(walkoutTotal)} so'm`);
  doc.moveDown(0.2);
  table(
    doc,
    [ /* Vaqti, Buyurtma ID, Kim belgiladi, Summa, Sabab */ ],
    data.walkouts.map((w) => [ /* ... */ ]),
    { emptyMessage: 'Bu sana uchun to\'lamay ketgan buyurtmalar yo\'q' },
  );
```

Then fix the two headings above it. Line 648 comment — change `// ─── 8. Bekor / Walkout ───────────────────────────────────────────` to `// ─── 8. Bekor qilingan ─────────────────────────────────────────────`. Line 650 — change:

```ts
  sectionTitle(doc, 'Bekor qilingan va to\'lamay ketgan buyurtmalar');
```
to:
```ts
  sectionTitle(doc, 'Bekor qilingan buyurtmalar');
```

If `sumStrings` has no other caller in this file after the deletion, leave it — it is a shared helper, not walkout-specific.

This file has **9 pre-existing type errors**. Do not attempt to fix them — only confirm the count does not rise.

- [ ] **Step 5: Fix the two remaining comments and the terminal-status list**

`stock.service.ts` line 101 — the comment reads:
```ts
   * DRAFT and SENT — same rules as before; WALKOUT never calls this).
```
Change to:
```ts
   * DRAFT and SENT — same rules as before).
```

`table.repo.ts` line 8 — delete `OrderStatus.WALKOUT,` from the terminal-status array, leaving `CLOSED` and `CANCELED`.

- [ ] **Step 6: Verify**

```bash
cd apps/master
npx tsc -b 2>&1 | grep -cE "error TS"
npx tsc -b 2>&1 | sed 's/(.*//' | sort | uniq -c | sort -rn | head -12
```
Expected: total **≤ 49** — `pdf-report.ts` should now show fewer than its baseline 9 if any of them sat in deleted code, and must never show more.

- [ ] **Step 7: Run the end-to-end smoke**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml exec master-dev bash -lc \
  "rm -f apps/master/prisma/dev.db && pnpm --filter @chayxana/master exec prisma migrate deploy && pnpm --filter @chayxana/master exec tsx prisma/seed.ts"
docker compose -f compose.dev.yaml restart master-dev
docker compose -f compose.dev.yaml exec master-dev \
  pnpm --filter @chayxana/master exec tsx scripts/smoke-e2e-flow.ts
docker compose -f compose.dev.yaml exec master-dev \
  pnpm --filter @chayxana/master exec tsx scripts/smoke-stock-count.ts
```
Expected: both pass.

- [ ] **Step 8: Confirm src is clean**

```bash
grep -rin "walkout" apps/master/src | grep -v "audit-labels"
```
Expected: **no matches.** (`lib/audit-labels.ts` keeps the historical label on purpose — see Task 2 Step 3.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(finance): remove the last walkout reads on the server

Kunlik moliya loses walkoutOrders and walkoutLoss, /api/me/today-stats loses
ordersWalkout, the Telegram daily and range digests lose their walkout lines,
and the PDF report loses its walkout tile and table. table.repo's terminal
status list is now closed plus canceled.

apps/master/src is free of walkout references. smoke-e2e-flow and
smoke-stock-count pass."
```

---

### Task 6: Update the scripts

Four scripts reference walkout. One exists only to test it.

**Files:**
- Delete: `apps/master/scripts/smoke-prd13-walkout.ts`
- Modify: `apps/master/scripts/simulate-confirm-flow.ts:3,128-133,287-299,364`
- Modify: `apps/master/scripts/simulate-debts-avans-flow.ts:346,356`
- Modify: `apps/master/scripts/smoke-prd13-clock-isolation.ts:7,66-68,81,104,107`

**Interfaces:**
- Consumes: Task 5 — the server has no walkout code.
- Produces: no script references walkout.

- [ ] **Step 1: Delete the walkout-only smoke**

```bash
cd /Users/uzmacbook/dev/lab/project02
git rm apps/master/scripts/smoke-prd13-walkout.ts
```

- [ ] **Step 2: Cut the walkout scenario from simulate-confirm-flow.ts**

Delete the `walkout()` helper (lines 128-133), the whole `scenarioWalkout()` function (lines 287-299), and its call site (line 364). Line 3's header comment reads `//   DRAFT → SENT → WALKOUT` — delete that line.

Note: the root CLAUDE.md records that several `simulate-*.ts` scripts already carry pre-v0.1.3 expectations and fail against current behaviour. **Do not try to make this script green** — only remove the walkout parts. If it failed before this task, it may still fail after; say so in the commit body.

- [ ] **Step 3: Fix the two assertions in simulate-debts-avans-flow.ts**

Line 346 — remove `walkoutOrders: number;` from the inline `sales` type. Line 356 — delete:
```ts
eq('sales.walkoutOrders', report.sales.walkoutOrders, 0);
```

- [ ] **Step 4: Fix smoke-prd13-clock-isolation.ts**

This script proves order lifecycle timestamps come from the server clock, not the client. Its walkout leg is now impossible.

Lines 66-68 — delete the `// d) SENT → WALKOUT` step and both lines that call `orderRepo.setWalkout` and check its result. Line 81 — delete `{ field: 'walkoutAt', value: row.walkoutAt },` from the checked-field list. Line 7 — the header comment lists `sentAt, closedAt, walkoutAt` — remove `walkoutAt`. Lines 104-107 — the trailing note tells a future reader to grep for `closedAt\|walkoutAt` in the controller; drop `walkoutAt` from that grep string.

The remaining legs (sentAt, closedAt, canceledAt) must still run and pass — this script's job is unchanged.

- [ ] **Step 5: Verify the clock-isolation smoke still passes**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml exec master-dev \
  pnpm --filter @chayxana/master exec tsx scripts/smoke-prd13-clock-isolation.ts
```
Expected: passes with the remaining lifecycle fields.

- [ ] **Step 6: Confirm scripts are clean**

```bash
grep -rin "walkout" apps/master/scripts
```
Expected: **no matches.**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(scripts): drop the walkout legs from the smokes

Deletes smoke-prd13-walkout.ts outright, removes the walkout scenario from
simulate-confirm-flow, the walkoutOrders assertion from simulate-debts-avans-flow,
and the walkoutAt leg from the clock-isolation smoke — whose remaining sentAt,
closedAt and canceledAt legs still pass."
```

---

### Task 7: Drop the schema

Everything above is gone, so nothing references the columns or the enum member. Do this last.

**Files:**
- Modify: `apps/master/src/main/server/repositories/order.repo.ts:74`
- Modify: `apps/master/src/main/server/services/order.service.ts:777`
- Modify: `apps/master/prisma/schema.prisma:35,170,336-337,345,357`
- Create: `apps/master/prisma/migrations/<timestamp>_drop_walkout/migration.sql`

**Interfaces:**
- Consumes: Tasks 1-6 removed every *reader* of the walkout columns and DTO fields. **Two code references to `OrderStatus.WALKOUT` deliberately survive into this task** and must go before the enum member can be dropped — see Step 0.
- Produces: `OrderStatus` is `DRAFT | SENT | CLOSED | CANCELED`. `Order` has no walkout columns.

- [ ] **Step 0: Remove the last two enum references**

Task 1 left both of these on purpose, because they were still valid while the enum member existed. Drop the enum member without fixing them first and `tsc -b` gains two errors.

`apps/master/src/main/server/repositories/order.repo.ts:74` — the terminal-status exclusion for "does this table have a live order":
```ts
          notIn: [OrderStatus.CLOSED, OrderStatus.WALKOUT, OrderStatus.CANCELED],
```
becomes
```ts
          notIn: [OrderStatus.CLOSED, OrderStatus.CANCELED],
```

`apps/master/src/main/server/services/order.service.ts:777` — `reprintBill`'s guard, which allowed reprinting a bill for a closed or walked-out order:
```ts
    if (order.status !== OrderStatus.CLOSED && order.status !== OrderStatus.WALKOUT) {
```
becomes
```ts
    if (order.status !== OrderStatus.CLOSED) {
```

A walkout never had a printed bill to reprint — `applyTotals` only ever ran inside `confirm` — so narrowing this guard removes a branch that could never usefully fire.

Verify before touching the schema:
```bash
cd /Users/uzmacbook/dev/lab/project02
grep -rn "OrderStatus.WALKOUT" apps/master/src
```
Expected: **no matches.** Only then proceed to Step 1.

- [ ] **Step 1: Edit the schema**

In `apps/master/prisma/schema.prisma`:

Line 35 — delete `WALKOUT` from `enum OrderStatus`.

Line 170 — delete from `model User`:
```prisma
  ordersWalkoutMarked Order[]    @relation("OrderWalkoutMarker")
```

Lines 336-337 — delete from `model Order`:
```prisma
  walkoutAt              DateTime?
  walkoutById            String?
```

Line 345 — delete:
```prisma
  walkoutBy       User?           @relation("OrderWalkoutMarker", fields: [walkoutById], references: [id])
```

Line 357 — delete `@@index([walkoutAt])`.

**Leave `WALKOUT_MARKED` in `enum AuditAction` (line 95).** `AuditLog` is append-only and historical rows were written with that value; removing the vocabulary would make the log unreadable. This is deliberate and is specified in the design doc §2.

- [ ] **Step 2: Generate the migration**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml exec master-dev bash -lc \
  "cd apps/master && npx prisma migrate dev --name drop_walkout --create-only"
```

Read the generated SQL before applying. SQLite cannot drop a column in place on older versions, so Prisma will emit a table rebuild.

**Critical:** migration `20260607041034` rebuilt the `Order` table once before and silently dropped the partial unique index behind "one active order per table" — that index is still missing today (`CURRENT_WORKFLOW.md` §11 defect 7). Diff the generated `CREATE TABLE` against the current schema and confirm **every remaining index and foreign key is recreated**. If the generated SQL drops anything other than the two walkout columns and `Order_walkoutAt_idx`, fix it by hand.

- [ ] **Step 3: Apply and verify the table shape**

```bash
docker compose -f compose.dev.yaml exec master-dev bash -lc \
  "cd apps/master && npx prisma migrate deploy && npx prisma generate"
```

`prisma db execute` does **not** work for this check — it requires `--schema` or `--url`, and it never prints `SELECT` or `PRAGMA` output. Task 1 hit this. Use a throwaway script instead. Create `apps/master/scripts/tmp-check-order-shape.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
  'PRAGMA table_info("Order")',
);
const indexes = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
  'PRAGMA index_list("Order")',
);
console.log('columns:', columns.map((c) => c.name).sort().join(', '));
console.log('indexes:', indexes.map((i) => i.name).sort().join(', '));
await prisma.$disconnect();
```

Run it, read the output, then **delete the file before committing** — it is a probe, not a fixture:

```bash
docker compose -f compose.dev.yaml exec master-dev \
  pnpm --filter @chayxana/master exec tsx scripts/tmp-check-order-shape.ts
rm apps/master/scripts/tmp-check-order-shape.ts
```

Expected: no `walkoutAt` or `walkoutById` in the column list; the index list still carries one entry per remaining `@@index` declaration (`status`, `waiterId`, `tableId`, `createdAt`, `closedAt`, `sentAt`) plus SQLite's autoindexes, with none lost.

- [ ] **Step 4: Full gate**

```bash
cd apps/master
npx tsc -b 2>&1 | grep -cE "error TS"
pnpm run typecheck:renderer
pnpm run typecheck:gallery
pnpm exec electron-vite build
```
Expected: error count ≤ 49, both renderer gates clean, build succeeds.

- [ ] **Step 5: Re-seed and run every live smoke**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml exec master-dev bash -lc \
  "rm -f apps/master/prisma/dev.db && pnpm --filter @chayxana/master exec prisma migrate deploy && pnpm --filter @chayxana/master exec tsx prisma/seed.ts"
docker compose -f compose.dev.yaml restart master-dev
for s in smoke-e2e-flow smoke-stock-count smoke-finance-pnl smoke-cashflow-reversal smoke-summary-report; do
  echo "=== $s ==="
  docker compose -f compose.dev.yaml exec master-dev \
    pnpm --filter @chayxana/master exec tsx scripts/$s.ts || echo "FAILED: $s"
done
docker compose -f compose.dev.yaml down
```
Expected: all five pass. Any failure blocks this task — do not commit past it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(schema): drop the WALKOUT status and its columns

Removes OrderStatus.WALKOUT, Order.walkoutAt, Order.walkoutById, the
OrderWalkoutMarker relation and the walkoutAt index. AuditAction keeps
WALKOUT_MARKED on purpose — AuditLog is append-only and historical rows were
written with it.

The table rebuild was diffed against the current schema to confirm every
remaining index and foreign key is recreated, since migration 20260607041034
lost the one-active-order-per-table index exactly this way.

All five live smokes pass. tsc -b down to 49 pre-existing errors."
```

---

### Task 8: Update the docs

The docs still describe a state machine that no longer exists. Leaving them is how the next session gets misled.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/CURRENT_WORKFLOW.md`
- Modify: `docs/agent-plans/00-shared/decisions.md`
- Modify: `docs/superpowers/specs/2026-08-14-money-model-design.md`

**Interfaces:**
- Consumes: Tasks 1-7 complete.
- Produces: no doc claims WALKOUT exists.

- [ ] **Step 1: CLAUDE.md**

Under "Domain rules to respect", the order state machine bullet reads:

> The graph is `DRAFT → SENT → CLOSED`, with `SENT → WALKOUT` and `DRAFT|SENT → CANCELED` as terminal branches.

Change to:

> The graph is `DRAFT → SENT → CLOSED`, with `DRAFT|SENT → CANCELED` as the only terminal branch. There is no `WALKOUT` — an unpaid bill is closed as nasiya or as a full discount with a reason.

In the same section, the stock bullet reads `only WALKOUT consumes without restoring` — change to `every cancellation restores; nothing consumes without restoring`.

- [ ] **Step 2: docs/CURRENT_WORKFLOW.md**

Update §2 (the money path) and §11 (known defects):

- Remove walkout from the state machine wherever it appears.
- **Delete defect 3** ("Walkout loss is structurally always zero") — it no longer exists. Note in §13's changelog that it was removed by deletion, not fixed.
- **Mark defect 12 stale** ("A fully-comped order can never be closed"): it cites `ConfirmModal.tsx:131`, a file the C1 rebuild deleted. `OrderTicket.tsx:56-58` gates on `paid === due`, so a fully-discounted order closes today. Replace the defect text with a one-line note saying it was verified fixed on 2026-08-14.
- Renumber the remaining defects and update the header count.

- [ ] **Step 3: docs/agent-plans/00-shared/decisions.md**

This file is marked "locked — don't change without explicit instruction". This slice is that instruction. Add an append-only note at the end of the order-lifecycle section:

```markdown
**Amended 2026-08-14:** `WALKOUT` is removed from the product. The lifecycle is
`DRAFT → SENT → CLOSED` with `DRAFT|SENT → CANCELED` as the only terminal branch.
An unpaid bill is closed as nasiya or as a full discount with a mandatory reason.
See `docs/superpowers/specs/2026-08-14-money-model-design.md` §7.
```

Do not edit the original text above it — this file is append-only by convention.

- [ ] **Step 4: Mark the spec slice done**

In `docs/superpowers/specs/2026-08-14-money-model-design.md`, change the `**Status:**` line in the header from `designed, not implemented` to:

```markdown
**Status:** slice 1 (WALKOUT removal) implemented 2026-08-14; slices 2-5 outstanding
```

In §11, mark slice 1 as done with its commit range.

- [ ] **Step 5: Final sweep across the whole repo**

```bash
cd /Users/uzmacbook/dev/lab/project02
grep -rin "walkout" --include="*.ts" --include="*.tsx" --include="*.prisma" --include="*.md" \
  apps docs CLAUDE.md \
  | grep -v "docs/archive\|UI_UX_LAYOUT_AUDIT\|AUDIT_FINDINGS\|PRD_FOUNDATION\|superpowers/specs\|superpowers/plans\|prisma/migrations\|audit-labels"
```
Expected: **no matches.** Five things are allowed to keep mentioning it and are filtered out above: historical audit documents, the design spec, this plan, the migration SQL, and the kept `WALKOUT_MARKED` label in `lib/audit-labels.ts`. They are records of what happened, not live code paths.

Then run the Uzbek sweep across every app, since the English one cannot see user-facing copy:

```bash
grep -rniE "to.{0,2}lama" --include="*.ts" --include="*.tsx" apps
```

Expected: **exactly one match** — `To‘lamay ketdi` in `lib/audit-labels.ts`, the kept historical label. Every other hit is stale copy promising a feature that no longer exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: record that walkout is gone

CLAUDE.md and CURRENT_WORKFLOW.md described a state machine that no longer
exists. Deletes CURRENT_WORKFLOW defect 3 (walkout loss structurally zero) as
removed-by-deletion and marks defect 12 stale — it cites the ConfirmModal the
C1 rebuild deleted, and OrderTicket already allows a fully-discounted close.

decisions.md gets an append-only amendment; the original locked text is
untouched."
```

---

## Verification summary

After all eight tasks:

| Gate | Command | Expected |
|---|---|---|
| Main process | `cd apps/master && npx tsc -b 2>&1 \| grep -cE "error TS"` | **49**, all pre-existing. Measured: the 50-error baseline dropped to 49 in Task 5 because one of `pdf-report.ts`'s nine pre-existing errors lived inside the walkout table that Task 5 deleted (that file went 9 → 8). Never higher than 49 after Task 5. |
| Renderer | `cd apps/master && pnpm run typecheck:renderer` | clean |
| Gallery | `cd apps/master && pnpm run typecheck:gallery` | clean |
| Build | `cd apps/master && pnpm exec electron-vite build` | succeeds |
| Order app | `pnpm --filter @chayxana/order typecheck` | clean |
| Mobile app | `pnpm --filter @chayxana/mobile typecheck` | clean |
| Live smokes | the five in Task 7 Step 5 | all pass |
| Screens | `cd apps/master && pnpm gallery:page` | all 15 render at 1366×768 |
| Sweep | the grep in Task 8 Step 5 | no matches |

## Out of scope

Do not touch in this slice — each is its own later slice or an open decision:

- Discount simplification (slice 2), order-line editing (slice 3), cost price (slice 4), waiter pay (slice 5)
- `serviceChargeWaived` / `waiveServiceCharge` — dead but flagged for a separate call, design doc §9
- ADMIN reading `pnl.profit` over `/api/finance/daily`
- The missing one-active-order-per-table index — **read** the warning in Task 7 Step 2 so the rebuild does not lose more indexes, but do not restore it here
- The 51 pre-existing `tsc -b` errors in `src/main`
