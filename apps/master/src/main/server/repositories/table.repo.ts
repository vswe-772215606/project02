import { OrderStatus, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const tableRepo = {
  async create(data: Prisma.TableCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).table.create({ data });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).table.findUnique({ where: { id } });
  },

  async findByName(name: string, tx?: Tx) {
    return (tx ?? getPrisma()).table.findUnique({ where: { name } });
  },

  async listAll(includeInactive = false, tx?: Tx) {
    return (tx ?? getPrisma()).table.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async update(id: string, data: Prisma.TableUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).table.update({
      where: { id },
      data,
    });
  },

  /**
   * Returns the id of the SENT order occupying this table, or null.
   * Domain rule: only a SENT order occupies a table. Unsent DRAFT orders
   * (and terminal CLOSED/WALKOUT/CANCELED orders) do not — a DRAFT-only
   * table is considered free.
   */
  async findActiveOrderId(tableId: string, tx?: Tx) {
    const order = await (tx ?? getPrisma()).order.findFirst({
      where: {
        tableId,
        status: OrderStatus.SENT,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    return order?.id ?? null;
  },
};
