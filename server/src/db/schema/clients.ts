import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { phoneLabelEnum } from './enums';

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clientPhones = pgTable(
  'client_phones',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    label: phoneLabelEnum('label').notNull().default('mobile'),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (table) => [index('client_phones_client_id_idx').on(table.clientId)],
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientPhone = typeof clientPhones.$inferSelect;
export type NewClientPhone = typeof clientPhones.$inferInsert;
