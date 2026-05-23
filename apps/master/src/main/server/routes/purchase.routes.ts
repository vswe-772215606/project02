import { Router } from 'express';
import { purchaseController } from '../controllers/purchase.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const purchaseRouter = Router();

purchaseRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

purchaseRouter.get('/', purchaseController.list);
purchaseRouter.post('/', purchaseController.record);
purchaseRouter.patch('/:id', purchaseController.update);
purchaseRouter.post('/:id/reverse', purchaseController.reverse);
purchaseRouter.post('/:id/delete', purchaseController.delete);
