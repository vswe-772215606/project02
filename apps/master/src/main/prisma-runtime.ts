import { app } from 'electron';
import { readdirSync } from 'fs';
import Module from 'module';
import { delimiter, join } from 'path';

let prismaRuntimeConfigured = false;

function configureNodePath(unpackedNodeModules: string): void {
  const nodePathEntries = new Set(
    (process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean),
  );

  nodePathEntries.add(unpackedNodeModules);
  process.env.NODE_PATH = Array.from(nodePathEntries).join(delimiter);

  const moduleWithInitPaths = Module as typeof Module & {
    _initPaths?: () => void;
  };

  moduleWithInitPaths._initPaths?.();
}

function findPackagedEngine(clientDir: string): string | null {
  try {
    const files = readdirSync(clientDir);

    return (
      files.find((file) => file === 'query_engine-windows.dll.node') ??
      files.find((file) => file.endsWith('.node')) ??
      null
    );
  } catch {
    return null;
  }
}

export function getPackagedPrismaClientDir(): string {
  return join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '.prisma',
    'client',
  );
}

export function setupPrismaRuntime(): void {
  // No-op outside packaged Electron. `app` is undefined when running under
  // tsx / node (smoke scripts), so the old `!app.isPackaged` check threw a
  // TypeError. Guard it so any non-Electron entrypoint goes through the
  // generated client's default resolution.
  if (prismaRuntimeConfigured) return;
  if (!app || typeof app.isPackaged === 'undefined' || !app.isPackaged) {
    prismaRuntimeConfigured = true;
    return;
  }

  const unpackedNodeModules = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
  );
  const clientDir = getPackagedPrismaClientDir();

  configureNodePath(unpackedNodeModules);

  const engineFile = findPackagedEngine(clientDir);
  if (engineFile) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = join(clientDir, engineFile);
  }

  process.env.PRISMA_SCHEMA_PATH = join(
    process.resourcesPath,
    'prisma',
    'schema.prisma',
  );

  prismaRuntimeConfigured = true;
}
