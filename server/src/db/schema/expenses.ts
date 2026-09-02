import { bigint, check, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { paymentMethodEnum } from './enums';
import { employees } from './employees';

/**
 * Money paid out to RUN the clinic — rent, salaries, utilities, repairs.
 *
 * Deliberately disjoint from supplier_orders: stock bought for resale is recorded there and
 * is already counted in the Expenses total, so nothing here links to a supplier. Keeping the
 * two structurally separate is what stops the same shipment being counted twice.
 *
 * There is no hard delete. Rows are voided (`voidedAt`), because hard-deleting a row that a
 * past month's Net was computed from would silently restate history — the same discipline as
 * the append-only stock ledger.
 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Validated against a fixed list in the DTO rather than a pgEnum, so adding a category
     * later needs no migration. */
    category: text('category').notNull(),
    description: text('description').notNull(),
    /** Integer piastres, like every other money column. Strictly positive: a negative expense
     * would be an income backdoor that inflates Net with no sale behind it and is invisible
     * to every revenue report. Corrections are void-and-re-enter, which leaves a trail. */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    /** Who it was paid to. Free text, deliberately NOT a FK to suppliers — a supplier picker
     * here would read as "log supplier payments in this form", which is the main
     * double-counting risk in this design. */
    payee: text('payee'),
    /**
     * The Cairo calendar day the money actually left, typed off a receipt and routinely
     * backdated. A plain DATE, not a timestamptz: it is a human's answer to "when did you pay
     * this?", not an instant the system observed, so it needs no timezone conversion and
     * cannot drift. ALL money bucketing for expenses uses this column.
     */
    paidOn: date('paid_on').notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    /** When the row was TYPED. Audit metadata only — never used for money bucketing, unlike
     * every other table here, which is exactly why this comment exists. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => employees.id, { onDelete: 'restrict' }),
    voidReason: text('void_reason'),
  },
  (table) => [
    // Every dashboard and Money in/out query range-scans paid_on.
    index('expenses_paid_on_idx').on(table.paidOn),
    index('expenses_category_idx').on(table.category),
    index('expenses_recorded_by_idx').on(table.recordedBy),
    check('expenses_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
