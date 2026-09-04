import 'dotenv/config';
import postgres from 'postgres';
import { actorWithRole, cleanupSessions } from './lib/session.mjs';

/**
 * Phase 10 — the custom date range.
 *
 * The assertion that matters here is ADJACENCY: for two windows A and B that touch but do
 * not overlap, every figure in A plus every figure in B must equal the same figure over
 * A ∪ B. An off-by-one at the seam — an inclusive bound written exclusive, or a timezone
 * conversion applied on one side only — shows up as a gap (the sum comes up short) or a
 * double count (it comes up long). Nothing else catches either, and neither announces
 * itself: the owner finds out months later by disagreeing with their own books.
 *
 * Safe to run against a live database: it creates at most two expenses, checks that each
 * moved exactly the figures it should have, and voids them again.
 */

const BASE = 'http://localhost:3001/v1';
const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres');

let pass = 0;
let fail = 0;
let skipped = 0;
function check(name, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  ok  - ${name}`);
  } else {
    fail++;
    console.error(`FAIL  - ${name}`, extra === undefined ? '' : JSON.stringify(extra));
  }
}

/**
 * The privileged actor is the ADMIN now, not a doctor: the money endpoints moved behind the
 * financials:read permission, which only an admin holds without an explicit grant.
 *
 * Sessions are minted rather than PIN-logged — see scripts/lib/session.mjs for why.
 */
async function loginAsRole(role) {
  const actor = await actorWithRole(sql, role, 'phase10-test');
  return actor ?? { token: null, id: null };
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(path, token, body, idempotent = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotent) headers['Idempotency-Key'] = crypto.randomUUID();
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const BUCKETS = ['cash', 'instapay', 'card', 'unrecorded'];
const sumMethods = (b) => BUCKETS.reduce((sum, k) => sum + b[k], 0);

/** Every scalar a window reports. Adding a field here is how this stays honest. */
const SCALARS = (w) => [
  w.income.gross,
  w.income.refunds,
  w.income.net,
  w.expenses.stock,
  w.expenses.operating,
  w.expenses.total,
  w.net,
  ...BUCKETS.map((b) => w.income.byMethod[b]),
  ...BUCKETS.map((b) => w.expenses.byMethod[b]),
];

function checkWindow(label, w) {
  check(`${label}: gross - refunds === net income`, w.income.gross - w.income.refunds === w.income.net, w.income);
  check(`${label}: income breakdown sums to net income`, sumMethods(w.income.byMethod) === w.income.net, w.income.byMethod);
  check(`${label}: stock + operating === total expenses`, w.expenses.stock + w.expenses.operating === w.expenses.total, w.expenses);
  check(`${label}: expense breakdown sums to total`, sumMethods(w.expenses.byMethod) === w.expenses.total, w.expenses.byMethod);
  check(`${label}: net === income - expenses`, w.net === w.income.net - w.expenses.total, { net: w.net });
}

async function main() {
  console.log('\nPhase 10 — custom date ranges\n');
  const admin = await loginAsRole('admin');
  const cashier = await loginAsRole('cashier');
  if (!admin.token) {
    console.error('No active admin on this database — has the promote_founding_admin migration run?');
    process.exit(1);
  }

  const F = async (from, to) => {
    const res = await get(`/analytics/financial-summary?from=${from}&to=${to}`, admin.token);
    if (res.status !== 200 || !res.body?.range) {
      throw new Error(`financial-summary ${from}..${to} -> ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.range;
  };

  /** Sequential in small batches: 30+ concurrent multi-CTE summaries saturate the pool and
   *  one of them comes back an error, which reads as a failed assertion rather than as the
   *  load problem it is. */
  const mapLimit = async (items, size, fn) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    }
    return out;
  };

  const [{ y: cairoYear, m: cairoMonth, today }] = await sql`
    select extract(year from t)::int as y, extract(month from t)::int as m, t::date::text as today
    from (select now() at time zone 'Africa/Cairo' as t) s`;

  // --- 1. the adjacency invariant -------------------------------------------------------
  async function assertAdjacent(label, aFrom, aTo, bFrom, bTo) {
    // bFrom is the calendar day immediately after aTo — that seam is the thing under test.
    const [A, B, AB] = await Promise.all([F(aFrom, aTo), F(bFrom, bTo), F(aFrom, bTo)]);
    const a = SCALARS(A);
    const b = SCALARS(B);
    const ab = SCALARS(AB);
    check(
      `${label}: A + B === A∪B, field for field`,
      a.every((v, i) => v + b[i] === ab[i]),
      a.map((v, i) => ({ i, a: v, b: b[i], sum: v + b[i], ab: ab[i] })).filter((r) => r.sum !== r.ab),
    );
    checkWindow(`${label}: A∪B`, AB);
  }

  await assertAdjacent('mid-month split', '2026-09-01', '2026-09-15', '2026-09-16', '2026-09-30');
  await assertAdjacent('month seam', '2026-08-01', '2026-08-31', '2026-09-01', '2026-09-30');
  await assertAdjacent('year seam', '2025-12-01', '2025-12-31', '2026-01-01', '2026-01-31');
  // Egypt's DST transitions happen AT local midnight — the exact instant every day bound is
  // built from. These pin the claim that the seam still partitions across them.
  await assertAdjacent('DST start (spring forward)', '2026-04-01', '2026-04-23', '2026-04-24', '2026-05-05');
  await assertAdjacent('DST end (fall back)', '2026-10-01', '2026-10-29', '2026-10-30', '2026-11-05');

  // --- 2. a full partition into single days ---------------------------------------------
  {
    const daysInMonth = new Date(Date.UTC(cairoYear, cairoMonth, 0)).getUTCDate();
    const mm = String(cairoMonth).padStart(2, '0');
    const days = Array.from({ length: daysInMonth }, (_, i) => `${cairoYear}-${mm}-${String(i + 1).padStart(2, '0')}`);
    const each = await mapLimit(days, 4, (d) => F(d, d));
    const whole = SCALARS(await F(`${cairoYear}-${mm}-01`, `${cairoYear}-${mm}-${String(daysInMonth).padStart(2, '0')}`));
    const summed = each.map(SCALARS).reduce((acc, row) => acc.map((v, i) => v + row[i]));
    check(
      `${daysInMonth} single-day windows sum to the whole month, field for field`,
      summed.every((v, i) => v === whole[i]),
      summed.map((v, i) => ({ i, summed: v, whole: whole[i] })).filter((r) => r.summed !== r.whole),
    );
  }

  // --- 3. the new path reproduces the old one -------------------------------------------
  {
    const mm = String(cairoMonth).padStart(2, '0');
    const last = new Date(Date.UTC(cairoYear, cairoMonth, 0)).getUTCDate();
    const viaRange = SCALARS(await F(`${cairoYear}-${mm}-01`, `${cairoYear}-${mm}-${last}`));
    const viaMonth = SCALARS((await get(`/analytics/financial-summary?year=${cairoYear}&month=${cairoMonth}`, admin.token)).body.month);
    check('from/to over a whole month === the year/month window, field for field', viaRange.every((v, i) => v === viaMonth[i]));

    const dflt = (await get('/analytics/financial-summary', admin.token)).body;
    // An unbounded range is all time — the one rule, with no month-shaped exception. This
    // is what makes the UI's Clear button mean what its label says.
    check('with no params, range === allTime field for field', SCALARS(dflt.range).every((v, i) => v === SCALARS(dflt.allTime)[i]));
    check(
      'an explicitly unbounded window is the same as no params at all',
      SCALARS((await get('/analytics/financial-summary?year=2026&month=1', admin.token)).body.range).every(
        (v, i) => v === SCALARS(dflt.range)[i],
      ),
    );
    check('with no params, month is the current Cairo month', dflt.month.year === cairoYear && dflt.month.month === cairoMonth, {
      got: [dflt.month.year, dflt.month.month],
      want: [cairoYear, cairoMonth],
    });
    check('all-time is never range-filtered', dflt.allTime.income.gross >= dflt.range.income.gross);
    checkWindow('all time', dflt.allTime);
  }

  // --- 4. boundaries and validation -----------------------------------------------------
  check(
    'from > to is a 400, NOT a window of zeros',
    (await get('/analytics/financial-summary?from=2026-09-30&to=2026-09-01', admin.token)).status === 400,
  );
  check('an impossible date is a 400', (await get('/analytics/financial-summary?from=2026-02-30', admin.token)).status === 400);
  check(
    'the ranged summary is still doctor-only',
    (await get('/analytics/financial-summary?from=2026-09-01&to=2026-09-30', cashier.token)).status === 403,
  );
  check(
    'an inverted range is rejected on the other ranged endpoints too',
    (await get('/analytics/best-sellers?from=2026-09-30&to=2026-09-01', admin.token)).status === 400,
  );

  // --- 5. a real row at a real seam -----------------------------------------------------
  const AMOUNT = 76_543; // odd, so a rounding bug cannot hide in it
  const SEAM = `${cairoYear}-${String(cairoMonth).padStart(2, '0')}-15`;
  const mm = String(cairoMonth).padStart(2, '0');
  const lastDay = String(new Date(Date.UTC(cairoYear, cairoMonth, 0)).getUTCDate()).padStart(2, '0');
  const A = [`${cairoYear}-${mm}-01`, SEAM];
  const B = [`${cairoYear}-${mm}-16`, `${cairoYear}-${mm}-${lastDay}`];

  const beforeA = await F(...A);
  const beforeB = await F(...B);
  const created = await post(
    '/expenses',
    admin.token,
    {
      category: 'utilities',
      description: 'Phase 10 seam check',
      amount: AMOUNT,
      paymentMethod: 'instapay',
      paidOn: SEAM,
      note: 'Created and voided by scripts/test-phase10-ranges.mjs',
    },
    true,
  );
  check('a doctor can record an expense on the seam day', created.status === 201, created.body);

  const afterA = await F(...A);
  const afterB = await F(...B);
  check(
    'an expense dated the LAST day of window A counts fully in A ("to = the 15th" means all of the 15th)',
    afterA.expenses.operating - beforeA.expenses.operating === AMOUNT,
    { before: beforeA.expenses.operating, after: afterA.expenses.operating },
  );
  check('…and not at all in the adjacent window B', SCALARS(afterB).every((v, i) => v === SCALARS(beforeB)[i]));
  check(
    'it lands in the instapay bucket only',
    afterA.expenses.byMethod.instapay - beforeA.expenses.byMethod.instapay === AMOUNT &&
      afterA.expenses.byMethod.cash === beforeA.expenses.byMethod.cash,
    afterA.expenses.byMethod,
  );
  check('net falls by exactly the expense', beforeA.net - afterA.net === AMOUNT);
  await post(`/expenses/${created.body.id}/void`, admin.token, { reason: 'Phase 10 verification — not a real payment' });
  check('voiding restores every figure in A exactly', SCALARS(await F(...A)).every((v, i) => v === SCALARS(beforeA)[i]));

  // --- 6. the backdated expense — the whole point of expenses.paid_on -------------------
  {
    const key = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 40);
    const paidOn = key(past);
    const recent = new Date();
    recent.setUTCDate(recent.getUTCDate() - 6);
    const recentKey = key(recent);
    const AMOUNT_OLD = 4321;

    const nearBefore = await F(recentKey, today);
    const wideBefore = await F(paidOn, today);
    const old = await post(
      '/expenses',
      admin.token,
      { category: 'rent', description: 'Phase 10 backdated check', amount: AMOUNT_OLD, paymentMethod: 'cash', paidOn },
      true,
    );
    check('a doctor can backdate an expense 40 days', old.status === 201, old.body);

    const nearAfter = await F(recentKey, today);
    const wideAfter = await F(paidOn, today);
    check(
      'a backdated expense does NOT appear in a last-7-days window',
      nearAfter.expenses.operating === nearBefore.expenses.operating,
      { before: nearBefore.expenses.operating, after: nearAfter.expenses.operating },
    );
    check(
      'it DOES appear, in full, in a window covering the day it was paid',
      wideAfter.expenses.operating - wideBefore.expenses.operating === AMOUNT_OLD,
      { before: wideBefore.expenses.operating, after: wideAfter.expenses.operating },
    );
    check(
      'it is bucketed by paid_on, not by the day it was typed',
      wideAfter.expenses.byMethod.cash - wideBefore.expenses.byMethod.cash === AMOUNT_OLD,
    );
    await post(`/expenses/${old.body.id}/void`, admin.token, { reason: 'Phase 10 verification — not a real payment' });
    check(
      'voiding the backdated expense restores the wide window exactly',
      SCALARS(await F(paidOn, today)).every((v, i) => v === SCALARS(wideBefore)[i]),
    );
  }

  // --- 7. same-day window ---------------------------------------------------------------
  {
    const sameDay = await F(today, today);
    checkWindow('same day', sameDay);
    // A single day is the degenerate range; it must still partition against its neighbour.
    const yest = new Date();
    yest.setUTCDate(yest.getUTCDate() - 1);
    const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(yest);
    const both = SCALARS(await F(yesterday, today));
    const y = SCALARS(await F(yesterday, yesterday));
    const t = SCALARS(sameDay);
    check('yesterday + today === the two-day window, field for field', y.every((v, i) => v + t[i] === both[i]), {
      mismatches: y.map((v, i) => ({ i, sum: v + t[i], both: both[i] })).filter((r) => r.sum !== r.both),
    });
  }

  // --- 8. cross-surface reconciliation --------------------------------------------------
  {
    const from = `${cairoYear}-${mm}-01`;
    const to = `${cairoYear}-${mm}-${lastDay}`;
    const w = await F(from, to);
    const [sales, refs, exps, ords] = await Promise.all([
      get(`/sales?from=${from}&to=${to}`, admin.token),
      get(`/refunds?from=${from}&to=${to}`, admin.token),
      get(`/expenses?from=${from}&to=${to}`, admin.token),
      get(`/purchasing/supplier-orders?from=${from}&to=${to}`, admin.token),
    ]);
    check('summary.income.gross === Σ of the sales list for the same dates', sales.body.reduce((s, t) => s + t.total, 0) === w.income.gross, {
      list: sales.body.reduce((s, t) => s + t.total, 0),
      summary: w.income.gross,
    });
    check('summary.income.refunds === Σ of the refunds list', refs.body.reduce((s, r) => s + r.total, 0) === w.income.refunds, {
      list: refs.body.reduce((s, r) => s + r.total, 0),
      summary: w.income.refunds,
    });
    check('summary.expenses.operating === Σ of the expenses list', exps.body.reduce((s, e) => s + e.amount, 0) === w.expenses.operating, {
      list: exps.body.reduce((s, e) => s + e.amount, 0),
      summary: w.expenses.operating,
    });
    check('summary.expenses.stock === Σ of the supplier-orders list', ords.body.reduce((s, o) => s + o.costTotal, 0) === w.expenses.stock, {
      list: ords.body.reduce((s, o) => s + o.costTotal, 0),
      summary: w.expenses.stock,
    });
    check('no voided expense reaches the list, and so cannot reach a total', exps.body.every((e) => e.voidedAt == null));
  }

  // --- 8b. the inclusive upper bound, on a day that can actually tell the difference ----
  {
    // The bug this guards: `lte(receivedAt, new Date('2026-08-31'))` resolves to 03:00
    // Cairo and silently drops the rest of that day. It only shows up on a `to` day that
    // HAS a row after 03:00, so the window is chosen from the data rather than hardcoded.
    const [row] = await sql`
      select (received_at at time zone 'Africa/Cairo')::date::text as d
      from supplier_orders
      where (received_at at time zone 'Africa/Cairo')::time > '03:00'
      order by received_at desc limit 1`;
    if (!row) {
      console.log('  --  - (skipped: no supplier order recorded after 03:00 Cairo on any day)');
    } else {
      const w = await F(row.d, row.d);
      const ords = (await get(`/purchasing/supplier-orders?from=${row.d}&to=${row.d}`, admin.token)).body;
      check(
        `a shipment received after 03:00 on the LAST day of the window is included (${row.d})`,
        ords.length > 0 && ords.reduce((s, o) => s + o.costTotal, 0) === w.expenses.stock && w.expenses.stock > 0,
        { day: row.d, orders: ords.length, list: ords.reduce((s, o) => s + o.costTotal, 0), summary: w.expenses.stock },
      );
    }
  }

  // --- 8c. an UNRANGED timeseries covers everything the unranged cards counted ----------
  {
    const w = (await get('/analytics/financial-summary', admin.token)).body.range;
    const ts = (await get('/analytics/revenue-timeseries', admin.token)).body;
    check(
      'with no range at all, the chart spans the same money as the cards',
      ts.reduce((s, p) => s + p.total - p.refunds - p.stock - p.operating, 0) === w.net,
      { bars: ts.reduce((s, p) => s + p.total - p.refunds - p.stock - p.operating, 0), card: w.net },
    );
    check(
      'an unranged employee-summary is all time, not the current month',
      (await get(`/analytics/employee-summary?employeeId=${admin.id}`, admin.token)).body.from === null,
    );
  }

  // --- 9. the timeseries agrees with the cards ------------------------------------------
  {
    const from = `${cairoYear}-${mm}-01`;
    const to = `${cairoYear}-${mm}-${lastDay}`;
    const w = await F(from, to);
    const ts = (await get(`/analytics/revenue-timeseries?from=${from}&to=${to}`, admin.token)).body;
    check('a whole month buckets by day', ts.every((p) => p.date === p.endDate) && ts.length === Number(lastDay), ts.length);
    check('Σ(total − refunds) across the bars === income.net', ts.reduce((s, p) => s + p.total - p.refunds, 0) === w.income.net, {
      bars: ts.reduce((s, p) => s + p.total - p.refunds, 0),
      card: w.income.net,
    });
    check('Σ(stock + operating) across the bars === expenses.total', ts.reduce((s, p) => s + p.stock + p.operating, 0) === w.expenses.total, {
      bars: ts.reduce((s, p) => s + p.stock + p.operating, 0),
      card: w.expenses.total,
    });
    const wide = (await get('/analytics/revenue-timeseries?from=2020-01-01&to=2026-12-31', admin.token)).body;
    check('a 7-year window buckets to months, not 2,557 daily rows', wide.length < 100 && wide.some((p) => p.date !== p.endDate), wide.length);
    const mid = (await get('/analytics/revenue-timeseries?from=2026-01-01&to=2026-09-30', admin.token)).body;
    check('a 9-month window buckets to weeks', mid.length < 60 && mid.some((p) => p.date !== p.endDate), mid.length);
    // A range starting mid-week must not label its first bucket with a day before it.
    const partial = (await get('/analytics/revenue-timeseries?from=2026-01-15&to=2026-09-02', admin.token)).body;
    check('a partial leading bucket is labelled with the first day IN range', partial[0]?.date === '2026-01-15', partial[0]);
    check('…and every bucket stays inside the window', partial.every((p) => p.date >= '2026-01-15' && p.endDate <= '2026-09-02'));
  }

  // --- 10. the range actually narrows the other analytics queries -----------------------
  {
    // A window that ends before any transaction exists must be empty everywhere. Needs at
    // least one transaction to anchor "before everything" — on a clinic that hasn't rung up
    // a sale yet there is no such window, and every list is trivially empty anyway.
    const [{ lo }] = await sql`select min(created_at at time zone 'Africa/Cairo')::date::text as lo from transactions`;
    if (!lo) {
      console.log('  --  - the range narrows best-sellers/by-employee/by-category/split  (skipped: no sales on this database)');
      skipped += 1;
      await cleanupSessions(sql, 'phase10-test');
      await sql.end();
      console.log(`
${pass} passed, ${fail} failed, ${skipped} skipped (no data to prove them)
`);
      process.exit(fail === 0 ? 0 : 1);
    }
    const before = new Date(`${lo}T00:00:00Z`);
    before.setUTCDate(before.getUTCDate() - 40);
    const emptyFrom = before.toISOString().slice(0, 10);
    const emptyTo = new Date(new Date(`${lo}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
    const qs = `from=${emptyFrom}&to=${emptyTo}`;

    check('best-sellers honours the range', (await get(`/analytics/best-sellers?${qs}`, admin.token)).body.length === 0);
    check('revenue-by-employee honours the range', (await get(`/analytics/revenue-by-employee?${qs}`, admin.token)).body.length === 0);
    check('revenue-by-category honours the range', (await get(`/analytics/revenue-by-category?${qs}`, admin.token)).body.length === 0);
    check('revenue-split honours the range', (await get(`/analytics/revenue-split?kind=shop&${qs}`, admin.token)).body.total === 0);

    const all = (await get('/analytics/best-sellers', admin.token)).body;
    check('…and an unranged call still returns all time', all.length > 0, all.length);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await cleanupSessions(sql, 'phase10-test');
  await sql.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanupSessions(sql, 'phase10-test');
  await sql.end();
  process.exit(1);
});
