import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { logTypeEnum } from './enums';
import { pets } from './pets';
import { employees } from './employees';

/** Append-only. Medical/grooming history is never hard-deleted. */
export const petLogs = pgTable(
  'pet_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'restrict' }),
    logType: logTypeEnum('log_type').notNull(),
    description: text('description').notNull(),
    performedBy: uuid('performed_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
    nextDueDate: timestamp('next_due_date', { withTimezone: true }),
  },
  (table) => [
    index('pet_logs_pet_id_idx').on(table.petId),
    index('pet_logs_performed_by_idx').on(table.performedBy),
    index('pet_logs_next_due_date_idx').on(table.nextDueDate),
  ],
);

export type PetLog = typeof petLogs.$inferSelect;
export type NewPetLog = typeof petLogs.$inferInsert;
