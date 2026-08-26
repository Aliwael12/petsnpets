import { bigint, index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
    loggedBy: uuid('logged_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('supplier_orders_supplier_id_idx').on(table.supplierId),
    index('supplier_orders_product_id_idx').on(table.productId),
    index('supplier_orders_logged_by_idx').on(table.loggedBy),
  ],
);

export type SupplierOrder = typeof supplierOrders.$inferSelect;
export type NewSupplierOrder = typeof supplierOrders.$inferInsert;
