import { execSync } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

/** One migrated template database; each test file copies it. */
export default function setup(): void {
  const dir = join(__dirname, '.data');
  mkdirSync(dir, { recursive: true });
  const template = join(dir, 'template.db');
  rmSync(template, { force: true });
  execSync('pnpm exec prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${template}` },
    stdio: 'pipe',
  });
}
