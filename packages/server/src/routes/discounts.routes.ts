import { Router } from 'express';
import { discountsController } from '../controllers/discounts.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const discountsRouter = Router();

discountsRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

discountsRouter.get('/', discountsController.list);
discountsRouter.post('/', discountsController.create);
discountsRouter.patch('/:id', discountsController.update);
discountsRouter.delete('/:id', discountsController.softDelete);
