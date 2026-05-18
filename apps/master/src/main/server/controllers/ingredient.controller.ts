import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ingredientService } from '../services/ingredient.service';

const listQuery = z.object({
  isActive: z.enum(['true', 'false']).optional(),
  isSelfMenuItem: z.enum(['true', 'false']).optional(),
  parentMenuItemId: z.string().min(1).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  parentMenuItemId: z.string().min(1),
  buyUnit: z.string().trim().min(1),
  recipeUnit: z.string().trim().min(1),
  conversionFactor: z.union([z.number().positive(), z.string().min(1)]),
  varianceThreshold: z.union([z.number().nonnegative(), z.string()]).optional(),
  isSelfMenuItem: z.boolean().optional(),
  selfMenuItemId: z.string().nullable().optional(),
  expenseCategoryId: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  buyUnit: z.string().trim().min(1).optional(),
  recipeUnit: z.string().trim().min(1).optional(),
  conversionFactor: z.union([z.number().positive(), z.string()]).optional(),
  varianceThreshold: z.union([z.number().nonnegative(), z.string()]).optional(),
  isActive: z.boolean().optional(),
  expenseCategoryId: z.string().nullable().optional(),
});

export const ingredientController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listQuery.parse(req.query);
      res.json(await ingredientService.list({
        isActive: query.isActive ? query.isActive === 'true' : undefined,
        isSelfMenuItem: query.isSelfMenuItem ? query.isSelfMenuItem === 'true' : undefined,
        parentMenuItemId: query.parentMenuItemId,
      }));
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await ingredientService.getById(req.params.id));
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createSchema.parse(req.body);
      const created = await ingredientService.create({
        name: body.name,
        parentMenuItemId: body.parentMenuItemId,
        buyUnit: body.buyUnit,
        recipeUnit: body.recipeUnit,
        conversionFactor: body.conversionFactor,
        varianceThreshold: body.varianceThreshold,
        isSelfMenuItem: body.isSelfMenuItem,
        selfMenuItemId: body.selfMenuItemId ?? null,
        expenseCategoryId: body.expenseCategoryId ?? null,
        actorUserId: req.user!.id,
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = updateSchema.parse(req.body);
      res.json(await ingredientService.update(req.params.id, {
        ...body,
        expenseCategoryId: body.expenseCategoryId ?? undefined,
        actorUserId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await ingredientService.delete(req.params.id, req.user!.id));
    } catch (error) {
      next(error);
    }
  },
};
