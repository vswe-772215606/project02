import { DebtStatus, PaymentMethod, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { getPrisma } from '../lib/prisma';
import { debtRepo } from '../repositories/debt.repo';
import { auditService } from './audit.service';
import { alertService } from './alert.service';

type Tx = Prisma.TransactionClient;

function decimalToString(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(0);
}

function mapDebt(item: Awaited<ReturnType<typeof debtRepo.findById>>) {
  if (!item) {
    return null;
  }

  const repaid = item.originalAmount.minus(item.remainingAmount);

  return {
    id: item.id,
    orderId: item.orderId,
    orderNumber: item.orderId.slice(-6).toUpperCase(),
    debtorName: item.debtorName,
    debtorPhone: item.debtorPhone,
    note: item.note,
    originalAmount: decimalToString(item.originalAmount),
    remainingAmount: decimalToString(item.remainingAmount),
    repaidAmount: decimalToString(repaid),
    openedAt: item.openedAt.toISOString(),
    closedAt: item.closedAt?.toISOString() ?? null,
    status: item.status,
    writtenOffAt: item.writtenOffAt?.toISOString() ?? null,
    writtenOffReason: item.writtenOffReason,
    repayments: item.repayments.map((repayment) => ({
      id: repayment.id,
      amount: decimalToString(repayment.amount),
      method: repayment.method,
      paidAt: repayment.paidAt.toISOString(),
      note: repayment.note,
      receivedById: repayment.receivedById,
      receivedByName: repayment.receivedBy.fullName,
    })),
    order: {
      id: item.order.id,
      orderNumber: item.order.id.slice(-6).toUpperCase(),
      closedAt: item.order.closedAt?.toISOString() ?? null,
      totalSnapshot: decimalToString(item.order.totalSnapshot),
      waiterName: item.order.waiter.fullName,
      tableName: item.order.table?.name ?? null,
    },
  };
}

export const debtService = {
  async createFromClosedOrder(input: {
    orderId: string;
    amount: Prisma.Decimal | string | number;
    debtorName: string;
    debtorPhone?: string;
    note?: string;
    actorUserId: string;
    openedAt: Date;
  }, tx: Tx) {
    const existing = await debtRepo.findByOrderId(input.orderId, tx);
    if (existing) {
      throw Errors.DebtAlreadyExists();
    }

    const amount = new Prisma.Decimal(input.amount);
    const created = await debtRepo.create({
      order: { connect: { id: input.orderId } },
      debtorName: input.debtorName.trim(),
      debtorPhone: input.debtorPhone?.trim() || null,
      note: input.note?.trim() || null,
      originalAmount: amount,
      remainingAmount: amount,
      openedAt: input.openedAt,
      createdBy: { connect: { id: input.actorUserId } },
    }, tx);

    await auditService.log({
      userId: input.actorUserId,
      action: 'DEBT_CREATED',
      entityType: 'Debt',
      entityId: created.id,
      metadata: {
        orderId: input.orderId,
        debtorName: created.debtorName,
        amount: created.originalAmount.toFixed(0),
        openedAt: created.openedAt.toISOString(),
      },
    }, tx);

    return created;
  },

  async list(input: { status?: DebtStatus; date?: Date }) {
    const items = await debtRepo.list(input);
    return {
      items: items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        orderNumber: item.orderId.slice(-6).toUpperCase(),
        debtorName: item.debtorName,
        debtorPhone: item.debtorPhone,
        note: item.note,
        originalAmount: decimalToString(item.originalAmount),
        remainingAmount: decimalToString(item.remainingAmount),
        repaidAmount: decimalToString(item.originalAmount.minus(item.remainingAmount)),
        openedAt: item.openedAt.toISOString(),
        closedAt: item.closedAt?.toISOString() ?? null,
        status: item.status,
      })),
    };
  },

  async getById(id: string) {
    const debt = await debtRepo.findById(id);
    if (!debt) {
      throw Errors.NotFound('Debt');
    }
    return mapDebt(debt);
  },

  async recordRepayment(input: {
    debtId: string;
    amount: string | number;
    method: PaymentMethod;
    paidAt: Date;
    note?: string;
    actorUserId: string;
  }) {
    if (![PaymentMethod.CASH, PaymentMethod.CARD].includes(input.method)) {
      throw Errors.Validation('Qarz to\'lovi faqat naqd yoki karta orqali qabul qilinadi');
    }

    const debt = await debtRepo.findById(input.debtId);
    if (!debt) {
      throw Errors.NotFound('Debt');
    }
    if (debt.status === DebtStatus.PAID || debt.remainingAmount.lte(0)) {
      throw Errors.DebtNotOpen();
    }

    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw Errors.Validation('Qarz to\'lovi 0 dan katta bo\'lishi kerak');
    }
    if (amount.gt(debt.remainingAmount)) {
      throw Errors.DebtOverpay();
    }

    await getPrisma().$transaction(async (tx) => {
      const repayment = await debtRepo.createRepayment({
        debt: { connect: { id: debt.id } },
        amount,
        method: input.method,
        paidAt: input.paidAt,
        note: input.note?.trim() || null,
        receivedBy: { connect: { id: input.actorUserId } },
      }, tx);

      const remainingAmount = debt.remainingAmount.minus(amount);
      const status = remainingAmount.isZero()
        ? DebtStatus.PAID
        : DebtStatus.PARTIAL;

      await debtRepo.update(debt.id, {
        remainingAmount,
        status,
        closedAt: remainingAmount.isZero() ? input.paidAt : null,
      }, tx);

      await auditService.log({
        userId: input.actorUserId,
        action: 'DEBT_PAYMENT_RECORDED',
        entityType: 'Debt',
        entityId: debt.id,
        metadata: {
          debtId: debt.id,
          repaymentId: repayment.id,
          amount: repayment.amount.toFixed(0),
          method: repayment.method,
          paidAt: repayment.paidAt.toISOString(),
        },
      }, tx);

      if (remainingAmount.isZero()) {
        await auditService.log({
          userId: input.actorUserId,
          action: 'DEBT_CLOSED',
          entityType: 'Debt',
          entityId: debt.id,
          metadata: {
            debtId: debt.id,
            closedAt: input.paidAt.toISOString(),
          },
        }, tx);
      }
    });

    return this.getById(debt.id);
  },

  async writeOff(input: {
    debtId: string;
    reason: string;
    actorUserId: string;
  }) {
    const debt = await debtRepo.findById(input.debtId);
    if (!debt) {
      throw Errors.NotFound('Debt');
    }
    if (debt.status === DebtStatus.WRITTEN_OFF) {
      throw Errors.DebtAlreadyWrittenOff();
    }
    if (debt.status === DebtStatus.PAID || debt.remainingAmount.lte(0)) {
      throw Errors.DebtNotOpen();
    }
    if (!input.reason.trim()) {
      throw Errors.Validation('Yo\'qotish sababini yozish kerak');
    }

    const writtenOffAt = new Date();

    await getPrisma().$transaction(async (tx) => {
      await debtRepo.markWrittenOff(debt.id, {
        writtenOffById: input.actorUserId,
        writtenOffReason: input.reason.trim(),
        writtenOffAt,
      }, tx);

      await auditService.log({
        userId: input.actorUserId,
        action: 'DEBT_WRITTEN_OFF',
        entityType: 'Debt',
        entityId: debt.id,
        metadata: {
          debtId: debt.id,
          reason: input.reason.trim(),
          originalAmount: debt.originalAmount.toFixed(0),
          remainingAtWriteOff: debt.remainingAmount.toFixed(0),
          writtenOffAt: writtenOffAt.toISOString(),
        },
      }, tx);
    });

    // Owner alert (post-commit, fire-and-forget) — a written-off debt is a
    // real loss worth surfacing immediately.
    void alertService.debtWriteOff({
      debtorName: debt.debtorName,
      amount: debt.remainingAmount.toFixed(0),
      reason: input.reason.trim(),
    });

    return this.getById(debt.id);
  },

  async openedTodaySummary(date: Date) {
    return debtRepo.openedTodaySummary(date);
  },

  async repaymentTotalsForDate(date: Date) {
    return debtRepo.repaymentTotalsForDate(date);
  },

  async outstandingTotal() {
    return debtRepo.sumOutstanding();
  },
};
