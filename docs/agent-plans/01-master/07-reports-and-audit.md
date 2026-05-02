# Phase 01-master / 07 — Reports and audit log

**Goal:** owner sees daily and monthly reports with all locked-in metrics. Audit log is browsable, paginated, filterable. Draft cleanup runs nightly. Master backend is feature-complete.

**Prerequisites:** `01-master/06-stock-tracking.md` complete and verified.

**Estimated scope:** medium. Aggregation queries, the report DTO computation, and two new screens. The audit log screen is straightforward; the daily report has more business logic.

---

## Read these files before starting

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md` ← reports + audit sections
- `docs/agent-plans/00-shared/api-contract.md` ← report DTO shapes

## Context

This is the last phase for the master app. After this, the master is operationally complete and we move to the kitchen app. The owner needs:

1. **Daily report** for the day-to-day "how did we do today" check. Includes order counts, gross/net revenue, discounts, service collected, payment breakdown, per-waiter performance, cancellations, walkouts.
2. **Monthly report** for the month-end view. Aggregate plus day-by-day rows.
3. **Audit log** for catching abuse. Filterable list of every sensitive admin/owner action.

Neither requires complex queries — they're aggregations over `Order`, `Payment`, and `AuditLog` tables that we already index appropriately.

## Tasks

### 1. Implement report service

**`apps/master/src/main/server/services/report.service.ts`**

```ts
import { getPrisma } from '../lib/prisma';

