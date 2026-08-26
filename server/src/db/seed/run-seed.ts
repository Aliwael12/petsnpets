import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql as rawSql } from 'drizzle-orm';
import argon2 from 'argon2';
import { createClient } from '@supabase/supabase-js';
import * as schema from '../schema';
import { DEFAULT_FEATURES_BY_ROLE } from '../../employees/features';
import {
  DEV_EMAIL_DOMAIN,
  DEV_PASSWORD,
  DEV_PIN,
  seedClients,
  seedEmployees,
  seedPetLogs,
  seedPets,
  seedProducts,
  seedSupplierOrders,
  seedSuppliers,
  seedTransactionCustomerNames,
  seedTransactionDayPattern,
  seedTransactionSellers,
} from './data';

function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
    throw new Error('DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (check server/.env).');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('== Elite Blue seed ==');

  // --- 0. Storage bucket ---------------------------------------------------
  // The declarative [storage.buckets.invoices] entry in supabase/config.toml does not
  // reliably provision the bucket on `supabase start` in this CLI version, so create it
  // here too — idempotent, safe to run every time.
  console.log('Ensuring the "invoices" Storage bucket exists...');
  {
    const { error } = await supabaseAdmin.storage.createBucket('invoices', {
      public: false,
      fileSizeLimit: '5MB',
      allowedMimeTypes: ['application/pdf'],
    });
    if (error && !error.message.toLowerCase().includes('already exists')) throw error;
  }

  // --- 1. Reset ---------------------------------------------------------
  console.log('Truncating application tables...');
  await db.execute(rawSql`
    truncate table
      audit_log, idempotency_keys, operator_sessions,
      refund_items, refunds,
      transaction_items, transactions,
      discounts, stock_movements, supplier_orders,
      appointments,
      pet_logs, pet_phones, pets,
      client_phones, clients,
      products, suppliers, invoice_counters,
      employees
    restart identity cascade
  `);

  console.log('Removing existing @' + DEV_EMAIL_DOMAIN + ' auth users...');
  {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const stale = data.users.filter((u) => u.email?.endsWith(`@${DEV_EMAIL_DOMAIN}`));
    for (const u of stale) {
      await supabaseAdmin.auth.admin.deleteUser(u.id);
    }
    console.log(`  removed ${stale.length}`);
  }

  // --- 2. Employees (+ Supabase Auth account + PIN) ----------------------
  console.log('Creating employees...');
  const employeeIdBySlug = new Map<string, string>();
  const pinHash = await argon2.hash(DEV_PIN);

  for (const e of seedEmployees) {
    const email = `${e.slug}@${DEV_EMAIL_DOMAIN}`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { name: e.name },
    });
    if (error || !data.user) throw error ?? new Error(`Failed to create auth user for ${email}`);

    const [row] = await db
      .insert(schema.employees)
      .values({
        authUserId: data.user.id,
        name: e.name,
        role: e.role,
        pinHash,
        active: e.active,
        enabledFeatures: DEFAULT_FEATURES_BY_ROLE[e.role],
      })
      .returning({ id: schema.employees.id });

    employeeIdBySlug.set(e.slug, row.id);
  }
  console.log(`  ${employeeIdBySlug.size} employees (login: <slug>@${DEV_EMAIL_DOMAIN} / ${DEV_PASSWORD}, PIN ${DEV_PIN})`);

  // --- 3. Products (opening stock recorded as a real ledger movement) ---
  console.log('Creating products...');
  const productIdBySlug = new Map<string, string>();
  const currentStock = new Map<string, number>(); // productId -> running quantity
  const systemActorId = employeeIdBySlug.get('amira')!;

  const openingMovements: (typeof schema.stockMovements.$inferInsert)[] = [];

  for (const p of seedProducts) {
    const [row] = await db
      .insert(schema.products)
      .values({
        name: p.name,
        category: p.category as schema.Product['category'],
        kind: p.kind as schema.Product['kind'],
        sku: p.sku,
        unitPrice: p.unitPrice,
        stockQuantity: p.openingStock,
        lowStockThreshold: p.lowStockThreshold,
      })
      .returning({ id: schema.products.id });

    productIdBySlug.set(p.slug, row.id);
    currentStock.set(row.id, p.openingStock);

    if (p.openingStock > 0) {
      openingMovements.push({
        productId: row.id,
        delta: p.openingStock,
        reason: 'adjustment',
        actorId: systemActorId,
        note: 'Opening balance (seed)',
        createdAt: daysAgo(60),
      });
    }
  }
  if (openingMovements.length > 0) await db.insert(schema.stockMovements).values(openingMovements);
  console.log(`  ${productIdBySlug.size} products`);

  // --- 4. Suppliers -------------------------------------------------------
  console.log('Creating suppliers...');
  const supplierIdBySlug = new Map<string, string>();
  for (const s of seedSuppliers) {
    const [row] = await db
      .insert(schema.suppliers)
      .values({ name: s.name, contactInfo: s.contactInfo })
      .returning({ id: schema.suppliers.id });
    supplierIdBySlug.set(s.slug, row.id);
  }

  // --- 5. Clients + phones -------------------------------------------------
  console.log('Creating clients...');
  const clientIdBySlug = new Map<string, string>();
  for (const c of seedClients) {
    const [row] = await db.insert(schema.clients).values({ name: c.name }).returning({ id: schema.clients.id });
    clientIdBySlug.set(c.slug, row.id);
    await db.insert(schema.clientPhones).values(
      c.phones.map((phone, i) => ({ clientId: row.id, phone, label: 'mobile' as const, isPrimary: i === 0 })),
    );
  }

  // --- 6. Pets --------------------------------------------------------------
  console.log('Creating pets...');
  const petIdBySlug = new Map<string, string>();
  for (const p of seedPets) {
    const [row] = await db
      .insert(schema.pets)
      .values({
        name: p.name,
        species: p.species as schema.Pet['species'],
        breed: p.breed,
        clientId: clientIdBySlug.get(p.clientSlug)!,
      })
      .returning({ id: schema.pets.id });
    petIdBySlug.set(p.slug, row.id);
  }

  // --- 7. Pet logs -----------------------------------------------------------
  console.log('Creating pet logs...');
  await db.insert(schema.petLogs).values(
    seedPetLogs.map(([petSlug, logType, description, empSlug, daysAgoN, nextDueInDays]) => ({
      petId: petIdBySlug.get(petSlug)!,
      logType: logType as schema.PetLog['logType'],
      description,
      performedBy: employeeIdBySlug.get(empSlug)!,
      performedAt: daysAgo(daysAgoN),
      nextDueDate: nextDueInDays === undefined ? null : daysAgo(nextDueInDays),
    })),
  );

  // --- 7b. Appointment requests from the public website ---------------------
  // Placed on the next few open days at real slot boundaries so the CRM calendar has
  // something to show, and so the pending queue is non-empty on a fresh checkout.
  console.log('Creating appointment requests...');
  {
    const serviceRows = await db
      .select({ id: schema.products.id, name: schema.products.name })
      .from(schema.products)
      .where(eq(schema.products.kind, 'service'));
    const serviceByName = new Map(serviceRows.map((s) => [s.name, s]));

    const bookings: [string, string, string, schema.Pet['species'], string, number, number, schema.Appointment['status'], string | null][] = [
      ['Farida Nabil', '+20 100 447 8890', 'Simba', 'cat', 'Vaccination Administration', 1, 11, 'pending', 'First rabies shot — he gets nervous around other animals.'],
      ['Omar Sherif', '+20 111 336 2214', 'Rex', 'dog', 'General Checkup / Consultation', 1, 16, 'pending', 'Limping slightly on his back left leg since yesterday.'],
      ['Layla Mostafa', '+20 122 909 1140', 'Mishmish', 'cat', 'Full Grooming Service', 2, 12, 'confirmed', null],
      ['Hassan Gamal', '+20 106 771 5523', 'Coco', 'rabbit', 'General Checkup / Consultation', 3, 17, 'pending', null],
      ['Nourhan Adel', '+20 128 220 6634', 'Bella', 'dog', 'Sonar (Ultrasound Scan)', 4, 13, 'confirmed', 'Follow-up scan, referred by Dr. Amira.'],
    ];

    await db.insert(schema.appointments).values(
      bookings.map(([ownerName, phone, petName, species, serviceName, inDays, hour, status, notes]) => {
        const at = new Date();
        at.setDate(at.getDate() + inDays);
        at.setHours(hour, 0, 0, 0);
        return {
          ownerName,
          phone,
          petName,
          species,
          serviceId: serviceByName.get(serviceName)?.id ?? null,
          serviceName,
          requestedAt: at,
          notes,
          status,
          handledBy: status === 'confirmed' ? employeeIdBySlug.get('nour')! : null,
        };
      }),
    );
    console.log(`  ${bookings.length} appointment requests`);
  }

  // --- 8. Chronological stock simulation: supplier orders + sales ----------
  // Everything that moves stock is processed in real time order, so the cached
  // products.stockQuantity and the sum of stock_movements agree by construction —
  // exactly the invariant the reconciliation test in Phase 4 checks for.
  console.log('Simulating supplier orders and sales...');

  type StockEvent =
    | { kind: 'supplier_order'; at: Date; supplierSlug: string; productSlug: string; quantity: number; costTotal: number; actorSlug: string }
    | { kind: 'sale'; at: Date; sellerSlug: string; customerName: string; lines: { productSlug: string; quantity: number }[] };

  const events: StockEvent[] = [];

  for (const [supplierSlug, productSlug, quantity, costTotal, actorSlug, daysAgoN] of seedSupplierOrders) {
    events.push({ kind: 'supplier_order', at: daysAgo(daysAgoN), supplierSlug, productSlug, quantity, costTotal, actorSlug });
  }

  // Reproduce the frontend's deterministic pseudo-random line generation so the seed
  // "feels" the same, but it's fine that the concrete numbers diverge slightly.
  let counter = 1;
  seedTransactionDayPattern.forEach((countForDay, dayIndex) => {
    for (let i = 0; i < countForDay; i++) {
      const numItems = 1 + ((counter + dayIndex) % 3);
      const lines: { productSlug: string; quantity: number }[] = [];
      const used = new Set<number>();
      for (let n = 0; n < numItems; n++) {
        let idx = (counter * 3 + n * 5 + dayIndex) % seedProducts.length;
        while (used.has(idx)) idx = (idx + 1) % seedProducts.length;
        used.add(idx);
        const quantity = 1 + ((counter + n) % 3);
        lines.push({ productSlug: seedProducts[idx].slug, quantity });
      }
      events.push({
        kind: 'sale',
        at: daysAgo(dayIndex, 9 + (counter % 8), (counter * 7) % 60),
        sellerSlug: seedTransactionSellers[counter % seedTransactionSellers.length],
        customerName: seedTransactionCustomerNames[counter % seedTransactionCustomerNames.length],
        lines,
      });
      counter++;
    }
  });

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const movementRows: (typeof schema.stockMovements.$inferInsert)[] = [];
  const supplierOrderRows: (typeof schema.supplierOrders.$inferInsert)[] = [];
  const nextInvoiceNoByYear = new Map<number, number>();
  const transactionRows: (typeof schema.transactions.$inferInsert & { id: string })[] = [];
  const transactionItemRows: (typeof schema.transactionItems.$inferInsert)[] = [];

  const { randomUUID } = await import('node:crypto');

  for (const event of events) {
    if (event.kind === 'supplier_order') {
      const productId = productIdBySlug.get(event.productSlug)!;
      currentStock.set(productId, (currentStock.get(productId) ?? 0) + event.quantity);
      const orderId = randomUUID();
      supplierOrderRows.push({
        id: orderId,
        supplierId: supplierIdBySlug.get(event.supplierSlug)!,
        productId,
        quantity: event.quantity,
        costTotal: event.costTotal,
        loggedBy: employeeIdBySlug.get(event.actorSlug)!,
        receivedAt: event.at,
      });
      movementRows.push({
        productId,
        delta: event.quantity,
        reason: 'supplier_order',
        refId: orderId,
        actorId: employeeIdBySlug.get(event.actorSlug)!,
        createdAt: event.at,
      });
      continue;
    }

    // sale
    const productBySlug = new Map(seedProducts.map((p) => [p.slug, p]));
    const items: { productId: string; quantity: number; unitPrice: number }[] = [];
    for (const line of event.lines) {
      const meta = productBySlug.get(line.productSlug)!;
      const productId = productIdBySlug.get(line.productSlug)!;
      let quantity = line.quantity;
      if (meta.kind === 'good') {
        const available = currentStock.get(productId) ?? 0;
        quantity = Math.min(quantity, available);
        if (quantity <= 0) continue; // nothing left to sell of this line — drop it
        currentStock.set(productId, available - quantity);
      }
      items.push({ productId, quantity, unitPrice: meta.unitPrice });
    }
    if (items.length === 0) continue;

    const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const year = event.at.getFullYear();
    const invoiceNo = nextInvoiceNoByYear.get(year) ?? 1;
    nextInvoiceNoByYear.set(year, invoiceNo + 1);

    const txnId = randomUUID();
    transactionRows.push({
      id: txnId,
      invoiceYear: year,
      invoiceNo,
      soldBy: employeeIdBySlug.get(event.sellerSlug)!,
      customerName: event.customerName,
      subtotal,
      total: subtotal,
      createdAt: event.at,
    });
    for (const it of items) {
      transactionItemRows.push({ transactionId: txnId, productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice });
      const meta = seedProducts.find((p) => productIdBySlug.get(p.slug) === it.productId)!;
      if (meta.kind === 'good') {
        movementRows.push({
          productId: it.productId,
          delta: -it.quantity,
          reason: 'sale',
          refId: txnId,
          actorId: employeeIdBySlug.get(event.sellerSlug)!,
          createdAt: event.at,
        });
      }
    }
  }

  if (supplierOrderRows.length > 0) await db.insert(schema.supplierOrders).values(supplierOrderRows);
  if (transactionRows.length > 0) await db.insert(schema.transactions).values(transactionRows);
  if (transactionItemRows.length > 0) await db.insert(schema.transactionItems).values(transactionItemRows);
  if (movementRows.length > 0) await db.insert(schema.stockMovements).values(movementRows);

  console.log(`  ${supplierOrderRows.length} supplier orders, ${transactionRows.length} transactions`);

  // --- 9. Reconcile cached stock + invoice counters --------------------------
  console.log('Reconciling cached stock quantities and invoice counters...');
  for (const [productId, qty] of currentStock.entries()) {
    await db.update(schema.products).set({ stockQuantity: qty }).where(eq(schema.products.id, productId));
  }
  for (const [year, next] of nextInvoiceNoByYear.entries()) {
    await db.insert(schema.invoiceCounters).values({ year, nextNumber: next }).onConflictDoUpdate({
      target: schema.invoiceCounters.year,
      set: { nextNumber: next },
    });
  }

  console.log('== Seed complete ==');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
