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

function ensureLogDir(userDataPath: string): string {
  const logDir = join(userDataPath, 'logs');
  mkdirSync(logDir, { recursive: true });
  return logDir;
}

export function createFileLogger(
  userDataPath: string,
  fileName: string,
  sessionBanner?: string,
): StartupLogger {
  const logDir = ensureLogDir(userDataPath);
  const path = join(logDir, fileName);

  if (sessionBanner) {
    writeLine(path, 'INFO', sessionBanner);
  }

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

export function createStartupLogger(userDataPath: string): StartupLogger {
  return createFileLogger(userDataPath, 'startup.log', '--- application start ---');
}

export function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ? error.stack : `${error.name}: ${error.message}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function formatConsoleArgs(args: unknown[]): string {
  return args.map((arg) => formatErrorForLog(arg)).join(' ');
}

export function installConsoleCapture(logger: StartupLogger): void {
  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    logger.info(`[console.log] ${formatConsoleArgs(args)}`);
    originalLog(...args);
  };

  console.warn = (...args: unknown[]) => {
    logger.error(`[console.warn] ${formatConsoleArgs(args)}`);
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    logger.error(`[console.error] ${formatConsoleArgs(args)}`);
    originalError(...args);
  };
}

export function logProcessContext(logger: StartupLogger): void {
  logger.info(`process.pid=${process.pid}`);
  logger.info(`process.ppid=${typeof process.ppid === 'number' ? process.ppid : 'n/a'}`);
  logger.info(`process.execPath=${process.execPath}`);
  logger.info(`process.cwd=${process.cwd()}`);
  logger.info(`process.resourcesPath=${process.resourcesPath}`);
}
