import { integer, jsonb, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { employees } from './employees';

/**
 * The admin's correction to how one month's income splits across payment methods, e.g. "EGP
 * 2,000 recorded as cash was really InstaPay". Stored as per-method shifts in piastres that
 * always sum to zero, so the month's total never changes and no sale or payment row is
 * touched. The breakdowns show raw payments plus these shifts; storing shifts rather than
 * target amounts keeps the correction valid as more sales land in the month.
 *
 * Keys are payment methods plus 'unrecorded' (money from sales rung up without a method).
 */
export const incomeReallocations = pgTable(
  'income_reallocations',
  {
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    deltas: jsonb('deltas').$type<Record<string, number>>().notNull(),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.year, table.month] })],
);

export type IncomeReallocation = typeof incomeReallocations.$inferSelect;
