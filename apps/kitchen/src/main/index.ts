import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { clearServerConfig, readServerConfig, writeServerConfig } from './server-config';

let mainWindow: BrowserWindow | null = null;

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
