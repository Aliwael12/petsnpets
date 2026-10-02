CREATE TABLE "boarding_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boarding_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method" "payment_method",
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"logged_by" uuid,
	CONSTRAINT "boarding_payments_amount_non_zero" CHECK ("boarding_payments"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "boarding_payments" ADD CONSTRAINT "boarding_payments_boarding_id_boardings_id_fk" FOREIGN KEY ("boarding_id") REFERENCES "public"."boardings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boarding_payments" ADD CONSTRAINT "boarding_payments_logged_by_employees_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boarding_payments_boarding_id_idx" ON "boarding_payments" USING btree ("boarding_id");--> statement-breakpoint
CREATE INDEX "boarding_payments_paid_at_idx" ON "boarding_payments" USING btree ("paid_at");--> statement-breakpoint
-- Every amount already recorded as paid becomes one payment on the day the stay was logged,
-- method not recorded. Idempotent: skips stays that already have payment rows.
INSERT INTO "boarding_payments" ("boarding_id", "amount", "method", "paid_at", "logged_by")
SELECT b."id", b."paid_amount", NULL, b."created_at", b."created_by"
FROM "boardings" b
WHERE b."paid_amount" > 0
  AND NOT EXISTS (SELECT 1 FROM "boarding_payments" p WHERE p."boarding_id" = b."id");
