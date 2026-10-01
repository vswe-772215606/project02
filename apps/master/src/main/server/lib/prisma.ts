import { PrismaClient } from '@prisma/client';
import { setupPrismaRuntime } from '../../prisma-runtime';
import { singleConnectionUrl } from './sqlite-url';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    setupPrismaRuntime();
    const url = singleConnectionUrl(process.env.DATABASE_URL);
    prisma = new PrismaClient({
      ...(url ? { datasourceUrl: url } : {}),
      // One connection means a $transaction waits for it. Prisma's default
      // maxWait of 2 s would turn that wait into P2028 (a 500); 10 s is what
      // confirm already asks for.
      transactionOptions: { maxWait: 10_000 },
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
    // Once per process, so a till's log shows the limit is on (PRD 14 G7). On
    // a packaged build console output lands in <userData>/logs/runtime.log.
    console.log(`[prisma] client created: one SQLite connection (${url ?? 'DATABASE_URL not set'})`);
  }

  return prisma;
}

export async function connectPrisma(): Promise<PrismaClient> {
  const client = getPrisma();
  await client.$connect();
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
