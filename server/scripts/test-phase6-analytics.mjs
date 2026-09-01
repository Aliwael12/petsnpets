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
    body: JSON.stringify({ employeeId: emp.id, pin, deviceId: 'phase6-test' }),
  });
  const body = await res.json();
  return { token: body.token, id: emp.id };
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log('== Phase 6: Analytics + Employees ==');

  const doctor = await loginAs('Dr. Amira Fathy');
  const cashier = await loginAs('Mostafa Hassan');

  // --- Employees ------------------------------------------------------------
  {
    const res = await get('/employees/active', null);
    check('GET /employees/active is public (no auth) and returns 6 active employees', res.status === 200 && res.body.length === 6, res.body);
    check('active employee list never includes a pinHash field', res.body.every((e) => !('pinHash' in e)), res.body);
  }
  {
    const res = await get('/employees', cashier.token);
    check('cashier listing full roster is 403', res.status === 403, res.body);
  }
  {
    const res = await get('/employees', doctor.token);
    check('doctor listing full roster returns all 7 (incl. inactive)', res.status === 200 && res.body.length === 7, res.body?.length);
  }
  {
    // doctor cannot delete themself
    const res = await fetch(`${BASE}/employees/${doctor.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${doctor.token}` } });
    const body = await res.json().catch(() => ({}));
    check('doctor cannot remove their own account', res.status === 400, body);
  }
  {
    // deleting an employee WITH activity history should fail cleanly, not 500
    const [busy] = await sql`select id from employees where name = 'Nour El-Sayed'`;
    const res = await fetch(`${BASE}/employees/${busy.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${doctor.token}` } });
    const body = await res.json().catch(() => ({}));
    check('removing an employee with activity history is a clean 400, not a 500', res.status === 400, { status: res.status, body });
  }

  // --- Employees: per-employee feature toggles --------------------------------
  {
    const res = await get('/employees', doctor.token);
    const cashierRow = res.body.find((e) => e.id === cashier.id);
    check(
      'a cashier defaults to the cashier feature set (no clients/analytics/etc.)',
      Array.isArray(cashierRow?.enabledFeatures) && cashierRow.enabledFeatures.includes('/pos') && !cashierRow.enabledFeatures.includes('/analytics'),
      cashierRow,
    );
  }
  {
    const [nurseEmp] = await sql`select id from employees where name = 'Nour El-Sayed'`;
    const patch = (token, id, enabledFeatures) =>
      fetch(`${BASE}/employees/${id}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabledFeatures }),
      });

    const forbidden = await patch(cashier.token, nurseEmp.id, ['/clients']);
    check('cashier updating another employee\'s features is 403', forbidden.status === 403, await forbidden.json());

    const ok = await patch(doctor.token, nurseEmp.id, ['/pos']);
    const okBody = await ok.json();
    check(
      'doctor can shrink an employee\'s feature set to a single tab',
      ok.status === 200 && JSON.stringify(okBody.enabledFeatures) === JSON.stringify(['/pos']),
      okBody,
    );

    const roster = await get('/employees', doctor.token);
    const nurseRow = roster.body.find((e) => e.id === nurseEmp.id);
    check('the shrunk feature set round-trips through a fresh GET /employees', JSON.stringify(nurseRow?.enabledFeatures) === JSON.stringify(['/pos']), nurseRow);

    // restore, so later phase re-runs (and a human clicking around afterwards) aren't stuck
    await patch(doctor.token, nurseEmp.id, ['/products', '/pos', '/transactions', '/clients', '/pet-logs', '/calendar', '/price-checker']);
  }

  // --- Analytics: revenue timeseries -----------------------------------------
  {
    const res = await get('/analytics/revenue-timeseries?days=30', doctor.token);
    check('revenue-timeseries returns exactly 30 days', res.status === 200 && res.body.length === 30, res.body?.length);
    const [{ sum }] = await sql`select coalesce(sum(total),0)::int as sum from transactions where created_at >= now() - interval '30 days'`;
    const apiSum = res.body.reduce((s, d) => s + d.total, 0);
    check('timeseries sum matches a direct DB sum for the same window', apiSum === sum, { apiSum, dbSum: sum });
  }
  {
    const res = await get('/analytics/revenue-timeseries?days=30', cashier.token);
    check('cashier hitting analytics is 403', res.status === 403, res.body);
  }

  // --- Analytics: best sellers / by employee / by category -------------------
  {
    const res = await get('/analytics/best-sellers', doctor.token);
    check('best-sellers returns at most 8, sorted descending', res.status === 200 && res.body.length <= 8, res.body?.length);
    const sorted = [...res.body].sort((a, b) => b.revenue - a.revenue);
    check('best-sellers is actually sorted by revenue desc', JSON.stringify(sorted) === JSON.stringify(res.body), res.body);
  }
  {
    const res = await get('/analytics/revenue-by-employee', doctor.token);
    check('revenue-by-employee returns rows', res.status === 200 && res.body.length > 0, res.body);
  }
  {
    const res = await get('/analytics/revenue-by-category', doctor.token);
    const categories = res.body.map((r) => r.category);
    check('revenue-by-category includes "service"', categories.includes('service'), categories);
  }

  // --- Analytics: clinic vs shop split -----------------------------------------
  {
    const serviceRes = await get('/analytics/revenue-split?kind=service', doctor.token);
    const shopRes = await get('/analytics/revenue-split?kind=shop', doctor.token);
    // Both splits sum gross line revenue (quantity * unit_price), matching how best-sellers
    // and revenue-by-category already work — deliberately not discount-netted. So the
    // correct cross-check is against sum(subtotal), not sum(total) (which nets discounts).
    const [{ subtotal: grandSubtotal }] = await sql`select coalesce(sum(subtotal),0)::int as subtotal from transactions`;
    const combined = serviceRes.body.total + shopRes.body.total;
    check('service + shop split sums to gross subtotal exactly', combined === grandSubtotal, {
      service: serviceRes.body.total,
      shop: shopRes.body.total,
      combined,
      grandSubtotal,
    });
  }

  // --- Analytics: employee summary + activity feed ----------------------------
  {
    const res = await get(`/analytics/employee-summary?employeeId=${doctor.id}`, doctor.token);
    check('employee-summary succeeds for current month', res.status === 200, res.body);
    check('employee-summary has the expected stat shape', typeof res.body.stats?.sales?.count === 'number', res.body.stats);
    check('employee-summary activity entries have the ActivityEntry shape', res.body.activity.every((a) => a.id && a.type && a.title && a.at), res.body.activity?.[0]);
  }
  {
    // sanity: create a fresh sale as the doctor this month, confirm it shows up in the feed
    const [product] = await sql`select id from products where kind = 'good' and stock_quantity > 5 limit 1`;
    const [client] = await sql`select id, name from clients limit 1`;
    await fetch(`${BASE}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctor.token}`, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ clientId: client.id, items: [{ productId: product.id, quantity: 1 }] }),
    });
    const res = await get(`/analytics/employee-summary?employeeId=${doctor.id}`, doctor.token);
    const hasNewSale = res.body.activity.some((a) => a.type === 'sale' && a.title.includes(client.name));
    check('a sale made just now appears in this month\'s activity feed', hasNewSale, res.body.activity.slice(0, 3));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
