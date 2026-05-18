import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { clearServerConfig, readServerConfig, writeServerConfig } from './server-config';
import { getDiscoveredMasterUrl, startDiscovery, stopDiscovery, waitForDiscoveredMasterUrl } from './mdns-discover';

const logger = {
  info: (m: string) => console.log(m),
  error: (m: string) => console.error(m),
};

let mainWindow: BrowserWindow | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

ipcMain.handle('config:get-master-url', () => readServerConfig().masterBaseUrl);
ipcMain.handle('config:set-master-url', (_event, url: string) => {
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('Invalid URL');
  }

  writeServerConfig(url);
  return true;
});
ipcMain.handle('config:clear-master-url', () => {
  clearServerConfig();
  return true;
});

// mDNS discovery — returns the last seen master URL (if any).
ipcMain.handle('discovery:get-master-url', () => getDiscoveredMasterUrl());

// Wait up to `timeoutMs` for a master to be discovered. Resolves with the URL
// or null on timeout. Used by MasterUrlProvider on initial app load.
ipcMain.handle('discovery:wait-for-master-url', (_event, timeoutMs: number) =>
  waitForDiscoveredMasterUrl(typeof timeoutMs === 'number' ? timeoutMs : 5000),
);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    fullscreen: process.env.NODE_ENV === 'production',
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

void app.whenReady().then(() => {
  void startDiscovery(logger);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopDiscovery();
});
