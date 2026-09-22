CREATE TYPE "public"."pet_sex" AS ENUM('male', 'female');--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "sex" "pet_sex";--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "birth_date" date;