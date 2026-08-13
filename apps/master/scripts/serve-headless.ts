// Plain-Node entry that boots the master's HTTP+Socket.io server without
// Electron, for headless dev/CI use (Docker harness). Mirrors the relevant
// parts of src/main/index.ts's startServer(): default DATABASE_URL, load
// settings, create the Express app, attach Socket.io, listen.
//
// Deliberately skips everything Electron/desktop-specific that startServer
// also does — BrowserWindow, Telegram bot startup, mDNS advertise, the
// scheduler, and printer init — none of those are needed to serve the
// REST/socket API headlessly.
//
// Usage: pnpm exec tsx scripts/serve-headless.ts   (from apps/master/)
import { createServer } from 'http';
import { join } from 'path';

// Resolve relative to this file, not cwd, so it works no matter where the
// process is launched from (Docker WORKDIR, repo root, etc.).
if (!process.env.DATABASE_URL) {
  const dbPath = join(__dirname, '..', 'prisma', 'dev.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
}

const PORT = parseInt(process.env.PORT ?? '4000', 10);

async function main(): Promise<void> {
  const [{ createApp }, { attachSocket }, { settingsService }] = await Promise.all([
    import('../src/main/server/app'),
    import('../src/main/server/socket'),
    import('../src/main/server/services/settings.service'),
  ]);

  await settingsService.loadAll();
  const expressApp = createApp();
  const httpServer = createServer(expressApp);
  attachSocket(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[serve-headless] listening on :${PORT}`);
      resolve();
    });
  });
}

main().catch((error: unknown) => {
  console.error('[serve-headless] FAILED:', error);
  process.exit(1);
});
