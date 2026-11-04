-- Store the fulfilment time selected for every newly created order. The column is
-- nullable so the migration remains safe for orders created by the earlier build.
ALTER TABLE "Order" ADD COLUMN "requestedFor" TIMESTAMP(3);

-- Database-level invariants protect data written by maintenance scripts and future
-- code paths in addition to the application validation.
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_priceMinor_nonnegative" CHECK ("priceMinor" >= 0);

ALTER TABLE "ModifierOption"
  ADD CONSTRAINT "ModifierOption_priceMinor_nonnegative" CHECK ("priceMinor" >= 0);

ALTER TABLE "ModifierGroup"
  ADD CONSTRAINT "ModifierGroup_selection_range" CHECK ("minSelect" >= 0 AND "maxSelect" >= "minSelect");

ALTER TABLE "SiteSettings"
  ADD CONSTRAINT "SiteSettings_delivery_amounts_nonnegative" CHECK ("deliveryFeeMinor" >= 0 AND "deliveryMinimumMinor" >= 0);

ALTER TABLE "ScheduleEntry"
  ADD CONSTRAINT "ScheduleEntry_day_range" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  ADD CONSTRAINT "ScheduleEntry_time_shape" CHECK (
    ("closed" AND "opensAt" IS NULL AND "closesAt" IS NULL)
    OR
    (NOT "closed" AND "opensAt" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND "closesAt" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND "opensAt" < "closesAt")
  );

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amounts_consistent" CHECK (
    "subtotalMinor" >= 0 AND "deliveryFeeMinor" >= 0 AND "totalMinor" = "subtotalMinor" + "deliveryFeeMinor"
  ),
  ADD CONSTRAINT "Order_delivery_address" CHECK (
    ("fulfillment" = 'PICKUP' AND "deliveryAddress" IS NULL)
    OR
    ("fulfillment" = 'DELIVERY' AND "deliveryAddress" IS NOT NULL)
  );

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_range" CHECK ("quantity" BETWEEN 1 AND 20),
  ADD CONSTRAINT "OrderItem_amounts_consistent" CHECK (
    "unitBasePriceMinor" >= 0 AND "unitTotalMinor" >= 0 AND "lineTotalMinor" = "unitTotalMinor" * "quantity"
  );
