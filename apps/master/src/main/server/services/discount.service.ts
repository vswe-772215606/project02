import { Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { discountRepo } from '../repositories/discount.repo';
import { auditService } from './audit.service';
import { settingsService } from './settings.service';

export const discountService = {
  async listAll(includeInactive = false) {
    if (includeInactive) {
      return discountRepo.listAll();
    }
    return discountRepo.listActive();
  },

  /** A discount is always a whole so'm amount, so there is one cap to check. */
  async validateAgainstCap(value: number | Prisma.Decimal) {
    const numValue = typeof value === 'number' ? value : value.toNumber();
    const maxAmount = settingsService.getInt('max_discount_amount', 100000);
    if (numValue > maxAmount) {
      throw Errors.DiscountCapExceeded(`Chegirma summasi maksimal miqdordan (${maxAmount} UZS) oshib ketdi`);
    }
  },

  async create(
    input: {
      name: string;
      value: number | string;
    },
    actorUserId: string,
  ) {
    await this.validateAgainstCap(Number(input.value));

    const discount = await discountRepo.create({
      name: input.name,
      value: new Prisma.Decimal(input.value),
      createdBy: { connect: { id: actorUserId } },
    });

    await auditService.log({
      userId: actorUserId,
      action: 'DISCOUNT_CREATED',
      entityType: 'Discount',
      entityId: discount.id,
      metadata: { name: discount.name, value: discount.value.toString() },
    });

    return discount;
  },

  async update(
    id: string,
    input: {
      name?: string;
      value?: number | string;
      isActive?: boolean;
    },
    actorUserId: string,
  ) {
    const existing = await discountRepo.findById(id);
    if (!existing) throw Errors.NotFound('Discount');

    if (input.value !== undefined) {
      await this.validateAgainstCap(Number(input.value));
    }

    const updated = await discountRepo.update(id, {
      name: input.name,
      value: input.value !== undefined ? new Prisma.Decimal(input.value) : undefined,
      isActive: input.isActive,
    });

    await auditService.log({
      userId: actorUserId,
      action: 'DISCOUNT_EDITED',
      entityType: 'Discount',
      entityId: id,
      metadata: { 
        old: { name: existing.name, value: existing.value.toString(), isActive: existing.isActive },
        new: { name: updated.name, value: updated.value.toString(), isActive: updated.isActive }
      },
    });

    return updated;
  },

  async softDelete(id: string, actorUserId: string) {
    const updated = await discountRepo.softDelete(id);
    await auditService.log({
      userId: actorUserId,
      action: 'DISCOUNT_DELETED',
      entityType: 'Discount',
      entityId: id,
      metadata: {},
    });
    return updated;
  },
};
