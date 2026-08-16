import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma configuration for the Chayxana database package.
 *
 * This replaces the `prisma` block in package.json, which Prisma 6.19 deprecates
 * and removes in 7. The seed command moves under `migrations` — `prisma migrate
 * reset` and `prisma db seed` both read it from here.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
