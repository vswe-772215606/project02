import { Router } from 'express';
import { expenseController } from '../controllers/expense.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const expenseRouter = Router();

expenseRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

expenseRouter.get('/', expenseController.list);
expenseRouter.get('/search', expenseController.search);
expenseRouter.post('/', expenseController.create);
expenseRouter.post('/:id/reverse', expenseController.reverse);
expenseRouter.post('/:id/returns', expenseController.recordReturn);
expenseRouter.post('/:id/write-off', expenseController.writeOff);
