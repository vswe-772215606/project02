import { Router } from 'express';
import { stockController } from '../controllers/stock.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const stockRouter = Router();

stockRouter.use(requireAuth);

stockRouter.get('/today', stockController.getToday);
stockRouter.post('/today', requireRole(['ADMIN', 'OWNER']), stockController.setToday);
stockRouter.patch('/today/:menuItemId', requireRole(['ADMIN', 'OWNER']), stockController.patchToday);
stockRouter.get('/history', requireRole('OWNER'), stockController.history);
