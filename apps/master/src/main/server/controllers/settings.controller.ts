import { NextFunction, Request, Response } from 'express';
import { Errors } from '../lib/errors';
import { z } from 'zod';
import { settingsService } from '../services/settings.service';

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export const settingsController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(settingsService.getAll());
    } catch (error) {
      next(error);
    }
  },

  async patch(req: Request, res: Response, next: NextFunction) {
    try {
      const body = patchSchema.parse(req.body);
      if (!settingsService.canEdit(body.key, req.user!.role as 'OWNER' | 'ADMIN')) {
        throw Errors.Forbidden();
      }
      await settingsService.set(body.key, body.value, req.user!.id);
      res.json({ key: body.key, value: body.value });
    } catch (error) {
      next(error);
    }
  },
};
