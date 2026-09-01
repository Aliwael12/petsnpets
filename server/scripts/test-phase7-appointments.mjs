import 'dotenv/config';
import postgres from 'postgres';

const BASE = 'http://localhost:3001/v1';
const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres');

let pass = 0;
let fail = 0;
function check(name, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  ok  - ${name}`);
  } else {
    fail++;
    console.error(`FAIL  - ${name}`, extra ?? '');
  }
}

async function loginAs(name, pin = '1234') {
  const [emp] = await sql`select id from employees where name = ${name}`;
  const res = await fetch(`${BASE}/sessions/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId: emp.id, pin, deviceId: 'phase7-test' }),
  });
  const body = await res.json();
  return { token: body.token, id: emp.id };
}

async function req(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

/** A Cairo-local hour on a day N days out, as a UTC ISO instant. Cairo is UTC+2/+3, so
 * the offset is derived from the runtime rather than hardcoded.
 *
 * The day itself MUST be resolved via cairoDayKey (Cairo-calendar-date), not a UTC-date
 * offset — whenever UTC "now" is late enough that Cairo has already rolled to the next
 * calendar day (roughly 21:00-24:00 UTC), a UTC-date-based "+N days" lands on a different
 * day than the Cairo-date-based one, and the slot this computes silently doesn't belong to
 * the day availability is queried for. Reusing cairoDayKey keeps both in lockstep. */
function cairoSlot(daysAhead, hour, minute = 0) {
  const [y, m, d] = cairoDayKey(daysAhead).split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(guess);
  const gh = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const gm = Number(parts.find((p) => p.type === 'minute').value);
  const drift = (gh - hour) * 60 + (gm - minute);
  return new Date(guess.getTime() - drift * 60_000).toISOString();
}

function cairoDayKey(daysAhead) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
}

const booking = (over = {}) => ({
  ownerName: 'Phase Seven',
  phone: '+20 100 000 9999',
  petName: 'Testpet',
  species: 'cat',
  requestedAt: cairoSlot(5, 12),
  ...over,
});

