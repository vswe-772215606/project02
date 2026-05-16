/*
  Warnings:

  - You are about to drop the `DailyStock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `trackStock` on the `MenuItem` table. All the data in the column will be lost.
  - Added the required column `parentMenuItemId` to the `Ingredient` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "DailyStock_menuItemId_date_key";

-- DropIndex
DROP INDEX "DailyStock_menuItemId_idx";

-- DropIndex
DROP INDEX "DailyStock_date_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DailyStock";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentMenuItemId" TEXT NOT NULL,
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
    CONSTRAINT "Ingredient_parentMenuItemId_fkey" FOREIGN KEY ("parentMenuItemId") REFERENCES "MenuItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ingredient_selfMenuItemId_fkey" FOREIGN KEY ("selfMenuItemId") REFERENCES "MenuItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ingredient_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ingredient" ("buyUnit", "conversionFactor", "createdAt", "currentStock", "expenseCategoryId", "id", "isActive", "isSelfMenuItem", "name", "recipeUnit", "selfMenuItemId", "updatedAt", "varianceThreshold", "weightedAvgCost") SELECT "buyUnit", "conversionFactor", "createdAt", "currentStock", "expenseCategoryId", "id", "isActive", "isSelfMenuItem", "name", "recipeUnit", "selfMenuItemId", "updatedAt", "varianceThreshold", "weightedAvgCost" FROM "Ingredient";
DROP TABLE "Ingredient";
ALTER TABLE "new_Ingredient" RENAME TO "Ingredient";
CREATE UNIQUE INDEX "Ingredient_selfMenuItemId_key" ON "Ingredient"("selfMenuItemId");
CREATE INDEX "Ingredient_isActive_idx" ON "Ingredient"("isActive");
CREATE INDEX "Ingredient_isSelfMenuItem_idx" ON "Ingredient"("isSelfMenuItem");
CREATE INDEX "Ingredient_parentMenuItemId_idx" ON "Ingredient"("parentMenuItemId");
CREATE UNIQUE INDEX "Ingredient_parentMenuItemId_name_key" ON "Ingredient"("parentMenuItemId", "name");
CREATE TABLE "new_MenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FOOD',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MenuItem" ("categoryId", "createdAt", "description", "displayOrder", "id", "isActive", "isAvailable", "kind", "name", "price", "updatedAt") SELECT "categoryId", "createdAt", "description", "displayOrder", "id", "isActive", "isAvailable", "kind", "name", "price", "updatedAt" FROM "MenuItem";
DROP TABLE "MenuItem";
ALTER TABLE "new_MenuItem" RENAME TO "MenuItem";
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");
CREATE INDEX "MenuItem_isAvailable_idx" ON "MenuItem"("isAvailable");
CREATE INDEX "MenuItem_isActive_idx" ON "MenuItem"("isActive");
CREATE INDEX "MenuItem_kind_idx" ON "MenuItem"("kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
