/*
  Warnings:

  - You are about to drop the column `walkoutAt` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `walkoutById` on the `Order` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
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
    "sentAt" DATETIME,
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
INSERT INTO "new_Order" ("appliedDiscountId", "approvedAt", "approvedById", "cancelReason", "canceledAt", "closedAt", "createdAt", "discountAmountSnapshot", "id", "orderType", "sentAt", "serviceChargeSnapshot", "serviceChargeWaived", "status", "subtotalSnapshot", "tableId", "totalSnapshot", "updatedAt", "waiterId") SELECT "appliedDiscountId", "approvedAt", "approvedById", "cancelReason", "canceledAt", "closedAt", "createdAt", "discountAmountSnapshot", "id", "orderType", "sentAt", "serviceChargeSnapshot", "serviceChargeWaived", "status", "subtotalSnapshot", "tableId", "totalSnapshot", "updatedAt", "waiterId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_waiterId_idx" ON "Order"("waiterId");
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_closedAt_idx" ON "Order"("closedAt");
CREATE INDEX "Order_sentAt_idx" ON "Order"("sentAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
