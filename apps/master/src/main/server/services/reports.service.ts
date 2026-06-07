import { ExpenseStatus, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { expenseService } from './expense.service';
import { getPrisma } from '../lib/prisma';
import { debtRepo } from '../repositories/debt.repo';
import {
  localDayKey,
  localDayRange,
  localDayRangeFor,
  localMonthRangeFor,
  parseLocalDay,
} from '../lib/time';

const MS_PER_DAY = 86_400_000;

// Same constant as finance.service — ingredient-purchase expenses live here
// and are split out from "operating expenses" in the P&L view.
const INGREDIENT_EXPENSE_CATEGORY_ID = 'seed-cat-ingredients';

const reportOrderInclude = {
  payments: true,
  debt: true,
  table: true,
  waiter: {
    select: {
      id: true,
      fullName: true,
    },
  },
  walkoutBy: {
    select: {
      id: true,
      fullName: true,
    },
  },
  lines: {
    include: {
      menuItem: {
        include: {
          category: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} satisfies Prisma.OrderInclude;

const reportDebtInclude = {
  order: {
    include: {
      table: true,
      waiter: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  },
  repayments: {
    include: {
      receivedBy: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: [{ paidAt: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.DebtInclude;

type ReportOrder = Prisma.OrderGetPayload<{ include: typeof reportOrderInclude }>;
type ReportDebt = Prisma.DebtGetPayload<{ include: typeof reportDebtInclude }>;

function dayBounds(date: Date) {
  return localDayRange(date);
}

function dec(value: Prisma.Decimal | null | undefined) {
  return value ?? new Prisma.Decimal(0);
}

function decStr(value: Prisma.Decimal | null | undefined) {
  return dec(value).toFixed(0);
}

function shortOrderNumber(id: string) {
  return id.slice(-6).toUpperCase();
}

function isWithinDay(value: Date | null | undefined, dayStart: Date, dayEnd: Date) {
  if (!value) return false;
  return value >= dayStart && value < dayEnd;
}

function paymentBreakdown(payments: Array<{ method: PaymentMethod; amount: Prisma.Decimal }>) {
  let cash = new Prisma.Decimal(0);
  let card = new Prisma.Decimal(0);
  let debt = new Prisma.Decimal(0);

  for (const payment of payments) {
    if (payment.method === PaymentMethod.CASH) {
      cash = cash.plus(payment.amount);
    } else if (payment.method === PaymentMethod.CARD) {
      card = card.plus(payment.amount);
    } else if (payment.method === PaymentMethod.DEBT) {
      debt = debt.plus(payment.amount);
    }
  }

  return { cash, card, debt };
}

function terminalMoment(order: ReportOrder) {
  return order.closedAt ?? order.canceledAt ?? order.updatedAt;
}

function buildOrdersTable(orders: ReportOrder[], status: 'CLOSED' | 'CANCELED' | 'WALKOUT') {
  return orders.map((order) => {
    const payments = paymentBreakdown(order.payments);
    const gross = dec(order.subtotalSnapshot);
    const discount = dec(order.discountAmountSnapshot);

    return {
      orderId: order.id,
      orderNumber: shortOrderNumber(order.id),
      at: terminalMoment(order).toISOString(),
      tableName: order.table?.name ?? null,
      waiterName: order.waiter.fullName,
      status,
      gross: decStr(gross),
      discount: decStr(discount),
      net: decStr(gross.minus(discount)),
      service: decStr(order.serviceChargeSnapshot),
      cash: decStr(payments.cash),
      card: decStr(payments.card),
      debt: decStr(payments.debt),
    };
  });
}

function buildMealSales(closedOrders: ReportOrder[]) {
  const mealMap = new Map<string, {
    mealName: string;
    categoryName: string | null;
    orderIds: Set<string>;
    qtyOrdered: number;
    grossSales: Prisma.Decimal;
  }>();

  for (const order of closedOrders) {
    for (const line of order.lines) {
      if (line.isCanceled) continue;
      // Exclude SERVICE-kind lines (xizmat haqi). Otherwise the section's
      // "Jami brutto" total includes service charges and disagrees with the
      // page's "Brutto savdo" stat tile (which is FOOD only via
      // billingService.subtotal).
      if (line.menuItem.kind !== 'FOOD') continue;

      const key = `${line.nameSnapshot}::${line.menuItem.category.name}`;
      const existing = mealMap.get(key) ?? {
        mealName: line.nameSnapshot,
        categoryName: line.menuItem.category.name,
        orderIds: new Set<string>(),
        qtyOrdered: 0,
        grossSales: new Prisma.Decimal(0),
      };

      existing.orderIds.add(order.id);
      existing.qtyOrdered += line.quantity;
      existing.grossSales = existing.grossSales.plus(line.unitPriceSnapshot.mul(line.quantity));
      mealMap.set(key, existing);
    }
  }

  return Array.from(mealMap.values())
    .map((item) => ({
      mealName: item.mealName,
      categoryName: item.categoryName,
      ordersCount: item.orderIds.size,
      qtyOrdered: item.qtyOrdered,
      grossSales: decStr(item.grossSales),
      avgPerOrder: (item.qtyOrdered / item.orderIds.size).toFixed(2),
    }))
    .sort((a, b) => {
      if (b.qtyOrdered !== a.qtyOrdered) return b.qtyOrdered - a.qtyOrdered;
      return Number(b.grossSales) - Number(a.grossSales);
    });
}

function buildDebtLedger(debts: ReportDebt[], dayStart: Date, dayEnd: Date) {
  const rows = debts
    .map((debt) => {
      const repaidToday = debt.repayments
        .filter((repayment) => isWithinDay(repayment.paidAt, dayStart, dayEnd))
        .reduce((sum, repayment) => sum.plus(repayment.amount), new Prisma.Decimal(0));

      const repaidUpToDayEnd = debt.repayments
        .filter((repayment) => repayment.paidAt < dayEnd)
        .reduce((sum, repayment) => sum.plus(repayment.amount), new Prisma.Decimal(0));

      const writtenOffAsOfDay = debt.writtenOffAt !== null && debt.writtenOffAt < dayEnd;
      // For a written-off debt the principal is recognized as a loss and is no
      // longer considered outstanding. The original is kept for the audit trail.
      const remainingAtDayEnd = writtenOffAsOfDay
        ? new Prisma.Decimal(0)
        : dec(debt.originalAmount).minus(repaidUpToDayEnd);
      const totalRepaidAtDayEnd = dec(debt.originalAmount).minus(remainingAtDayEnd);
      const lastRepaymentAt = debt.repayments
        .filter((repayment) => repayment.paidAt < dayEnd)
        .at(-1)?.paidAt ?? null;

      let statusAsOfDay: 'OPEN' | 'PARTIAL' | 'PAID' | 'WRITTEN_OFF' = 'OPEN';
      if (writtenOffAsOfDay) {
        statusAsOfDay = 'WRITTEN_OFF';
      } else if (remainingAtDayEnd.lte(0)) {
        statusAsOfDay = 'PAID';
      } else if (totalRepaidAtDayEnd.gt(0)) {
        statusAsOfDay = 'PARTIAL';
      }

      return {
        debtId: debt.id,
        openedAt: debt.openedAt.toISOString(),
        orderNumber: shortOrderNumber(debt.orderId),
        debtorName: debt.debtorName,
        debtorPhone: debt.debtorPhone,
        orderTotal: decStr(debt.order.totalSnapshot),
        originalAmount: decStr(debt.originalAmount),
        repaidToday: decStr(repaidToday),
        totalRepaid: decStr(totalRepaidAtDayEnd),
        remainingAmount: decStr(remainingAtDayEnd),
        status: statusAsOfDay,
        lastRepaymentAt: lastRepaymentAt?.toISOString() ?? null,
        openedToday: isWithinDay(debt.openedAt, dayStart, dayEnd),
        writtenOffAt: debt.writtenOffAt?.toISOString() ?? null,
        writtenOffReason: debt.writtenOffReason,
      };
    })
    .filter((debt) => debt.openedToday || debt.repaidToday !== '0' || debt.remainingAmount !== '0' || debt.status === 'WRITTEN_OFF');

  return rows.sort((a, b) => {
    if (a.remainingAmount !== b.remainingAmount) {
      return Number(b.remainingAmount) - Number(a.remainingAmount);
    }
    return a.openedAt.localeCompare(b.openedAt);
  });
}

export const reportsService = {
  /**
   * Owner Z-report. Now a thin projection over `dailyLedger` + legacy-only
   * extras (debt ledger, expense detail items, sales-vs-payment check). The
   * canonical numbers come from one place; the legacy-shape fields below are
   * preserved so the existing renderer keeps working until T10 switches it
   * to `ledger.*`.
   */
  async daily(date: Date) {
    const prisma = getPrisma();
    const localDay = localDayKey(date);
    const dayAnchor = parseLocalDay(localDay);
    const { start: dayStart, end: dayEnd } = localDayRangeFor(localDay);

    // Canonical numbers come from the unified ledger.
    const ledger = await this.dailyLedger(localDay);

    // Legacy-only extras that the canonical DTO doesn't expose:
    //  - full expense.items + byCategory for the "Chiqimlar" detail card,
    //  - all-history debts for the debt ledger table,
    //  - the canceled/walkout order rows joined into ordersTable.
    const [expenseSummary, debts, closedOrders, canceledOrders, walkoutOrders] = await Promise.all([
      expenseService.listByDate(dayAnchor),
      prisma.debt.findMany({
        where: { openedAt: { lt: dayEnd } },
        include: reportDebtInclude,
        orderBy: [{ openedAt: 'asc' }],
      }),
      prisma.order.findMany({
        where: { status: 'CLOSED', closedAt: { gte: dayStart, lt: dayEnd } },
        include: reportOrderInclude,
        orderBy: { closedAt: 'asc' },
      }),
      prisma.order.findMany({
        where: { status: 'CANCELED', canceledAt: { gte: dayStart, lt: dayEnd } },
        include: reportOrderInclude,
        orderBy: { canceledAt: 'asc' },
      }),
      prisma.order.findMany({
        where: { status: 'WALKOUT', walkoutAt: { gte: dayStart, lt: dayEnd } },
        include: reportOrderInclude,
        orderBy: { walkoutAt: 'asc' },
      }),
    ]);

    const debtLedger = buildDebtLedger(debts, dayStart, dayEnd);

    // sales-vs-payment reconciliation: a stable diagnostic block. Owner uses it
    // to catch snapshot drift if the bill total ever doesn't match the payment
    // rows (a class of bug that should be impossible given confirm(), but the
    // check is cheap and tells us if invariants ever break).
    const gross = new Prisma.Decimal(ledger.sales.gross);
    const discount = new Prisma.Decimal(ledger.sales.discount);
    const netSales = new Prisma.Decimal(ledger.sales.netSales);
    const serviceCharge = new Prisma.Decimal(ledger.sales.serviceCharge);
    const orderCash = new Prisma.Decimal(ledger.cashflow.orderCash);
    const orderCard = new Prisma.Decimal(ledger.cashflow.orderCard);
    const debtSales = new Prisma.Decimal(ledger.sales.debtSales);
    const debtRepaidCash = new Prisma.Decimal(ledger.cashflow.debtRepaidCash);
    const debtRepaidCard = new Prisma.Decimal(ledger.cashflow.debtRepaidCard);
    const realCashIn = new Prisma.Decimal(ledger.cashflow.realCashIn);
    const expenseNet = new Prisma.Decimal(ledger.outflow.expenseNet);

    const billedTotal = netSales.plus(serviceCharge);
    const paymentTotal = orderCash.plus(orderCard).plus(debtSales);
    const paymentDifference = billedTotal.minus(paymentTotal);

    // Legacy "salesBasedProfit" excluded COGS and used opex including
    // ingredient purchases. Now reconciles to the canonical P&L exactly.
    const salesBasedProfit = new Prisma.Decimal(ledger.pnl.profit);
    const cashflowBasedNet = realCashIn.minus(expenseNet);

    // ordersTable joined view: closed + canceled + walkout, sorted by terminal
    // moment (closedAt / canceledAt / walkoutAt) so the renderer can show a
    // single sortable list.
    const ordersTable = [
      ...buildOrdersTable(closedOrders, 'CLOSED'),
      ...buildOrdersTable(canceledOrders, 'CANCELED'),
      ...buildOrdersTable(walkoutOrders, 'WALKOUT'),
    ].sort((a, b) => a.at.localeCompare(b.at));

    return {
      date: ledger.date,
      sales: {
        closedOrders: ledger.sales.closedCount,
        canceledOrders: ledger.sales.canceledCount,
        walkoutOrders: ledger.sales.walkoutCount,
        grossSales: ledger.sales.gross,
        discounts: ledger.sales.discount,
        netSales: ledger.sales.netSales,
        debtSales: ledger.sales.debtSales,
        serviceCharge: ledger.sales.serviceCharge,
      },
      cashflow: {
        orderCash: ledger.cashflow.orderCash,
        orderCard: ledger.cashflow.orderCard,
        debtRepaymentsCash: ledger.cashflow.debtRepaidCash,
        debtRepaymentsCard: ledger.cashflow.debtRepaidCard,
        realCashIn: ledger.cashflow.realCashIn,
      },
      expenses: {
        gross: expenseSummary.totals.gross,
        reversal: expenseSummary.totals.reversal,
        net: expenseSummary.totals.net,
        operating: expenseSummary.totals.operating,
        pendingRepayable: expenseSummary.totals.pendingRepayable,
        byCategory: expenseSummary.byCategory,
        items: expenseSummary.items,
      },
      results: {
        // Reconciled to canonical P&L: revenue − cogs − operatingExpense.
        // The pre-T8 formula (`netSales − operatingExpense`) over-stated
        // profit by ignoring COGS — fixed here.
        salesBasedProfit: decStr(salesBasedProfit),
        cashflowBasedNet: decStr(cashflowBasedNet),
      },
      checks: {
        salesVsPayments: {
          subtotal: ledger.sales.gross,
          discounts: ledger.sales.discount,
          netSales: ledger.sales.netSales,
          serviceCharge: ledger.sales.serviceCharge,
          billedTotal: decStr(billedTotal),
          paymentTotal: decStr(paymentTotal),
          difference: decStr(paymentDifference),
        },
        expenses: {
          recordedExpense: expenseSummary.totals.gross,
          reversalAmount: expenseSummary.totals.reversal,
          netExpense: expenseSummary.totals.net,
        },
        debts: {
          openedTodayAmount: ledger.debt.openedTodayAmount,
          repaidTodayAmount: ledger.debt.repaidTodayAmount,
          outstandingTotal: ledger.debt.outstandingAsOfEod,
        },
      },
      debtSnapshot: {
        openedTodayCount: ledger.debt.openedTodayCount,
        openedTodayAmount: ledger.debt.openedTodayAmount,
        repaidTodayAmount: ledger.debt.repaidTodayAmount,
        repayments: ledger.lines.debtRepayments,
        outstandingTotal: ledger.debt.outstandingAsOfEod,
      },
      perWaiter: ledger.perWaiter,
      cancellations: ledger.incidents.cancellations.map((row) => ({
        orderId: row.orderId,
        canceledAt: row.canceledAt,
        // Legacy field — was always the literal string 'system'. Kept for
        // renderer compatibility; new code should ignore it.
        canceledBy: 'system',
        reason: row.reason,
      })),
      walkouts: ledger.incidents.walkouts.map((row) => ({
        orderId: row.orderId,
        markedAt: row.walkoutAt,
        markedById: row.walkoutById,
        markedByName: row.walkoutByName,
        amount: row.amount,
        reason: row.reason,
      })),
      ordersTable,
      mealSales: buildMealSales(closedOrders),
      debtLedger,
      // Canonical DTO available for migrating renderers (T10).
      ledger,
    };
  },

  /**
   * Monthly Z-report. Reimplemented as ONE batch of range queries that we
   * group by Tashkent calendar day in TS. Previously this called `daily()`
   * 28-31 times sequentially, each of which issued ~6 queries (so ~180+
   * queries serialised through SQLite's single writer). Now it's ~7 range
   * queries total + in-memory aggregation.
   *
   * Returned shape stays compatible with the renderer: `daily: DayRow[]`
   * indexed in Tashkent order, plus aggregate `totals`.
   */
  async monthly(monthStart: Date) {
    const monthKey = localDayKey(monthStart).slice(0, 7);
    const { start: monthStartUtc, end: monthEnd } = localMonthRangeFor(monthKey);
    const prisma = getPrisma();

    // ─── One batch of range queries for the whole month ────────────────
    const [
      closedOrders,
      canceledOrders,
      walkoutOrders,
      closedLines,
      repayments,
      expenseReturns,
      expenses,
      outstandingAtMonthEnd,
    ] = await Promise.all([
      prisma.order.findMany({
        where: { status: OrderStatus.CLOSED, closedAt: { gte: monthStartUtc, lt: monthEnd } },
        include: { payments: true, waiter: { select: { id: true, fullName: true } } },
      }),
      prisma.order.findMany({
        where: { status: OrderStatus.CANCELED, canceledAt: { gte: monthStartUtc, lt: monthEnd } },
        select: { id: true, canceledAt: true, cancelReason: true, waiterId: true },
      }),
      prisma.order.findMany({
        where: { status: OrderStatus.WALKOUT, walkoutAt: { gte: monthStartUtc, lt: monthEnd } },
        select: { id: true, walkoutAt: true, totalSnapshot: true, waiterId: true },
      }),
      prisma.orderLine.findMany({
        where: {
          isCanceled: false,
          order: { status: OrderStatus.CLOSED, closedAt: { gte: monthStartUtc, lt: monthEnd } },
        },
        select: { cogsSnapshot: true, order: { select: { closedAt: true } } },
      }),
      prisma.debtRepayment.findMany({
        where: { paidAt: { gte: monthStartUtc, lt: monthEnd } },
        select: { amount: true, method: true, paidAt: true },
      }),
      prisma.expenseReturn.findMany({
        where: { receivedAt: { gte: monthStartUtc, lt: monthEnd } },
        select: { amount: true, receivedAt: true },
      }),
      prisma.expense.findMany({
        where: { occurredAt: { gte: monthStartUtc, lt: monthEnd } },
        include: {
          category: { select: { id: true } },
          returns: { select: { amount: true } },
        },
      }),
      // Outstanding-as-of-end-of-month: use the proper aggregate primitive.
      debtRepo.sumOutstandingAsOf(new Date(monthEnd.getTime() - MS_PER_DAY)),
    ]);

    // Per-day outstanding-as-of-EOD: parallel SQL aggregates, one per day.
    // The previous in-memory cursor sweep didn't handle write-offs correctly
    // (a debt's principal kept contributing after writeOff). Reusing the
    // debt.repo primitive keeps the canonical write-off semantics in one
    // place. Cost: ~D parallel aggregates (≤31 for a month), well under the
    // monthly() budget — see smoke-prd13-monthly-perf.ts.
    const eodPerDay: Date[] = [];
    for (let cursor = monthStartUtc; cursor < monthEnd; cursor = new Date(cursor.getTime() + MS_PER_DAY)) {
      eodPerDay.push(cursor);
    }
    const outstandingByDay = await Promise.all(
      eodPerDay.map((cursor) => debtRepo.sumOutstandingAsOf(cursor)),
    );

    // ─── Per-day aggregation buckets ───────────────────────────────────
    type DayAgg = {
      closedCount: number;
      canceledCount: number;
      walkoutCount: number;
      gross: Prisma.Decimal;
      discount: Prisma.Decimal;
      serviceCharge: Prisma.Decimal;
      orderCash: Prisma.Decimal;
      orderCard: Prisma.Decimal;
      debtSales: Prisma.Decimal;
      debtRepaidCash: Prisma.Decimal;
      debtRepaidCard: Prisma.Decimal;
      expenseReturns: Prisma.Decimal;
      expenseGross: Prisma.Decimal;
      expenseReversal: Prisma.Decimal;
      operatingExpense: Prisma.Decimal;
      cogs: Prisma.Decimal;
    };
    const emptyAgg = (): DayAgg => ({
      closedCount: 0,
      canceledCount: 0,
      walkoutCount: 0,
      gross: new Prisma.Decimal(0),
      discount: new Prisma.Decimal(0),
      serviceCharge: new Prisma.Decimal(0),
      orderCash: new Prisma.Decimal(0),
      orderCard: new Prisma.Decimal(0),
      debtSales: new Prisma.Decimal(0),
      debtRepaidCash: new Prisma.Decimal(0),
      debtRepaidCard: new Prisma.Decimal(0),
      expenseReturns: new Prisma.Decimal(0),
      expenseGross: new Prisma.Decimal(0),
      expenseReversal: new Prisma.Decimal(0),
      operatingExpense: new Prisma.Decimal(0),
      cogs: new Prisma.Decimal(0),
    });
    const dayMap = new Map<string, DayAgg>();
    const getDay = (key: string): DayAgg => {
      const existing = dayMap.get(key);
      if (existing) return existing;
      const fresh = emptyAgg();
      dayMap.set(key, fresh);
      return fresh;
    };

    for (const order of closedOrders) {
      if (!order.closedAt) continue;
      const agg = getDay(localDayKey(order.closedAt));
      agg.closedCount += 1;
      agg.gross = agg.gross.plus(dec(order.subtotalSnapshot));
      agg.discount = agg.discount.plus(dec(order.discountAmountSnapshot));
      agg.serviceCharge = agg.serviceCharge.plus(dec(order.serviceChargeSnapshot));
      for (const payment of order.payments) {
        if (payment.method === PaymentMethod.CASH) agg.orderCash = agg.orderCash.plus(payment.amount);
        else if (payment.method === PaymentMethod.CARD) agg.orderCard = agg.orderCard.plus(payment.amount);
        else if (payment.method === PaymentMethod.DEBT) agg.debtSales = agg.debtSales.plus(payment.amount);
      }
    }

    for (const order of canceledOrders) {
      if (!order.canceledAt) continue;
      getDay(localDayKey(order.canceledAt)).canceledCount += 1;
    }

    for (const order of walkoutOrders) {
      if (!order.walkoutAt) continue;
      getDay(localDayKey(order.walkoutAt)).walkoutCount += 1;
    }

    for (const line of closedLines) {
      if (!line.order.closedAt) continue;
      const agg = getDay(localDayKey(line.order.closedAt));
      agg.cogs = agg.cogs.plus(line.cogsSnapshot ?? new Prisma.Decimal(0));
    }

    for (const repayment of repayments) {
      const agg = getDay(localDayKey(repayment.paidAt));
      if (repayment.method === PaymentMethod.CASH) {
        agg.debtRepaidCash = agg.debtRepaidCash.plus(repayment.amount);
      } else if (repayment.method === PaymentMethod.CARD) {
        agg.debtRepaidCard = agg.debtRepaidCard.plus(repayment.amount);
      }
    }

    for (const ret of expenseReturns) {
      const agg = getDay(localDayKey(ret.receivedAt));
      agg.expenseReturns = agg.expenseReturns.plus(ret.amount);
    }

    // Expense reduction: same rules as expense.service.listByDate, applied
    // per Tashkent day of occurredAt. Ingredient-purchase category is split
    // off so it doesn't get counted as operating expense (it's already in
    // COGS via the FIFO peel — double-count guard).
    for (const expense of expenses) {
      const agg = getDay(localDayKey(expense.occurredAt));
      const isIngredientPurchase = expense.category.id === INGREDIENT_EXPENSE_CATEGORY_ID;
      if (expense.status === ExpenseStatus.ACTIVE || expense.status === ExpenseStatus.REVERSED) {
        agg.expenseGross = agg.expenseGross.plus(expense.amount);
        if (!isIngredientPurchase) {
          if (!expense.repayable) {
            agg.operatingExpense = agg.operatingExpense.plus(expense.amount);
          } else if (expense.writtenOffAt) {
            const returned = expense.returns.reduce(
              (sum, r) => sum.plus(r.amount),
              new Prisma.Decimal(0),
            );
            agg.operatingExpense = agg.operatingExpense.plus(expense.amount.minus(returned));
          }
        }
      } else if (expense.status === ExpenseStatus.REVERSAL) {
        agg.expenseReversal = agg.expenseReversal.plus(expense.amount);
        if (!isIngredientPurchase) {
          agg.operatingExpense = agg.operatingExpense.minus(expense.amount);
        }
      }
    }

    // ─── Walk every Tashkent day in the month, emit one row per day ────
    const daily: Array<{
      date: string;
      sales: {
        closedOrders: number;
        canceledOrders: number;
        walkoutOrders: number;
        grossSales: string;
        discounts: string;
        netSales: string;
        debtSales: string;
        serviceCharge: string;
      };
      cashflow: {
        orderCash: string;
        orderCard: string;
        debtRepaymentsCash: string;
        debtRepaymentsCard: string;
        expenseReturns: string;
        realCashIn: string;
      };
      expenses: {
        gross: string;
        reversal: string;
        net: string;
        operating: string;
      };
      pnl: {
        revenue: string;
        cogs: string;
        operatingExpense: string;
        profit: string;
      };
      results: {
        salesBasedProfit: string;
        cashflowBasedNet: string;
      };
      // PRD 13 — per-day outstanding-as-of-EOD. Lets the monthly table
      // render the "Qoldiq nasiya" column without falling back to a
      // pre-T8 per-day daily() call.
      debtSnapshot: {
        outstandingTotal: string;
      };
    }> = [];

    const totals = emptyAgg();
    let totalProfit = new Prisma.Decimal(0);
    let totalCashflowNet = new Prisma.Decimal(0);

    for (let i = 0; i < eodPerDay.length; i += 1) {
      const cursor = eodPerDay[i]!;
      const key = localDayKey(cursor);
      const agg = dayMap.get(key) ?? emptyAgg();
      const outstandingAsOfEod = outstandingByDay[i]!;

      const netSales = agg.gross.minus(agg.discount);
      const expenseNet = agg.expenseGross.minus(agg.expenseReversal);
      // realCashIn includes expense returns — see dailyLedger() for rationale.
      const realCashIn = agg.orderCash
        .plus(agg.orderCard)
        .plus(agg.debtRepaidCash)
        .plus(agg.debtRepaidCard)
        .plus(agg.expenseReturns);
      // Canonical P&L: revenue − cogs − operatingExpense.
      const profit = netSales.minus(agg.cogs).minus(agg.operatingExpense);
      const cashflowNet = realCashIn.minus(expenseNet);

      daily.push({
        date: key,
        sales: {
          closedOrders: agg.closedCount,
          canceledOrders: agg.canceledCount,
          walkoutOrders: agg.walkoutCount,
          grossSales: decStr(agg.gross),
          discounts: decStr(agg.discount),
          netSales: decStr(netSales),
          debtSales: decStr(agg.debtSales),
          serviceCharge: decStr(agg.serviceCharge),
        },
        cashflow: {
          orderCash: decStr(agg.orderCash),
          orderCard: decStr(agg.orderCard),
          debtRepaymentsCash: decStr(agg.debtRepaidCash),
          debtRepaymentsCard: decStr(agg.debtRepaidCard),
          expenseReturns: decStr(agg.expenseReturns),
          realCashIn: decStr(realCashIn),
        },
        expenses: {
          gross: decStr(agg.expenseGross),
          reversal: decStr(agg.expenseReversal),
          net: decStr(expenseNet),
          operating: decStr(agg.operatingExpense),
        },
        pnl: {
          revenue: decStr(netSales),
          cogs: decStr(agg.cogs),
          operatingExpense: decStr(agg.operatingExpense),
          profit: decStr(profit),
        },
        results: {
          salesBasedProfit: decStr(profit),
          cashflowBasedNet: decStr(cashflowNet),
        },
        debtSnapshot: {
          outstandingTotal: decStr(outstandingAsOfEod),
        },
      });

      // Roll up to month totals.
      totals.closedCount += agg.closedCount;
      totals.canceledCount += agg.canceledCount;
      totals.walkoutCount += agg.walkoutCount;
      totals.gross = totals.gross.plus(agg.gross);
      totals.discount = totals.discount.plus(agg.discount);
      totals.serviceCharge = totals.serviceCharge.plus(agg.serviceCharge);
      totals.orderCash = totals.orderCash.plus(agg.orderCash);
      totals.orderCard = totals.orderCard.plus(agg.orderCard);
      totals.debtSales = totals.debtSales.plus(agg.debtSales);
      totals.debtRepaidCash = totals.debtRepaidCash.plus(agg.debtRepaidCash);
      totals.debtRepaidCard = totals.debtRepaidCard.plus(agg.debtRepaidCard);
      totals.expenseReturns = totals.expenseReturns.plus(agg.expenseReturns);
      totals.expenseGross = totals.expenseGross.plus(agg.expenseGross);
      totals.expenseReversal = totals.expenseReversal.plus(agg.expenseReversal);
      totals.operatingExpense = totals.operatingExpense.plus(agg.operatingExpense);
      totals.cogs = totals.cogs.plus(agg.cogs);
      totalProfit = totalProfit.plus(profit);
      totalCashflowNet = totalCashflowNet.plus(cashflowNet);
    }

    const totalNetSales = totals.gross.minus(totals.discount);
    const totalExpenseNet = totals.expenseGross.minus(totals.expenseReversal);
    // Mirror dailyLedger: monthly total includes expense returns in real cash.
    const totalRealCashIn = totals.orderCash
      .plus(totals.orderCard)
      .plus(totals.debtRepaidCash)
      .plus(totals.debtRepaidCard)
      .plus(totals.expenseReturns);

    return {
      month: monthKey,
      totals: {
        closedOrders: totals.closedCount,
        canceledOrders: totals.canceledCount,
        walkoutOrders: totals.walkoutCount,
        grossSales: decStr(totals.gross),
        discounts: decStr(totals.discount),
        netSales: decStr(totalNetSales),
        debtSales: decStr(totals.debtSales),
        serviceCharge: decStr(totals.serviceCharge),
        realCashIn: decStr(totalRealCashIn),
        expensesNet: decStr(totalExpenseNet),
        salesBasedProfit: decStr(totalProfit),
        cashflowBasedNet: decStr(totalCashflowNet),
        outstandingDebtEndOfMonth: decStr(outstandingAtMonthEnd),
      },
      daily,
    };
  },

  /**
   * Cross-category P&L + Cash-basis summary for an arbitrary date range.
   * Drives the "Umumiy" tab in ReportsPage. Two parallel views:
   *
   *   P&L (accrual)
   *     Kirim       = sotuv revenue (per menu-category)
   *     Chiqim      = COGS (sotilgan ovqatlar masalliqlari)
   *                 + operatsion expenses (xaridlar EXCLUDED — they're zaxira)
   *     Sof foyda   = revenue − cogs − opex
   *
   *   Cash basis (haqiqiy pul harakati)
   *     Kirim       = cash + card from sales + debt collections + expense returns
   *     Chiqim      = ALL expenses (operating + ingredient purchases)
   *     Farq        = kirim − chiqim   (drawer movement over the range)
   *
   * Range is local-day inclusive: [from 00:00, to 23:59].
   */
  async summary(input: { from: Date; to: Date }) {
    // Half-open [from, end) where `end` = start of the day AFTER input.to.
    // input.from and input.to are Tashkent-anchored day-start instants from
    // the controller (parseLocalDay) — we just compute the exclusive end.
    const from = input.from;
    const end = localDayRange(input.to).end;
    const prisma = getPrisma();

    // ─── Sales side: CLOSED orders' lines in range ───────────────────────
    const lines = await prisma.orderLine.findMany({
      where: {
        isCanceled: false,
        order: {
          status: OrderStatus.CLOSED,
          closedAt: { gte: from, lt: end },
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

    type MenuCatRow = {
      categoryId: string;
      categoryName: string;
      qty: number;
      revenue: Prisma.Decimal;
      cogs: Prisma.Decimal;
    };
    const menuCatMap = new Map<string, MenuCatRow>();
    let totalRevenue = new Prisma.Decimal(0);
    let totalCogs = new Prisma.Decimal(0);
    for (const line of lines) {
      const cid = line.menuItem.category.id;
      const row = menuCatMap.get(cid) ?? {
        categoryId: cid,
        categoryName: line.menuItem.category.name,
        qty: 0,
        revenue: new Prisma.Decimal(0),
        cogs: new Prisma.Decimal(0),
      };
      const rev = line.unitPriceSnapshot.mul(line.quantity);
      row.qty += line.quantity;
      row.revenue = row.revenue.plus(rev);
      row.cogs = row.cogs.plus(line.cogsSnapshot ?? new Prisma.Decimal(0));
      menuCatMap.set(cid, row);
      totalRevenue = totalRevenue.plus(rev);
      totalCogs = totalCogs.plus(line.cogsSnapshot ?? new Prisma.Decimal(0));
    }
    const incomesByMenuCategory = Array.from(menuCatMap.values())
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    // Per-payment-method sales breakdown (for the Cash basis view)
    const closedOrders = await prisma.order.findMany({
      where: {
        status: OrderStatus.CLOSED,
        closedAt: { gte: from, lt: end },
      },
      include: { payments: true },
    });
    let salesCash = new Prisma.Decimal(0);
    let salesCard = new Prisma.Decimal(0);
    let salesDebt = new Prisma.Decimal(0);
    for (const o of closedOrders) {
      for (const p of o.payments) {
        if (p.method === PaymentMethod.CASH) salesCash = salesCash.plus(p.amount);
        else if (p.method === PaymentMethod.CARD) salesCard = salesCard.plus(p.amount);
        else if (p.method === PaymentMethod.DEBT) salesDebt = salesDebt.plus(p.amount);
      }
    }

    // ─── Other inflows in range (non-sales cash in) ──────────────────────
    const repayments = await prisma.debtRepayment.findMany({
      where: { paidAt: { gte: from, lt: end } },
      select: { amount: true, method: true },
    });
    let debtRepaidCash = new Prisma.Decimal(0);
    let debtRepaidCard = new Prisma.Decimal(0);
    for (const r of repayments) {
      if (r.method === PaymentMethod.CASH) debtRepaidCash = debtRepaidCash.plus(r.amount);
      else if (r.method === PaymentMethod.CARD) debtRepaidCard = debtRepaidCard.plus(r.amount);
    }
    const debtRepaidTotal = debtRepaidCash.plus(debtRepaidCard);

    const expReturnsAgg = await prisma.expenseReturn.aggregate({
      where: { receivedAt: { gte: from, lt: end } },
      _sum: { amount: true },
    });
    const expenseReturns = expReturnsAgg._sum.amount ?? new Prisma.Decimal(0);

    // ─── Expense side: aggregate by category for the whole range ─────────
    // Reversed/reversal pairs cancel out (gross − reversal = net). Repayable
    // expenses contribute only their net loss (written-off amount minus
    // returns); pending repayables don't hit the P&L. We replicate the same
    // rules expenseService.listByDate uses, but for a date range.
    const expenses = await prisma.expense.findMany({
      where: { occurredAt: { gte: from, lt: end } },
      include: {
        category: { select: { id: true, name: true } },
        returns: { select: { amount: true } },
      },
    });

    type ExpCatRow = {
      categoryId: string;
      categoryName: string;
      cashGross: Prisma.Decimal;     // ACTIVE+REVERSED − REVERSAL (cash that left, ignoring repayable nuances)
      operating: Prisma.Decimal;     // P&L operating contribution (excludes pending repayables)
    };
    const expCatMap = new Map<string, ExpCatRow>();
    let cashOutTotal = new Prisma.Decimal(0);
    let operatingTotalAll = new Prisma.Decimal(0);

    for (const e of expenses) {
      const row = expCatMap.get(e.categoryId) ?? {
        categoryId: e.categoryId,
        categoryName: e.category.name,
        cashGross: new Prisma.Decimal(0),
        operating: new Prisma.Decimal(0),
      };

      // Cash drawer side (net amount that left or returned via this expense row)
      let cashDelta = new Prisma.Decimal(0);
      if (e.status === ExpenseStatus.ACTIVE || e.status === ExpenseStatus.REVERSED) {
        cashDelta = e.amount;
      } else if (e.status === ExpenseStatus.REVERSAL) {
        cashDelta = e.amount.neg();
      }
      row.cashGross = row.cashGross.plus(cashDelta);
      cashOutTotal = cashOutTotal.plus(cashDelta);

      // P&L (operating) side: matches expense.service.listByDate's math
      if (e.status === ExpenseStatus.ACTIVE || e.status === ExpenseStatus.REVERSED) {
        if (!e.repayable) {
          row.operating = row.operating.plus(e.amount);
          operatingTotalAll = operatingTotalAll.plus(e.amount);
        } else if (e.writtenOffAt) {
          const returned = e.returns.reduce((s, r) => s.plus(r.amount), new Prisma.Decimal(0));
          const loss = e.amount.minus(returned);
          row.operating = row.operating.plus(loss);
          operatingTotalAll = operatingTotalAll.plus(loss);
        }
        // pending-repayable: NOT counted as P&L expense yet
      } else if (e.status === ExpenseStatus.REVERSAL) {
        row.operating = row.operating.minus(e.amount);
        operatingTotalAll = operatingTotalAll.minus(e.amount);
      }

      expCatMap.set(e.categoryId, row);
    }

    const expensesByCategoryCash = Array.from(expCatMap.values())
      .filter((r) => !r.cashGross.isZero())
      .map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        amount: r.cashGross.toFixed(0),
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    // P&L view: exclude ingredient-purchase category from "operating", since
    // those land as COGS when the dish is sold (avoids double-count).
    const expensesByCategoryPnl = Array.from(expCatMap.values())
      .filter((r) => r.categoryId !== INGREDIENT_EXPENSE_CATEGORY_ID && !r.operating.isZero())
      .map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        amount: r.operating.toFixed(0),
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));

    const operatingExclIngredients = (expCatMap.get(INGREDIENT_EXPENSE_CATEGORY_ID)?.operating ?? new Prisma.Decimal(0));
    const operatingForPnl = operatingTotalAll.minus(operatingExclIngredients);

    // ─── Identity sums ───────────────────────────────────────────────────
    // P&L profit = revenue − COGS − operating (ingredient excluded)
    const pnlProfit = totalRevenue.minus(totalCogs).minus(operatingForPnl);

    // Cash basis:
    //   totalIn  = cash sales + card sales + debt collections + expense returns
    //   totalOut = sum of all expense cash deltas (includes ingredient purchases)
    //   farq     = totalIn − totalOut
    const cashTotalIn = salesCash.plus(salesCard).plus(debtRepaidTotal).plus(expenseReturns);
    const cashFarq = cashTotalIn.minus(cashOutTotal);

    return {
      from: localDayKey(from),
      to: localDayKey(input.to),

      // Incomes — both views share these (revenue recognition is the same)
      incomes: {
        byMenuCategory: incomesByMenuCategory.map((r) => ({
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          qty: r.qty,
          revenue: r.revenue.toFixed(0),
          cogs: r.cogs.toFixed(0),
          profit: r.revenue.minus(r.cogs).toFixed(0),
        })),
        totals: {
          qty: lines.reduce((n, l) => n + l.quantity, 0),
          revenue: totalRevenue.toFixed(0),
          cogs: totalCogs.toFixed(0),
        },
        // Non-sales inflows (only relevant to cash basis but useful for both)
        other: {
          debtRepaid: debtRepaidTotal.toFixed(0),
          expenseReturns: expenseReturns.toFixed(0),
        },
        // For the cash-basis view: breakdown of sales by payment method
        salesByPaymentMethod: {
          cash: salesCash.toFixed(0),
          card: salesCard.toFixed(0),
          debt: salesDebt.toFixed(0),
        },
      },

      // P&L (accrual) — sof foyda
      pnl: {
        expensesByCategory: expensesByCategoryPnl,
        revenue: totalRevenue.toFixed(0),
        cogs: totalCogs.toFixed(0),
        operatingExpense: operatingForPnl.toFixed(0),
        profit: pnlProfit.toFixed(0),
      },

      // Cash basis — haqiqiy pul harakati
      cash: {
        expensesByCategory: expensesByCategoryCash,
        salesInflow: salesCash.plus(salesCard).toFixed(0),
        debtRepaid: debtRepaidTotal.toFixed(0),
        expenseReturns: expenseReturns.toFixed(0),
        totalIn: cashTotalIn.toFixed(0),
        totalOut: cashOutTotal.toFixed(0),
        farq: cashFarq.toFixed(0),
      },
    };
  },

  /**
   * Unified daily ledger — single source of truth for daily numbers (PRD 13).
   *
   * Takes a Tashkent calendar day key ("YYYY-MM-DD") and returns one DTO
   * that all surfaces (owner Z-report, admin daily finance, Telegram daily
   * summary) project from. The legacy `daily()` / `dailyForAdmin()` /
   * Telegram formatter rewire onto this in T8 / T9.
   *
   * Canonical P&L:
   *   revenue          = sales.netSales              (gross − discount)
   *   cogs             = Σ OrderLine.cogsSnapshot    (FIFO peel + untracked-unit)
   *   operatingExpense = expense.operating MINUS the ingredient-purchase
   *                      category (those are already in COGS — double-count guard)
   *   profit           = revenue − cogs − operatingExpense
   */
  async dailyLedger(localDay: string) {
    const { start: dayStart, end: dayEnd } = localDayRangeFor(localDay);
    const dayAnchor = parseLocalDay(localDay);
    const prisma = getPrisma();

    // ─── Single parallel fetch of every event source we need ────────────
    const [
      closedOrders,
      canceledOrders,
      walkoutOrders,
      closedLines,
      repayments,
      expenseReturnsAgg,
      expenseSummary,
      operatingExpenseSummary,
      purchasesTotalAgg,
      purchasesCountAgg,
      debtsOpenedAgg,
      debtRepaidAgg,
      outstandingAsOfEod,
    ] = await Promise.all([
      prisma.order.findMany({
        where: { status: OrderStatus.CLOSED, closedAt: { gte: dayStart, lt: dayEnd } },
        include: reportOrderInclude,
        orderBy: { closedAt: 'asc' },
      }),
      prisma.order.findMany({
        where: { status: OrderStatus.CANCELED, canceledAt: { gte: dayStart, lt: dayEnd } },
        include: reportOrderInclude,
        orderBy: { canceledAt: 'asc' },
      }),
      prisma.order.findMany({
        where: { status: OrderStatus.WALKOUT, walkoutAt: { gte: dayStart, lt: dayEnd } },
        include: reportOrderInclude,
        orderBy: { walkoutAt: 'asc' },
      }),
      prisma.orderLine.findMany({
        where: {
          isCanceled: false,
          order: { status: OrderStatus.CLOSED, closedAt: { gte: dayStart, lt: dayEnd } },
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
      }),
      prisma.debtRepayment.findMany({
        where: { paidAt: { gte: dayStart, lt: dayEnd } },
        include: {
          debt: { select: { id: true, debtorName: true, orderId: true } },
          receivedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { paidAt: 'asc' },
      }),
      prisma.expenseReturn.aggregate({
        where: { receivedAt: { gte: dayStart, lt: dayEnd } },
        _sum: { amount: true },
      }),
      expenseService.listByDate(dayAnchor),
      expenseService.listByDate(dayAnchor, {
        excludeCategoryIds: [INGREDIENT_EXPENSE_CATEGORY_ID],
      }),
      prisma.purchase.aggregate({
        where: { occurredAt: { gte: dayStart, lt: dayEnd } },
        _sum: { totalCostUzs: true },
      }),
      prisma.purchase.count({
        where: { occurredAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.debt.aggregate({
        where: { openedAt: { gte: dayStart, lt: dayEnd } },
        _count: true,
        _sum: { originalAmount: true },
      }),
      prisma.debtRepayment.aggregate({
        where: { paidAt: { gte: dayStart, lt: dayEnd } },
        _sum: { amount: true },
      }),
      debtRepo.sumOutstandingAsOf(dayAnchor),
    ]);

    // ─── Sales register ────────────────────────────────────────────────
    let gross = new Prisma.Decimal(0);
    let discount = new Prisma.Decimal(0);
    let serviceCharge = new Prisma.Decimal(0);
    let orderCash = new Prisma.Decimal(0);
    let orderCard = new Prisma.Decimal(0);
    let debtSales = new Prisma.Decimal(0);

    type WaiterRow = {
      waiterId: string;
      waiterName: string;
      orders: number;
      revenue: Prisma.Decimal;
      serviceEarned: Prisma.Decimal;
    };
    const perWaiterMap = new Map<string, WaiterRow>();

    for (const order of closedOrders) {
      gross = gross.plus(dec(order.subtotalSnapshot));
      discount = discount.plus(dec(order.discountAmountSnapshot));
      serviceCharge = serviceCharge.plus(dec(order.serviceChargeSnapshot));
      for (const payment of order.payments) {
        if (payment.method === PaymentMethod.CASH) orderCash = orderCash.plus(payment.amount);
        else if (payment.method === PaymentMethod.CARD) orderCard = orderCard.plus(payment.amount);
        else if (payment.method === PaymentMethod.DEBT) debtSales = debtSales.plus(payment.amount);
      }

      const row = perWaiterMap.get(order.waiterId) ?? {
        waiterId: order.waiterId,
        waiterName: order.waiter.fullName,
        orders: 0,
        revenue: new Prisma.Decimal(0),
        serviceEarned: new Prisma.Decimal(0),
      };
      row.orders += 1;
      row.revenue = row.revenue
        .plus(dec(order.subtotalSnapshot))
        .minus(dec(order.discountAmountSnapshot));
      row.serviceEarned = row.serviceEarned.plus(dec(order.serviceChargeSnapshot));
      perWaiterMap.set(order.waiterId, row);
    }

    const netSales = gross.minus(discount);

    // ─── Cashflow register ─────────────────────────────────────────────
    let debtRepaidCash = new Prisma.Decimal(0);
    let debtRepaidCard = new Prisma.Decimal(0);
    for (const repayment of repayments) {
      if (repayment.method === PaymentMethod.CASH) {
        debtRepaidCash = debtRepaidCash.plus(repayment.amount);
      } else if (repayment.method === PaymentMethod.CARD) {
        debtRepaidCard = debtRepaidCard.plus(repayment.amount);
      }
    }
    const expenseReturnsTotal = expenseReturnsAgg._sum.amount ?? new Prisma.Decimal(0);
    // realCashIn covers ALL real cash that crossed the till today: sales,
    // historical debt repayments, AND money returned from advances/zalogs.
    // Pre-fix this excluded returns, which made owner's cashflowBasedNet
    // disagree with admin's drawer.movement (admin included returns) on any
    // day with an expense return.
    const realCashIn = orderCash
      .plus(orderCard)
      .plus(debtRepaidCash)
      .plus(debtRepaidCard)
      .plus(expenseReturnsTotal);

    // ─── Outflow / P&L ─────────────────────────────────────────────────
    const expenseGross = new Prisma.Decimal(expenseSummary.totals.gross);
    const expenseReversal = new Prisma.Decimal(expenseSummary.totals.reversal);
    const expenseNet = new Prisma.Decimal(expenseSummary.totals.net);
    const operatingExpense = new Prisma.Decimal(operatingExpenseSummary.totals.operating);
    const pendingRepayable = new Prisma.Decimal(expenseSummary.totals.pendingRepayable);
    const ingredientPurchases = purchasesTotalAgg._sum.totalCostUzs ?? new Prisma.Decimal(0);

    let cogs = new Prisma.Decimal(0);
    type MealRow = {
      menuItemId: string;
      menuItemName: string;
      categoryId: string;
      categoryName: string;
      isService: boolean;
      qty: number;
      grossRevenue: Prisma.Decimal;
      cogs: Prisma.Decimal;
    };
    const mealByItem = new Map<string, MealRow>();
    for (const line of closedLines) {
      const lineCogs = line.cogsSnapshot ?? new Prisma.Decimal(0);
      cogs = cogs.plus(lineCogs);
      const key = line.menuItem.id;
      const row = mealByItem.get(key) ?? {
        menuItemId: line.menuItem.id,
        menuItemName: line.nameSnapshot, // historical at sale time
        categoryId: line.menuItem.category.id,
        categoryName: line.menuItem.category.name,
        isService: line.menuItem.kind === 'SERVICE',
        qty: 0,
        grossRevenue: new Prisma.Decimal(0),
        cogs: new Prisma.Decimal(0),
      };
      row.qty += line.quantity;
      // grossRevenue is the per-line snapshot — bill-level discount is NOT
      // distributed back to lines (v1 has no per-line discount). The day-
      // total `pnl.revenue` is `netSales` (= subtotal − discount), so this
      // field is labelled accordingly to avoid confusion.
      row.grossRevenue = row.grossRevenue.plus(line.unitPriceSnapshot.mul(line.quantity));
      row.cogs = row.cogs.plus(lineCogs);
      mealByItem.set(key, row);
    }
    const mealSales = Array.from(mealByItem.values())
      .sort((a, b) => Number(b.grossRevenue) - Number(a.grossRevenue));

    const profit = netSales.minus(cogs).minus(operatingExpense);

    // ─── Line items for drill-down ─────────────────────────────────────
    const ordersTable = closedOrders.map((order) => {
      const payments = paymentBreakdown(order.payments);
      const gross = dec(order.subtotalSnapshot);
      const orderDiscount = dec(order.discountAmountSnapshot);
      return {
        orderId: order.id,
        orderNumber: shortOrderNumber(order.id),
        closedAt: order.closedAt?.toISOString() ?? null,
        tableName: order.table?.name ?? null,
        waiterName: order.waiter.fullName,
        gross: decStr(gross),
        discount: decStr(orderDiscount),
        net: decStr(gross.minus(orderDiscount)),
        service: decStr(order.serviceChargeSnapshot),
        cash: decStr(payments.cash),
        card: decStr(payments.card),
        debt: decStr(payments.debt),
        total: decStr(order.totalSnapshot),
      };
    });

    return {
      date: localDay,
      sales: {
        closedCount: closedOrders.length,
        canceledCount: canceledOrders.length,
        walkoutCount: walkoutOrders.length,
        gross: decStr(gross),
        discount: decStr(discount),
        netSales: decStr(netSales),
        serviceCharge: decStr(serviceCharge),
        debtSales: decStr(debtSales),
      },
      cashflow: {
        orderCash: decStr(orderCash),
        orderCard: decStr(orderCard),
        debtRepaidCash: decStr(debtRepaidCash),
        debtRepaidCard: decStr(debtRepaidCard),
        expenseReturns: decStr(expenseReturnsTotal),
        realCashIn: decStr(realCashIn),
      },
      outflow: {
        expenseGross: decStr(expenseGross),
        expenseReversal: decStr(expenseReversal),
        expenseNet: decStr(expenseNet),
        operatingExpense: decStr(operatingExpense),
        pendingRepayable: decStr(pendingRepayable),
        ingredientPurchases: decStr(ingredientPurchases),
        ingredientPurchasesCount: purchasesCountAgg,
      },
      pnl: {
        revenue: decStr(netSales),
        cogs: decStr(cogs),
        operatingExpense: decStr(operatingExpense),
        profit: decStr(profit),
      },
      debt: {
        openedTodayCount: debtsOpenedAgg._count,
        openedTodayAmount: decStr(debtsOpenedAgg._sum.originalAmount ?? new Prisma.Decimal(0)),
        repaidTodayAmount: decStr(debtRepaidAgg._sum.amount ?? new Prisma.Decimal(0)),
        outstandingAsOfEod: decStr(outstandingAsOfEod),
      },
      perWaiter: Array.from(perWaiterMap.values())
        .sort((a, b) => Number(b.revenue) - Number(a.revenue))
        .map((row) => ({
          waiterId: row.waiterId,
          waiterName: row.waiterName,
          orders: row.orders,
          revenue: decStr(row.revenue),
          serviceEarned: decStr(row.serviceEarned),
        })),
      incidents: {
        walkouts: walkoutOrders.map((order) => ({
          orderId: order.id,
          walkoutAt: (order.walkoutAt ?? order.updatedAt).toISOString(),
          walkoutById: order.walkoutById ?? null,
          walkoutByName: order.walkoutBy?.fullName ?? null,
          amount: decStr(order.totalSnapshot),
          reason: order.cancelReason ?? '',
        })),
        cancellations: canceledOrders.map((order) => ({
          orderId: order.id,
          canceledAt: order.canceledAt?.toISOString() ?? order.updatedAt.toISOString(),
          reason: order.cancelReason ?? '',
        })),
      },
      lines: {
        closedOrders: ordersTable,
        mealSales: mealSales.map((row) => ({
          menuItemId: row.menuItemId,
          menuItemName: row.menuItemName,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          isService: row.isService,
          qty: row.qty,
          grossRevenue: decStr(row.grossRevenue),
          cogs: decStr(row.cogs),
          profit: decStr(row.grossRevenue.minus(row.cogs)),
        })),
        debtRepayments: repayments.map((repayment) => ({
          id: repayment.id,
          amount: decStr(repayment.amount),
          method: repayment.method,
          debtorName: repayment.debt.debtorName,
          orderNumber: shortOrderNumber(repayment.debt.orderId),
          paidAt: repayment.paidAt.toISOString(),
          receivedByName: repayment.receivedBy.fullName,
        })),
      },
    };
  },
};
