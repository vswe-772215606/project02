import { Prisma, UserRole } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export const userRepo = {
  async create(data: Prisma.UserCreateInput, tx?: Tx) {
    return (tx ?? getPrisma()).user.create({ data });
  },

  async findById(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).user.findUnique({ where: { id } });
  },

  async findByUsername(username: string, tx?: Tx) {
    return (tx ?? getPrisma()).user.findUnique({ where: { username } });
  },

  async findActiveByPin(_pinHash: string, tx?: Tx) {
    return (tx ?? getPrisma()).user.findMany({
      where: {
        role: UserRole.WAITER,
        isActive: true,
        pinHash: {
          not: null,
        },
      },
    });
  },

  async findByRole(role: UserRole, tx?: Tx) {
    return (tx ?? getPrisma()).user.findMany({
      where: { role },
      orderBy: { createdAt: 'asc' },
    });
  },

  async findAll(tx?: Tx) {
    return (tx ?? getPrisma()).user.findMany({
      orderBy: { createdAt: 'asc' },
    });
  },

  async update(id: string, data: Prisma.UserUpdateInput, tx?: Tx) {
    return (tx ?? getPrisma()).user.update({
      where: { id },
      data,
    });
  },

  async setLockedUntil(id: string, until: Date | null, tx?: Tx) {
    return (tx ?? getPrisma()).user.update({
      where: { id },
      data: { lockedUntil: until },
    });
  },

  async incrementFailedLogins(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).user.update({
      where: { id },
      data: {
        failedLogins: { increment: 1 },
      },
    });
  },

  async resetFailedLogins(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).user.update({
      where: { id },
      data: {
        failedLogins: 0,
        lockedUntil: null,
      },
    });
  },

  async deactivate(id: string, tx?: Tx) {
    return (tx ?? getPrisma()).user.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  },
};
