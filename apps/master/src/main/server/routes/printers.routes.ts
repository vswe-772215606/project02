import { Router } from 'express';
import { printersController } from '../controllers/printers.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const printersRouter = Router();

printersRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

printersRouter.get('/', printersController.list);
