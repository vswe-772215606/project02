import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/requireAuth';
import { ipRateLimit } from '../middleware/rateLimit';

export const authRouter = Router();

authRouter.post('/login', authController.login);
authRouter.post('/login-pin', ipRateLimit({ windowMs: 60_000, max: 30 }), authController.loginPin);
authRouter.post('/logout', requireAuth, authController.logout);
authRouter.get('/me', requireAuth, authController.me);
