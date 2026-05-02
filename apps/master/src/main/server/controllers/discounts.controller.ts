import { DiscountType } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { discountService } from '../services/discount.service';

const createSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(DiscountType),
  value: z.union([z.number().int(), z.string().min(1)]),
});

const updateSchema = createSchema.partial();

export const discountsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await discountService.listAll());
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createSchema.parse(req.body);
      res.status(201).json(await discountService.create(body, req.user!.id));
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = updateSchema.parse(req.body);
      res.json(await discountService.update(req.params.id, body, req.user!.id));
    } catch (error) {
      next(error);
    }
  },

  async softDelete(req: Request, res: Response, next: NextFunction) {
    try {
      await discountService.softDelete(req.params.id, req.user!.id);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
};
