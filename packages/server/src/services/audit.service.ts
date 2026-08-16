import { AuditAction, Prisma } from '@prisma/client';
import { auditRepo } from '../repositories/audit.repo';

type AuditInput = {
  userId: string;
  action: Prisma.AuditLogCreateInput['action'];
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
};

export const auditService = {
  async log(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    await auditRepo.create(
      {
        user: { connect: { id: input.userId } },
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
      tx,
    );
  },

  async list(filters: {
    action?: string;
    userId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    return auditRepo.list({
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 50,
      action: filters.action as AuditAction | undefined,
      userId: filters.userId,
      from: filters.from,
      to: filters.to,
    });
  },
};
