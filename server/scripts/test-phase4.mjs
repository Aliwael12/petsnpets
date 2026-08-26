import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

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
    body: JSON.stringify({ employeeId: emp.id, pin, deviceId: 'phase4-test' }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login failed for ${name}: ${JSON.stringify(body)}`);
  return { token: body.token, id: emp.id };
}

async function post(path, token, body, idempotencyKey = randomUUID()) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log('== Phase 4: Sales, Refunds, Discounts ==');

  const doctor = await loginAs('Dr. Amira Fathy');
  const cashier = await loginAs('Mostafa Hassan');
  const [defaultClient] = await sql`select id from clients limit 1`;

  // --- Setup: a low-stock test product for the oversell race --------------
  const created = await post('/catalog/products', doctor.token, {
    name: 'Race Test Widget',
    category: 'accessories',
    sku: `TEST-RACE-${Date.now()}`,
    unitPrice: 1000,
    stockQuantity: 5,
    lowStockThreshold: 1,
  });
  const raceProductId = created.body.id;
  check('setup: race-test product created with stock=5', created.status === 201 && created.body.stockQuantity === 5, created.body);

  // === Test 1: concurrent checkouts racing the last units ==================
  // 5 in stock, 5 concurrent baskets each buying 2 -> total demand 10, only 2 can fully win
  // (2*2=4 <= 5) and a 3rd could partially fit... to make the outcome unambiguous, buy exactly
  // enough that EXACTLY floor(5/2)=2 requests can succeed and the rest must fail with 409.
  {
    const attempts = Array.from({ length: 5 }, () =>
      post('/sales', cashier.token, { clientId: defaultClient.id, items: [{ productId: raceProductId, quantity: 2 }] }),
    );
    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status === 409 && r.body.error?.code === 'INSUFFICIENT_STOCK');
    check(
      'concurrent oversell race: exactly 2 succeed, 3 rejected with INSUFFICIENT_STOCK',
      succeeded.length === 2 && failed.length === 3,
      { succeeded: succeeded.length, failed: failed.length, results: results.map((r) => r.status) },
    );
    const [{ stock_quantity }] = await sql`select stock_quantity from products where id = ${raceProductId}`;
    check('stock never went negative and equals 5 - (2*2) = 1', stock_quantity === 1, stock_quantity);
  }

  // === Test 2: concurrent claims on one discount — exactly one wins ========
  {
    const [client] = await sql`select id from clients limit 1`;
    const discountRes = await post('/discounts', doctor.token, { clientId: client.id, kind: 'percent', value: 10, note: 'race test' });
    const discountId = discountRes.body.id;

    const [product] = await sql`select id, unit_price from products where kind = 'good' and stock_quantity > 20 limit 1`;

    const attempts = Array.from({ length: 5 }, () =>
      post('/sales', cashier.token, { clientId: client.id, items: [{ productId: product.id, quantity: 1 }], discountId }),
    );
    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status === 409 && r.body.error?.code === 'DISCOUNT_ALREADY_USED');
    check(
      'concurrent discount claim: exactly 1 succeeds, 4 rejected with DISCOUNT_ALREADY_USED',
      succeeded.length === 1 && failed.length === 4,
      { succeeded: succeeded.length, failed: failed.length, statuses: results.map((r) => r.status) },
    );

    const [row] = await sql`select used_in_transaction_id from discounts where id = ${discountId}`;
    check('discount.used_in_transaction_id points at the one winner', row.used_in_transaction_id === succeeded[0]?.body?.id, row);
  }

  // === Test 3: idempotency replay — retried checkout is NOT double-applied =
  {
    const [product] = await sql`select id, stock_quantity from products where kind = 'good' and stock_quantity > 5 limit 1`;
    const key = randomUUID();
    const first = await post('/sales', cashier.token, { clientId: defaultClient.id, items: [{ productId: product.id, quantity: 1 }] }, key);
    const second = await post('/sales', cashier.token, { clientId: defaultClient.id, items: [{ productId: product.id, quantity: 1 }] }, key);
    check('idempotency replay returns the SAME transaction id', first.body.id === second.body.id, { first: first.body.id, second: second.body.id });

    const [{ stock_quantity }] = await sql`select stock_quantity from products where id = ${product.id}`;
    check('stock decremented exactly once despite two requests', stock_quantity === product.stock_quantity - 1, {
      before: product.stock_quantity,
      after: stock_quantity,
    });
    const [{ count }] = await sql`select count(*)::int from stock_movements where ref_id = ${first.body.id}`;
    check('exactly one stock_movements row for this sale', count === 1, count);
  }

  // === Test 4: partial refund then a second partial — cap holds ============
  {
    const [product] = await sql`select id from products where kind = 'good' and stock_quantity > 10 limit 1`;
    const sale = await post('/sales', cashier.token, { clientId: defaultClient.id, items: [{ productId: product.id, quantity: 5 }] });
    check('setup sale of qty 5 succeeds', sale.status === 201, sale.body);

    const r1 = await post('/refunds', cashier.token, { transactionId: sale.body.id, items: [{ productId: product.id, quantity: 3 }] });
    check('first partial refund of 3 succeeds', r1.status === 201, r1.body);

    const r2 = await post('/refunds', cashier.token, { transactionId: sale.body.id, items: [{ productId: product.id, quantity: 3 }] });
    check(
      'second refund of 3 (only 2 remaining) is rejected with REFUND_EXCEEDS_SOLD',
      r2.status === 400 && r2.body.error?.code === 'REFUND_EXCEEDS_SOLD',
      r2.body,
    );

    const r3 = await post('/refunds', cashier.token, { transactionId: sale.body.id, items: [{ productId: product.id, quantity: 2 }] });
    check('refunding exactly the remaining 2 succeeds', r3.status === 201, r3.body);

    const r4 = await post('/refunds', cashier.token, { transactionId: sale.body.id, items: [{ productId: product.id, quantity: 1 }] });
    check('refunding after everything is already refunded is rejected', r4.status === 400, r4.body);
  }

  // === Test 5: full refund of a discounted sale reconciles to the cent =====
  {
    const [client] = await sql`select id from clients offset 1 limit 1`;
    const discountRes = await post('/discounts', doctor.token, { clientId: client.id, kind: 'percent', value: 15, note: 'full refund test' });
    const discountId = discountRes.body.id;

    const [p1] = await sql`select id from products where kind = 'good' and stock_quantity > 10 order by name limit 1`;
    const [p2] = await sql`select id from products where kind = 'good' and stock_quantity > 10 order by name offset 1 limit 1`;

    const sale = await post('/sales', cashier.token, {
      clientId: client.id,
      items: [
        { productId: p1.id, quantity: 3 },
        { productId: p2.id, quantity: 1 },
      ],
      discountId,
    });
    check('discounted multi-line sale succeeds', sale.status === 201, sale.body);
    check('discountAmount applied and total < subtotal', sale.body.discountAmount > 0 && sale.body.total < sale.body.subtotal, sale.body);

    const refund = await post('/refunds', cashier.token, {
      transactionId: sale.body.id,
      items: [
        { productId: p1.id, quantity: 3 },
        { productId: p2.id, quantity: 1 },
      ],
    });
    check('full refund of the discounted sale succeeds', refund.status === 201, refund.body);
    check(
      'refund total exactly equals what was actually collected (txn.total)',
      refund.body.total === sale.body.total,
      { refundTotal: refund.body.total, txnTotal: sale.body.total },
    );

    const [{ used_in_transaction_id }] = await sql`select used_in_transaction_id from discounts where id = ${discountId}`;
    check('discount stays marked used after a full refund (not released)', used_in_transaction_id === sale.body.id, used_in_transaction_id);
  }

  // === Test 6: role enforcement on money-adjacent actions ===================
  {
    const [client] = await sql`select id from clients limit 1`;
    const res = await post('/discounts', cashier.token, { clientId: client.id, kind: 'fixed', value: 100 });
    check('cashier creating a discount is 403', res.status === 403, res.body);
  }
  {
    const [emp] = await sql`select id from employees where name = 'Nour El-Sayed'`;
    const nurseToken = (await loginAs('Nour El-Sayed')).token;
    const [client] = await sql`select id from clients limit 1`;
    const res = await post('/discounts', nurseToken, { clientId: client.id, kind: 'fixed', value: 100 });
    check('nurse creating a discount is 403', res.status === 403, res.body);
  }

  // === Test 7: server computes price, ignores any client-sent price ========
  {
    const [product] = await sql`select id, unit_price from products where kind = 'good' and stock_quantity > 5 limit 1`;
    const res = await fetch(`${BASE}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashier.token}`, 'Idempotency-Key': randomUUID() },
      // Try to sneak a price in — the schema doesn't even have a field for it, so this should
      // just be ignored, and the server should charge the real DB price.
      body: JSON.stringify({ clientId: defaultClient.id, items: [{ productId: product.id, quantity: 1, unitPrice: 1 }] }),
    });
    const body = await res.json();
    check('server ignores client-supplied unitPrice and charges the real price', body.subtotal === Number(product.unit_price), {
      charged: body.subtotal,
      realPrice: product.unit_price,
    });
  }

  // === Final: reconciliation still holds after everything above ============
  const mismatches = await sql`
    select p.id, p.name, p.stock_quantity as cached, coalesce(sum(m.delta), 0) as ledger_sum
    from products p left join stock_movements m on m.product_id = p.id
    where p.kind = 'good'
    group by p.id, p.name, p.stock_quantity
    having p.stock_quantity <> coalesce(sum(m.delta), 0)
  `;
  check('ledger reconciles after the full Phase 4 test run', mismatches.length === 0, mismatches);

  console.log(`\n${pass} passed, ${fail} failed`);
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
