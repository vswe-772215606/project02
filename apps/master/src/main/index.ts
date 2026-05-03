import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { createServer } from 'http';

// Set Prisma env vars before any server module is loaded.
// electron-vite produces a CJS bundle where external requires are hoisted,
// so these are set as early as possible in the entry point.
if (app.isPackaged) {
  const unpackedRoot = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = join(unpackedRoot, '.prisma', 'client');
  process.env.PRISMA_SCHEMA_PATH = join(process.resourcesPath, 'prisma', 'schema.prisma');
}

// Server modules are required after env vars are set so that when @prisma/client
// initialises (on first getPrisma() call) the engine path is already in the env.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require('./server/app') as typeof import('./server/app');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { attachSocket } = require('./server/socket') as typeof import('./server/socket');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { settingsService } = require('./server/services/settings.service') as typeof import('./server/services/settings.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startScheduler } = require('./server/lib/scheduler') as typeof import('./server/lib/scheduler');

const PORT = parseInt(process.env.PORT ?? '4000', 10);

let mainWindow: BrowserWindow | null = null;

async function startServer(): Promise<void> {
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
  await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
