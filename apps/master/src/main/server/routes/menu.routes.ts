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
// Full item rows (costPrice, stockCount, counted) — no client app fetches
// this (apps/order and apps/mobile only call GET /api/menu and GET
// /api/menu/combos), so gate it ADMIN/OWNER rather than leave it open.
menuRouter.get('/items', requireRole(['ADMIN', 'OWNER']), menuController.listItems);
menuRouter.post('/items', requireRole(['ADMIN', 'OWNER']), menuController.createItem);
menuRouter.patch('/items/:id', requireRole(['ADMIN', 'OWNER']), menuController.updateItem);
menuRouter.patch('/items/:id/availability', requireRole(['ADMIN', 'OWNER']), menuController.setAvailability);
// Left open to all roles: apps/order and apps/mobile fetch this for combo
// order-taking under WAITER PIN sessions (MenuPanel/MenuPage). Safe only
// because menuService.listCombos whitelists each component's menuItem down
// to { name, price } — see the comment there before changing this route.
menuRouter.get('/combos', menuController.listCombos);
menuRouter.post('/combos', requireRole(['ADMIN', 'OWNER']), menuController.createCombo);
menuRouter.patch('/combos/:id', requireRole(['ADMIN', 'OWNER']), menuController.updateCombo);
