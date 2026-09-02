-- Data migration (no schema change), so it is hand-written rather than Drizzle-generated.
--
-- `/settings` was added to ALL_FEATURES after these employee rows were created, and
-- enabled_features is a per-employee snapshot taken at creation time — not something
-- derived from the role at read time. Without this backfill the Settings tab is invisible
-- to every existing employee (including doctors), since nobody's stored list contains it.
--
-- Idempotent: the @> containment check means re-running adds nothing.
UPDATE "employees"
SET "enabled_features" = "enabled_features" || '["/settings"]'::jsonb
WHERE NOT ("enabled_features" @> '["/settings"]'::jsonb);
