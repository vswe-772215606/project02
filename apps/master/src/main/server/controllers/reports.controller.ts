import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportsService } from '../services/reports.service';
import { Errors } from '../lib/errors';

const dailyQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  search: z.string().trim().max(100).optional(),
});
const monthlyQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });
const waiterReportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function parseLocalDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

export const reportsController = {
  async daily(req: Request, res: Response, next: NextFunction) {
    try {
      const { date, search } = dailyQuery.parse(req.query);
      const report = await reportsService.daily(parseLocalDate(date), search);
      res.json(report);
    } catch (e) {
      next(e);
    }
  },

  async monthly(req: Request, res: Response, next: NextFunction) {
    try {
      const { month } = monthlyQuery.parse(req.query);
      const [y, m] = month.split('-').map((s) => parseInt(s, 10));
      if (!y || !m) throw Errors.Validation('Oy formati noto\'g\'ri');
      const report = await reportsService.monthly(new Date(y, m - 1, 1));
      res.json(report);
    } catch (e) {
      next(e);
    }
  },

  async waiterReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { waiterId } = req.params as { waiterId: string };
      const { from, to } = waiterReportQuery.parse(req.query);
      const fromDate = parseLocalDate(from);
      const toDate = parseLocalDate(to);
      toDate.setDate(toDate.getDate() + 1);
      if (fromDate >= toDate) throw Errors.Validation('from must be before to');
      const report = await reportsService.waiterReport(waiterId, fromDate, toDate);
      res.json(report);
    } catch (e) {
      next(e);
    }
  },
};
