import { Router } from 'express';
import { expenseController } from '../controllers/expense.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const expenseCategoryRouter = Router();

expenseCategoryRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));
expenseCategoryRouter.get('/', expenseController.listCategories);
