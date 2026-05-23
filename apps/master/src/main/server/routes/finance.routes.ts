import { Router } from 'express';
import { financeController } from '../controllers/finance.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const financeRouter = Router();

financeRouter.use(requireAuth, requireRole(['ADMIN', 'OWNER']));

financeRouter.get('/daily', financeController.daily);
financeRouter.get('/service-charge', financeController.serviceChargeMatrix);

// Soft-close: kunni yopish faqat OWNER. Yopilgandan keyin baribir Expense /
// Purchase yozish mumkin — lekin isAdjustment=true bilan belgilanadi.
financeRouter.post('/daily-close', requireRole('OWNER'), financeController.dailyClose);
financeRouter.post('/daily-reopen', requireRole('OWNER'), financeController.dailyReopen);
