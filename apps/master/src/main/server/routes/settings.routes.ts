import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

settingsRouter.get('/', settingsController.getAll);
settingsRouter.patch('/', settingsController.patch);
