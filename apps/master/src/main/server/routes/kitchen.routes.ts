import { Router } from 'express';
import { kitchenController } from '../controllers/kitchen.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const kitchenRouter = Router();

kitchenRouter.use(requireAuth);

kitchenRouter.get('/tickets/active', requireRole(['KITCHEN', 'ADMIN', 'OWNER']), kitchenController.listActive);
kitchenRouter.get('/tickets/:id', requireRole(['KITCHEN', 'ADMIN', 'OWNER']), kitchenController.getById);
kitchenRouter.patch('/tickets/:id', requireRole(['KITCHEN', 'OWNER']), kitchenController.setStatus);
kitchenRouter.post('/tickets/:id/reprint', requireRole(['KITCHEN', 'ADMIN', 'OWNER']), kitchenController.reprint);
