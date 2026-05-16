-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN "cogsSnapshot" DECIMAL;
ALTER TABLE "OrderLine" ADD COLUMN "consumptionSnapshot" JSONB;

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "buyUnit" TEXT NOT NULL,
    "recipeUnit" TEXT NOT NULL,
    "conversionFactor" DECIMAL NOT NULL,
    "currentStock" DECIMAL NOT NULL DEFAULT 0,
    "weightedAvgCost" DECIMAL NOT NULL DEFAULT 0,
    "varianceThreshold" DECIMAL NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSelfMenuItem" BOOLEAN NOT NULL DEFAULT false,
    "selfMenuItemId" TEXT,
    "expenseCategoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ingredient_selfMenuItemId_fkey" FOREIGN KEY ("selfMenuItemId") REFERENCES "MenuItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ingredient_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuItemId" TEXT NOT NULL,
    "notes" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecipeEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "beforeJson" JSONB NOT NULL,
    "afterJson" JSONB NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipeEdit_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Purchase" (
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
    CONSTRAINT "Purchase_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WasteEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WasteEvent_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WasteEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "performedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Stocktake_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StocktakeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stocktakeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "expectedQty" DECIMAL NOT NULL,
    "countedQty" DECIMAL NOT NULL,
    "variance" DECIMAL NOT NULL,
    "reasonCode" TEXT,
    "reasonNote" TEXT,
    "valuedAtCost" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StocktakeEntry_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StocktakeEntry_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngredientMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitCostSnapshot" DECIMAL,
    "resultingStock" DECIMAL NOT NULL,
    "resultingAvgCost" DECIMAL NOT NULL,
    "purchaseId" TEXT,
    "orderLineId" TEXT,
    "stocktakeEntryId" TEXT,
    "wasteEventId" TEXT,
    "reasonCode" TEXT,
    "note" TEXT,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngredientMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IngredientMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IngredientMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IngredientMovement_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IngredientMovement_stocktakeEntryId_fkey" FOREIGN KEY ("stocktakeEntryId") REFERENCES "StocktakeEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IngredientMovement_wasteEventId_fkey" FOREIGN KEY ("wasteEventId") REFERENCES "WasteEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_reversedExpenseId_fkey" FOREIGN KEY ("reversedExpenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "categoryId", "createdAt", "createdById", "id", "note", "occurredAt", "reason", "reversedExpenseId", "status") SELECT "amount", "categoryId", "createdAt", "createdById", "id", "note", "occurredAt", "reason", "reversedExpenseId", "status" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_purchaseId_key" ON "Expense"("purchaseId");
CREATE INDEX "Expense_occurredAt_idx" ON "Expense"("occurredAt");
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");
CREATE INDEX "Expense_status_idx" ON "Expense"("status");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_selfMenuItemId_key" ON "Ingredient"("selfMenuItemId");

-- CreateIndex
CREATE INDEX "Ingredient_isActive_idx" ON "Ingredient"("isActive");

-- CreateIndex
CREATE INDEX "Ingredient_isSelfMenuItem_idx" ON "Ingredient"("isSelfMenuItem");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_menuItemId_key" ON "Recipe"("menuItemId");

-- CreateIndex
CREATE INDEX "Recipe_isComplete_idx" ON "Recipe"("isComplete");

-- CreateIndex
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE INDEX "RecipeEdit_recipeId_occurredAt_idx" ON "RecipeEdit"("recipeId", "occurredAt");

-- CreateIndex
CREATE INDEX "RecipeEdit_editedById_idx" ON "RecipeEdit"("editedById");

-- CreateIndex
CREATE INDEX "Purchase_ingredientId_occurredAt_idx" ON "Purchase"("ingredientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Purchase_occurredAt_idx" ON "Purchase"("occurredAt");

-- CreateIndex
CREATE INDEX "WasteEvent_ingredientId_occurredAt_idx" ON "WasteEvent"("ingredientId", "occurredAt");

-- CreateIndex
CREATE INDEX "WasteEvent_occurredAt_idx" ON "WasteEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Stocktake_date_key" ON "Stocktake"("date");

-- CreateIndex
CREATE INDEX "Stocktake_status_idx" ON "Stocktake"("status");

-- CreateIndex
CREATE INDEX "Stocktake_performedById_idx" ON "Stocktake"("performedById");

-- CreateIndex
CREATE INDEX "StocktakeEntry_ingredientId_idx" ON "StocktakeEntry"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakeEntry_stocktakeId_ingredientId_key" ON "StocktakeEntry"("stocktakeId", "ingredientId");

-- CreateIndex
CREATE INDEX "IngredientMovement_ingredientId_occurredAt_idx" ON "IngredientMovement"("ingredientId", "occurredAt");

-- CreateIndex
CREATE INDEX "IngredientMovement_type_idx" ON "IngredientMovement"("type");

-- CreateIndex
CREATE INDEX "IngredientMovement_occurredAt_idx" ON "IngredientMovement"("occurredAt");

-- CreateIndex
CREATE INDEX "IngredientMovement_orderLineId_idx" ON "IngredientMovement"("orderLineId");

-- CreateIndex
CREATE INDEX "IngredientMovement_purchaseId_idx" ON "IngredientMovement"("purchaseId");
