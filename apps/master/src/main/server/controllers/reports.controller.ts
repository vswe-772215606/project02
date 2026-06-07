import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportsService } from '../services/reports.service';
import { Errors } from '../lib/errors';
import { localMonthRangeFor, parseLocalDay } from '../lib/time';

const dailyQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const monthlyQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
const summaryQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const reportsController = {
  async daily(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = dailyQuery.parse(req.query);
      const report = await reportsService.daily(parseLocalDay(date));
      res.json(report);
    } catch (e) {
      next(e);
    }
  },

  async monthly(req: Request, res: Response, next: NextFunction) {
    try {
      const { month } = monthlyQuery.parse(req.query);
      // localMonthRangeFor validates format and returns the Tashkent-anchored
      // first-day instant — the canonical "month start" the service expects.
      const { start } = localMonthRangeFor(month);
      const report = await reportsService.monthly(start);
      res.json(report);
    } catch (e) {
      next(e);
    }
  },

  async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = summaryQuery.parse(req.query);
      const fromDate = parseLocalDay(from);
      const toDate = parseLocalDay(to);
      if (toDate < fromDate) throw Errors.Validation('Tugash sanasi boshlanish sanasidan keyin bo\'lishi kerak');
      const report = await reportsService.summary({ from: fromDate, to: toDate });
      res.json(report);
    } catch (e) {
      next(e);
    }
  },
};
