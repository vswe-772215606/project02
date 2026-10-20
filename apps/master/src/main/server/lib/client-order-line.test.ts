import { describe, expect, it } from 'vitest';
import { toClientLine } from './client-order-line';

// An OrderLine row as orderRepo.findByIdWithDetails returns it: the full dish row attached.
const row = {
  id: 'l1',
  orderId: 'o1',
  menuItemId: 'm1',
  nameSnapshot: 'Osh',
  unitPriceSnapshot: '45000',
  quantity: 2,
  notes: null,
  comboGroupId: null,
  comboNameSnapshot: null,
  isCanceled: false,
  canceledAt: null,
  canceledReason: null,
  cogsSnapshot: '50000',
  consumptionSnapshot: null,
  menuItem: {
    id: 'm1',
    name: 'Osh',
    kind: 'FOOD',
    price: '45000',
    costPrice: '25000',
    unitCostSnapshot: '25000',
    counted: true,
    stockCount: 48,
  },
};

describe('toClientLine (money rules D18; Money Map issue 32; P3 Task 7)', () => {
  it('drops the food cost, the consumption snapshot and the whole dish row; keeps what a waiter needs', () => {
    const out = toClientLine(row, 45_000);
    expect(out).toEqual({
      id: 'l1',
      orderId: 'o1',
      menuItemId: 'm1',
      nameSnapshot: 'Osh',
      unitPriceSnapshot: '45000',
      quantity: 2,
      notes: null,
      comboGroupId: null,
      comboNameSnapshot: null,
      isCanceled: false,
      canceledAt: null,
      canceledReason: null,
      price: 45_000,
      menuItemKind: 'FOOD',
    });
    const keys = Object.keys(out);
    expect(keys).not.toContain('cogsSnapshot');
    expect(keys).not.toContain('consumptionSnapshot');
    expect(keys).not.toContain('menuItem');
  });

  it('a SERVICE dish keeps its kind, so the ticket can keep xizmat haqi out of the discount', () => {
    expect(toClientLine({ ...row, menuItem: { kind: 'SERVICE' } }, 5_000).menuItemKind).toBe('SERVICE');
  });

  it('the list payload, whose dish row is only { kind }, maps the same way', () => {
    const out = toClientLine({ id: 'l2', quantity: 1, unitPriceSnapshot: '5000', cogsSnapshot: '1000', menuItem: { kind: 'FOOD' } }, 5_000);
    expect(out).toEqual({ id: 'l2', quantity: 1, unitPriceSnapshot: '5000', price: 5_000, menuItemKind: 'FOOD' });
  });

  it('defaults a line with no dish row to FOOD', () => {
    expect(toClientLine({ id: 'l3', menuItem: null }, 0).menuItemKind).toBe('FOOD');
    const bare: { id: string; menuItem?: undefined } = { id: 'l4' };
    expect(toClientLine(bare, 0).menuItemKind).toBe('FOOD');
  });

  it('does not mutate the row it is given', () => {
    const copy = structuredClone(row);
    toClientLine(row, 45_000);
    expect(row).toEqual(copy);
  });
});
