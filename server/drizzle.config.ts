import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DIRECT_URL) {
  throw new Error('DIRECT_URL is not set — copy .env.example to .env first.');
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  // Drizzle Kit owns this folder for its own journal/snapshot tracking. Generated SQL is
  // copied into supabase/migrations/ with a timestamp prefix by `npm run db:migrate:copy`
  // so the Supabase CLI (which expects timestamped filenames) applies it everywhere.
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL,
  },
  // Supabase owns several other schemas (auth, storage, ...) in the same database;
  // only ever generate/introspect against the one this app manages.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