export const reportService = {
  async daily(date: Date) {
    const prisma = getPrisma();
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Fetch all orders that ended (CLOSED, WALKOUT, CANCELED) within the day
    // PLUS orders that are still open today. We aggregate on the closed/canceled ones.
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { closedAt: { gte: dayStart, lt: dayEnd } },
          { canceledAt: { gte: dayStart, lt: dayEnd } },
        ],
      },
      include: {
        payments: true,
        waiter: { select: { id: true, fullName: true } },
        appliedDiscount: true,
      },
    });

    // Buckets
    const closed = orders.filter((o) => o.status === 'CLOSED');
    const canceled = orders.filter((o) => o.status === 'CANCELED');
    const walkouts = orders.filter((o) => o.status === 'WALKOUT');

    // Revenue calculations (only from CLOSED orders)
    let gross = 0n;
    let discountTotal = 0n;
    let serviceTotal = 0n;
    let cashTotal = 0n;
    let cardTotal = 0n;

    for (const o of closed) {
      gross += BigInt(o.subtotalSnapshot?.toFixed(0) ?? '0');
      discountTotal += BigInt(o.discountAmountSnapshot?.toFixed(0) ?? '0');
      serviceTotal += BigInt(o.serviceChargeSnapshot?.toFixed(0) ?? '0');
      for (const p of o.payments) {
        const amt = BigInt(p.amount.toFixed(0));
        if (p.method === 'CASH') cashTotal += amt;
        if (p.method === 'CARD') cardTotal += amt;
      }
    }

    const netRevenue = gross - discountTotal;

    // Per-waiter aggregation
    const perWaiter = new Map<string, { id: string; name: string; orders: number; revenue: bigint; serviceEarned: bigint }>();
    for (const o of closed) {
      const w = perWaiter.get(o.waiterId) ?? {
        id: o.waiterId,
        name: o.waiter.fullName,
        orders: 0,
        revenue: 0n,
        serviceEarned: 0n,
      };
      w.orders += 1;
      w.revenue += BigInt(o.subtotalSnapshot?.toFixed(0) ?? '0') - BigInt(o.discountAmountSnapshot?.toFixed(0) ?? '0');
      w.serviceEarned += BigInt(o.serviceChargeSnapshot?.toFixed(0) ?? '0');
      perWaiter.set(o.waiterId, w);
    }

    // Cancellations log (also pull cancel reason)
    const cancellationsList = canceled.map((o) => ({
      orderId: o.id,
      canceledAt: o.canceledAt!.toISOString(),
      canceledBy: 'system', // TODO: enrich from audit log if needed
      reason: o.cancelReason ?? '',
    }));

    // Walkouts log
    const walkoutsList = walkouts.map((o) => ({
      orderId: o.id,
      markedAt: o.updatedAt.toISOString(),
      markedBy: o.approvedById ?? 'unknown',
      amount: o.totalSnapshot?.toString() ?? '0',
      reason: o.cancelReason ?? '',
    }));

    return {
      date: dayStart.toISOString().slice(0, 10),
      orders: {
        closed: closed.length,
        canceled: canceled.length,
        walkout: walkouts.length,
        total: orders.length,
      },
      revenue: {
        gross: gross.toString(),
        discounts: discountTotal.toString(),
        net: netRevenue.toString(),
      },
      serviceCollected: serviceTotal.toString(),
      payments: {
        cash: cashTotal.toString(),
        card: cardTotal.toString(),
      },
      perWaiter: Array.from(perWaiter.values()).map((w) => ({
        waiterId: w.id,
        waiterName: w.name,
        orders: w.orders,
        revenue: w.revenue.toString(),
        serviceEarned: w.serviceEarned.toString(),
      })),
      cancellations: cancellationsList,
      walkouts: walkoutsList,
    };
  },

  async monthly(monthStart: Date) {
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // Compute per-day reports for the whole month
    const days: Array<Awaited<ReturnType<typeof reportService.daily>>> = [];
    const cursor = new Date(monthStart);
    while (cursor < monthEnd) {
      days.push(await reportService.daily(new Date(cursor)));
      cursor.setDate(cursor.getDate() + 1);
    }

    // Aggregate
    const agg = days.reduce(
      (acc, d) => ({
        ordersClosed: acc.ordersClosed + d.orders.closed,
        ordersCanceled: acc.ordersCanceled + d.orders.canceled,
        ordersWalkout: acc.ordersWalkout + d.orders.walkout,
        gross: acc.gross + BigInt(d.revenue.gross),
        discounts: acc.discounts + BigInt(d.revenue.discounts),
        net: acc.net + BigInt(d.revenue.net),
        service: acc.service + BigInt(d.serviceCollected),
        cash: acc.cash + BigInt(d.payments.cash),
        card: acc.card + BigInt(d.payments.card),
      }),
      { ordersClosed: 0, ordersCanceled: 0, ordersWalkout: 0, gross: 0n, discounts: 0n, net: 0n, service: 0n, cash: 0n, card: 0n },
    );

    return {
      month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      totals: {
        ordersClosed: agg.ordersClosed,
        ordersCanceled: agg.ordersCanceled,
        ordersWalkout: agg.ordersWalkout,
        gross: agg.gross.toString(),
        discounts: agg.discounts.toString(),
        net: agg.net.toString(),
        serviceCollected: agg.service.toString(),
        payments: { cash: agg.cash.toString(), card: agg.card.toString() },
      },
      daily: days,
    };
  },
};
```

Note the use of `BigInt` for accumulation — UZS values can be large and we want exact integer math. Convert to/from `Decimal.toFixed(0)` since UZS has no decimals.

### 2. Wire reports controller

Replace the stub controller from phase 03 with the real implementation:

**`apps/master/src/main/server/controllers/reports.controller.ts`**

```ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportService } from '../services/report.service';
import { Errors } from '../lib/errors';

const dailyQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const monthlyQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

