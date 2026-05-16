import { DiscountType, MenuItemKind, Prisma } from '@prisma/client';
import { Errors } from '../lib/errors';
import { discountRepo } from '../repositories/discount.repo';
import { settingsService } from './settings.service';

/**
 * Billing math (UI_UX_RULES + locked decisions):
 *
 *   Subtotal      = sum(line.qty × line.price)  WHERE menuItem.kind = FOOD
 *   Discount      = applied to Subtotal only (services are waiter income, not discountable)
 *   Net food      = Subtotal − Discount
 *   Service charge= sum(line.qty × line.price)  WHERE menuItem.kind = SERVICE
 *   Total         = Net food + Service charge
 *
 * Service charge is NOT a system-wide setting any more — it comes from
 * MenuItem rows with kind = SERVICE. The waiter adds them like any other
 * menu item; quantity typically = number of customers. They do not go to
 * the kitchen (filtered out of kitchen tickets).
 *
 * `serviceChargeWaived` parameter is accepted for backward compat with the
 * existing approve flow but is now effectively ignored — if the order has no
 * SERVICE lines, the service charge is naturally zero.
 */

type OrderForBilling = {
  lines: Array<{
    quantity: number;
    isCanceled: boolean;
    unitPriceSnapshot: Prisma.Decimal;
    menuItem: { kind: MenuItemKind };
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
    const activeLines = order.lines.filter((line) => !line.isCanceled);

    const subtotal = activeLines
      .filter((line) => line.menuItem.kind === MenuItemKind.FOOD)
      .reduce((sum, line) => sum + decimalToInt(line.unitPriceSnapshot) * line.quantity, 0);

    const serviceChargeFromLines = activeLines
      .filter((line) => line.menuItem.kind === MenuItemKind.SERVICE)
      .reduce((sum, line) => sum + decimalToInt(line.unitPriceSnapshot) * line.quantity, 0);

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

    const netFood = subtotal - discountAmount;
    // serviceChargeWaived is accepted for backward compat. In the new model,
    // the absence of SERVICE lines == zero service charge naturally.
    const serviceCharge = opts.serviceChargeWaived ? 0 : serviceChargeFromLines;
    const total = netFood + serviceCharge;

    return {
      subtotal: toDecimal(subtotal),
      discountAmount: toDecimal(discountAmount),
      serviceCharge: toDecimal(serviceCharge),
      total: toDecimal(total),
    };
  },
};
