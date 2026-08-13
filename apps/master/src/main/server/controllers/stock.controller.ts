import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { stockService } from '../services/stock.service';

const restockSchema = z.object({
  qty: z.number().int().positive(),
  paidUzs: z.number().int().positive().optional().nullable(),
  setCostFromPaid: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

const countSchema = z.object({
  countedQty: z.number().int().nonnegative(),
  note: z.string().max(500).optional(),
});

export const stockController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await stockService.listCounted());
    } catch (error) {
      next(error);
    }
  },

  async entries(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await stockService.listEntries(req.params.menuItemId));
    } catch (error) {
      next(error);
    }
  },

  async restock(req: Request, res: Response, next: NextFunction) {
    try {
      const body = restockSchema.parse(req.body);
      const entry = await stockService.restock({
        menuItemId: req.params.menuItemId,
        qty: body.qty,
        paidUzs: body.paidUzs ?? null,
        setCostFromPaid: body.setCostFromPaid ?? false,
        note: body.note,
        occurredAt: new Date(),
        actorUserId: req.user!.id,
      });
      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  },

  async count(req: Request, res: Response, next: NextFunction) {
    try {
      const body = countSchema.parse(req.body);
      const entry = await stockService.setCount({
        menuItemId: req.params.menuItemId,
        countedQty: body.countedQty,
        note: body.note,
        occurredAt: new Date(),
        actorUserId: req.user!.id,
      });
      res.status(201).json(entry);
    } catch (error) {
      next(error);
    }
  },
};
