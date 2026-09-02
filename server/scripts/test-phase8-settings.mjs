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

/** Looked up by ROLE, not by name: this suite is the one that also gets run against a
 * hosted database whose employees have been renamed by real users, and hardcoded names
 * would only work on a freshly seeded local stack. */
async function loginAsRole(role, pin = '1234') {
  const [emp] = await sql`select id from employees where role = ${role} and active order by name limit 1`;
  const res = await fetch(`${BASE}/sessions/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId: emp.id, pin, deviceId: 'phase8-test' }),
  });
  const body = await res.json();
  return { token: body.token, id: emp.id };
}

async function loginAsId(id, pin) {
  const res = await fetch(`${BASE}/sessions/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId: id, pin, deviceId: 'phase8-test' }),
  });
  const body = await res.json();
  return { token: body.token, id };
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

async function main() {
  console.log('== Phase 8: Settings, categories, credit notes, shipments ==');

  const doctor = await loginAsRole('doctor');
  const cashier = await loginAsRole('cashier');
  const nurse = await loginAsRole('nurse');

  // --- Categories ------------------------------------------------------------
  {
    const res = await req('GET', '/catalog/categories', cashier.token);
    check('every signed-in role can read categories (product forms need them)', res.status === 200 && res.body.length >= 5, res.body?.length);
    const food = res.body.find((c) => c.name === 'food');
    check('category rows carry a real productCount, not 0', food && food.productCount > 0, food);
    const service = res.body.find((c) => c.name === 'service');
    check('the built-in service category is flagged isSystem + kind=service', service?.isSystem === true && service?.kind === 'service', service);
  }

  let createdCategoryId;
  {
    const res = await req('POST', '/catalog/categories', doctor.token, {
      name: 'phase8-toys',
      label: 'Phase8 Toys',
      kind: 'good',
      sortOrder: 900,
    });
    check('a doctor can create a category', res.status === 201, res.body);
    createdCategoryId = res.body?.id;
    check('a brand-new category reports productCount 0', res.body?.productCount === 0, res.body);
  }
  {
    const res = await req('POST', '/catalog/categories', cashier.token, { name: 'phase8-nope', label: 'Nope', kind: 'good' });
    check('a cashier cannot create a category', res.status === 403, res.body);
  }
  {
    const res = await req('POST', '/catalog/categories', nurse.token, { name: 'phase8-nope2', label: 'Nope', kind: 'good' });
    check('a nurse cannot create a category', res.status === 403, res.body);
  }
  {
    const res = await req('POST', '/catalog/categories', doctor.token, { name: 'phase8-toys', label: 'Dupe', kind: 'good' });
    check('duplicate category names are rejected', res.status === 400, res.body);
  }
  {
    const res = await req('POST', '/catalog/categories', doctor.token, { name: 'Not A Slug!', label: 'Bad', kind: 'good' });
    check('a non-slug category key is rejected', res.status === 400, res.body);
  }
  {
    const res = await req('PATCH', `/catalog/categories/${createdCategoryId}`, doctor.token, { label: 'Renamed Toys' });
    check('a category can be renamed (label only)', res.status === 200 && res.body.label === 'Renamed Toys', res.body);
    check('...and its immutable key is unchanged', res.body?.name === 'phase8-toys', res.body?.name);
  }

  // --- Categories guard the catalog ------------------------------------------
  {
    const res = await req('POST', '/catalog/products', doctor.token, {
      name: 'Phase8 Ghost Product',
      category: 'this-category-does-not-exist',
      sku: `PH8-GHOST-${Date.now()}`,
      unitPrice: 1000,
      stockQuantity: 1,
      lowStockThreshold: 0,
    });
    check('a product in an unknown category is rejected', res.status === 400, res.body);
  }
  {
    // A product created in a kind='service' category must come out as a service, with no
    // stock, no matter what stockQuantity the request asked for.
    const res = await req('POST', '/catalog/products', doctor.token, {
      name: 'Phase8 Service Check',
      category: 'service',
      sku: `PH8-SVC-${Date.now()}`,
      unitPrice: 5000,
      stockQuantity: 99,
      lowStockThreshold: 5,
    });
    check('a product in a service category is forced to kind=service with 0 stock', res.status === 201 && res.body.kind === 'service' && res.body.stockQuantity === 0, res.body);
    if (res.body?.id) await sql`delete from products where id = ${res.body.id}`;
  }

  // --- Category deletion guards ----------------------------------------------
  {
    const cats = (await req('GET', '/catalog/categories', doctor.token)).body;
    const service = cats.find((c) => c.name === 'service');
    const res = await req('DELETE', `/catalog/categories/${service.id}`, doctor.token);
    check('the built-in service category cannot be deleted', res.status === 400, res.body);

    const food = cats.find((c) => c.name === 'food');
    const inUse = await req('DELETE', `/catalog/categories/${food.id}`, doctor.token);
    check('a category still in use cannot be deleted', inUse.status === 400, inUse.body);

    const unused = await req('DELETE', `/catalog/categories/${createdCategoryId}`, doctor.token);
    check('an unused, non-system category can be deleted', unused.status === 204, unused.body);
  }

  // --- Change PIN -------------------------------------------------------------
  {
    const wrong = await req('PATCH', '/sessions/pin', doctor.token, { currentPin: '9999', newPin: '5678' });
    check('changing PIN with the wrong current PIN is 401', wrong.status === 401, wrong.body);

    const same = await req('PATCH', '/sessions/pin', doctor.token, { currentPin: '1234', newPin: '1234' });
    check('the new PIN must differ from the current one', same.status === 400, same.body);

    const nonNumeric = await req('PATCH', '/sessions/pin', doctor.token, { currentPin: '1234', newPin: 'abcd' });
    check('a non-numeric PIN is rejected', nonNumeric.status === 400, nonNumeric.body);

    const ok = await req('PATCH', '/sessions/pin', doctor.token, { currentPin: '1234', newPin: '5678' });
    check('a valid PIN change succeeds', ok.status === 204, ok.body);

    const oldPin = await fetch(`${BASE}/sessions/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: doctor.id, pin: '1234', deviceId: 'phase8' }),
    });
    check('the old PIN no longer signs in', oldPin.status === 401, oldPin.status);

    const newPin = await loginAsId(doctor.id, '5678');
    check('the new PIN signs in', !!newPin.token, newPin);

    // Restore, so re-running the suite (and clicking around afterwards) still works.
    const restore = await req('PATCH', '/sessions/pin', newPin.token, { currentPin: '5678', newPin: '1234' });
    check('the PIN can be restored', restore.status === 204, restore.body);
  }

  // --- Supplier shipments: free-text product, expiry, filters ------------------
  let phase8ProductId;
  {
    const [supplier] = await sql`select id from suppliers limit 1`;
    const expiry = new Date(Date.now() + 120 * 86_400_000).toISOString();
    const res = await req('POST', '/purchasing/supplier-orders', doctor.token, {
      supplierId: supplier.id,
      newProduct: { brand: 'Phase8 Brand', category: 'medicine', name: 'Phase8 Wormer', unitPrice: 12500 },
      quantity: 24,
      costTotal: 180000,
      expiryDate: expiry,
    });
    check('a shipment can name a brand-new product as free text', res.status === 201, res.body);

    const [product] = await sql`select id, brand, category, kind, stock_quantity from products where name = 'Phase8 Wormer'`;
    phase8ProductId = product?.id;
    check('...which creates the product with its brand and category', product?.brand === 'Phase8 Brand' && product?.category === 'medicine', product);
    check('...stocked by exactly the received quantity', product?.stock_quantity === 24, product?.stock_quantity);

    const [mv] = await sql`select delta, reason from stock_movements where product_id = ${phase8ProductId}`;
    check('...through a real supplier_order ledger movement', mv?.delta === 24 && mv?.reason === 'supplier_order', mv);

    const [order] = await sql`select expiry_date from supplier_orders where product_id = ${phase8ProductId}`;
    check('...and the batch expiry date is stored', !!order?.expiry_date, order);
  }
  {
    const [supplier] = await sql`select id from suppliers limit 1`;
    const res = await req('POST', '/purchasing/supplier-orders', doctor.token, {
      supplierId: supplier.id,
      newProduct: { category: 'service', name: 'Phase8 Bad Service', unitPrice: 100 },
      quantity: 1,
      costTotal: 100,
    });
    check('a shipment into a service category is rejected', res.status === 400, res.body);
  }
  {
    const [supplier] = await sql`select id from suppliers limit 1`;
    const res = await req('POST', '/purchasing/supplier-orders', doctor.token, {
      supplierId: supplier.id,
      productId: phase8ProductId,
      newProduct: { category: 'medicine', name: 'Phase8 Both', unitPrice: 100 },
      quantity: 1,
      costTotal: 100,
    });
    check('supplying both productId and newProduct is rejected', res.status === 400, res.body);
  }
  {
    const [supplier] = await sql`select id, name from suppliers limit 1`;
    const res = await req('GET', `/purchasing/supplier-orders?supplierId=${supplier.id}`, doctor.token);
    check('supplier orders can be filtered by supplier', res.status === 200 && res.body.every((o) => o.supplierId === supplier.id), res.body?.length);

    // Inclusive Cairo CALENDAR DAYS, not ISO instants — see common/dto/date-range.dto.ts.
    // The old instant form silently resolved `to` to 03:00 Cairo and dropped 21 hours of
    // the last day, which is why the contract changed.
    const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
    const from = dayKey(new Date());
    const recent = await req('GET', `/purchasing/supplier-orders?from=${from}`, doctor.token);
    check(
      'supplier orders can be filtered by a date range',
      recent.status === 200 && recent.body.every((o) => dayKey(new Date(o.receivedAt)) >= from),
      { status: recent.status, count: recent.body?.length },
    );
    const bad = await req('GET', '/purchasing/supplier-orders?from=2026-01-01T00:00:00Z', doctor.token);
    check('an ISO instant is rejected — the range filter takes calendar days', bad.status === 400, bad.status);
  }

  // Clean up the shipment fixtures so re-runs start from the same place.
  if (phase8ProductId) {
    await sql`delete from stock_movements where product_id = ${phase8ProductId}`;
    await sql`delete from supplier_orders where product_id = ${phase8ProductId}`;
    await sql`delete from products where id = ${phase8ProductId}`;
  }

  // --- Role editing + lockout guards ------------------------------------------
  {
    const self = await req('PATCH', `/employees/${doctor.id}/role`, doctor.token, { role: 'nurse' });
    check('a doctor cannot change their own role', self.status === 400, self.body);

    const byCashier = await req('PATCH', `/employees/${cashier.id}/role`, cashier.token, { role: 'doctor' });
    check("a cashier cannot change anyone else’s role", byCashier.status === 403, byCashier.body);

    const promoted = await req('PATCH', `/employees/${cashier.id}/role`, doctor.token, { role: 'nurse', resetFeatures: true });
    check("a doctor can change another employee’s role", promoted.status === 200 && promoted.body.role === 'nurse', promoted.body);
    check("...and resetFeatures re-applies the new role’s default tabs", Array.isArray(promoted.body.enabledFeatures) && promoted.body.enabledFeatures.includes('/clients'), promoted.body?.enabledFeatures);

    const restored = await req('PATCH', `/employees/${cashier.id}/role`, doctor.token, { role: 'cashier', resetFeatures: true });
    check('the role change can be reverted', restored.status === 200 && restored.body.role === 'cashier', restored.body);
    check('...restoring the cashier tab set', !restored.body.enabledFeatures.includes('/clients'), restored.body?.enabledFeatures);
  }
  {
    // Self-deactivation takes effect on the next request (OperatorAuthGuard rejects
    // inactive employees), so without this guard it is an irreversible self-lockout.
    const res = await req('PATCH', `/employees/${doctor.id}/toggle-active`, doctor.token);
    check('a doctor cannot deactivate their own account', res.status === 400, res.body);

    const [row] = await sql`select active from employees where id = ${doctor.id}`;
    check('...and they are still active afterwards', row.active === true, row);
  }

  // --- Credit notes -----------------------------------------------------------
  {
    const [refund] = await sql`select id from refunds limit 1`;
    if (!refund) {
      check('a refund exists to render a credit note for', false, 'no refunds in the database');
    } else {
      const res = await req('GET', `/invoices/refunds/${refund.id}`, cashier.token);
      check('a refund credit note returns a signed URL', res.status === 200 && typeof res.body.url === 'string', res.body);

      const pdf = await fetch(res.body.url);
      const buf = Buffer.from(await pdf.arrayBuffer());
      check('the credit note is a real PDF', pdf.ok && buf.subarray(0, 4).toString('ascii') === '%PDF', {
        status: pdf.status,
        magic: buf.subarray(0, 8).toString(),
      });
      check('the credit note is a non-trivial size', buf.length > 500, buf.length);

      const again = await req('GET', `/invoices/refunds/${refund.id}`, cashier.token);
      check('re-fetching an already-stored credit note also succeeds', again.status === 200, again.body);
    }

    // The new literal `refunds` segment must not have shadowed the :transactionId route.
    const [txn] = await sql`select id from transactions limit 1`;
    const inv = await req('GET', `/invoices/${txn.id}`, cashier.token);
    check('the sale invoice route still resolves alongside the refund route', inv.status === 200, inv.body);

    const bogus = await req('GET', '/invoices/refunds/00000000-0000-0000-0000-000000000000', cashier.token);
    check('an unknown refund id is a clean 404', bogus.status === 404, bogus.body);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
