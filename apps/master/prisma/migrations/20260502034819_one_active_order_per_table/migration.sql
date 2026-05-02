CREATE UNIQUE INDEX "one_active_order_per_table"
  ON "Order" ("tableId")
  WHERE "status" NOT IN ('CLOSED', 'WALKOUT', 'CANCELED')
    AND "tableId" IS NOT NULL;
