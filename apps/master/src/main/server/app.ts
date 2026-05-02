import cors from 'cors';
import express, { Express } from 'express';
import { healthRouter } from './routes/health.routes';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/health', healthRouter);
  return app;
}
