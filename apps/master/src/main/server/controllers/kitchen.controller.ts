import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { kitchenService } from '../services/kitchen.service';

const statusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'READY']),
});

export const kitchenController = {
  async listActive(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await kitchenService.listActive());
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await kitchenService.getById(req.params.id));
    } catch (error) {
      next(error);
    }
  },

  async setStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const body = statusSchema.parse(req.body);
      res.json(await kitchenService.setStatus({
        ticketId: req.params.id,
        kitchenUserId: req.user!.id,
        status: body.status,
      }));
    } catch (error) {
      next(error);
    }
  },

  async reprint(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await kitchenService.reprint(req.params.id, req.user!.id));
    } catch (error) {
      next(error);
    }
  },
};
