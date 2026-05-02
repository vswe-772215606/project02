# Phase 01-master / 03 — API, auth, validation

**Goal:** expose every service through a REST API. Auth middleware enforces session validation. Role middleware enforces permissions. Every endpoint from `00-shared/api-contract.md` is implemented and reachable. The system is testable end-to-end via curl/Postman.

**Prerequisites:** `01-master/02-services.md` complete and verified.

**Estimated scope:** large. Many endpoints, but the controllers are mostly thin (parse → call service → return). Most files are short.

---

## Read these files before starting

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md`
- `docs/agent-plans/00-shared/api-contract.md` ← canonical endpoint list, exact request/response shapes
- `docs/agent-plans/00-shared/conventions.md` ← three-layer pattern, validation, role middleware

## Context

After this phase the master backend is feature-complete from a backend perspective. Every service capability is exposed via HTTP. The next phase (printer) replaces the print stub with the real binary. The phase after (admin UI) builds the React renderer. But the API is fully usable for testing with curl and for early-stage integration with kitchen and mobile clients.

Sockets are still stubbed in this phase. Phase 03 wires socket.io alongside REST sharing the same HTTP server, but events still go through `emitToRoom` which `console.log`s. Real socket integration happens in phase 06 (admin UI) when there's a renderer to receive events and verify the stack end-to-end. Until then, socket events are observable in master backend logs.

## Tasks

### 1. Add additional dependencies

```sh
cd apps/master
pnpm add zod cookie-parser
pnpm add -D @types/cookie-parser
cd ../..
```

`zod` for request validation. `cookie-parser` is optional (we use Bearer tokens, not cookies) but having it set up is harmless.

### 2. Implement auth middleware

**`apps/master/src/main/server/middleware/requireAuth.ts`**

Per the skeleton in `00-shared/conventions.md`. Reads `Authorization: Bearer <token>`. Looks up via `sessionRepo.findActiveByToken`. Attaches `req.user` and `req.session`. Touches `lastUsedAt` (fire-and-forget). Returns 401 if missing/expired/invalid.

The `req.user` shape:

```ts
type RequestUser = {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'KITCHEN' | 'WAITER';
  fullName: string;
};
```

Add a global type augmentation:

**`apps/master/src/main/server/types/express.d.ts`**

```ts
import 'express';
import type { RequestUser } from '../middleware/requireAuth';

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      session?: { id: string; token: string };
    }
  }
}
```

Make sure tsconfig.main.json includes this `.d.ts`.

### 3. Implement role middleware

**`apps/master/src/main/server/middleware/requireRole.ts`**

```ts
import { RequestHandler } from 'express';
import { Errors } from '../lib/errors';

type Role = 'OWNER' | 'ADMIN' | 'KITCHEN' | 'WAITER';

