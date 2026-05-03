import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const sessionRepo = {
  async create(data: Prisma.SessionCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).session.create({ data });
  },

  async findActiveByToken(token: string, tx?: Tx) {
    const session = await (tx ?? getPrisma()).session.findFirst({
      where: {
        token,
        user: {
          isActive: true,
        },
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      return null;
    }

    if (session.expiresAt <= new Date()) {
      return null;
    }

    return session;
  },

  async findByToken(token: string, tx?: Tx) {
    return (tx ?? getPrisma()).session.findUnique({
      where: { token },
      include: {
        user: true,
      },
    });
  },

  async deleteByUserId(userId: string, tx?: Tx) {
    return (tx ?? getPrisma()).session.deleteMany({
      where: { userId },
    });
  },

  async deleteByToken(token: string, tx?: Tx) {
    return (tx ?? getPrisma()).session.deleteMany({
      where: { token },
    });
  },

  async touchLastUsed(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).session.update({
      where: { id },
      data: {
        lastUsedAt: new Date(),
      },
    });
  },

  async deleteExpired(tx?: Tx) {
    return (tx ?? getPrisma()).session.deleteMany({
      where: {
        expiresAt: {
          lte: new Date(),
        },
      },
    });
  },
};
