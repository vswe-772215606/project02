import { PrismaClient } from '@prisma/client';
import { app } from 'electron';
import { join } from 'path';
import { readdirSync } from 'fs';

function setupPrismaEnv(): void {
  if (!app.isPackaged) return;

  const clientDir = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '.prisma',
    'client',
  );

  try {
    const files = readdirSync(clientDir);
    const nodeFile = files.find((f) => f.endsWith('.node'));
    if (nodeFile) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = join(clientDir, nodeFile);
    }
  } catch {
    // dev mode — unpacked path does not exist
  }

  process.env.PRISMA_SCHEMA_PATH = join(
    process.resourcesPath,
    'prisma',
    'schema.prisma',
  );
}

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    setupPrismaEnv();
    prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }

  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
