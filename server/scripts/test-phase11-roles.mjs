import 'dotenv/config';
import postgres from 'postgres';
import jwt from 'jsonwebtoken';

/**
 * Phase 11 — admin, doctor, and the permission grants.
 *
 * Access control is the one area where a passing manual click-through proves nothing: you
 * can only click what the UI drew for you, and the UI is not the thing being tested. Every
 * assertion here goes straight at the API with a real token, because that is the surface an
 * unhappy employee (or a stale browser tab) actually reaches.
 *
 * The shape of each check is deliberately "denied, then granted, then denied again", so a
 * gate that is permanently open and a gate that is permanently shut both fail — testing only
 * the denial would pass against an endpoint nobody can ever use.
 *
 * Safe to run against a live database: it creates one throwaway employee, flips grants on
 * that row only, and deletes it again.
 */

const BASE = 'http://localhost:3001/v1';
const env = process.env;
const sql = postgres(env.DIRECT_URL || env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

let pass = 0;
let fail = 0;
let skipped = 0;

/**
 * For assertions that can only be proven when the database actually holds the relevant
 * rows. Reporting these as skipped is the point: a clinic mid-setup has no sales, and an
 * assertion that silently passes on empty data is worse than no assertion at all — it reads
 * as coverage that isn't there.
 */
function checkOrSkip(name, precondition, ok, extra) {
  if (!precondition) {
    skipped++;
    console.log(`  --  - ${name}  (skipped: no data on this database to prove it)`);
    return;
  }
  check(name, ok, extra);
}
function check(name, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  ok  - ${name}`);
  } else {
    fail++;
    console.error(`FAIL  - ${name}`, extra === undefined ? '' : JSON.stringify(extra));
  }
}

/** Mints a session directly rather than going through PIN login — the PINs on a live
 *  database belong to real people and are not ours to know. */
async function tokenFor(employeeId) {
  const [session] = await sql`
    insert into operator_sessions (employee_id, device_id, expires_at)
    values (${employeeId}, 'phase11-test', now() + interval '1 hour') returning id`;
  return jwt.sign(
    { sub: employeeId, sessionId: session.id, deviceId: 'phase11-test' },
    env.OPERATOR_JWT_SECRET,
    { expiresIn: '1h' },
  );
}

async function req(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const get = (p, t) => req('GET', p, t);

async function setGrants(employeeId, permissions) {
  await sql`update employees set permissions = ${JSON.stringify(permissions)}::jsonb where id = ${employeeId}`;
}

async function main() {
  console.log('\nPhase 11 — admin, doctor and permission grants\n');

  const [admin] = await sql`select id, name from employees where role = 'admin' and active order by created_at limit 1`;
  if (!admin) {
    console.error('No admin on this database — has the promote_founding_admin migration run?');
    process.exit(1);
  }
  console.log(`  (admin: ${admin.name})\n`);

  // A throwaway doctor, so nothing here touches a real person's access.
  const [doc] = await sql`
    insert into employees (name, role, pin_hash, active, enabled_features, permissions)
    values ('Phase 11 Test Doctor', 'doctor', null, true,
            '["/products","/pos","/transactions","/analytics","/settings"]'::jsonb, '[]'::jsonb)
    returning id`;

  const adminToken = await tokenFor(admin.id);
  const docToken = await tokenFor(doc.id);

  // --- the admin reaches everything -----------------------------------------------------
  for (const path of [
    '/employees',
    '/analytics/financial-summary',
    '/analytics/revenue-by-employee',
    '/expenses',
    '/catalog/categories',
    '/purchasing/supplier-orders',
    '/clients',
    '/pets',
  ]) {
    const res = await get(path, adminToken);
    check(`admin can GET ${path}`, res.status === 200, res.status);
  }

  // Admin passes @Roles('doctor','nurse') handlers without being listed on them — the
  // property that makes "admin has access to everything" true by construction.
  check(
    'admin satisfies a @Roles(doctor, nurse) route it is not listed on',
    (await get('/pet-logs/upcoming', adminToken)).status === 200,
  );

  // --- a doctor is denied every admin surface -------------------------------------------
  const deniedForDoctor = [
    ['GET', '/employees', 'the staff roster'],
    ['GET', '/expenses', 'the salary ledger'],
    ['GET', '/analytics/financial-summary', 'income, expenses and net'],
    ['GET', '/analytics/revenue-by-employee', 'the staff league table'],
    ['GET', '/purchasing/supplier-orders', 'what the clinic paid for stock'],
  ];
  for (const [method, path, what] of deniedForDoctor) {
    const res = await req(method, path, docToken);
    check(`doctor is denied ${what} (${path})`, res.status === 403, res.status);
  }

  {
    const res = await req('POST', '/catalog/products', docToken, {
      name: 'phase11 should not exist', category: 'medicine', sku: `P11-${Date.now()}`, unitPrice: 100,
    });
    check('doctor cannot create a product', res.status === 403, res.status);
  }
  {
    const [product] = await sql`select id from products limit 1`;
    const res = await req('PATCH', `/catalog/products/${product.id}`, docToken, { name: 'phase11 rename attempt' });
    check('doctor cannot edit a product', res.status === 403, res.status);
  }
  {
    const res = await req('POST', '/catalog/categories', docToken, { name: 'p11cat', label: 'P11', kind: 'good' });
    check('doctor cannot create a category', res.status === 403, res.status);
  }
  {
    const [cat] = await sql`select id from product_categories limit 1`;
    const res = await req('PATCH', `/catalog/categories/${cat.id}`, docToken, { label: 'phase11 rename attempt' });
    check('doctor cannot rename a category', res.status === 403, res.status);
  }
  {
    const res = await req('POST', '/employees', docToken, { name: 'p11', role: 'cashier', pin: '9999' });
    check('doctor cannot create an employee', res.status === 403, res.status);
  }
  {
    const [client] = await sql`select id from clients limit 1`;
    const res = await req('POST', '/discounts', docToken, client ? { clientId: client.id, kind: 'percent', value: 10 } : {});
    check('doctor cannot create a discount (admin-only)', res.status === 403, res.status);
  }
  {
    const res = await req('POST', '/purchasing/suppliers', docToken, { name: 'phase11 supplier' });
    check('doctor cannot add a supplier (admin-only)', res.status === 403, res.status);
  }

  // --- a doctor CAN still do their job --------------------------------------------------
  for (const path of ['/catalog/products', '/analytics/best-sellers', '/analytics/revenue-by-category', '/sales', '/clients']) {
    const res = await get(path, docToken);
    check(`doctor can still GET ${path}`, res.status === 200, res.status);
  }

  // --- self-scoped analytics ------------------------------------------------------------
  {
    const own = await get(`/analytics/employee-summary?employeeId=${doc.id}`, docToken);
    check('doctor can read their OWN employee summary', own.status === 200, own.status);
    const other = await get(`/analytics/employee-summary?employeeId=${admin.id}`, docToken);
    check("doctor cannot read someone ELSE's employee summary", other.status === 403, other.status);
  }
  {
    // The throwaway doctor has rung up nothing, so every self-scoped figure must be zero
    // even though the clinic's own numbers are not — that difference is the whole feature.
    const clinicWide = (await get('/analytics/best-sellers', adminToken)).body;
    const mine = (await get('/analytics/best-sellers', docToken)).body;
    check('a doctor with no sales sees an empty best-sellers list', Array.isArray(mine) && mine.length === 0, mine);
    checkOrSkip(
      '…while the admin sees the clinic-wide one',
      clinicWide.length > 0 || (await sql`select count(*)::int n from transactions`)[0].n > 0,
      clinicWide.length > 0,
      clinicWide?.length,
    );

    const mineSplit = (await get('/analytics/revenue-split?kind=shop', docToken)).body;
    check('a doctor with no sales sees zero revenue split', mineSplit?.total === 0, mineSplit?.total);

    const mineSeries = (await get('/analytics/revenue-timeseries', docToken)).body;
    const adminSeries = (await get('/analytics/revenue-timeseries', adminToken)).body;
    const costs = (series) => series.reduce((sum, p) => sum + p.stock + p.operating, 0);
    check(
      'a doctor with no sales sees zero income in the timeseries',
      mineSeries.reduce((sum, p) => sum + p.total, 0) === 0,
    );
    check('a self-scoped timeseries carries no clinic costs', costs(mineSeries) === 0, costs(mineSeries));
    checkOrSkip(
      "…and the admin's same window DOES carry them — rent and shipments are the clinic's, not a seller's",
      costs(adminSeries) > 0,
      costs(adminSeries) > 0 && costs(mineSeries) === 0,
      { admin: costs(adminSeries), doctor: costs(mineSeries) },
    );
  }

  // --- grants open exactly one door each, and close again -------------------------------
  async function grantCycle(permission, name, probe) {
    const before = await probe(docToken);
    check(`${name}: denied before the grant`, before === 403, before);

    await setGrants(doc.id, [permission]);
    // Permissions are re-read from the row on every request, so the SAME token now passes —
    // no re-login, and equally no stale grant surviving a revoke.
    const during = await probe(docToken);
    check(`${name}: allowed once granted, on the same token`, during === 200 || during === 201, during);

    await setGrants(doc.id, []);
    const after = await probe(docToken);
    check(`${name}: denied again once revoked`, after === 403, after);
  }

  await grantCycle('employees:manage', 'employees:manage', async (t) => (await get('/employees', t)).status);
  await grantCycle('financials:read', 'financials:read', async (t) => (await get('/expenses', t)).status);
  await grantCycle('financials:read', 'financials:read → money summary', async (t) => (await get('/analytics/financial-summary', t)).status);
  await grantCycle('analytics:all', 'analytics:all', async (t) => (await get('/analytics/revenue-by-employee', t)).status);

  {
    const [product] = await sql`select id, name from products limit 1`;
    await grantCycle('products:write', 'products:write', async (t) =>
      (await req('PATCH', `/catalog/products/${product.id}`, t, { name: product.name })).status);
  }
  {
    const [cat] = await sql`select id, label from product_categories limit 1`;
    await grantCycle('categories:manage', 'categories:manage', async (t) =>
      (await req('PATCH', `/catalog/categories/${cat.id}`, t, { label: cat.label })).status);
  }

  // --- one grant does not quietly imply another -----------------------------------------
  {
    await setGrants(doc.id, ['products:write']);
    check(
      'products:write does not also unlock the books',
      (await get('/analytics/financial-summary', docToken)).status === 403,
    );
    check('products:write does not also unlock the roster', (await get('/employees', docToken)).status === 403);
    await setGrants(doc.id, ['analytics:all']);
    check(
      'analytics:all does not also unlock income and expenses',
      (await get('/analytics/financial-summary', docToken)).status === 403,
    );
    // Proven by equality with the admin's own view rather than by a row count, so it holds
    // whether or not this clinic has rung up a sale yet.
    const granted = (await get('/analytics/best-sellers', docToken)).body;
    const asAdmin = (await get('/analytics/best-sellers', adminToken)).body;
    check(
      'analytics:all widens the view to exactly what an admin sees',
      JSON.stringify(granted) === JSON.stringify(asAdmin),
      { granted: granted.length, admin: asAdmin.length },
    );
    checkOrSkip(
      '…and that view is non-empty, so the widening is observable',
      asAdmin.length > 0,
      granted.length > 0,
      granted.length,
    );
    await setGrants(doc.id, []);
  }

  // --- the clinic can never lock itself out ---------------------------------------------
  {
    const res = await req('PATCH', `/employees/${admin.id}/role`, adminToken, { role: 'doctor' });
    check('an admin cannot demote themselves', res.status === 400, res.status);

    const res2 = await req('PATCH', `/employees/${admin.id}/toggle-active`, adminToken);
    check('an admin cannot deactivate themselves', res2.status === 400, res2.status);
  }

  // --- cleanup --------------------------------------------------------------------------
  await sql`delete from operator_sessions where device_id = 'phase11-test'`;
  await sql`delete from employees where id = ${doc.id}`;
  const [{ n }] = await sql`select count(*)::int n from employees where name = 'Phase 11 Test Doctor'`;
  check('the throwaway test employee is gone', n === 0, n);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await sql.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await sql`delete from operator_sessions where device_id = 'phase11-test'`.catch(() => {});
  await sql`delete from employees where name = 'Phase 11 Test Doctor'`.catch(() => {});
  await sql.end();
  process.exit(1);
});
