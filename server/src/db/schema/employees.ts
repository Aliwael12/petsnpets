import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { roleEnum } from './enums';

/**
 * One row per staff member. `authUserId` links to Supabase Auth (auth.users.id) for the
 * account-holder login; `pinHash` backs the shared-terminal operator switch used to attribute
 * POS actions to whoever is actually standing at the register. `enabledFeatures` is a
 * per-employee override of which nav tabs they see — see server/src/employees/features.ts —
 * independent of `role`, which still gates the underlying API endpoints.
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('employees_auth_user_id_idx').on(table.authUserId)],
);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
