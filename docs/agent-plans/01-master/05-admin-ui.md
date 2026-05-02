# Phase 01-master / 05 — Master admin UI

**Goal:** the React renderer is feature-complete for owner and admin daily work. Login, approval queue (with live socket updates), orders list, menu CRUD, tables CRUD, users CRUD, discounts CRUD, settings page. Connection status indicator. Real socket.io is now wired through the same HTTP server.

**Reports** and **audit log** screens land in phase 07. **Stock tracking** UI lands in phase 06. This phase delivers the operational UI without those two specialized screens.

**Prerequisites:** `01-master/04-printer.md` complete and verified.

**Estimated scope:** large. Many screens, but each is mostly forms + lists. socket.io wiring is the most involved part.

---

## Read these files before starting

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md`
- `docs/agent-plans/00-shared/api-contract.md` (especially socket events)
- `docs/agent-plans/00-shared/conventions.md` (frontend conventions section)

## Context

Until this phase the master backend has only had a "Hello, server connected" placeholder renderer. Now we replace that with the actual operational UI for owner and admin. All UI text is in Uzbek (Latin script). All forms validate via zod. Server state goes through TanStack Query. Local global state goes through Zustand. Sockets become real here — the renderer subscribes and the same `emitToRoom` stub from earlier phases gets replaced with a real socket.io emitter.

This phase contains UI work that, while extensive, is fairly mechanical. The agent should prefer simple, working layouts over polished design. We're building functional admin tools, not a marketing site.

## Tasks

### 1. Add renderer dependencies

```sh
cd apps/master
pnpm add @tanstack/react-query zustand react-router-dom socket.io socket.io-client react-hook-form @hookform/resolvers
pnpm add -D tailwindcss postcss autoprefixer
cd ../..
```

### 2. Set up Tailwind in the renderer

Create the tailwind config files inside `apps/master/`:

**`apps/master/tailwind.config.cjs`**

```js
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: { extend: {} },
  plugins: [],
};
```

**`apps/master/postcss.config.cjs`**

```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

Update **`apps/master/src/renderer/styles.css`**:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body { font-family: system-ui, sans-serif; }
```

### 3. Wire real socket.io on the server

Add socket.io alongside Express. They share the same HTTP server.

**`apps/master/src/main/server/socket.ts`**

```ts
import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import { sessionRepo } from './repositories/session.repo';
import { Errors } from './lib/errors';

let io: IOServer | null = null;

export function attachSocket(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    cors: { origin: '*' },
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token ?? '') as string;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const session = await sessionRepo.findActiveByToken(token);
      if (!session) return next(new Error('UNAUTHORIZED'));
      (socket.data as any).user = session.user;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket.data as any).user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    if (user.role === 'OWNER' || user.role === 'ADMIN') socket.join('admin');
    if (user.role === 'KITCHEN') socket.join('kitchen');
    if (user.role === 'WAITER') socket.join(`waiter:${user.id}`);
  });

  return io;
}

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
```

### 4. Replace the socket-events stub

Update **`apps/master/src/main/server/lib/socket-events.ts`**: replace the stubbed `emitToRoom` with real one:

```ts
import { getIO } from '../socket';

export function emitToRoom(room: string, event: string, payload: unknown): void {
  try {
    getIO().to(room).emit(event, payload);
  } catch (err) {
    // Server may not have started yet; log and ignore
    console.warn('[emitToRoom] socket not ready:', err);
  }
}
```

Keep the rest of the file (deferred-emit infrastructure) unchanged.

### 5. Wire socket attach in startup

Modify **`apps/master/src/main/index.ts`** so `startServer()` returns the HTTP server and `attachSocket` is called on it:

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { createServer } from 'http';
import { createApp } from './server/app';
import { attachSocket } from './server/socket';
import { settingsService } from './server/services/settings.service';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

async function startServer(): Promise<void> {
  await settingsService.loadAll();
  const expressApp = createApp();
  const httpServer = createServer(expressApp);
  attachSocket(httpServer);
  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[master] HTTP+WS listening on 0.0.0.0:${PORT}`);
      resolve();
    });
  });
}
// ... createWindow + app.whenReady same as before
```

### 6. Build the renderer's API client

**`apps/master/src/renderer/api/client.ts`**

A thin wrapper around `fetch` that injects the auth token and parses errors.

```ts
const BASE = 'http://localhost:4000';

