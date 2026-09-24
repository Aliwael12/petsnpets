import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clients } from './clients';
import { pets } from './pets';
import { employees } from './employees';

/**
 * A follow-up someone at the clinic needs to do for a client ("call about the booster",
 * "check the stitches"). Separate from pet_logs on purpose: a pet log records something that
 * was already done and is append-only, while a reminder is a to-do that gets ticked off —
 * without `completedAt`, every reminder would sit in "Overdue" forever.
 */
export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    /** Optional: a client with no pet on file can still need a follow-up call. */
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => employees.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('reminders_due_at_idx').on(table.dueAt),
    index('reminders_client_id_idx').on(table.clientId),
  ],
);

export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
