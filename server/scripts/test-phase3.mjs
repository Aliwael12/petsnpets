import postgres from 'postgres';

const BASE = 'http://localhost:3001/v1';
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:55322/postgres');

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
    body: JSON.stringify({ employeeId: emp.id, pin, deviceId: 'phase3-test' }),
  });
  const body = await res.json();
  return { token: body.token, id: emp.id };
}

async function main() {
  console.log('== Phase 3: Catalog + Inventory + Purchasing ==');

  const doctor = await loginAs('Dr. Amira Fathy');
  const cashier = await loginAs('Mostafa Hassan');

  // --- Catalog: list, filter, price-check --------------------------------
  {
    const res = await fetch(`${BASE}/catalog/products`, { headers: { Authorization: `Bearer ${cashier.token}` } });
    const body = await res.json();
    check('list products returns 26 seeded items', res.ok && body.length === 26, body.length);
  }
  {
    const res = await fetch(`${BASE}/catalog/products?category=service`, { headers: { Authorization: `Bearer ${cashier.token}` } });
    const body = await res.json();
    check('category=service filter returns exactly 6', res.ok && body.length === 6, body.length);
  }
  {
    const res = await fetch(`${BASE}/catalog/products/price-check?q=sonar`, { headers: { Authorization: `Bearer ${cashier.token}` } });
    const body = await res.json();
    check('price-check "sonar" finds Sonar service', res.ok && body[0]?.name.includes('Sonar'), body);
  }

  // --- Catalog: role enforcement -------------------------------------------
  {
    const res = await fetch(`${BASE}/catalog/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashier.token}` },
      body: JSON.stringify({ name: 'Test Item', category: 'food', sku: 'TEST-1', unitPrice: 1000 }),
    });
    check('cashier creating a product is 403', res.status === 403, await res.text());
  }

  let newProductId;
  {
    const res = await fetch(`${BASE}/catalog/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctor.token}` },
      body: JSON.stringify({ name: 'Dental Chews (test)', category: 'food', sku: 'TEST-DENTAL-1', unitPrice: 5000, stockQuantity: 10, lowStockThreshold: 2 }),
    });
    const body = await res.json();
    check('doctor creating a product is 201-ish and kind=good', res.ok && body.kind === 'good', body);
    newProductId = body.id;
  }

  // --- Catalog: service kind is derived, not client-settable --------------
  {
    const res = await fetch(`${BASE}/catalog/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctor.token}` },
      body: JSON.stringify({ name: 'Test Service (test)', category: 'service', sku: 'TEST-SVC-1', unitPrice: 9900, stockQuantity: 9999 }),
    });
    const body = await res.json();
    check(
      'service category forces kind=service and stock=0 regardless of requested stockQuantity',
      res.ok && body.kind === 'service' && body.stockQuantity === 0,
      body,
    );
  }

  // --- Purchasing: supplier order restocks through the ledger --------------
  const [before] = await sql`select stock_quantity from products where id = ${newProductId}`;
  {
    const suppliersRes = await fetch(`${BASE}/purchasing/suppliers`, { headers: { Authorization: `Bearer ${doctor.token}` } });
    const suppliersList = await suppliersRes.json();
    const supplierId = suppliersList[0].id;

    const res = await fetch(`${BASE}/purchasing/supplier-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctor.token}` },
      body: JSON.stringify({ supplierId, productId: newProductId, quantity: 15, costTotal: 30000 }),
    });
    check('doctor logging a supplier order succeeds', res.ok, await res.text());
  }
  const [after] = await sql`select stock_quantity from products where id = ${newProductId}`;
  check('stock increments by exactly the shipment quantity', after.stock_quantity === before.stock_quantity + 15, {
    before: before.stock_quantity,
    after: after.stock_quantity,
  });

  const [movement] = await sql`select delta, reason from stock_movements where product_id = ${newProductId} order by created_at desc limit 1`;
  check('a matching stock_movements row was written', movement?.delta === 15 && movement?.reason === 'supplier_order', movement);

  // --- Purchasing: services cannot be ordered from a supplier --------------
  {
    const [service] = await sql`select id from products where kind = 'service' limit 1`;
    const suppliersRes = await fetch(`${BASE}/purchasing/suppliers`, { headers: { Authorization: `Bearer ${doctor.token}` } });
    const supplierId = (await suppliersRes.json())[0].id;
    const res = await fetch(`${BASE}/purchasing/supplier-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctor.token}` },
      body: JSON.stringify({ supplierId, productId: service.id, quantity: 5, costTotal: 1000 }),
    });
    const body = await res.json();
    check('ordering a service product is rejected', res.status === 400 && body.error?.code === 'VALIDATION_ERROR', body);
  }

  // --- Reconciliation still holds after all of the above -------------------
  const mismatches = await sql`
    select p.id, p.name, p.stock_quantity as cached, coalesce(sum(m.delta), 0) as ledger_sum
    from products p left join stock_movements m on m.product_id = p.id
    where p.kind = 'good'
    group by p.id, p.name, p.stock_quantity
    having p.stock_quantity <> coalesce(sum(m.delta), 0)
  `;
  check('ledger still reconciles after Phase 3 operations', mismatches.length === 0, mismatches);

  console.log(`\n${pass} passed, ${fail} failed`);
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
