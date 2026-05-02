import { NextFunction, Request, Response } from 'express';
import { TableType } from '@prisma/client';
import { z } from 'zod';
import { tableService } from '../services/table.service';

const createSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(TableType),
  displayOrder: z.number().int().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.nativeEnum(TableType).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const tablesController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await tableService.list(true));
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createSchema.parse(req.body);
      res.status(201).json(await tableService.create(body));
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const body = updateSchema.parse(req.body);
      res.json(await tableService.update(req.params.id, body));
    } catch (error) {
      next(error);
    }
  },
};
