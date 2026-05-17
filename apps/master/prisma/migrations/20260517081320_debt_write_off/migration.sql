-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Debt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "debtorName" TEXT NOT NULL,
    "debtorPhone" TEXT,
    "note" TEXT,
    "originalAmount" DECIMAL NOT NULL,
    "remainingAmount" DECIMAL NOT NULL,
    "openedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "writtenOffAt" DATETIME,
    "writtenOffById" TEXT,
    "writtenOffReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Debt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Debt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Debt_writtenOffById_fkey" FOREIGN KEY ("writtenOffById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Debt" ("closedAt", "createdAt", "createdById", "debtorName", "debtorPhone", "id", "note", "openedAt", "orderId", "originalAmount", "remainingAmount", "status", "updatedAt") SELECT "closedAt", "createdAt", "createdById", "debtorName", "debtorPhone", "id", "note", "openedAt", "orderId", "originalAmount", "remainingAmount", "status", "updatedAt" FROM "Debt";
DROP TABLE "Debt";
ALTER TABLE "new_Debt" RENAME TO "Debt";
CREATE UNIQUE INDEX "Debt_orderId_key" ON "Debt"("orderId");
CREATE INDEX "Debt_status_idx" ON "Debt"("status");
CREATE INDEX "Debt_openedAt_idx" ON "Debt"("openedAt");
CREATE INDEX "Debt_createdById_idx" ON "Debt"("createdById");
CREATE INDEX "Debt_debtorName_idx" ON "Debt"("debtorName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