async function main() {
  console.log('== Phase 7: Public website + appointments ==');

  const doctor = await loginAs('Dr. Amira Fathy');
  const nurse = await loginAs('Nour El-Sayed');
  const cashier = await loginAs('Mostafa Hassan');

  // --- Public endpoints need no session ------------------------------------
  {
    const res = await req('GET', '/public/services', null);
    check('GET /public/services is public and returns only active services', res.status === 200 && res.body.length > 0, res.body);
    check(
      'public service payload exposes no stock or cost fields',
      res.body.every((s) => !('stockQuantity' in s) && !('sku' in s) && !('lowStockThreshold' in s)),
      res.body?.[0],
    );
  }
  {
    const res = await req('GET', '/public/opening-hours', null);
    check('GET /public/opening-hours is public', res.status === 200 && res.body.timezone === 'Africa/Cairo', res.body);
    check('Friday opens later than the rest of the week', res.body.hoursByWeekday['5'][0] > res.body.hoursByWeekday['1'][0], res.body.hoursByWeekday);
  }
  {
    const res = await req('GET', `/public/availability?date=${cairoDayKey(5)}`, null);
    check('GET /public/availability returns half-hour slots for the day', res.status === 200 && res.body.slots.length === 24, res.body?.slots?.length);
    const first = res.body.slots[0];
    check('the first slot of the day is 10:00 Cairo time', new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(first.at)) === '10:00', first);
  }

  // --- Booking --------------------------------------------------------------
  let bookedId;
  {
    const slot = cairoSlot(5, 12);
    const res = await req('POST', '/public/appointments', null, booking({ requestedAt: slot }));
    check('an anonymous visitor can book an appointment', res.status === 201, res.body);
    check('a new booking always starts as pending', res.body?.status === 'pending', res.body);
    bookedId = res.body?.id;

    const avail = await req('GET', `/public/availability?date=${cairoDayKey(5)}`, null);
    const slotRow = avail.body.slots.find((s) => s.at === slot);
    check('the booked slot immediately reads as unavailable', slotRow?.available === false, slotRow);
  }
  {
    const res = await req('POST', '/public/appointments', null, booking({ requestedAt: cairoSlot(5, 12), petName: 'Doubler' }));
    check('double-booking the same slot is rejected with SLOT_UNAVAILABLE', res.status === 409 && res.body.error?.code === 'SLOT_UNAVAILABLE', res.body);
  }
  {
    const res = await req('POST', '/public/appointments', null, booking({ requestedAt: cairoSlot(5, 3) }));
    check('booking at 3am (clinic closed) is rejected', res.status === 400 && res.body.error?.details?.reason === 'OUTSIDE_HOURS', res.body);
  }
  {
    // 30 minutes from now is inside opening hours but under the 2h lead time.
    const soon = new Date(Date.now() + 30 * 60_000).toISOString();
    const res = await req('POST', '/public/appointments', null, booking({ requestedAt: soon }));
    check('booking under the minimum lead time is rejected', res.status === 400, res.body);
  }
  {
    const res = await req('POST', '/public/appointments', null, {
      ...booking({ requestedAt: cairoSlot(6, 14), petName: 'Injected' }),
      status: 'confirmed',
      handledBy: '00000000-0000-0000-0000-000000000000',
      clientId: '00000000-0000-0000-0000-000000000000',
    });
    check('a client-supplied status/handledBy/clientId is ignored, not honoured', res.status === 201 && res.body.status === 'pending', res.body);
    const [row] = await sql`select handled_by, client_id from appointments where pet_name = 'Injected'`;
    check('...and nothing was written to handled_by / client_id', row.handled_by === null && row.client_id === null, row);
  }

  // --- Staff surface --------------------------------------------------------
  {
    const res = await req('GET', '/appointments', null);
    check('listing appointments without a session is 401', res.status === 401, res.body);
  }
  {
    const res = await req('GET', '/appointments', cashier.token);
    check('a cashier cannot read appointments (contact details are clinical)', res.status === 403, res.body);
  }
  {
    const res = await req('GET', '/appointments', nurse.token);
    check('a nurse can list appointments', res.status === 200 && res.body.length > 0, res.body?.length);
    const mine = res.body.find((a) => a.id === bookedId);
    check('the staff view includes the phone number the visitor left', !!mine?.phone, mine);
  }
  {
    const res = await req('PATCH', `/appointments/${bookedId}/status`, cashier.token, { status: 'confirmed' });
    check('a cashier cannot confirm an appointment', res.status === 403, res.body);
  }
  {
    const res = await req('PATCH', `/appointments/${bookedId}/status`, doctor.token, { status: 'confirmed' });
    check('a doctor can confirm a pending request', res.status === 200 && res.body.status === 'confirmed', res.body);
    check('confirming records who handled it', res.body.handledBy === doctor.id, res.body?.handledBy);
  }
  {
    const slot = cairoSlot(5, 12);
    const res = await req('PATCH', `/appointments/${bookedId}/status`, doctor.token, { status: 'cancelled' });
    check('a confirmed appointment can be cancelled', res.status === 200 && res.body.status === 'cancelled', res.body);

    const avail = await req('GET', `/public/availability?date=${cairoDayKey(5)}`, null);
    const slotRow = avail.body.slots.find((s) => s.at === slot);
    check('cancelling frees the slot again on the public site', slotRow?.available === true, slotRow);

    const rebook = await req('POST', '/public/appointments', null, booking({ requestedAt: slot, petName: 'Rebooked' }));
    check('...and the freed slot can genuinely be re-booked', rebook.status === 201, rebook.body);
  }

  // --- Rate limiting on the one unauthenticated write ------------------------
  // Runs last on purpose: every POST above already consumed budget, and the window is
  // short enough that a full verify:all run has moved well past it by the next pass.
  {
    let sawLimit = false;
    let attempts = 0;
    // Deliberately invalid (a past date) so these never create rows — the limiter runs
    // before validation, so they still count against the bucket.
    while (attempts < 20 && !sawLimit) {
      attempts++;
      const res = await req('POST', '/public/appointments', null, booking({ requestedAt: '2020-01-01T12:00:00.000Z' }));
      if (res.status === 429) {
        sawLimit = true;
        check('the public booking endpoint rate limits by IP', res.body.error?.code === 'TOO_MANY_REQUESTS', res.body);
      }
    }
    if (!sawLimit) check('the public booking endpoint rate limits by IP', false, `no 429 after ${attempts} attempts`);

    const stillOk = await req('GET', '/public/services', null);
    check('rate limiting the booking POST does not block the read-only public routes', stillOk.status === 200, stillOk.status);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
