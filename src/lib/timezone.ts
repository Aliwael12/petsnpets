const BUSINESS_TZ = 'Africa/Cairo';

/** Exported so display formatters render in the CLINIC's timezone, not the viewer's. */
export const BUSINESS_TIMEZONE = BUSINESS_TZ;

// en-CA formats as YYYY-MM-DD, which sorts/compares correctly as a plain string.
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ });

/** Is this ISO timestamp "today" in the business's own timezone — not the viewer's browser
 * timezone, which is what a plain `new Date().toDateString()` comparison would silently use.
 * Two people looking at the same dashboard from different timezones must see the same
 * answer. */
export function isTodayInBusinessTz(iso: string): boolean {
  return dayFormatter.format(new Date(iso)) === dayFormatter.format(new Date());
}

/** YYYY-MM-DD in the business's timezone — the grouping key for any client-side "totals per
 * day" chart, so two viewers in different timezones bucket the same sale into the same day. */
export function businessDayKey(iso: string): string {
  return dayFormatter.format(new Date(iso));
}

/** Today as YYYY-MM-DD in the clinic's timezone. */
export function todayKey(): string {
  return dayFormatter.format(new Date());
}

/** First day of the current Cairo month, as a day key. */
export function startOfMonthKey(): string {
  return `${todayKey().slice(0, 7)}-01`;
}

/** Today plus the next `days - 1` days, as YYYY-MM-DD keys in the business's timezone —
 * the date strip on the public booking form. */
export function nextBusinessDays(days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    keys.push(dayFormatter.format(d));
  }
  return keys;
}

const slotTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** An appointment instant rendered as clinic-local wall time. A visitor in another
 * timezone must still read "6:30 pm" and get the clinic's 6:30 pm, not their own. */
export function formatSlotTime(iso: string): string {
  return slotTimeFormatter.format(new Date(iso)).toLowerCase();
}

const dayPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** "Mon 1 Sep" for a YYYY-MM-DD key, read in the business timezone. */
export function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return dayPartsFormatter.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Splits a YYYY-MM-DD key into the pieces the date strip renders separately. */
export function dayKeyParts(dayKey: string): { weekday: string; day: string; month: string } {
  const [y, m, d] = dayKey.split('-').map(Number);
  const parts = dayPartsFormatter.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: get('weekday'), day: get('day'), month: get('month') };
}

const rangeLabelFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function labelParts(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map(Number);
  // Noon UTC, the same trick formatDayKey uses, so a bare day key reads back without
  // drifting a day in either direction.
  const parts = rangeLabelFormatter.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('day'), month: get('month'), year: get('year') };
}

/**
 * The human sentence for a range. Every range-scoped card prints this in its own subtitle,
 * so a filter shared across three screens is never invisible on the screen it is filtering.
 *
 *   {null, null}                -> "All time"
 *   {'2026-01-01', null}        -> "Since 1 Jan 2026"
 *   {null, '2026-09-30'}        -> "Up to 30 Sep 2026"
 *   {'2026-09-30','2026-09-30'} -> "30 Sep 2026"
 *   same month and year         -> "1 – 30 Sep 2026"
 *   same year                   -> "1 Jan – 30 Sep 2026"
 *   different years             -> "1 Jan 2025 – 30 Sep 2026"
 */
export function formatRangeLabel({ from, to }: { from: string | null; to: string | null }): string {
  if (!from && !to) return 'All time';
  const f = from ? labelParts(from) : null;
  const t = to ? labelParts(to) : null;
  if (f && !t) return `Since ${f.day} ${f.month} ${f.year}`;
  if (!f && t) return `Up to ${t.day} ${t.month} ${t.year}`;
  if (from === to) return `${f!.day} ${f!.month} ${f!.year}`;
  if (f!.year === t!.year && f!.month === t!.month) return `${f!.day} – ${t!.day} ${t!.month} ${t!.year}`;
  if (f!.year === t!.year) return `${f!.day} ${f!.month} – ${t!.day} ${t!.month} ${t!.year}`;
  return `${f!.day} ${f!.month} ${f!.year} – ${t!.day} ${t!.month} ${t!.year}`;
}
