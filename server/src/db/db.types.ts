import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

/** The Drizzle database handle type, fully typed against our schema — used for both the
 * injected app-wide `Database` and the `tx` handle passed through transactional service
 * methods. */
export type Database = PostgresJsDatabase<typeof schema>;
