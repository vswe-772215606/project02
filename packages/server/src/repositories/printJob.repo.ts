import { Prisma, PrintJobStatus } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const printJobRepo = {
  async create(data: Prisma.PrintJobCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).printJob.create({ data });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).printJob.findUnique({ where: { id } });
  },

  async markSuccess(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).printJob.update({
      where: { id },
      data: {
        status: PrintJobStatus.SUCCESS,
        completedAt: new Date(),
        errorMessage: null,
      },
    });
  },

  async markFailed(id: string, errorMessage: string, tx?: Tx) {
    return (tx ?? getPrisma()).printJob.update({
      where: { id },
      data: {
        status: PrintJobStatus.FAILED,
        errorMessage,
        completedAt: new Date(),
      },
    });
  },

  async incrementAttempts(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).printJob.update({
      where: { id },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });
  },

  async listFailedSinceDate(date: Date, tx?: Tx) {
    return (tx ?? getPrisma()).printJob.findMany({
      where: {
        status: PrintJobStatus.FAILED,
        createdAt: {
          gte: date,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
