import { spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { app } from 'electron';
import { setupPrismaRuntime } from './prisma-runtime';
import type { StartupLogger } from './startup-log';

const requireFromHere = createRequire(__filename);
let bootstrapPromise: Promise<void> | null = null;

function toSqliteUrl(filePath: string): string {
  // file:///C:/path → file:C:/path (Prisma Windows SQLite format)
  // file:///home/user → file:/home/user (Prisma Unix SQLite format)
  return pathToFileURL(filePath).href.replace(/^file:\/\/\/([A-Za-z]:)/, 'file:$1');
}

function resolvePackagedSchemaPath(): string {
  return join(process.resourcesPath, 'prisma', 'schema.prisma');
}

function resolvePackagedSchemaEnginePath(): string {
  const enginesDir = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@prisma',
    'engines',
  );
  const engineFile = readdirSync(enginesDir).find((file) =>
    /^schema-engine-.*\.exe$/i.test(file),
  );

  if (!engineFile) {
    throw new Error(
      `Missing Prisma schema engine in ${enginesDir}. Expected schema-engine-*.exe.`,
    );
  }

  return join(enginesDir, engineFile);
}

function resolvePrismaCliPath(): string {
  return requireFromHere.resolve('prisma/build/index.js');
}

async function runPrismaMigrateDeploy(
  schemaPath: string,
  schemaEnginePath: string,
  logger: StartupLogger,
): Promise<void> {
  const prismaCliPath = resolvePrismaCliPath();
  const spawnCwd = dirname(schemaPath);
  const spawnArgs = [prismaCliPath, 'migrate', 'deploy', '--schema', schemaPath];

  logger.info(`spawn executable=${process.execPath}`);
  logger.info(`spawn args=${JSON.stringify(spawnArgs)}`);
  logger.info(`spawn cwd=${spawnCwd}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      spawnArgs,
      {
        cwd: spawnCwd,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          PRISMA_SCHEMA_ENGINE_BINARY: schemaEnginePath,
        },
        windowsHide: true,
      },
    );

    logger.info(`spawn child.pid=${child.pid ?? 'unknown'}`);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      logger.info(`[prisma migrate deploy stdout] ${text.trimEnd()}`);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      logger.error(`[prisma migrate deploy stderr] ${text.trimEnd()}`);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      logger.info(`spawn exit code=${code ?? 'unknown'}`);

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `prisma migrate deploy failed with exit code ${code ?? 'unknown'}.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
  });
}

export async function bootstrapPackagedWindowsSqlite(
  logger: StartupLogger,
): Promise<void> {
  if (bootstrapPromise) {
    logger.info('SQLite bootstrap already in progress or completed');
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    if (!(app.isPackaged && process.platform === 'win32')) {
      logger.info('Skipping SQLite bootstrap for non-packaged or non-Windows runtime');
      return;
    }

    logger.info('SQLite bootstrap begin');
    logger.info('production mode detected: packaged Windows startup');
    logger.info(`userData path: ${app.getPath('userData')}`);

    const schemaPath = resolvePackagedSchemaPath();
    logger.info(`resolving Prisma schema: ${schemaPath}`);
    if (!existsSync(schemaPath)) {
      throw new Error(`Missing packaged Prisma schema at ${schemaPath}`);
    }

    logger.info('resolving Prisma runtime paths');
    setupPrismaRuntime();

    logger.info('resolving Prisma schema engine');
    const schemaEnginePath = resolvePackagedSchemaEnginePath();
    logger.info(`schema engine found: ${schemaEnginePath}`);

    const dbDir = join(app.getPath('userData'), 'data');
    const dbPath = join(dbDir, 'master.sqlite');
    mkdirSync(dbDir, { recursive: true });

    logger.info(`SQLite directory ready: ${dbDir}`);
    process.env.DATABASE_URL = toSqliteUrl(dbPath);
    logger.info(`DATABASE_URL set to SQLite file path: ${dbPath}`);

    logger.info('running prisma migrate deploy');
    await runPrismaMigrateDeploy(schemaPath, schemaEnginePath, logger);
    logger.info('prisma migrate deploy success');

    logger.info('initializing Prisma');
    const { getPrisma } = await import('./server/lib/prisma');
    await getPrisma().$connect();
    logger.info('Prisma init success');
    logger.info('SQLite bootstrap success');
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });

  return bootstrapPromise;
}
