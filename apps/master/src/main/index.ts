import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { createServer } from 'http';
import { setupPrismaRuntime } from './prisma-runtime';
import { bootstrapPackagedWindowsSqlite } from './sqlite-bootstrap';
import { createStartupLogger, logProcessContext } from './startup-log';

const singleInstanceLockAcquired = app.requestSingleInstanceLock();
const logger = createStartupLogger(app.getPath('userData'));

logProcessContext(logger);
logger.info(`app.isPackaged=${app.isPackaged}`);
logger.info(`single-instance lock acquired=${singleInstanceLockAcquired}`);

if (!singleInstanceLockAcquired) {
  logger.info('No single-instance lock acquired, quitting duplicate process');
  app.quit();
}

const PORT = parseInt(process.env.PORT ?? '4000', 10);

let mainWindow: BrowserWindow | null = null;
let serverStartPromise: Promise<void> | null = null;
let startupPromise: Promise<void> | null = null;

async function startServer(): Promise<void> {
  if (serverStartPromise) {
    logger.info('startServer already in progress or completed');
    return serverStartPromise;
  }

  serverStartPromise = (async () => {
    logger.info('startServer begin');
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
        logger.info(`startServer listening port=${PORT}`);
        startScheduler();
        resolve();
      });
    });

    logger.info('startServer success');
  })().catch((error) => {
    serverStartPromise = null;
    throw error;
  });

  return serverStartPromise;
}

function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.info('createWindow skipped because window already exists');
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return;
  }

  logger.info('createWindow begin');
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

  mainWindow.on('closed', () => {
    logger.info('mainWindow closed');
    mainWindow = null;
  });

  logger.info('createWindow success');
}

function focusExistingWindow(): void {
  logger.info('second-instance event received');
  if (!mainWindow || mainWindow.isDestroyed()) {
    logger.info('No existing window to focus yet');
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

async function runStartup(): Promise<void> {
  if (startupPromise) {
    logger.info('startup already in progress or completed');
    return startupPromise;
  }

  startupPromise = (async () => {
    logger.info('startup sequence begin');
    logger.info('before SQLite bootstrap');
    await bootstrapPackagedWindowsSqlite(logger);
    logger.info('after SQLite bootstrap');

    logger.info('before startServer');
    await startServer();
    logger.info('after startServer');

    logger.info('before createWindow');
    createWindow();
    logger.info('after createWindow');
  })().catch((error) => {
    startupPromise = null;
    throw error;
  });

  return startupPromise;
}

if (singleInstanceLockAcquired) {
  setupPrismaRuntime();

  app.on('second-instance', () => {
    focusExistingWindow();
  });

  void app.whenReady().then(async () => {
    logger.info('app start');
    logger.info(`mode: ${app.isPackaged ? 'production' : 'development'}`);
    logger.info(`platform: ${process.platform}`);

    try {
      await runStartup();

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
}
