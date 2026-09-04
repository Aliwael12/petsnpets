-- Data migration (no schema change), hand-written rather than Drizzle-generated.
--
-- MUST be a separate file from the one that adds 'admin' to the role enum: Postgres will
-- not let a transaction use an enum value that the same transaction created, and each
-- migration file runs in its own transaction.
--
-- Promotes the clinic's founding account to the new admin role. Deliberately picks the
-- earliest-created active doctor rather than matching on a name — a name is display text a
-- user can edit at any time, and a migration that silently matches nothing is worse than one
-- that is obviously deterministic. On the live database this is Dr. Ali Mansour, who is the
-- only employee.
--
-- Idempotent and safe to re-run: the WHERE NOT EXISTS means it does nothing once any admin
-- exists, so a second run can never promote a second person.
UPDATE "employees"
SET "role" = 'admin'
WHERE "id" = (
  SELECT "id"
  FROM "employees"
  WHERE "role" = 'doctor' AND "active" = true
  ORDER BY "created_at" ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "employees" WHERE "role" = 'admin');

-- Admins hold every permission implicitly (see employees/permissions.ts hasPermission), so
-- there is deliberately nothing to write into `permissions` here. Leaving it empty is what
-- makes adding a future permission safe: no existing admin row has to be backfilled, and no
-- admin can be locked out by a bad grant edit.
