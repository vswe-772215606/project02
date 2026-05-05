# Prisma schema (full)

This is the canonical schema. Copy it verbatim into `apps/master/prisma/schema.prisma`. Do not change models or fields without explicit human approval.

The partial unique index on `Order(tableId)` cannot be expressed in Prisma syntax. It must be added as a raw SQL migration after `prisma migrate dev --name init`. See "Partial unique index migration" at the bottom of this file.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// ENUMS
// ============================================================

enum UserRole {
  OWNER
  ADMIN
  KITCHEN
  WAITER
}

enum TableType {
  ROOM
  TABLE
}

enum OrderType {
  DINE_IN
  TAKEAWAY
}

enum OrderStatus {
  DRAFT
  SENT
  BILL_REQUESTED
  PENDING_PAYMENT
  CLOSED
  WALKOUT
  CANCELED
}

enum KitchenTicketStatus {
  PENDING
  IN_PROGRESS
  READY
  CANCELED
}

enum DiscountType {
  PERCENT
  FIXED
}

enum PaymentMethod {
  CASH
  CARD
  DEBT
}

enum PrintJobType {
  KITCHEN_TICKET
  BILL
  BILL_REPRINT
  TICKET_REPRINT
}

enum PrintJobStatus {
  PENDING
  SUCCESS
  FAILED
}

enum ExpenseStatus {
  ACTIVE
  REVERSED
  REVERSAL
}

enum DebtStatus {
  OPEN
  PARTIAL
  PAID
}

enum AuditAction {
  USER_CREATED
  USER_DEACTIVATED
  DISCOUNT_CREATED
  DISCOUNT_EDITED
  DISCOUNT_DELETED
  DISCOUNT_APPLIED
  ORDER_CANCELED
  WALKOUT_MARKED
  TABLE_TRANSFERRED
  RECEIPT_REPRINTED
  SETTINGS_CHANGED
  SERVICE_CHARGE_WAIVED
  DAILY_STOCK_SET
  DAILY_STOCK_ADJUSTED
  EXPENSE_CREATED
  EXPENSE_REVERSED
  DEBT_CREATED
  DEBT_PAYMENT_RECORDED
  DEBT_CLOSED
  REPORT_SENT
  REPORT_SEND_FAILED
}

// ============================================================
// USERS, AUTH
// ============================================================

model User {
  id           String    @id @default(cuid())
  username     String?   @unique
  passwordHash String?
  pinHash      String?
  fullName     String
  role         UserRole
  isActive     Boolean   @default(true)
  failedLogins Int       @default(0)
  lockedUntil  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  sessions          Session[]
  ordersAsWaiter    Order[]      @relation("OrderWaiter")
  ordersApproved    Order[]      @relation("OrderApprover")
  auditEntries      AuditLog[]   @relation("AuditActor")
  discountsCreated  Discount[]   @relation("DiscountCreator")
  printJobs         PrintJob[]   @relation("PrintJobTrigger")
  dailyStocksSet    DailyStock[] @relation("DailyStockSetter")
  expensesCreated   Expense[]    @relation("ExpenseCreator")
  debtsCreated      Debt[]       @relation("DebtCreator")
  debtRepayments    DebtRepayment[] @relation("DebtRepaymentReceiver")

  @@index([role])
  @@index([isActive])
}

