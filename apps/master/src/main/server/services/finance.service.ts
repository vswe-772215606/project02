import { OrderStatus, Prisma } from '@prisma/client';
import { dayRange, dayKey } from '../lib/date';
import { computeRealCashIn } from '../lib/finance-formulas';
import { getPrisma } from '../lib/prisma';
import { dailyCloseRepo } from '../repositories/dailyClose.repo';
import { debtRepo } from '../repositories/debt.repo';
import { expenseService } from './expense.service';

function decStr(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(0);
}

type DailyCore = Awaited<ReturnType<typeof buildDailyCore>>;

async function buildDailyCore(date: Date) {
  const { from: dayStart, to: dayEnd } = dayRange(date);
  const prisma = getPrisma();

  const closedOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.CLOSED,
      closedAt: { gte: dayStart, lt: dayEnd },
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
      updatedAt: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true, totalSnapshot: true },
  });

  let grossSales = new Prisma.Decimal(0);
  let discounts = new Prisma.Decimal(0);
  let serviceCharge = new Prisma.Decimal(0);

  for (const order of closedOrders) {
    grossSales = grossSales.plus(order.subtotalSnapshot ?? 0);
    discounts = discounts.plus(order.discountAmountSnapshot ?? 0);
    serviceCharge = serviceCharge.plus(order.serviceChargeSnapshot ?? 0);
  }

  const walkoutLoss = walkoutOrders.reduce(
    (sum, o) => sum.plus(o.totalSnapshot ?? 0),
    new Prisma.Decimal(0),
  );

  // Qarz qaytimi shu kun
  const debtRepayments = await debtRepo.listRepaymentsForDate(dayStart);

  // Xarid ro'yxati shu kun (occurredAt bo'yicha)
  const purchases = await prisma.purchase.findMany({
    where: { occurredAt: { gte: dayStart, lt: dayEnd } },
    include: { ingredient: { select: { id: true, name: true, buyUnit: true } } },
    orderBy: [{ occurredAt: 'asc' }],
  });
  const purchasesTotal = purchases.reduce(
    (sum, p) => sum.plus(p.totalCostUzs),
    new Prisma.Decimal(0),
  );

  // Expense summary (shu kunga tegishli; isAdjustment ham ichida)
  const expenseSummary = await expenseService.listByDate(date);

  // Xarid bilan bog'liq Expense larning yig'indisi (purchase.expense): bu summa
  // ikki marta sanalmasligi uchun expensesNonPurchase'dan ayriladi.
  const expensesGross = new Prisma.Decimal(expenseSummary.totals.gross);
  const expensesReversal = new Prisma.Decimal(expenseSummary.totals.reversal);
  const expensesNet = new Prisma.Decimal(expenseSummary.totals.net);
  const operatingExpense = new Prisma.Decimal(expenseSummary.totals.operating);
  const pendingRepayable = new Prisma.Decimal(expenseSummary.totals.pendingRepayable);
  const expensesNonPurchase = expensesNet.minus(purchasesTotal);
  // Foydalanuvchi UI da qo'shsa: expensesNonPurchase + purchasesTotal = expensesTotal.
  // expensesTotal — net (reversal hisobga olingan, lekin pending-repayable kiritilgan
  // bo'lib turibdi — chunki cashflow drawer hisobi shuni talab qiladi).
  const expensesTotal = expensesNonPurchase.plus(purchasesTotal);

  // Chiqim qaytimi shu kun (avans qaytgan)
  const expenseReturns = await prisma.expenseReturn.aggregate({
    where: { receivedAt: { gte: dayStart, lt: dayEnd } },
    _sum: { amount: true },
  });
  const expenseReturnsTotal = expenseReturns._sum.amount ?? new Prisma.Decimal(0);

  const cash = computeRealCashIn({
    closedOrders,
    debtRepayments,
    expenseReturnsTotal,
  });

  const outstandingDebts = await debtRepo.sumOutstanding();

  // Drawer haqiqiy harakati: real kirim − real chiqim (gross − reversal − qaytim).
  // Bu yerda `expenseReturnsTotal` allaqachon `realCashIn` ichida — kassaga kirgan
  // pul sifatida. Chiqimda esa `expensesGross − expensesReversal` (gross out).
  const drawerOut = expensesGross.minus(expensesReversal);
  const drawerMovement = cash.realCashIn.minus(drawerOut);

  return {
    date: dayKey(dayStart),
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
      cashIn: decStr(cash.orderCash),
      cardIn: decStr(cash.orderCard),
      debtOpened: decStr(cash.debtOpened),
      debtRepaidCash: decStr(cash.debtRepaymentsCash),
      debtRepaidCard: decStr(cash.debtRepaymentsCard),
      expenseReturns: decStr(cash.expenseReturns),
      totalIn: decStr(cash.realCashIn),
    },
    outflow: {
      // YANGI shakl: ikki marta sanashni oldini olish uchun ajratilgan.
      // expensesTotal = expensesNonPurchase + purchasesTotal (hech qachon
      // qo'shilmasligi kerak bo'lgan, alohida ko'rsatiladigan raqamlar).
      expensesNonPurchase: decStr(expensesNonPurchase),
      purchasesTotal: decStr(purchasesTotal),
      expensesTotal: decStr(expensesTotal),
      purchasesCount: purchases.length,
      // Eskidan qoldirilgan tafsilotlar
      expensesGross: expenseSummary.totals.gross,
      expensesReversal: expenseSummary.totals.reversal,
      expensesNet: decStr(expensesNet),
      operatingExpense: decStr(operatingExpense),
      pendingRepayable: decStr(pendingRepayable),
    },
    drawer: {
      movement: decStr(drawerMovement),
      outstandingDebts: decStr(outstandingDebts),
    },
    purchases: purchases.map((p) => ({
      id: p.id,
      occurredAt: p.occurredAt.toISOString(),
      ingredientName: p.ingredient.name,
      quantityBuyUnit: p.quantityBuyUnit.toFixed(3),
      buyUnit: p.ingredient.buyUnit,
      totalCostUzs: decStr(p.totalCostUzs),
      supplierNote: p.supplierNote,
      isAdjustment: p.isAdjustment,
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
      isAdjustment: (e as { isAdjustment?: boolean }).isAdjustment ?? false,
    })),
    closedOrders: closedOrders.map((o) => ({
      id: o.id,
      closedAt: o.closedAt?.toISOString() ?? null,
      waiterName: o.waiter.fullName,
      tableName: o.table?.name ?? null,
      billedTotal: decStr(o.totalSnapshot),
    })),
  };
}

