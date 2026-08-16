import { Router } from 'express';
import { tablesController } from '../controllers/tables.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const tablesRouter = Router();

tablesRouter.use(requireAuth);

tablesRouter.get('/', tablesController.list);
tablesRouter.post('/', requireRole(['ADMIN', 'OWNER']), tablesController.create);
tablesRouter.patch('/:id', requireRole(['ADMIN', 'OWNER']), tablesController.update);
