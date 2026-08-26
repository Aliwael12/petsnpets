/**
 * Opening hours are defined in the clinic's own timezone and validated there — never in
 * the server's local timezone or the visitor's. Someone booking from London must get the
 * same answer about what "6pm Tuesday" means as the receptionist standing in the clinic.
 */
export const BUSINESS_TZ = 'Africa/Cairo';

/** Slot granularity, in minutes. Requests not landing exactly on a boundary are rejected. */
export const SLOT_MINUTES = 30;

/** How far ahead the public booking form is allowed to reach. */
export const MAX_DAYS_AHEAD = 60;

/** How soon a slot can be booked — nobody should reserve a slot 5 minutes from now. */
export const MIN_HOURS_AHEAD = 2;

/** [openHour, closeHour) per weekday, 0 = Sunday. Friday opens late (the Egyptian weekend). */
const HOURS_BY_WEEKDAY: Record<number, [number, number]> = {
  0: [10, 22], // Sunday
  1: [10, 22], // Monday
  2: [10, 22], // Tuesday
  3: [10, 22], // Wednesday
  4: [10, 22], // Thursday
  5: [16, 22], // Friday
  6: [10, 22], // Saturday
};

export const OPENING_HOURS = HOURS_BY_WEEKDAY;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface CairoParts {
  weekday: number;
  hour: number;
  minute: number;
}

/** The weekday/hour/minute this instant reads as *in Cairo*, whatever the server's own clock. */
export function cairoParts(date: Date): CairoParts {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // Intl renders midnight as "24" in some hour12:false implementations — normalise it.
  const hour = Number(get('hour')) % 24;
  return { weekday: WEEKDAY_INDEX[get('weekday')] ?? 0, hour, minute: Number(get('minute')) };
}

export interface SlotRejection {
  code: 'NOT_ON_BOUNDARY' | 'TOO_SOON' | 'TOO_FAR' | 'OUTSIDE_HOURS';
  message: string;
}

/** Returns null when the instant is a bookable slot, or the specific reason it isn't. */
export function validateSlot(requestedAt: Date, now = new Date()): SlotRejection | null {
  const { weekday, hour, minute } = cairoParts(requestedAt);

  if (minute % SLOT_MINUTES !== 0) {
    return { code: 'NOT_ON_BOUNDARY', message: `Appointments start every ${SLOT_MINUTES} minutes.` };
  }

  const hoursAhead = (requestedAt.getTime() - now.getTime()) / 3_600_000;
  if (hoursAhead < MIN_HOURS_AHEAD) {
    return {
      code: 'TOO_SOON',
      message: `Please pick a time at least ${MIN_HOURS_AHEAD} hours from now — call us for anything urgent.`,
    };
  }
  if (hoursAhead > MAX_DAYS_AHEAD * 24) {
    return { code: 'TOO_FAR', message: `Bookings open ${MAX_DAYS_AHEAD} days ahead.` };
  }

  const [open, close] = HOURS_BY_WEEKDAY[weekday];
  if (hour < open || hour >= close) {
    return { code: 'OUTSIDE_HOURS', message: 'The clinic is closed at that time.' };
  }

  return null;
}

/** Every slot the clinic is open on a given Cairo calendar day, as ISO instants. */
export function slotsForDay(dayKey: string): string[] {
  const [year, month, day] = dayKey.split('-').map(Number);
  // Noon UTC is safely inside the target Cairo day (Cairo is UTC+2/+3), so the weekday
  // lookup can't slide into the neighbouring day the way midnight UTC would.
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const { weekday } = cairoParts(probe);
  const [open, close] = HOURS_BY_WEEKDAY[weekday];

  const slots: string[] = [];
  for (let hour = open; hour < close; hour++) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      // Cairo's UTC offset shifts with DST, so derive it for this exact day rather than
      // hardcoding +2: start from the naive UTC guess, then correct by the observed drift.
      const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
      const observed = cairoParts(guess);
      const driftMinutes = (observed.hour - hour) * 60 + (observed.minute - minute);
      slots.push(new Date(guess.getTime() - driftMinutes * 60_000).toISOString());
    }
  }
  return slots;
}
