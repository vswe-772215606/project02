import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { printLog } from '../lib/print-logger';

const BINARY_NAME = 'receipt.exe';

function candidates(): string[] {
  const out: string[] = [];
  if (app.isPackaged) {
    out.push(join(process.resourcesPath, 'bin', BINARY_NAME));
  }
  out.push(join(app.getAppPath(), 'resources', 'bin', BINARY_NAME));
  out.push(join(__dirname, '..', '..', '..', 'resources', 'bin', BINARY_NAME));
  return out;
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
