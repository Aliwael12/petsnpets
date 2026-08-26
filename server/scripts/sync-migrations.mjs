#!/usr/bin/env node
/**
 * Copies newly generated Drizzle Kit migrations (server/drizzle/*.sql) into
 * supabase/migrations/ with a Supabase-CLI-compatible timestamp prefix, so `supabase db push`
 * / `supabase db reset` picks them up. Drizzle Kit keeps owning server/drizzle/ for its own
 * journal + snapshot tracking; this script only ever copies forward, never touches Drizzle's
 * bookkeeping.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(dirname(fileURLToPath(import.meta.url)));
const drizzleDir = join(serverDir, 'drizzle');
const supabaseMigrationsDir = join(dirname(serverDir), 'supabase', 'migrations');
const syncStatePath = join(drizzleDir, '.synced.json');

if (!existsSync(drizzleDir)) {
  console.log('No drizzle/ output directory yet — run `npm run db:generate` first.');
  process.exit(0);
}

mkdirSync(supabaseMigrationsDir, { recursive: true });

const synced = existsSync(syncStatePath) ? JSON.parse(readFileSync(syncStatePath, 'utf8')) : [];
const syncedSet = new Set(synced);

const sqlFiles = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const pending = sqlFiles.filter((f) => !syncedSet.has(f));

if (pending.length === 0) {
  console.log('Nothing to sync — all Drizzle migrations already copied to supabase/migrations/.');
  process.exit(0);
}

const now = new Date();

pending.forEach((file, i) => {
  // Stamp each pending file a second apart so ordering within one generate run is preserved.
  const stamp = new Date(now.getTime() + i * 1000);
  const ts = stamp
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss

  // Drizzle names files like "0000_curly_avengers.sql" — keep the descriptive suffix,
  // drop the numeric prefix since the timestamp now provides ordering.
  const descriptive = file.replace(/^\d+_/, '').replace(/\.sql$/, '');
  const destName = `${ts}_${descriptive}.sql`;
  const destPath = join(supabaseMigrationsDir, destName);

  copyFileSync(join(drizzleDir, file), destPath);
  syncedSet.add(file);
  console.log(`  ${file}  ->  supabase/migrations/${destName}`);
});

writeFileSync(syncStatePath, JSON.stringify([...syncedSet], null, 2));
console.log(`Synced ${pending.length} migration(s).`);