export const reportsController = {
  async daily(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = dailyQuery.parse(req.query);
      const report = await reportService.daily(new Date(date));
      res.json(report);
    } catch (e) {
      next(e);
    }
  },

  async monthly(req: Request, res: Response, next: NextFunction) {
    try {
      const { month } = monthlyQuery.parse(req.query);
      const [y, m] = month.split('-').map((s) => parseInt(s, 10));
      if (!y || !m) throw Errors.Validation('Invalid month');
      const report = await reportService.monthly(new Date(y, m - 1, 1));
      res.json(report);
    } catch (e) {
      next(e);
    }
  },
};
```

Routes already exist from phase 03 with `requireRole(['OWNER'])`.

### 3. Wire audit controller

Audit service from phase 02 already has `list(filters)`. Controller already exists from phase 03. Verify it correctly accepts query params (`action`, `userId`, `from`, `to`, `page`, `pageSize`) and returns paginated results.

### 4. Build the Reports page (UI)

**`apps/master/src/renderer/pages/ReportsPage.tsx`**

- **Header**: tab switcher between "Kunlik" (Daily) and "Oylik" (Monthly).
- **Kunlik tab**:
  - Date picker (defaults to today).
  - Fetch on date change via TanStack Query.
  - Show all metrics from the daily DTO in a clean section-based layout:
    - "Buyurtmalar" — counts of CLOSED / CANCELED / WALKOUT.
    - "Daromad" — gross, discounts, net.
    - "Xizmat haqi" — service collected (with note "ofitsiantlarga ajratiladi").
    - "To'lovlar" — cash + card.
    - "Ofitsiantlar" — table of per-waiter breakdown.
    - "Bekor qilingan buyurtmalar" — list (orderId, time, reason).
    - "To'lovsiz ketganlar" — list (orderId, time, amount, reason).
- **Oylik tab**:
  - Month picker (defaults to current month).
  - Aggregate totals at top.
  - Day-by-day table below: date, orders count, net revenue, discounts, walkouts.

Use `formatUZS` for all amounts. Use `formatDateTimeUZ` for timestamps.

Add the route to App.tsx and the sidebar entry "Hisobotlar" (Reports) — only visible if `user.role === 'OWNER'`.

### 5. Build the Audit Log page (UI)

**`apps/master/src/renderer/pages/AuditPage.tsx`**

- Header: title + filter controls.
- Filters:
  - Action dropdown (with all `AuditAction` values, plus "Hammasi" for "all").
  - User filter (search-style — type to filter).
  - Date range picker (from/to).
- Table:
  - When (timestamp).
  - Who (user fullName).
  - What (action enum, with friendly Uzbek labels).
  - Entity (entityType + entityId, click to navigate to the entity if applicable).
  - Details (compact JSON of metadata, expandable).
- Pagination at the bottom.

Add route + sidebar entry "Audit jurnali" (Audit log) — owner-only.

### 6. Add the draft cleanup scheduler

**`apps/master/src/main/server/lib/scheduler.ts`**

```ts
import { getPrisma } from './prisma';

let interval: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (interval) return;
  // Run cleanup once on boot, then every 6 hours
  void runDraftCleanup();
  interval = setInterval(runDraftCleanup, 6 * 60 * 60 * 1000);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

