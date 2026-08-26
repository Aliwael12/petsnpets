const BUSINESS_TZ = 'Africa/Cairo';

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

/** The last `days` YYYY-MM-DD keys in the business's timezone, oldest first — pairs with
 * businessDayKey() to build a zero-filled daily series before folding real data into it. */
export function lastBusinessDays(days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(dayFormatter.format(d));
  }
  return keys;
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
