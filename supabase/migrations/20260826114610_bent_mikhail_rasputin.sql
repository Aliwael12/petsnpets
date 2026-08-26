CREATE TYPE "public"."appointment_status" AS ENUM('pending', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"pet_name" text NOT NULL,
	"species" "species" NOT NULL,
	"service_id" uuid,
	"service_name" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"notes" text,
	"status" "appointment_status" DEFAULT 'pending' NOT NULL,
	"client_id" uuid,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_products_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_handled_by_employees_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_requested_at_idx" ON "appointments" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointments_client_id_idx" ON "appointments" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_active_slot_key" ON "appointments" USING btree ("requested_at") WHERE status in ('pending', 'confirmed');