import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * A user-chosen window, expressed as INCLUSIVE Cairo calendar days.
 *
 * Day keys, not instants, because the four money streams do not share a column type:
 * transactions.created_at / refunds.created_at / supplier_orders.received_at are
 * timestamptz instants, while expenses.paid_on is a plain DATE typed off a receipt
 * (see db/schema/expenses.ts). A day key is the only bound that applies correctly to
 * both without the client having to know Cairo's UTC offset on some historical date.
 */
export interface DayRange {
  /** Inclusive. null means open-ended on that side. */
  from: string | null;
  to: string | null;
}

export const toDayRange = (q: { from?: string; to?: string }): DayRange => ({
  from: q.from ?? null,
  to: q.to ?? null,
});

/**
 * Half-open instant bounds for a timestamptz column.
 *
 * The upper bound is EXCLUSIVE and is the start of the day AFTER `to` — that is what makes
 * "to = the 30th" mean all of the 30th. It is also what makes adjacent ranges partition:
 * range(..m-1) and range(m..) derive their seam from the identical expression on the
 * identical date, so both resolve to the identical instant. No row can fall in both or in
 * neither, DST transition days included.
 *
 * Never `lte(col, new Date(to))` — that was the bug in purchasing.service.ts, where
 * new Date('2026-09-30') is 03:00 Cairo and silently dropped 21 hours of the last day.
 */
export function tsInRange(col: SQLWrapper, r: DayRange, tz: string): SQL[] {
  const parts: SQL[] = [];
  if (r.from) parts.push(sql`${col} >= (${r.from}::date::timestamp at time zone ${tz})`);
  if (r.to) parts.push(sql`${col} < ((${r.to}::date + 1)::timestamp at time zone ${tz})`);
  return parts;
}

/**
 * Closed bounds for a plain DATE column (expenses.paid_on). No timezone maths: a DATE has
 * no time of day, so `<= to` already means the whole of that day, and `<= m-1` / `>= m`
 * still partitions the discrete set of days at any seam.
 */
export function dateInRange(col: SQLWrapper, r: DayRange): SQL[] {
  const parts: SQL[] = [];
  if (r.from) parts.push(sql`${col} >= ${r.from}::date`);
  if (r.to) parts.push(sql`${col} <= ${r.to}::date`);
  return parts;
}

/**
 * The fragments folded into a leading ` and ...` clause for use inside a raw template, or
 * sql.empty() when the range is open — so an unfiltered call plans exactly as it does
 * today. Call sites read `... where true ${andClause(tsInRange(...))}`.
 */
export function andClause(parts: SQL[]): SQL {
  return parts.length === 0 ? sql.empty() : sql` and ${sql.join(parts, sql` and `)}`;
}

/** A calendar month as inclusive day keys. */
export function monthDayBounds(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0');
  // month is 1-based, so day 0 of the next month is the last day of this one.
  const last = String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}` };
}
