import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Session, User } from '@prisma/client';
import { Errors } from '../lib/errors';
import { pinLockout } from '../lib/pin-lockout';
import { sessionRepo } from '../repositories/session.repo';
import { userRepo } from '../repositories/user.repo';
import { kickUser } from '../socket';

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
  kickUser(user.id);
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

  /**
   * PIN login. The PIN is compared first, and only the matched waiter's own lock
   * applies to them. A PIN that matches nobody counts against the device it came
   * from — five lock that device for five minutes, never the floor (PRD 14 G5).
   * `deviceKey` is the client's address. A device runs one attempt at a time:
   * parallel guesses would all pass the lock check before the first miss is
   * counted, and a late correct PIN would erase the lock the misses had set.
   */
  async loginPin(pin: string, deviceLabel: string | undefined, deviceKey: string): Promise<AuthResult> {
    const now = Date.now();
    const deviceLockedUntil = pinLockout.lockedUntil(deviceKey, now);
    if (deviceLockedUntil !== null) {
      throw Errors.Locked(new Date(deviceLockedUntil));
    }
    if (!pinLockout.tryBegin(deviceKey)) {
      throw Errors.Conflict('Oldingi urinish hali tugamadi, biroz kuting');
    }

    try {
      const waiters = await userRepo.findActiveByPin(pin);
      for (const waiter of waiters) {
        if (!waiter.pinHash) {
          continue;
        }
        if (await bcrypt.compare(pin, waiter.pinHash)) {
          ensureNotLocked(waiter);
          pinLockout.recordSuccess(deviceKey);
          // `await` keeps the device claimed until the session exists.
          return await createSession(waiter, deviceLabel, new Date(now + 30 * 24 * 60 * 60 * 1000));
        }
      }

      const lockedUntil = pinLockout.recordMiss(deviceKey, now);
      if (lockedUntil !== null) {
        console.warn('[auth] PIN device locked', deviceKey, new Date(lockedUntil).toISOString());
        throw Errors.Locked(new Date(lockedUntil));
      }
      throw Errors.Unauthorized();
    } finally {
      pinLockout.end(deviceKey);
    }
  },

  async logout(token: string): Promise<void> {
    const session = await sessionRepo.findByToken(token);
    await sessionRepo.deleteByToken(token);
    if (session) {
      kickUser(session.userId, { code: 'LOGGED_OUT' });
    }
  },

  async validateSession(token: string): Promise<(Session & { user: User }) | null> {
    const session = await sessionRepo.findActiveByToken(token);
    if (!session) {
      return null;
    }
    return session;
  },
};