/**
 * Tuzatishlar yig'indisi: shu kun yopilgandan keyin kiritilgan Expense
 * (isAdjustment=true) va Purchase (isAdjustment=true) yozuvlari.
 *
 * Bu raqamlar `current` ichida ham bor — alohida ko'rsatish foydalanuvchiga
 * "yopilgan kun snapshotidan keyin yana nima qo'shilgan" ni tushuntirish uchun.
 */
async function buildAdjustments(date: Date) {
  const { from: dayStart, to: dayEnd } = dayRange(date);
  const prisma = getPrisma();

  const [adjExpenses, adjPurchases] = await Promise.all([
    prisma.expense.findMany({
      where: {
        occurredAt: { gte: dayStart, lt: dayEnd },
        isAdjustment: true,
      },
      include: {
        category: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.purchase.findMany({
      where: {
        occurredAt: { gte: dayStart, lt: dayEnd },
        isAdjustment: true,
      },
      include: {
        ingredient: { select: { id: true, name: true, buyUnit: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const expenseTotal = adjExpenses.reduce(
    (sum, e) => (e.status === 'REVERSAL' ? sum.minus(e.amount) : sum.plus(e.amount)),
    new Prisma.Decimal(0),
  );
  const purchaseTotal = adjPurchases.reduce(
    (sum, p) => sum.plus(p.totalCostUzs),
    new Prisma.Decimal(0),
  );

  return {
    expenseCount: adjExpenses.length,
    expenseTotal: decStr(expenseTotal),
    purchaseCount: adjPurchases.length,
    purchaseTotal: decStr(purchaseTotal),
    expenses: adjExpenses.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      categoryName: e.category.name,
      reason: e.reason,
      amount: decStr(e.amount),
      status: e.status,
      createdByName: e.createdBy.fullName,
    })),
    purchases: adjPurchases.map((p) => ({
      id: p.id,
      occurredAt: p.occurredAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
      ingredientName: p.ingredient.name,
      quantityBuyUnit: p.quantityBuyUnit.toFixed(3),
      buyUnit: p.ingredient.buyUnit,
      totalCostUzs: decStr(p.totalCostUzs),
      recordedByName: p.recordedBy.fullName,
    })),
  };
}

export const financeService = {
  /**
   * Admin uchun kunlik moliya. Default holatda yopilgan-snapshot va
   * tuzatishlar bilan kelgan to'liq envelope qaytaradi. `includeEnvelope=false`
   * — faqat hozirgi raqamlarni qaytaradi (finance-close.service ishlatadi).
   */
  async dailyForAdmin(
    date: Date,
    options: { includeEnvelope?: boolean } = {},
  ): Promise<DailyCore & {
    closed: null | {
      closedAt: string;
      closedByName: string;
      note: string | null;
      snapshot: Prisma.JsonValue;
    };
    adjustments: null | Awaited<ReturnType<typeof buildAdjustments>>;
  }> {
    const includeEnvelope = options.includeEnvelope ?? true;
    const core = await buildDailyCore(date);

    if (!includeEnvelope) {
      return { ...core, closed: null, adjustments: null };
    }

    const [closeRow, adjustments] = await Promise.all([
      dailyCloseRepo.findByDate(core.date),
      buildAdjustments(date),
    ]);

    return {
      ...core,
      closed: closeRow
        ? {
            closedAt: closeRow.closedAt.toISOString(),
            closedByName: closeRow.closedBy.fullName,
            note: closeRow.note,
            snapshot: closeRow.snapshot,
          }
        : null,
      adjustments,
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
