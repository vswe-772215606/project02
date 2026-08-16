import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { financeService } from '../services/finance.service';
import {
  localDayKey,
  localDayRangeFor,
  localMonthRangeFor,
  parseLocalDay,
} from '../lib/time';

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

export const financeController = {
  async daily(req: Request, res: Response, next: NextFunction) {
    try {
      const q = dailyQuery.parse(req.query);
      const date = parseLocalDay(q.date ?? localDayKey());
      res.json(await financeService.dailyForAdmin(date));
    } catch (error) {
      next(error);
    }
  },

  async serviceChargeMatrix(req: Request, res: Response, next: NextFunction) {
    try {
      const q = serviceChargeQuery.parse(req.query);
      let from: Date;
      let to: Date;
      if (q.from && q.to) {
        from = parseLocalDay(q.from);
        // `to` is the LAST day in the range; service code expects an instant
        // that lives inside that day so its inclusive-loop logic finds it.
        // Half-open downstream queries will compute the proper exclusive end.
        to = parseLocalDay(q.to);
      } else if (q.month) {
        const range = localMonthRangeFor(q.month);
        from = range.start;
        // Last day of the month, expressed as a day-start instant.
        to = new Date(range.end.getTime() - 24 * 60 * 60 * 1000);
      } else {
        const nowKey = localDayKey();
        const monthKey = nowKey.slice(0, 7);
        const range = localMonthRangeFor(monthKey);
        from = range.start;
        to = new Date(range.end.getTime() - 24 * 60 * 60 * 1000);
      }
      if (from > to) {
        return res.status(400).json({
          error: { code: 'VALIDATION', message: '"to" sanasi "from" sanasidan oldin bo\'lishi mumkin emas' },
        });
      }
      res.json(await financeService.serviceChargeMatrix({ from, to }));
    } catch (error) {
      next(error);
    }
  },
};
