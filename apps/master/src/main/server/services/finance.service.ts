import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import { debtRepo } from '../repositories/debt.repo';
import { expenseRepo } from '../repositories/expense.repo';
import { expenseService } from './expense.service';

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
    };
  },
};
