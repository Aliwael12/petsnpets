import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB } from './db/db.constants';
import type { Database } from './db/db.types';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Public()
  @Get('health')
  async health() {
    const [{ ok }] = await this.db.execute<{ ok: number }>(sql`select 1 as ok`);
    return { status: 'ok', db: ok === 1 };
  }
}
