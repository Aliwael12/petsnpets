import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appointmentStatusEnum, speciesEnum } from './enums';
import { clients } from './clients';
import { employees } from './employees';
import { products } from './catalog';

/**
 * A booking request from the public website. Created unauthenticated, so every field here
 * is untrusted input — `status` always starts 'pending' and `clientId`/`handledBy` can only
 * ever be set by staff afterwards (see AppointmentsService).
 *
 * `serviceName` is snapshotted rather than joined: the requested service must still read
 * correctly on the calendar years later even if that catalog row is renamed or deactivated.
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ownerName: text('owner_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    petName: text('pet_name').notNull(),
    species: speciesEnum('species').notNull(),
    serviceId: uuid('service_id').references(() => products.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    notes: text('notes'),
    status: appointmentStatusEnum('status').notNull().default('pending'),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    handledBy: uuid('handled_by').references(() => employees.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('appointments_requested_at_idx').on(table.requestedAt),
    index('appointments_status_idx').on(table.status),
    index('appointments_client_id_idx').on(table.clientId),
    // Double-booking is prevented in the database, not by a check-then-insert in app code —
    // two people submitting the same slot simultaneously is exactly the race a partial
    // unique index closes. Cancelled/completed rows are excluded so a freed slot reopens.
    uniqueIndex('appointments_active_slot_key')
      .on(table.requestedAt)
      .where(sql`status in ('pending', 'confirmed')`),
  ],
);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
