import { KitchenTicketStatus, OrderStatus, Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

function statusFilter(
  expectedFrom: KitchenTicketStatus | KitchenTicketStatus[],
) {
  return Array.isArray(expectedFrom) ? { in: expectedFrom } : expectedFrom;
}

export const kitchenRepo = {
  async create(data: Prisma.KitchenTicketCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).kitchenTicket.create({ data });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).kitchenTicket.findUnique({ where: { id } });
  },

  async findByIdWithLines(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).kitchenTicket.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            menuItem: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        order: {
          include: {
            table: true,
            waiter: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });
  },

  async listActive(tx?: Tx) {
    return (tx ?? getPrisma()).kitchenTicket.findMany({
      where: {
        status: {
          in: [KitchenTicketStatus.PENDING, KitchenTicketStatus.IN_PROGRESS],
        },
        order: {
          status: {
            notIn: [OrderStatus.CANCELED, OrderStatus.CLOSED, OrderStatus.WALKOUT],
          },
        },
      },
      include: {
        lines: {
          include: {
            menuItem: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        order: {
          include: {
            table: true,
            waiter: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async setStatus(
    id: string,
    status: KitchenTicketStatus,
    expectedFrom?: KitchenTicketStatus | KitchenTicketStatus[],
    tx?: Tx,
  ) {
    const client = tx ?? getPrisma();

    if (expectedFrom) {
      const result = await client.kitchenTicket.updateMany({
        where: {
          id,
          status: statusFilter(expectedFrom),
        },
        data: { status },
      });

      if (result.count === 0) {
        return null;
      }
    } else {
      await client.kitchenTicket.update({
        where: { id },
        data: { status },
      });
    }

    return client.kitchenTicket.findUnique({ where: { id } });
  },

  async setStarted(id: string, tx?: Tx) {
    const client = tx ?? getPrisma();
    const result = await client.kitchenTicket.updateMany({
      where: {
        id,
        status: KitchenTicketStatus.PENDING,
      },
      data: {
        status: KitchenTicketStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    return client.kitchenTicket.findUnique({ where: { id } });
  },

  async setReady(id: string, tx?: Tx) {
    const client = tx ?? getPrisma();
    const result = await client.kitchenTicket.updateMany({
      where: {
        id,
        status: KitchenTicketStatus.IN_PROGRESS,
      },
      data: {
        status: KitchenTicketStatus.READY,
        readyAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    return client.kitchenTicket.findUnique({ where: { id } });
  },

  async setCanceled(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).kitchenTicket.update({
      where: { id },
      data: {
        status: KitchenTicketStatus.CANCELED,
        canceledAt: new Date(),
      },
    });
  },
};
