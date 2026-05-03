import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const stageDir = join(appDir, 'build', 'prisma-package');
const schemaPath = join(appDir, 'prisma', 'schema.prisma');
const requireFromApp = createRequire(join(appDir, 'package.json'));

function resolvePackagePath(specifier) {
  return requireFromApp.resolve(specifier);
}

function runPrismaGenerate() {
  const prismaCli = resolvePackagePath('prisma/build/index.js');
  const result = spawnSync(
    process.execPath,
    [prismaCli, 'generate', '--schema', schemaPath],
    {
      cwd: appDir,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureExists(pathToCheck, label) {
  if (!existsSync(pathToCheck)) {
    throw new Error(`Missing ${label}: ${pathToCheck}`);
  }
}

function prepareStageDir() {
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
}

function copyDir(sourceDir, targetDir) {
  cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    dereference: true,
  });
}

function main() {
  runPrismaGenerate();

  const prismaClientPackageDir = dirname(
    resolvePackagePath('@prisma/client/package.json'),
  );
  const generatedClientDir = join(
    prismaClientPackageDir,
    '..',
    '..',
    '.prisma',
    'client',
  );

  ensureExists(
    join(prismaClientPackageDir, 'default.js'),
    '@prisma/client/default.js',
  );
  ensureExists(
    join(prismaClientPackageDir, 'index.js'),
    '@prisma/client/index.js',
  );
  ensureExists(
    join(prismaClientPackageDir, 'runtime'),
    '@prisma/client/runtime',
  );
  ensureExists(
    join(generatedClientDir, 'default.js'),
    '.prisma/client/default.js',
  );

  const generatedFiles = readdirSync(generatedClientDir);
  const windowsEngine = generatedFiles.find(
    (file) => file === 'query_engine-windows.dll.node',
  );

  if (!windowsEngine) {
    throw new Error(
      `Missing Windows Prisma engine in ${generatedClientDir}. Expected query_engine-windows.dll.node after prisma generate.`,
    );
  }

  prepareStageDir();
  copyDir(
    prismaClientPackageDir,
    join(stageDir, 'node_modules', '@prisma', 'client'),
  );
  copyDir(
    generatedClientDir,
    join(stageDir, 'node_modules', '.prisma', 'client'),
  );

  console.log(`[prepare-prisma-package] staged Prisma artifacts in ${stageDir}`);
}

main();
