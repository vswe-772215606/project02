import { DebtStatus, PaymentMethod } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { debtService } from '../services/debt.service';

const debtListQuery = z.object({
  status: z.nativeEnum(DebtStatus).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const repaymentSchema = z.object({
  amount: z.union([z.number().positive(), z.string().min(1)]),
  method: z.enum([PaymentMethod.CASH, PaymentMethod.CARD]),
  paidAt: z.string().datetime().optional(),
  note: z.string().optional(),
});

const writeOffSchema = z.object({
  reason: z.string().trim().min(3),
});

export const debtController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = debtListQuery.parse(req.query);
      res.json(await debtService.list({
        status: query.status,
        date: query.date ? new Date(`${query.date}T00:00:00`) : undefined,
      }));
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await debtService.getById(req.params.id));
    } catch (error) {
      next(error);
    }
  },

  async recordRepayment(req: Request, res: Response, next: NextFunction) {
    try {
      const body = repaymentSchema.parse(req.body);
      res.status(201).json(await debtService.recordRepayment({
        debtId: req.params.id,
        amount: body.amount,
        method: body.method,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
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
      res.json(await debtService.writeOff({
        debtId: req.params.id,
        reason: body.reason,
        actorUserId: req.user!.id,
      }));
    } catch (error) {
      next(error);
    }
  },
};
