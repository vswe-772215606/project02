/*
  Warnings:

  - You are about to drop the `KitchenTicket` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `kitchenTicketId` on the `OrderLine` table. All the data in the column will be lost.
  - You are about to drop the column `ticketId` on the `PrintJob` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "KitchenTicket_createdAt_idx";

-- DropIndex
DROP INDEX "KitchenTicket_status_idx";

-- DropIndex
DROP INDEX "KitchenTicket_orderId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "KitchenTicket";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "unitPriceSnapshot" DECIMAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "comboGroupId" TEXT,
    "comboNameSnapshot" TEXT,
    "isCanceled" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" DATETIME,
    "canceledReason" TEXT,
    "cogsSnapshot" DECIMAL,
    "consumptionSnapshot" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderLine" ("canceledAt", "canceledReason", "cogsSnapshot", "comboGroupId", "comboNameSnapshot", "consumptionSnapshot", "createdAt", "id", "isCanceled", "menuItemId", "nameSnapshot", "notes", "orderId", "quantity", "unitPriceSnapshot", "updatedAt") SELECT "canceledAt", "canceledReason", "cogsSnapshot", "comboGroupId", "comboNameSnapshot", "consumptionSnapshot", "createdAt", "id", "isCanceled", "menuItemId", "nameSnapshot", "notes", "orderId", "quantity", "unitPriceSnapshot", "updatedAt" FROM "OrderLine";
DROP TABLE "OrderLine";
ALTER TABLE "new_OrderLine" RENAME TO "OrderLine";
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
CREATE INDEX "OrderLine_comboGroupId_idx" ON "OrderLine"("comboGroupId");
CREATE TABLE "new_PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "printerName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "orderId" TEXT,
    "triggeredById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrintJob_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PrintJob" ("attempts", "completedAt", "createdAt", "errorMessage", "id", "orderId", "payload", "printerName", "status", "triggeredById", "type") SELECT "attempts", "completedAt", "createdAt", "errorMessage", "id", "orderId", "payload", "printerName", "status", "triggeredById", "type" FROM "PrintJob";
DROP TABLE "PrintJob";
ALTER TABLE "new_PrintJob" RENAME TO "PrintJob";
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");
CREATE INDEX "PrintJob_orderId_idx" ON "PrintJob"("orderId");
CREATE INDEX "PrintJob_createdAt_idx" ON "PrintJob"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
