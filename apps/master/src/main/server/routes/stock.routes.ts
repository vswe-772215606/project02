import { Router } from 'express';
import { stockController } from '../controllers/stock.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const stockRouter = Router();

stockRouter.use(requireAuth);

stockRouter.get('/today', stockController.getToday);
stockRouter.post('/today', requireRole(['ADMIN', 'OWNER']), stockController.setToday);
stockRouter.post('/today/:menuItemId/batch-add', requireRole(['ADMIN', 'OWNER']), stockController.addBatch);
stockRouter.post('/today/:menuItemId/batch-remove', requireRole(['ADMIN', 'OWNER']), stockController.removeBatch);
stockRouter.get('/history', requireRole('OWNER'), stockController.history);

/** 
 * Obsolete endpoint - replaced by batch operations
 * @deprecated Use /batch-add or /batch-remove instead
 */
stockRouter.patch('/today/:menuItemId', (req, res) => {
  res.status(410).json({ 
    error: { 
      code: 'GONE', 
      message: 'Ushbu endpoint o\'chirildi. Iltimos, partiya qo\'shish yoki olib tashlash amallaridan foydalaning.' 
    } 
  });
});
