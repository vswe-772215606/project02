import 'express';
import type { RequestUser } from '../middleware/requireAuth';

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      session?: { id: string; token: string };
    }
  }
}

export {};
