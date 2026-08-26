import { bigint, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { transactions } from './transactions';
import { products } from './catalog';
import { employees } from './employees';

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'restrict' }),
    total: bigint('total', { mode: 'number' }).notNull(),
    refundedBy: uuid('refunded_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('refunds_transaction_id_idx').on(table.transactionId),
    index('refunds_refunded_by_idx').on(table.refundedBy),
  ],
);

export const refundItems = pgTable(
  'refund_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    refundId: uuid('refund_id')
      .notNull()
      .references(() => refunds.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    // Snapshotted from the original transaction_items row, not the current product price.
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('refund_items_refund_id_idx').on(table.refundId),
    index('refund_items_product_id_idx').on(table.productId),
  ],
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
export type RefundItem = typeof refundItems.$inferSelect;
export type NewRefundItem = typeof refundItems.$inferInsert;
