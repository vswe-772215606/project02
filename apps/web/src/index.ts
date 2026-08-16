import { createServer } from 'http';
import { defaultDistDir, serveAdminUi } from './static';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const { createApp, attachSocket, settingsService } = await import('@chayxana/server');

  await settingsService.loadAll();

  const app = createApp();
  serveAdminUi(app, process.env.ADMIN_UI_DIST ?? defaultDistDir());

  const httpServer = createServer(app);
  attachSocket(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[web] listening on :${PORT}`);
      resolve();
    });
  });
}

main().catch((error: unknown) => {
  console.error('[web] FAILED:', error);
  process.exit(1);
});