let token: string | null = null;
export function setAuthToken(t: string | null) {
  token = t;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const code = json?.error?.code ?? 'UNKNOWN';
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(message) as Error & { code?: string; details?: unknown };
    err.code = code;
    err.details = json?.error?.details;
    throw err;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
```

### 7. Build typed endpoint helpers

Create one file per resource under `apps/master/src/renderer/api/`:

- `auth.ts` — login, loginPin, logout, me
- `menu.ts` — listMenu, listCategories, createCategory, ..., listItems, ..., listCombos, ...
- `tables.ts`
- `orders.ts` — list, getById, create (waiter only — won't be called from admin UI but still typed), addItem (waiter), send (waiter), requestBill (waiter), cancel, transfer, approve, markPaid, markWalkout, reprintBill
- `kitchen.ts`
- `discounts.ts`
- `stock.ts`
- `users.ts`
- `settings.ts`
- `reports.ts` (stub — will populate in phase 07)
- `audit.ts` (stub — phase 07)

Each function calls `api.get` / `api.post` / etc. with a typed return value. Types come from manually-written interfaces matching the API contract — we don't auto-generate from Prisma in v1.

### 8. Build Zustand stores

**`apps/master/src/renderer/stores/auth.store.ts`**

```ts
import { create } from 'zustand';
import { setAuthToken } from '../api/client';

type User = { id: string; role: string; fullName: string };

type State = {
  user: User | null;
  token: string | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<State>((set) => ({
  user: null,
  token: null,
  setAuth: (token, user) => {
    setAuthToken(token);
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user });
  },
  clearAuth: () => {
    setAuthToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    set({ token: null, user: null });
  },
}));

// On boot, hydrate from localStorage
const savedToken = localStorage.getItem('auth_token');
const savedUser = localStorage.getItem('auth_user');
if (savedToken && savedUser) {
  setAuthToken(savedToken);
  useAuthStore.setState({
    token: savedToken,
    user: JSON.parse(savedUser),
  });
}
```

**`apps/master/src/renderer/stores/connection.store.ts`**

```ts
import { create } from 'zustand';

type ConnState = 'connecting' | 'online' | 'offline';

export const useConnectionStore = create<{
  status: ConnState;
  setStatus: (s: ConnState) => void;
}>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}));
```

### 9. Build the socket hook

**`apps/master/src/renderer/hooks/useSocket.ts`**

Connects to socket.io with the auth token, joins rooms automatically (server handles room joining based on role), exposes a way to subscribe to events. On every event, the hook also invalidates relevant TanStack Query caches.

```ts
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';

let socket: Socket | null = null;

