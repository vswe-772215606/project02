import { Router } from 'express';
import { menuController } from '../controllers/menu.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const menuRouter = Router();

menuRouter.use(requireAuth);

menuRouter.get('/', menuController.list);
menuRouter.get('/categories', menuController.listCategories);
menuRouter.post('/categories', requireRole(['ADMIN', 'OWNER']), menuController.createCategory);
menuRouter.patch('/categories/:id', requireRole(['ADMIN', 'OWNER']), menuController.updateCategory);
menuRouter.get('/items', menuController.listItems);
menuRouter.post('/items', requireRole(['ADMIN', 'OWNER']), menuController.createItem);
menuRouter.patch('/items/:id', requireRole(['ADMIN', 'OWNER']), menuController.updateItem);
menuRouter.patch('/items/:id/availability', requireRole(['ADMIN', 'OWNER', 'KITCHEN']), menuController.setAvailability);
menuRouter.get('/combos', menuController.listCombos);
menuRouter.post('/combos', requireRole(['ADMIN', 'OWNER']), menuController.createCombo);
menuRouter.patch('/combos/:id', requireRole(['ADMIN', 'OWNER']), menuController.updateCombo);
