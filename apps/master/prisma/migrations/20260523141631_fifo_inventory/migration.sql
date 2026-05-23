-- CreateTable
CREATE TABLE "OrderLineBatchConsumption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderLineId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderLineBatchConsumption_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderLineBatchConsumption_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredientId" TEXT NOT NULL,
    "quantityBuyUnit" DECIMAL NOT NULL,
    "quantityRecipeUnit" DECIMAL NOT NULL,
    "remainingQty" DECIMAL NOT NULL DEFAULT 0,
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
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletionNote" TEXT,
    CONSTRAINT "Purchase_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("createdAt", "id", "ingredientId", "occurredAt", "quantityBuyUnit", "quantityRecipeUnit", "recordedById", "reversalNote", "reversedAt", "reversedById", "status", "supplierNote", "totalCostUzs", "unitCostPerRecipeUnit") SELECT "createdAt", "id", "ingredientId", "occurredAt", "quantityBuyUnit", "quantityRecipeUnit", "recordedById", "reversalNote", "reversedAt", "reversedById", "status", "supplierNote", "totalCostUzs", "unitCostPerRecipeUnit" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE INDEX "Purchase_ingredientId_occurredAt_idx" ON "Purchase"("ingredientId", "occurredAt");
CREATE INDEX "Purchase_occurredAt_idx" ON "Purchase"("occurredAt");
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");
CREATE INDEX "Purchase_ingredientId_status_occurredAt_idx" ON "Purchase"("ingredientId", "status", "occurredAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "OrderLineBatchConsumption_orderLineId_idx" ON "OrderLineBatchConsumption"("orderLineId");

-- CreateIndex
CREATE INDEX "OrderLineBatchConsumption_purchaseId_idx" ON "OrderLineBatchConsumption"("purchaseId");

-- Back-fill FIFO remainingQty for existing data:
-- ACTIVE batches reset to full qty (we have no per-batch consumption history before
-- FIFO; this matches the pre-FIFO Ingredient.currentStock semantics — total in stock
-- is treated as "all from the most-recent batches", which is a one-time reset).
UPDATE "Purchase" SET "remainingQty" = "quantityRecipeUnit" WHERE "status" = 'ACTIVE';
