import { UserRole } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { toPublicUser } from '../lib/public-user';
import { userService } from '../services/user.service';

const createSchema = z.object({
  role: z.nativeEnum(UserRole),
  fullName: z.string().min(1),
  username: z.string().optional(),
  password: z.string().optional(),
  pin: z.string().optional(),
});

const updateSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  fullName: z.string().optional(),
  username: z.string().nullable().optional(),
  password: z.string().optional(),
  pin: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const usersController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      res.json((await userService.list(includeInactive)).map(toPublicUser));
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createSchema.parse(req.body);
      const user = await userService.create(body, {
        id: req.user!.id,
        role: req.user!.role as UserRole,
      });
      res.status(201).json(toPublicUser(user));
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = updateSchema.parse(req.body);
      const user = await userService.update(req.params.id, body, {
        id: req.user!.id,
        role: req.user!.role as UserRole,
      });
      res.json(toPublicUser(user));
    } catch (error) {
      next(error);
    }
  },

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(toPublicUser(await userService.deactivate(req.params.id, req.user!.id)));
    } catch (error) {
      next(error);
    }
  },
};
