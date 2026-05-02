# API contract

All endpoints served by the Master backend at `http://192.168.1.10:4000`. Authenticated endpoints require `Authorization: Bearer <token>`.

Body and response are JSON. Errors return:

```json
{ "error": { "code": "STRING_CODE", "message": "Human-readable string", "details": {} } }
```

## Auth

| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` | `{ token, user }` | public |
| POST | `/api/auth/login-pin` | `{ pin }` | `{ token, user }` | public |
| POST | `/api/auth/logout` | — | `{ ok: true }` | any |
| GET | `/api/auth/me` | — | `{ user }` | any |

Login behavior:

- Wrong credentials 5x in a row → user locked for 5 minutes (`User.lockedUntil`).
- Successful login deletes any existing sessions for that user (single-device rule).
- PIN endpoint additionally rate-limited per IP (e.g., 30 requests per minute).

## Menu

| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| GET | `/api/menu` | — | `{ categories: [...with items] }` | any |
| GET | `/api/menu/categories` | — | `[Category]` | any |
| POST | `/api/menu/categories` | `{ name, displayOrder? }` | `Category` | ADMIN, OWNER |
| PATCH | `/api/menu/categories/:id` | `{ name?, displayOrder?, isActive? }` | `Category` | ADMIN, OWNER |
| GET | `/api/menu/items` | — | `[MenuItem]` | any |
| POST | `/api/menu/items` | `{ categoryId, name, price, description?, displayOrder?, trackStock? }` | `MenuItem` | ADMIN, OWNER |
| PATCH | `/api/menu/items/:id` | partial | `MenuItem` | ADMIN, OWNER |
| PATCH | `/api/menu/items/:id/availability` | `{ isAvailable }` | `MenuItem` | ADMIN, OWNER, KITCHEN |
| GET | `/api/menu/combos` | — | `[Combo]` | any |
| POST | `/api/menu/combos` | `{ name, components: [{ menuItemId, quantity }] }` | `Combo` | ADMIN, OWNER |
| PATCH | `/api/menu/combos/:id` | partial | `Combo` | ADMIN, OWNER |

## Tables

| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| GET | `/api/tables` | — | `[Table & { activeOrderId?: string }]` | any |
| POST | `/api/tables` | `{ name, type, displayOrder? }` | `Table` | ADMIN, OWNER |
| PATCH | `/api/tables/:id` | partial | `Table` | ADMIN, OWNER |

`activeOrderId` is the ID of any active (non-terminal) order on this table, or null. Used by waiter app to gray out occupied tables.

## Orders

| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| POST | `/api/orders` | `{ orderType, tableId? }` | `Order` | WAITER |
| GET | `/api/orders?status=&mine=true&date=` | — | `[Order]` | varies |
| GET | `/api/orders/:id` | — | full Order DTO | varies |
| POST | `/api/orders/:id/items` | `{ menuItemId, quantity, notes? }` | `OrderLine` | WAITER (own) |
| POST | `/api/orders/:id/combos` | `{ comboId }` | `[OrderLine]` | WAITER (own) |
| PATCH | `/api/orders/:id/lines/:lineId/notes` | `{ notes }` | `OrderLine` | WAITER (own); only if line's ticket null or PENDING |
| POST | `/api/orders/:id/lines/:lineId/cancel` | `{ reason? }` | `OrderLine` | WAITER (own) if all tickets PENDING; ADMIN otherwise |
| POST | `/api/orders/:id/send` | — | `Order` | WAITER (own) |
| POST | `/api/orders/:id/transfer` | `{ tableId }` | `Order` | WAITER (own) or ADMIN/OWNER |
| POST | `/api/orders/:id/request-bill` | — | `Order` | WAITER (own) |
| POST | `/api/orders/:id/cancel` | `{ reason }` | `Order` | WAITER (own) if all tickets PENDING; ADMIN/OWNER otherwise |
| POST | `/api/orders/:id/approve` | `{ discountId?, serviceChargeWaived? }` | `Order` | ADMIN, OWNER |
| POST | `/api/orders/:id/mark-paid` | `{ payments: [{ method, amount, reference? }] }` | `Order` | ADMIN, OWNER |
| POST | `/api/orders/:id/mark-walkout` | `{ reason }` | `Order` | ADMIN, OWNER |
| POST | `/api/orders/:id/reprint-bill` | `{ reason? }` | `PrintJob` | ADMIN, OWNER |

`mine=true` filters orders to the calling waiter. Without it, ADMIN/OWNER sees all, WAITER sees their own anyway (forced).

State transitions enforced by the service layer. Invalid transitions return 409 with `code: "ILLEGAL_STATE"`.

## Kitchen

| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| GET | `/api/kitchen/tickets/active` | — | `[KitchenTicket & { order, lines }]` | KITCHEN, ADMIN, OWNER |
| GET | `/api/kitchen/tickets/:id` | — | full Ticket DTO | KITCHEN, ADMIN, OWNER |
| PATCH | `/api/kitchen/tickets/:id` | `{ status: 'IN_PROGRESS' \| 'READY' }` | `KitchenTicket` | KITCHEN |
| POST | `/api/kitchen/tickets/:id/reprint` | — | `PrintJob` | KITCHEN, ADMIN, OWNER |

Active = `status IN (PENDING, IN_PROGRESS)`.

## Discounts

| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| GET | `/api/discounts` | — | `[Discount]` | ADMIN, OWNER |
| POST | `/api/discounts` | `{ name, type, value }` | `Discount` | ADMIN, OWNER |
| PATCH | `/api/discounts/:id` | partial | `Discount` | ADMIN, OWNER |
| DELETE | `/api/discounts/:id` | — | `{ ok: true }` | ADMIN, OWNER (soft-delete) |

Validation at create/edit: if `value` exceeds the relevant cap (`max_discount_percent` or `max_discount_amount`), reject with 400.

## Stock

| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| GET | `/api/stock/today` | — | `[{ menuItemId, name, initialCount, currentCount }]` | any |
| POST | `/api/stock/today` | `{ entries: [{ menuItemId, count }] }` | `[DailyStock]` | ADMIN, OWNER |
| PATCH | `/api/stock/today/:menuItemId` | `{ count }` | `DailyStock` | ADMIN, OWNER |
| GET | `/api/stock/history?menuItemId=&from=&to=` | — | `[DailyStock]` | OWNER |

Notes:

- `GET /api/stock/today` returns rows for tracked items (`MenuItem.trackStock = true`). For tracked items with no row for today, returns `initialCount: 0, currentCount: 0`.
- `POST /api/stock/today` upserts: creates rows where missing, updates where present. Logs `DAILY_STOCK_SET` audit entries.
- `PATCH /api/stock/today/:menuItemId` updates a single row. Logs `DAILY_STOCK_ADJUSTED`.
- WAITER role can read `GET /api/stock/today` to display "X left" hints, but cannot mutate.

## Reports & audit

| Method | Path | Query | Response | Roles |
|---|---|---|---|---|
| GET | `/api/reports/daily` | `?date=YYYY-MM-DD` | DailyReport DTO | OWNER |
| GET | `/api/reports/monthly` | `?month=YYYY-MM` | MonthlyReport DTO | OWNER |
| GET | `/api/audit` | `?action=&userId=&from=&to=&page=&pageSize=` | `{ items, total, page }` | OWNER |

DailyReport DTO shape:

```ts
{
  date: string;                      // YYYY-MM-DD
  orders: { closed: number; canceled: number; walkout: number; total: number };
  revenue: { gross: string; discounts: string; net: string };  // UZS strings
  serviceCollected: string;
  payments: { cash: string; card: string };
  perWaiter: Array<{
    waiterId: string;
    waiterName: string;
    orders: number;
    revenue: string;
    serviceEarned: string;
  }>;
  cancellations: Array<{ orderId: string; canceledAt: string; canceledBy: string; reason: string }>;
  walkouts: Array<{ orderId: string; markedAt: string; markedBy: string; amount: string; reason: string }>;
}
```

MonthlyReport DTO shape: aggregate totals (same shape as Daily but for the month) + `daily: DailyReport[]` array of per-day rows.

## Settings & Users

| Method | Path | Body | Response | Roles |
|---|---|---|---|---|
| GET | `/api/settings` | — | `{ key: value, ... }` | ADMIN, OWNER |
| PATCH | `/api/settings` | `{ key, value }` | `{ key, value }` | varies per key (see decisions.md) |
| GET | `/api/users` | — | `[User]` | ADMIN, OWNER |
| POST | `/api/users` | `{ role, fullName, username?, password?, pin? }` | `User` | ADMIN, OWNER (only OWNER can create OWNER) |
| PATCH | `/api/users/:id` | partial | `User` | ADMIN, OWNER |
| POST | `/api/users/:id/deactivate` | — | `User` | ADMIN, OWNER |

Deactivating a user:

- Sets `isActive = false`.
- Deletes all sessions for that user (logs them out everywhere immediately).
- Logs `USER_DEACTIVATED` audit entry.

## WebSocket

Mounted on the same HTTP server. Default `/socket.io` path. Authentication via handshake `auth: { token }`.

On successful connect, server joins client to rooms by role:

- OWNER, ADMIN → room `admin`
- KITCHEN → room `kitchen`
- WAITER → room `waiter:{userId}`

### Server → Client events

| Event | Payload | Rooms | Trigger |
|---|---|---|---|
| `ticket:new` | `{ ticketId }` | `kitchen`, `waiter:{wid}` | New `KitchenTicket` created |
| `ticket:statusChanged` | `{ ticketId, status }` | `kitchen`, `waiter:{wid}` | Ticket status changed |
| `ticket:noteEdited` | `{ ticketId, lineId }` | `kitchen` | Note edited on PENDING line |
| `ticket:canceled` | `{ ticketId, reason }` | `kitchen`, `waiter:{wid}` | Ticket canceled by admin |
| `order:billRequested` | `{ orderId }` | `admin` | Waiter requested bill |
| `order:updated` | `{ orderId }` | `admin` | Items added during BILL_REQUESTED |
| `order:approved` | `{ orderId }` | `admin`, `waiter:{wid}` | Bill approved |
| `order:closed` | `{ orderId }` | `admin`, `waiter:{wid}` | Marked paid |
| `order:walkout` | `{ orderId }` | `admin`, `waiter:{wid}` | Marked walkout |
| `order:transferred` | `{ orderId, fromTableId, toTableId }` | `kitchen`, `admin`, `waiter:{wid}` | Table transfer |
| `menu:itemAvailability` | `{ menuItemId, isAvailable }` | all rooms | Item availability toggled |
| `stock:changed` | `{ menuItemId, currentCount }` | all rooms | Stock count changed (decrement, restore, edit) |

All payloads are minimal. Clients re-fetch via REST after any event.

### Client → Server events

None. Clients never push events. All mutations are HTTP.

## Auth flow

1. Client calls `POST /api/auth/login` (or `login-pin`).
2. Server validates credentials with bcryptjs.
3. Server deletes existing sessions for the user.
4. Server creates new `Session` row with random 32-byte base64url token.
5. Returns `{ token, user }`.
6. Client stores token (AsyncStorage on mobile, localStorage in Electron renderer).
7. Subsequent REST requests include `Authorization: Bearer <token>`.
8. WebSocket connect passes `auth: { token }` in handshake.
9. Each REST request: middleware looks up session, validates expiry, attaches `req.user`, updates `lastUsedAt`.
10. On 401 from REST, client clears token and routes to login.
11. On socket auth failure, server emits `connect_error`, client reroutes to login.

## Error codes

Stable code strings the UI can switch on:

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Authenticated but role insufficient |
| `NOT_FOUND` | 404 | Entity does not exist |
| `VALIDATION` | 400 | Body schema invalid |
| `CONFLICT` | 409 | Generic conflict (e.g., table already has active order) |
| `ILLEGAL_STATE` | 409 | Invalid state transition |
| `OUT_OF_STOCK` | 409 | Menu item has 0 stock today |
| `ITEM_UNAVAILABLE` | 409 | Menu item is `isAvailable: false` |
| `DISCOUNT_CAP_EXCEEDED` | 400 | Discount value above cap |
| `PRINT_FAILED` | 500 | Receipt print failed (after retries) |
| `LOCKED` | 423 | User account locked due to failed logins |
| `PAYMENT_MISMATCH` | 400 | Payment rows do not sum to order total |
