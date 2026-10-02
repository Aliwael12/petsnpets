import { bigint, check, index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { paymentMethodEnum } from './enums';
import { boardings } from './boardings';
import { employees } from './employees';

/**
 * Money taken (or, with a negative amount, given back / corrected) on a boarding stay, dated
 * when it happened. This is what makes boarding count as income: the income figures add
 * these up by `paid_at` and method, alongside POS sales. Every change to a stay's
 * `paid_amount` writes one row for the difference, so the rows always sum to it.
 */
export const boardingPayments = pgTable(
  'boarding_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    boardingId: uuid('boarding_id')
      .notNull()
      .references(() => boardings.id, { onDelete: 'cascade' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    /** Null means "not recorded", as for sales. */
    method: paymentMethodEnum('method'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    loggedBy: uuid('logged_by').references(() => employees.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('boarding_payments_boarding_id_idx').on(table.boardingId),
    index('boarding_payments_paid_at_idx').on(table.paidAt),
    check('boarding_payments_amount_non_zero', sql`${table.amount} <> 0`),
  ],
);

export type BoardingPayment = typeof boardingPayments.$inferSelect;
