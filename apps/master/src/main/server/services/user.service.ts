import { Prisma, UserRole } from '@prisma/client';
import { Errors, AppError } from '../lib/errors';
import { sessionRepo } from '../repositories/session.repo';
import { userRepo } from '../repositories/user.repo';
import { auditService } from './audit.service';
import { authService } from './auth.service';
import { kickUser } from '../socket';

export const userService = {
  async list(includeInactive = false) {
    return userRepo.findAll(includeInactive);
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
    actor: { id: string; role: UserRole },
  ) {
    const existing = await userRepo.findById(id);
    if (!existing) {
      throw Errors.NotFound('User');
    }

    // Role-based reactivation/role update security
    if (existing.role === UserRole.OWNER && actor.role !== UserRole.OWNER) {
      throw Errors.Forbidden('Ega (Owner) ma\'lumotlarini faqat boshqa Ega o\'zgartira oladi');
    }

    const isReactivating = !existing.isActive && input.isActive === true;

    const passwordHash = input.password ? await authService.hashPassword(input.password) : undefined;
    const pinHash = input.pin ? await authService.hashPin(input.pin) : undefined;

    const updated = await userRepo.update(id, {
      fullName: input.fullName,
      username: input.username,
      passwordHash,
      pinHash,
      isActive: input.isActive,
      role: input.role,
    });

    if (isReactivating) {
      await auditService.log({
        userId: actor.id,
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: id,
        metadata: {
          reactivation: true,
          fullName: updated.fullName,
          role: updated.role,
        },
      });
    }

    return updated;
  },

  async deactivate(id: string, actorUserId: string) {
    const user = await userRepo.findById(id);
    if (!user) {
      throw Errors.NotFound('User');
    }

    if (user.role === UserRole.OWNER) {
      const activeOwners = await userRepo.countActiveOwners();
      if (activeOwners <= 1 && user.isActive) {
        await auditService.log({
          userId: actorUserId,
          action: 'USER_DEACTIVATED',
          entityType: 'User',
          entityId: id,
          metadata: { LAST_OWNER_PROTECTION: true },
        });
        throw new AppError('CONFLICT', 409, 'Oxirgi faol egasini o\'chirib bo\'lmaydi');
      }
    }

    const updated = await userRepo.deactivate(id);
    await sessionRepo.deleteByUserId(id);
    kickUser(id, { code: 'USER_DEACTIVATED', message: 'Sessiya tugadi. Iltimos qaytadan kiring.' });
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
