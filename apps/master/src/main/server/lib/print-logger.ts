import { app } from 'electron';
import { createFileLogger } from '../../startup-log';
import type { StartupLogger } from '../../startup-log';

let _logger: StartupLogger | null = null;

function getLogger(): StartupLogger {
  if (!_logger) {
    _logger = createFileLogger(app.getPath('userData'), 'print.log', '--- print session ---');
  }
  return _logger;
}

export function initPrintLog(): void {
  getLogger();
}

export const printLog = {
  info(message: string): void {
    getLogger().info(message);
  },
  error(message: string): void {
    getLogger().error(message);
  },
};
