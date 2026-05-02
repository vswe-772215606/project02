# Phase 02-kitchen / 00 — Kitchen Display scaffolding

**Goal:** create the Kitchen Display Electron app. Login screen works against the master backend's `/api/auth/login` endpoint (kitchen user). After login, a placeholder "Kitchen Display" screen shows. Socket connection establishes successfully. Connection banner reflects status.

**Prerequisites:** `01-master/07-reports-and-audit.md` complete and verified. The master backend must be running and reachable at `http://192.168.1.10:4000` (or wherever the kitchen device can reach it).

**Estimated scope:** small. Mostly project setup. Real ticket UI is in the next phase.

---

## Read these files before starting

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md` ← kitchen role section
- `docs/agent-plans/00-shared/api-contract.md` (kitchen endpoints, socket events)
- `docs/agent-plans/00-shared/conventions.md`

## Context

The kitchen monoblock runs Windows 10 with a touchscreen. The Kitchen Display app:

- Is an Electron app (separate from master).
- Has no business logic or database.
- Talks to the master backend via HTTP REST + WebSocket.
- Is touchscreen-optimized (large buttons, large text).
- Auto-starts on boot in production.

This phase establishes the project skeleton. Login + connection + placeholder screen. Real ticket queue and actions in the next phase.

## Tasks

### 1. Create the apps/kitchen package

Folder structure to create:

```
apps/kitchen/
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
├── electron.vite.config.ts
├── tailwind.config.cjs
├── postcss.config.cjs
├── .env.example
├── src/
│   ├── main/
│   │   ├── index.ts             # Electron entry, just creates window
│   │   └── preload.ts
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── styles.css
│       ├── api/
│       │   ├── client.ts
│       │   ├── auth.ts
│       │   └── kitchen.ts
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   └── useSocket.ts
│       ├── stores/
│       │   ├── auth.store.ts
│       │   └── connection.store.ts
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   └── KitchenDisplayPage.tsx
│       ├── components/
│       │   └── ConnectionBanner.tsx
│       └── lib/
│           ├── format.ts
│           └── env.ts
└── resources/
    └── .gitkeep
```

**`apps/kitchen/package.json`**

```json
{
  "name": "@chayxana/kitchen",
  "version": "0.0.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "echo 'no lint'"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.51.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-hook-form": "^7.52.0",
    "@hookform/resolvers": "^3.9.0",
    "react-router-dom": "^6.25.0",
    "socket.io-client": "^4.7.5",
    "zod": "^3.23.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0"
  }
}
```

**`apps/kitchen/tsconfig.json`**, **`tsconfig.main.json`**, **`tsconfig.renderer.json`**: same shape as `apps/master`. Adjust paths to point to kitchen's directories.

**`apps/kitchen/electron.vite.config.ts`**: same shape as master.

**`apps/kitchen/tailwind.config.cjs`** and **`postcss.config.cjs`**: same as master.

**`apps/kitchen/.env.example`**

```
MASTER_URL=http://192.168.1.10:4000
```

In development, override to `http://localhost:4000` via `.env` (gitignored).

### 2. Implement env loading in renderer

Vite exposes env vars only with `VITE_` prefix. Adjust:

**`apps/kitchen/.env.example`**

```
VITE_MASTER_URL=http://192.168.1.10:4000
```

**`apps/kitchen/src/renderer/lib/env.ts`**

```ts
export const MASTER_URL =
  (import.meta.env.VITE_MASTER_URL as string) || 'http://localhost:4000';
```

### 3. Implement Electron main

**`apps/kitchen/src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: process.env.NODE_ENV === 'production',
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

**`apps/kitchen/src/main/preload.ts`**: same minimal preload as master.

### 4. Implement renderer styles

**`apps/kitchen/src/renderer/styles.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  font-family: system-ui, sans-serif;
  /* Kitchen UI is touch-first; bigger base size */
  font-size: 18px;
}
```

### 5. Implement renderer infrastructure

The kitchen API client is essentially the same as the master's, but base URL comes from env:

**`apps/kitchen/src/renderer/api/client.ts`**

Adapt master's `client.ts` to read `MASTER_URL` from env. Same shape otherwise. The auth token logic is the same.

**`apps/kitchen/src/renderer/api/auth.ts`**

```ts
import { api } from './client';

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: { id: string; role: string; fullName: string } }>(
      '/api/auth/login',
      { username, password },
    ),
  me: () => api.get<{ user: { id: string; role: string; fullName: string } }>('/api/auth/me'),
  logout: () => api.post<{ ok: true }>('/api/auth/logout'),
};
```

**`apps/kitchen/src/renderer/api/kitchen.ts`**

```ts
import { api } from './client';

type Ticket = unknown; // refine in next phase

