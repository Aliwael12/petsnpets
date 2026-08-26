import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { employees } from './employees';

/**
 * Shared-terminal PIN switch. A device holds a long-lived Supabase Auth session ("this
 * register is authorized to run the app"); a PIN establishes who the *active operator* is
 * for a shift, and that identity — not the JWT subject — is what lands in actorId columns
 * across sales, refunds, pet logs, etc.
 */
export const operatorSessions = pgTable(
  'operator_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    index('operator_sessions_employee_id_idx').on(table.employeeId),
    index('operator_sessions_device_id_idx').on(table.deviceId),
  ],
);

export type OperatorSession = typeof operatorSessions.$inferSelect;
export type NewOperatorSession = typeof operatorSessions.$inferInsert;
