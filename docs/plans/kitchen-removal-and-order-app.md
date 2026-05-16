# Kitchen olib tashlash + order lifecycle soddalashtirish + Desktop Order app

## Context

Per-dish ingredient stock refactor tugadi va commit qilishga tayyor. Endi keyingi katta o'zgarish:

**Hozirgi modelda muammolar:**

1. **Kitchen Electron app** mavjud, KITCHEN roli bor, har sotuv `KitchenTicket` yozadi va kitchen room'ga emit qilinadi. Lekin amalda chayxanada alohida kitchen station kerak emas — admin (mas'ul kishi) ham buyurtmani tasdiqlaydi ham to'lovni qabul qiladi. Bu butun subsystem ortiqcha.

2. **Order lifecycle** 5 bosqichli: `DRAFT → SENT → BILL_REQUESTED → PENDING_PAYMENT → CLOSED`. Ofitsiant "Hisob so'rash" deydi, admin tasdiqlaydi, keyin alohida "To'landi" bosadi — bu 2 ta tugma haqiqatdan ham birga qilinadi. Soddalashtirilishi kerak.

3. **Ofitsiantlar** hozir faqat mobile orqali ishlay oladi. Restoran ichida desktop ham bo'lishi mumkin (touchscreen monoblok, klaviatura+sichqoncha) — alohida `apps/order/` kerak.

**Foydalanuvchi qaror qildi:**

