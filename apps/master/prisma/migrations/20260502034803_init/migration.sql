CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "trackStock" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Combo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ComboComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comboId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ComboComponent_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComboComponent_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Table" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tableId" TEXT,
    "waiterId" TEXT NOT NULL,
    "subtotalSnapshot" DECIMAL,
    "discountAmountSnapshot" DECIMAL,
    "serviceChargeSnapshot" DECIMAL,
    "serviceChargeWaived" BOOLEAN NOT NULL DEFAULT false,
    "totalSnapshot" DECIMAL,
    "appliedDiscountId" TEXT,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "closedAt" DATETIME,
    "canceledAt" DATETIME,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_appliedDiscountId_fkey" FOREIGN KEY ("appliedDiscountId") REFERENCES "Discount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "kitchenTicketId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "unitPriceSnapshot" DECIMAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "comboGroupId" TEXT,
    "comboNameSnapshot" TEXT,
    "isCanceled" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" DATETIME,
    "canceledReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_kitchenTicketId_fkey" FOREIGN KEY ("kitchenTicketId") REFERENCES "KitchenTicket" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "KitchenTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME,
    "readyAt" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KitchenTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Discount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Discount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DailyStock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuItemId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "initialCount" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL,
    "setById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyStock_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyStock_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "printerName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "orderId" TEXT,
    "ticketId" TEXT,
    "triggeredById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrintJob_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "KitchenTicket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrintJob_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_isActive_idx" ON "User"("isActive");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Category_displayOrder_idx" ON "Category"("displayOrder");
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");
CREATE INDEX "MenuItem_isAvailable_idx" ON "MenuItem"("isAvailable");
CREATE INDEX "MenuItem_isActive_idx" ON "MenuItem"("isActive");
CREATE INDEX "MenuItem_trackStock_idx" ON "MenuItem"("trackStock");
CREATE INDEX "Combo_isActive_idx" ON "Combo"("isActive");
CREATE INDEX "ComboComponent_comboId_idx" ON "ComboComponent"("comboId");
CREATE UNIQUE INDEX "ComboComponent_comboId_menuItemId_key" ON "ComboComponent"("comboId", "menuItemId");
CREATE UNIQUE INDEX "Table_name_key" ON "Table"("name");
CREATE INDEX "Table_type_idx" ON "Table"("type");
CREATE INDEX "Table_isActive_idx" ON "Table"("isActive");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_waiterId_idx" ON "Order"("waiterId");
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
CREATE INDEX "OrderLine_kitchenTicketId_idx" ON "OrderLine"("kitchenTicketId");
CREATE INDEX "OrderLine_comboGroupId_idx" ON "OrderLine"("comboGroupId");
CREATE INDEX "KitchenTicket_orderId_idx" ON "KitchenTicket"("orderId");
CREATE INDEX "KitchenTicket_status_idx" ON "KitchenTicket"("status");
CREATE INDEX "KitchenTicket_createdAt_idx" ON "KitchenTicket"("createdAt");
CREATE INDEX "Discount_isActive_idx" ON "Discount"("isActive");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_method_idx" ON "Payment"("method");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX "DailyStock_date_idx" ON "DailyStock"("date");
CREATE INDEX "DailyStock_menuItemId_idx" ON "DailyStock"("menuItemId");
CREATE UNIQUE INDEX "DailyStock_menuItemId_date_key" ON "DailyStock"("menuItemId", "date");
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");
CREATE INDEX "PrintJob_orderId_idx" ON "PrintJob"("orderId");
CREATE INDEX "PrintJob_ticketId_idx" ON "PrintJob"("ticketId");
CREATE INDEX "PrintJob_createdAt_idx" ON "PrintJob"("createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
