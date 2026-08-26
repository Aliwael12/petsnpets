import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Keyed by a client-generated UUID sent as the `Idempotency-Key` header. A repeated request
 * with the same key + endpoint replays the stored response instead of re-executing the
 * mutation — the fix for double-tapped checkouts and retried refunds.
 */
export const idempotencyKeys = pgTable('idempotency_keys', {
  key: uuid('key').primaryKey(),
  endpoint: text('endpoint').notNull(),
  actorId: uuid('actor_id').notNull(),
  statusCode: integer('status_code').notNull(),
  responseBody: jsonb('response_body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKeyRow = typeof idempotencyKeys.$inferInsert;
