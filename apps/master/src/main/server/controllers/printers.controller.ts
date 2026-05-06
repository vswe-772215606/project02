import { NextFunction, Request, Response } from 'express';
import { printersService } from '../services/printers.service';

export const printersController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const printers = await printersService.list();
      res.json({ printers });
    } catch (error) {
      next(error);
    }
  },
};
