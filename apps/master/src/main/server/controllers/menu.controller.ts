import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { DiscountType } from '@prisma/client';
import { menuService } from '../services/menu.service';
import { recipeService } from '../services/recipe.service';
import { recipeRepo } from '../repositories/recipe.repo';
import { yieldService } from '../services/yield.service';
import { Errors } from '../lib/errors';

const recipeUpsertSchema = z.object({
  ingredients: z.array(z.object({
    ingredientId: z.string().min(1),
    quantity: z.union([z.number().positive(), z.string().min(1)]),
  })),
  notes: z.string().optional().nullable(),
});

const recipeCompleteSchema = z.object({
  isComplete: z.boolean(),
});

const categorySchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int().optional(),
});

const categoryUpdateSchema = categorySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Legacy shape — name/price/category/kind only. Still accepted on update.
const itemUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  price: z.union([z.number().int(), z.string().min(1)]).optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  kind: z.enum(['FOOD', 'SERVICE']).optional(),
  isActive: z.boolean().optional(),
});

// New create shape — discriminated by `mode`. The form always sends name,
// category, price; the mode decides whether stock/cost/ingredient fields are
// expected. Legacy callers that send no `mode` are treated as SERVICE so
// behavior is unchanged for untracked items.
const unitEnum = z.enum(['dona', 'kg', 'l']);

const simpleModeSchema = z.object({
  unit: unitEnum,
  unitCost: z.union([z.number().positive(), z.string().min(1)]),
  initialQty: z.union([z.number().nonnegative(), z.string().min(1)]).optional(),
});

const compositeIngredientSchema = z.object({
  name: z.string().min(1),
  unit: unitEnum,
  quantityPerPortion: z.union([z.number().positive(), z.string().min(1)]),
  initialQty: z.union([z.number().positive(), z.string().min(1)]),
  initialUnitCost: z.union([z.number().positive(), z.string().min(1)]),
});

const compositeModeSchema = z.object({
  notes: z.string().optional().nullable(),
  ingredients: z.array(compositeIngredientSchema).min(1),
});

const itemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  price: z.union([z.number().int(), z.string().min(1)]),
  description: z.string().optional(),
  displayOrder: z.number().int().optional(),
  mode: z.enum(['SERVICE', 'SIMPLE', 'COMPOSITE', 'UNTRACKED']).default('SERVICE'),
  simple: simpleModeSchema.optional(),
  composite: compositeModeSchema.optional(),
}).superRefine((val, ctx) => {
  if (val.mode === 'SIMPLE' && !val.simple) {
    ctx.addIssue({ code: 'custom', message: 'Oddiy mahsulot uchun `simple` maydoni kerak', path: ['simple'] });
  }
  if (val.mode === 'COMPOSITE' && !val.composite) {
    ctx.addIssue({ code: 'custom', message: 'Kompozit mahsulot uchun `composite` maydoni kerak', path: ['composite'] });
  }
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

  async getItemRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      const recipe = await recipeService.findByMenuItemId(req.params.id);
      res.json(recipe);
    } catch (error) {
      next(error);
    }
  },

  async updateItemRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      const body = recipeUpsertSchema.parse(req.body);
      const updated = await recipeService.upsert({
        menuItemId: req.params.id,
        ingredients: body.ingredients,
        notes: body.notes ?? null,
        actorUserId: req.user!.id,
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  async getYield(_req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await yieldService.computeAll();
      res.json(rows);
    } catch (error) {
      next(error);
    }
  },

  async setRecipeComplete(req: Request, res: Response, next: NextFunction) {
    try {
      const body = recipeCompleteSchema.parse(req.body);
      const existing = await recipeRepo.findByMenuItemId(req.params.id);
      if (!existing) {
        throw Errors.NotFound('Retsept');
      }
      const updated = await recipeService.setComplete({
        recipeId: existing.id,
        isComplete: body.isComplete,
        actorUserId: req.user!.id,
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  async deleteItemRecipe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await recipeService.deleteForMenuItem({
        menuItemId: req.params.id,
        actorUserId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
