import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const SESSION_TOUCH_INTERVAL_MS = 60_000;

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

  /**
   * Marks the session used, at most once a minute. Every authenticated request
   * calls this, and on SQLite's one connection each write's disk sync holds up
   * the reads queued behind it (PRD 14 G7); nothing reads `lastUsedAt` finer
   * than that. A session deleted meanwhile matches nothing and is not an error.
   */
  async touchLastUsed(id: string, tx?: Tx) {
    const now = new Date();
    return (tx ?? getPrisma()).session.updateMany({
      where: {
        id,
        lastUsedAt: { lt: new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS) },
      },
      data: {
        lastUsedAt: now,
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
