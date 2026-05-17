# Conventions

These are the code-style and pattern rules. Every phase enforces these. The agent must follow them without being reminded.

## Repository layout (monorepo)

```
chayxana-pos/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps/
│   ├── master/
│   ├── kitchen/
│   └── mobile/
└── packages/
    ├── shared-types/
    └── shared-api/
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Package names are scoped under `@chayxana`:

- `@chayxana/master`
- `@chayxana/mobile`
- `@chayxana/order`
- `@chayxana/shared-types`
- `@chayxana/shared-api`

## TypeScript

- `strict: true`. Always.
- `noUncheckedIndexedAccess: true`.
- `noImplicitOverride: true`.
- `target: "ES2022"`.
- `tsconfig.base.json` at the root, every app/package extends it.
- No `any` shortcuts. If a type is genuinely unknown, use `unknown` and narrow.

## Code style

- 2-space indent.
- Single quotes for strings.
- Semicolons required.
- Trailing commas in multi-line literals.
- Arrow functions for callbacks; `function` keyword OK for top-level functions.
- ES modules in shared packages and frontend code; CommonJS in the master backend (Electron main runs CJS).
- Named exports preferred. Default exports allowed only for React components and Electron entry points.

Naming:

- Files: `kebab-case.ts` for code, `PascalCase.tsx` for React components.
- Variables and functions: `camelCase`.
- Types and interfaces: `PascalCase`.
- Constants exported from a module: `SCREAMING_SNAKE_CASE`.
- Prisma model names: `PascalCase` singular.
- Database table names follow Prisma's default (matches model name).
- Enum values: `SCREAMING_SNAKE_CASE`.

## Error handling

The master backend uses a single `AppError` class. Services and middleware throw it; a central error middleware translates it to JSON.

```ts
// apps/master/src/main/server/lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  Unauthorized: () => new AppError('UNAUTHORIZED', 401, 'Authentication required'),
  Forbidden: (msg = 'Forbidden') => new AppError('FORBIDDEN', 403, msg),
  NotFound: (entity: string) => new AppError('NOT_FOUND', 404, `${entity} not found`),
  Conflict: (msg: string) => new AppError('CONFLICT', 409, msg),
  Validation: (msg: string, details?: unknown) =>
    new AppError('VALIDATION', 400, msg, details),
  IllegalStateTransition: (from: string, to: string) =>
    new AppError('ILLEGAL_STATE', 409, `Cannot transition from ${from} to ${to}`),
  OutOfStock: (itemName: string) =>
    new AppError('OUT_OF_STOCK', 409, `${itemName} is out of stock today`),
  ItemUnavailable: (itemName: string) =>
    new AppError('ITEM_UNAVAILABLE', 409, `${itemName} is unavailable`),
  DiscountCapExceeded: (msg: string) =>
    new AppError('DISCOUNT_CAP_EXCEEDED', 400, msg),
  PrintFailed: (msg: string, details?: unknown) =>
    new AppError('PRINT_FAILED', 500, msg, details),
  Locked: (until: Date) =>
    new AppError('LOCKED', 423, `Account locked until ${until.toISOString()}`, { until }),
  PaymentMismatch: (msg: string) =>
    new AppError('PAYMENT_MISMATCH', 400, msg),
};
```

Error middleware:

```ts
// apps/master/src/main/server/middleware/errorHandler.ts
import { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  // unknown error
  console.error('[unhandled]', err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
};
```

Mounted last in the Express app, after all routes.

## Three-layer architecture (master backend)

Strict separation:

- **Routes** (`server/routes/*.routes.ts`) — Express router definitions. Mounts controllers. Applies auth/role middleware. No logic.
- **Controllers** (`server/controllers/*.controller.ts`) — parse + validate input (zod), call service, return response. No business logic.
- **Services** (`server/services/*.service.ts`) — business logic, orchestration, transactions, validation of state transitions. Calls repositories. Calls other services. Never touches Prisma directly except via repos.
- **Repositories** (`server/repositories/*.repo.ts`) — Prisma queries only. Each method takes optional `tx?: Prisma.TransactionClient` so services can compose calls inside `$transaction`.

```
HTTP request
  → Route (auth + role middleware)
  → Controller (zod parse + call service)
  → Service (business logic, transactions)
  → Repository (Prisma)
  → Database
```

**Prisma is touched ONLY in repositories.** No exceptions. Not in services, not in controllers.

## Validation

zod schemas for every request body. Defined in the controller file or co-located.

```ts
import { z } from 'zod';

const createOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']),
  tableId: z.string().nullable().optional(),
});

export const ordersController = {
  async create(req, res, next) {
    try {
      const body = createOrderSchema.parse(req.body);
      const order = await orderService.createDraft({
        waiterId: req.user!.id,
        ...body,
        tableId: body.tableId ?? null,
      });
      res.status(201).json(order);
    } catch (e) {
      next(e);
    }
  },
};
```

## Transactions

Use `prisma.$transaction(async (tx) => { ... })` for any multi-step mutation. Inside the callback, always pass `tx` to repository methods. Repositories accept optional `tx`:

```ts
// repository
async create(data: Prisma.OrderCreateInput, tx?: Prisma.TransactionClient) {
  return (tx ?? getPrisma()).order.create({ data });
}

// service
return getPrisma().$transaction(async (tx) => {
  const order = await orderRepo.create(data, tx);
  await otherRepo.update(..., tx);
  return order;
});
```

## Socket emit pattern

Socket events must be emitted **after** the transaction commits. To do this safely, use the deferred-emit pattern:

```ts
// in service:
return getPrisma().$transaction(async (tx) => {
  // ... mutations ...
  deferEmit('kitchen', 'ticket:new', { ticketId });
  deferEmit(`waiter:${order.waiterId}`, 'ticket:new', { ticketId });
  return result;
}).then(async (result) => {
  await flushDeferredEmits();
  return result;
});
```

Implementation in `server/lib/socket-events.ts` uses `AsyncLocalStorage` to scope the emit buffer per request. Events fire only after the transaction resolves successfully. If the transaction rolls back, the buffer is discarded.

## Atomic state transitions

Every state-changing update on `Order` (or any model with a status field) must use a guarded `update`:

```ts
// instead of:
await tx.order.update({ where: { id }, data: { status: 'PENDING_PAYMENT' } });

// do:
const result = await tx.order.updateMany({
  where: { id, status: 'BILL_REQUESTED' },
  data: { status: 'PENDING_PAYMENT' },
});
if (result.count === 0) throw Errors.IllegalStateTransition('?', 'PENDING_PAYMENT');
```

This prevents two simultaneous approvals from both succeeding when only one should win.

## Frontend conventions

- React 18, function components, hooks only. No class components.
- Routing: `react-router-dom` v6 in Electron renderers. Stack navigator (`@react-navigation/native-stack`) in mobile.
- State: TanStack Query for server state. Zustand for local global state (auth, connection status). No Redux.
- Forms: `react-hook-form` + zod (same schemas as backend ideally).
- Styling: Tailwind CSS in both Electron renderers. Inline styles or StyleSheet.create in mobile.
- Components: one component per file. Co-locate small helper components in the same file when they're only used there.
- Hooks: named `useXxx`. Live in a `hooks/` folder unless they're co-located with a single component.

## Internationalization

- All UI strings hardcoded in Uzbek (Latin script).
- No i18n library.
- Numbers: thousand separator is a non-breaking space `\u00A0`. UZS amounts have no decimals in display.
- Dates: `DD.MM.YYYY HH:MM`. Use a small `format.ts` utility, do not use `date-fns` formatters with locale code.

```ts
// apps/master/src/main/server/lib/format.ts
export function formatUZS(amount: number | string): string {
  const n = typeof amount === 'string' ? parseInt(amount, 10) : amount;
  return n.toLocaleString('uz-UZ').replace(/,/g, '\u00A0');
}

export function formatDateTimeUZ(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

## Logging

- Master backend: `console.log` is fine in dev. In production (Phase 10), wrap with a tiny rotating-file logger in `lib/logger.ts`.
- No `console.log` in renderer code. Use a wrapper that's stripped in production.
- `PrintJob` rows are the audit trail for printing — do not also log to file.
- Audit log rows in `AuditLog` are the audit trail for sensitive actions — do not also log them to console.

## Git hygiene

- Never commit `.env`. Always commit `.env.example`.
- Never commit `node_modules/`, `dist/`, `build/`.
- Commit `pnpm-lock.yaml`.
- Migrations folder (`apps/master/prisma/migrations/`) is committed.
- The compiled `receipt.exe` binary is committed under `apps/master/resources/bin/` because it's the deployment artifact.

## Things the agent must NOT do

- Do not introduce libraries not listed in this file or in the phase's task list.
- Do not refactor existing code unless the phase explicitly asks for refactor.
- Do not write tests unless the phase asks for tests. (We are not building automated tests in v1; verification is manual.)
- Do not add comments for "why" unless the code does something genuinely non-obvious. The plan is the documentation.
- Do not run `prisma migrate reset` unless explicitly told to.
- Do not run `pnpm update` to bump dependencies.
- Do not "improve" the schema. The schema in `00-shared/schema.md` is final.
- Do not skip the verification step. A phase is not complete until verification passes.
