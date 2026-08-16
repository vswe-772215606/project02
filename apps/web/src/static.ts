import { existsSync } from 'fs';
import { join, resolve } from 'path';
import express, { type Express } from 'express';

/**
 * Serve the admin SPA from the same origin as the API.
 *
 * Mount order matters and is the whole point of this module: the catch-all that
 * returns index.html must run AFTER every API router, or it swallows unmatched
 * /api paths and turns a 404 into an HTML page. Socket.io attaches to the HTTP
 * server rather than to Express, so it is unaffected either way.
 */
export function serveAdminUi(app: Express, distDir: string): void {
  if (!existsSync(join(distDir, 'index.html'))) {
    console.warn(`[web] admin UI not built at ${distDir} — API only`);
    return;
  }

  app.use(express.static(distDir, { index: false }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(join(distDir, 'index.html'));
  });
}

export function defaultDistDir(): string {
  return resolve(__dirname, '..', '..', '..', 'packages', 'admin-ui', 'dist');
}
