import { Prisma, TableType } from '@prisma/client';
import { Errors } from '../lib/errors';
import { tableRepo } from '../repositories/table.repo';

export const tableService = {
  async list(includeInactive = false) {
    const tables = await tableRepo.listAll(includeInactive);
    const withActiveOrders = await Promise.all(
      tables.map(async (table) => ({
        ...table,
        activeOrderId: await tableRepo.findActiveOrderId(table.id),
      })),
    );

    return withActiveOrders;
  },

  async create(input: { name: string; type: TableType; displayOrder?: number }) {
    return tableRepo.create({
      name: input.name,
      type: input.type,
      displayOrder: input.displayOrder ?? 0,
    });
  },

  async update(id: string, data: Prisma.TableUpdateInput) {
    const existing = await tableRepo.findById(id);
    if (!existing) {
      throw Errors.NotFound('Table');
    }
    return tableRepo.update(id, data);
  },
};
