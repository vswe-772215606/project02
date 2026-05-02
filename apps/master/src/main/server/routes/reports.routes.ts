import { Router } from 'express';
import { reportsController } from '../controllers/reports.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole('OWNER'));

reportsRouter.get('/daily', reportsController.daily);
reportsRouter.get('/monthly', reportsController.monthly);