export const kitchenApi = {
  listActive: () => api.get<Ticket[]>('/api/kitchen/tickets/active'),
  getById: (id: string) => api.get<Ticket>(`/api/kitchen/tickets/${id}`),
  setStatus: (id: string, status: 'IN_PROGRESS' | 'READY') =>
    api.patch<Ticket>(`/api/kitchen/tickets/${id}`, { status }),
  reprint: (id: string) =>
    api.post<{ id: string }>(`/api/kitchen/tickets/${id}/reprint`),
};
```

**`apps/kitchen/src/renderer/stores/auth.store.ts`** and **`connection.store.ts`**: same shape as master.

**`apps/kitchen/src/renderer/hooks/useSocket.ts`**: similar to master's, but only subscribes to kitchen-relevant events (`ticket:new`, `ticket:statusChanged`, `ticket:noteEdited`, `ticket:canceled`, `order:transferred`, `menu:itemAvailability`, `stock:changed`). Connects to the URL from env.

### 6. Build the Login page

**`apps/kitchen/src/renderer/pages/LoginPage.tsx`**

Form: username + password, large input fields (touch-friendly). Submit → `authApi.login` → store auth → redirect.

Show useful Uzbek error messages on failure.

Design notes (touch-first):

- Input fields at least 56px tall.
- Buttons at least 64px tall.
- Center the form, max-width 480px.

### 7. Build the placeholder Kitchen Display page

**`apps/kitchen/src/renderer/pages/KitchenDisplayPage.tsx`**

For this phase: a placeholder. Real implementation in next phase. Just shows:

- Top bar: "Oshxona ko'rsatkichi" title, connection indicator, logout button.
- Body: text "Aktiv buyurtmalar bu yerda ko'rinadi" ("Active orders will appear here").
- A "Test API" button that calls `kitchenApi.listActive()` and shows the count of returned items.

This proves the auth + API + sockets connectivity works before we build the real UI.

### 8. Build the App shell

**`apps/kitchen/src/renderer/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth.store';
import { useSocket } from './hooks/useSocket';
import { LoginPage } from './pages/LoginPage';
import { KitchenDisplayPage } from './pages/KitchenDisplayPage';
import { ConnectionBanner } from './components/ConnectionBanner';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthedApp() {
  useSocket();
  return (
    <>
      <ConnectionBanner />
      <KitchenDisplayPage />
    </>
  );
}

export function App() {
  const user = useAuthStore((s) => s.user);
  return (
    <QueryClientProvider client={queryClient}>
      {user ? <AuthedApp /> : <LoginPage />}
    </QueryClientProvider>
  );
}
```

### 9. Update root scripts

**Root `package.json`**: add `dev:kitchen` and `build:kitchen`:

```json
"scripts": {
  "dev:master": "pnpm --filter @chayxana/master dev",
  "dev:kitchen": "pnpm --filter @chayxana/kitchen dev",
  "build:master": "pnpm --filter @chayxana/master build",
  "build:kitchen": "pnpm --filter @chayxana/kitchen build",
  "typecheck": "pnpm -r typecheck",
  "lint": "pnpm -r lint"
}
```

### 10. Install

```sh
pnpm install
```

## Constraints

- Do not implement the real ticket queue UI. Placeholder only.
- Do not implement IN_PROGRESS / READY actions. Next phase.
- Do not write any kitchen-specific business logic — that lives on the master.
- Reuse patterns established in `apps/master`: auth store, API client, socket hook structure. Adapt but don't reinvent.
- The kitchen app does NOT have its own database, no Prisma.
- The kitchen app does NOT spawn `receipt.exe`. Printing is the master's responsibility.
- Touch-first design from this phase forward — bigger buttons, bigger fonts.

## Verification gate

### V1. Typecheck

```sh
pnpm typecheck
```

### V2. Kitchen app boots

In one terminal: `pnpm dev:master` (master must be running for the kitchen to connect).

In another terminal: `pnpm dev:kitchen`.

A second Electron window opens. Login page renders.

### V3. Login as kitchen user

Use `kitchen1` / `kitchen123` (seeded). Successfully authenticated, KitchenDisplayPage placeholder renders.

### V4. Connection banner reflects status

While logged in, stop the master backend. Banner turns red within ~5 seconds.

Restart master. Banner turns green again.

### V5. Test API button works

Click "Test API". Shows the count of active tickets (probably 0 if no test data, or whatever's currently in the kitchen queue).

### V6. Try wrong role

Try logging in as `admin`/`admin123`. The login should succeed at the API level (admin is a valid user), but ideally the kitchen app should detect this and either:
- Show an error: "Faqat oshxona xodimlari kira oladi" ("Only kitchen staff can log in here") AND log out.
- Or just proceed (admin technically has all kitchen permissions).

For v1, accept admin login (admin can supervise the kitchen station). Document that this is by design.

For waiter login (`pin: 5678`), since kitchen doesn't accept PIN auth, login form has no PIN input — there's no way for a waiter to log into the kitchen app.

### V7. Other clients still work

Master and kitchen connected simultaneously. Master backend logs should show two socket connections.

```
[master] HTTP+WS listening on 0.0.0.0:4000
[user X joined room admin]
[user Y joined room kitchen]
```

(Or similar log output if logging is enabled.)

## Definition of done

- [ ] `apps/kitchen/` package created with full structure.
- [ ] `pnpm install` succeeds.
- [ ] `pnpm dev:kitchen` opens Electron window with login page.
- [ ] Kitchen user can log in.
- [ ] Connection banner works.
- [ ] Test API button confirms backend connectivity.
- [ ] Master backend sees the kitchen socket connection.
- [ ] `pnpm typecheck` passes (across all packages).
- [ ] No business logic added to kitchen — pure client.

When all are checked, stop. Wait for human approval before phase `02-kitchen/01-display-and-actions.md`.
