CREATE TABLE "boardings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"total_amount" bigint NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boardings_amounts_non_negative" CHECK ("boardings"."total_amount" >= 0 AND "boardings"."paid_amount" >= 0),
	CONSTRAINT "boardings_dates_ordered" CHECK ("boardings"."end_date" >= "boardings"."start_date")
);
--> statement-breakpoint
ALTER TABLE "boardings" ADD CONSTRAINT "boardings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boardings" ADD CONSTRAINT "boardings_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boardings" ADD CONSTRAINT "boardings_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boardings_start_date_idx" ON "boardings" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "boardings_client_id_idx" ON "boardings" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "boardings" ENABLE ROW LEVEL SECURITY;