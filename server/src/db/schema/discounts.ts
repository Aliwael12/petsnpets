import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { discountKindEnum } from './enums';
import { clients } from './clients';
import { employees } from './employees';
import { transactions } from './transactions';

/**
 * Doctor-issued, single-use. `usedInTransactionId` is UNIQUE so the database itself refuses
 * a second sale from claiming an already-spent discount — the atomic claim in the sales
 * service (`UPDATE ... WHERE used = false RETURNING *`) is what makes the race safe, and this
 * constraint is the backstop if that discipline is ever bypassed.
 */
export const discounts = pgTable(
  'discounts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    kind: discountKindEnum('kind').notNull(),
    value: integer('value').notNull(),
    note: text('note'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    usedInTransactionId: uuid('used_in_transaction_id')
      .unique()
      .references(() => transactions.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('discounts_client_id_idx').on(table.clientId),
    index('discounts_created_by_idx').on(table.createdBy),
  ],
);

export type Discount = typeof discounts.$inferSelect;
export type NewDiscount = typeof discounts.$inferInsert;
