import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { productCategoryEnum, productKindEnum } from './enums';

/**
 * Products and clinic services share one table (matching the frontend's ProductCategory
 * union). `kind` is the structural switch: 'service' rows are never touched by the stock
 * ledger and never oversell, regardless of what `stockQuantity` happens to hold.
 *
 * unitPrice is stored in piastres (bigint) — never float, never fractional EGP.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    category: productCategoryEnum('category').notNull(),
    kind: productKindEnum('kind').notNull().default('good'),
    sku: text('sku').notNull().unique(),
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('products_category_idx').on(table.category),
    index('products_kind_idx').on(table.kind),
    check(
      'products_stock_non_negative',
      sql`${table.stockQuantity} >= 0 OR ${table.kind} = 'service'`,
    ),
    check('products_unit_price_non_negative', sql`${table.unitPrice} >= 0`),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
