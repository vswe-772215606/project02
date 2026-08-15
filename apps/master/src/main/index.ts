import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createServer } from 'http';
import { setupPrismaRuntime } from './prisma-runtime';
import { advertiseMasterMdns, stopAdvertising } from './mdns-advertise';
import { APP_IDENTITY } from './app-identity';

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
import { generateDailyReportPdf } from './pdf-report';
import {
  createFileLogger,
  createStartupLogger,
  formatErrorForLog,
  installConsoleCapture,
  logProcessContext,
} from './startup-log';

// Force Chromium's UI locale to ru-RU so `<input type="date">` renders
// DD.MM.YYYY (matching Tashkent / Uzbek convention) instead of falling back
// to en-US mm/dd/yyyy on hosts where the system locale is English. Must be
// called BEFORE app.whenReady(). The page itself is still Uzbek; only the
// native picker chrome is affected.
app.commandLine.appendSwitch('lang', 'ru-RU');

// MUST run before anything reads `userData` or takes the single-instance lock,
// because both are derived from the app name. Everything below this line —
// the loggers, the lock, and above all the SQLite database in
// `<userData>/data` — lands in a different directory depending on it.
//
// `production` deliberately does not call this: leaving Electron's default in
// place is what keeps an upgrade pointed at the database the existing install
// already has. Only a side-by-side variant renames itself. See
// `app-identity.ts` for why `build.productName` cannot do this job.
if (APP_IDENTITY.appName !== null) {
  app.setName(APP_IDENTITY.appName);
}

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

const PORT = parseInt(process.env.PORT ?? String(APP_IDENTITY.port), 10);

logger.info(`variant=${APP_IDENTITY.variant} label="${APP_IDENTITY.label}" port=${PORT}`);
logger.info(`app.getName()=${app.getName()}`);
logger.info(`userData=${app.getPath('userData')}`);

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

    await new Promise<void>((resolve, reject) => {
      // A bind failure used to have no handler at all, so this promise simply
      // never settled: `createWindow()` was never reached and the machine the
      // chayxana depends on sat showing nothing, with no dialog and no clue.
      // Most likely cause is another copy of this server already on the port —
      // which side-by-side installs make routine, so it has to surface.
      httpServer.once('error', (error: NodeJS.ErrnoException) => {
        const detail =
          error.code === 'EADDRINUSE'
            ? `Port ${PORT} band — boshqa dastur (ehtimol Chayxana Master'ning boshqa nusxasi) uni egallab turibdi.`
            : error.message;
        logger.error(`startServer listen failed on port ${PORT}: ${formatErrorForLog(error)}`);
        reject(new Error(detail));
      });

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

    // Data migrations run after schema is in sync. Idempotent and
    // non-fatal — failures land in startup.log but don't block boot.
    logger.info('before data migrations');
    try {
      const { runDataMigrations } = await import('./data-migrations');
      const { getPrisma } = await import('./server/lib/prisma');
      await runDataMigrations(getPrisma(), logger);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`data-migrations import failed: ${msg}`);
    }
    logger.info('after data migrations');

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

  /**
   * Generate a structured daily PDF report (pdfkit, server-side data) instead
   * of capturing the rendered DOM. This is the canonical export — it's
   * paginated, precise, includes every section, and stays consistent even if
   * the on-screen layout changes.
   */
  ipcMain.handle('reports:save-daily-pdf', async (event, payload: { date: string; defaultName?: string; title?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { saved: false, error: 'no-window' as const };
    }
    if (!payload?.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
      return { saved: false, error: 'invalid-date' as const };
    }
    const { dialog } = await import('electron');
    const { homedir } = await import('os');
    const { join } = await import('path');
    const initialPath = join(homedir(), 'Documents', payload.defaultName ?? `chayxana-moliyaviy-${payload.date}.pdf`);
    const result = await dialog.showSaveDialog(win, {
      title: payload.title ?? 'Kunlik hisobotni PDF saqlash',
      defaultPath: initialPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) {
      return { saved: false, canceled: true as const };
    }
    try {
      // Parse YYYY-MM-DD as local-time midnight so the day boundaries match
      // what the renderer/reports service expect for daily aggregations.
      const [y, m, d] = payload.date.split('-').map(Number);
      const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
      runtimeLogger.info(`[pdf-report] start date=${payload.date} out=${result.filePath}`);
      await generateDailyReportPdf({ date, outputPath: result.filePath });
      const { statSync } = await import('fs');
      const size = statSync(result.filePath).size;
      runtimeLogger.info(`[pdf-report] wrote ${size} bytes`);
      if (size < 200) {
        return { saved: false, error: `PDF empty (${size} bytes) — see runtime.log for details` } as const;
      }
      return { saved: true, filePath: result.filePath } as const;
    } catch (err) {
      const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      runtimeLogger.error(`[pdf-report] FAILED: ${message}`);
      return { saved: false, error: message } as const;
    }
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
