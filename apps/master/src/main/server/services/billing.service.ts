import { DiscountType, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { discountRepo } from '../repositories/discount.repo';
import { settingsService } from './settings.service';

type OrderForBilling = {
  lines: Array<{
    quantity: number;
    isCanceled: boolean;
    unitPriceSnapshot: Prisma.Decimal;
    menuItem: {
      isServiceItem: boolean;
    };
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
    opts: { discountId?: string | null },
  ) {
    const activeLines = order.lines.filter((line) => !line.isCanceled);
    const foodLines = activeLines.filter((line) => !line.menuItem.isServiceItem);
    const serviceLines = activeLines.filter((line) => line.menuItem.isServiceItem);

    const subtotal = foodLines.reduce(
      (sum, line) => sum + decimalToInt(line.unitPriceSnapshot) * line.quantity,
      0,
    );

    const serviceCharge = serviceLines.reduce(
      (sum, line) => sum + decimalToInt(line.unitPriceSnapshot) * line.quantity,
      0,
    );

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

      if (discount.type === DiscountType.PERCENT) {
        const percentCapAmount = Math.round((subtotal * maxPercent) / 100);
        if (discountAmount > percentCapAmount) {
          throw Errors.DiscountCapExceeded('Discount exceeds percent cap');
        }
      }

      if (discountAmount > maxAmount) {
        throw Errors.DiscountCapExceeded('Discount exceeds fixed amount cap');
      }
    }

    const total = subtotal - discountAmount + serviceCharge;

    return {
      subtotal: toDecimal(subtotal),
      discountAmount: toDecimal(discountAmount),
      serviceCharge: toDecimal(serviceCharge),
      total: toDecimal(total),
    };
  },
};
