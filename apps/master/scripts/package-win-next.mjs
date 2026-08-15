#!/usr/bin/env node
/**
 * Build the side-by-side Windows installer, "Chayxana Master (Yangi)".
 *
 * Exists as a script rather than an npm-script one-liner because the two steps
 * have to agree on one environment variable, and `VAR=value cmd` is a POSIX
 * shell-ism — it does not work in cmd.exe or PowerShell, which is what the
 * `windows-latest` CI runner and a Windows dev box actually use.
 *
 * The pairing is load-bearing:
 *
 *   CHAYXANA_VARIANT=next   → electron.vite.config.ts bakes the variant into
 *                             the main bundle, so the app renames itself at
 *                             runtime and therefore uses its OWN userData
 *                             directory — its own database.
 *   electron-builder.next.js → appId, product name, install directory,
 *                             shortcut, artifact name and firewall rule.
 *
 * Setting only the second would produce an app that installs to its own folder
 * and then opens the production database. See src/main/app-identity.ts.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, CHAYXANA_VARIANT: 'next' };

function run(command, args) {
  console.log(`\n[package:win:next] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: appDir,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`[package:win:next] failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log('[package:win:next] variant=next — installs beside a production till, own database, port 4100');

run('node', ['./scripts/prepare-prisma-package.mjs']);
run('pnpm', ['exec', 'electron-vite', 'build']);
run('pnpm', ['exec', 'electron-builder', '--win', '--x64', '--config', 'electron-builder.next.js']);

console.log('\n[package:win:next] done — see apps/master/dist');
