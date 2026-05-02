import { RequestHandler } from 'express';
import { Errors } from '../lib/errors';
import { sessionRepo } from '../repositories/session.repo';
import { authService } from '../services/auth.service';

export type RequestUser = {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'KITCHEN' | 'WAITER';
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

    void sessionRepo.touchLastUsed(session.id);
    next();
  } catch (error) {
    next(error);
  }
};
