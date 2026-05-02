import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const auditRepo = {
  async create(
    data: Prisma.AuditLogCreateInput | Prisma.AuditLogUncheckedCreateInput,
    tx?: Tx,
  ) {
    return (tx ?? getPrisma()).auditLog.create({ data });
  },

  async list(
    params: {
      action?: Prisma.EnumAuditActionFilter<'AuditLog'>['equals'];
      userId?: string;
      from?: Date;
      to?: Date;
      page: number;
      pageSize: number;
    },
    tx?: Tx,
  ) {
    const where: Prisma.AuditLogWhereInput = {
      action: params.action,
      userId: params.userId,
      createdAt:
        params.from || params.to
          ? {
              gte: params.from,
              lte: params.to,
            }
          : undefined,
    };

    const client = tx ?? getPrisma();
    const skip = (params.page - 1) * params.pageSize;
    const [items, total] = await Promise.all([
      client.auditLog.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.pageSize,
      }),
      client.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  },
};
