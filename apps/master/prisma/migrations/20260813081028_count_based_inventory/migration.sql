-- CreateTable
CREATE TABLE "StockEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "menuItemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "countBefore" INTEGER,
    "countAfter" INTEGER NOT NULL,
    "paidUzs" DECIMAL,
    "unitCost" DECIMAL,
    "expenseId" TEXT,
    "note" TEXT,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockEntry_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FOOD',
    "unitCostSnapshot" DECIMAL,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "stockCount" INTEGER,
    "costPrice" DECIMAL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MenuItem" ("categoryId", "createdAt", "description", "displayOrder", "id", "isActive", "isAvailable", "kind", "name", "price", "unitCostSnapshot", "updatedAt") SELECT "categoryId", "createdAt", "description", "displayOrder", "id", "isActive", "isAvailable", "kind", "name", "price", "unitCostSnapshot", "updatedAt" FROM "MenuItem";
DROP TABLE "MenuItem";
ALTER TABLE "new_MenuItem" RENAME TO "MenuItem";
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");
CREATE INDEX "MenuItem_isAvailable_idx" ON "MenuItem"("isAvailable");
CREATE INDEX "MenuItem_isActive_idx" ON "MenuItem"("isActive");
CREATE INDEX "MenuItem_kind_idx" ON "MenuItem"("kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_expenseId_key" ON "StockEntry"("expenseId");

-- CreateIndex
CREATE INDEX "StockEntry_menuItemId_occurredAt_idx" ON "StockEntry"("menuItemId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockEntry_occurredAt_idx" ON "StockEntry"("occurredAt");

-- Backfill (design D5): counted=false for SERVICE and for FOOD with no
-- tracking relations (old UNTRACKED). stockCount stays NULL everywhere
-- (fresh start — admin types real counts on day one).
UPDATE "MenuItem" SET "counted" = false
WHERE "kind" = 'SERVICE'
   OR ("kind" = 'FOOD'
       AND NOT EXISTS (SELECT 1 FROM "Recipe" r JOIN "RecipeIngredient" ri ON ri."recipeId" = r."id" WHERE r."menuItemId" = "MenuItem"."id")
       AND NOT EXISTS (SELECT 1 FROM "Ingredient" i WHERE i."selfMenuItemId" = "MenuItem"."id"));

-- costPrice seed, only where honest: dona-based self-ingredient items get the
-- last purchase unit cost; recipe dishes get per-portion recipe cost at last
-- purchase prices. kg/l self-ingredient items stay NULL (their old numbers
-- were the F-11 1000x understatement).
UPDATE "MenuItem" SET "costPrice" = (
  SELECT i."weightedAvgCost" FROM "Ingredient" i
  WHERE i."selfMenuItemId" = "MenuItem"."id" AND i."recipeUnit" = 'dona'
)
WHERE EXISTS (SELECT 1 FROM "Ingredient" i WHERE i."selfMenuItemId" = "MenuItem"."id" AND i."recipeUnit" = 'dona');

UPDATE "MenuItem" SET "costPrice" = (
  SELECT SUM(ri."quantity" * i."weightedAvgCost")
  FROM "Recipe" r
  JOIN "RecipeIngredient" ri ON ri."recipeId" = r."id"
  JOIN "Ingredient" i ON i."id" = ri."ingredientId"
  WHERE r."menuItemId" = "MenuItem"."id"
)
WHERE EXISTS (SELECT 1 FROM "Recipe" r JOIN "RecipeIngredient" ri ON ri."recipeId" = r."id" WHERE r."menuItemId" = "MenuItem"."id");
