CREATE TABLE "transaction_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "transaction_payments_amount_positive" CHECK ("transaction_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_payments_transaction_id_idx" ON "transaction_payments" USING btree ("transaction_id");--> statement-breakpoint
-- Carry every recorded single-method sale over as one full payment row. Idempotent (skips
-- sales that already have payment rows), so it can run again right before the drop to catch
-- sales rung up by the previous deployment in between. A zero-total sale needs no payment.
INSERT INTO "transaction_payments" ("transaction_id", "method", "amount")
SELECT t."id", t."payment_method", t."total"
FROM "transactions" t
WHERE t."payment_method" IS NOT NULL
  AND t."total" > 0
  AND NOT EXISTS (SELECT 1 FROM "transaction_payments" p WHERE p."transaction_id" = t."id");--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "payment_method";