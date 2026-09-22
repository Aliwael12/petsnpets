#!/usr/bin/env node
/**
 * One-time import of the clinic's pre-app client/pet roster (spreadsheet already normalized
 * to JSON by a throwaway script — see the chat that produced this file for the normalization
 * rules). Refuses to run against a clients table that already has rows, so it can't silently
 * double-import if someone re-runs it by accident.
 *
 * Usage: node scripts/import-historical-clients.mjs <path-to-clients_import.json> [--dry-run]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const ADMIN_EMPLOYEE_ID = 'eb68e31b-75e9-4e42-9927-191997c458e3'; // Dr. Ali Mansour

const jsonPath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!jsonPath) {
  console.error('Usage: node scripts/import-historical-clients.mjs <path-to-clients_import.json> [--dry-run]');
  process.exit(1);
}

const clientsData = JSON.parse(readFileSync(jsonPath, 'utf8'));

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' });

const stats = {
  clients: 0,
  phones: 0,
  pets: 0,
  petLogs: 0,
};

async function main() {
  const [{ n: existing }] = await sql`select count(*)::int as n from clients`;
  if (existing > 0 && !process.argv.includes('--force')) {
    console.error(`Refusing to import: clients table already has ${existing} row(s). Pass --force to override.`);
    process.exit(1);
  }

  if (dryRun) {
    for (const client of clientsData) {
      stats.clients += 1;
      stats.phones += client.phones.length;
      stats.pets += client.pets.length;
      stats.petLogs += client.pets.filter((p) => p.followUp).length;
    }
    console.log('DRY RUN — nothing written.');
    console.log(stats);
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const client of clientsData) {
      const [row] = await tx`insert into clients (name) values (${client.name}) returning id`;
      const clientId = row.id;
      stats.clients += 1;

      for (let i = 0; i < client.phones.length; i++) {
        await tx`insert into client_phones (client_id, phone, is_primary) values (${clientId}, ${client.phones[i]}, ${i === 0})`;
        stats.phones += 1;
      }

      for (const pet of client.pets) {
        const [petRow] = await tx`
          insert into pets (name, species, breed, sex, birth_date, client_id)
          values (${pet.name}, ${pet.species}, ${pet.breed}, ${pet.sex}, ${pet.birthDate}, ${clientId})
          returning id`;
        stats.pets += 1;

        if (pet.followUp) {
          const performedAt = pet.followUp.performedAt ?? new Date().toISOString();
          await tx`
            insert into pet_logs (pet_id, log_type, description, performed_by, performed_at)
            values (${petRow.id}, 'other', ${pet.followUp.description}, ${ADMIN_EMPLOYEE_ID}, ${performedAt})`;
          stats.petLogs += 1;
        }
      }
    }
  });

  console.log('Import complete.');
  console.log(stats);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
