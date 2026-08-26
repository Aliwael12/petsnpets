import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres');
const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`;
console.log(tables.map((t) => t.table_name).join('\n'));
console.log('TOTAL:', tables.length);
await sql.end();
