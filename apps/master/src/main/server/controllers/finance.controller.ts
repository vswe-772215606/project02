import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { financeService } from '../services/finance.service';

const dailyQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Either { from, to } as ISO dates, or legacy { month: YYYY-MM }, or
// neither (defaults to current calendar month).
const serviceChargeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

function currentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function monthKeyToRange(monthStr: string): { from: Date; to: Date } {
  const [yearStr, monthIdxStr] = monthStr.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthIdxStr); // 1..12
  return {
    from: new Date(year, monthIdx - 1, 1, 0, 0, 0, 0),
    to: new Date(year, monthIdx, 0, 23, 59, 59, 999),
  };
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
      const q = serviceChargeQuery.parse(req.query);
      let range: { from: Date; to: Date };
      if (q.from && q.to) {
        range = {
          from: new Date(`${q.from}T00:00:00`),
          to: new Date(`${q.to}T23:59:59.999`),
        };
      } else if (q.month) {
        range = monthKeyToRange(q.month);
      } else {
        range = currentMonthRange();
      }
      if (range.from > range.to) {
        return res.status(400).json({
          error: { code: 'VALIDATION', message: '"to" sanasi "from" sanasidan oldin bo\'lishi mumkin emas' },
        });
      }
      res.json(await financeService.serviceChargeMatrix(range));
    } catch (error) {
      next(error);
    }
  },
};
