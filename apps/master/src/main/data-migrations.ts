import type { PrismaClient } from '@prisma/client';

type StartupLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

/**
 * Optional, idempotent data-migration hook. Invoked once at startup (see
 * index.ts) AFTER the SQLite schema is in sync, BEFORE the server starts.
 *
 * Schema-shape changes are handled by Prisma migrations; this hook is for
 * one-off DATA backfills/cleanups that must run against existing installs
 * (e.g. populating a new column for historical rows). Every step must be
 * idempotent and non-fatal — the caller wraps this in try/catch and only
 * logs failures, so a bad migration never blocks boot.
 *
 * There are no pending data migrations, so this is currently a no-op. Add
 * steps here as needed; keep them safe to re-run on every launch.
 */
export async function runDataMigrations(
  _prisma: PrismaClient,
  logger: StartupLogger,
): Promise<void> {
  logger.info('data-migrations: no pending migrations');
}
