import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function listWindows(): Promise<string[]> {
  const { stdout } = await execFileAsync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
    { timeout: 8000, windowsHide: true },
  );
  return stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

async function listCups(): Promise<string[]> {
  const { stdout } = await execFileAsync('lpstat', ['-a'], { timeout: 5000 });
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(' ')[0].trim())
    .filter(Boolean);
}

export const printersService = {
  async list(): Promise<string[]> {
    try {
      if (process.platform === 'win32') {
        return await listWindows();
      }
      if (process.platform === 'linux' || process.platform === 'darwin') {
        return await listCups();
      }
    } catch {
      // ignored — unavailable printers service or unsupported platform
    }
    return [];
  },
};