export function useSocket() {
  const token = useAuthStore((s) => s.token);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      return;
    }

    socket = io('http://localhost:4000', {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => setStatus('online'));
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('offline'));

    // Generic invalidation strategy: any event re-fetches relevant queries.
    socket.on('order:billRequested', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:updated', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:approved', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:closed', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:walkout', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('order:transferred', () => qc.invalidateQueries({ queryKey: ['orders'] }));
    socket.on('ticket:new', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
    socket.on('ticket:statusChanged', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
    socket.on('ticket:noteEdited', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
    socket.on('ticket:canceled', () => qc.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }));
    socket.on('menu:itemAvailability', () => qc.invalidateQueries({ queryKey: ['menu'] }));
    socket.on('stock:changed', () => qc.invalidateQueries({ queryKey: ['stock'] }));

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token, qc, setStatus]);
}
```

### 10. Build the App shell

**`apps/master/src/renderer/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { useSocket } from './hooks/useSocket';
import { LoginPage } from './pages/LoginPage';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { ApprovalQueuePage } from './pages/ApprovalQueuePage';
import { OrdersPage } from './pages/OrdersPage';
import { MenuPage } from './pages/MenuPage';
import { TablesPage } from './pages/TablesPage';
import { UsersPage } from './pages/UsersPage';
import { DiscountsPage } from './pages/DiscountsPage';
import { SettingsPage } from './pages/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthedRoutes() {
  useSocket();
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/approval-queue" element={<ApprovalQueuePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/tables" element={<TablesPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/discounts" element={<DiscountsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  const user = useAuthStore((s) => s.user);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {user ? <AuthedRoutes /> : <LoginPage />}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

### 11. Build the Layout component

**`apps/master/src/renderer/components/Layout.tsx`**

Sidebar with nav, top bar with connection indicator and user info + logout. Sidebar items vary by role: only OWNER sees "Hisobotlar" (Reports) and "Audit jurnali" (Audit) — but in this phase those routes don't exist yet, so just include all items as static for now.

Sidebar items (Uzbek labels):

- "Bosh sahifa" → `/`
- "Tasdiqlash navbati" → `/approval-queue`
- "Buyurtmalar" → `/orders`
- "Menyu" → `/menu`
- "Stollar" → `/tables`
- "Foydalanuvchilar" → `/users`
- "Chegirmalar" → `/discounts`
- "Sozlamalar" → `/settings`

Layout includes a `ConnectionBanner` component that renders red across the top when `connectionStore.status === 'offline'`.

### 12. Build the LoginPage

**`apps/master/src/renderer/pages/LoginPage.tsx`**

Simple form: username + password fields, submit button. On success, calls `setAuth(token, user)` from the auth store. On error, shows the error message in Uzbek (translate common error codes — `UNAUTHORIZED`, `LOCKED` to user-friendly Uzbek strings).

Use `react-hook-form` with a zod schema. Standard login pattern.

### 13. Build each page

For brevity, I'll describe each page's responsibility. The agent fills in the implementation following standard patterns:

**`DashboardPage`**

A simple dashboard. Shows:

- Number of active orders.
- Number of bills awaiting approval.
- Number of orders in PENDING_PAYMENT.

Just card-style displays. Data via `useQuery(['orders', 'active'], ...)`.

**`ApprovalQueuePage`**

Lists orders in `BILL_REQUESTED` status. Each row shows order ID, table, waiter, current total, items count, request time. Click a row to open an approval modal with:

- Item list (read-only).
- Subtotal, discount-line, service-line, total preview.
- Discount picker (dropdown of active discounts).
- "Service charge waived" checkbox.
- "Approve & print" button → calls `POST /api/orders/:id/approve`.
- "Cancel order" button → confirm modal + calls cancel endpoint.

The modal must respond to socket events on `order:updated` (live bill updates while admin is looking). Use TanStack Query refetching driven by socket invalidation.

**`OrdersPage`**

Tabbed by status: SENT / BILL_REQUESTED / PENDING_PAYMENT / CLOSED / WALKOUT / CANCELED.

CLOSED tab is the "history" view, paginated by date. Each row shows order summary; click to expand for line details. PENDING_PAYMENT tab has buttons "Mark Paid" (opens payment modal) and "Mark Walkout" (confirm + reason).

The Mark Paid modal:

- Shows total.
- Allows multiple payment rows: pick method (CASH / CARD), enter amount.
- Validates sum equals total.
- Submit calls `POST /api/orders/:id/mark-paid`.

**`MenuPage`**

Two-column layout: categories on left (with reorder arrows + add/edit/deactivate), items on right (filtered by selected category, with same operations).

Item form: name, category, price, description, displayOrder, `trackStock` checkbox.

Availability toggle is a switch directly on each item row — fires `PATCH /api/menu/items/:id/availability` on change.

Also a section for combos: list, add (with component picker), edit, deactivate.

**`TablesPage`**

List of all tables with type, displayOrder, isActive. Add / edit. Show `activeOrderId` indicator next to each occupied table.

**`UsersPage`**

List of users with role, fullName, isActive. "Add user" form:

- Role picker.
- For OWNER/ADMIN/KITCHEN: username + password fields.
- For WAITER: PIN field (4 digits, validated client-side too).

Owner role can only be created by OWNER (UI hides the option for ADMIN). Deactivate button. Edit (change name/role/password — but only OWNER can change role to OWNER).

**`DiscountsPage`**

Simple list + add/edit form. Validation client-side mirrors server caps (read settings via `useQuery`):

- PERCENT discounts must be ≤ `max_discount_percent`.
- FIXED discounts must be ≤ `max_discount_amount`.

Form submits to `POST /api/discounts`.

**`SettingsPage`**

Form with fields for all settings keys. Save button calls `PATCH /api/settings` for each changed field. Read-only for keys that role doesn't have access to (e.g., admin sees but can't edit `service_charge_amount`).

