import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { IdempotencyService } from './idempotency/idempotency.service';

@Global()
@Module({
  providers: [AuditService, IdempotencyService],
  exports: [AuditService, IdempotencyService],
})
export class CommonModule {}
