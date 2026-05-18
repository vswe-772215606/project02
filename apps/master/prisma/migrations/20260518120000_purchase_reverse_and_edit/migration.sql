-- Add reversal-tracking columns + status to Purchase. New rows default to
-- ACTIVE; reversal columns are nullable and populated only when a purchase
-- is reversed. Two new AuditAction enum values (PURCHASE_UPDATED,
-- PURCHASE_REVERSED) are schema-only (Prisma enums are TEXT in SQLite).

ALTER TABLE "Purchase" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Purchase" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "Purchase" ADD COLUMN "reversedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD COLUMN "reversalNote" TEXT;

CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");
