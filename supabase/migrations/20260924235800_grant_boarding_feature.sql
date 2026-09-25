-- Data migration (no schema change), so it is hand-written rather than Drizzle-generated.
--
-- `/boarding` was added to ALL_FEATURES after these employee rows were created, and
-- enabled_features is a per-employee snapshot taken at creation time — without this backfill
-- the Boarding tab is invisible to everyone, admins included. Every role gets it: whoever
-- checks a pet in is the one who logs the stay.
--
-- Idempotent: the @> containment check means re-running adds nothing.
UPDATE "employees"
SET "enabled_features" = "enabled_features" || '["/boarding"]'::jsonb
WHERE NOT ("enabled_features" @> '["/boarding"]'::jsonb);
