# Chayxana POS — Detailed Technical Specification

This document provides a granular technical definition for each component of the Chayxana POS system.

---

## 1. API Specification

### Base Configuration
- **Server**: Integrated in Master app, listening on `0.0.0.0:4000`.
- **Auth**: `Authorization: Bearer <token>` in headers.
- **Error Format**:
  ```json
  { "error": { "code": "STRING", "message": "Description", "details": {} } }
  ```

### Authentication (`/api/auth`)
- `POST /login`: `{ username, password }` → `{ token, user }`. single-device rule.
- `POST /login-pin`: `{ pin }` → `{ token, user }`. Rate-limited per IP.
- `GET /me`: Returns current authenticated user.

### Menu Management (`/api/menu`)
- `GET /`: Nested structure of categories and items.
- `GET /categories`: List all categories.
- `POST /categories`: (Admin/Owner) Create category.
- `GET /items`: List all menu items.
- `POST /items`: (Admin/Owner) Create menu item. `trackStock` boolean determines if it hits the DailyStock logic.
- `PATCH /items/:id/availability`: (Kitchen/Admin/Owner) Toggle `isAvailable`.

### Orders (`/api/orders`)
- `POST /`: (Waiter/Owner) Create DRAFT order.
- `GET /`: List orders with filters (`status`, `mine`, `date`).
- `POST /:id/items`: (Waiter/Owner) Add `MenuItem` to order. Atomic stock decrement if tracked.
- `POST /:id/combos`: (Waiter/Owner) Add `Combo` (expands into multiple lines).
- `POST /:id/send`: (Waiter/Owner) Moves DRAFT → SENT. Fires first `KitchenTicket`.
- `POST /:id/request-bill`: (Waiter/Owner) SENT → BILL_REQUESTED.
- `POST /:id/approve`: (Admin/Owner) Finalizes totals, prints bill, moves to PENDING_PAYMENT.
- `POST /:id/mark-paid`: (Admin/Owner) Records `Payment` rows, moves to CLOSED.
- `POST /:id/mark-walkout`: (Admin/Owner) Moves to WALKOUT.
- `POST /:id/cancel`: (Waiter/Admin/Owner) Terminal cancellation. Waiter can only cancel if no kitchen tickets are started.

### Kitchen Display (`/api/kitchen`)
- `GET /tickets/active`: Tickets in PENDING or IN_PROGRESS.
- `PATCH /tickets/:id`: (Kitchen) Set status to `IN_PROGRESS` or `READY`.

---

## 2. Real-Time Specification (Socket.io)

### Room Logic
- `admin`: OWNER and ADMIN roles.
- `kitchen`: KITCHEN role.
- `waiter:{userId}`: Specific waiter role.

### Events (Server → Client)
- `ticket:new`: New ticket created (sent to `kitchen` and the specific `waiter`).
- `ticket:statusChanged`: Status move in kitchen.
- `order:billRequested`: Notifies `admin` room to approve.
- `order:approved`: Notifies `waiter` that bill is ready for payment.
- `stock:changed`: Broadcasts `{ menuItemId, currentCount }` to all clients.

---

## 3. Application: Master (`@chayxana/master`)

### Architecture
- **Process Model**: Electron Main (Server/Logic) and Electron Renderer (Admin UI).
- **Communication**: Renderer communicates with Main via standard HTTP/WS, treating it as a remote server even though it's local.
- **Backend Layers**:
  - **Routes**: Express routing + Role middleware.
  - **Controllers**: Zod validation + Service calling.
  - **Services**: Business logic, transactions, state machine enforcement.
  - **Repositories**: Direct Prisma access.

### Critical Services
- **Printer Service**: Uses `p-queue` (concurrency: 1) to serialize access to `receipt.exe`.
- **Scheduler**: Daily task to clean up stale DRAFT orders (>12h).
- **SQLite Bootstrap**: In packaged builds, ensures the `.db` file exists in `userData` and is migrated using a custom runtime setup.

---

## 4. Application: Kitchen (`@chayxana/kitchen`)

### Technical Definition
- **Role**: Read-only display of `KitchenTicket` entities.
- **State Management**: Uses TanStack Query for the ticket list, invalidated by `ticket:new` and `ticket:statusChanged` socket events.
- **UI Logic**: Tickets are grouped by time and status. Sound alerts (Web Audio API) trigger on `ticket:new`.
- **Control**: Single action (status toggle) per ticket. No order creation or editing.

---

## 5. Application: Mobile (`@chayxana/mobile`)

### Technical Definition
- **Framework**: Expo (Managed Workflow), React Native.
- **Auth Flow**: PIN-based entry. Tokens stored in `SecureStore`.
- **Navigation**: Native Stack Navigator. Screens: `Home` (Table Map/List), `NewOrder`, `OrderDetails`, `Settings`.
- **Data Flow**: Optimistic UI for adding items, but state is primarily server-driven. Every "Add" action is a REST call to ensure stock accuracy.
- **Connectivity**: Global `ConnectionBanner` component monitors Socket.io connection status and displays a visual indicator.

---

## 6. Printer Service (`receipt.exe`)

### Technical Definition
- **Language**: C++17.
- **Libraries**: `winspool.lib` (Windows Print Spooler).
- **Protocol**: RAW ESC/POS.
- **Execution**:
  ```bash
  receipt.exe <printerName> <heading> <orderInfo> <itemsData> <subtotal> <discount> <total>
  ```
- **Encoding**: Arguments passed as UTF-8, converted to WideChar (UTF-16) for Win32 API.
- **Logic**: Handles 80mm width (48 chars), centering, bolding, and partial cutting.

---

## 7. Data Resilience & DevOps

- **Database**: Prisma with SQLite. `binaryTargets` includes Windows and Debian for cross-platform development/deployment.
- **Logging**: Rotating file logs in `app.getPath('userData')`:
  - `startup.log`: Initial bootstrap sequence.
  - `runtime.log`: Main server/logic logs.
  - `renderer.log`: Electron UI console output.
- **Deployment**: Master app is packaged as an `.exe`. It bundles `receipt.exe` and the Prisma engine.
