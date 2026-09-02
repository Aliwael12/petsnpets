import { bigint, index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { paymentMethodEnum } from './enums';
import { suppliers } from './suppliers';
import { products } from './catalog';
import { employees } from './employees';

export const supplierOrders = pgTable(
  'supplier_orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    costTotal: bigint('cost_total', { mode: 'number' }).notNull(),
    /** Expiry of the received batch, where the goods have one (medicine, food). Tracked on
     * the shipment rather than the product because two batches of the same product can
     * expire on different dates. */
    expiryDate: timestamp('expiry_date', { withTimezone: true }),
    /** Stock paid for in cash empties the same drawer a cash sale fills, so without this the
     * expense side of the payment breakdown would be blank. Nullable for the same
     * no-backfill reason as transactions.paymentMethod. */
    paymentMethod: paymentMethodEnum('payment_method'),
    loggedBy: uuid('logged_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('supplier_orders_supplier_id_idx').on(table.supplierId),
    index('supplier_orders_product_id_idx').on(table.productId),
    index('supplier_orders_logged_by_idx').on(table.loggedBy),
    // The monthly-expenses query range-scans received_at; it was previously unindexed.
    index('supplier_orders_received_at_idx').on(table.receivedAt),
  ],
);

export type SupplierOrder = typeof supplierOrders.$inferSelect;
export type NewSupplierOrder = typeof supplierOrders.$inferInsert;
