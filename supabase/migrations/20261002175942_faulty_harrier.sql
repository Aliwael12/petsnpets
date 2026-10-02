-- Boarding payments become ordinary sales. Phase 1 (safe before deploy): the link column,
-- and the hidden "Boarding" service product they're rung up as.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "boarding_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_boarding_id_boardings_id_fk" FOREIGN KEY ("boarding_id") REFERENCES "public"."boardings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_boarding_id_idx" ON "transactions" USING btree ("boarding_id");--> statement-breakpoint
INSERT INTO "product_categories" ("name", "label", "kind", "active", "is_system", "sort_order")
SELECT 'boarding', 'Boarding', 'service', true, true, coalesce(max("sort_order"), 0) + 1 FROM "product_categories"
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- Inactive so it never shows at the till; boarding money is only rung up from the Boarding page.
INSERT INTO "products" ("name", "category", "kind", "sku", "unit_price", "active")
SELECT 'Boarding', 'boarding', 'service', 'BOARDING', 0, false
WHERE NOT EXISTS (SELECT 1 FROM "products" WHERE "sku" = 'BOARDING');--> statement-breakpoint
-- Phase 2 (after the new build is live): every payment recorded in boarding_payments becomes
-- a sale on the day it was paid, with its method, then that table goes.
DO $$
DECLARE
  r record;
  yr int;
  inv int;
  pid uuid;
  tid uuid;
BEGIN
  IF to_regclass('public.boarding_payments') IS NULL THEN RETURN; END IF;
  SELECT "id" INTO pid FROM "products" WHERE "sku" = 'BOARDING';
  FOR r IN
    SELECT bp.*, b."client_id", b."created_by", c."name" AS client_name
    FROM "boarding_payments" bp
    JOIN "boardings" b ON b."id" = bp."boarding_id"
    JOIN "clients" c ON c."id" = b."client_id"
    WHERE bp."amount" > 0
    ORDER BY bp."paid_at"
  LOOP
    yr := extract(year FROM r."paid_at" AT TIME ZONE 'Africa/Cairo')::int;
    INSERT INTO "invoice_counters" ("year", "next_number") VALUES (yr, 2)
      ON CONFLICT ("year") DO UPDATE SET "next_number" = "invoice_counters"."next_number" + 1
      RETURNING "next_number" - 1 INTO inv;
    INSERT INTO "transactions" ("invoice_year", "invoice_no", "sold_by", "client_id", "customer_name", "subtotal", "total", "created_at", "boarding_id")
      VALUES (yr, inv, coalesce(r."logged_by", r."created_by"), r."client_id", r.client_name, r."amount", r."amount", r."paid_at", r."boarding_id")
      RETURNING "id" INTO tid;
    INSERT INTO "transaction_items" ("transaction_id", "product_id", "quantity", "unit_price") VALUES (tid, pid, 1, r."amount");
    IF r."method" IS NOT NULL THEN
      INSERT INTO "transaction_payments" ("transaction_id", "method", "amount") VALUES (tid, r."method", r."amount");
    END IF;
  END LOOP;
  DROP TABLE "boarding_payments" CASCADE;
END $$;
