import { mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

export type StartupLogger = {
  readonly path: string;
  info(message: string): void;
  error(message: string): void;
};

function writeLine(path: string, level: 'INFO' | 'ERROR', message: string): void {
  appendFileSync(
    path,
    `${new Date().toISOString()} [${level}] ${message}\n`,
    'utf8',
  );
}

export function createStartupLogger(userDataPath: string): StartupLogger {
  const logDir = join(userDataPath, 'logs');
  mkdirSync(logDir, { recursive: true });

  const path = join(logDir, 'startup.log');

  writeLine(path, 'INFO', '--- application start ---');

  return {
    path,
    info(message: string) {
      writeLine(path, 'INFO', message);
    },
    error(message: string) {
      writeLine(path, 'ERROR', message);
    },
  };
}

export function logProcessContext(logger: StartupLogger): void {
  logger.info(`process.pid=${process.pid}`);
  logger.info(`process.ppid=${typeof process.ppid === 'number' ? process.ppid : 'n/a'}`);
  logger.info(`process.execPath=${process.execPath}`);
  logger.info(`process.cwd=${process.cwd()}`);
  logger.info(`process.resourcesPath=${process.resourcesPath}`);
}
