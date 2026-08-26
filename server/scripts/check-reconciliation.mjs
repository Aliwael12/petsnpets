import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres');

const mismatches = await sql`
  select p.id, p.name, p.stock_quantity as cached,
         coalesce(sum(m.delta), 0) as ledger_sum
  from products p
  left join stock_movements m on m.product_id = p.id
  where p.kind = 'good'
  group by p.id, p.name, p.stock_quantity
  having p.stock_quantity <> coalesce(sum(m.delta), 0)
`;

if (mismatches.length > 0) {
  console.error('RECONCILIATION FAILURE — cache disagrees with ledger:');
  console.table(mismatches);
  process.exit(1);
}

const [{ count: goodCount }] = await sql`select count(*)::int as count from products where kind = 'good'`;
console.log(`Reconciliation OK — all ${goodCount} goods match their stock_movements sum.`);

const rowCounts = await sql`
  select 'employees' as t, count(*)::int as n from employees
  union all select 'products', count(*) from products
  union all select 'clients', count(*) from clients
  union all select 'client_phones', count(*) from client_phones
  union all select 'pets', count(*) from pets
  union all select 'pet_logs', count(*) from pet_logs
  union all select 'suppliers', count(*) from suppliers
  union all select 'supplier_orders', count(*) from supplier_orders
  union all select 'stock_movements', count(*) from stock_movements
  union all select 'transactions', count(*) from transactions
  union all select 'transaction_items', count(*) from transaction_items
  union all select 'invoice_counters', count(*) from invoice_counters
  order by t
`;
console.table(rowCounts);

const sample = await sql`select name, sku, stock_quantity, kind from products order by name limit 5`;
console.table(sample);

await sql.end();
