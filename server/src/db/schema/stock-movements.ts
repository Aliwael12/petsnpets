import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { stockReasonEnum } from './enums';
import { products } from './catalog';
import { employees } from './employees';

/**
 * Append-only ledger — the single source of truth for stock. `products.stockQuantity` is a
 * cache that must only ever be updated in the same DB transaction as the movement that
 * caused it. Reconciliation (`sum(delta) per product == stockQuantity`) is a query against
 * this table, not a guess.
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    delta: integer('delta').notNull(),
    reason: stockReasonEnum('reason').notNull(),
    refId: uuid('ref_id'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('stock_movements_product_created_idx').on(table.productId, table.createdAt),
    index('stock_movements_ref_id_idx').on(table.refId),
  ],
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
