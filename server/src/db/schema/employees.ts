import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { roleEnum } from './enums';

/**
 * One row per staff member. `authUserId` links to Supabase Auth (auth.users.id) for the
 * account-holder login; `pinHash` backs the shared-terminal operator switch used to attribute
 * POS actions to whoever is actually standing at the register.
 *
 * Two separate access lists, on purpose:
 *   `enabledFeatures` — which nav tabs are shown. Cosmetic; the API never reads it.
 *   `permissions`     — what the person may actually DO. Enforced on every request.
 * See server/src/employees/features.ts and permissions.ts respectively.
 */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    authUserId: uuid('auth_user_id').unique(),
    name: text('name').notNull(),
    role: roleEnum('role').notNull(),
    pinHash: text('pin_hash'),
    active: boolean('active').notNull().default(true),
    enabledFeatures: jsonb('enabled_features').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    /** Server-ENFORCED capabilities, unlike enabledFeatures above. Empty for everyone but
     *  an admin, who holds all of them implicitly and so stores none — see
     *  employees/permissions.ts hasPermission(). */
    permissions: jsonb('permissions').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('employees_auth_user_id_idx').on(table.authUserId)],
);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
