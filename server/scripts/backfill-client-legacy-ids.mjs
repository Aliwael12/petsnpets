#!/usr/bin/env node
/**
 * One-time backfill: attaches each imported client's row number from the clinic's original
 * spreadsheet (see import-historical-clients.mjs) to the new clients.legacy_id column.
 *
 * The import didn't carry the spreadsheet row id forward, so this re-derives the mapping
 * from the same source file/password and matches it back to already-imported clients by
 * phone number (reliable — phone was the merge key) or, for the phone-less clients, by
 * exact name (ambiguous only among clients that also share a name AND have no phone; see
 * the console warning for those).
 *
 * Usage: node scripts/backfill-client-legacy-ids.mjs <path-to-legacy_ids.json> [--dry-run]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const jsonPath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!jsonPath) {
  console.error('Usage: node scripts/backfill-client-legacy-ids.mjs <path-to-legacy_ids.json> [--dry-run]');
  process.exit(1);
}

const { byPhone, noPhone } = JSON.parse(readFileSync(jsonPath, 'utf8'));

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' });

async function main() {
  const stats = { byPhone: 0, byName: 0, ambiguousSkipped: 0, notFound: 0 };

  const plan = [];

  for (const [phone, { legacyId }] of Object.entries(byPhone)) {
    const [row] = await sql`
      select c.id from clients c
      join client_phones cp on cp.client_id = c.id
      where cp.phone = ${phone} and c.legacy_id is null
      limit 1`;
    if (!row) {
      stats.notFound += 1;
      continue;
    }
    plan.push({ clientId: row.id, legacyId });
    stats.byPhone += 1;
  }

  // Group phone-less rows by name so a name shared by >1 phone-less row (genuinely
  // indistinguishable in the DB — same name, no phone) gets flagged instead of guessed at.
  const byName = new Map();
  for (const entry of noPhone) {
    if (!byName.has(entry.name)) byName.set(entry.name, []);
    byName.get(entry.name).push(entry.legacyId);
  }

  for (const [name, legacyIds] of byName) {
    const candidates = await sql`
      select c.id from clients c
      where c.name = ${name} and c.legacy_id is null
        and not exists (select 1 from client_phones cp where cp.client_id = c.id)
      limit ${legacyIds.length}`;

    if (legacyIds.length > 1) {
      console.warn(
        `Ambiguous: name "${name}" has ${legacyIds.length} phone-less rows in the sheet (ids ${legacyIds.join(', ')}) ` +
          `and ${candidates.length} matching phone-less client(s) in the DB. Assigning in an arbitrary but ` +
          `fixed order — these rows are indistinguishable from each other either way.`,
      );
    }
    legacyIds.sort((a, b) => a - b);
    for (let i = 0; i < legacyIds.length; i++) {
      if (!candidates[i]) {
        stats.notFound += 1;
        continue;
      }
      plan.push({ clientId: candidates[i].id, legacyId: legacyIds[i] });
      stats.byName += 1;
    }
  }

  console.log('Plan:', stats, `(${plan.length} clients to update)`);

  if (dryRun) {
    console.log('DRY RUN — nothing written.');
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const { clientId, legacyId } of plan) {
      await tx`update clients set legacy_id = ${legacyId} where id = ${clientId}`;
    }
  });

  const [{ n: stillNull }] = await sql`select count(*)::int as n from clients where legacy_id is null`;
  console.log('Done. Clients still without a legacy_id:', stillNull);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
