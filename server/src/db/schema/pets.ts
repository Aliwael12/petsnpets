import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { speciesEnum } from './enums';
import { clients } from './clients';

export const pets = pgTable(
  'pets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    species: speciesEnum('species').notNull(),
    breed: text('breed').notNull().default(''),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('pets_client_id_idx').on(table.clientId)],
);

/** Optional alternate contact numbers for a pet (e.g. a boarding or walking contact). */
export const petPhones = pgTable(
  'pet_phones',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    petId: uuid('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
  },
  (table) => [index('pet_phones_pet_id_idx').on(table.petId)],
);

export type Pet = typeof pets.$inferSelect;
export type NewPet = typeof pets.$inferInsert;
export type PetPhone = typeof petPhones.$inferSelect;
export type NewPetPhone = typeof petPhones.$inferInsert;
