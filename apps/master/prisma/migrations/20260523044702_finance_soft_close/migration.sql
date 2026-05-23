-- AlterTable
ALTER TABLE "Order" ADD COLUMN "sentAt" DATETIME;

-- CreateTable
CREATE TABLE "DailyClose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    CONSTRAINT "DailyClose_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversedExpenseId" TEXT,
    "purchaseId" TEXT,
    "repayable" BOOLEAN NOT NULL DEFAULT false,
    "writtenOffAt" DATETIME,
    "writtenOffReason" TEXT,
    "writtenOffById" TEXT,
    "isAdjustment" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_reversedExpenseId_fkey" FOREIGN KEY ("reversedExpenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_writtenOffById_fkey" FOREIGN KEY ("writtenOffById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "categoryId", "createdAt", "createdById", "id", "note", "occurredAt", "purchaseId", "reason", "repayable", "reversedExpenseId", "status", "writtenOffAt", "writtenOffById", "writtenOffReason") SELECT "amount", "categoryId", "createdAt", "createdById", "id", "note", "occurredAt", "purchaseId", "reason", "repayable", "reversedExpenseId", "status", "writtenOffAt", "writtenOffById", "writtenOffReason" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_purchaseId_key" ON "Expense"("purchaseId");
CREATE INDEX "Expense_occurredAt_idx" ON "Expense"("occurredAt");
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");
CREATE INDEX "Expense_status_idx" ON "Expense"("status");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");
CREATE INDEX "Expense_repayable_idx" ON "Expense"("repayable");
CREATE INDEX "Expense_writtenOffAt_idx" ON "Expense"("writtenOffAt");
CREATE INDEX "Expense_isAdjustment_idx" ON "Expense"("isAdjustment");
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredientId" TEXT NOT NULL,
    "quantityBuyUnit" DECIMAL NOT NULL,
    "quantityRecipeUnit" DECIMAL NOT NULL,
    "totalCostUzs" DECIMAL NOT NULL,
    "unitCostPerRecipeUnit" DECIMAL NOT NULL,
    "supplierNote" TEXT,
    "recordedById" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reversedAt" DATETIME,
    "reversedById" TEXT,
    "reversalNote" TEXT,
    "isAdjustment" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Purchase_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("createdAt", "id", "ingredientId", "occurredAt", "quantityBuyUnit", "quantityRecipeUnit", "recordedById", "reversalNote", "reversedAt", "reversedById", "status", "supplierNote", "totalCostUzs", "unitCostPerRecipeUnit") SELECT "createdAt", "id", "ingredientId", "occurredAt", "quantityBuyUnit", "quantityRecipeUnit", "recordedById", "reversalNote", "reversedAt", "reversedById", "status", "supplierNote", "totalCostUzs", "unitCostPerRecipeUnit" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE INDEX "Purchase_ingredientId_occurredAt_idx" ON "Purchase"("ingredientId", "occurredAt");
CREATE INDEX "Purchase_occurredAt_idx" ON "Purchase"("occurredAt");
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");
CREATE INDEX "Purchase_isAdjustment_idx" ON "Purchase"("isAdjustment");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DailyClose_date_key" ON "DailyClose"("date");

-- CreateIndex
CREATE INDEX "DailyClose_closedAt_idx" ON "DailyClose"("closedAt");

-- CreateIndex
CREATE INDEX "DailyClose_closedByUserId_idx" ON "DailyClose"("closedByUserId");
