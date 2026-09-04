ALTER TYPE "public"."role" ADD VALUE 'admin' BEFORE 'doctor';--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL;