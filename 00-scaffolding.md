# Phase 01-master / 00 — Scaffolding

**Goal:** create the monorepo, scaffold the Master Electron app, get a `GET /health` endpoint reachable from the Electron renderer over HTTP. No business logic. No database queries. Just the skeleton, wired up correctly.

**Prerequisites:** none. This is the first phase.

**Estimated scope:** small. Roughly 30-50 file creations, mostly config and boilerplate. No complex logic.

---

## Read these files before starting

The agent must read all of these and treat them as binding context:

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md`
- `docs/agent-plans/00-shared/conventions.md`

Skim the schema and api-contract files for awareness — but they are not used in this phase.

## Context

This phase establishes the project skeleton:

- pnpm monorepo at the repo root.
- One workspace package: `apps/master`.
- The master app is an Electron app. The Electron **main process** runs an Express HTTP server on port 4000. The Electron **renderer** is a React app (Vite) that fetches `/health` from the same port and shows a result.
- TypeScript strict mode throughout.
- No database yet. No Prisma yet. No socket.io yet. **No `User` model, no auth, no business logic.**

Why this matters: the master must boot cleanly and the renderer must successfully reach the backend before any feature work begins. Many bugs in later phases come from misconfigured tooling at the start.

## Tasks

Execute in order. Do not skip steps.

### 1. Create the monorepo root

Run from the desired parent directory. The repo folder is `chayxana-pos`.

Files to create at the root:

**`package.json`**

```json
{
  "name": "chayxana-pos",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev:master": "pnpm --filter @chayxana/master dev",
    "build:master": "pnpm --filter @chayxana/master build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  },
  "engines": {
    "node": ">=20"
  },
  "packageManager": "pnpm@9.0.0"
}
```

**`pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**`tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "isolatedModules": true
  }
}
```

**`.gitignore`**

```
node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
.vscode/
.idea/
apps/*/dist/
apps/*/out/
apps/*/.vite/
apps/master/prisma/dev.db
```

**`.editorconfig`**

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

**`README.md`**

A short project README. One paragraph describing the project, links to `docs/agent-plans/README.md` for build instructions.

### 2. Create `apps/master` package skeleton

Folder structure to create:

```
apps/master/
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
├── electron.vite.config.ts
├── .env.example
├── src/
│   ├── main/
│   │   ├── index.ts             # Electron entry — creates window, starts server
│   │   ├── preload.ts           # minimal preload
│   │   └── server/
│   │       ├── app.ts           # Express setup
│   │       └── routes/
│   │           └── health.routes.ts
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       └── styles.css
└── resources/
    └── bin/
        └── .gitkeep             # placeholder; receipt.exe lands here in phase 04
```

**`apps/master/package.json`**

```json
{
  "name": "@chayxana/master",
  "version": "0.0.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "echo 'no lint configured yet'"
  },
  "dependencies": {
    "express": "^4.19.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.12.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0"
  }
}
```

**`apps/master/tsconfig.json`** (root tsconfig that references main + renderer):

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.main.json" },
    { "path": "./tsconfig.renderer.json" }
  ]
}
```

**`apps/master/tsconfig.main.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "./out/main",
    "rootDir": "./src/main",
    "types": ["node", "electron"],
    "composite": true
  },
  "include": ["src/main/**/*"]
}
```

**`apps/master/tsconfig.renderer.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out/renderer",
    "rootDir": "./src/renderer",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "composite": true
  },
  "include": ["src/renderer/**/*"]
}
```

**`apps/master/electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/preload.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    plugins: [react()],
  },
});
```

**`apps/master/.env.example`**

```
PORT=4000
NODE_ENV=development
```

### 3. Implement the Express server

**`apps/master/src/main/server/routes/health.routes.ts`**

```ts
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});
```

**`apps/master/src/main/server/app.ts`**

```ts
import express, { Express } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.routes';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/health', healthRouter);
  return app;
}
```

### 4. Implement Electron main entry

**`apps/master/src/main/preload.ts`**

```ts
// Intentionally minimal. We do not use Electron IPC for business operations
// per the architecture decision in 00-shared/decisions.md (Master UI talks
// to the backend over HTTP, not IPC).
```

**`apps/master/src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { createApp } from './server/app';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

let mainWindow: BrowserWindow | null = null;

async function startServer(): Promise<void> {
  const expressApp = createApp();
  await new Promise<void>((resolve) => {
    expressApp.listen(PORT, '0.0.0.0', () => {
      console.log(`[master] HTTP server listening on 0.0.0.0:${PORT}`);
      resolve();
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development' && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

### 5. Implement the React renderer

**`apps/master/src/renderer/index.html`**

```html
<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chayxana Master</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

**`apps/master/src/renderer/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**`apps/master/src/renderer/App.tsx`**

```tsx
import { useEffect, useState } from 'react';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; timestamp: string }
  | { status: 'error'; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });

  useEffect(() => {
    fetch('http://localhost:4000/api/health')
      .then((r) => r.json())
      .then((data: { ok: boolean; timestamp: string }) => {
        if (data.ok) setHealth({ status: 'ok', timestamp: data.timestamp });
        else setHealth({ status: 'error', message: 'Unexpected response' });
      })
      .catch((err: Error) => setHealth({ status: 'error', message: err.message }));
  }, []);

  return (
    <div className="container">
      <h1>Chayxana Master</h1>
      {health.status === 'loading' && <p>Tekshirilmoqda…</p>}
      {health.status === 'ok' && (
        <p className="ok">
          Server bilan aloqa o&apos;rnatildi. Vaqt: {health.timestamp}
        </p>
      )}
      {health.status === 'error' && (
        <p className="error">Xato: {health.message}</p>
      )}
    </div>
  );
}
```

**`apps/master/src/renderer/styles.css`**

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fafafa;
  color: #222;
}
.container {
  max-width: 720px;
  margin: 64px auto;
  padding: 24px;
}
h1 { margin: 0 0 16px; }
.ok { color: #1d7d3a; }
.error { color: #b3261e; }
```

### 6. Install dependencies and verify

Run from the repo root:

```sh
pnpm install
```

This must complete without errors. If it fails, surface the exact error to the human and STOP.

## Constraints

- Do **not** add Prisma, PostgreSQL, socket.io, bcryptjs, or any other library beyond what is listed in `apps/master/package.json` above. Those come in later phases.
- Do **not** create the `User`, `Order`, or any other Prisma model in this phase.
- Do **not** modify `tsconfig.base.json` to relax strictness (e.g., setting `strict: false` to silence errors). Fix the type errors instead.
- Do **not** add scripts to `package.json` that aren't listed above.
- Do **not** create files outside the listed file tree.
- Do **not** commit `node_modules/` or `out/`.
- Do **not** add a `kitchen` or `mobile` app folder. Those are separate phases.

## Verification gate

The agent must run these commands and show their output. Phase is not complete until all pass.

### V1. Install succeeded

```sh
pnpm install
```

Output must end with no errors. Show the last 20 lines.

### V2. TypeScript compiles cleanly

```sh
pnpm typecheck
```

Output must be empty (or a success message). Any TS error means re-fix and re-run.

### V3. Master app boots

```sh
pnpm dev:master
```

The Electron window should open and the renderer should display:

> **Server bilan aloqa o'rnatildi. Vaqt: 2026-XX-XXTXX:XX:XX.XXXZ**

Take a screenshot or copy the visible text from the window. Document this in the verification output.

If the renderer shows "Xato: Failed to fetch" or similar, the Express server failed to start. Show the terminal output from the dev process — this is the bug to fix.

### V4. Health endpoint reachable from outside

While `pnpm dev:master` is still running, in a separate terminal:

```sh
curl http://localhost:4000/api/health
```

Expected output:

```json
{"ok":true,"timestamp":"2026-XX-XXTXX:XX:XX.XXXZ"}
```

### V5. File tree matches spec

Run:

```sh
find . -path ./node_modules -prune -o -type f -print | sort
```

The output should match the file tree described in this phase. No extra files (other than lockfiles, `node_modules`, build outputs).

## Definition of done

All of these must be true:

- [ ] Repo root has `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `README.md`.
- [ ] `apps/master/` exists with all files from task 2-5.
- [ ] `pnpm install` succeeded.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm dev:master` opens an Electron window that shows the success message.
- [ ] `curl http://localhost:4000/api/health` returns `{ ok: true, ... }`.
- [ ] `git status` shows only the files we intended to create. No stray dist outputs, no committed `node_modules`.

When all are checked, stop. Wait for human approval before moving to phase `01-master/01-schema-and-repos.md`.
