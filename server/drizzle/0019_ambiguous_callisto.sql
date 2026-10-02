CREATE TYPE "public"."stay_kind" AS ENUM('boarding', 'hospitalization');--> statement-breakpoint
ALTER TABLE "boardings" ADD COLUMN "kind" "stay_kind" DEFAULT 'boarding' NOT NULL;--> statement-breakpoint
INSERT INTO "product_categories" ("name", "label", "kind", "active", "is_system", "sort_order")
SELECT 'hospitalization', 'Hospitalization', 'service', true, true, coalesce(max("sort_order"), 0) + 1 FROM "product_categories"
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- Inactive so it never shows at the till; it's only rung up from the Boarding page.
INSERT INTO "products" ("name", "category", "kind", "sku", "unit_price", "active")
SELECT 'Hospitalization', 'hospitalization', 'service', 'HOSPITALIZATION', 0, false
WHERE NOT EXISTS (SELECT 1 FROM "products" WHERE "sku" = 'HOSPITALIZATION');
