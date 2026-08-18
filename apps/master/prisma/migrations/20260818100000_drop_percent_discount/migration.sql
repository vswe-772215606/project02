/*
  Drops `Discount.type` and the `DiscountType` enum.

  The chayxana only ever gives a sum off a bill, so the PERCENT/FIXED
  discriminator was a choice the operator had to make on every discount and
  could get wrong. `value` is now always a whole so'm amount.

  Any preset that WAS a percent is deactivated rather than carried across. Its
  `value` is a percentage — "10" means ten percent, not ten so'm — and there is
  no order-independent conversion, so reinterpreting it as an amount would
  silently turn a 10% discount into a 10 so'm one. The row survives for the
  audit trail; it just can no longer be picked.
*/

-- Retire percent presets BEFORE the column carrying that fact is dropped.
UPDATE "Discount" SET "isActive" = false WHERE "type" = 'PERCENT';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Discount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "value" DECIMAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Discount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Discount" ("createdAt", "createdById", "id", "isActive", "name", "updatedAt", "value") SELECT "createdAt", "createdById", "id", "isActive", "name", "updatedAt", "value" FROM "Discount";
DROP TABLE "Discount";
ALTER TABLE "new_Discount" RENAME TO "Discount";
CREATE INDEX "Discount_isActive_idx" ON "Discount"("isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
