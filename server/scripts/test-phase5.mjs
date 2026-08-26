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
    body: JSON.stringify({ employeeId: emp.id, pin, deviceId: 'phase5-test' }),
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

async function main() {
  console.log('== Phase 5: Clients, Pets, Pet Logs, Invoices ==');

  const doctor = await loginAs('Dr. Amira Fathy');
  const nurse = await loginAs('Nour El-Sayed');
  const cashier = await loginAs('Mostafa Hassan');

  // --- Clients: role gating ------------------------------------------------
  // Cashiers can list/create clients (needed to search-or-create a customer at checkout),
  // but editing/deleting client records stays doctor/nurse only — see ClientsController.
  {
    const res = await req('GET', '/clients', cashier.token);
    check('cashier listing clients succeeds (needed for POS checkout)', res.status === 200 && res.body.length === 7, res.body);
  }
  {
    const res = await req('GET', '/clients', nurse.token);
    check('nurse listing clients succeeds', res.status === 200 && res.body.length === 7, res.body?.length);
  }
  let cashierCreatedClientId;
  {
    const res = await req('POST', '/clients', cashier.token, { name: 'Cashier-Created Client', phones: ['+20 100 000 0001'] });
    check('cashier creating a client succeeds (needed for POS "add new customer")', res.status === 201, res.body);
    cashierCreatedClientId = res.body?.id;
  }
  {
    const res = await req('PATCH', `/clients/${cashierCreatedClientId}`, cashier.token, { name: 'Renamed' });
    check('cashier updating a client is 403 (doctor/nurse only)', res.status === 403, res.body);
  }
  {
    const res = await req('DELETE', `/clients/${cashierCreatedClientId}`, cashier.token);
    check('cashier deleting a client is 403 (doctor/nurse only)', res.status === 403, res.body);
  }

  // --- Clients: create with multiple phones, one client many pets ----------
  let newClientId;
  {
    const res = await req('POST', '/clients', doctor.token, { name: 'Layla Test-Client', phones: ['+20 100 000 1111', '+20 100 000 2222'] });
    check('create client with 2 phones succeeds', res.status === 201 && res.body.phones.length === 2, res.body);
    newClientId = res.body.id;
  }

  let pet1Id, pet2Id;
  {
    const res1 = await req('POST', '/pets', doctor.token, { name: 'Simba Test', species: 'cat', breed: 'Tabby', clientId: newClientId, phones: [] });
    const res2 = await req('POST', '/pets', doctor.token, { name: 'Nala Test', species: 'cat', breed: 'Tabby', clientId: newClientId, phones: [] });
    check('two pets created for the same client', res1.status === 201 && res2.status === 201, { r1: res1.body, r2: res2.body });
    pet1Id = res1.body.id;
    pet2Id = res2.body.id;
  }
  {
    const res = await req('GET', `/clients/${newClientId}`, doctor.token);
    check('client profile shows both linked pets', res.body.pets?.length === 2, res.body);
  }

  // --- Pets: create with an inline new client (the "+ new client" flow) ----
  {
    const res = await req('POST', '/pets', nurse.token, {
      name: 'Inline Test Pet',
      species: 'dog',
      breed: 'Mixed',
      newClient: { name: 'Inline Test Client', phones: ['+20 111 222 3333'] },
      phones: ['+20 199 888 7777'],
    });
    check('creating a pet with an inline new client succeeds', res.status === 201 && res.body.client?.name === 'Inline Test Client', res.body);
    check('pet alternate phone was saved', res.body.phones?.[0]?.phone === '+20 199 888 7777', res.body.phones);
  }

  // --- Clients: delete guarded by linked pets -------------------------------
  {
    const res = await req('DELETE', `/clients/${newClientId}`, doctor.token);
    check('deleting a client with linked pets is rejected', res.status === 409 && res.body.error?.code === 'CLIENT_HAS_PETS', res.body);
  }

  // --- Pet logs: create + upcoming due dates --------------------------------
  {
    const res = await req('POST', `/pets/${pet1Id}/logs`, nurse.token, {
      logType: 'vaccination',
      description: 'Rabies booster (test)',
      nextDueDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
    });
    check('nurse can log a vaccination with a due date', res.status === 201, res.body);
  }
  {
    const res = await req('GET', `/pets/${pet1Id}/logs`, cashier.token);
    check('cashier CANNOT list pet logs (doctor/nurse only)', res.status === 403, res.body);
  }
  {
    const res = await req('GET', '/pet-logs/upcoming', doctor.token);
    const found = res.body.some((l) => l.petId === pet1Id);
    check('the new log appears in upcoming due dates', found, res.body?.length);
  }

  // --- Invoices: render + signed URL for a real sale ------------------------
  {
    const [product] = await sql`select id from products where kind = 'good' and stock_quantity > 3 limit 1`;
    const saleRes = await fetch(`${BASE}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashier.token}`, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ clientId: newClientId, items: [{ productId: product.id, quantity: 1 }] }),
    });
    const saleBody = await saleRes.json();
    check('setup sale for invoice test succeeds', saleRes.ok, saleBody);

    const invRes = await req('GET', `/invoices/${saleBody.id}`, cashier.token);
    check('invoice signed URL endpoint succeeds', invRes.status === 200 && typeof invRes.body.url === 'string', invRes.body);

    if (invRes.body?.url) {
      const pdfRes = await fetch(invRes.body.url);
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      const isPdf = buf.slice(0, 4).toString('ascii') === '%PDF';
      check('signed URL actually serves a valid PDF', pdfRes.ok && isPdf, { status: pdfRes.status, magic: buf.slice(0, 8).toString() });
      check('PDF is a non-trivial size', buf.length > 500, buf.length);
    }

    // Re-fetch should reuse the already-stored object, not fail
    const invRes2 = await req('GET', `/invoices/${saleBody.id}`, cashier.token);
    check('second invoice fetch (already stored) also succeeds', invRes2.status === 200, invRes2.body);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
