import { Router } from 'express';
import { networkInterfaces } from 'os';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

healthRouter.get('/server-info', (_req, res) => {
  const port = parseInt(process.env.PORT ?? '4000', 10);
  const nets = networkInterfaces();
  const lanIps: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIps.push(iface.address);
      }
    }
  }
  res.json({ port, lanIps });
});