async function runDraftCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const result = await getPrisma().order.deleteMany({
      where: {
        status: 'DRAFT',
        createdAt: { lt: cutoff },
        kitchenTickets: { none: {} },
      },
    });
    if (result.count > 0) {
      console.log(`[scheduler] cleaned ${result.count} stale drafts`);
    }
  } catch (err) {
    console.error('[scheduler] draft cleanup failed:', err);
  }
}
```

Call `startScheduler()` from `apps/master/src/main/index.ts` after `startServer()` succeeds.

### 7. Polish: friendly Uzbek labels for audit actions

Create `apps/master/src/renderer/lib/audit-labels.ts`:

```ts
export const AUDIT_LABELS: Record<string, string> = {
  USER_CREATED: 'Foydalanuvchi yaratildi',
  USER_DEACTIVATED: 'Foydalanuvchi o\u2018chirildi',
  DISCOUNT_CREATED: 'Chegirma yaratildi',
  DISCOUNT_EDITED: 'Chegirma o\u2018zgartirildi',
  DISCOUNT_DELETED: 'Chegirma o\u2018chirildi',
  DISCOUNT_APPLIED: 'Chegirma qo\u2018llanildi',
  ORDER_CANCELED: 'Buyurtma bekor qilindi',
  WALKOUT_MARKED: 'To\u2018lovsiz ketdi',
  TABLE_TRANSFERRED: 'Stol o\u2018zgartirildi',
  RECEIPT_REPRINTED: 'Chek qaytadan chop etildi',
  SETTINGS_CHANGED: 'Sozlama o\u2018zgartirildi',
  SERVICE_CHARGE_WAIVED: 'Xizmat haqi olib tashlandi',
  DAILY_STOCK_SET: 'Kunlik zaxira belgilandi',
  DAILY_STOCK_ADJUSTED: 'Zaxira qo\u2018lda o\u2018zgartirildi',
};
```

## Constraints

- **No charts.** Plain numbers and tables.
- **No CSV / PDF export.** Phase 2.
- **No real-time auto-refresh on reports.** Reports are point-in-time queries. User clicks date → fetches once.
- **No comparison with previous periods.** Single-period reports.
- Reports route is `requireRole(['OWNER'])`. Audit route is `requireRole(['OWNER'])`. Admin sees neither.
- Do not change existing services beyond the report service's introduction.
- Do not change schema.
- BigInt math for revenue; Decimal at the boundary only.

## Verification gate

### V1. Typecheck

```sh
pnpm typecheck
```

### V2. Daily report renders

Login as owner. Navigate to Reports. Date picker defaults to today. If today has data (from prior verification flows), report shows numbers. If empty, all zeros.

### V3. Daily report numbers add up

Generate some test data:

1. Login as waiter, create 3 orders, complete them all (1 cash, 1 card, 1 mixed).
2. Cancel a 4th order.
3. Mark a 5th as walkout.
4. Login as owner, view today's report.

Verify:

- `orders.closed === 3`, `canceled === 1`, `walkout === 1`.
- `payments.cash + payments.card` equals `revenue.net + serviceCollected`.
- Per-waiter row for the waiter shows correct order count.
- Cancellations and walkouts lists are populated.

### V4. Monthly report

Switch to Oylik tab. Pick current month. Aggregate row at top should equal sum of daily rows in the table below.

### V5. Audit log

Navigate to "Audit jurnali". Page shows the most recent audit entries. Filter by `DISCOUNT_APPLIED` — verify only those entries appear. Filter by date range — verify boundary correctness.

### V6. Role gating

Login as admin. Reports and Audit nav items should not appear in sidebar. Direct URL navigation to `/reports` or `/audit` redirects to dashboard (or shows "permission denied" message).

### V7. Draft cleanup

Manually create a draft, then advance the system clock or directly run:

```sh
cd apps/master
pnpm tsx -e "
import { getPrisma } from './src/main/server/lib/prisma';
const prisma = getPrisma();
await prisma.order.create({
  data: {
    orderType: 'DINE_IN',
    status: 'DRAFT',
    waiter: { connect: { id: '<seeded-waiter-id>' } },
    table: { connect: { id: '<seeded-table-id>' } },
    createdAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
  },
});
await prisma.\$disconnect();
"
```

Then trigger the cleanup function manually (call `runDraftCleanup` directly via a script, or restart the dev server which calls it on boot). Verify the old draft is gone.

### V8. End-to-end regression

Run a full happy path through the master UI: login waiter → order → kitchen → bill → approve → mark paid. Verify no regressions from previous phases.

## Definition of done

- [ ] `report.service.ts` implemented with `daily` and `monthly` methods.
- [ ] Reports controller exposes both endpoints with proper role gate.
- [ ] Reports page renders and shows correct numbers.
- [ ] Audit log page lists entries with filters.
- [ ] Both pages show only for OWNER role.
- [ ] Draft cleanup scheduler running.
- [ ] Daily report math verified by manual cross-check (V3).
- [ ] Typecheck passes.
- [ ] Master backend is now feature-complete: all interview-locked features implemented except for what was deliberately deferred (offline mode for waiter app, exports, charts).

When all are checked, stop. The master app track is complete. Move to phase `02-kitchen/00-scaffolding.md`.
