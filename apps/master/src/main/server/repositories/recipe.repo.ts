import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const recipeInclude = {
  ingredients: {
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          recipeUnit: true,
          buyUnit: true,
          weightedAvgCost: true,
          isActive: true,
        },
      },
    },
  },
  menuItem: {
    select: { id: true, name: true },
  },
} satisfies Prisma.RecipeInclude;

export const recipeRepo = {
  async findByMenuItemId(menuItemId: string, tx?: Tx) {
    return (tx ?? getPrisma()).recipe.findUnique({
      where: { menuItemId },
      include: recipeInclude,
    });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).recipe.findUnique({
      where: { id },
      include: recipeInclude,
    });
  },

  async createForMenuItem(
    menuItemId: string,
    ingredients: Array<{ ingredientId: string; quantity: Prisma.Decimal | string | number }>,
    notes: string | null,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).recipe.create({
      data: {
        menuItem: { connect: { id: menuItemId } },
        notes,
        ingredients: {
          create: ingredients.map((row) => ({
            ingredient: { connect: { id: row.ingredientId } },
            quantity: new Prisma.Decimal(row.quantity),
          })),
        },
      },
      include: recipeInclude,
    });
  },

  async replaceIngredients(
    recipeId: string,
    ingredients: Array<{ ingredientId: string; quantity: Prisma.Decimal | string | number }>,
    tx?: Tx,
  ) {
    const client = tx ?? getPrisma();
    await client.recipeIngredient.deleteMany({ where: { recipeId } });
    if (ingredients.length > 0) {
      await client.recipeIngredient.createMany({
        data: ingredients.map((row) => ({
          recipeId,
          ingredientId: row.ingredientId,
          quantity: new Prisma.Decimal(row.quantity),
        })),
      });
    }
    return client.recipe.findUnique({
      where: { id: recipeId },
      include: recipeInclude,
    });
  },

  async update(
    id: string,
    data: Pick<Prisma.RecipeUpdateInput, 'notes' | 'isComplete'>,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).recipe.update({
      where: { id },
      data,
      include: recipeInclude,
    });
  },

  async setComplete(id: string, isComplete: boolean, tx?: Tx) {
    return (tx ?? getPrisma()).recipe.update({
      where: { id },
      data: { isComplete },
    });
  },

  async logEdit(
    data: {
      recipeId: string;
      editedById: string;
      beforeJson: Prisma.InputJsonValue;
      afterJson: Prisma.InputJsonValue;
    },
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).recipeEdit.create({
      data: {
        recipe: { connect: { id: data.recipeId } },
        editor: { connect: { id: data.editedById } },
        beforeJson: data.beforeJson,
        afterJson: data.afterJson,
      },
    });
  },

  async listEdits(recipeId: string, tx?: Tx) {
    return (tx ?? getPrisma()).recipeEdit.findMany({
      where: { recipeId },
      include: {
        editor: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
  },

  async deleteById(id: string, tx?: Tx) {
    const client = tx ?? getPrisma();
    await client.recipeIngredient.deleteMany({ where: { recipeId: id } });
    await client.recipeEdit.deleteMany({ where: { recipeId: id } });
    return client.recipe.delete({ where: { id } });
  },
};
