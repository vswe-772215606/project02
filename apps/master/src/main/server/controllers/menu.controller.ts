import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { DiscountType } from '@prisma/client';
import { menuService } from '../services/menu.service';

const categorySchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int().optional(),
});

const categoryUpdateSchema = categorySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const itemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  price: z.union([z.number().int(), z.string().min(1)]),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  mode: z.enum(['SERVICE', 'COUNTED', 'UNCOUNTED']).default('SERVICE'),
  costPrice: z.union([z.number().int().positive(), z.string().min(1)]).optional().nullable(),
  initialCount: z.number().int().nonnegative().optional().nullable(),
});

const itemUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  price: z.union([z.number().int(), z.string().min(1)]).optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  kind: z.enum(['FOOD', 'SERVICE']).optional(),
  isActive: z.boolean().optional(),
  costPrice: z.union([z.number().int().positive(), z.string().min(1)]).optional().nullable(),
  counted: z.boolean().optional(),
});

const availabilitySchema = z.object({ isAvailable: z.boolean() });

const comboSchema = z.object({
  name: z.string().min(1),
  components: z.array(z.object({
    menuItemId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
});

const comboUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  components: comboSchema.shape.components.optional(),
});

export const menuController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await menuService.listMenuForClients();
      res.json({ categories });
    } catch (error) {
      next(error);
    }
  },

  async listCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      res.json(await menuService.listCategories(includeInactive));
    } catch (error) {
      next(error);
    }
  },

  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const body = categorySchema.parse(req.body);
      const category = await menuService.createCategory(body, req.user!.id);
      res.status(201).json(category);
    } catch (error) {
      next(error);
    }
  },

  async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const body = categoryUpdateSchema.parse(req.body);
      const category = await menuService.updateCategory(req.params.id, body, req.user!.id);
      res.json(category);
    } catch (error) {
      next(error);
    }
  },

  async listItems(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      res.json(await menuService.listItems(includeInactive));
    } catch (error) {
      next(error);
    }
  },

  async createItem(req: Request, res: Response, next: NextFunction) {
    try {
      const body = itemCreateSchema.parse(req.body);
      const item = await menuService.createItem(body, req.user!.id);
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  },

  async updateItem(req: Request, res: Response, next: NextFunction) {
    try {
      const body = itemUpdateSchema.parse(req.body);
      const item = await menuService.updateItem(req.params.id, body, req.user!.id);
      res.json(item);
    } catch (error) {
      next(error);
    }
  },

  async setAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const body = availabilitySchema.parse(req.body);
      const item = await menuService.setItemAvailability(req.params.id, body.isAvailable, req.user!.id);
      res.json(item);
    } catch (error) {
      next(error);
    }
  },

  async listCombos(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      res.json(await menuService.listCombos(includeInactive));
    } catch (error) {
      next(error);
    }
  },

  async createCombo(req: Request, res: Response, next: NextFunction) {
    try {
      const body = comboSchema.parse(req.body);
      const combo = await menuService.createCombo(body, req.user!.id);
      res.status(201).json(combo);
    } catch (error) {
      next(error);
    }
  },

  async updateCombo(req: Request, res: Response, next: NextFunction) {
    try {
      const body = comboUpdateSchema.parse(req.body);
      const combo = await menuService.updateCombo(req.params.id, body, req.user!.id);
      res.json(combo);
    } catch (error) {
      next(error);
    }
  },
};
