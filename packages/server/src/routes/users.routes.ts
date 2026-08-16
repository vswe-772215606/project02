import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

usersRouter.get('/', usersController.list);
usersRouter.get('/today-stats', usersController.todayStats);
usersRouter.post('/', usersController.create);
usersRouter.patch('/:id', usersController.update);
usersRouter.post('/:id/deactivate', usersController.deactivate);
