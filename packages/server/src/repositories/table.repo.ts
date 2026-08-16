import { OrderStatus, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CLOSED,
  OrderStatus.CANCELED,
];

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

  async findActiveOrderId(tableId: string, tx?: Tx) {
    const order = await (tx ?? getPrisma()).order.findFirst({
      where: {
        tableId,
        status: {
          notIn: TERMINAL_ORDER_STATUSES,
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    return order?.id ?? null;
  },
};
