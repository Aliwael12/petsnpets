CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"kind" "product_kind" DEFAULT 'good' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD COLUMN "expiry_date" timestamp with time zone;--> statement-breakpoint

-- Backfill BEFORE the foreign key is added. Drizzle generated the ADD CONSTRAINT
-- immediately after the type change, which would fail instantly on any database that
-- already has products: their `category` values would reference rows that don't exist yet.
-- These two inserts are hand-written for that reason.
--
-- 1. The five built-in categories, with their proper display labels. 'service' is flagged
--    is_system because the app keys structural behaviour off a kind='service' category
--    (its products bypass the stock ledger), so it must not be deletable from Settings.
INSERT INTO "product_categories" ("name", "label", "kind", "is_system", "sort_order") VALUES
	('food', 'Food', 'good', false, 10),
	('accessories', 'Accessories', 'good', false, 20),
	('medicine', 'Medicine', 'good', false, 30),
	('grooming', 'Grooming', 'good', false, 40),
	('service', 'Clinic service', 'service', true, 50)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint

-- 2. Defensive: adopt any category value actually present on products that isn't one of
--    the five above, so the FK below can never fail on unexpected data. `kind` is derived
--    from the products themselves — a category is only a service category if every product
--    in it is one.
INSERT INTO "product_categories" ("name", "label", "kind", "is_system", "sort_order")
SELECT
	p."category",
	initcap(replace(p."category", '-', ' ')),
	(CASE WHEN bool_and(p."kind" = 'service') THEN 'service' ELSE 'good' END)::"product_kind",
	false,
	900
FROM "products" p
WHERE p."category" NOT IN (SELECT "name" FROM "product_categories")
GROUP BY p."category"
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint

ALTER TABLE "products" ADD CONSTRAINT "products_category_product_categories_name_fk" FOREIGN KEY ("category") REFERENCES "public"."product_categories"("name") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
DROP TYPE "public"."product_category";
