import { Router } from 'express';
import { meController } from '../controllers/me.controller';
import { requireAuth } from '../middleware/requireAuth';

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get('/today-stats', meController.todayStats);
