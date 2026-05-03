import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { createServer } from 'http';
import { createApp } from './server/app';
import { attachSocket } from './server/socket';
import { settingsService } from './server/services/settings.service';
import { startScheduler } from './server/lib/scheduler';

// Belt-and-suspenders: also set in prisma.ts before new PrismaClient(), but
// setting here ensures the env is visible to any code path that checks it early.
if (app.isPackaged) {
  const unpackedRoot = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = join(unpackedRoot, '.prisma', 'client');
  process.env.PRISMA_SCHEMA_PATH = join(process.resourcesPath, 'prisma', 'schema.prisma');
}

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
