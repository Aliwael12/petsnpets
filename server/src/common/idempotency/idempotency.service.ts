import { Inject, Injectable } from '@nestjs/common';
import { eq, sql as rawSql } from 'drizzle-orm';
import { DB } from '../../db/db.constants';
import type { Database } from '../../db/db.types';
import { idempotencyKeys } from '../../db/schema';
import { IdempotencyConflictError } from '../errors/app-error';

const IN_PROGRESS = 0;

export interface IdempotentResult<T> {
  status: number;
  body: T;
}

/**
 * Wraps a mutation so a repeated request with the same `Idempotency-Key` replays the first
 * response instead of re-executing — the fix for double-tapped checkouts and retried
 * network calls. The claim is a separate, immediately-committed statement outside the
 * caller's business transaction (so it's visible to a concurrent duplicate the instant it
 * lands), while the business logic still gets its own atomic transaction via `fn`.
 *
 * Concurrent true-duplicates (two requests with the same key arriving before either has
 * finished) are rejected with 409 rather than silently run twice — the client is expected to
 * retry, at which point the winner's result has landed and it replays cleanly.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async run<T>(
    key: string,
    endpoint: string,
    actorId: string,
    fn: () => Promise<IdempotentResult<T>>,
  ): Promise<IdempotentResult<T>> {
    const claimed = await this.db
      .insert(idempotencyKeys)
      .values({ key, endpoint, actorId, statusCode: IN_PROGRESS, responseBody: {} })
      .onConflictDoNothing({ target: idempotencyKeys.key })
      .returning({ key: idempotencyKeys.key });

    if (claimed.length === 0) {
      // Someone already holds this key — either finished (replay it) or still running.
      const [existing] = await this.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1);
      if (existing && existing.statusCode !== IN_PROGRESS) {
        return { status: existing.statusCode, body: existing.responseBody as T };
      }
      throw new IdempotencyConflictError(key);
    }

    try {
      const result = await fn();
      await this.db
        .update(idempotencyKeys)
        .set({ statusCode: result.status, responseBody: result.body as object })
        .where(eq(idempotencyKeys.key, key));
      return result;
    } catch (err) {
      // The business transaction rolled back — nothing happened, so let a retry proceed
      // fresh rather than being permanently stuck replaying a claim that never resolved.
      await this.db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      throw err;
    }
  }

  /** Diagnostic use only — not on the hot path. */
  async purgeOlderThan(hours: number): Promise<number> {
    const result = await this.db.execute(
      rawSql`delete from idempotency_keys where created_at < now() - (${hours} || ' hours')::interval`,
    );
    return result.count ?? 0;
  }
}
