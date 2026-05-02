import { Prisma, UserRole } from '@prisma/client';
import { Errors } from '../lib/errors';
import { sessionRepo } from '../repositories/session.repo';
import { userRepo } from '../repositories/user.repo';
import { auditService } from './audit.service';
import { authService } from './auth.service';

export const userService = {
  async list() {
    return userRepo.findAll();
  },

  async create(
    input: {
      role: UserRole;
      fullName: string;
      username?: string;
      password?: string;
      pin?: string;
    },
    actor: { id: string; role: UserRole },
  ) {
    if (input.role === UserRole.OWNER && actor.role !== UserRole.OWNER) {
      throw Errors.Forbidden('Only owner can create owner users');
    }

    if (input.role === UserRole.WAITER) {
      if (!input.pin) {
        throw Errors.Validation('PIN is required for waiter');
      }
    } else if (!input.username || !input.password) {
      throw Errors.Validation('Username and password are required');
    }

    const passwordHash = input.password ? await authService.hashPassword(input.password) : null;
    const pinHash = input.pin ? await authService.hashPin(input.pin) : null;

    const user = await userRepo.create({
      username: input.username ?? null,
      passwordHash,
      pinHash,
      fullName: input.fullName,
      role: input.role,
    });

    await auditService.log({
      userId: actor.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        role: user.role,
        fullName: user.fullName,
      },
    });

    return user;
  },

  async update(
    id: string,
    input: {
      fullName?: string;
      username?: string | null;
      password?: string;
      pin?: string;
      isActive?: boolean;
      role?: UserRole;
    },
  ) {
    const existing = await userRepo.findById(id);
    if (!existing) {
      throw Errors.NotFound('User');
    }

    const passwordHash = input.password ? await authService.hashPassword(input.password) : undefined;
    const pinHash = input.pin ? await authService.hashPin(input.pin) : undefined;

    return userRepo.update(id, {
      fullName: input.fullName,
      username: input.username,
      passwordHash,
      pinHash,
      isActive: input.isActive,
      role: input.role,
    });
  },

  async deactivate(id: string, actorUserId: string) {
    const user = await userRepo.findById(id);
    if (!user) {
      throw Errors.NotFound('User');
    }

    const updated = await userRepo.deactivate(id);
    await sessionRepo.deleteByUserId(id);
    await auditService.log({
      userId: actorUserId,
      action: 'USER_DEACTIVATED',
      entityType: 'User',
      entityId: id,
      metadata: {},
    });
    return updated;
  },
};
