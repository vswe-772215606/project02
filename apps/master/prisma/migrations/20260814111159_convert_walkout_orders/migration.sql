-- Walkout is removed from the product. Any order still parked in WALKOUT
-- becomes a cancellation carrying an explicit reason, so no row is left
-- holding a status the enum will no longer contain.
--
-- Stock is deliberately NOT restored: a walkout meant the food was consumed,
-- and restoring it now would invent inventory that does not exist.
UPDATE "Order"
SET "status"       = 'CANCELED',
    "canceledAt"   = COALESCE("canceledAt", "walkoutAt", "updatedAt"),
    "cancelReason" = COALESCE(NULLIF("cancelReason", ''), 'Hisob to''lanmagan (eski yozuv)')
WHERE "status" = 'WALKOUT';
