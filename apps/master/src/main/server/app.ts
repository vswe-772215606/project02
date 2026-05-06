import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express } from 'express';
import { auditRouter } from './routes/audit.routes';
import { authRouter } from './routes/auth.routes';
import { debtRouter } from './routes/debt.routes';
import { discountsRouter } from './routes/discounts.routes';
import { expenseCategoryRouter } from './routes/expense-category.routes';
import { expenseRouter } from './routes/expense.routes';
import { healthRouter } from './routes/health.routes';
import { kitchenRouter } from './routes/kitchen.routes';
import { menuRouter } from './routes/menu.routes';
import { ordersRouter } from './routes/orders.routes';
import { reportsRouter } from './routes/reports.routes';
import { printersRouter } from './routes/printers.routes';
import { settingsRouter } from './routes/settings.routes';
import { stockRouter } from './routes/stock.routes';
import { tablesRouter } from './routes/tables.routes';
import { usersRouter } from './routes/users.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/tables', tablesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/kitchen', kitchenRouter);
  app.use('/api/discounts', discountsRouter);
  app.use('/api/stock', stockRouter);
  app.use('/api/expense-categories', expenseCategoryRouter);
  app.use('/api/expenses', expenseRouter);
  app.use('/api/debts', debtRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/printers', printersRouter);
  app.use('/api/users', usersRouter);

  app.use(errorHandler);
  return app;
}
