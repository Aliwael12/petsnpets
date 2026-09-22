import { boolean, index, integer, pgSequence, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { phoneLabelEnum } from './enums';

/** Backs clients.legacyId. Seeded (in the migration) to continue right after the highest
 *  row number the historical import used, so every client — imported or added since — gets
 *  a gapless, human-readable number with no risk of two concurrent sign-ups racing to the
 *  same value the way a plain `max(legacy_id) + 1` query would. */
export const clientLegacyIdSeq = pgSequence('client_legacy_id_seq', {
  // One past the highest row number the historical import assigned (1380).
  startWith: 1381,
  minValue: 1,
});

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  /** A stable, human-facing client number. Carried over from the row number in the
   *  clinic's pre-app spreadsheet for imported clients; auto-assigned from
   *  clientLegacyIdSeq for everyone added since — the name stuck from the import, but it's
   *  no longer just a legacy artifact. Display-only; nothing else keys off it. */
  legacyId: integer('legacy_id').default(sql`nextval('client_legacy_id_seq')`),
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
