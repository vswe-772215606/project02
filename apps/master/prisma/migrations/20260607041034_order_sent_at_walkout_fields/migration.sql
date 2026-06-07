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
    "walkoutAt" DATETIME,
    "walkoutById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_walkoutById_fkey" FOREIGN KEY ("walkoutById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_appliedDiscountId_fkey" FOREIGN KEY ("appliedDiscountId") REFERENCES "Discount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("appliedDiscountId", "approvedAt", "approvedById", "cancelReason", "canceledAt", "closedAt", "createdAt", "discountAmountSnapshot", "id", "orderType", "serviceChargeSnapshot", "serviceChargeWaived", "status", "subtotalSnapshot", "tableId", "totalSnapshot", "updatedAt", "waiterId") SELECT "appliedDiscountId", "approvedAt", "approvedById", "cancelReason", "canceledAt", "closedAt", "createdAt", "discountAmountSnapshot", "id", "orderType", "serviceChargeSnapshot", "serviceChargeWaived", "status", "subtotalSnapshot", "tableId", "totalSnapshot", "updatedAt", "waiterId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_waiterId_idx" ON "Order"("waiterId");
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_closedAt_idx" ON "Order"("closedAt");
CREATE INDEX "Order_walkoutAt_idx" ON "Order"("walkoutAt");
CREATE INDEX "Order_sentAt_idx" ON "Order"("sentAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill the new lifecycle timestamps for orders that finished before this
-- migration ran. We don't have the true transition instants, so we use the
-- closest stand-in available:
--   - sentAt:      createdAt for anything past DRAFT (best-effort, used only
--                  by analytics; not load-bearing for the new walkout / stock
--                  fixes downstream).
--   - walkoutAt:   updatedAt for WALKOUT rows (mirrors the previous read path
--                  that used updatedAt — see reports/finance services).
--   - walkoutById: approvedById if present; nullable otherwise (the old
--                  report code defaulted to 'unknown' which was always wrong).
UPDATE "Order"
SET "sentAt" = "createdAt"
WHERE "sentAt" IS NULL
  AND "status" IN ('SENT', 'CLOSED', 'WALKOUT');

UPDATE "Order"
SET "walkoutAt" = "updatedAt"
WHERE "walkoutAt" IS NULL AND "status" = 'WALKOUT';

UPDATE "Order"
SET "walkoutById" = "approvedById"
WHERE "walkoutById" IS NULL
  AND "status" = 'WALKOUT'
  AND "approvedById" IS NOT NULL;
