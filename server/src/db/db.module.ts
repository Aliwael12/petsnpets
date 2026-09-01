import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { DB } from './db.constants';

const logger = new Logger('DbModule');
const PG_CLIENT = Symbol('PG_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString = config.getOrThrow<string>('DATABASE_URL');
        // Vercel sets this in both build and runtime — used to pick pool settings that fit
        // a serverless invocation model instead of a single long-lived process.
        const isServerless = !!process.env.VERCEL;
        const client = postgres(connectionString, isServerless
          ? {
              // Every invocation may be a fresh instance with its own pool, so each one must
              // stay tiny — a handful of concurrent instances at max:15 would blow through
              // Supabase's connection ceiling fast. Expects DATABASE_URL to point at the
              // transaction-mode pooler (Supavisor/PgBouncer port 6543), which doesn't
              // support session-level prepared statements — hence prepare:false, per
              // postgres.js's own guidance for pooled connections.
              max: 1,
              idle_timeout: 20,
              connect_timeout: 10,
              prepare: false,
              onnotice: () => {},
            }
          : {
              // Session-mode pooling (local direct connection / Supavisor port 5432): a modest,
              // long-lived pool sized for a single small clinic's traffic, with headroom left for
              // migrations and Studio to connect alongside it.
              max: 15,
              idle_timeout: 30,
              connect_timeout: 10,
              prepare: true,
              onnotice: () => {
                /* silence routine Postgres NOTICEs (e.g. from PL/pgSQL RAISE NOTICE) */
              },
            });
        logger.log(`Postgres pool created (${isServerless ? 'serverless' : 'persistent'} mode)`);
        return client;
      },
    },
    {
      provide: DB,
      inject: [PG_CLIENT, ConfigService],
      useFactory: (client: postgres.Sql, config: ConfigService) =>
        drizzle(client, { schema, logger: config.get('NODE_ENV') === 'development' }),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_CLIENT) private readonly client: postgres.Sql) {}

  async onApplicationShutdown() {
    await this.client.end({ timeout: 5 });
    logger.log('Postgres pool closed');
  }
}
