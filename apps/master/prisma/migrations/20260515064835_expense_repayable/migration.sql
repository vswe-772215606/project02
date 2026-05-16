-- CreateTable
CREATE TABLE "ExpenseReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "receivedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseReturn_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseReturn_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_reversedExpenseId_fkey" FOREIGN KEY ("reversedExpenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_writtenOffById_fkey" FOREIGN KEY ("writtenOffById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "categoryId", "createdAt", "createdById", "id", "note", "occurredAt", "purchaseId", "reason", "reversedExpenseId", "status") SELECT "amount", "categoryId", "createdAt", "createdById", "id", "note", "occurredAt", "purchaseId", "reason", "reversedExpenseId", "status" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_purchaseId_key" ON "Expense"("purchaseId");
CREATE INDEX "Expense_occurredAt_idx" ON "Expense"("occurredAt");
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");
CREATE INDEX "Expense_status_idx" ON "Expense"("status");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");
CREATE INDEX "Expense_repayable_idx" ON "Expense"("repayable");
CREATE INDEX "Expense_writtenOffAt_idx" ON "Expense"("writtenOffAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ExpenseReturn_expenseId_idx" ON "ExpenseReturn"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseReturn_receivedAt_idx" ON "ExpenseReturn"("receivedAt");

-- CreateIndex
CREATE INDEX "ExpenseReturn_receivedById_idx" ON "ExpenseReturn"("receivedById");
