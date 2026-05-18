import { Router } from 'express';
import { ingredientController } from '../controllers/ingredient.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const ingredientRouter = Router();

ingredientRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

ingredientRouter.get('/', ingredientController.list);
ingredientRouter.get('/:id', ingredientController.getById);
ingredientRouter.post('/', ingredientController.create);
ingredientRouter.patch('/:id', ingredientController.update);
ingredientRouter.delete('/:id', ingredientController.delete);
