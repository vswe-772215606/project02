import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { expenseService } from '../services/expense.service';

const createExpenseSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.union([z.number().positive(), z.string().min(1)]),
  reason: z.string().trim().min(3),
  note: z.string().optional(),
  occurredAt: z.string().datetime(),
});

const reverseExpenseSchema = z.object({
  note: z.string().trim().min(3),
});

const listExpensesQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
      res.json(await expenseService.listByDate(new Date(`${date}T00:00:00`)));
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
};
