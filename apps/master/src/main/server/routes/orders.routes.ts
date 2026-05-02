import { Router } from 'express';
import { ordersController } from '../controllers/orders.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.post('/', requireRole('WAITER'), ordersController.create);
ordersRouter.get('/', ordersController.list);
ordersRouter.get('/:id', ordersController.getById);
ordersRouter.post('/:id/items', requireRole('WAITER'), ordersController.addItem);
ordersRouter.post('/:id/combos', requireRole('WAITER'), ordersController.addCombo);
ordersRouter.patch('/:id/lines/:lineId/notes', requireRole('WAITER'), ordersController.editLineNote);
ordersRouter.post('/:id/lines/:lineId/cancel', requireRole(['WAITER', 'ADMIN', 'OWNER']), ordersController.cancelLine);
ordersRouter.post('/:id/send', requireRole('WAITER'), ordersController.send);
ordersRouter.post('/:id/transfer', requireRole(['WAITER', 'ADMIN', 'OWNER']), ordersController.transfer);
ordersRouter.post('/:id/request-bill', requireRole('WAITER'), ordersController.requestBill);
ordersRouter.post('/:id/cancel', requireRole(['WAITER', 'ADMIN', 'OWNER']), ordersController.cancelOrder);
ordersRouter.post('/:id/approve', requireRole(['ADMIN', 'OWNER']), ordersController.approve);
ordersRouter.post('/:id/mark-paid', requireRole(['ADMIN', 'OWNER']), ordersController.markPaid);
ordersRouter.post('/:id/mark-walkout', requireRole(['ADMIN', 'OWNER']), ordersController.markWalkout);
ordersRouter.post('/:id/reprint-bill', requireRole(['ADMIN', 'OWNER']), ordersController.reprintBill);
