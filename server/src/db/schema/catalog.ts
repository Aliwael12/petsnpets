import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { productKindEnum } from './enums';

/**
 * Product categories, managed from Settings rather than hardcoded. `name` is the stable
 * key products point at (and what analytics groups by); `label` is the display string, so
 * renaming for presentation never has to touch product rows.
 *
 * `kind` is what makes a category structural rather than cosmetic: products in a
 * kind='service' category are never touched by the stock ledger. That's why the built-in
 * 'service' category is flagged `isSystem` — deleting or repurposing it would silently
 * change how existing clinic services behave.
 */
export const productCategories = pgTable('product_categories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull().unique(),
  label: text('label').notNull(),
  kind: productKindEnum('kind').notNull().default('good'),
  active: boolean('active').notNull().default(true),
  /** Built-in categories the app's own logic depends on; not deletable from the UI. */
  isSystem: boolean('is_system').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Products and clinic services share one table. `kind` is the structural switch: 'service'
 * rows are never touched by the stock ledger and never oversell, regardless of what
 * `stockQuantity` happens to hold. It's derived from the category's own `kind`, never
 * client-supplied.
 *
 * unitPrice is stored in piastres (bigint) — never float, never fractional EGP.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    /** Optional manufacturer/brand, captured when receiving stock from a supplier. */
    brand: text('brand'),
    // FK on the category *name* rather than its id so analytics can keep grouping by a
    // human-readable value with no join. ON UPDATE CASCADE makes renaming a category
    // propagate automatically; ON DELETE RESTRICT stops one being deleted out from under
    // the products still using it.
    category: text('category')
      .notNull()
      .references(() => productCategories.name, { onDelete: 'restrict', onUpdate: 'cascade' }),
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

export type ProductCategory = typeof productCategories.$inferSelect;
export type NewProductCategory = typeof productCategories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
