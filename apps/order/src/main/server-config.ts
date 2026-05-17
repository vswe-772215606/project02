import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

interface ServerConfig {
  masterBaseUrl: string;
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'server-config.json');
}

export function readServerConfig(): { masterBaseUrl: string | null } {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return { masterBaseUrl: null };
  }

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as ServerConfig;
    if (typeof parsed.masterBaseUrl === 'string' && parsed.masterBaseUrl.length > 0) {
      return { masterBaseUrl: parsed.masterBaseUrl };
    }
  } catch {
    // Invalid config should behave like no configured server.
  }

  return { masterBaseUrl: null };
}

export function writeServerConfig(masterBaseUrl: string): void {
  const path = getConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ masterBaseUrl }, null, 2), 'utf8');
}

export function clearServerConfig(): void {
  const path = getConfigPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
