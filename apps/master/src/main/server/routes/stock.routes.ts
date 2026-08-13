import { Router } from 'express';
import { stockController } from '../controllers/stock.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const stockRouter = Router();

stockRouter.use(requireAuth);
stockRouter.use(requireRole(['ADMIN', 'OWNER']));

stockRouter.get('/', stockController.list);
stockRouter.get('/:menuItemId/entries', stockController.entries);
stockRouter.post('/:menuItemId/restock', stockController.restock);
stockRouter.post('/:menuItemId/count', stockController.count);
