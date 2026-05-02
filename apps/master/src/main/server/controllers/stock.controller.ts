import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { stockService } from '../services/stock.service';

const bulkSchema = z.object({
  entries: z.array(z.object({
    menuItemId: z.string().min(1),
    count: z.number().int().min(0),
  })),
});

const patchSchema = z.object({
  count: z.number().int().min(0),
});

const historySchema = z.object({
  menuItemId: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const stockController = {
  async getToday(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await stockService.listToday());
    } catch (error) {
      next(error);
    }
  },

  async setToday(req: Request, res: Response, next: NextFunction) {
    try {
      const body = bulkSchema.parse(req.body);
      res.status(201).json(await stockService.setInitialCounts(body.entries, req.user!.id));
    } catch (error) {
      next(error);
    }
  },

  async patchToday(req: Request, res: Response, next: NextFunction) {
    try {
      const body = patchSchema.parse(req.body);
      res.json(await stockService.adjustCurrent(req.params.menuItemId, body.count, req.user!.id));
    } catch (error) {
      next(error);
    }
  },

  async history(req: Request, res: Response, next: NextFunction) {
    try {
      const query = historySchema.parse(req.query);
      res.json(await stockService.historyForItem(
        query.menuItemId,
        query.from ? new Date(query.from) : new Date(0),
        query.to ? new Date(query.to) : new Date(),
      ));
    } catch (error) {
      next(error);
    }
  },
};
