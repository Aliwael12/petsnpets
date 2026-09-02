-- Data migration (no schema change), so it is hand-written rather than Drizzle-generated.
--
-- `/expenses` was added to ALL_FEATURES after these employee rows were created, and
-- enabled_features is a per-employee snapshot taken at creation time — not something
-- derived from the role at read time. Without this backfill the Expenses tab is invisible
-- even to the doctors it was built for.
--
-- Doctors only: the expenses table records salaries, so both the API (@Roles('doctor'))
-- and the nav gate keep it out of nurse and cashier sessions. Granting the feature to
-- everyone here would put a tab in their sidebar that only ever returns 403.
--
-- Idempotent: the @> containment check means re-running adds nothing.
UPDATE "employees"
SET "enabled_features" = "enabled_features" || '["/expenses"]'::jsonb
WHERE "role" = 'doctor'
  AND NOT ("enabled_features" @> '["/expenses"]'::jsonb);
