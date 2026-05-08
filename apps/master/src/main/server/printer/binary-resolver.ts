import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { printLog } from '../lib/print-logger';

const BINARY_NAME = 'receipt.exe';

function userDataBinPath(): string {
  return join(app.getPath('userData'), 'bin', BINARY_NAME);
}

function candidates(): string[] {
  const out: string[] = [];
  // userData copy is persistent — survives portable re-extraction into same temp dir
  out.push(userDataBinPath());
  if (app.isPackaged) {
    out.push(join(process.resourcesPath, 'bin', BINARY_NAME));
  }
  out.push(join(app.getAppPath(), 'resources', 'bin', BINARY_NAME));
  out.push(join(__dirname, '..', '..', '..', 'resources', 'bin', BINARY_NAME));
  return out;
}

export function ensurePrinterBinary(): void {
  if (process.platform !== 'win32') return;

  const source = join(process.resourcesPath, 'bin', BINARY_NAME);
  if (!existsSync(source)) {
    printLog.error(`[binary-resolver] source binary missing at startup: ${source}`);
    return;
  }

  const dest = userDataBinPath();
  try {
    mkdirSync(join(app.getPath('userData'), 'bin'), { recursive: true });
    copyFileSync(source, dest);
    printLog.info(`[binary-resolver] binary copied to userData: ${dest}`);
  } catch (err) {
    printLog.error(`[binary-resolver] failed to copy binary to userData: ${err}`);
  }
}

export function resolveBinaryPath(): string | null {
  const checked: string[] = [];
  for (const candidate of candidates()) {
    if (existsSync(candidate)) {
      printLog.info(`[binary-resolver] found: ${candidate}`);
      return candidate;
    }
    checked.push(candidate);
  }
  printLog.error(`[binary-resolver] not found, tried:\n  ${checked.join('\n  ')}`);
  return null;
}
