import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { financeService } from '../services/finance.service';

const dailyQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const monthQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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

  async serviceChargeMatrix(req: Request, res: Response, next: NextFunction) {
    try {
      const q = monthQuery.parse(req.query);
      res.json(await financeService.serviceChargeMatrix(q.month ?? currentMonthKey()));
    } catch (error) {
      next(error);
    }
  },
};
