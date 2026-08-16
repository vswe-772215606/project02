import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { toPublicUser } from '../lib/public-user';
import { authService } from '../services/auth.service';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceLabel: z.string().optional(),
});

const loginPinSchema = z.object({
  pin: z.string().min(4).max(4),
  deviceLabel: z.string().optional(),
});

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const body = loginSchema.parse(req.body);
      const result = await authService.login(body.username, body.password, body.deviceLabel);
      res.json({ token: result.token, user: toPublicUser(result.user) });
    } catch (error) {
      next(error);
    }
  },

  async loginPin(req: Request, res: Response, next: NextFunction) {
    try {
      const body = loginPinSchema.parse(req.body);
      const result = await authService.loginPin(body.pin, body.deviceLabel);
      res.json({ token: result.token, user: toPublicUser(result.user) });
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      await authService.logout(req.session!.token);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ user: req.user });
    } catch (error) {
      next(error);
    }
  },
};
