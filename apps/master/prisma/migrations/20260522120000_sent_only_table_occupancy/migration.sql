-- Redefine the table-occupancy partial unique index: only a SENT order
-- occupies a table. Unsent DRAFT orders no longer count toward occupancy —
-- multiple DRAFT orders may now coexist on the same table, but there is
-- still at most one SENT order per table.
DROP INDEX "one_active_order_per_table";

CREATE UNIQUE INDEX "one_active_order_per_table"
  ON "Order" ("tableId")
  WHERE "status" = 'SENT'
    AND "tableId" IS NOT NULL;
