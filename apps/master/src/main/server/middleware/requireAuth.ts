import { RequestHandler } from 'express';
import { Errors } from '../lib/errors';
import { sessionRepo } from '../repositories/session.repo';
import { authService } from '../services/auth.service';

export type RequestUser = {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'WAITER';
  fullName: string;
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return next(Errors.Unauthorized());
    }

    const token = header.slice('Bearer '.length).trim();
    const session = await authService.validateSession(token);
    if (!session) {
      return next(Errors.Unauthorized());
    }

    req.user = {
      id: session.user.id,
      role: session.user.role,
      fullName: session.user.fullName,
    };
    req.session = {
      id: session.id,
      token: session.token,
    };

    // Not awaited, so the request never waits on it — but it must never become
    // an unhandled rejection either (PRD 14 G7).
    sessionRepo.touchLastUsed(session.id).catch((error: unknown) => {
      console.error('[requireAuth] session touch failed', error);
    });
    next();
  } catch (error) {
    next(error);
  }
};