- **Kitchen butunlay olib tashlanadi** (app, role, KitchenTicket model, socket room, ticket:* eventlar, kitchen-ticket printer flow, audit ref'lar).
- **Order lifecycle**: `DRAFT → SENT → CLOSED` (WALKOUT terminal alohida; CANCELED DRAFT/SENT dan). Admin "Tasdiqlash + To'lov" — bitta tugma, bitta modal, bitta flow.
- **Walkout saqlanadi**, UI'da o'zbekcha "To'lovsiz ketdi" label bilan.
- **Bekor qilish qoidasi**: Waiter faqat DRAFT, Admin DRAFT yoki SENT.
- **Mobile waiter** saqlanadi (UI tweaks).
- **Yangi `apps/order/`** — Electron desktop ofitsiant app, master sidebar uslubida.

**Outcome:** Yagona admin oynasidan buyurtma tasdiqlash + to'lov 1 ta tugmada bajariladi. Kitchen subsystem 100% olib tashlanadi (kod hajmi sezilarli kamayadi). Ofitsiantlar mobile yoki desktop'dan ishlay oladi.

## Final design

### Order lifecycle

```
DRAFT ──"Yuborish"──► SENT ──"Tasdiqlash+To'lov"──► CLOSED
                       │
                       ├──"Walkout"──► WALKOUT  (terminal)
                       │
                       └──"Bekor qilish"──► CANCELED
DRAFT ──"Bekor qilish"──► CANCELED
```

Holatlar:
- **DRAFT**: ofitsiant lin tahrirlaydi. Stock kamaymaydi? — kamayadi (hozirgidek, `addLine`'da). Ofitsiant DRAFT'da bekor qilsa — stock qaytadi.
- **SENT**: ofitsiant "Yuborish" bosgan. Admin'ning Tasdiqlash sahifasida ko'rinadi. SENT da ham line qo'shish mumkin (live bill). Ofitsiant bekor qila olmaydi. Admin bekor qilishi mumkin — **stock qaytmaydi** (taom tayyorlangan deb hisoblanadi; konservativ qoida).
- **CLOSED**: admin tasdiqladi va to'lovni qabul qildi. Chek chop etildi.
- **WALKOUT**: admin "to'lamasdan ketdi" deb belgiladi. Stock qaytmaydi.
- **CANCELED**: admin yoki ofitsiant bekor qilgan. DRAFT'dan bekor qilinsa stock qaytadi; SENT dan bekor qilinsa qaytmaydi.

### Yagona "Tasdiqlash + To'lov" endpoint

`POST /api/orders/:id/confirm` (replace `/approve` + `/mark-paid`):

```jsonc
{
  "discountId": "...",          // optional
  "waiveServiceCharge": false,  // optional
  "payments": [
    { "method": "CASH", "amount": 150000 },
    { "method": "CARD", "amount": 50000 }
    // OR: { "method": "DEBT", "amount": 200000, "debtorName": "Olim", "debtorPhone": "...", "debtorNote": "..." }
  ]
}
```

Server tartibi (yagona `$transaction`):
1. Order `SENT` da bo'lishini tekshirish.
2. Bill hisoblash (`billingService.computeBill`).
3. Payments yig'indisi total ga tengligini tekshirish (existing `Errors.PaymentMismatch`).
4. Snapshot fieldlarni yozish (`subtotalSnapshot`, `discountAmountSnapshot`, `serviceChargeSnapshot`, `totalSnapshot`).
5. `Payment` rowlarini yaratish.
6. Agar `DEBT` to'lov bor bo'lsa — `Debt` yaratish (existing `debtService.createFromOrder`).
7. **Chek chop etish** (blocking; xato bo'lsa butun tranzaksiya rollback, status SENT'da qoladi).
8. Status `CLOSED`. Audit log.
9. Emit `order:closed` admin + waiter room'larga.

Audit log: yangi `ORDER_CONFIRMED` action (yoki mavjud `ORDER_APPROVED` + `ORDER_MARKED_PAID` ni birlashtirish — keyinroq qaror).

### Walkout (alohida)

`POST /api/orders/:id/walkout` — mavjud bo'lsa saqlanadi, faqat guard'i `BILL_REQUESTED|PENDING_PAYMENT|SENT` dan `SENT` ga o'zgartiriladi. Stock qaytarilmaydi.

### Cancel rules (yangi)

- **Waiter**: faqat `DRAFT` (mavjud "all tickets PENDING" qoidasi olib tashlanadi).
- **Admin/Owner**: `DRAFT` yoki `SENT`.
- `CLOSED`, `WALKOUT`, `CANCELED` dan bekor qilish — har kim uchun yopiq.
- DRAFT'dan bekor qilinsa — ingredient qaytadi (`consumption.service.restore`).
- SENT'dan bekor qilinsa — ingredient **qaytmaydi** (konservativ, taom tayyorlangan deb hisoblanadi).

### Kitchen removal (ekzauz scope)

**Apps**: `apps/kitchen/` butun tree o'chiriladi.

**Schema** (`apps/master/prisma/schema.prisma`):
- `model KitchenTicket` — o'chiriladi (lines 371-388).
- `enum KitchenTicketStatus` — o'chiriladi.
- `UserRole.KITCHEN` — o'chiriladi.
- `OrderStatus.BILL_REQUESTED`, `OrderStatus.PENDING_PAYMENT` — o'chiriladi.
- `PrintJobType.KITCHEN_TICKET`, `PrintJobType.TICKET_REPRINT` — o'chiriladi.
- `OrderLine.kitchenTicketId` + `kitchenTicket` relation + `@@index([kitchenTicketId])` — o'chiriladi.
- `Order.kitchenTickets` relation — o'chiriladi.
- `PrintJob.ticketId` + `ticket` relation + `@@index([ticketId])` — o'chiriladi.

**Backend** (`apps/master/src/main/server/`):
- Delete: `services/kitchen.service.ts`, `repositories/kitchen.repo.ts`, `controllers/kitchen.controller.ts`, `routes/kitchen.routes.ts`, `printer/kitchen-ticket-builder.ts`.
- `app.ts`: drop `kitchenRouter` import + mount.
- `socket.ts:52`: drop `'kitchen'` room join logic.
- `order.service.ts`: drop `createAddonTicket()`, `KitchenTicketStatus` import, all `'kitchen'` room `deferEmit`, all `'ticket:*'` emits, `maybeRestoreLineStock`'s ticket guard (replaced with simple "is line uncanceled" + status check on order).
- `print.service.ts`: delete `tryPrintKitchenTicket()` (~lines 161-198) + `reprintKitchenTicket()` (~lines 236-276).
- `repositories/order.repo.ts`: drop `kitchenTickets` include in `findByIdWithDetails`.
- `repositories/orderLine.repo.ts`: drop `kitchenTicketId` from queries.
- `lib/scheduler.ts:14`: drop `kitchenTickets: { none: {} }` from draft cleanup (just `updatedAt < cutoff`).

**Frontend (master + mobile)**:
- `apps/master/src/renderer/hooks/useSocket.ts`: drop `ticket:*` listeners (lines 74-89).
- `apps/master/src/renderer/components/StatusBadge.tsx`: drop `BILL_REQUESTED`, `PENDING_PAYMENT` entries.
- `apps/master/src/renderer/pages/DashboardPage.tsx:18`: drop status references.
- `apps/master/src/renderer/pages/OrdersPage.tsx:44`: drop status references.
- `apps/mobile/src/screens/HomeScreen.tsx`: drop "Bill" tab (only "Work" remains: DRAFT + SENT).
- `apps/mobile/src/screens/OrderEditScreen.tsx`:
  - Drop "Hisob so'rash" button (lines 331-343).
  - Drop BILL_REQUESTED waiting spinner (345-350).
  - `canCancel` → `order.status === 'DRAFT'`.
  - Drop status variants for BILL_REQUESTED/PENDING_PAYMENT (lines 35-36).
- `apps/mobile/src/api/orders.ts:78`: drop `requestBill`.
- `apps/mobile/src/hooks/useSocket.ts`: drop `ticket:*` listeners.

**Seed** (`apps/master/prisma/seed.ts`):
- Drop kitchen1 user (lines ~107-110).

**Root tooling**:
- `package.json`: drop `dev:kitchen`, `build:kitchen` scripts.
- `pnpm-workspace.yaml`: no change (wildcard `apps/*` auto-excludes deleted dir).
- `CLAUDE.md`: update Commands section, drop Kitchen subsection, update socket rooms list.

### Single-action approval — frontend rewrite

**`apps/master/src/renderer/pages/ApprovalQueuePage.tsx`** (oldingi `ApprovalQueuePage` saqlanib, sodda qilinadi):

- Top: SENT statusdagi orderlar grid (kartochkalar).
- Kartochka: stol nomi, ofitsiant, line preview, total, "Tasdiqlash" tugmasi, "Walkout" alternative.
- Tasdiqlash bosilganda — yangi `ConfirmModal` ochiladi.

**Yangi `ConfirmModal.tsx`** (modal komponent):

```
┌────────────────────────────────────────┐
│ Buyurtma #XYZ — Xona 3 (Olim)          │
├────────────────────────────────────────┤
│ Lines:                                  │
│   2× Lag'mon sho'rva    60 000          │
│   1× Achichuk           18 000          │
│   1× Choy                8 000          │
│ ─────────                               │
│ Subtotal:               86 000          │
│ Chegirma: [Tanlang ▾]   −0              │
│ Xizmat haqi:  ☐ Bekor qilish   10 000  │
│ ─────────                               │
│ Jami:                   96 000          │
├────────────────────────────────────────┤
│ To'lov:                                 │
│   [Naqd]     [96 000]                   │
│   [+ Karta yoki Qarz]                   │
│ Jami to'lov: 96 000 / 96 000 ✓          │
├────────────────────────────────────────┤
│      [Bekor qilish]  [Tasdiqlash]      │
└────────────────────────────────────────┘
```

Quyidagi mavjud komponentlarni qayta ishlatish (existing `PaymentModal.tsx` ga juda yaqin — adapt qilinadi):
- `apps/master/src/renderer/components/PaymentModal.tsx` — to'lov rowlarini boshqarish UI'i bor. `ConfirmModal` shu komponentni o'rab oladi va bill preview + discount picker + waive toggle qo'shadi.

**Walkout alohida tugma** — modaldan tashqari kartochkada ham bor.

**Old buttonlarni olib tashlash:**
- `OrdersPage` ichida (yoki qaerda bo'lsa) — alohida "Tasdiqlash" + "To'landi deb belgilash" tugmalari → bitta "Tasdiqlash + To'lov" ga birlashtirish (yangi modal ochadi).

### Yangi `apps/order/` Electron app

**Skeleton:**

- Kopiya: `apps/kitchen/` Electron tuzilishi (package.json, electron.vite.config.ts, src/main/index.ts, MasterUrlProvider context, server-config.ts file persistence).
- Renderer UI: `apps/master/src/renderer/` uslubida (Sidebar + AppShell + shadcn/ui + Tailwind + TanStack Query + HashRouter).

**Sidebar tarkibi:**
| Bo'lim | Sahifa | Qo'llanilishi |
|---|---|---|
| Buyurtmalar | / (HomePage) | Faol orderlarim ro'yxati (DRAFT + SENT) |
| Buyurtmalar | /orders/new | Stol tanlash → DRAFT yaratish |
| Buyurtmalar | /orders/:id | Order edit (line qo'shish, yuborish) |
| Stollar | /tables | Stollar ro'yxati + bandlik |
| Menyu | /menu | Faqat ko'rish (read-only katalog) |
| Tizim | /settings | Server URL, diagnostika, chiqish |

**Pages:**
- `LoginPage` — PIN entry (4 raqam). Reuse mobile's auth pattern. POST `/api/auth/login-pin`.
- `ServerSetupPage` — birinchi marta server URL kiritish (kitchen pattern'i).
- `HomePage` — `ordersApi.list({ mine: true })`, faol orderlar grid. Click → `/orders/:id`.
- `NewOrderPage` — DINE_IN/TAKEAWAY + stol tanlash → `createDraft` → navigate to OrderDetail.
- `OrderDetailPage` — left: order lines + total + buttons (Send / Cancel); right: MenuPanel (categories + items + combos).
- `TablesPage` — stollar + faol order ko'rsatish (read-only).
- `MenuPage` — kategoriyalar bo'yicha menyu (read-only, ofitsiant ko'rishi uchun).
- `SettingsPage` — server URL o'zgartirish, vibration off (desktop'da yo'q), logout, diagnostika.

**Stores**: `auth.store`, `connection.store`, `toast.store` — kichik adaptatsiya bilan kopiya (Zustand persist via electron-store yoki localStorage).

**API client**: `apps/master/src/renderer/api/` dan kopiya, lekin `MasterUrlProvider` orqali base URL'ni dinamik o'qiydi (kitchen kabi).

**Socket hook**: mobile bilan bir xil (minus `ticket:*` — olib tashlangan). `useSocket.ts` da `connection:closed`, `order:closed`, `order:walkout`, `order:updated`, `menu:*`, `ingredient:stockChanged`, `auth:kicked` listenerlar.

**Build**: `electron-vite` setup kitchen bilan bir xil. `pnpm dev:order`, `pnpm build:order` root scriptlarga qo'shiladi.

### Decisions.md update (locked decisions)

Quyidagi bo'limlar qayta yoziladi:

1. **Roles** — KITCHEN qatori olib tashlanadi. ADMIN ning vazifalari kengaytiriladi (kitchen-ticket boshqaruvi yo'q, lekin admin barcha buyurtmalarni tasdiqlaydi).
2. **Order lifecycle** — 3 holatli diagramma (DRAFT, SENT, CLOSED + WALKOUT/CANCELED). KitchenTicket yo'q. Add-on flow soddalashadi: SENT da line qo'shish jaim mumkin, lekin yangi "ticket" yaratmaydi.
3. **Approval flow** — 2-step yo'q, 1-step: "Tasdiqlash + To'lov" yagona aktion.
4. **Real-time** — `kitchen` room va `ticket:*` eventlar yo'qoldi. Faqat `admin` va `waiter:{userId}`.
5. **Receipts and printer** — KITCHEN_TICKET / TICKET_REPRINT yo'q. Faqat BILL / BILL_REPRINT. C++ `receipt.exe` o'zgarmaydi, faqat kitchen-ticket-builder.ts deleted.
6. **OS target** — Kitchen monoblok yo'q. Order monoblok qo'shiladi (Windows 10 x64, touchscreen yoki klaviatura).

## File-by-file changelist

### Phase A — Schema + migration (~2h, blocking)

| File | Change |
|---|---|
| `apps/master/prisma/schema.prisma` | Drop `model KitchenTicket`, `enum KitchenTicketStatus`. Drop `KITCHEN` from `UserRole`. Drop `BILL_REQUESTED`, `PENDING_PAYMENT` from `OrderStatus`. Drop `KITCHEN_TICKET`, `TICKET_REPRINT` from `PrintJobType`. Drop `OrderLine.kitchenTicketId` + relation + index. Drop `Order.kitchenTickets` relation. Drop `PrintJob.ticketId` + relation + index. |
| `apps/master/prisma/migrations/<new>_remove_kitchen/migration.sql` | DROP TABLE `KitchenTicket`. SQLite rebuild for OrderLine (drop kitchenTicketId), PrintJob (drop ticketId). Enum drops are TS-only (SQLite stores enums as TEXT). |
| `apps/master/prisma/seed.ts` | Remove kitchen1 user block (~lines 107-110). Remove `UserRole.KITCHEN` import. |

**Note**: Mavjud SENT/BILL_REQUESTED/PENDING_PAYMENT/CLOSED orderlar dev DB toza bo'lsa muammo yo'q. Bo'lmasa: SQL data migration step kerak: `UPDATE Order SET status='SENT' WHERE status='BILL_REQUESTED'; UPDATE Order SET status='CLOSED' WHERE status='PENDING_PAYMENT'`.

### Phase B — Backend kitchen removal (~2-3h)

| File | Change |
|---|---|
| `apps/master/src/main/server/services/kitchen.service.ts` | **DELETE** |
| `apps/master/src/main/server/repositories/kitchen.repo.ts` | **DELETE** |
| `apps/master/src/main/server/controllers/kitchen.controller.ts` | **DELETE** |
| `apps/master/src/main/server/routes/kitchen.routes.ts` | **DELETE** |
| `apps/master/src/main/server/printer/kitchen-ticket-builder.ts` | **DELETE** |
| `apps/master/src/main/server/app.ts:13,35` | Drop `kitchenRouter` import + `app.use('/api/kitchen', ...)` |
| `apps/master/src/main/server/socket.ts:52` | Drop `if (user.role === 'KITCHEN') socket.join('kitchen')` |
| `apps/master/src/main/server/services/print.service.ts` | Drop `tryPrintKitchenTicket()` (~161-198), `reprintKitchenTicket()` (~236-276). Drop `kitchenRepo`, `buildKitchenTicketArgs` imports. |
| `apps/master/src/main/server/repositories/order.repo.ts` | Drop `kitchenTickets` from `findByIdWithDetails` include |
| `apps/master/src/main/server/repositories/orderLine.repo.ts` | Drop `kitchenTicketId` from selects/queries. Drop `attachToTicket()` method. |
| `apps/master/src/main/server/lib/scheduler.ts:14` | Drop `kitchenTickets: { none: {} }` filter from old-draft cleanup query |

### Phase C — Backend lifecycle simplification (~3-4h)

| File | Change |
|---|---|
| `apps/master/src/main/server/services/order.service.ts` | Delete `createAddonTicket()` function entirely (~125-149). Drop all `deferEmit('kitchen', ...)` calls. Drop all `'ticket:*'` emits. Rewrite `maybeRestoreLineStock`: drop ticketStatus param; restore only when `order.status === 'DRAFT'`. Drop `canWaiterCancel` (replace inline: `order.status === 'DRAFT'`). Drop `requestBill()` service method. Combine `approve()` + `markPaid()` into new `confirm()` method (signature: `{ orderId, discountId?, waiveServiceCharge?, payments[], requestingUser }`). Update `markWalkout()` guard: only from `SENT`. Update `cancelLine` and `cancelOrder` guards per new role rules. |
| `apps/master/src/main/server/controllers/orders.controller.ts` | Drop `approve()`, `markPaid()`, `requestBill()` handlers. Add new `confirm()` handler. Update validation schema. |
| `apps/master/src/main/server/routes/orders.routes.ts` | Drop `POST /:id/approve`, `POST /:id/mark-paid`, `POST /:id/request-bill`. Add `POST /:id/confirm` (ADMIN/OWNER). |
| `apps/master/src/main/server/services/billing.service.ts` | No structural change; `computeBill()` reused by new confirm flow |
| `apps/master/src/main/server/services/print.service.ts` | `printBill()` already exists — saqlanadi |
| `apps/master/src/main/server/lib/errors.ts` | Optional: `OrderAlreadyClosed`, `WalkoutFromInvalidState` lar update |
| `apps/master/src/main/server/services/audit.service.ts` | Optional: yangi `ORDER_CONFIRMED` action enum'ga qo'shish (yoki existing `ORDER_APPROVED` + audit metadata bilan markPaid'ni jamlash) |
| `apps/master/prisma/schema.prisma` (`AuditAction`) | Add `ORDER_CONFIRMED`; keep `WALKOUT_MARKED`; legacy `ORDER_APPROVED` ni saqlash (eski log uchun) |

### Phase D — Master frontend (~3-4h)

| File | Change |
|---|---|
| `apps/master/src/renderer/pages/ApprovalQueuePage.tsx` | Rewrite as the primary action surface: SENT orderlar grid, har birida [Tasdiqlash] va [Walkout] tugmalari. Tasdiqlash → `ConfirmModal` ochadi. |
| `apps/master/src/renderer/components/ConfirmModal.tsx` | **NEW** — bill preview + discount picker + service-charge waive + payment rows + single confirm button. Reuse `PaymentModal` logic for payment rows. |
| `apps/master/src/renderer/components/PaymentModal.tsx` | Either: extend to be `ConfirmModal` (single rewrite) OR keep separate and compose inside ConfirmModal. Recommend: extend (one modal). |
| `apps/master/src/renderer/pages/OrdersPage.tsx` | Drop standalone "Approve" + "Mark Paid" buttons. Drop status filters for BILL_REQUESTED/PENDING_PAYMENT (orders go directly SENT → CLOSED). |
| `apps/master/src/renderer/pages/DashboardPage.tsx` | Update status buckets (drop BILL_REQUESTED/PENDING_PAYMENT counters). |
| `apps/master/src/renderer/components/StatusBadge.tsx` | Drop BILL_REQUESTED, PENDING_PAYMENT entries. Update label colors. |
| `apps/master/src/renderer/api/orders.ts` | Drop `approve`, `markPaid`, `requestBill`. Add `confirm(orderId, body)`. |
| `apps/master/src/renderer/hooks/useSocket.ts:74-89` | Drop `ticket:*` listeners |
| `apps/master/src/renderer/components/layout/Sidebar.tsx` | Optional: clean up stale comments. ApprovalQueue link tartibi yangilash. |
| `apps/master/src/renderer/lib/audit-labels.ts` | Add `ORDER_CONFIRMED: "Buyurtma tasdiqlandi va to'landi"` |

### Phase E — Mobile cleanup (~1-2h)

| File | Change |
|---|---|
| `apps/mobile/src/screens/HomeScreen.tsx` | Drop "Bill" tab (BILL_REQUESTED+PENDING_PAYMENT bucket). Only "Faol" remains (DRAFT+SENT). |
| `apps/mobile/src/screens/OrderEditScreen.tsx` | Drop "Hisob so'rash" button (~lines 331-343). Drop BILL_REQUESTED spinner block (~345-350). `canCancel = order.status === 'DRAFT'`. Drop BILL_REQUESTED/PENDING_PAYMENT status variants. Drop ticket-related UI in line cards. |
| `apps/mobile/src/api/orders.ts:78` | Drop `requestBill` method |
| `apps/mobile/src/hooks/useSocket.ts:88-95` | Drop `ticket:*` listeners |
| `apps/mobile/src/components/MenuPanel.tsx` | Stock-related code shu refactor'da o'zgarmaydi (oldingi refactor allaqachon `effectivelyAvailable` ga ko'chirilgan) |

### Phase F — New `apps/order/` desktop app (~6-8h)

**Strukturasi (kopiya + adapt):**

| File | Source |
|---|---|
| `apps/order/package.json` | from `apps/kitchen/package.json` + add `@chayxana/order` name |
| `apps/order/electron.vite.config.ts` | from `apps/kitchen/` |
| `apps/order/tsconfig.json` | from `apps/kitchen/` |
| `apps/order/tailwind.config.js` | from `apps/master/` |
| `apps/order/src/main/index.ts` | from `apps/kitchen/` (BrowserWindow + IPC handlers for server URL) |
| `apps/order/src/main/server-config.ts` | from `apps/kitchen/` (file-based persistence in userData) |
| `apps/order/src/preload/index.ts` | from `apps/kitchen/` |
| `apps/order/src/renderer/main.tsx` | scaffold |
| `apps/order/src/renderer/App.tsx` | NEW — QueryClient + HashRouter + MasterUrlProvider + AppShell |
| `apps/order/src/renderer/providers/MasterUrlProvider.tsx` | from `apps/kitchen/` |
| `apps/order/src/renderer/components/layout/AppShell.tsx` | from `apps/master/` (adapted) |
| `apps/order/src/renderer/components/layout/Sidebar.tsx` | NEW — sections defined above |
| `apps/order/src/renderer/components/ConnectionBanner.tsx` | from `apps/kitchen/` or `apps/master/` |
| `apps/order/src/renderer/components/ConnectionDiagnostics.tsx` | from `apps/kitchen/` |
| `apps/order/src/renderer/components/ui/` | shadcn primitives — copy from `apps/master/` (button, card, input, dialog, select, etc.) |
| `apps/order/src/renderer/pages/LoginPage.tsx` | NEW — PIN entry, calls `authApi.loginPin(pin)` |
| `apps/order/src/renderer/pages/ServerSetupPage.tsx` | from `apps/kitchen/` |
| `apps/order/src/renderer/pages/HomePage.tsx` | NEW — `ordersApi.list({mine:true})` grid |
| `apps/order/src/renderer/pages/NewOrderPage.tsx` | NEW — order type + table picker → createDraft |
| `apps/order/src/renderer/pages/OrderDetailPage.tsx` | NEW — order lines left, MenuPanel right, Send/Cancel buttons |
| `apps/order/src/renderer/pages/TablesPage.tsx` | NEW — read-only tables grid with occupancy |
| `apps/order/src/renderer/pages/MenuPage.tsx` | NEW — read-only menu catalog |
| `apps/order/src/renderer/pages/SettingsPage.tsx` | NEW — server URL editor, diagnostics, logout |
| `apps/order/src/renderer/api/client.ts` | from `apps/kitchen/` (Bearer + MasterUrl) |
| `apps/order/src/renderer/api/auth.ts` | NEW |
| `apps/order/src/renderer/api/orders.ts` | NEW — create, addItem, addCombo, updateLineQuantity, editLineNote, cancelLine, send, cancel (no requestBill) |
| `apps/order/src/renderer/api/menu.ts` | NEW |
| `apps/order/src/renderer/api/tables.ts` | NEW |
| `apps/order/src/renderer/stores/auth.store.ts` | NEW — Zustand + electron-store persist |
| `apps/order/src/renderer/stores/connection.store.ts` | NEW |
| `apps/order/src/renderer/stores/toast.store.ts` | NEW |
| `apps/order/src/renderer/hooks/useSocket.ts` | NEW — subscribe to `order:*`, `menu:*`, `ingredient:stockChanged`, `auth:kicked` (NO ticket:*) |
| `apps/order/src/renderer/lib/socket-client.ts` | NEW — accepts MasterUrl as param |

**Root tooling:**
| File | Change |
|---|---|
| `package.json` | Add `"dev:order": "pnpm --filter @chayxana/order dev"` + `"build:order": "pnpm --filter @chayxana/order build"` |
| `package.json` | Drop `"dev:kitchen"`, `"build:kitchen"` |

### Phase G — Kitchen full delete + Docs (~1-2h)

| File / Dir | Change |
|---|---|
| `apps/kitchen/` | **DELETE entire directory** (after Phase B-F migrations done) |
| `docs/agent-plans/00-shared/decisions.md` | Rewrite sections: Roles (drop KITCHEN), Order lifecycle (3-state diagram), Approval flow (single step), Real-time (drop kitchen room, ticket events), Receipts and printer (drop kitchen ticket), Stack (drop kitchen app reference), OS target (replace kitchen monoblok with order monoblok). |
| `docs/PROJECT_TECHNICAL_OVERVIEW.md` | Update architecture diagram, removed kitchen subsection, update socket rooms list |
| `CLAUDE.md` | Drop "Kitchen (`apps/kitchen/`)" subsection. Update Commands section (drop dev:kitchen, build:kitchen, add dev:order, build:order). Update master's socket rooms description. |

## Critical files to open when executing

- `apps/master/prisma/schema.prisma` — schema source of truth (multiple removals)
- `apps/master/src/main/server/services/order.service.ts` — biggest service rewrite (lifecycle + cancel rules + confirm)
- `apps/master/src/main/server/services/print.service.ts` — drop kitchen methods
- `apps/master/src/renderer/components/PaymentModal.tsx` — base for new ConfirmModal
- `apps/master/src/renderer/pages/ApprovalQueuePage.tsx` — primary admin landing rewrite
- `apps/kitchen/` (entire tree) — reference for new `apps/order/` scaffold before deletion
- `apps/mobile/src/screens/OrderEditScreen.tsx` — biggest mobile cleanup

## Existing utilities to reuse (do NOT reinvent)

- `billingService.computeBill()` (`apps/master/src/main/server/services/billing.service.ts`) — bill math is correct, just called from new `confirm` flow
- `printService.printBill()` (`print.service.ts`) — bill print mutex + Audit logging
- `debtService.createFromOrder()` (`debt.service.ts`) — handles DEBT payment branch
- `paymentRepo.createBatch()` — bulk Payment row insert
- `consumptionService.consume/restore` (`consumption.service.ts`) — stock logic; unchanged
- `Errors.PaymentMismatch`, `Errors.IllegalStateTransition` (`lib/errors.ts`)
- `auditService.log(...)` (`audit.service.ts`)
- `apps/master/src/renderer/components/ui/*` shadcn primitives — copy to apps/order/
- `apps/kitchen/src/main/server-config.ts` + `MasterUrlProvider.tsx` — copy to apps/order/
- `apps/mobile/src/api/orders.ts` — endpoint shapes for the order app to mirror

## Verification

### Manual end-to-end smoke

1. **Migration**: `prisma migrate dev` clean apply, `tsx prisma/seed.ts` succeeds, no KITCHEN user.
2. **Master + Mobile flow**:
   - Waiter mobile PIN login → create draft → add 3 items → "Yuborish" → status SENT
   - Admin master "Tasdiqlash" sahifasida orderni ko'radi
   - "Tasdiqlash" tugmasi → ConfirmModal ochiladi → bill ko'rinadi → naqd 96000 kiritildi → "Tasdiqlash" → chek printer'ga (yoki mock'da) yuboriladi → status CLOSED → mobile'da yopilgan deb ko'rinadi
3. **Walkout**: Yangi order → SENT → admin "Walkout" tugmasi → status WALKOUT → ingredient stock o'zgarmaydi
4. **Cancel rules**:
   - Waiter DRAFT da bekor → muvaffaqiyatli, stock qaytadi
   - Waiter SENT da bekor urinish → 403 Forbidden
   - Admin SENT da bekor → muvaffaqiyatli, stock **qaytmaydi**
5. **Add-on in SENT**: Waiter SENT'dagi orderga yangi line qo'shadi → stock kamayadi (yangi consume movement), bill jami yangilanadi (admin live ko'radi)
6. **Kitchen verification (negative)**:
   - `apps/kitchen/` papkasi yo'q
   - `GET /api/kitchen/*` → 404
   - WebSocket'da `ticket:*` event'lar yo'q
   - DB'da `KitchenTicket` jadval yo'q
   - `seed-kitchen1` user yo'q
7. **Desktop Order app**:
   - `pnpm dev:order` Electron oynasi ochiladi
   - Server URL kiritish ekrani → http://localhost:4000 → davom
   - PIN 5678 → login → Home (faol orderlar bo'sh)
   - "Yangi buyurtma" → DINE_IN + Xona 1 → DRAFT yaratiladi
   - Menyudan 2 ta lag'mon, 1 ta non → "Yuborish" → status SENT
   - Master oynasida o'sha order Tasdiqlash sahifasida darhol paydo bo'ladi (socket real-time)

### Smoke scripts

- `apps/master/scripts/api-smoke.sh` — update: drop `/api/kitchen/*` calls, replace approve+markPaid sequence with single confirm
- `apps/master/scripts/simulate-full-flow.sh` — update: new lifecycle, drop kitchen ticket assertions

### Pre-merge gates

- `pnpm typecheck` butun monorepo bo'yicha o'tadi
- `pnpm --filter @chayxana/master exec prisma migrate dev` toza
- Master + Mobile + Order desktop kompilyatsiya bo'ladi va ishga tushadi
- Manual smoke end-to-end o'tadi
- decisions.md va PROJECT_TECHNICAL_OVERVIEW.md mos kelgan

## Phasing for the next session

Yangi sessiyada qadamlar tartibi (har bir Phase'dan keyin commit):

1. **Commit current state** (per-dish ingredient refactor) → push.
2. **Phase A** schema + migration → commit.
3. **Phase B** kitchen backend delete + Phase C lifecycle changes → commit (these depend on each other).
4. **Phase D** master frontend ConfirmModal + ApprovalQueue rewrite → commit.
5. **Phase E** mobile cleanup → commit.
6. **Phase F** new apps/order/ scaffold + pages → commit (largest single commit).
7. **Phase G** kitchen full delete + docs → final commit.

Har Phase'dan keyin manual smoke. Yakuniy push faqat full smoke o'tgandan keyin.

## Total effort estimate: ~18-22h (3 ish kuni)

| Phase | Effort | Risk |
|---|---|---|
| A — Schema | 2h | Low (dev DB qayta yaratiladi) |
| B — Kitchen backend delete | 2-3h | Low (faqat o'chirish) |
| C — Lifecycle rewrite | 3-4h | Medium (confirm flow yangi, billing + print birga ishlatilishi kerak) |
| D — Master frontend | 3-4h | Medium (UX juda muhim, ConfirmModal yangi komponent) |
| E — Mobile cleanup | 1-2h | Low |
| F — New apps/order/ | 6-8h | High (yangi app, ko'p fayl) |
| G — Cleanup + docs | 1-2h | Low |
