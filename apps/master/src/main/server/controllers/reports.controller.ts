import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { reportsService } from '../services/reports.service';

const dailySchema = z.object({
  date: z.string().min(1),
});

const monthlySchema = z.object({
  month: z.string().min(1),
});

export const reportsController = {
  async daily(req: Request, res: Response, next: NextFunction) {
    try {
      const query = dailySchema.parse(req.query);
      res.json(await reportsService.daily(query.date));
    } catch (error) {
      next(error);
    }
  },

  async monthly(req: Request, res: Response, next: NextFunction) {
    try {
      const query = monthlySchema.parse(req.query);
      res.json(await reportsService.monthly(query.month));
    } catch (error) {
      next(error);
    }
  },
};
