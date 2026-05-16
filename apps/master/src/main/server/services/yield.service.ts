import { MenuItemKind, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

export type YieldRow = {
  menuItemId: string;
  menuItemName: string;
  kind: 'RECIPE' | 'DIRECT' | 'UNTRACKED';
  possiblePortions: number | null;
  bottleneckIngredientId: string | null;
  bottleneckIngredientName: string | null;
  bottleneckCurrentStock: string | null;
  bottleneckUnit: string | null;
};

function safeFloor(n: Prisma.Decimal): number {
  if (n.isZero() || n.isNegative()) return 0;
  return Math.floor(n.toNumber());
}

export const yieldService = {
  async computeAll(): Promise<YieldRow[]> {
    const items = await getPrisma().menuItem.findMany({
      where: { isActive: true, kind: MenuItemKind.FOOD },
      include: {
        recipe: {
          include: {
            ingredients: {
              include: { ingredient: true },
            },
          },
        },
        selfIngredient: true,
      },
      orderBy: [{ category: { displayOrder: 'asc' } }, { displayOrder: 'asc' }],
    });

    return items.map((item): YieldRow => {
      if (item.recipe && item.recipe.ingredients.length > 0) {
        let bestPortions = Number.POSITIVE_INFINITY;
        let bottleneck = item.recipe.ingredients[0]!;
        for (const ri of item.recipe.ingredients) {
          const qty = new Prisma.Decimal(ri.quantity);
          if (qty.isZero() || qty.isNegative()) continue;
          const portions = safeFloor(new Prisma.Decimal(ri.ingredient.currentStock).div(qty));
          if (portions < bestPortions) {
            bestPortions = portions;
            bottleneck = ri;
          }
        }
        const possible = bestPortions === Number.POSITIVE_INFINITY ? 0 : bestPortions;
        return {
          menuItemId: item.id,
          menuItemName: item.name,
          kind: 'RECIPE',
          possiblePortions: possible,
          bottleneckIngredientId: bottleneck.ingredientId,
          bottleneckIngredientName: bottleneck.ingredient.name,
          bottleneckCurrentStock: new Prisma.Decimal(bottleneck.ingredient.currentStock).toFixed(3),
          bottleneckUnit: bottleneck.ingredient.recipeUnit,
        };
      }

      if (item.selfIngredient) {
        const stock = new Prisma.Decimal(item.selfIngredient.currentStock);
        return {
          menuItemId: item.id,
          menuItemName: item.name,
          kind: 'DIRECT',
          possiblePortions: safeFloor(stock),
          bottleneckIngredientId: item.selfIngredient.id,
          bottleneckIngredientName: item.selfIngredient.name,
          bottleneckCurrentStock: stock.toFixed(3),
          bottleneckUnit: item.selfIngredient.recipeUnit,
        };
      }

      return {
        menuItemId: item.id,
        menuItemName: item.name,
        kind: 'UNTRACKED',
        possiblePortions: null,
        bottleneckIngredientId: null,
        bottleneckIngredientName: null,
        bottleneckCurrentStock: null,
        bottleneckUnit: null,
      };
    });
  },

  /** Helper for menu availability: true when item can be ordered right now. */
  async effectivelyAvailable(menuItemId: string): Promise<boolean> {
    const item = await getPrisma().menuItem.findUnique({
      where: { id: menuItemId },
      include: {
        recipe: { include: { ingredients: { include: { ingredient: true } } } },
        selfIngredient: true,
      },
    });
    if (!item || !item.isAvailable || !item.isActive) return false;
    if (item.recipe && item.recipe.ingredients.length > 0) {
      return item.recipe.ingredients.every((ri) => {
        const qty = new Prisma.Decimal(ri.quantity);
        if (qty.isZero() || qty.isNegative()) return true;
        return new Prisma.Decimal(ri.ingredient.currentStock).gte(qty);
      });
    }
    if (item.selfIngredient) {
      return new Prisma.Decimal(item.selfIngredient.currentStock).gte(1);
    }
    return true;
  },
};
