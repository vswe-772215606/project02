import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createServer } from 'http';
import { setupPrismaRuntime } from './prisma-runtime';
import { advertiseMasterMdns, stopAdvertising } from './mdns-advertise';

// Load apps/master/.env in dev so the Prisma client (which validates
// DATABASE_URL eagerly) sees the connection string. In packaged builds
// sqlite-bootstrap.ts sets DATABASE_URL programmatically, so this is a
// no-op there. Tiny inline parser — no dotenv dep needed.
(function loadDotEnvForDev() {
  if (app.isPackaged) return;
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(__dirname, '..', '..', '.env'),
    resolve(__dirname, '..', '..', '..', '.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
})();
import { bootstrapPackagedWindowsSqlite } from './sqlite-bootstrap';
import { saveFinancePdf } from './print-pdf';
import {
  createFileLogger,
  createStartupLogger,
  formatErrorForLog,
  installConsoleCapture,
  logProcessContext,
} from './startup-log';

const singleInstanceLockAcquired = app.requestSingleInstanceLock();
const logger = createStartupLogger(app.getPath('userData'));
const runtimeLogger = createFileLogger(
  app.getPath('userData'),
  'runtime.log',
  '--- runtime diagnostics session ---',
);
const rendererLogger = createFileLogger(
  app.getPath('userData'),
  'renderer.log',
  '--- renderer diagnostics session ---',
);

installConsoleCapture(runtimeLogger);
logProcessContext(logger);
logger.info(`app.isPackaged=${app.isPackaged}`);
logger.info(`single-instance lock acquired=${singleInstanceLockAcquired}`);

process.on('uncaughtException', (error) => {
  logger.error(`uncaughtException: ${formatErrorForLog(error)}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`unhandledRejection: ${formatErrorForLog(reason)}`);
});

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
      { telegramBotService },
    ] = await Promise.all([
      import('./server/app'),
      import('./server/socket'),
      import('./server/services/settings.service'),
      import('./server/lib/scheduler'),
      import('./server/services/telegram-bot.service'),
    ]);

    await settingsService.loadAll();
    const expressApp = createApp();
    const httpServer = createServer(expressApp);
    attachSocket(httpServer);
    
    // Start bot in background to not block UI/Server startup
    telegramBotService.start().catch((err) => {
      logger.error(`[TelegramBot] Startup failed: ${err.message}`);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`[master] HTTP+WS listening on 0.0.0.0:${PORT}`);
        logger.info(`startServer listening port=${PORT}`);
        startScheduler();
        resolve();
      });
    });

    // Best-effort LAN discovery: advertise via mDNS so order desktops and
    // mobile clients find us without hardcoded IPs. Non-blocking; failures
    // are logged but don't affect the server.
    void advertiseMasterMdns({ port: PORT, logger });

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

  // Dev mode: load from the electron-vite renderer dev server. Production
  // (packaged app): load the bundled HTML. `app.isPackaged` is the reliable
  // signal — electron-vite does not always inject NODE_ENV at runtime.
  if (!app.isPackaged) {
    const devUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173/';
    logger.info(`loading renderer from dev server: ${devUrl}`);
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    rendererLogger.info(`did-finish-load url=${mainWindow?.webContents.getURL() ?? 'unknown'}`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    rendererLogger.error(
      `did-fail-load code=${errorCode} mainFrame=${String(isMainFrame)} url=${validatedURL} description=${errorDescription}`,
    );
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    rendererLogger.error(
      `render-process-gone reason=${details.reason} exitCode=${details.exitCode}`,
    );
  });

  mainWindow.webContents.on('unresponsive', () => {
    rendererLogger.error('window became unresponsive');
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const origin = sourceId ? `${sourceId}:${line}` : `line=${line}`;
    if (level >= 2) {
      rendererLogger.error(`${origin} ${message}`);
      return;
    }

    rendererLogger.info(`${origin} ${message}`);
  });

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

  ipcMain.handle('finance:save-pdf', async (event, payload: { defaultName: string; title?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { saved: false, error: 'no-window' };
    }
    return saveFinancePdf({
      window: win,
      defaultName: payload?.defaultName ?? 'chayxana-moliyaviy.pdf',
      title: payload?.title,
    });
  });

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

  app.on('will-quit', () => {
    void stopAdvertising();
  });
}
