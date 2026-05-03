import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { createServer } from 'http';
import { setupPrismaRuntime } from './prisma-runtime';
import { bootstrapPackagedWindowsSqlite } from './sqlite-bootstrap';
import { createStartupLogger } from './startup-log';

setupPrismaRuntime();

const PORT = parseInt(process.env.PORT ?? '4000', 10);

let mainWindow: BrowserWindow | null = null;

async function startServer(): Promise<void> {
  const [
    { createApp },
    { attachSocket },
    { settingsService },
    { startScheduler },
  ] = await Promise.all([
    import('./server/app'),
    import('./server/socket'),
    import('./server/services/settings.service'),
    import('./server/lib/scheduler'),
  ]);

  await settingsService.loadAll();
  const expressApp = createApp();
  const httpServer = createServer(expressApp);
  attachSocket(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[master] HTTP+WS listening on 0.0.0.0:${PORT}`);
      startScheduler();
      resolve();
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development' && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(async () => {
  const logger = createStartupLogger(app.getPath('userData'));

  logger.info('app start');
  logger.info(`mode: ${app.isPackaged ? 'production' : 'development'}`);
  logger.info(`platform: ${process.platform}`);

  try {
    await bootstrapPackagedWindowsSqlite(logger);

    logger.info('starting server');
    await startServer();
    logger.info('server start success');

    logger.info('creating Electron window');
    createWindow();
    logger.info('window created');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        logger.info('recreating Electron window on activate');
        createWindow();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`startup failure: ${message}`);

    if (app.isPackaged) {
      dialog.showErrorBox(
        'Startup failed',
        `The app could not start.\n\n${message}\n\nSee startup log:\n${logger.path}`,
      );
    }

    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
