import { RequestHandler } from 'express';
import { Errors } from '../lib/errors';

type Role = 'OWNER' | 'ADMIN' | 'WAITER';

export function requireRole(roles: Role | Role[]): RequestHandler {
  const allow = Array.isArray(roles) ? roles : [roles];
  return (req, _res, next) => {
    if (!req.user) {
      return next(Errors.Unauthorized());
    }
    if (!allow.includes(req.user.role as Role)) {
      return next(Errors.Forbidden());
    }
    next();
  };
}
