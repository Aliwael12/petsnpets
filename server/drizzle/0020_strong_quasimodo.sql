ALTER TABLE "transaction_payments" ADD COLUMN "fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "card_fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Every Visa / Card payment already recorded gets the 1.2% fee, and each sale its total.
UPDATE "transaction_payments" SET "fee" = round("amount" * 0.012) WHERE "method" = 'card' AND "fee" = 0;--> statement-breakpoint
UPDATE "transactions" t SET "card_fee" = coalesce((SELECT sum(p."fee") FROM "transaction_payments" p WHERE p."transaction_id" = t."id"), 0);
