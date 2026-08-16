import { DiscountType, Prisma } from '@prisma/client';
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

  async validateAgainstCap(type: DiscountType, value: number | Prisma.Decimal) {
    const numValue = typeof value === 'number' ? value : value.toNumber();
    
    if (type === 'PERCENT') {
      const maxPercent = settingsService.getInt('max_discount_percent', 15);
      if (numValue > maxPercent) {
        throw Errors.DiscountCapExceeded(`Chegirma foizi maksimal miqdordan (${maxPercent}%) oshib ketdi`);
      }
    } else if (type === 'FIXED') {
      const maxAmount = settingsService.getInt('max_discount_amount', 100000);
      if (numValue > maxAmount) {
        throw Errors.DiscountCapExceeded(`Chegirma summasi maksimal miqdordan (${maxAmount} UZS) oshib ketdi`);
      }
    }
  },

  async create(
    input: {
      name: string;
      type: DiscountType;
      value: number | string;
    },
    actorUserId: string,
  ) {
    await this.validateAgainstCap(input.type, Number(input.value));
    
    const discount = await discountRepo.create({
      name: input.name,
      type: input.type,
      value: new Prisma.Decimal(input.value),
      createdById: actorUserId,
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
      type?: DiscountType;
      value?: number | string;
      isActive?: boolean;
    },
    actorUserId: string,
  ) {
    const existing = await discountRepo.findById(id);
    if (!existing) throw Errors.NotFound('Discount');

    if (input.type || input.value !== undefined) {
      await this.validateAgainstCap(
        input.type || existing.type,
        input.value !== undefined ? Number(input.value) : existing.value
      );
    }

    const updated = await discountRepo.update(id, {
      name: input.name,
      type: input.type,
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
