import { Router } from 'express';
import { debtController } from '../controllers/debt.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const debtRouter = Router();

debtRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

debtRouter.get('/', debtController.list);
debtRouter.get('/:id', debtController.getById);
debtRouter.post('/:id/repayments', debtController.recordRepayment);
debtRouter.post('/:id/write-off', debtController.writeOff);
