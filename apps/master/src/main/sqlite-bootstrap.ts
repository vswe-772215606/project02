import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { app } from 'electron';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import { setupPrismaRuntime } from './prisma-runtime';
import type { StartupLogger } from './startup-log';

let bootstrapPromise: Promise<void> | null = null;

const localRequire = createRequire(__filename);

function toSqliteUrl(filePath: string): string {
  // file:///C:/path → file:C:/path (Prisma Windows SQLite format)
  // file:///home/user → file:/home/user (Prisma Unix SQLite format)
  return pathToFileURL(filePath).href.replace(/^file:\/\/\/([A-Za-z]:)/, 'file:$1');
}

function computeChecksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function applyMigrationsInProcess(
  dbPath: string,
  migrationsDir: string,
  logger: StartupLogger,
): Promise<void> {
  // Locate the sql.js WASM file alongside the package entry.
  // Electron's patched fs reads it correctly from inside the asar.
  const sqlJsEntry = localRequire.resolve('sql.js');
  const SQL = await initSqlJs({
    locateFile: (filename: string) => join(dirname(sqlJsEntry), filename),
  });

  const dbBuf = existsSync(dbPath) ? readFileSync(dbPath) : null;
  const db = new SQL.Database(dbBuf ? new Uint8Array(dbBuf) : undefined);
  let dirty = false;

  try {
    const hasTable = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='_app_migrations'`,
    ).length > 0;

    if (!hasTable) {
      db.run(`
        CREATE TABLE _app_migrations (
          id         TEXT PRIMARY KEY,
          checksum   TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      dirty = true;
    }

    const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    logger.info(`found ${migrationDirs.length} migration(s) in ${migrationsDir}`);

    for (const migrationId of migrationDirs) {
      const sqlPath = join(migrationsDir, migrationId, 'migration.sql');
      if (!existsSync(sqlPath)) {
        logger.info(`migration ${migrationId}: no migration.sql, skipping`);
        continue;
      }

      const migrationSql = readFileSync(sqlPath, 'utf8');
      const checksum = computeChecksum(migrationSql);

      const stmt = db.prepare('SELECT checksum FROM _app_migrations WHERE id = ?');
      stmt.bind([migrationId]);
      const hasRow = stmt.step();
      const existingChecksum = hasRow ? (stmt.getAsObject()['checksum'] as string) : undefined;
      stmt.free();

      if (existingChecksum !== undefined) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Migration checksum mismatch for "${migrationId}". ` +
            `Applied: ${existingChecksum}. Current: ${checksum}. ` +
            `Do not modify previously applied migrations.`,
          );
        }
        logger.info(`migration ${migrationId}: skipped (already applied)`);
        continue;
      }

      logger.info(`migration ${migrationId}: applying`);
      db.exec(migrationSql);
      db.run('INSERT INTO _app_migrations (id, checksum) VALUES (?, ?)', [migrationId, checksum]);
      dirty = true;
      logger.info(`migration ${migrationId}: applied`);
    }

    if (dirty) {
      const data = db.export();
      writeFileSync(dbPath, Buffer.from(data));
      logger.info('database written to disk');
    }
  } finally {
    db.close();
  }
}

async function seedIfEmpty(logger: StartupLogger): Promise<void> {
  const { getPrisma } = await import('./server/lib/prisma');
  const prisma = getPrisma();

  const count = await prisma.user.count();
  if (count > 0) {
    logger.info('seed: users already present, skipping');
    return;
  }

  logger.info('seed: empty database detected, seeding initial data');

  const hash = (plain: string) => bcrypt.hash(plain, 10);

  await prisma.user.createMany({
    data: [
      {
        id: 'seed-owner',
        username: 'owner',
        passwordHash: await hash('owner123'),
        fullName: 'Owner',
        role: 'OWNER',
        isActive: true,
        failedLogins: 0,
      },
      {
        id: 'seed-admin',
        username: 'admin',
        passwordHash: await hash('admin123'),
        fullName: 'Admin',
        role: 'ADMIN',
        isActive: true,
        failedLogins: 0,
      },
    ],
  });

  await prisma.setting.createMany({
    data: [
      { key: 'max_discount_percent',  value: '15' },
      { key: 'max_discount_amount',   value: '100000' },
      { key: 'admin_printer_name',    value: 'POS-80' },
      { key: 'store_heading',         value: 'Chayxana' },
      { key: 'variance_alert_threshold',    value: '50000' },
      { key: 'monthly_kitchen_overhead_uzs', value: '0' },
      { key: 'system_costing_active_since', value: '' },
    ],
  });

  await prisma.expenseCategory.createMany({
    data: [
      { id: 'seed-cat-ingredients', name: 'Mahsulot xaridi', displayOrder: 1, isActive: true },
      { id: 'seed-cat-operational', name: 'Operatsion',      displayOrder: 2, isActive: true },
    ],
  });

  logger.info('seed: initial data inserted (owner / owner123, admin / admin123)');
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
    await applyMigrationsInProcess(dbPath, migrationsDir, logger);
    logger.info('in-process migrations complete');

    logger.info('initializing Prisma Client');
    const { getPrisma } = await import('./server/lib/prisma');
    await getPrisma().$connect();
    logger.info('Prisma Client ready');

    await seedIfEmpty(logger);
    logger.info('SQLite bootstrap success');
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });

  return bootstrapPromise;
}
