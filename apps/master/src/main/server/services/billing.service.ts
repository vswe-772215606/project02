import { DiscountType, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { discountRepo } from '../repositories/discount.repo';
import { settingsService } from './settings.service';

type OrderForBilling = {
  lines: Array<{
    quantity: number;
    isCanceled: boolean;
    unitPriceSnapshot: Prisma.Decimal;
  }>;
};

function decimalToInt(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  if (typeof value === 'number') {
    return value;
  }

  return new Prisma.Decimal(value).toNumber();
}

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export const billingService = {
  async computeTotals(
    order: OrderForBilling,
    opts: { discountId?: string | null; serviceChargeWaived: boolean },
  ) {
    const subtotal = order.lines
      .filter((line) => !line.isCanceled)
      .reduce((sum, line) => {
        return sum + decimalToInt(line.unitPriceSnapshot) * line.quantity;
      }, 0);

    let discountAmount = 0;

    if (opts.discountId) {
      const discount = await discountRepo.findById(opts.discountId);
      if (!discount || !discount.isActive) {
        throw Errors.Validation('Discount is not active');
      }

      const discountValue = decimalToInt(discount.value);
      if (discount.type === DiscountType.PERCENT) {
        discountAmount = Math.round((subtotal * discountValue) / 100);
      } else {
        discountAmount = Math.min(discountValue, subtotal);
      }

      const maxPercent = settingsService.getInt('max_discount_percent');
      const maxAmount = settingsService.getInt('max_discount_amount');
      const percentCapAmount = Math.round((subtotal * maxPercent) / 100);

      if (discountAmount > percentCapAmount) {
        throw Errors.DiscountCapExceeded('Discount exceeds percent cap');
      }

      if (discountAmount > maxAmount) {
        throw Errors.DiscountCapExceeded('Discount exceeds fixed amount cap');
      }
    }

    const netFood = subtotal - discountAmount;
    const serviceCharge = opts.serviceChargeWaived
      ? 0
      : settingsService.getInt('service_charge_amount');
    const total = netFood + serviceCharge;

    return {
      subtotal: toDecimal(subtotal),
      discountAmount: toDecimal(discountAmount),
      serviceCharge: toDecimal(serviceCharge),
      total: toDecimal(total),
    };
  },
};
