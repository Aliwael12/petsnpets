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
        const client = postgres(connectionString, {
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
        logger.log('Postgres pool created');
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
