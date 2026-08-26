import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, RateLimitGuard],
})
export class AppointmentsModule {}
