import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_ADMIN = Symbol('SUPABASE_ADMIN');

/** Service-role Supabase client — Storage and Auth admin operations only. Never used for
 * Postgres reads/writes; that's Drizzle's job (see db/db.module.ts). */
@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_ADMIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createClient(config.getOrThrow<string>('SUPABASE_URL'), config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'), {
          auth: { autoRefreshToken: false, persistSession: false },
        }),
    },
  ],
  exports: [SUPABASE_ADMIN],
})
export class SupabaseModule {}
