import { DiscountType, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { discountRepo } from '../repositories/discount.repo';
import { auditService } from './audit.service';
import { settingsService } from './settings.service';

function decimalToInt(value: Prisma.Decimal | number | string): number {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }
  if (typeof value === 'number') {
    return value;
  }
  return new Prisma.Decimal(value).toNumber();
}

export const discountService = {
  validateAgainstCap(type: DiscountType, value: Prisma.Decimal | string | number): true {
    const intValue = decimalToInt(value);

    if (type === DiscountType.PERCENT) {
      const maxPercent = settingsService.getInt('max_discount_percent');
      if (intValue > maxPercent) {
        throw Errors.DiscountCapExceeded('Discount percent exceeds cap');
      }
      return true;
    }

    const maxAmount = settingsService.getInt('max_discount_amount');
    if (intValue > maxAmount) {
      throw Errors.DiscountCapExceeded('Discount amount exceeds cap');
    }

    return true;
  },

  async create(
    input: { name: string; type: DiscountType; value: Prisma.Decimal | string | number },
    actorUserId: string,
  ) {
    this.validateAgainstCap(input.type, input.value);
    const discount = await discountRepo.create({
      name: input.name,
      type: input.type,
      value: new Prisma.Decimal(input.value),
      createdBy: {
        connect: { id: actorUserId },
      },
    });

    await auditService.log({
      userId: actorUserId,
      action: 'DISCOUNT_CREATED',
      entityType: 'Discount',
      entityId: discount.id,
      metadata: input,
    });

    return discount;
  },

  async update(
    id: string,
    partial: { name?: string; type?: DiscountType; value?: Prisma.Decimal | string | number },
    actorUserId: string,
  ) {
    const existing = await discountRepo.findById(id);
    if (!existing) {
      throw Errors.NotFound('Discount');
    }

    const nextType = partial.type ?? existing.type;
    const nextValue = partial.value ?? existing.value;
    this.validateAgainstCap(nextType, nextValue);

    const updated = await discountRepo.update(id, {
      name: partial.name,
      type: partial.type,
      value: partial.value === undefined ? undefined : new Prisma.Decimal(partial.value),
    });

    await auditService.log({
      userId: actorUserId,
      action: 'DISCOUNT_EDITED',
      entityType: 'Discount',
      entityId: id,
      metadata: partial,
    });

    return updated;
  },

  async softDelete(id: string, actorUserId: string) {
    const discount = await discountRepo.softDelete(id);
    await auditService.log({
      userId: actorUserId,
      action: 'DISCOUNT_DELETED',
      entityType: 'Discount',
      entityId: id,
      metadata: {},
    });
    return discount;
  },

  async list() {
    return discountRepo.listActive();
  },

  async listAll() {
    return discountRepo.listAll();
  },
};
