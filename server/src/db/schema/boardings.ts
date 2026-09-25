import { bigint, check, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clients } from './clients';
import { pets } from './pets';
import { employees } from './employees';

/**
 * A pet staying at the clinic. What's still owed is always `totalAmount - paidAmount`,
 * never stored, so the two can't drift apart.
 *
 * This is a record of the stay and its balance, not a sale: it does not feed the Income /
 * Net figures, which are built from POS transactions only.
 */
export const boardings = pgTable(
  'boardings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'restrict' }),
    /** Integer piastres, like every other money column. */
    totalAmount: bigint('total_amount', { mode: 'number' }).notNull(),
    paidAmount: bigint('paid_amount', { mode: 'number' }).notNull().default(0),
    /** Plain calendar days — a stay is booked by day, not by instant. */
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    note: text('note'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('boardings_start_date_idx').on(table.startDate),
    index('boardings_client_id_idx').on(table.clientId),
    check('boardings_amounts_non_negative', sql`${table.totalAmount} >= 0 AND ${table.paidAmount} >= 0`),
    check('boardings_dates_ordered', sql`${table.endDate} >= ${table.startDate}`),
  ],
);

export type Boarding = typeof boardings.$inferSelect;
export type NewBoarding = typeof boardings.$inferInsert;
