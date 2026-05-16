import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

async function replaceComboComponents(
  comboId: string,
  components: Array<{ menuItemId: string; quantity: number }>,
  tx: Tx,
) {
  await tx.comboComponent.deleteMany({
    where: { comboId },
  });

  if (components.length > 0) {
    await tx.comboComponent.createMany({
      data: components.map((component) => ({
        comboId,
        menuItemId: component.menuItemId,
        quantity: component.quantity,
      })),
    });
  }

  return tx.combo.findUnique({
    where: { id: comboId },
    include: {
      components: {
        include: {
          menuItem: true,
        },
      },
    },
  });
}

export const menuRepo = {
  async createCategory(data: Prisma.CategoryCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).category.create({ data });
  },

  async findCategoryById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).category.findUnique({ where: { id } });
  },

  async listCategories(includeInactive = false, tx?: Tx) {
    return (tx ?? getPrisma()).category.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async updateCategory(id: string, data: Prisma.CategoryUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).category.update({
      where: { id },
      data,
    });
  },

  async createItem(data: Prisma.MenuItemCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.create({ data });
  },

  async findItemById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.findUnique({ where: { id } });
  },

  async listItems(includeInactive = false, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        category: true,
      },
      orderBy: [
        { category: { displayOrder: 'asc' } },
        { displayOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  },

  async listItemsByCategory(categoryId: string, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.findMany({
      where: { categoryId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async updateItem(id: string, data: Prisma.MenuItemUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.update({
      where: { id },
      data,
    });
  },

  async setAvailability(id: string, isAvailable: boolean, tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.update({
      where: { id },
      data: { isAvailable },
    });
  },

  async createCombo(data: Prisma.ComboCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).combo.create({
      data,
      include: {
        components: {
          include: {
            menuItem: true,
          },
        },
      },
    });
  },

  async findComboById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).combo.findUnique({
      where: { id },
      include: {
        components: {
          include: {
            menuItem: true,
          },
        },
      },
    });
  },

  async listCombos(includeInactive = false, tx?: Tx) {
    return (tx ?? getPrisma()).combo.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        components: {
          include: {
            menuItem: true,
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async updateCombo(id: string, data: Prisma.ComboUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).combo.update({
      where: { id },
      data,
      include: {
        components: {
          include: {
            menuItem: true,
          },
        },
      },
    });
  },

  async replaceComponents(
    comboId: string,
    components: Array<{ menuItemId: string; quantity: number }>,
    tx?: Tx,
  ) {
    if (tx) {
      return replaceComboComponents(comboId, components, tx);
    }

    return getPrisma().$transaction(async (transaction) => {
      return replaceComboComponents(comboId, components, transaction);
    });
  },
};
