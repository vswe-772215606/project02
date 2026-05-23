import { Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { dayKey, dayStart, parseDayKey } from '../lib/date';
import { getPrisma } from '../lib/prisma';
import { dailyCloseRepo } from '../repositories/dailyClose.repo';
import { auditService } from './audit.service';
import { financeService } from './finance.service';

// Yopish paytida saqlanadigan rasmiy raqamlar to'plami.
// Renderer va monthly report shu shaklga tayanadi — `Prisma.InputJsonValue`
// kabi `Json` ustunga to'g'ridan-to'g'ri yoziladi.
export type DailyCloseSnapshot = {
  date: string;
  // Sales
  grossSales: string;
  discounts: string;
  netSales: string;
  serviceCharge: string;
  billedTotal: string;
  closedOrders: number;
  walkoutOrders: number;
  walkoutLoss: string;
  // Cashflow
  cashIn: string;
  cardIn: string;
  debtOpened: string;
  debtRepaidCash: string;
  debtRepaidCard: string;
  expenseReturns: string;
  realCashIn: string;
  // Outflow (purchase + non-purchase ajratilgan holatda)
  expensesNonPurchase: string;
  purchasesTotal: string;
  expensesTotal: string;
  expensesGross: string;
  expensesReversal: string;
  expensesNet: string;
  operatingExpense: string;
  pendingRepayable: string;
  // Result
  drawerMovement: string;
  outstandingDebts: string;
};

function decFromString(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value || '0');
}

export const financeCloseService = {
  async findByDate(date: Date) {
    return dailyCloseRepo.findByDate(dayKey(date));
  },

  async listInRange(from: Date, to: Date) {
    return dailyCloseRepo.listInRange(dayKey(from), dayKey(to));
  },

  /**
   * Belgilangan sana uchun moliyaviy snapshotni yozadi. Yopilgan kun qaytadan
   * yopilmaydi — `DAILY_ALREADY_CLOSED` xatosi qaytariladi.
   *
   * Snapshot manbasi: `financeService.dailyForAdmin` (joriy raqamlar). Yopilgan
   * paytda kelajakdagi tuzatishlar bu raqamlarga ta'sir qilmaydi — ular
   * `isAdjustment=true` bilan alohida agregatda chiqadi.
   */
  async close(input: { date: Date; actorUserId: string; note?: string }) {
    const localDate = dayStart(input.date);
    const key = dayKey(localDate);

    const existing = await dailyCloseRepo.findByDate(key);
    if (existing) {
      throw Errors.Conflict('Bu kun allaqachon yopilgan');
    }

    // Yopish paytidagi hozirgi (real-time) raqamlar.
    const current = await financeService.dailyForAdmin(localDate, { includeEnvelope: false });

    const snapshot: DailyCloseSnapshot = {
      date: key,
      grossSales: current.sales.grossSales,
      discounts: current.sales.discounts,
      netSales: decFromString(current.sales.grossSales).minus(decFromString(current.sales.discounts)).toFixed(0),
      serviceCharge: current.sales.serviceCharge,
      billedTotal: current.sales.billedTotal,
      closedOrders: current.sales.closedOrders,
      walkoutOrders: current.sales.walkoutOrders,
      walkoutLoss: current.sales.walkoutLoss,
      cashIn: current.cashflow.cashIn,
      cardIn: current.cashflow.cardIn,
      debtOpened: current.cashflow.debtOpened,
      debtRepaidCash: current.cashflow.debtRepaidCash,
      debtRepaidCard: current.cashflow.debtRepaidCard,
      expenseReturns: current.cashflow.expenseReturns,
      realCashIn: current.cashflow.totalIn,
      expensesNonPurchase: current.outflow.expensesNonPurchase,
      purchasesTotal: current.outflow.purchasesTotal,
      expensesTotal: current.outflow.expensesTotal,
      expensesGross: current.outflow.expensesGross,
      expensesReversal: current.outflow.expensesReversal,
      expensesNet: current.outflow.expensesNet,
      operatingExpense: current.outflow.operatingExpense,
      pendingRepayable: current.outflow.pendingRepayable,
      drawerMovement: current.drawer.movement,
      outstandingDebts: current.drawer.outstandingDebts,
    };

    const created = await getPrisma().$transaction(async (tx) => {
      const row = await dailyCloseRepo.create(
        {
          date: key,
          closedByUserId: input.actorUserId,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          note: input.note?.trim() || null,
        },
        tx,
      );

      await auditService.log(
        {
          userId: input.actorUserId,
          action: 'DAILY_CLOSED',
          entityType: 'DailyClose',
          entityId: row.id,
          metadata: {
            date: key,
            billedTotal: snapshot.billedTotal,
            realCashIn: snapshot.realCashIn,
            expensesTotal: snapshot.expensesTotal,
          },
        },
        tx,
      );

      return row;
    });

    return {
      id: created.id,
      date: created.date,
      closedAt: created.closedAt.toISOString(),
      closedByUserId: created.closedByUserId,
      closedByName: created.closedBy.fullName,
      snapshot,
      note: created.note,
    };
  },

  /**
   * OWNER tomonidan kunni qayta ochish — masalan, yopish noto'g'ri raqamlar
   * bilan qilingan bo'lsa. AuditLog'ga yoziladi.
   */
  async reopen(input: { date: Date; actorUserId: string; reason: string }) {
    const key = dayKey(input.date);
    const existing = await dailyCloseRepo.findByDate(key);
    if (!existing) {
      throw Errors.NotFound('DailyClose');
    }
    const reason = input.reason.trim();
    if (!reason) {
      throw Errors.Validation('Qayta ochish sababini yozish kerak');
    }

    await getPrisma().$transaction(async (tx) => {
      await dailyCloseRepo.deleteByDate(key, tx);
      await auditService.log(
        {
          userId: input.actorUserId,
          action: 'DAILY_REOPENED',
          entityType: 'DailyClose',
          entityId: existing.id,
          metadata: { date: key, reason },
        },
        tx,
      );
    });
  },

  /** Tashqi util: Expense / Purchase create yo'lida tezkor tekshiruv. */
  async isDateClosed(date: Date): Promise<boolean> {
    const row = await dailyCloseRepo.findByDate(dayKey(date));
    return row !== null;
  },
};

// Util eksport — kun kalitini olish (controller'lar uchun).
export { dayKey, parseDayKey };
