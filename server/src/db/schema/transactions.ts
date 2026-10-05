import { bigint, check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { paymentMethodEnum } from './enums';
import { clients } from './clients';
import { employees } from './employees';
import { products } from './catalog';
import { discounts } from './discounts';
import { boardings } from './boardings';

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
    /** The card processor's cut on this sale's Visa / Card payments (sum of their `fee`).
     *  The customer is charged `total`; income and every money report count
     *  `total - cardFee`. Stored, not derived from a rate, so changing the rate later never
     *  rewrites past figures. */
    cardFee: bigint('card_fee', { mode: 'number' }).notNull().default(0),
    /** Set on the sales rung up automatically for money paid on a boarding stay. */
    boardingId: uuid('boarding_id').references(() => boardings.id, { onDelete: 'set null' }),
    // How it was paid lives in transaction_payments — one row per method, so a bill can be
    // split (e.g. half cash, half card).
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transactions_sold_by_idx').on(table.soldBy),
    index('transactions_client_id_idx').on(table.clientId),
    index('transactions_boarding_id_idx').on(table.boardingId),
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

/**
 * How a sale was paid: one row per method. The rows always sum to exactly the sale's total,
 * or there are none at all — never a partial set. No rows means "not recorded" (a sale from
 * before payment tracking, or one rung up without a method), and it is deliberately never
 * folded into cash: the breakdown exists to reconcile the drawer against reality.
 */
export const transactionPayments = pgTable(
  'transaction_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    method: paymentMethodEnum('method').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    /** Card processing fee on this line (CARD_FEE_BPS of a card payment, else 0). */
    fee: bigint('fee', { mode: 'number' }).notNull().default(0),
  },
  (table) => [
    index('transaction_payments_transaction_id_idx').on(table.transactionId),
    check('transaction_payments_amount_positive', sql`${table.amount} > 0`),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TransactionItem = typeof transactionItems.$inferSelect;
export type NewTransactionItem = typeof transactionItems.$inferInsert;
export type TransactionPayment = typeof transactionPayments.$inferSelect;
