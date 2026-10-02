CREATE TABLE "income_reallocations" (
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"deltas" jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "income_reallocations_year_month_pk" PRIMARY KEY("year","month")
);
--> statement-breakpoint
ALTER TABLE "income_reallocations" ADD CONSTRAINT "income_reallocations_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;