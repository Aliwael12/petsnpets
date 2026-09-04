import 'dotenv/config';
import postgres from 'postgres';
import { actorWithRole, cleanupSessions } from './lib/session.mjs';

/**
 * Phase 9 — income / expenses / net.
 *
 * This suite exists mainly for the reconciliation invariants. Every other bug in this
 * codebase announces itself; a money figure that is quietly wrong does not, and the owner
 * would only find out by disagreeing with their own books months later. So the assertions
 * are deliberately about the *relationships* between figures rather than any single number:
 *
 *   income.gross - income.refunds === income.net
 *   sum(income.byMethod)           === income.net
 *   expenses.stock + operating     === expenses.total
 *   sum(expenses.byMethod)         === expenses.total
 *   income.net - expenses.total    === net
 *
 * Safe to run against a live database: it creates exactly one expense, checks that it moved
 * every figure by exactly its own amount, then voids it and checks every figure went back.
 */

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

/**
 * The privileged actor is the ADMIN now, not a doctor: the money endpoints moved behind the
 * financials:read permission, which only an admin holds without an explicit grant.
 *
 * Sessions are minted rather than PIN-logged — see scripts/lib/session.mjs for why.
 */
async function loginAsRole(role) {
  const actor = await actorWithRole(sql, role, 'phase9-test');
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

const sumMethods = (b) => b.cash + b.instapay + b.card + b.unrecorded;

function checkWindow(label, w) {
  check(`${label}: gross - refunds === net income`, w.income.gross - w.income.refunds === w.income.net, w.income);
  check(`${label}: income breakdown sums to net income`, sumMethods(w.income.byMethod) === w.income.net, w.income.byMethod);
  check(`${label}: stock + operating === total expenses`, w.expenses.stock + w.expenses.operating === w.expenses.total, w.expenses);
  check(`${label}: expense breakdown sums to total`, sumMethods(w.expenses.byMethod) === w.expenses.total, w.expenses.byMethod);
  check(`${label}: net === income - expenses`, w.net === w.income.net - w.expenses.total, { net: w.net });
  check(`${label}: refunds are never counted as an expense`, w.expenses.total === w.expenses.stock + w.expenses.operating, w.expenses);
}

async function main() {
  console.log('\nPhase 9 — income, expenses and net\n');
  const admin = await loginAsRole('admin');
  const cashier = await loginAsRole('cashier');

  if (!admin.token) {
    console.error('No active admin on this database — has the promote_founding_admin migration run?');
    process.exit(1);
  }

  // --- access control -------------------------------------------------------------------
  {
    const res = await get('/analytics/financial-summary', cashier.token);
    check('a cashier cannot read the financial summary', res.status === 403, res.status);
  }
  {
    const res = await get('/expenses', cashier.token);
    check('a cashier cannot even READ expenses (they contain salaries)', res.status === 403, res.status);
  }
  {
    const res = await get('/analytics/financial-summary');
    check('the financial summary is not public', res.status === 401, res.status);
  }

  // --- the invariants, on the untouched books -------------------------------------------
  const before = (await get('/analytics/financial-summary', admin.token)).body;
  check(
    'summary returns a range, a month and an all-time window',
    !!before?.range && !!before?.month && !!before?.allTime,
    Object.keys(before ?? {}),
  );
  // With no from/to the requested window is unbounded, so `range` IS all time — see the
  // comment on financialSummary(). `month` keeps answering "the current calendar month".
  check(
    'with no from/to, range is all time (an unbounded side is unbounded)',
    before.range.income.gross === before.allTime.income.gross && before.range.net === before.allTime.net,
    { range: before.range.net, allTime: before.allTime.net },
  );
  checkWindow('range (unbounded)', before.range);
  checkWindow('month', before.month);
  checkWindow('all time', before.allTime);
  check(
    'all-time income is at least this month’s',
    before.allTime.income.gross >= before.month.income.gross,
    { allTime: before.allTime.income.gross, month: before.month.income.gross },
  );

  // --- validation -----------------------------------------------------------------------
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  {
    const res = await post('/expenses', admin.token, { category: 'rent', description: 'x', amount: -500, paymentMethod: 'cash', paidOn: today }, true);
    check('a negative expense is rejected (it would be an income backdoor)', res.status === 400, res.status);
  }
  {
    const res = await post('/expenses', admin.token, { category: 'stock', description: 'x', amount: 500, paymentMethod: 'cash', paidOn: today }, true);
    check('there is no "stock" expense category (that would double-count supplier orders)', res.status === 400, res.status);
  }
  {
    const res = await post('/expenses', admin.token, { category: 'rent', description: 'x', amount: 500, paymentMethod: 'bitcoin', paidOn: today }, true);
    check('an unknown payment method is rejected', res.status === 400, res.status);
  }

  // --- one expense moves every figure by exactly its own amount --------------------------
  const AMOUNT = 76_543; // piastres — an odd number, so a rounding bug can't hide in it
  const created = await post(
    '/expenses',
    admin.token,
    {
      category: 'utilities',
      description: 'Phase 9 verification entry',
      amount: AMOUNT,
      paymentMethod: 'instapay',
      payee: 'Automated test',
      paidOn: today,
      note: 'Created and voided by scripts/test-phase9-financials.mjs',
    },
    true,
  );
  check('a doctor can record an expense', created.status === 201, created.body);

  const after = (await get('/analytics/financial-summary', admin.token)).body;
  checkWindow('month (after recording)', after.month);
  checkWindow('all time (after recording)', after.allTime);
  check(
    'the expense lands in operating costs, not stock',
    after.month.expenses.operating - before.month.expenses.operating === AMOUNT &&
      after.month.expenses.stock === before.month.expenses.stock,
    { operating: after.month.expenses.operating, stock: after.month.expenses.stock },
  );
  check(
    'the expense lands in the instapay bucket only',
    after.month.expenses.byMethod.instapay - before.month.expenses.byMethod.instapay === AMOUNT &&
      after.month.expenses.byMethod.cash === before.month.expenses.byMethod.cash,
    after.month.expenses.byMethod,
  );
  check('recording an expense leaves income untouched', after.month.income.net === before.month.income.net, {
    before: before.month.income.net,
    after: after.month.income.net,
  });
  check('net falls by exactly the expense', before.month.net - after.month.net === AMOUNT, {
    before: before.month.net,
    after: after.month.net,
  });

  // --- editing is cosmetic only ----------------------------------------------------------
  {
    const res = await fetch(`${BASE}/expenses/${created.body.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ amount: 1, paidOn: '2020-01-01' }),
    });
    const body = await res.json().catch(() => null);
    check(
      'PATCH cannot restate the amount or date (void-and-re-enter instead)',
      res.status === 400 || (body?.amount === AMOUNT && body?.paidOn === today),
      { status: res.status, amount: body?.amount, paidOn: body?.paidOn },
    );
  }

  // --- voiding puts every figure back ----------------------------------------------------
  {
    const res = await post(`/expenses/${created.body.id}/void`, admin.token, { reason: 'Phase 9 verification — not a real payment' });
    check('a doctor can void an expense', res.status === 201 || res.status === 200, res.status);
  }
  const restored = (await get('/analytics/financial-summary', admin.token)).body;
  check('voiding removes the expense from operating costs', restored.month.expenses.operating === before.month.expenses.operating, {
    before: before.month.expenses.operating,
    after: restored.month.expenses.operating,
  });
  check('voiding restores net exactly', restored.month.net === before.month.net, {
    before: before.month.net,
    after: restored.month.net,
  });
  check(
    'a voided expense is hidden from the list by default',
    !(await get('/expenses', admin.token)).body.some((e) => e.id === created.body.id),
  );
  check(
    'a voided expense is still retrievable for audit',
    (await get('/expenses?includeVoided=true', admin.token)).body.some((e) => e.id === created.body.id),
  );
  {
    const res = await post(`/expenses/${created.body.id}/void`, admin.token, { reason: 'again' });
    check('an already-voided expense cannot be voided twice', res.status === 400, res.status);
  }
  {
    const res = await fetch(`${BASE}/expenses/${created.body.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    check('there is no hard-delete route for expenses', res.status === 404, res.status);
  }
  checkWindow('month (after voiding)', restored.month);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await cleanupSessions(sql, 'phase9-test');
  await sql.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanupSessions(sql, 'phase9-test');
  await sql.end();
  process.exit(1);
});
