import { RequestHandler } from 'express';
import { Errors } from '../lib/errors';

export function ipRateLimit(opts: { windowMs: number; max: number }): RequestHandler {
  const store = new Map<string, { count: number; resetAt: number }>();

  return (req, _res, next) => {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || entry.resetAt < now) {
      store.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    if (entry.count >= opts.max) {
      return next(Errors.Conflict('Too many requests, slow down'));
    }

    entry.count += 1;
    next();
  };
}
