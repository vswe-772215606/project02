import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Session, User, UserRole } from '@prisma/client';
import { Errors } from '../lib/errors';
import { sessionRepo } from '../repositories/session.repo';
import { userRepo } from '../repositories/user.repo';

const BCRYPT_ROUNDS = 10;
const PIN_BLACKLIST = new Set([
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '1234',
  '4321',
]);

type AuthResult = {
  token: string;
  user: User;
};

function ensureNotLocked(user: User): void {
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw Errors.Locked(user.lockedUntil);
  }
}

async function recordFailedLogin(user: User): Promise<never> {
  const updated = await userRepo.incrementFailedLogins(user.id);

  if (updated.failedLogins >= 5) {
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
    await userRepo.setLockedUntil(user.id, lockedUntil);
    throw Errors.Locked(lockedUntil);
  }

  throw Errors.Unauthorized();
}

async function createSession(user: User, deviceLabel: string | undefined, expiresAt: Date): Promise<AuthResult> {
  await userRepo.resetFailedLogins(user.id);
  await sessionRepo.deleteByUserId(user.id);

  const token = crypto.randomBytes(32).toString('base64url');
  await sessionRepo.create({
    token,
    deviceLabel: deviceLabel ?? null,
    expiresAt,
    user: {
      connect: {
        id: user.id,
      },
    },
  });

  return { token, user };
}

export const authService = {
  async hashPassword(plain: string): Promise<string> {
    if (!plain.trim()) {
      throw Errors.Validation('Password is required');
    }
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  },

  async hashPin(plain: string): Promise<string> {
    if (!/^\d{4}$/.test(plain)) {
      throw Errors.Validation('PIN must be exactly 4 digits');
    }
    if (PIN_BLACKLIST.has(plain)) {
      throw Errors.Validation('PIN is too easy');
    }
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  },

  async login(username: string, password: string, deviceLabel?: string): Promise<AuthResult> {
    const user = await userRepo.findByUsername(username);
    if (!user || !user.isActive || !user.passwordHash) {
      throw Errors.Unauthorized();
    }

    ensureNotLocked(user);
    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      return recordFailedLogin(user);
    }

    return createSession(user, deviceLabel, new Date(Date.now() + 8 * 60 * 60 * 1000));
  },

  async loginPin(pin: string, deviceLabel?: string): Promise<AuthResult> {
    const waiters = await userRepo.findActiveByPin(pin);

    for (const waiter of waiters) {
      ensureNotLocked(waiter);
      if (!waiter.pinHash) {
        continue;
      }

      const ok = await bcrypt.compare(pin, waiter.pinHash);
      if (ok) {
        return createSession(waiter, deviceLabel, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      }
    }

    const usersToLock = waiters.filter((user) => user.role === UserRole.WAITER);
    if (usersToLock.length > 0) {
      await recordFailedLogin(usersToLock[0]);
    }

    throw Errors.Unauthorized();
  },

  async logout(token: string): Promise<void> {
    await sessionRepo.deleteByToken(token);
  },

  async validateSession(token: string): Promise<(Session & { user: User }) | null> {
    const session = await sessionRepo.findActiveByToken(token);
    if (!session) {
      return null;
    }
    return session;
  },
};
