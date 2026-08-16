import { MenuItemKind, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { billingService } from './billing.service';

type Line = {
  quantity: number;
  isCanceled: boolean;
  unitPriceSnapshot: Prisma.Decimal;
  menuItem: { kind: MenuItemKind };
};

function food(price: number, quantity = 1, isCanceled = false): Line {
  return {
    quantity,
    isCanceled,
    unitPriceSnapshot: new Prisma.Decimal(price),
    menuItem: { kind: MenuItemKind.FOOD },
  };
}

function service(price: number, quantity = 1): Line {
  return {
    quantity,
    isCanceled: false,
    unitPriceSnapshot: new Prisma.Decimal(price),
    menuItem: { kind: MenuItemKind.SERVICE },
  };
}

const noDiscount = { serviceChargeWaived: false };

describe('billingService.computeTotals', () => {
  it('sums food lines into the subtotal and excludes service lines', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(20_000, 2), food(15_000), service(10_000, 3)] },
      noDiscount,
    );

    expect(totals.subtotal.toFixed(0)).toBe('55000');
    expect(totals.serviceCharge.toFixed(0)).toBe('30000');
    expect(totals.total.toFixed(0)).toBe('85000');
  });

  it('ignores canceled lines on both sides', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(20_000), food(50_000, 1, true)] },
      noDiscount,
    );

    expect(totals.subtotal.toFixed(0)).toBe('20000');
    expect(totals.total.toFixed(0)).toBe('20000');
  });

  it('applies an ad-hoc discount to food only, leaving the service charge owed', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(100_000), service(14_000)] },
      { discountAmount: 100_000, serviceChargeWaived: false },
    );

    expect(totals.discountAmount.toFixed(0)).toBe('100000');
    expect(totals.total.toFixed(0)).toBe('14000');
  });

  it('clamps a discount larger than the food subtotal instead of going negative', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(30_000)] },
      { discountAmount: 500_000, serviceChargeWaived: false },
    );

    expect(totals.discountAmount.toFixed(0)).toBe('30000');
    expect(totals.total.toFixed(0)).toBe('0');
  });

  it('rejects a negative discount', async () => {
    await expect(
      billingService.computeTotals(
        { lines: [food(30_000)] },
        { discountAmount: -1, serviceChargeWaived: false },
      ),
    ).rejects.toThrow();
  });

  it('waives the service charge when asked, without touching food', async () => {
    const totals = await billingService.computeTotals(
      { lines: [food(40_000), service(12_000)] },
      { serviceChargeWaived: true },
    );

    expect(totals.subtotal.toFixed(0)).toBe('40000');
    expect(totals.serviceCharge.toFixed(0)).toBe('0');
    expect(totals.total.toFixed(0)).toBe('40000');
  });
});
