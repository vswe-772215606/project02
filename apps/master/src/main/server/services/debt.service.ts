import { DebtStatus, PaymentMethod, Prisma } from '@prisma/client';
import { debtStatusAfterRepayment, writtenOffAmountOf } from '../lib/debt-ledger-row';
import { Errors } from '../lib/errors';
import { getPrisma } from '../lib/prisma';
import { debtRepo } from '../repositories/debt.repo';
import { userRepo } from '../repositories/user.repo';
import { auditService } from './audit.service';
import { alertService } from './alert.service';

type Tx = Prisma.TransactionClient;

function decimalToString(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(0);
}

function decimalOrNull(value: Prisma.Decimal | null): string | null {
  return value === null ? null : decimalToString(value);
}

/**
 * The status a screen shows. A written-off debt that is not yet paid in full is
 * WRITTEN_OFF whatever a payment before this rule left in its row (money rules
 * D14, D24); paid in full after a write-off, it is PAID.
 */
function shownStatus(item: { status: DebtStatus; remainingAmount: Prisma.Decimal; writtenOffAt: Date | null }): DebtStatus {
  if (item.writtenOffAt === null) return item.status;
  return debtStatusAfterRepayment({ remaining: item.remainingAmount, writtenOff: true });
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
    status: shownStatus(item),
    writtenOffAt: item.writtenOffAt?.toISOString() ?? null,
    writtenOffReason: item.writtenOffReason,
    writtenOffByName: item.writtenOffBy?.fullName ?? null,
    // What the write-off took off the books; the balance still payable is remainingAmount.
    writtenOffAmount: decimalOrNull(writtenOffAmountOf(item)),
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
        status: shownStatus(item),
        writtenOffAt: item.writtenOffAt?.toISOString() ?? null,
        writtenOffReason: item.writtenOffReason,
        writtenOffByName: null,
        writtenOffAmount: decimalOrNull(writtenOffAmountOf(item)),
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
      // Take the amount off the balance in one conditional statement, so two
      // repayments at the same moment both count and together can never
      // overpay (PRD 14 G2). Who can be repaid does not change: any debt that
      // is not PAID, a written-off one included (money rules D14). If the
      // statement matches nothing, a repayment that landed since the checks
      // above has used the balance up, and the re-read only picks the error.
      if (!(await debtRepo.applyRepayment(debt.id, amount, tx))) {
        const current = await debtRepo.findById(debt.id, tx);
        if (!current || current.status === DebtStatus.PAID) {
          throw Errors.DebtNotOpen();
        }
        throw Errors.DebtOverpay();
      }

      const repayment = await debtRepo.createRepayment({
        debt: { connect: { id: debt.id } },
        amount,
        method: input.method,
        paidAt: input.paidAt,
        note: input.note?.trim() || null,
        receivedBy: { connect: { id: input.actorUserId } },
      }, tx);

      const after = await debtRepo.findById(debt.id, tx);
      if (!after) {
        throw Errors.NotFound('Debt');
      }
      // Paid in full → PAID, written off or not. A balance left on a
      // written-off debt keeps it WRITTEN_OFF: its loss stays on the write-off
      // day and the rest stays payable (money rules D14, D24).
      const status = debtStatusAfterRepayment({
        remaining: after.remainingAmount,
        writtenOff: after.writtenOffAt !== null,
      });
      const closedAt = status === DebtStatus.PAID
        ? input.paidAt
        : status === DebtStatus.WRITTEN_OFF
          ? after.closedAt
          : null;

      await debtRepo.update(debt.id, { status, closedAt }, tx);

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

      if (status === DebtStatus.PAID) {
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
    if (debt.writtenOffAt !== null) {
      // WRITTEN_OFF, or PAID after a write-off: a debt is written off once (D14).
      throw Errors.DebtAlreadyWrittenOff();
    }
    if (debt.status === DebtStatus.PAID || debt.remainingAmount.lte(0)) {
      throw Errors.DebtNotOpen();
    }
    const reason = input.reason.trim();
    if (!reason) {
      throw Errors.Validation('Yo\'qotish sababini yozish kerak');
    }

    const writtenOff = await getPrisma().$transaction(async (tx) => {
      // The checks above only choose the error message. A repayment may have
      // landed since they ran, so what is written off is what the debt holds now,
      // read here: the transaction opens with BEGIN IMMEDIATE, so nothing else
      // writes between this read and the commit (PRD 14 G2).
      const current = await debtRepo.findById(debt.id, tx);
      if (!current) {
        throw Errors.NotFound('Debt');
      }
      if (current.writtenOffAt !== null) {
        throw Errors.DebtAlreadyWrittenOff();
      }
      if (current.status !== DebtStatus.OPEN && current.status !== DebtStatus.PARTIAL) {
        throw Errors.DebtNotOpen();
      }

      // Stamped inside the transaction, so no repayment can commit between the
      // stamp and the claim (PRD 14 §10).
      const writtenOffAt = new Date();
      const claimed = await debtRepo.writeOffIfOpen(debt.id, {
        writtenOffById: input.actorUserId,
        writtenOffReason: reason,
        writtenOffAt,
      }, tx);
      if (!claimed) {
        throw Errors.DebtNotOpen();
      }

      await auditService.log({
        userId: input.actorUserId,
        action: 'DEBT_WRITTEN_OFF',
        entityType: 'Debt',
        entityId: debt.id,
        metadata: {
          debtId: debt.id,
          reason,
          originalAmount: current.originalAmount.toFixed(0),
          remainingAtWriteOff: current.remainingAmount.toFixed(0),
          writtenOffAt: writtenOffAt.toISOString(),
        },
      }, tx);

      return { amount: current.remainingAmount };
    });

    // Owner alert (post-commit, fire-and-forget) — a written-off debt is a
    // real loss worth surfacing immediately, and the owner is told who did it
    // (money rules D14).
    const actor = await userRepo.findById(input.actorUserId);
    void alertService.debtWriteOff({
      debtorName: debt.debtorName,
      amount: writtenOff.amount.toFixed(0),
      reason,
      actorName: actor?.fullName ?? null,
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
