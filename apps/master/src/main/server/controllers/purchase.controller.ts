import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { purchaseService } from '../services/purchase.service';

const listQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ingredientId: z.string().min(1).optional(),
});

const recordSchema = z.object({
  ingredientId: z.string().min(1),
  quantityBuyUnit: z.union([z.number().positive(), z.string().min(1)]),
  totalCostUzs: z.union([z.number().positive(), z.string().min(1)]),
  occurredAt: z.string().datetime().optional(),
  supplierNote: z.string().optional(),
});

const updateSchema = z.object({
  supplierNote: z.string().nullable().optional(),
  occurredAt: z.string().datetime().optional(),
});

const reverseSchema = z.object({
  note: z.string().trim().min(1, 'Sabab kerak'),
});

export const purchaseController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listQuery.parse(req.query);
      res.json(await purchaseService.list({
        from: query.from ? new Date(`${query.from}T00:00:00`) : undefined,
        to: query.to ? new Date(`${query.to}T23:59:59`) : undefined,
        ingredientId: query.ingredientId,
      }));
    } catch (error) {
      next(error);
    }
  },

  async record(req: Request, res: Response, next: NextFunction) {
    try {
      const body = recordSchema.parse(req.body);
      const created = await purchaseService.record({
        ingredientId: body.ingredientId,
        quantityBuyUnit: body.quantityBuyUnit,
        totalCostUzs: body.totalCostUzs,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        supplierNote: body.supplierNote,
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
      res.json(await purchaseService.update({
        id: req.params.id,
        supplierNote: body.supplierNote,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        actorUserId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },

  async reverse(req: Request, res: Response, next: NextFunction) {
    try {
      const body = reverseSchema.parse(req.body);
      res.json(await purchaseService.reverse({
        id: req.params.id,
        note: body.note,
        actorUserId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },
};
