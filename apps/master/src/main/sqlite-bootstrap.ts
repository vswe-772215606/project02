import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { app } from 'electron';
import Database from 'better-sqlite3';
import { setupPrismaRuntime } from './prisma-runtime';
import type { StartupLogger } from './startup-log';

let bootstrapPromise: Promise<void> | null = null;

function toSqliteUrl(filePath: string): string {
  // file:///C:/path → file:C:/path (Prisma Windows SQLite format)
  // file:///home/user → file:/home/user (Prisma Unix SQLite format)
  return pathToFileURL(filePath).href.replace(/^file:\/\/\/([A-Za-z]:)/, 'file:$1');
}

function computeChecksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

function applyMigrationsInProcess(
  dbPath: string,
  migrationsDir: string,
  logger: StartupLogger,
): void {
  const DatabaseCtor = (Database as unknown as { default?: typeof Database }).default ?? Database;
  const db = new DatabaseCtor(dbPath);

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _app_migrations (
        id   TEXT PRIMARY KEY,
        checksum   TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    logger.info(`found ${migrationDirs.length} migration(s) in ${migrationsDir}`);

    const getRow = db.prepare('SELECT checksum FROM _app_migrations WHERE id = ?');
    const insertRow = db.prepare(
      'INSERT INTO _app_migrations (id, checksum) VALUES (?, ?)',
    );

    for (const migrationId of migrationDirs) {
      const sqlPath = join(migrationsDir, migrationId, 'migration.sql');
      if (!existsSync(sqlPath)) {
        logger.info(`migration ${migrationId}: no migration.sql, skipping`);
        continue;
      }

      const sql = readFileSync(sqlPath, 'utf8');
      const checksum = computeChecksum(sql);
      const existing = getRow.get(migrationId) as { checksum: string } | undefined;

      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for "${migrationId}". ` +
            `Applied checksum: ${existing.checksum}. ` +
            `Current checksum: ${checksum}. ` +
            `Do not modify previously applied migrations.`,
          );
        }
        logger.info(`migration ${migrationId}: skipped (already applied)`);
        continue;
      }

      logger.info(`migration ${migrationId}: applying`);
      db.exec(sql);
      insertRow.run(migrationId, checksum);
      logger.info(`migration ${migrationId}: applied`);
    }
  } finally {
    db.close();
  }
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
    logger.info(`userData path: ${app.getPath('userData')}`);

    setupPrismaRuntime();

    const dbDir = join(app.getPath('userData'), 'data');
    const dbPath = join(dbDir, 'master.sqlite');
    mkdirSync(dbDir, { recursive: true });
    logger.info(`SQLite directory ready: ${dbDir}`);

    process.env.DATABASE_URL = toSqliteUrl(dbPath);
    logger.info(`DATABASE_URL set: ${process.env.DATABASE_URL}`);

    const migrationsDir = join(process.resourcesPath, 'prisma', 'migrations');
    logger.info(`migrations dir: ${migrationsDir}`);
    if (!existsSync(migrationsDir)) {
      throw new Error(`Missing packaged migrations directory at ${migrationsDir}`);
    }

    logger.info('running in-process SQLite migrations');
    applyMigrationsInProcess(dbPath, migrationsDir, logger);
    logger.info('in-process migrations complete');

    logger.info('initializing Prisma Client');
    const { getPrisma } = await import('./server/lib/prisma');
    await getPrisma().$connect();
    logger.info('Prisma Client ready');
    logger.info('SQLite bootstrap success');
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });

  return bootstrapPromise;
}
