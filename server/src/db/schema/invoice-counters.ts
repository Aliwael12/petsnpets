import { integer, pgTable } from 'drizzle-orm/pg-core';

/**
 * One row per year. Incrementing `nextNumber` under `SELECT ... FOR UPDATE` inside the
 * checkout transaction gives gapless, monotonic invoice numbers per year — a Postgres
 * sequence can't guarantee gaplessness because sequences advance on rollback.
 */
export const invoiceCounters = pgTable('invoice_counters', {
  year: integer('year').primaryKey(),
  nextNumber: integer('next_number').notNull().default(1),
});

export type InvoiceCounter = typeof invoiceCounters.$inferSelect;
export type NewInvoiceCounter = typeof invoiceCounters.$inferInsert;
