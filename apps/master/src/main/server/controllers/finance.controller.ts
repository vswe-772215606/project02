import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { financeService } from '../services/finance.service';

const dailyQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const financeController = {
  async daily(req: Request, res: Response, next: NextFunction) {
    try {
      const q = dailyQuery.parse(req.query);
      const date = q.date
        ? new Date(`${q.date}T00:00:00`)
        : new Date();
      res.json(await financeService.dailyForAdmin(date));
    } catch (error) {
      next(error);
    }
  },
};
