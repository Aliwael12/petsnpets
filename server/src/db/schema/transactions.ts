import { bigint, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { clients } from './clients';
import { employees } from './employees';
import { products } from './catalog';
import { discounts } from './discounts';

/**
 * All money columns are bigint piastres. `subtotal` is the pre-discount sum of line totals;
 * `total` is what was actually charged and is what analytics/money-in should sum. `invoiceNo`
 * is scoped per `invoiceYear` via invoice_counters, not a global sequence.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceYear: integer('invoice_year').notNull(),
    invoiceNo: integer('invoice_no').notNull(),
    soldBy: uuid('sold_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    customerName: text('customer_name').notNull(),
    subtotal: bigint('subtotal', { mode: 'number' }).notNull(),
    discountId: uuid('discount_id').references(() => discounts.id, { onDelete: 'set null' }),
    discountAmount: bigint('discount_amount', { mode: 'number' }),
    total: bigint('total', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transactions_sold_by_idx').on(table.soldBy),
    index('transactions_client_id_idx').on(table.clientId),
    index('transactions_created_at_idx').on(table.createdAt),
    unique('transactions_invoice_year_no_key').on(table.invoiceYear, table.invoiceNo),
  ],
);

export const transactionItems = pgTable(
  'transaction_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    // Price snapshotted at sale time — never join to products for historical pricing.
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('transaction_items_transaction_id_idx').on(table.transactionId),
    index('transaction_items_product_id_idx').on(table.productId),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionItem = typeof transactionItems.$inferSelect;
export type NewTransactionItem = typeof transactionItems.$inferInsert;