export function requireRole(roles: Role | Role[]): RequestHandler {
  const allow = Array.isArray(roles) ? roles : [roles];
  return (req, _res, next) => {
    if (!req.user) return next(Errors.Unauthorized());
    if (!allow.includes(req.user.role as Role))
      return next(Errors.Forbidden());
    next();
  };
}
```

### 4. Implement validation middleware

**`apps/master/src/main/server/middleware/validateBody.ts`**

```ts
import { RequestHandler } from 'express';
import { ZodSchema } from 'zod';
import { Errors } from '../lib/errors';

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(Errors.Validation('Invalid request body', result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}
```

### 5. Implement error handler middleware

**`apps/master/src/main/server/middleware/errorHandler.ts`**

Per `00-shared/conventions.md`. Translates `AppError` to JSON, logs unknown errors and returns 500.

### 6. Implement rate limiting (lightweight, in-memory)

**`apps/master/src/main/server/middleware/rateLimit.ts`**

For the PIN endpoint specifically — per-IP rate limit. Use a simple in-memory `Map<ip, { count, resetAt }>`. No external deps. 30 requests / minute per IP.

```ts
import { RequestHandler } from 'express';
import { Errors } from '../lib/errors';

export function ipRateLimit(opts: { windowMs: number; max: number }): RequestHandler {
  const store = new Map<string, { count: number; resetAt: number }>();
  return (req, _res, next) => {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    const now = Date.now();
    const entry = store.get(ip);
    if (!entry || entry.resetAt < now) {
      store.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (entry.count >= opts.max) {
      return next(Errors.Conflict('Too many requests, slow down'));
    }
    entry.count++;
    next();
  };
}
```

Do not bother with a sliding window; fixed-window is fine here.

### 7. Implement controllers

Create `apps/master/src/main/server/controllers/*.controller.ts` per the API contract. Pattern: thin controllers, zod validation for body, call service, return JSON. Each controller exports a const `xxxController` with handlers.

**Files to create:**

- `auth.controller.ts` — login, loginPin, logout, me.
- `menu.controller.ts` — categories CRUD, items CRUD, items availability, combos CRUD, full menu listing.
- `tables.controller.ts` — list (with `activeOrderId`), create, update.
- `orders.controller.ts` — every endpoint listed in `api-contract.md` Orders section. Handlers: create, list, getById, addItem, addCombo, editLineNote, cancelLine, send, transfer, requestBill, cancelOrder, approve, markPaid, markWalkout, reprintBill.
- `kitchen.controller.ts` — listActive, getById, setStatus, reprint.
- `discounts.controller.ts` — list, create, update, softDelete.
- `stock.controller.ts` — getToday, setToday (bulk upsert), patchToday (single item adjust), history.
- `reports.controller.ts` — daily, monthly. (Service implementation details deferred to a later phase if reports need work, but stubs should at least respond with empty data shapes from already-existing repos. If Daily is too complex for this phase, a placeholder returning the zero-state DTO is acceptable; flag in the agent's verification output and we'll fill it in phase 07.)
- `audit.controller.ts` — list with filters and pagination.
- `settings.controller.ts` — getAll, patch.
- `users.controller.ts` — list, create, update, deactivate.

Each controller method:

1. Zod-parse the body or query. Throw `Errors.Validation` on failure (or use `validateBody` middleware).
2. Call the service with `req.user!.id` (and other request fields).
3. Return the service result with appropriate status code (200 default, 201 for create).
4. Errors propagate via `next(e)`.

### 8. Implement routes

Create `apps/master/src/main/server/routes/*.routes.ts`. Each file:

1. Imports its controller.
2. Defines a `Router`.
3. Mounts `requireAuth` and (where applicable) `requireRole`.
4. Maps paths to controller methods.

Example shape (truncated):

```ts
import { Router } from 'express';
import { ordersController } from '../controllers/orders.controller';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

ordersRouter.post('/', requireRole(['WAITER']), ordersController.create);
ordersRouter.get('/', ordersController.list);
ordersRouter.get('/:id', ordersController.getById);
// ...
```

Files to create:

- `auth.routes.ts` (with rate-limited PIN login)
- `menu.routes.ts`
- `tables.routes.ts`
- `orders.routes.ts`
- `kitchen.routes.ts`
- `discounts.routes.ts`
- `stock.routes.ts`
- `reports.routes.ts`
- `audit.routes.ts`
- `settings.routes.ts`
- `users.routes.ts`

### 9. Wire all routes into Express

Update **`apps/master/src/main/server/app.ts`** to mount everything:

```ts
import express, { Express } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.routes';
import { authRouter } from './routes/auth.routes';
import { menuRouter } from './routes/menu.routes';
import { tablesRouter } from './routes/tables.routes';
import { ordersRouter } from './routes/orders.routes';
import { kitchenRouter } from './routes/kitchen.routes';
import { discountsRouter } from './routes/discounts.routes';
import { stockRouter } from './routes/stock.routes';
import { reportsRouter } from './routes/reports.routes';
import { auditRouter } from './routes/audit.routes';
import { settingsRouter } from './routes/settings.routes';
import { usersRouter } from './routes/users.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/tables', tablesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/kitchen', kitchenRouter);
  app.use('/api/discounts', discountsRouter);
  app.use('/api/stock', stockRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/users', usersRouter);

  app.use(errorHandler); // last
  return app;
}
```

### 10. Wire `withEmitContext` into every mutation route

Mutations that emit socket events need to run inside `withEmitContext` so the deferred-emit storage exists. Easiest way: a one-line middleware that wraps `next()`:

**`apps/master/src/main/server/middleware/emitContext.ts`**

```ts
import { RequestHandler } from 'express';
import { withEmitContext } from '../lib/socket-events';

export const emitContext: RequestHandler = (req, _res, next) => {
  void withEmitContext(async () => {
    next();
    // We can't await next() reliably with classic express; rely on services to flush.
  });
};
```

Better approach since express handlers don't return promises cleanly: call `withEmitContext` inside each service entry point that emits. Update the service signature pattern in `02-services.md` so that any method that emits wraps its body in `withEmitContext`. Skip the middleware approach.

Verify in code review that every mutation method in `order.service`, `kitchen.service`, `stock.service`, `menu.service` (for availability changes) uses `withEmitContext` correctly.

### 11. Make sure server boot calls `settingsService.loadAll()`

Update **`apps/master/src/main/index.ts`** so before `expressApp.listen`, it awaits `settingsService.loadAll()`. Otherwise services that depend on settings will read empty cache.

```ts
async function startServer(): Promise<void> {
  await settingsService.loadAll();
  const expressApp = createApp();
  // ...
}
```

### 12. Add a postman-style test script

**`apps/master/scripts/api-smoke.sh`** (or `.ps1` if Windows-only)

A simple shell script that hits the main endpoints with curl and prints results. The agent should write this for both bash (cross-platform) and document the equivalent PowerShell commands in the script header. It should:

1. Login as admin → save token.
2. Hit `GET /api/menu` with token.
3. Login as waiter via PIN → save token.
4. Create an order. Add items. Send. Check status.
5. Login as kitchen. List active tickets. Mark IN_PROGRESS, then READY.
6. Login back as admin. Approve. Mark paid.
7. GET the final order. Verify status `CLOSED`.

If the agent's environment doesn't have curl (Windows minimal), the agent can write this as a Node script using `fetch` instead. Either is fine.

## Constraints

- **No socket.io yet** (real wiring comes in next phase). Use the stub `emitToRoom`.
- **No printer changes** — the print service stub still applies.
- **Controllers do NOT contain business logic.** Parse, call, return. That's it.
- **Services that emit events must wrap their body in `withEmitContext`** so `deferEmit` works.
- **Reports controller is allowed to be a stub** that returns the zero-shaped DTO — flag this in the verification output, real implementation lands in phase 07.
- **Stock controller endpoints are full implementations**, not stubs (we already have the service).
- Routes must be mounted in the order shown — `errorHandler` LAST.
- Do not change services from the previous phase (except the wrapping noted in step 10).

## Verification gate

### V1. Typecheck

```sh
pnpm typecheck
```

Must pass.

### V2. Server boots and login works

In one terminal:

```sh
pnpm dev:master
```

In another terminal:

```sh
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Must return `{ "token": "...", "user": {...} }` with HTTP 200.

### V3. Auth gating works

Without a token:

```sh
curl http://localhost:4000/api/menu
```

Must return 401 with `code: "UNAUTHORIZED"`.

With token:

```sh
curl http://localhost:4000/api/menu -H "Authorization: Bearer $TOKEN"
```

Must return the menu.

### V4. Role gating works

Login as a waiter:

```sh
curl -X POST http://localhost:4000/api/auth/login-pin \
  -H "Content-Type: application/json" -d '{"pin":"5678"}'
```

Save token. Try to hit owner-only endpoint:

```sh
curl http://localhost:4000/api/reports/daily -H "Authorization: Bearer $WAITER_TOKEN"
```

Must return 403 with `code: "FORBIDDEN"`.

### V5. Full happy path via API

Run the api-smoke script:

```sh
bash apps/master/scripts/api-smoke.sh
```

Must complete with the order ending in `status: CLOSED`.

### V6. Single-device session enforcement

Login as admin twice from different "devices" (just two curl calls). After the second login, the first token should be invalidated:

```sh
TOKEN1=$(curl -X POST http://localhost:4000/api/auth/login ...)
TOKEN2=$(curl -X POST http://localhost:4000/api/auth/login ...)
curl -H "Authorization: Bearer $TOKEN1" http://localhost:4000/api/auth/me
```

Must return 401.

### V7. Lockout

Hit `/api/auth/login` with wrong password 5 times in a row. The 6th attempt (even with the right password) must return 423 with `code: "LOCKED"`.

### V8. Discount cap rejection

Login as admin. Try to create a 30% discount:

```sh
curl -X POST http://localhost:4000/api/discounts \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Too big","type":"PERCENT","value":30}'
```

Must return 400 with `code: "DISCOUNT_CAP_EXCEEDED"`.

### V9. Stock decrement via API

Set today's stock for a tracked item to 5. Create an order, add the item with qty 6 → must fail with `OUT_OF_STOCK`. Add with qty 3 → success. Verify currentCount is now 2 via `GET /api/stock/today`.

### V10. Ensure admin cannot view daily report (role test)

Login as admin (not owner):

```sh
curl http://localhost:4000/api/reports/daily?date=2026-05-02 -H "Authorization: Bearer $ADMIN_TOKEN"
```

Must return 403.

Login as owner:

```sh
curl http://localhost:4000/api/reports/daily?date=2026-05-02 -H "Authorization: Bearer $OWNER_TOKEN"
```

Must return 200 with the (possibly stub) DTO.

## Definition of done

- [ ] All middleware files exist (auth, role, validate, errorHandler, rateLimit).
- [ ] All 11 controller files implemented.
- [ ] All 11 route files implemented and mounted in `app.ts`.
- [ ] `settingsService.loadAll()` called at startup before listen.
- [ ] All services that emit wrap mutations in `withEmitContext`.
- [ ] `pnpm typecheck` passes.
- [ ] V2-V10 all pass.
- [ ] `pnpm dev:master` boots and the renderer still shows the old health-check screen (no UI changes in this phase).

When all are checked, stop. Wait for human approval before phase `01-master/04-printer.md`.
