import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { debtRepo } from '../repositories/debt.repo';
import { expenseRepo } from '../repositories/expense.repo';
import { expenseService } from './expense.service';
import { reportsService } from './reports.service';
import { localDayKey, localDayRange } from '../lib/time';

// Ingredient-purchase expenses live in this seeded category; they're shown in
// the Xaridlar block, NOT counted as operating expenses — otherwise daily P&L
// would double-count (purchase cash → "chiqim", then COGS when sold = same money twice).
const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

const MS_PER_DAY = 86_400_000;

function decStr(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(0);
}

/**
 * Admin-facing daily money flow. This is the operational view: what came in,
 * what went out, today's drawer movement, debt outstanding. NO profit.
 *
 * Owner uses /api/reports/daily for the full P&L picture. Admin uses this.
 */
export const financeService = {
  /**
   * Admin daily finance. Now a thin projection over `reportsService.dailyLedger`
   * plus admin-only detail lists (per-purchase, per-expense, per-closed-order
   * drill-down, and lifetime outstanding-debt). The canonical numbers — sales,
   * cashflow, outflow, P&L — come from one place; the legacy shape below is
   * preserved so FinancePage keeps working until T10 switches to `ledger.*`.
   *
   * Renderer hides `pnl.profit` from admin role; we still emit it because
   * removing it without renderer changes would break the "Yakun" card.
   */
  async dailyForAdmin(date: Date) {
    const localDay = localDayKey(date);
    const { start: dayStart, end: dayEnd } = localDayRange(date);
    const prisma = getPrisma();

    // Canonical numbers — single source of truth.
    const ledger = await reportsService.dailyLedger(localDay);

    // Admin-only extras: per-row drill-downs the canonical DTO doesn't expose,
    // plus expense item details and lifetime outstanding debts.
    const [
      purchases,
      expenseSummary,
      operatingExpenseSummary,
      closedOrderRows,
      walkoutOrderRows,
      outstandingDebtsAsOfDay,
    ] = await Promise.all([
      prisma.purchase.findMany({
        // Drill-down list and totals must only count ACTIVE purchases. A
        // reversed/deleted batch would otherwise show in the "Xaridlar (ombor)"
        // block AND inflate purchasesTotal, while its Expense row already nets
        // to 0 — admin would see a mismatch (xaridlar > expensesNet).
        where: {
          occurredAt: { gte: dayStart, lt: dayEnd },
          status: 'ACTIVE',
        },
        include: { ingredient: { select: { id: true, name: true, buyUnit: true } } },
        orderBy: [{ occurredAt: 'asc' }],
      }),
      expenseService.listByDate(date),
      expenseService.listByDate(date, {
        excludeCategoryIds: [INGREDIENT_EXPENSE_CATEGORY_ID],
      }),
      prisma.order.findMany({
        where: { status: OrderStatus.CLOSED, closedAt: { gte: dayStart, lt: dayEnd } },
        select: {
          id: true,
          closedAt: true,
          totalSnapshot: true,
          waiter: { select: { fullName: true } },
          table: { select: { name: true } },
        },
        orderBy: [{ closedAt: 'asc' }],
      }),
      prisma.order.findMany({
        where: { status: OrderStatus.WALKOUT, walkoutAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true, totalSnapshot: true },
      }),
      // Outstanding-as-of-EOD for the *selected* day, not the current lifetime.
      // Pre-fix this used sumOutstanding() (current snapshot), so admin viewing
      // a past day saw "today's" outstanding instead of "that day's" — and
      // it disagreed with owner's number.
      debtRepo.sumOutstandingAsOf(date),
    ]);

    // Numbers below come from the ledger; expense detail comes from the local
    // listByDate calls (their items array is admin-only and not in canonical).
    const grossSales = new Prisma.Decimal(ledger.sales.gross);
    const discounts = new Prisma.Decimal(ledger.sales.discount);
    const netSales = new Prisma.Decimal(ledger.sales.netSales);
    const serviceCharge = new Prisma.Decimal(ledger.sales.serviceCharge);
    const cashIn = new Prisma.Decimal(ledger.cashflow.orderCash);
    const cardIn = new Prisma.Decimal(ledger.cashflow.orderCard);
    const debtOpened = new Prisma.Decimal(ledger.sales.debtSales);
    const debtRepaidCash = new Prisma.Decimal(ledger.cashflow.debtRepaidCash);
    const debtRepaidCard = new Prisma.Decimal(ledger.cashflow.debtRepaidCard);
    const expenseReturnsTotal = new Prisma.Decimal(ledger.cashflow.expenseReturns);
    const expensesNet = new Prisma.Decimal(ledger.outflow.expenseNet);
    const operatingExpense = new Prisma.Decimal(ledger.outflow.operatingExpense);
    const pendingRepayable = new Prisma.Decimal(ledger.outflow.pendingRepayable);
    const purchasesTotal = new Prisma.Decimal(ledger.outflow.ingredientPurchases);
    const mealsRevenue = ledger.lines.mealSales.reduce(
      (sum, row) => sum.plus(row.grossRevenue),
      new Prisma.Decimal(0),
    );
    const mealsCogs = new Prisma.Decimal(ledger.pnl.cogs);

    const walkoutLoss = walkoutOrderRows.reduce(
      (sum, o) => sum.plus(o.totalSnapshot ?? 0),
      new Prisma.Decimal(0),
    );

    // Drawer math: real cash that crossed the till today.
    //   totalIn  = sales-cash + sales-card + debt-repaid + expense-returns
    //   totalOut = expenseNet (cash that actually left through the expense
    //              register — purchases live inside Expense too, so this
    //              covers them without double-count)
    const totalIn = cashIn.plus(cardIn).plus(debtRepaidCash).plus(debtRepaidCard).plus(expenseReturnsTotal);
    const totalOut = expensesNet;
    const drawerMovement = totalIn.minus(totalOut);

    return {
      date: ledger.date,
      sales: {
        closedOrders: ledger.sales.closedCount,
        walkoutOrders: ledger.sales.walkoutCount,
        grossSales: ledger.sales.gross,
        discounts: ledger.sales.discount,
        netFood: ledger.sales.netSales,
        serviceCharge: ledger.sales.serviceCharge,
        billedTotal: decStr(netSales.plus(serviceCharge)),
        walkoutLoss: decStr(walkoutLoss),
      },
      cashflow: {
        cashIn: ledger.cashflow.orderCash,
        cardIn: ledger.cashflow.orderCard,
        debtOpened: ledger.sales.debtSales,
        debtRepaidCash: ledger.cashflow.debtRepaidCash,
        debtRepaidCard: ledger.cashflow.debtRepaidCard,
        expenseReturns: ledger.cashflow.expenseReturns,
        totalIn: decStr(totalIn),
      },
      outflow: {
        purchasesTotal: ledger.outflow.ingredientPurchases,
        purchasesCount: ledger.outflow.ingredientPurchasesCount,
        expensesGross: ledger.outflow.expenseGross,
        expensesReversal: ledger.outflow.expenseReversal,
        expensesNet: ledger.outflow.expenseNet,
        operatingExpense: ledger.outflow.operatingExpense,
        pendingRepayable: ledger.outflow.pendingRepayable,
        // Legacy duplicate of expensesNet. T10 removes this from the renderer.
        totalOut: ledger.outflow.expenseNet,
      },
      drawer: {
        movement: decStr(drawerMovement),
        outstandingDebts: decStr(outstandingDebtsAsOfDay),
      },
      // Lists for drill-down
      purchases: purchases.map((p) => ({
        id: p.id,
        occurredAt: p.occurredAt.toISOString(),
        ingredientName: p.ingredient.name,
        quantityBuyUnit: p.quantityBuyUnit.toFixed(3),
        buyUnit: p.ingredient.buyUnit,
        totalCostUzs: decStr(p.totalCostUzs),
        supplierNote: p.supplierNote,
      })),
      expensesItems: expenseSummary.items.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt,
        reason: e.reason,
        amount: e.amount,
        categoryName: e.categoryName,
        repayable: e.repayable,
        repayStatus: e.repayStatus,
        purchaseId: e.purchaseId,
        status: e.status,
      })),
      closedOrders: closedOrderRows.map((o) => ({
        id: o.id,
        closedAt: o.closedAt?.toISOString() ?? null,
        waiterName: o.waiter.fullName,
        tableName: o.table?.name ?? null,
        billedTotal: decStr(o.totalSnapshot),
      })),

      // ─── P&L view (sotuv − COGS − operatsion chiqim = sof foyda) ───
      // Per-dish revenue here is per-line snapshot (gross of any bill-level
      // discount, since v1 has no per-line discount allocation). Field is
      // named `revenue` for back-compat with FinancePage; canonical DTO
      // calls the same value `grossRevenue` to flag this.
      mealSales: ledger.lines.mealSales.map((r) => ({
        menuItemId: r.menuItemId,
        menuItemName: r.menuItemName,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        isService: r.isService,
        qty: r.qty,
        revenue: r.grossRevenue,
        cogs: r.cogs,
        profit: r.profit,
      })),
      // Category subtotals: rebuild from ledger.mealSales — categoryId+name
      // are stable across closed orders.
      mealSalesByCategory: (() => {
        type Row = {
          categoryId: string;
          categoryName: string;
          qty: number;
          revenue: Prisma.Decimal;
          cogs: Prisma.Decimal;
        };
        const map = new Map<string, Row>();
        for (const meal of ledger.lines.mealSales) {
          const existing = map.get(meal.categoryId) ?? {
            categoryId: meal.categoryId,
            categoryName: meal.categoryName,
            qty: 0,
            revenue: new Prisma.Decimal(0),
            cogs: new Prisma.Decimal(0),
          };
          existing.qty += meal.qty;
          existing.revenue = existing.revenue.plus(new Prisma.Decimal(meal.grossRevenue));
          existing.cogs = existing.cogs.plus(new Prisma.Decimal(meal.cogs));
          map.set(meal.categoryId, existing);
        }
        return Array.from(map.values())
          .sort((a, b) => Number(b.revenue) - Number(a.revenue))
          .map((c) => ({
            categoryId: c.categoryId,
            categoryName: c.categoryName,
            qty: c.qty,
            revenue: decStr(c.revenue),
            cogs: decStr(c.cogs),
            profit: decStr(c.revenue.minus(c.cogs)),
          }));
      })(),
      mealSalesTotal: {
        qty: ledger.lines.mealSales.reduce((n, r) => n + r.qty, 0),
        revenue: decStr(mealsRevenue),
        cogs: decStr(mealsCogs),
        profit: decStr(mealsRevenue.minus(mealsCogs)),
      },

      // Chiqimlar (operating only — ingredient purchases excluded; see Xaridlar block)
      operatingExpenses: operatingExpenseSummary.items.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt,
        reason: e.reason,
        amount: e.amount,
        categoryName: e.categoryName,
        repayable: e.repayable,
        repayStatus: e.repayStatus,
        status: e.status,
      })),
      operatingExpensesTotal: {
        count: operatingExpenseSummary.items.length,
        gross: operatingExpenseSummary.totals.gross,
        operating: operatingExpenseSummary.totals.operating,
      },

      // Xaridlar bloki — ingredient-purchase outflow. Informational, not in P&L outflow.
      ingredientPurchases: purchases.map((p) => ({
        id: p.id,
        occurredAt: p.occurredAt.toISOString(),
        ingredientName: p.ingredient.name,
        quantityBuyUnit: p.quantityBuyUnit.toFixed(3),
        buyUnit: p.ingredient.buyUnit,
        totalCostUzs: decStr(p.totalCostUzs),
        supplierNote: p.supplierNote,
      })),
      ingredientPurchasesTotal: {
        count: ledger.outflow.ingredientPurchasesCount,
        amount: ledger.outflow.ingredientPurchases,
      },

      // Nasiya bloki — bugun ochilgan + bugun olingan + lifetime qoldiq
      debtToday: {
        openedCount: ledger.debt.openedTodayCount,
        openedAmount: ledger.debt.openedTodayAmount,
        // collectedCount isn't in canonical DTO; lines.debtRepayments has it
        collectedCount: ledger.lines.debtRepayments.length,
        collectedAmount: ledger.debt.repaidTodayAmount,
        lifetimeOutstanding: decStr(outstandingDebtsAsOfDay),
      },

      // Daily P&L summary — canonical numbers.
      pnl: {
        revenue: ledger.pnl.revenue,
        cogs: ledger.pnl.cogs,
        operatingExpense: ledger.pnl.operatingExpense,
        profit: ledger.pnl.profit,
      },

      // Canonical DTO for renderers ready to switch (T10).
      ledger,
    };
  },

  /**
   * Per-waiter service-charge breakdown over an arbitrary date range,
   * calendar-style. Rows = waiters, columns = each day in [from, to].
   * Sourced from each CLOSED order's `serviceChargeSnapshot`, which is
   * the sum of all SERVICE-kind menu-item lines on that order at
   * close-time (see billing.service.ts:65). Used by the Salaries page.
   *
   * Day cells are keyed by local YYYY-MM-DD of `closedAt`, so the
   * grouping respects the staff's local day boundary rather than UTC.
   */
  async serviceChargeMatrix(input: { from: Date; to: Date }) {
    // Controller passes Tashkent-anchored day-start instants for from/to.
    // We need a Tashkent-day-aligned half-open window for the query and
    // one slot per Tashkent calendar day for the column list.
    const from = input.from;
    const end = localDayRange(input.to).end;

    // Build the column list — one slot per Tashkent day in the range.
    const dayKeys: string[] = [];
    const dayLabels: Array<{
      key: string;
      day: number;
      month: number;
      weekday: number;
      isMonthStart: boolean;
    }> = [];
    for (let cursor = from; cursor < end; cursor = new Date(cursor.getTime() + MS_PER_DAY)) {
      const key = localDayKey(cursor);
      const [yyyy, mm, dd] = key.split('-');
      // Tashkent and any other TZ share the same calendar-day weekday, so
      // we can read weekday by parsing the key in UTC frame.
      const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
      dayKeys.push(key);
      dayLabels.push({
        key,
        day: parseInt(dd!, 10),
        month: parseInt(mm!, 10),
        weekday,
        isMonthStart: dd === '01',
      });
    }
    const days = dayKeys.length;
    const dayIndexByKey = new Map(dayKeys.map((k, i) => [k, i] as const));

    const closedOrders = await getPrisma().order.findMany({
      where: {
        status: OrderStatus.CLOSED,
        closedAt: { gte: from, lt: end },
      },
      select: {
        waiterId: true,
        closedAt: true,
        serviceChargeSnapshot: true,
        waiter: { select: { id: true, fullName: true } },
      },
    });

    type Row = {
      waiterId: string;
      waiterName: string;
      daily: Prisma.Decimal[];
      total: Prisma.Decimal;
      orderCount: number;
    };
    const waiterMap = new Map<string, Row>();
    const dayTotals: Prisma.Decimal[] = Array.from(
      { length: days },
      () => new Prisma.Decimal(0),
    );
    let grand = new Prisma.Decimal(0);

    for (const order of closedOrders) {
      if (!order.closedAt) continue;
      // Bucket by Tashkent calendar day of closedAt, not server-local.
      const dayIdx = dayIndexByKey.get(localDayKey(order.closedAt));
      if (dayIdx === undefined) continue;

      const amount = order.serviceChargeSnapshot ?? new Prisma.Decimal(0);
      let row = waiterMap.get(order.waiterId);
      if (!row) {
        row = {
          waiterId: order.waiterId,
          waiterName: order.waiter.fullName,
          daily: Array.from({ length: days }, () => new Prisma.Decimal(0)),
          total: new Prisma.Decimal(0),
          orderCount: 0,
        };
        waiterMap.set(order.waiterId, row);
      }
      const slot = row.daily[dayIdx] ?? new Prisma.Decimal(0);
      row.daily[dayIdx] = slot.plus(amount);
      row.total = row.total.plus(amount);
      row.orderCount += 1;
      const totalSlot = dayTotals[dayIdx] ?? new Prisma.Decimal(0);
      dayTotals[dayIdx] = totalSlot.plus(amount);
      grand = grand.plus(amount);
    }

    const waiters = Array.from(waiterMap.values())
      .sort((a, b) => Number(b.total) - Number(a.total))
      .map((row) => ({
        waiterId: row.waiterId,
        waiterName: row.waiterName,
        daily: row.daily.map((d) => d.toFixed(0)),
        total: row.total.toFixed(0),
        orderCount: row.orderCount,
      }));

    return {
      from: dayKeys[0] ?? '',
      to: dayKeys[dayKeys.length - 1] ?? '',
      days,
      dayLabels,
      waiters,
      dayTotals: dayTotals.map((d) => d.toFixed(0)),
      grandTotal: grand.toFixed(0),
    };
  },
};
