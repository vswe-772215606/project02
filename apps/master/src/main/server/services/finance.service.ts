import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { debtRepo } from '../repositories/debt.repo';
import { expenseRepo } from '../repositories/expense.repo';
import { expenseService } from './expense.service';

// Ingredient-purchase expenses live in this seeded category; they're shown in
// the Xaridlar block, NOT counted as operating expenses — otherwise daily P&L
// would double-count (purchase cash → "chiqim", then COGS when sold = same money twice).
const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

function dayRange(date: Date) {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

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
  async dailyForAdmin(date: Date) {
    const { from: dayStart, to: dayEnd } = dayRange(date);
    const prisma = getPrisma();

    // ---- Sales side (orders closed today) ----
    const closedOrders = await prisma.order.findMany({
      where: {
        status: OrderStatus.CLOSED,
        closedAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        payments: true,
        waiter: { select: { id: true, fullName: true } },
        table: { select: { id: true, name: true } },
      },
      orderBy: [{ closedAt: 'asc' }],
    });

    const walkoutOrders = await prisma.order.findMany({
      where: {
        status: OrderStatus.WALKOUT,
        updatedAt: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true, totalSnapshot: true },
    });

    let grossSales = new Prisma.Decimal(0);
    let discounts = new Prisma.Decimal(0);
    let serviceCharge = new Prisma.Decimal(0);
    let cashIn = new Prisma.Decimal(0);
    let cardIn = new Prisma.Decimal(0);
    let debtOpened = new Prisma.Decimal(0);

    for (const order of closedOrders) {
      grossSales = grossSales.plus(order.subtotalSnapshot ?? 0);
      discounts = discounts.plus(order.discountAmountSnapshot ?? 0);
      serviceCharge = serviceCharge.plus(order.serviceChargeSnapshot ?? 0);
      for (const p of order.payments) {
        if (p.method === PaymentMethod.CASH) cashIn = cashIn.plus(p.amount);
        else if (p.method === PaymentMethod.CARD) cardIn = cardIn.plus(p.amount);
        else if (p.method === PaymentMethod.DEBT) debtOpened = debtOpened.plus(p.amount);
      }
    }

    const walkoutLoss = walkoutOrders.reduce(
      (sum, o) => sum.plus(o.totalSnapshot ?? 0),
      new Prisma.Decimal(0),
    );

    // ---- Debt repayments today ----
    const debtRepayments = await debtRepo.listRepaymentsForDate(dayStart);
    let debtRepaidCash = new Prisma.Decimal(0);
    let debtRepaidCard = new Prisma.Decimal(0);
    for (const r of debtRepayments) {
      if (r.method === PaymentMethod.CASH) debtRepaidCash = debtRepaidCash.plus(r.amount);
      else if (r.method === PaymentMethod.CARD) debtRepaidCard = debtRepaidCard.plus(r.amount);
    }
    const outstandingDebts = await debtRepo.sumOutstanding();

    // ---- Outflow side (purchases + expenses) ----
    const purchases = await prisma.purchase.findMany({
      where: { occurredAt: { gte: dayStart, lte: dayEnd } },
      include: { ingredient: { select: { id: true, name: true, buyUnit: true } } },
      orderBy: [{ occurredAt: 'asc' }],
    });
    const purchasesTotal = purchases.reduce(
      (sum, p) => sum.plus(p.totalCostUzs),
      new Prisma.Decimal(0),
    );

    // Use expenseService.listByDate for the operating-expense math (the same
    // formula PRD 5/6/7 require — excludes pending repayables, only counts
    // unrecovered written-off ones).
    const expenseSummary = await expenseService.listByDate(date);
    const expensesNet = new Prisma.Decimal(expenseSummary.totals.net);
    const operatingExpense = new Prisma.Decimal(expenseSummary.totals.operating);
    const pendingRepayable = new Prisma.Decimal(expenseSummary.totals.pendingRepayable);

    // Sum of expense returns today (money came back into the drawer).
    const expenseReturns = await prisma.expenseReturn.aggregate({
      where: { receivedAt: { gte: dayStart, lte: dayEnd } },
      _sum: { amount: true },
    });
    const expenseReturnsTotal = expenseReturns._sum.amount ?? new Prisma.Decimal(0);

    // ---- NEW: Per-dish sales breakdown for today (P&L view) ----
    // Each non-canceled line of a CLOSED order is a real sale. Revenue is
    // (qty × unitPriceSnapshot); COGS is the snapshotted FIFO cost (null for
    // pre-FIFO data or untracked items — treated as 0 here, full margin).
    const todayLines = await prisma.orderLine.findMany({
      where: {
        isCanceled: false,
        order: {
          status: OrderStatus.CLOSED,
          closedAt: { gte: dayStart, lte: dayEnd },
        },
      },
      include: {
        menuItem: {
          select: {
            id: true,
            name: true,
            kind: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    type MealRow = {
      menuItemId: string;
      menuItemName: string;
      categoryId: string;
      categoryName: string;
      isService: boolean;
      qty: number;
      revenue: Prisma.Decimal;
      cogs: Prisma.Decimal;
    };
    const mealByItem = new Map<string, MealRow>();
    for (const line of todayLines) {
      const key = line.menuItem.id;
      const row = mealByItem.get(key) ?? {
        menuItemId: line.menuItem.id,
        menuItemName: line.nameSnapshot, // historically-correct name at sale time
        categoryId: line.menuItem.category.id,
        categoryName: line.menuItem.category.name,
        isService: line.menuItem.kind === 'SERVICE',
        qty: 0,
        revenue: new Prisma.Decimal(0),
        cogs: new Prisma.Decimal(0),
      };
      row.qty += line.quantity;
      row.revenue = row.revenue.plus(line.unitPriceSnapshot.mul(line.quantity));
      // cogsSnapshot is the running sum from per-portion FIFO peels (see
      // consumption.service.adjustLineCogs). null when nothing was tracked.
      row.cogs = row.cogs.plus(line.cogsSnapshot ?? new Prisma.Decimal(0));
      mealByItem.set(key, row);
    }
    const mealSales = Array.from(mealByItem.values())
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    // Per-category subtotals — drives the visual grouping in FinancePage.
    type CategoryRow = {
      categoryId: string;
      categoryName: string;
      qty: number;
      revenue: Prisma.Decimal;
      cogs: Prisma.Decimal;
    };
    const categoryMap = new Map<string, CategoryRow>();
    for (const row of mealSales) {
      const c = categoryMap.get(row.categoryId) ?? {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        qty: 0,
        revenue: new Prisma.Decimal(0),
        cogs: new Prisma.Decimal(0),
      };
      c.qty += row.qty;
      c.revenue = c.revenue.plus(row.revenue);
      c.cogs = c.cogs.plus(row.cogs);
      categoryMap.set(row.categoryId, c);
    }
    const mealSalesByCategory = Array.from(categoryMap.values())
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    const mealsRevenue = mealSales.reduce((s, r) => s.plus(r.revenue), new Prisma.Decimal(0));
    const mealsCogs = mealSales.reduce((s, r) => s.plus(r.cogs), new Prisma.Decimal(0));

    // ---- NEW: Operating expenses (chiqimlar) — excludes ingredient purchases.
    // Ingredient purchases live in the "Xaridlar" block; counting them here
    // would double-up against COGS in the P&L.
    const operatingExpenseSummary = await expenseService.listByDate(date, {
      excludeCategoryIds: [INGREDIENT_EXPENSE_CATEGORY_ID],
    });
    const operatingExpensesItems = operatingExpenseSummary.items;
    const operatingExpenseTotal = new Prisma.Decimal(operatingExpenseSummary.totals.operating);

    // ---- NEW: Debt today rollup (alohida nasiya bloki) ----
    const debtsOpenedToday = await prisma.debt.aggregate({
      where: { openedAt: { gte: dayStart, lte: dayEnd } },
      _count: true,
      _sum: { originalAmount: true },
    });
    const debtsCollectedToday = await prisma.debtRepayment.aggregate({
      where: { paidAt: { gte: dayStart, lte: dayEnd } },
      _count: true,
      _sum: { amount: true },
    });

    // ---- NEW: Daily P&L ----
    // Revenue: today's gross sales (already includes service charge & no
    // discount net — same number staff see on the bill). For accrual purity
    // we use mealsRevenue from line snapshots (matches per-dish breakdown).
    // Outflow: COGS + operatingExpense (NOT raw purchases).
    const pnlProfit = mealsRevenue.minus(mealsCogs).minus(operatingExpenseTotal);

    // ---- Drawer movement (cash drawer balance change today) ----
    const totalIn = cashIn.plus(cardIn).plus(debtRepaidCash).plus(debtRepaidCard).plus(expenseReturnsTotal);
    // Note: expense gross is the actual cash-out (not operating expense, which
    // is the P&L number). Drawer cares about actual cash that left.
    const totalOut = new Prisma.Decimal(expenseSummary.totals.gross).minus(
      new Prisma.Decimal(expenseSummary.totals.reversal),
    );
    const drawerMovement = totalIn.minus(totalOut);

    return {
      date: dayStart.toISOString().slice(0, 10),
      sales: {
        closedOrders: closedOrders.length,
        walkoutOrders: walkoutOrders.length,
        grossSales: decStr(grossSales),
        discounts: decStr(discounts),
        netFood: decStr(grossSales.minus(discounts)),
        serviceCharge: decStr(serviceCharge),
        billedTotal: decStr(grossSales.minus(discounts).plus(serviceCharge)),
        walkoutLoss: decStr(walkoutLoss),
      },
      cashflow: {
        cashIn: decStr(cashIn),
        cardIn: decStr(cardIn),
        debtOpened: decStr(debtOpened),
        debtRepaidCash: decStr(debtRepaidCash),
        debtRepaidCard: decStr(debtRepaidCard),
        expenseReturns: decStr(expenseReturnsTotal),
        totalIn: decStr(totalIn),
      },
      outflow: {
        purchasesTotal: decStr(purchasesTotal),
        purchasesCount: purchases.length,
        expensesGross: expenseSummary.totals.gross,
        expensesReversal: expenseSummary.totals.reversal,
        expensesNet: decStr(expensesNet),
        operatingExpense: decStr(operatingExpense),
        pendingRepayable: decStr(pendingRepayable),
        totalOut: decStr(totalOut),
      },
      drawer: {
        movement: decStr(drawerMovement),
        outstandingDebts: decStr(outstandingDebts),
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
      closedOrders: closedOrders.map((o) => ({
        id: o.id,
        closedAt: o.closedAt?.toISOString() ?? null,
        waiterName: o.waiter.fullName,
        tableName: o.table?.name ?? null,
        billedTotal: decStr(o.totalSnapshot),
      })),

      // ─── P&L view (sotuv − COGS − operatsion chiqim = sof foyda) ───
      mealSales: mealSales.map((r) => ({
        menuItemId: r.menuItemId,
        menuItemName: r.menuItemName,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        isService: r.isService,
        qty: r.qty,
        revenue: decStr(r.revenue),
        cogs: decStr(r.cogs),
        profit: decStr(r.revenue.minus(r.cogs)),
      })),
      mealSalesByCategory: mealSalesByCategory.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        qty: c.qty,
        revenue: decStr(c.revenue),
        cogs: decStr(c.cogs),
        profit: decStr(c.revenue.minus(c.cogs)),
      })),
      mealSalesTotal: {
        qty: mealSales.reduce((n, r) => n + r.qty, 0),
        revenue: decStr(mealsRevenue),
        cogs: decStr(mealsCogs),
        profit: decStr(mealsRevenue.minus(mealsCogs)),
      },

      // Chiqimlar (operating only — ingredient purchases excluded; see Xaridlar block)
      operatingExpenses: operatingExpensesItems.map((e) => ({
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
        count: operatingExpensesItems.length,
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
        count: purchases.length,
        amount: decStr(purchasesTotal),
      },

      // Nasiya bloki — bugun ochilgan + bugun olingan + lifetime qoldiq
      debtToday: {
        openedCount: debtsOpenedToday._count,
        openedAmount: decStr(debtsOpenedToday._sum.originalAmount ?? new Prisma.Decimal(0)),
        collectedCount: debtsCollectedToday._count,
        collectedAmount: decStr(debtsCollectedToday._sum.amount ?? new Prisma.Decimal(0)),
        lifetimeOutstanding: decStr(outstandingDebts),
      },

      // Daily P&L summary — used by the Yakun block at the bottom of FinancePage.
      pnl: {
        revenue: decStr(mealsRevenue),
        cogs: decStr(mealsCogs),
        operatingExpense: decStr(operatingExpenseTotal),
        profit: decStr(pnlProfit),
      },
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
    const from = new Date(input.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(input.to);
    to.setHours(23, 59, 59, 999);

    // Build the column list — one slot per local day in the range.
    const dayKeys: string[] = [];
    const dayLabels: Array<{
      key: string;
      day: number;
      month: number;
      weekday: number;
      isMonthStart: boolean;
    }> = [];
    {
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      const stop = new Date(to);
      stop.setHours(0, 0, 0, 0);
      while (cursor <= stop) {
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getDate()).padStart(2, '0');
        const key = `${yyyy}-${mm}-${dd}`;
        dayKeys.push(key);
        dayLabels.push({
          key,
          day: cursor.getDate(),
          month: cursor.getMonth() + 1,
          weekday: cursor.getDay(),
          isMonthStart: cursor.getDate() === 1,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    const days = dayKeys.length;
    const dayIndexByKey = new Map(dayKeys.map((k, i) => [k, i] as const));

    const closedOrders = await getPrisma().order.findMany({
      where: {
        status: OrderStatus.CLOSED,
        closedAt: { gte: from, lte: to },
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
      const yyyy = order.closedAt.getFullYear();
      const mm = String(order.closedAt.getMonth() + 1).padStart(2, '0');
      const dd = String(order.closedAt.getDate()).padStart(2, '0');
      const dayIdx = dayIndexByKey.get(`${yyyy}-${mm}-${dd}`);
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
