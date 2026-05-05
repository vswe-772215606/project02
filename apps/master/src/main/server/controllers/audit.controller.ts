import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { auditService } from '../services/audit.service';

const querySchema = z.object({
  action: z.string().optional(),
  userId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const auditController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = querySchema.parse(req.query);
      res.json(await auditService.list({
        action: query.action || undefined,
        userId: query.userId || undefined,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        page: query.page,
        pageSize: query.pageSize,
      }));
    } catch (error) {
      next(error);
    }
  },
};