model Session {
  id          String   @id @default(cuid())
  userId      String
  token       String   @unique
  deviceLabel String?
  expiresAt   DateTime
  lastUsedAt  DateTime @default(now())
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

// ============================================================
// MENU
// ============================================================

model Category {
  id           String     @id @default(cuid())
  name         String
  displayOrder Int        @default(0)
  isActive     Boolean    @default(true)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  menuItems    MenuItem[]

  @@index([displayOrder])
  @@index([isActive])
}

model MenuItem {
  id           String   @id @default(cuid())
  categoryId   String
  name         String
  description  String?
  price        Decimal  @db.Decimal(12, 2)
  isAvailable  Boolean  @default(true)
  trackStock   Boolean  @default(false)
  displayOrder Int      @default(0)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  category        Category         @relation(fields: [categoryId], references: [id])
  orderLines      OrderLine[]
  comboComponents ComboComponent[]
  dailyStocks     DailyStock[]

  @@index([categoryId])
  @@index([isAvailable])
  @@index([isActive])
  @@index([trackStock])
}

model Combo {
  id           String           @id @default(cuid())
  name         String
  displayOrder Int              @default(0)
  isActive     Boolean          @default(true)
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  components   ComboComponent[]

  @@index([isActive])
}

model ComboComponent {
  id         String   @id @default(cuid())
  comboId    String
  menuItemId String
  quantity   Int      @default(1)

  combo      Combo    @relation(fields: [comboId], references: [id], onDelete: Cascade)
  menuItem   MenuItem @relation(fields: [menuItemId], references: [id])

  @@unique([comboId, menuItemId])
  @@index([comboId])
}

// ============================================================
// TABLES
// ============================================================

model Table {
  id           String    @id @default(cuid())
  name         String    @unique
  type         TableType
  displayOrder Int       @default(0)
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  orders       Order[]

  @@index([type])
  @@index([isActive])
}

// ============================================================
// ORDERS
// ============================================================

model Order {
  id                     String      @id @default(cuid())
  orderType              OrderType
  status                 OrderStatus @default(DRAFT)
  tableId                String?
  waiterId               String

  subtotalSnapshot       Decimal?    @db.Decimal(12, 2)
  discountAmountSnapshot Decimal?    @db.Decimal(12, 2)
  serviceChargeSnapshot  Decimal?    @db.Decimal(12, 2)
  serviceChargeWaived    Boolean     @default(false)
  totalSnapshot          Decimal?    @db.Decimal(12, 2)
  appliedDiscountId      String?

  approvedAt             DateTime?
  approvedById           String?
  closedAt               DateTime?
  canceledAt             DateTime?
  cancelReason           String?

  createdAt              DateTime    @default(now())
  updatedAt              DateTime    @updatedAt

  table           Table?          @relation(fields: [tableId], references: [id])
  waiter          User            @relation("OrderWaiter", fields: [waiterId], references: [id])
  approvedBy      User?           @relation("OrderApprover", fields: [approvedById], references: [id])
  appliedDiscount Discount?       @relation(fields: [appliedDiscountId], references: [id])
  lines           OrderLine[]
  kitchenTickets  KitchenTicket[]
  payments        Payment[]
  debt            Debt?
  printJobs       PrintJob[]

  @@index([status])
  @@index([waiterId])
  @@index([tableId])
  @@index([createdAt])
}

model OrderLine {
  id                String    @id @default(cuid())
  orderId           String
  menuItemId        String
  kitchenTicketId   String?

  nameSnapshot      String
  unitPriceSnapshot Decimal   @db.Decimal(12, 2)

  quantity          Int
  notes             String?

  comboGroupId      String?
  comboNameSnapshot String?

  isCanceled        Boolean   @default(false)
  canceledAt        DateTime?
  canceledReason    String?

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  order         Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  menuItem      MenuItem       @relation(fields: [menuItemId], references: [id])
  kitchenTicket KitchenTicket? @relation(fields: [kitchenTicketId], references: [id])

  @@index([orderId])
  @@index([kitchenTicketId])
  @@index([comboGroupId])
}

model KitchenTicket {
  id         String              @id @default(cuid())
  orderId    String
  status     KitchenTicketStatus @default(PENDING)
  startedAt  DateTime?
  readyAt    DateTime?
  canceledAt DateTime?
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt

  order      Order       @relation(fields: [orderId], references: [id], onDelete: Cascade)
  lines      OrderLine[]
  printJobs  PrintJob[]

  @@index([orderId])
  @@index([status])
  @@index([createdAt])
}

// ============================================================
// DISCOUNTS, PAYMENTS
// ============================================================

model Discount {
  id          String       @id @default(cuid())
  name        String
  type        DiscountType
  value       Decimal      @db.Decimal(12, 2)
  isActive    Boolean      @default(true)
  createdById String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  createdBy   User         @relation("DiscountCreator", fields: [createdById], references: [id])
  appliedTo   Order[]

  @@index([isActive])
}

model Payment {
  id        String        @id @default(cuid())
  orderId   String
  method    PaymentMethod
  amount    Decimal       @db.Decimal(12, 2)
  reference String?
  createdAt DateTime      @default(now())

  order     Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
  @@index([method])
  @@index([createdAt])
}

model ExpenseCategory {
  id           String   @id @default(cuid())
  name         String
  displayOrder Int      @default(0)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  expenses     Expense[]

  @@unique([name])
  @@index([isActive])
  @@index([displayOrder])
}

model Expense {
  id                String        @id @default(cuid())
  categoryId        String
  amount            Decimal       @db.Decimal(12, 2)
  reason            String
  note              String?
  occurredAt        DateTime
  status            ExpenseStatus @default(ACTIVE)
  reversedExpenseId String?
  createdById       String
  createdAt         DateTime      @default(now())

  category          ExpenseCategory @relation(fields: [categoryId], references: [id])
  reversedExpense   Expense?        @relation("ExpenseReversal", fields: [reversedExpenseId], references: [id])
  reversals         Expense[]       @relation("ExpenseReversal")
  createdBy         User            @relation("ExpenseCreator", fields: [createdById], references: [id])

  @@index([occurredAt])
  @@index([categoryId])
  @@index([status])
  @@index([createdById])
}

model Debt {
  id              String     @id @default(cuid())
  orderId         String     @unique
  debtorName      String
  debtorPhone     String?
  note            String?
  originalAmount  Decimal    @db.Decimal(12, 2)
  remainingAmount Decimal    @db.Decimal(12, 2)
  openedAt        DateTime
  closedAt        DateTime?
  status          DebtStatus @default(OPEN)
  createdById     String
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  order           Order            @relation(fields: [orderId], references: [id])
  createdBy       User             @relation("DebtCreator", fields: [createdById], references: [id])
  repayments      DebtRepayment[]

  @@index([status])
  @@index([openedAt])
  @@index([createdById])
  @@index([debtorName])
}

model DebtRepayment {
  id           String        @id @default(cuid())
  debtId        String
  amount        Decimal       @db.Decimal(12, 2)
  method        PaymentMethod
  paidAt        DateTime
  note          String?
  receivedById  String
  createdAt     DateTime      @default(now())

  debt          Debt          @relation(fields: [debtId], references: [id], onDelete: Cascade)
  receivedBy    User          @relation("DebtRepaymentReceiver", fields: [receivedById], references: [id])

  @@index([debtId])
  @@index([paidAt])
  @@index([receivedById])
}

// ============================================================
// STOCK
// ============================================================

model DailyStock {
  id           String   @id @default(cuid())
  menuItemId   String
  date         DateTime @db.Date
  initialCount Int
  currentCount Int
  setById      String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  menuItem     MenuItem @relation(fields: [menuItemId], references: [id])
  setBy        User     @relation("DailyStockSetter", fields: [setById], references: [id])

  @@unique([menuItemId, date])
  @@index([date])
  @@index([menuItemId])
}

// ============================================================
// PRINT JOBS
// ============================================================

model PrintJob {
  id            String         @id @default(cuid())
  type          PrintJobType
  printerName   String
  payload       Json
  status        PrintJobStatus @default(PENDING)
  attempts      Int            @default(0)
  errorMessage  String?
  orderId       String?
  ticketId      String?
  triggeredById String
  createdAt     DateTime       @default(now())
  completedAt   DateTime?

  order         Order?         @relation(fields: [orderId], references: [id])
  ticket        KitchenTicket? @relation(fields: [ticketId], references: [id])
  triggeredBy   User           @relation("PrintJobTrigger", fields: [triggeredById], references: [id])

  @@index([status])
  @@index([orderId])
  @@index([ticketId])
  @@index([createdAt])
}

// ============================================================
// AUDIT, SETTINGS
// ============================================================

model AuditLog {
  id         String      @id @default(cuid())
  userId     String
  action     AuditAction
  entityType String
  entityId   String?
  metadata   Json
  createdAt  DateTime    @default(now())

  user       User        @relation("AuditActor", fields: [userId], references: [id])

  @@index([createdAt])
  @@index([userId])
  @@index([action])
}

model Setting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
```

## Default settings

Seeded into the `Setting` table. Keys are stable strings (do not rename).

| key | type | default | who can edit |
|---|---|---|---|
| `service_charge_amount` | string-int (UZS) | `"10000"` | OWNER |
| `max_discount_percent` | string-int (%) | `"15"` | OWNER |
| `max_discount_amount` | string-int (UZS) | `"100000"` | OWNER |
| `daily_report_telegram_enabled` | string-bool | `"false"` | OWNER |
| `daily_report_telegram_time` | string | `"23:30"` | OWNER |
| `telegram_bot_token` | string | `""` | OWNER |
| `owner_telegram_chat_id` | string | `""` | OWNER |
| `kitchen_printer_enabled` | string-bool | `"false"` | ADMIN, OWNER |
| `admin_printer_name` | string | `"POS-80"` | ADMIN, OWNER |
| `kitchen_printer_name` | string | `""` | ADMIN, OWNER |
| `store_heading` | string | `"Chayxana"` | ADMIN, OWNER |

Settings service parses and caches on startup. Updates emit a setting-change audit log entry.

## Partial unique index migration

After `prisma migrate dev --name init` runs, create a second migration manually to add the partial unique index that enforces "one active order per table":

```sh
pnpm prisma migrate dev --create-only --name one_active_order_per_table
```

Then edit the generated SQL file (Prisma creates an empty one) to contain:

```sql
CREATE UNIQUE INDEX "one_active_order_per_table"
  ON "Order" ("tableId")
  WHERE "status" NOT IN ('CLOSED', 'WALKOUT', 'CANCELED')
    AND "tableId" IS NOT NULL;
```

Then apply:

```sh
pnpm prisma migrate dev
```

This guarantees at the database level that two waiters cannot both open active orders on the same table — the second insert raises a unique constraint violation, which the service layer catches as Prisma `P2002` and translates into a clean `Conflict` error.