### 14. Tweaks to UX

- All amounts displayed with `formatUZS` helper.
- All dates with `formatDateTimeUZ`.
- Loading states shown via TanStack Query's `isLoading`.
- Error states shown via a small `<ErrorAlert />` component that takes an Error and shows a Uzbek message based on `err.code`.
- Modals are simple — overlay div + content, no animation library.
- Forms use `react-hook-form` + zod resolver consistently.

## Constraints

- **No reports page in this phase.** Phase 07.
- **No audit log page in this phase.** Phase 07.
- **No stock tracking page in this phase.** Phase 06.
- **No charts.** Plain numbers and tables.
- **No animation libraries.**
- **No translation library.** Hardcoded Uzbek strings.
- Tailwind for styling, no other CSS frameworks.
- Do not change services or API beyond what's necessary to expose endpoints needed by UI (which were all done in phase 03).

## Verification gate

### V1. Typecheck

```sh
pnpm typecheck
```

### V2. Master boots and login renders

```sh
pnpm dev:master
```

The window now shows the login page (replacing the old health-check placeholder).

### V3. Login as admin works

Log in with `admin` / `admin123`. Successfully redirected to dashboard. Dashboard shows 0 active orders (or whatever the current count is).

### V4. Approval queue updates live

Set up two terminals running curl commands (or use Postman):

1. Login as waiter Botir → token A.
2. With token A, create an order (DINE_IN, table Stol 1), add 2 items, send.
3. Login as kitchen → mark IN_PROGRESS, READY.
4. With token A, request bill.

Watch the admin UI's Approval Queue page. The new bill should appear within ~1 second without refreshing the page (socket-driven invalidation).

### V5. Approve a bill from UI

Click the bill in approval queue. Modal opens. No discount selected, service not waived. Click "Approve & print".

- Receipt should print.
- Modal closes.
- Order disappears from approval queue (now in PENDING_PAYMENT).
- Order appears in Orders page → PENDING_PAYMENT tab.

### V6. Mark Paid from UI

Open the order in PENDING_PAYMENT. Click "Mark Paid". Enter payments (e.g., 100k cash + 50k card). Submit. Order moves to CLOSED tab.

### V7. Menu CRUD

Create a category. Create an item under it. Toggle availability — verify socket fires (set up a quick listener via browser devtools or just verify other clients re-fetch). Edit, deactivate.

### V8. User management

Login as owner. Create a new admin. Logout. Login with the new admin. Verify reports and audit log routes (which don't exist yet) gracefully redirect or 404 — but the rest of the UI works.

### V9. Connection banner

Stop the master backend (Ctrl+C in dev terminal). The banner should turn red within ~5 seconds.

Restart master. Banner should turn green again. Active page re-fetches and shows current state.

### V10. Responsive enough

The Master PC will likely run the UI fullscreen at 1920×1080 or similar. Verify the layout doesn't break at common desktop resolutions. No need to support mobile/tablet sizes.

## Definition of done

- [ ] All renderer dependencies installed and tailwind configured.
- [ ] Real socket.io wired alongside Express on the same HTTP server.
- [ ] socket-events.ts emits real events.
- [ ] All 8 pages exist (Dashboard, Approval Queue, Orders, Menu, Tables, Users, Discounts, Settings) with the listed functionality.
- [ ] Layout, ConnectionBanner, ErrorAlert, modal patterns in place.
- [ ] Auth store + connection store + socket hook wired to TanStack Query invalidation.
- [ ] All UI text in Uzbek.
- [ ] V1-V10 verified.
- [ ] Master still boots and the simulate-flow script from phase 02 still passes (regression check).

When all are checked, stop. Wait for human approval before phase `01-master/06-stock-tracking.md`.
