import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { expenseService } from '../services/expense.service';
import { localDayRangeFor, parseLocalDay } from '../lib/time';

const createExpenseSchema = z.object({
  categoryId: z.string().min(1).optional(),
  amount: z.union([z.number().positive(), z.string().min(1)]),
  reason: z.string().trim().min(3),
  note: z.string().optional(),
  occurredAt: z.string().datetime(),
  repayable: z.boolean().optional(),
});

const reverseExpenseSchema = z.object({
  note: z.string().trim().min(3),
});

const recordReturnSchema = z.object({
  amount: z.union([z.number().positive(), z.string().min(1)]),
  receivedAt: z.string().datetime().optional(),
  note: z.string().optional(),
});

const writeOffSchema = z.object({
  reason: z.string().trim().min(3),
});

const listExpensesQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const searchQuery = z.object({
  q: z.string().optional(),
  repayable: z.enum(['true', 'false']).optional(),
  openRepayable: z.enum(['true', 'false']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const expenseController = {
  async listCategories(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await expenseService.listCategories());
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { date } = listExpensesQuery.parse(req.query);
      res.json(await expenseService.listByDate(parseLocalDay(date)));
    } catch (error) {
      next(error);
    }
  },

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const q = searchQuery.parse(req.query);
      res.json({
        items: await expenseService.search({
          q: q.q,
          repayable: q.repayable ? q.repayable === 'true' : undefined,
          openRepayable: q.openRepayable === 'true',
          // search range is half-open: [from-day-start, to-day-end-exclusive)
          from: q.from ? parseLocalDay(q.from) : undefined,
          to: q.to ? localDayRangeFor(q.to).end : undefined,
          limit: q.limit,
        }),
      });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createExpenseSchema.parse(req.body);
      res.status(201).json(await expenseService.create({
        categoryId: body.categoryId,
        amount: body.amount,
        reason: body.reason,
        note: body.note,
        occurredAt: new Date(body.occurredAt),
        repayable: body.repayable,
        actorUserId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },

  async reverse(req: Request, res: Response, next: NextFunction) {
    try {
      const body = reverseExpenseSchema.parse(req.body);
      res.json(await expenseService.reverse({
        expenseId: req.params.id,
        note: body.note,
        actorUserId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },

  async recordReturn(req: Request, res: Response, next: NextFunction) {
    try {
      const body = recordReturnSchema.parse(req.body);
      res.status(201).json(await expenseService.recordReturn({
        expenseId: req.params.id,
        amount: body.amount,
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
        note: body.note,
        actorUserId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },

  async writeOff(req: Request, res: Response, next: NextFunction) {
    try {
      const body = writeOffSchema.parse(req.body);
      res.json(await expenseService.writeOff({
        expenseId: req.params.id,
        reason: body.reason,
        actorUserId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },
};
