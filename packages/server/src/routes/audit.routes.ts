import { Router } from 'express';
import { auditController } from '../controllers/audit.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

auditRouter.get('/', auditController.list);
