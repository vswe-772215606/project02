import { Router } from 'express';
import { financeController } from '../controllers/finance.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const financeRouter = Router();

financeRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

financeRouter.get('/daily', financeController.daily);
financeRouter.get('/service-charge', financeController.serviceChargeMatrix);
