CREATE TYPE "public"."payment_method" AS ENUM('cash', 'instapay', 'card');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payee" text,
	"paid_on" date NOT NULL,
	"note" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_employees_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_employees_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_paid_on_idx" ON "expenses" USING btree ("paid_on");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "expenses_recorded_by_idx" ON "expenses" USING btree ("recorded_by");--> statement-breakpoint
CREATE INDEX "supplier_orders_received_at_idx" ON "supplier_orders" USING btree ("received_at");--> statement-breakpoint
-- Hand-added (Drizzle Kit does not emit RLS): every table in this schema runs with RLS
-- enabled and zero policies as a leak backstop — see 20260826100500_auth_hook_and_rls.sql
-- for the rationale. A new table without this line would be the one table an anon key
-- could read, and it happens to be the one holding salaries.
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
